import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatModelBytes, LOCAL_MODELS, type LocalModel, type LocalModelStatus } from "./local-model-catalog.ts";

export async function hashModelFile(filename: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  signal?.throwIfAborted();
  return hash.digest("hex");
}

type DownloadOptions = {
  fetcher?: typeof fetch;
  models?: readonly LocalModel[];
  availableDiskBytes?: (folder: string) => Promise<number>;
  onChange?: () => void;
  licensesFolder?: string;
};

export class LocalModelDownloads {
  readonly folder: string;
  private models: readonly LocalModel[];
  private statuses = new Map<string, LocalModelStatus>();
  private active?: { id: string; controller: AbortController; promise: Promise<void> };
  private fetcher: typeof fetch;
  private availableDiskBytes: (folder: string) => Promise<number>;
  private onChange: () => void;
  private operations = Promise.resolve();
  private licensesFolder?: string;

  constructor(folder: string, options: DownloadOptions = {}) {
    this.folder = path.resolve(folder);
    this.models = options.models || LOCAL_MODELS;
    this.fetcher = options.fetcher || fetch;
    this.availableDiskBytes = options.availableDiskBytes || (async (directory) => {
      const disk = await statfs(directory);
      return disk.bavail * disk.bsize;
    });
    this.onChange = options.onChange || (() => {});
    this.licensesFolder = options.licensesFolder && path.resolve(options.licensesFolder);
    for (const model of this.models) this.statuses.set(model.id,
      { id: model.id, status: "not-installed", downloadedBytes: 0, error: "" });
  }

  private model(id: string) {
    const model = this.models.find((item) => item.id === id);
    if (!model) throw new Error("Choose a built-in model from Settings.");
    return model;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(() => {}, () => {});
    return result;
  }

  filePath(id: string) {
    const filename = this.model(id).filename;
    if (path.basename(filename) !== filename || !filename.endsWith(".gguf")) {
      throw new Error("The model download path is invalid.");
    }
    return path.join(this.folder, filename);
  }

  list(): LocalModelStatus[] { return [...this.statuses.values()].map((item) => ({ ...item })); }
  status(id: string): LocalModelStatus { this.model(id); return { ...this.statuses.get(id)! }; }

  private update(id: string, change: Partial<LocalModelStatus>) {
    this.statuses.set(id, { ...this.statuses.get(id)!, ...change });
    this.onChange();
  }

  private async ensureFolder() {
    await mkdir(this.folder, { recursive: true });
    if ((await lstat(this.folder)).isSymbolicLink()) {
      throw new Error("The model folder is a link. Remove that link before downloading models.");
    }
  }

  private legalPaths(id: string) {
    return (this.model(id).license?.files || []).map((file) => {
      if (path.basename(file.filename) !== file.filename || path.basename(file.source) !== file.source) {
        throw new Error("The model license path is invalid.");
      }
      return { source: file.source, target: path.join(this.folder, file.filename) };
    });
  }

  private async includeLicense(id: string) {
    const files = this.legalPaths(id);
    if (!files.length) return;
    if (!this.licensesFolder) throw new Error("The model terms are missing. Reinstall the latest app version.");
    await this.ensureFolder();
    for (const file of files) {
      if ((await lstat(file.target).catch(() => null))?.isSymbolicLink()) {
        throw new Error("The model license file is a link. Remove the link before trying again.");
      }
      const text = await readFile(path.join(this.licensesFolder, file.source));
      await writeFile(file.target, text);
    }
  }

  async initialize() {
    try { await this.ensureFolder(); }
    catch (cause) {
      // A damaged download folder must not prevent the rest of the app or its
      // OpenAI/Ollama providers from opening.
      const error = cause instanceof Error ? cause.message : "Could not open the model folder. Check its permissions and try again.";
      for (const model of this.models) this.statuses.set(model.id,
        { id: model.id, status: "error", downloadedBytes: 0, error });
      this.onChange();
      return;
    }
    for (const model of this.models) {
      const filename = this.filePath(model.id);
      const file = await lstat(filename).catch(() => null);
      const partial = await lstat(`${filename}.part`).catch(() => null);
      const receipt = await readFile(`${filename}.verified.json`, "utf8")
        .then((value) => JSON.parse(value) as { sha256?: string; bytes?: number; mtimeMs?: number }).catch(() => null);
      const ready = file?.isFile() && file.size === model.bytes && receipt?.sha256 === model.sha256 &&
        receipt.bytes === model.bytes && receipt.mtimeMs === file.mtimeMs;
      const partialBytes = partial?.isFile() ? partial.size : 0;
      this.statuses.set(model.id, { id: model.id, status: ready ? "ready" : partialBytes ? "paused" : "not-installed",
        downloadedBytes: ready ? model.bytes : partialBytes, error: "" });
    }
  }

  start(id: string) { return this.serialize(() => this.startDownload(id)); }

  private async startDownload(id: string) {
    const model = this.model(id);
    if (this.status(id).status === "ready") return;
    if (this.active?.id === id) return;
    await this.pauseActive();
    await this.ensureFolder();
    const controller = new AbortController();
    this.update(id, { status: "downloading", error: "" });
    // Return immediately so the renderer stays interactive during large downloads.
    const promise = this.download(model, controller.signal).catch((error: unknown) => {
      this.update(id, { status: controller.signal.aborted ? "paused" : "error",
        error: controller.signal.aborted ? "" : error instanceof Error ? error.message : "Download failed. Try again." });
    }).finally(() => { if (this.active?.controller === controller) this.active = undefined; });
    this.active = { id, controller, promise };
  }

  pause() { return this.serialize(() => this.pauseActive()); }

  private async pauseActive() {
    const active = this.active;
    if (!active) return;
    active.controller.abort();
    await active.promise;
  }

  async waitForDownload() { await this.active?.promise; }

  private async download(model: LocalModel, signal: AbortSignal) {
    const filename = this.filePath(model.id);
    const partial = `${filename}.part`;
    const existing = await lstat(partial).catch(() => null);
    if (existing?.isSymbolicLink()) throw new Error("The partial model file is a link. Remove it before trying again.");
    let offset = existing?.isFile() ? existing.size : 0;
    if (offset > model.bytes) { await unlink(partial); offset = 0; }
    const available = await this.availableDiskBytes(this.folder);
    const required = model.bytes - offset + 256 * 1024 ** 2;
    if (available < required) throw new Error(`Not enough disk space. Free at least ${formatModelBytes(required)} and retry.`);
    this.update(model.id, { downloadedBytes: offset });
    if (offset < model.bytes) {
      const connection = new AbortController();
      const timer = setTimeout(() => connection.abort(), 30_000);
      let response: Response;
      try {
        response = await this.fetcher(model.url, { headers: offset ? { Range: `bytes=${offset}-` } : {},
          signal: AbortSignal.any([signal, connection.signal]) });
      } finally { clearTimeout(timer); }
      if (!response.ok || !response.body) throw new Error(`The download service returned ${response.status}. Try again.`);
      if (response.status === 206) {
        const range = response.headers.get("content-range");
        const expected = `bytes ${offset}-`;
        if (!range?.startsWith(expected) || !range.endsWith(`/${model.bytes}`)) {
          throw new Error("The download could not resume safely. Remove the partial download and try again.");
        }
      } else offset = 0; // A server may ignore Range. Replace the partial file in that case.
      const handle = await open(partial, offset ? "a" : "w");
      const reader = response.body.getReader();
      let downloaded = offset;
      let lastUpdate = 0;
      const abortReader = () => { void reader.cancel().catch(() => undefined); };
      signal.addEventListener("abort", abortReader, { once: true });
      try {
        while (true) {
          signal.throwIfAborted();
          const timer = setTimeout(abortReader, 60_000);
          let next: ReadableStreamReadResult<Uint8Array>;
          try { next = await reader.read(); }
          finally { clearTimeout(timer); }
          signal.throwIfAborted();
          if (next.done) break;
          if (downloaded + next.value.length > model.bytes) throw new Error("The download size was unexpected. Remove it and retry.");
          let written = 0;
          while (written < next.value.length) {
            const result = await handle.write(next.value, written, next.value.length - written);
            written += result.bytesWritten;
          }
          downloaded += next.value.length;
          if (Date.now() - lastUpdate >= 150) {
            this.update(model.id, { downloadedBytes: downloaded }); lastUpdate = Date.now();
          }
        }
        await handle.sync();
      } finally {
        signal.removeEventListener("abort", abortReader);
        await reader.cancel().catch(() => undefined);
        await handle.close();
        this.update(model.id, { downloadedBytes: (await stat(partial).catch(() => null))?.size || 0 });
      }
    }
    signal.throwIfAborted();
    if ((await stat(partial)).size !== model.bytes) throw new Error("The download stopped early. Choose Retry download to continue.");
    this.update(model.id, { status: "verifying", downloadedBytes: model.bytes });
    if (await hashModelFile(partial, signal) !== model.sha256) {
      await unlink(partial); this.update(model.id, { downloadedBytes: 0 });
      throw new Error("The model failed its integrity check. Download it again.");
    }
    signal.throwIfAborted();
    const destination = await lstat(filename).catch(() => null);
    if (destination?.isSymbolicLink()) throw new Error("The model file is a link. Remove it before trying again.");
    await this.includeLicense(model.id);
    signal.throwIfAborted();
    if (destination) await unlink(filename);
    await rename(partial, filename);
    const complete = await stat(filename);
    await writeFile(`${filename}.verified.json`, JSON.stringify({ sha256: model.sha256,
      bytes: model.bytes, mtimeMs: complete.mtimeMs }), "utf8");
    this.update(model.id, { status: "ready", downloadedBytes: model.bytes, error: "" });
  }

  async readyPath(id: string): Promise<string> {
    if (this.status(id).status !== "ready") throw new Error("Finish downloading the selected model in Settings before analyzing.");
    const filename = this.filePath(id);
    const file = await lstat(filename).catch(() => null);
    const receipt = await readFile(`${filename}.verified.json`, "utf8")
      .then((value) => JSON.parse(value) as { sha256?: string; bytes?: number; mtimeMs?: number }).catch(() => null);
    const model = this.model(id);
    if (!file?.isFile() || file.size !== model.bytes || file.mtimeMs !== receipt?.mtimeMs ||
      receipt.sha256 !== model.sha256 || receipt.bytes !== model.bytes) {
      this.update(id, { status: "error", error: "The model file changed. Remove it and download it again." });
      throw new Error("The model file changed. Remove it in Settings and download it again.");
    }
    await this.includeLicense(id);
    return filename;
  }

  stop(id: string) {
    return this.serialize(async () => {
      this.model(id);
      // A completed download can arrive after the Stop click. Never remove it here.
      if (this.status(id).status === "ready") return false;
      if (this.active?.id === id) await this.pauseActive();
      if (this.status(id).status === "ready") return false;
      await this.removeModel(id);
      return true;
    });
  }

  remove(id: string) { return this.serialize(() => this.removeModel(id)); }

  private async removeModel(id: string) {
    this.model(id);
    if (this.active?.id === id) await this.pauseActive();
    await this.ensureFolder();
    const filename = this.filePath(id);
    // Only known model artifacts are removed. Databases and user files are never included.
    for (const target of [filename, `${filename}.part`, `${filename}.verified.json`, ...this.legalPaths(id).map((file) => file.target)]) {
      await unlink(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    this.update(id, { status: "not-installed", downloadedBytes: 0, error: "" });
  }

  removeAll() { return this.serialize(async () => {
    await this.pauseActive(); for (const model of this.models) await this.removeModel(model.id);
  }); }
}

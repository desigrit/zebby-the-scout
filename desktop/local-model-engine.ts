import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getLocalModel } from "./local-model-catalog.ts";
import type { LocalModelDownloads } from "./local-model-downloads.ts";
import { availableModelMemory } from "./local-model-memory.ts";
import { LocalResponseWatchdog, readLocalCompletion } from "./local-model-response.ts";

export function localModelMessages(id: string, instructions: string, content: string) {
  // Gemma's chat template accepts user/model turns, not a system turn.
  // Keep all instructions and input in the user turn for that model.
  return getLocalModel(id).supportsSystemRole === false
    ? [{ role: "user", content: `${instructions}\n\n${content}` }]
    : [{ role: "system", content: instructions }, { role: "user", content }];
}

export function localModelResponseSchema(id: string, schema: Record<string, unknown>, input: unknown) {
  if (id !== "gemma3-270m") return schema;
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const overviewLength = typeof source.currentCvOverview === "string" ? source.currentCvOverview.length : 0;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  // Bound the requested short output fields in the grammar, so a repetitive
  // string cannot use the entire response budget. Source text is never shortened.
  const limits: Record<string, number> = { overview: Math.max(800, overviewLength * 2), overviewRationale: 600, explanation: 800 };
  return { ...schema, properties: Object.fromEntries(Object.entries(properties).map(([key, field]) => {
    if (field.type === "string" && limits[key]) return [key, { ...field, minLength: 1, maxLength: limits[key] }];
    if (["keywords", "themes"].includes(key) && field.type === "array") {
      const item = field.items as Record<string, unknown>;
      const maxLength = key === "keywords" ? 80 : 180;
      if (item.type === "object") {
        const properties = item.properties as Record<string, Record<string, unknown>>;
        return [key, { ...field, items: { ...item, properties: { ...properties,
          text: { ...properties.text, minLength: 1, maxLength } } } }];
      }
      return [key, { ...field, items: { ...item, minLength: 1, maxLength } }];
    }
    return [key, field];
  })) };
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start local analysis.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

type EngineOptions = {
  runtimeFolder: string;
  workerPath: string;
  downloads: LocalModelDownloads;
  onChange?: () => void;
  onDiagnostic?: (message: string, error?: unknown) => void;
  fetcher?: typeof fetch;
  timeouts?: { loadMs?: number; tokenizeMs?: number; firstTokenMs?: number; stallMs?: number; totalMs?: number };
};

export class LocalModelEngine {
  private options: EngineOptions;
  private child: ChildProcess | null = null;
  private loadedId = "";
  private baseUrl = "";
  private secret = "";
  private idleTimer?: NodeJS.Timeout;
  private requests = Promise.resolve();
  private pending = 0;
  private shuttingDown = false;
  private controller = new AbortController();
  status: "idle" | "loading" | "analyzing" = "idle";

  constructor(options: EngineOptions) { this.options = options; }
  get busy() { return this.pending > 0; }
  get modelId() { return this.loadedId; }
  private changed() { this.options.onChange?.(); }
  private diagnostic(message: string, error?: unknown) { this.options.onDiagnostic?.(message, error); }

  async stop(force = false) {
    if (this.busy && !force) throw new Error("Wait for the current local analysis to finish, then try again.");
    clearTimeout(this.idleTimer);
    this.controller.abort(); this.controller = new AbortController();
    const child = this.child;
    if (child) this.diagnostic(`Local model stopping (${this.loadedId}, force ${force})`);
    this.child = null; this.loadedId = ""; this.baseUrl = ""; this.secret = "";
    this.status = "idle"; this.changed();
    if (child && child.exitCode === null && child.signalCode === null) {
      // stdin works on Windows too, where child.kill() cannot deliver SIGTERM.
      child.stdin?.end("stop\n");
      await Promise.race([new Promise<void>((resolve) => child.once("exit", () => resolve())), delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }

  async shutdown() { this.shuttingDown = true; await this.stop(true); }

  private async start(id: string, requestSignal?: AbortSignal) {
    requestSignal?.throwIfAborted();
    if (this.shuttingDown) throw new Error("The app is closing.");
    const modelFile = await this.options.downloads.readyPath(id);
    if (this.loadedId === id && this.child?.exitCode === null && this.child.signalCode === null) return;
    await this.stop(true);
    requestSignal?.throwIfAborted();
    const model = getLocalModel(id);
    const memory = await availableModelMemory();
    this.diagnostic(`Local model memory check (${id}, available ${memory}, required ${model.minimumFreeMemory})`);
    if (memory < model.minimumFreeMemory) {
      throw new Error(`${model.name} needs more available memory. Close other apps or choose a smaller built-in model.`);
    }
    const root = path.resolve(this.options.runtimeFolder);
    const manifest = await readFile(path.join(root, "runtime.json"), "utf8")
      .then((text) => JSON.parse(text) as { executable: string }).catch((error) => {
        this.diagnostic("Local runtime manifest could not be read", error); return null;
      });
    if (!manifest?.executable) throw new Error("The local analysis engine is missing. Reinstall the latest app version.");
    const executable = path.resolve(root, manifest.executable);
    const relative = path.relative(root, executable);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !(await stat(executable).catch(() => null))?.isFile()) {
      throw new Error("The local analysis engine could not be found. Reinstall the app.");
    }
    const port = await availablePort();
    requestSignal?.throwIfAborted();
    if (this.shuttingDown) throw new Error("The app is closing.");
    this.secret = randomBytes(32).toString("hex");
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.loadedId = id; this.status = "loading"; this.changed();
    this.diagnostic(`Local model loading (${id}, ${process.platform}/${process.arch})`);
    const threads = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
    this.diagnostic(`Local model CPU worker starting (${id}, ${threads} threads, context ${model.context})`);
    const child = spawn(process.execPath, [this.options.workerPath, String(process.pid), executable,
      "--model", modelFile, "--host", "127.0.0.1", "--port", String(port),
      "--ctx-size", String(model.context), "--parallel", "1", "--threads", String(threads),
      "--threads-batch", String(threads), "--gpu-layers", "0", "--no-kv-offload", "--no-op-offload", "--prio", "-1",
      "--no-webui", "--no-agent", "--log-disable", "--no-context-shift", "--jinja", "--reasoning", "off"], {
      cwd: path.dirname(executable), windowsHide: true, stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", LLAMA_API_KEY: this.secret },
    });
    this.child = child;
    child.stdin?.on("error", () => {});
    const runtimeController = this.controller;
    let failed = false;
    child.once("error", (error) => {
      failed = true;
      runtimeController.abort(new Error("The local analysis engine could not start. Reinstall the latest app.", { cause: error }));
    });
    child.once("exit", (code, signal) => { failed = true; if (this.child === child) {
      this.diagnostic(`Local model engine exited (${id}, code ${code}, signal ${signal})`);
      runtimeController.abort(new Error("The local analysis engine stopped. Close other apps or try another model."));
      this.child = null; this.loadedId = ""; this.status = "idle"; this.changed();
    } });
    const deadline = Date.now() + (this.options.timeouts?.loadMs ?? 120_000);
    const loadingSignal = requestSignal ? AbortSignal.any([this.controller.signal, requestSignal]) : this.controller.signal;
    while (Date.now() < deadline) {
      if (failed || this.child !== child) throw new Error("The local analysis engine stopped. Close other apps or reinstall the app.");
      loadingSignal.throwIfAborted();
      const health = await (this.options.fetcher || fetch)(`${this.baseUrl}/health`,
        { signal: AbortSignal.any([loadingSignal, AbortSignal.timeout(1500)]) }).catch(() => null);
      if (health?.ok) { this.diagnostic(`Local model ready (${id})`); return; }
      await delay(250, undefined, { signal: loadingSignal });
    }
    await this.stop(true);
    throw new Error("The local model took too long to load. Close other apps or choose a smaller model.");
  }

  analyze(id: string, instructions: string, input: unknown, schema: Record<string, unknown>, maxTokens = 1800, requestSignal?: AbortSignal): Promise<Record<string, unknown>> {
    if (this.shuttingDown) return Promise.reject(new Error("The app is closing."));
    this.pending++; clearTimeout(this.idleTimer);
    const result = this.requests.then(async () => {
      requestSignal?.throwIfAborted();
      await this.start(id, requestSignal);
      requestSignal?.throwIfAborted();
      this.status = "analyzing"; this.changed();
      const content = typeof input === "string" ? input : JSON.stringify(input);
      const headers = { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" };
      const fetcher = this.options.fetcher || fetch;
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(this.options.timeouts?.totalMs ?? 900_000), ...(requestSignal ? [requestSignal] : [])]);
      // Check the full text against the model budget rather than silently truncating it.
      this.diagnostic(`Local model reading input (${id})`);
      const tokenResponse = await fetcher(`${this.baseUrl}/tokenize`, { method: "POST", headers,
        body: JSON.stringify({ content: `${instructions}\n${content}`, add_special: true }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.options.timeouts?.tokenizeMs ?? 30_000)]) });
      const tokenData = await tokenResponse.json() as { tokens?: number[] };
      if (!tokenResponse.ok || !Array.isArray(tokenData.tokens)) throw new Error("The local model could not read this request. Try again.");
      if (tokenData.tokens.length + maxTokens + 256 > getLocalModel(id).context) {
        this.diagnostic(`Local model context exceeded (${id}, ${tokenData.tokens.length} input tokens, ${maxTokens} output budget, limit ${getLocalModel(id).context})`);
        throw new Error("This posting and resume exceed the selected model's context. Choose a larger model or use your configured Ollama or OpenAI provider.");
      }
      const watchdog = new LocalResponseWatchdog(this.options.timeouts?.firstTokenMs ?? (getLocalModel(id).tier === "Medium" || getLocalModel(id).tier === "Larger" ? 300_000 : 180_000),
        this.options.timeouts?.stallMs ?? 60_000);
      const generationSignal = AbortSignal.any([signal, watchdog.controller.signal]);
      const started = Date.now();
      let responded = false;
      this.diagnostic(`Local model generating (${id}, ${tokenData.tokens.length} input tokens)`);
      try {
        const response = await fetcher(`${this.baseUrl}/v1/chat/completions`, { method: "POST", headers, signal: generationSignal,
          body: JSON.stringify({ messages: localModelMessages(id, instructions, content),
            stream: true, temperature: 0, ...getLocalModel(id).sampling, seed: 0, max_tokens: maxTokens,
            response_format: { type: "json_object", schema: localModelResponseSchema(id, schema, input) },
            chat_template_kwargs: { enable_thinking: false } }) });
        const payload = await readLocalCompletion(response, generationSignal, () => {
          watchdog.progress();
          if (!responded) { responded = true; this.diagnostic(`Local model first token (${id}, ${Date.now() - started} ms)`); }
        });
        if (!response.ok) throw new Error(payload.error?.message || "Local analysis failed. Try again.");
        const choice = payload.choices?.[0];
        if (choice?.finish_reason !== "stop" || !choice.message?.content) {
          this.diagnostic(`Local model response incomplete (${id}, finish ${choice?.finish_reason || "missing"})`);
          throw new Error("The local analysis was incomplete. Try again or choose a larger model.");
        }
        let analysis: unknown;
        try { analysis = JSON.parse(choice.message.content); }
        catch { throw new Error("The local model returned an unreadable analysis. Try again."); }
        if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error("The local analysis was incomplete. Try again.");
        generationSignal.throwIfAborted();
        this.diagnostic(`Local model completed (${id}, ${Date.now() - started} ms)`);
        return analysis as Record<string, unknown>;
      } finally { watchdog.dispose(); }
    }).catch(async (error) => {
      if (requestSignal?.aborted) this.diagnostic(`Local model request cancelled (${id})`);
      else this.diagnostic(`Local model request failed (${id})`, error);
      // Also stop failed and timed-out workers, so the next request starts with
      // a healthy process rather than queueing behind an abandoned generation.
      await this.stop(true);
      if (requestSignal?.aborted) {
        // Terminate the CPU worker too, including model loading or a server
        // that keeps generating after its HTTP connection closes.
        requestSignal.throwIfAborted();
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(error.message === "The operation was aborted due to timeout"
          ? "The local model took too long to respond. Try again or choose a smaller model." : error.message, { cause: error });
      }
      if (error instanceof TypeError && error.message === "fetch failed") {
        throw new Error("The connection to the local model stopped. Try again or choose another model.", { cause: error });
      }
      throw error;
    });
    this.requests = result.then(() => {}, () => {});
    return result.finally(() => {
      this.pending--; if (!this.pending) {
        this.status = "idle"; this.changed();
        this.idleTimer = setTimeout(() => { void this.stop().catch(() => undefined); }, 60_000);
        this.idleTimer.unref();
      }
    });
  }
}

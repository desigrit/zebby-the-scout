import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

export class DiagnosticLog {
  private queue = Promise.resolve();
  private folder: () => string;
  private secrets: () => string[];

  constructor(folder: () => string, secrets: () => string[] = () => []) {
    this.folder = folder;
    this.secrets = secrets;
  }

  error(message: string, error?: unknown) {
    const detail = error instanceof Error ? error.stack || error.message : error ? String(error) : "";
    let text = `${new Date().toISOString()} ${message}${detail ? `: ${detail}` : ""}`;
    for (const secret of this.secrets().filter(Boolean)) text = text.replaceAll(secret, "[redacted]");
    const line = text.slice(0, 7999) + "\n";
    this.queue = this.queue.then(async () => {
      const folder = this.folder();
      const file = path.join(folder, "tracker.log");
      await mkdir(folder, { recursive: true });
      const size = (await stat(file).catch(() => null))?.size || 0;
      if (size + Buffer.byteLength(line) > 2_000_000) {
        const previous = path.join(folder, "tracker.previous.log");
        await unlink(previous).catch(() => undefined);
        await rename(file, previous);
      }
      await appendFile(file, line, "utf8");
    }).catch((failure) => console.error("Could not write diagnostic log", failure));
  }

  async flush() { await this.queue; }
}

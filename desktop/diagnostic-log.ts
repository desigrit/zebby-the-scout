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

  event(message: string) { this.write(`[info] ${message}`); }
  error(message: string, error?: unknown) { this.write(`[error] ${message}`, error); }

  private write(message: string, error?: unknown) {
    let detail = error instanceof Error ? error.stack || error.message : error ? String(error) : "";
    const seen = new Set<unknown>([error]);
    let cause = error instanceof Error ? error.cause : undefined;
    for (let depth = 0; cause && !seen.has(cause) && depth < 4; depth++) {
      seen.add(cause);
      detail += `\nCaused by: ${cause instanceof Error ? cause.stack || cause.message : String(cause)}`;
      cause = cause instanceof Error ? cause.cause : undefined;
    }
    let text = `${new Date().toISOString()} ${message}${detail ? `: ${detail}` : ""}`;
    for (const secret of this.secrets().filter(Boolean)) text = text.replaceAll(secret, "[redacted]");
    text = text.replace(/zby_device_[a-f0-9]{64}/gi, "[redacted]")
      .replace(/ZEBBY-(?:[a-f0-9]{8}-){4}[a-f0-9]{8}/gi, "[redacted]");
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

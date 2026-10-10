export type LocalCompletion = {
  error?: { message?: string };
  choices?: Array<{ finish_reason?: string | null; message?: { content?: string } }>;
};

// Keep the first-token deadline separate from the interval between tokens.
// Heartbeats and an open HTTP connection do not prove generation is progressing.
export class LocalResponseWatchdog {
  readonly controller = new AbortController();
  private timer?: NodeJS.Timeout;
  private readonly stallMs: number;
  constructor(firstTokenMs: number, stallMs: number) {
    this.stallMs = stallMs;
    this.arm(firstTokenMs, "The local model did not start responding in time. Try again or choose a smaller model.");
  }
  private arm(milliseconds: number, message: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.controller.abort(new DOMException(message, "TimeoutError")), milliseconds);
    this.timer.unref();
  }
  progress() {
    if (!this.controller.signal.aborted) this.arm(this.stallMs,
      "The local model stopped responding. Try again or choose a smaller model.");
  }
  dispose() { clearTimeout(this.timer); }
}

export async function readLocalCompletion(response: Response, signal: AbortSignal,
  progress: () => void): Promise<LocalCompletion> {
  signal.throwIfAborted();
  if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
    const result = await response.json() as LocalCompletion;
    signal.throwIfAborted();
    return result;
  }
  if (!response.body) throw new Error("The local model returned an empty response. Try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "", content = "", finishReason: string | null = null, done = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  function consume(event: string) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n").trim();
    if (!data) return;
    if (data === "[DONE]") { done = true; return; }
    let payload: { error?: { message?: string }; choices?: Array<{
      finish_reason?: string | null; delta?: { content?: string } }> };
    try { payload = JSON.parse(data); }
    catch { throw new Error("The local model returned an unreadable analysis. Try again."); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("The local model returned an unreadable analysis. Try again.");
    }
    if (payload.error) throw new Error(payload.error.message || "Local analysis failed. Try again.");
    const choice = payload.choices?.[0];
    if (typeof choice?.delta?.content === "string" && choice.delta.content.length) {
      content += choice.delta.content;
      if (content.length > 128_000) throw new Error("The local analysis was too long. Try again.");
      progress();
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  }
  try {
    signal.throwIfAborted();
    while (!done) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      if (pending.length > 256_000) throw new Error("The local model returned an unreadable analysis. Try again.");
      let boundary: RegExpExecArray | null;
      while (!done && (boundary = /\r?\n\r?\n/.exec(pending))) {
        consume(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
      }
      if (chunk.done) { if (!done && pending.trim()) consume(pending); break; }
    }
    signal.throwIfAborted();
    return { choices: [{ finish_reason: finishReason, message: { content } }] };
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

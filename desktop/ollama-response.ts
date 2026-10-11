import type { GenerationStage } from "../shared/analysis-progress.ts";

type OllamaChunk = {
  error?: string;
  message?: { content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
};

// Consume only answer text. Thinking chunks signal a phase, never leave this
// transport, and are not logged, parsed into results, or saved to the database.
export async function readOllamaResponse(response: Response, signal: AbortSignal,
  onProgress?: (stage: GenerationStage) => void): Promise<string> {
  signal.throwIfAborted();
  let content = "", done = false, phase: GenerationStage | undefined;
  function report(next: GenerationStage) {
    signal.throwIfAborted();
    if (phase === next || phase === "generating") return;
    phase = next;
    onProgress?.(next);
  }
  function consume(value: unknown, streamed = true) {
    signal.throwIfAborted();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ollama returned an unreadable analysis. Try again.");
    const chunk = value as OllamaChunk;
    if (chunk.error) throw new Error(typeof chunk.error === "string" ? chunk.error : "Ollama analysis failed. Try again.");
    if (streamed && typeof chunk.message?.thinking === "string" && chunk.message.thinking.length) report("thinking");
    if (typeof chunk.message?.content === "string" && chunk.message.content.length) {
      content += chunk.message.content;
      if (content.length > 128_000) throw new Error("The Ollama analysis was too long. Try again.");
      report("generating");
    }
    if (chunk.done_reason && chunk.done_reason !== "stop") throw new Error("Ollama returned an incomplete analysis. Try again.");
    done = chunk.done === true;
  }
  if (!response.ok || response.headers.get("content-type")?.includes("application/json")) {
    const payload: unknown = await response.json().catch(() => null);
    signal.throwIfAborted();
    if (!response.ok) {
      const error = (payload as OllamaChunk | null)?.error;
      throw new Error(typeof error === "string" ? error : `Ollama returned ${response.status}.`);
    }
    consume(payload, false);
  } else {
    if (!response.body) throw new Error("Ollama returned an empty response. Try again.");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = "";
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", cancel, { once: true });
    function line(value: string) {
      if (!value.trim()) return;
      let chunk: unknown;
      try { chunk = JSON.parse(value); }
      catch { throw new Error("Ollama returned an unreadable analysis. Try again."); }
      consume(chunk);
    }
    try {
      signal.throwIfAborted();
      while (!done) {
        const chunk = await reader.read();
        signal.throwIfAborted();
        pending += decoder.decode(chunk.value, { stream: !chunk.done });
        let end: number;
        while (!done && (end = pending.indexOf("\n")) >= 0) {
          if (end > 256_000) throw new Error("Ollama returned an unreadable analysis. Try again.");
          line(pending.slice(0, end));
          pending = pending.slice(end + 1);
        }
        if (pending.length > 256_000) throw new Error("Ollama returned an unreadable analysis. Try again.");
        if (chunk.done) { if (!done && pending.trim()) line(pending); break; }
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  signal.throwIfAborted();
  if (!done || !content.trim()) throw new Error("Ollama returned an incomplete analysis. Try again.");
  return content.trim();
}

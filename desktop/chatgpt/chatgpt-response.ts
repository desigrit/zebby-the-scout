import { ChatGPTPlanError, type ChatGPTModel, type ChatGPTUsageReport } from "../../shared/chatgpt-plan.ts";
import { chatGPTUsageReport } from "../../shared/chatgpt-usage.ts";
import { boardVisualParts } from "../../shared/analysis-images.ts";
import { validStructuredResult } from "../online-response.ts";

export function chatGPTError(value: unknown, status = 0): ChatGPTPlanError {
  const payload = value && typeof value === "object" ? value as { error?: { code?: string; param?: string }; code?: string } : {};
  const code = payload.error?.code || payload.code;
  if (code === "subscription_sharing_usage_limit_exceeded") return new ChatGPTPlanError("ChatGPT usage limit reached. Manage usage in Settings, then retry. Your previous result is unchanged.", "usage");
  if (status === 401 || code === "subscription_sharing_invalid_user") return new ChatGPTPlanError("Reconnect your ChatGPT account in Settings, then retry.", "signin");
  if (code === "subscription_sharing_unsupported_capability") return new ChatGPTPlanError("This ChatGPT model does not support the requested analysis format or input. Choose another model in Settings.", "settings");
  if (status === 403) return new ChatGPTPlanError("ChatGPT plan usage is not available for this account, workspace or request. Check the connection in Settings.", "settings");
  if (status === 429) return new ChatGPTPlanError("ChatGPT is receiving too many requests. Wait a moment, then retry.", "retry");
  return new ChatGPTPlanError("ChatGPT could not finish this request. Your previous result is unchanged. Try again.");
}

export function chatGPTRequest(options: { model: string; thinking: string; instructions: string; input: unknown; name: string; schema: Record<string, unknown> }) {
  const visual = boardVisualParts(options.input);
  const input = visual ? [{ role: "user", content: [
    { type: "input_text", text: visual.text },
    { type: "input_image", image_url: `data:${visual.image.mediaType};base64,${visual.image.data}`, detail: "high" },
  ] }] : [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(options.input) }] }];
  return { model: options.model, instructions: options.instructions, input, store: false, stream: true,
    ...(options.thinking ? { reasoning: { effort: options.thinking } } : {}),
    text: { format: { type: "json_schema", name: options.name, strict: true, schema: options.schema } } };
}

export function parseModels(value: unknown): ChatGPTModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { models: unknown }).models)) throw new ChatGPTPlanError("ChatGPT returned an unreadable model list. Refresh the connection.");
  const models = (value as { models: Record<string, unknown>[] }).models;
  return models.filter(m => m.visibility === "list" && typeof m.slug === "string" && /^[\w.:/-]{1,160}$/.test(m.slug) && typeof m.display_name === "string")
    .map(m => {
      const supported = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : [];
      const thinking = [...new Set(supported.map(level => typeof level === "string" ? level : (level as { effort?: string })?.effort)
        .filter((level): level is string => typeof level === "string" && ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(level)))];
      return { id: m.slug as string, name: String(m.display_name).slice(0, 120), thinking,
        defaultThinking: thinking.includes(String(m.default_reasoning_level)) ? String(m.default_reasoning_level) : "",
        vision: Array.isArray(m.input_modalities) && m.input_modalities.includes("image") };
    }).filter((m, i, all) => all.findIndex(other => other.id === m.id) === i).slice(0, 100);
}

export async function readChatGPTStream(response: Response, schema: Record<string, unknown>, signal: AbortSignal,
  onUsage?: (report: ChatGPTUsageReport) => void | Promise<void>) {
  if (!response.ok) {
    let value: unknown; try { value = await response.json(); } catch { /* Admission failures need not be JSON. */ }
    throw chatGPTError(value, response.status);
  }
  // The plan-usage endpoint can send valid SSE without a Content-Type header.
  // Completion events and schema validation, rather than the header, establish success.
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!response.body || contentType && contentType !== "text/event-stream") throw new ChatGPTPlanError("ChatGPT did not start an analysis stream. Try again.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "", text = "", bytes = 0, completed = false, output: Record<string, unknown> | undefined;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const event = async (block: string) => {
    const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let value;
    try { value = JSON.parse(data); } catch { throw new ChatGPTPlanError("ChatGPT returned an unreadable stream. No result was saved.", "invalid"); }
    if (completed) throw new ChatGPTPlanError("ChatGPT sent output after its final response. No result was saved.", "invalid");
    if (["response.completed", "response.failed", "response.incomplete"].includes(value.type)) {
      await onUsage?.(chatGPTUsageReport(value.response));
    }
    if (value.type === "response.failed" || value.type === "error") throw chatGPTError(value.response || value);
    if (value.type === "response.incomplete" || value.type === "response.refusal.delta" || value.type === "response.refusal.done") throw new ChatGPTPlanError("ChatGPT did not complete this analysis. No result was saved.", "invalid");
    if (value.type === "response.output_text.delta") text += typeof value.delta === "string" ? value.delta : "";
    if (text.length > 2_000_000) throw new ChatGPTPlanError("The ChatGPT response was too large. No result was saved.", "invalid");
    if (value.type === "response.completed") {
      if (completed || value.response?.status !== "completed") throw new ChatGPTPlanError("ChatGPT returned an invalid completion.", "invalid");
      const content = (value.response.output || []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []);
      if (content.some((item: { type: string }) => item.type === "refusal")) throw new ChatGPTPlanError("ChatGPT could not complete this analysis.", "invalid");
      const finalText = content.filter((item: { type: string }) => item.type === "output_text").map((item: { text?: string }) => item.text || "").join("");
      if (finalText && text && finalText !== text) throw new ChatGPTPlanError("ChatGPT returned inconsistent analysis output. Try again.", "invalid");
      try { output = JSON.parse(finalText || text); } catch { throw new ChatGPTPlanError("ChatGPT returned an unreadable result. No result was saved.", "invalid"); }
      if (!output || !validStructuredResult(schema, output)) throw new ChatGPTPlanError("ChatGPT returned an incomplete analysis format. No result was saved.", "invalid");
      completed = true;
    }
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_000_000) throw new ChatGPTPlanError("The ChatGPT stream exceeded the response limit.", "invalid");
      pending += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        await event(pending.slice(0, match.index).replace(/\r\n/g, "\n")); pending = pending.slice(match.index + match[0].length);
      }
      if (pending.length > 8_000_000) throw new ChatGPTPlanError("The ChatGPT stream contained an oversized event.", "invalid");
    }
    pending += decoder.decode();
    if (pending.trim()) await event(pending.replace(/\r\n/g, "\n"));
    if (!completed || !output) throw new ChatGPTPlanError("The ChatGPT connection ended before completion. Retry to run the unfinished analysis.");
    return output;
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

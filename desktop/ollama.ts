import { thinkingLabel, type ThinkingCapability } from "../shared/thinking.ts";
import type { GenerationStage } from "../shared/analysis-progress.ts";
import { readOllamaResponse } from "./ollama-response.ts";
import { LocalResponseWatchdog } from "./local-model-response.ts";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export function normalizeOllamaUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error("Enter a valid Ollama server URL, such as http://localhost:11434."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || !url.hostname) {
    throw new Error("Enter an HTTP or HTTPS Ollama server URL without credentials or a query.");
  }
  url.pathname = url.pathname.replace(/\/(?:api(?:\/(?:chat|tags))?)\/?$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function endpoint(baseUrl: string, path: string): string {
  return `${normalizeOllamaUrl(baseUrl)}${path}`;
}

export async function listOllamaModels(baseUrl: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  let response: Response;
  try { response = await fetcher(endpoint(baseUrl, "/api/tags"), { signal: AbortSignal.timeout(8_000) }); }
  catch { throw new Error("Could not reach the Ollama server. Check its URL and that it is running."); }
  if (!response.ok) throw new Error(`Ollama returned ${response.status} while listing models.`);
  const payload = await response.json() as { models?: Array<{ name?: unknown; modified_at?: string }> };
  return (Array.isArray(payload.models) ? payload.models : [])
    .filter((item): item is { name: string; modified_at?: string } => typeof item?.name === "string" && Boolean(item.name.trim()))
    .sort((a, b) => (Date.parse(b.modified_at || "") || 0) - (Date.parse(a.modified_at || "") || 0)
      || b.name.localeCompare(a.name, undefined, { numeric: true })).map((item) => item.name);
}

export async function ollamaThinkingCapability(baseUrl: string, model: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<ThinkingCapability> {
  if (!model.trim() || model.length > 200 || /[\r\n]/.test(model)) throw new Error("Choose an Ollama model first.");
  let response: Response;
  try { response = await fetcher(endpoint(baseUrl, "/api/show"), { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }); }
  catch { signal?.throwIfAborted(); throw new Error("Could not check thinking levels. Check your server connection."); }
  if (!response.ok) throw new Error("Could not check thinking levels for this model.");
  const payload = await response.json() as { thinking?: { values?: unknown[]; default?: unknown }; capabilities?: string[] };
  const values = Array.isArray(payload.thinking?.values) ? payload.thinking!.values!.filter((value) => typeof value === "boolean"
    || typeof value === "string" && value.length > 0 && value.length <= 60) : null;
  const option = (value: unknown) => ({ value: value === true ? "on" : value === false ? "off" : `level:${value}`,
    label: value === true ? "On" : value === false ? "Off" : thinkingLabel(String(value)) });
  if (values) {
    const options = values.length === 1 && values[0] === false ? [] : values.map(option);
    const fallback = option(payload.thinking?.default).value;
    return { options, defaultValue: options.some((item) => item.value === "off") ? "off"
      : options.some((item) => item.value === fallback) ? fallback : options[0]?.value || "off", known: true };
  }
  // Older servers report capability names, but not named effort levels.
  if (payload.capabilities?.includes("thinking")) return { options: [{ value: "default", label: "Model default" },
    { value: "off", label: "Off" }, { value: "on", label: "On" }], defaultValue: "off", known: true };
  return { options: [{ value: "default", label: "Model default" }], defaultValue: "default", known: false };
}

export function ollamaThinkValue(value: string) { return value === "default" ? null : value === "on" ? true : value === "off" ? false
  : value.startsWith("level:") ? value.slice(6) : null; }

export async function ollamaSupportsVision(baseUrl: string, model: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  if (!model.trim() || model.length > 200 || /[\r\n]/.test(model)) return false;
  const response = await fetcher(endpoint(baseUrl, "/api/show"), { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }), signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
  if (!response.ok) throw new Error("Could not check whether the selected Ollama model supports images. Check the server and retry.");
  const value = await response.json() as { capabilities?: unknown };
  return Array.isArray(value.capabilities) && value.capabilities.includes("vision");
}

export async function analyzeWithOllama(input: {
  baseUrl: string;
  model: string;
  instructions: string;
  content: string;
  images?: string[];
  schema: Record<string, unknown>;
  thinkingLevel?: string;
  maxTokens?: number;
  timeouts?: { firstTokenMs?: number; stallMs?: number; totalMs?: number };
  signal?: AbortSignal;
  onProgress?: (stage: GenerationStage) => void;
}, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const model = input.model.trim();
  if (!model || model.length > 200 || /[\r\n]/.test(model)) {
    throw new Error("Choose an Ollama model in Settings.");
  }
  const maxTokens = (input.maxTokens ?? 3000) + (input.thinkingLevel && !["off", "default"].includes(input.thinkingLevel) ? 4096 : 0);
  // Ollama has no public tokenizer endpoint. Use a conservative UTF-8 byte
  // bound, not a claimed exact token count, and leave room for its chat template.
  const context = Math.max(4096, Math.ceil((Buffer.byteLength(input.instructions + input.content, "utf8") + maxTokens + 1024) / 2048) * 2048);
  if (context > 131072) throw new Error("This job and resume need a larger local context. Shorten the description and try again.");
  input.signal?.throwIfAborted();
  const show = await fetcher(endpoint(input.baseUrl, "/api/show"), { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }),
    signal: AbortSignal.any([AbortSignal.timeout(8000), ...(input.signal ? [input.signal] : [])]) }).catch(() => null);
  input.signal?.throwIfAborted();
  const info = show?.ok ? await show.json().catch(() => null) : null;
  const nativeLimit = Object.entries(info?.model_info || {}).find(([key]) => key.endsWith(".context_length"))?.[1];
  if (typeof nativeLimit === "number" && nativeLimit > 0 && context > nativeLimit) {
    throw new Error("This job and resume exceed the model's safe context budget. Choose a model with a longer context window or shorten the description.");
  }
  const watchdog = new LocalResponseWatchdog(input.timeouts?.firstTokenMs ?? 600_000, input.timeouts?.stallMs ?? 120_000);
  const deadline = AbortSignal.timeout(input.timeouts?.totalMs ?? 1_800_000);
  const signal = AbortSignal.any([watchdog.controller.signal, deadline, ...(input.signal ? [input.signal] : [])]);
  let response: Response;
  try {
    try {
      response = await fetcher(endpoint(input.baseUrl, "/api/chat"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ model, stream: true, think: ollamaThinkValue(input.thinkingLevel || "off"),
          format: input.schema, keep_alive: "30s", options: {
            ...(input.thinkingLevel === "on" ? { temperature: 0.6, top_p: 0.95, top_k: 20 } : { temperature: 0 }),
            num_ctx: context, num_predict: maxTokens,
          },
          messages: [
            { role: "system", content: input.instructions },
            { role: "user", content: input.content, ...(input.images?.length ? { images: input.images } : {}) },
          ] }),
      });
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("Local analysis timed out. Try again or choose another model.");
      }
      throw new Error("Could not reach the Ollama server. Check its URL and that it is running.");
    }
    let content: string;
    try { content = await readOllamaResponse(response, signal, input.onProgress, () => watchdog.progress()); }
    catch (error) {
      input.signal?.throwIfAborted();
      if (signal.aborted && signal.reason?.name === "TimeoutError") {
        throw new Error("Local analysis timed out. Try again or choose another model.");
      }
      if (error instanceof TypeError) throw new Error("The connection to Ollama stopped. Try again.");
      throw error;
    }
    let result: unknown;
    try { result = JSON.parse(content); }
    catch { throw new Error("Ollama returned text that could not be read as JSON. Try another model."); }
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Ollama returned an incomplete analysis. Try again.");
    }
    return result as Record<string, unknown>;
  } finally { watchdog.dispose(); }
}

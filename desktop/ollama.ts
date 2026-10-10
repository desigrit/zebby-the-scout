import { thinkingLabel, type ThinkingCapability } from "../shared/thinking.ts";
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

export async function analyzeWithOllama(input: {
  baseUrl: string;
  model: string;
  instructions: string;
  content: string;
  schema: Record<string, unknown>;
  thinkingLevel?: string;
  signal?: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const model = input.model.trim();
  if (!model || model.length > 200 || /[\r\n]/.test(model)) {
    throw new Error("Choose an Ollama model in Settings.");
  }
  let response: Response;
  try {
    response = await fetcher(endpoint(input.baseUrl, "/api/chat"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000),
      body: JSON.stringify({ model, stream: false, think: ollamaThinkValue(input.thinkingLevel || "off"),
        format: input.schema, options: input.thinkingLevel === "on" ? { temperature: 0.6, top_p: 0.95, top_k: 20 } : { temperature: 0 },
        messages: [
          { role: "system", content: input.instructions },
          { role: "user", content: input.content },
        ] }),
    });
  } catch (error) {
    input.signal?.throwIfAborted();
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Ollama did not finish within five minutes. Try a smaller model or resume.");
    }
    throw new Error("Could not reach the Ollama server. Check its URL and that it is running.");
  }
  const payload = await response.json().catch(() => ({})) as {
    error?: string; message?: { content?: string }; done?: boolean;
  };
  if (!response.ok) throw new Error(payload.error || `Ollama returned ${response.status}.`);
  const content = payload.message?.content?.trim();
  if (!content || payload.done === false) throw new Error("Ollama returned an incomplete analysis. Try again.");
  let result: unknown;
  try { result = JSON.parse(content); }
  catch { throw new Error("Ollama returned text that could not be read as JSON. Try another model."); }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Ollama returned an incomplete analysis. Try again.");
  }
  return result as Record<string, unknown>;
}

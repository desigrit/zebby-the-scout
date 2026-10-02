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
  const payload = await response.json() as { models?: Array<{ name?: unknown }> };
  return (Array.isArray(payload.models) ? payload.models : [])
    .map((item) => item?.name).filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
    .sort((a, b) => a.localeCompare(b));
}

export async function analyzeWithOllama(input: {
  baseUrl: string;
  model: string;
  instructions: string;
  content: string;
  schema: Record<string, unknown>;
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
      body: JSON.stringify({ model, stream: false, think: false,
        format: input.schema, options: { temperature: 0 },
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

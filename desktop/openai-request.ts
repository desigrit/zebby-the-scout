import { onlineModel, validateOnlineThinking } from "../shared/online-models.ts";
import { providerFailure } from "./online-response.ts";

type StructuredRequest = { model: string; instructions: string; input: unknown; name: string;
  schema: Record<string, unknown>; thinkingLevel?: string };

// Shared by counting and generation, so instructions, serialization and the
// structured-output schema cannot accidentally be omitted from the quote.
export function openAIAnalysisInput(options: StructuredRequest) {
  const model = onlineModel(options.model);
  if (model.provider !== "openai") throw new Error("Token counting requires an OpenAI model.");
  const effort = validateOnlineThinking(model, options.thinkingLevel);
  return { model: model.id, reasoning: { effort: effort === "off" ? "none" : effort },
    instructions: options.instructions, input: Array.isArray(options.input) ? options.input : JSON.stringify(options.input),
    text: { format: { type: "json_schema", name: options.name, strict: true, schema: options.schema } } };
}

export async function countOpenAIAnalysisInput(options: StructuredRequest & {
  key: string; signal: AbortSignal; fetcher?: typeof fetch;
}) {
  const request = openAIAnalysisInput(options);
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(15000)]);
  options.signal.throwIfAborted();
  let response: Response, payload: unknown;
  try {
    response = await (options.fetcher || fetch)("https://api.openai.com/v1/responses/input_tokens", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.key}` },
      body: JSON.stringify(request),
    });
    payload = await response.json();
  } catch {
    options.signal.throwIfAborted();
    throw new Error("Could not count tokens for this analysis. Try again. No credits were reserved.");
  }
  options.signal.throwIfAborted();
  if (!response.ok) throw providerFailure("OpenAI", options.model, options.thinkingLevel || "high", response, payload, "zebby");
  const count = payload && typeof payload === "object" && "input_tokens" in payload ? payload.input_tokens : undefined;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) {
    throw new Error("OpenAI returned an invalid token count. Try again. No credits were reserved.");
  }
  return count;
}

import { onlineModel, validateOnlineThinking } from "../shared/online-models.ts";
import { anthropicSchema, providerFailure } from "./online-response.ts";

type StructuredRequest = { model: string; instructions: string; input: unknown;
  schema: Record<string, unknown>; thinkingLevel?: string };

// Count the same messages, instructions, thinking configuration and JSON schema
// used for generation. Only the generation request adds max_tokens.
export function anthropicAnalysisInput(options: StructuredRequest) {
  const model = onlineModel(options.model);
  if (model.provider !== "anthropic") throw new Error("Token counting requires an Anthropic model.");
  const level = validateOnlineThinking(model, options.thinkingLevel);
  const legacyHaiku = model.id === "claude-haiku-4-5-20251001";
  return { model: model.id, system: options.instructions,
    messages: [{ role: "user", content: JSON.stringify(options.input) }],
    thinking: legacyHaiku ? level === "on" ? { type: "enabled", budget_tokens: 4096 } : { type: "disabled" } : { type: "adaptive" },
    output_config: { ...(!legacyHaiku ? { effort: level } : {}), format: { type: "json_schema", schema: anthropicSchema(options.schema) } } };
}

export async function countAnthropicAnalysisInput(options: StructuredRequest & {
  key: string; signal: AbortSignal; fetcher?: typeof fetch;
}) {
  const request = anthropicAnalysisInput(options);
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(15000)]);
  options.signal.throwIfAborted();
  let response: Response, payload: unknown;
  try {
    response = await (options.fetcher || fetch)("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-api-key": options.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(request),
    });
    payload = await response.json();
  } catch {
    options.signal.throwIfAborted();
    throw new Error("Could not count tokens for this analysis. Try again. No credits were reserved.");
  }
  options.signal.throwIfAborted();
  if (!response.ok) throw providerFailure("Anthropic", options.model, options.thinkingLevel || "high", response, payload, "zebby");
  const count = payload && typeof payload === "object" && "input_tokens" in payload ? payload.input_tokens : undefined;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Anthropic returned an invalid token count. Try again. No credits were reserved.");
  }
  return count;
}

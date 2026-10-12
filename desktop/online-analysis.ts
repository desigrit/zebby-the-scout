import { onlineModel, outputLimit, validateOnlineThinking, type AnalysisKind, type TokenUsage } from "../shared/online-models.ts";
import { anthropicSchema, providerFailure, validStructuredResult } from "./online-response.ts";
type Content = { type: string; text?: string };
type ProviderPayload = { status?: string; stop_reason?: string; output?: { content?: Content[] }[]; content?: Content[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } } };

export async function onlineAnalysis(options: { model: string; key: string; instructions: string; input: unknown;
  name: string; schema: Record<string, unknown>; kind: AnalysisKind; thinkingLevel?: string; signal?: AbortSignal; fetcher?: typeof fetch; billingOwner?: "user" | "zebby" }) {
  const model = onlineModel(options.model);
  const thinkingLevel = validateOnlineThinking(model, options.thinkingLevel);
  if (!options.key) throw new Error(`Add an ${model.provider === "openai" ? "OpenAI" : "Anthropic"} API key in Settings.`);
  const send = options.fetcher || fetch;
  const deadline = ["high", "xhigh", "max"].includes(thinkingLevel) ? 480000 : 180000;
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(deadline)]) : AbortSignal.timeout(deadline);
  const isOpenAI = model.provider === "openai";
  const haiku = model.id === "claude-haiku-4-5-20251001";
  const provider = isOpenAI ? "OpenAI" : "Anthropic";
  let response: Response;
  try { response = await send(isOpenAI ? "https://api.openai.com/v1/responses" : "https://api.anthropic.com/v1/messages", {
    method: "POST", signal, headers: isOpenAI ? { "Content-Type": "application/json", Authorization: `Bearer ${options.key}` }
      : { "Content-Type": "application/json", "x-api-key": options.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(isOpenAI ? {
      model: model.id, reasoning: { effort: thinkingLevel === "off" ? "none" : thinkingLevel }, store: false,
      max_output_tokens: outputLimit(options.kind, thinkingLevel),
      instructions: options.instructions, input: Array.isArray(options.input) ? options.input : JSON.stringify(options.input),
      text: { format: { type: "json_schema", name: options.name, strict: true, schema: options.schema } },
    } : {
      model: model.id, max_tokens: outputLimit(options.kind, thinkingLevel), system: options.instructions,
      messages: [{ role: "user", content: JSON.stringify(options.input) }],
      thinking: haiku ? thinkingLevel === "on" ? { type: "enabled", budget_tokens: 4096 } : { type: "disabled" } : { type: "adaptive" },
      output_config: { ...(!haiku ? { effort: thinkingLevel } : {}), format: { type: "json_schema", schema: anthropicSchema(options.schema) } },
    }),
  }); } catch {
    options.signal?.throwIfAborted();
    if (signal.aborted) throw new Error(`${provider} timed out. Try again or choose a lower thinking level.`);
    throw new Error(`Could not reach ${provider}. Check your internet connection and try again.`);
  }
  let payload: ProviderPayload;
  try { payload = await response.json() as ProviderPayload; }
  catch {
    options.signal?.throwIfAborted();
    if (!response.ok) throw providerFailure(provider, model.id, thinkingLevel, response, null, options.billingOwner);
    if (signal.aborted) throw new Error(`${provider} timed out. Try again or choose a lower thinking level.`);
    throw new Error(`${provider} returned an unreadable response. Try again.`);
  }
  if (!response.ok) throw providerFailure(provider, model.id, thinkingLevel, response, payload, options.billingOwner);
  if (!payload || typeof payload !== "object") throw new Error(`${provider} returned an unreadable response. Try again.`);
  if (isOpenAI && payload.status !== "completed" || !isOpenAI && payload.stop_reason !== "end_turn") {
    throw new Error("The model did not finish its response. No result was saved.");
  }
  const text = isOpenAI ? (payload.output || []).flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text").map((item) => item.text).join("")
    : (payload.content || []).filter((item) => item.type === "text").map((item) => item.text).join("");
  let result: Record<string, unknown>;
  try { result = JSON.parse(text); } catch { throw new Error("The model returned an unreadable result. No result was saved."); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("The model returned an invalid result.");
  if (!validStructuredResult(options.schema, result)) throw new Error("The analysis did not meet the required format. No result was saved. Try again.");
  const raw = payload.usage || {};
  const cacheWrite = raw.input_tokens_details?.cache_write_tokens ?? 0;
  const usage: TokenUsage = isOpenAI ? { input: (raw.input_tokens ?? NaN) - cacheWrite,
    cached: raw.input_tokens_details?.cached_tokens ?? 0, cacheWrite, output: raw.output_tokens ?? NaN }
    : { input: (raw.input_tokens ?? NaN) + (raw.cache_read_input_tokens ?? 0),
      cached: raw.cache_read_input_tokens ?? 0, output: raw.output_tokens ?? NaN,
      cacheWrite5m: raw.cache_creation ? raw.cache_creation.ephemeral_5m_input_tokens ?? 0 : raw.cache_creation_input_tokens ?? 0,
      cacheWrite1h: raw.cache_creation?.ephemeral_1h_input_tokens ?? 0 };
  return { result, usage };
}

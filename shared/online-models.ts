import type { WalletAccess } from "./wallet-access.ts";

export type AnalysisProvider = "ollama" | "builtin" | "openai" | "anthropic" | "credits";
export type AnalysisKind = "plan" | "match";
export const PRICE_VERSION = "2026-10-10-thinking";
export const DEFAULT_CREDIT_MODEL = "gpt-6.1-sol";
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = typeof EFFORT_LEVELS[number];
export type OnlineThinkingLevel = EffortLevel | "off" | "on";
// One credit represents $0.001 of provider usage. Costs use integer nanodollars.
export const NANODOLLARS_PER_CREDIT = 1_000_000;
export const ONLINE_MODELS = [
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", provider: "openai", input: 2000, cached: 100, output: 10000 },
  { id: "gpt-6-luna", name: "GPT-6 Luna", provider: "openai", input: 100, cached: 10, output: 500 },
  { id: "gpt-6-astra", name: "GPT-6 Astra", provider: "openai", input: 10000, cached: 1000, output: 50000 },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic", input: 2000, cached: 100, output: 10000 },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic", input: 4000, cached: 200, output: 20000 },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic", input: 1000, cached: 100, output: 5000 },
] as const;
export type OnlineModel = typeof ONLINE_MODELS[number];
// Newest generation first within each provider. Same-release families retain a stable order.
export const CREDIT_MODELS = ONLINE_MODELS.filter((model) => model.id === DEFAULT_CREDIT_MODEL || model.id === "gpt-6-astra");
export const CREDIT_ESTIMATE = { model: DEFAULT_CREDIT_MODEL, thinkingLevel: "high", input: 20000, output: 8000 } as const;
export const CREDIT_ESTIMATE_DESCRIPTION = "Estimates assume GPT-6.1 Sol at High, 20,000 input tokens charged as cache writes, and 8,000 output tokens including thinking. Actual usage varies. You confirm the maximum before each analysis.";
function estimatedAnalyses(credits: number) {
  const model = onlineModel(CREDIT_ESTIMATE.model);
  const estimate = usageCost(model, { input: 0, cached: 0, cacheWrite: CREDIT_ESTIMATE.input, output: CREDIT_ESTIMATE.output });
  return Math.floor(credits * NANODOLLARS_PER_CREDIT / estimate);
}
export const CREDIT_PACKS = [
  { id: "starter", dollars: 5, credits: 500, analyses: estimatedAnalyses(500) },
  { id: "regular", dollars: 20, credits: 3000, analyses: estimatedAnalyses(3000) },
  { id: "plus", dollars: 50, credits: 8000, analyses: estimatedAnalyses(8000) },
  { id: "max", dollars: 100, credits: 16000, analyses: estimatedAnalyses(16000) },
] as const;
export type CreditPack = typeof CREDIT_PACKS[number];
export function onlineModel(id: string): OnlineModel {
  const model = ONLINE_MODELS.find((item) => item.id === id);
  if (!model) throw new Error("Choose an available online model.");
  return model;
}
export function creditModel(id: string): OnlineModel {
  const model = CREDIT_MODELS.find((item) => item.id === id);
  if (!model) throw new Error("Choose GPT-6.1 Sol or GPT-6 Astra for Zebby credits.");
  return model;
}
export function onlineThinking(model: OnlineModel) {
  if (model.id === "claude-haiku-4-5-20251001") return { values: ["off", "on"] as readonly OnlineThinkingLevel[], defaultValue: "off" as OnlineThinkingLevel };
  const values: readonly OnlineThinkingLevel[] = model.id === "gpt-6-luna" ? ["off", ...EFFORT_LEVELS] : EFFORT_LEVELS;
  return { values, defaultValue: (model.id === "claude-opus-5-5" ? "medium" : "high") as OnlineThinkingLevel };
}
export function validateOnlineThinking(model: OnlineModel, value?: string): OnlineThinkingLevel {
  const capability = onlineThinking(model), level = value ?? capability.defaultValue;
  if (!capability.values.includes(level as OnlineThinkingLevel)) throw new Error("Choose a thinking level supported by this model.");
  return level as OnlineThinkingLevel;
}
export function creditPack(id: string): CreditPack {
  const pack = CREDIT_PACKS.find((item) => item.id === id);
  if (!pack) throw new Error("Choose an available credit pack.");
  return pack;
}
// Input includes cache reads and excludes separately charged cache writes.
export type TokenUsage = { input: number; cached: number; output: number; cacheWrite?: number; cacheWrite5m?: number; cacheWrite1h?: number };
export function usageCost(model: OnlineModel, usage: TokenUsage): number {
  for (const value of Object.values(usage)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("The provider returned invalid usage.");
  }
  if (usage.cached > usage.input) throw new Error("The provider returned invalid cached usage.");
  const written = (usage.cacheWrite || 0) + (usage.cacheWrite5m || 0) + (usage.cacheWrite1h || 0);
  const longContext = model.provider === "openai" && usage.input + written > 272000;
  const inputCost = (usage.input - usage.cached) * model.input + usage.cached * model.cached
    + ((usage.cacheWrite || 0) + (usage.cacheWrite5m || 0)) * model.input * 1.25 + (usage.cacheWrite1h || 0) * model.input * 2;
  const cost = inputCost * (longContext ? 2 : 1) + usage.output * model.output * (longContext ? 1.5 : 1);
  if (!Number.isSafeInteger(cost)) throw new Error("The provider returned invalid usage cost.");
  return cost;
}
export function outputLimit(kind: AnalysisKind, thinkingLevel: OnlineThinkingLevel = "low") {
  const answer = kind === "plan" ? 6000 : 3000;
  // Thinking and the final structured answer share the provider's output budget.
  return thinkingLevel === "max" ? 64000 : thinkingLevel === "xhigh" ? 40000 : thinkingLevel === "high" ? 24000
    : thinkingLevel === "medium" ? 16000 : thinkingLevel === "on" ? answer + 4096 : answer;
}
export function maximumCost(model: OnlineModel, inputBytes: number, instructionBytes: number, kind: AnalysisKind, thinkingLevel: OnlineThinkingLevel = "low") {
  // A byte per token is a conservative bound, including schema and request framing.
  const inputBound = inputBytes + instructionBytes + 12000;
  const longContext = model.provider === "openai" && inputBound > 272000;
  // OpenAI can charge all uncached input as cache writes, at 1.25x input rates.
  return inputBound * model.input * (model.provider === "openai" ? 1.25 : 1) * (longContext ? 2 : 1)
    + outputLimit(kind, thinkingLevel) * model.output * (longContext ? 1.5 : 1);
}
export function formatCredits(nanos: number) {
  return (nanos / NANODOLLARS_PER_CREDIT).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
export type Wallet = { balance: number; reserved: number; used: number; purchased: number; updatedAt: string;
  recent: { id: string; model: string; kind: string; cost: number; createdAt: string }[] };
export type CreditsState = { available: boolean; signedIn: boolean; email: string; wallet: Wallet | null;
  stale: boolean; error: string; model: string; access: WalletAccess | null; recoverySaved: boolean; pendingConnection: boolean };
export type CreditQuote = { id: string; model: string; thinkingLevel?: EffortLevel; maximum: number; expiresAt: string; recovery?: boolean; pending?: boolean; cost?: number };
export type AnalysisSource = { kind: AnalysisKind; id: string };
export function quoteNeedsCredits(quote: CreditQuote, available: number) { return !quote.recovery && available < quote.maximum; }

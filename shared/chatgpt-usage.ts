import type { ChatGPTJobAttempt, ChatGPTTokenUsage, ChatGPTUsageReport } from "./chatgpt-plan.ts";

const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

// Usage is provider metadata, independent of whether the generated result is valid.
// Missing or malformed counts never become a zero, estimate, or credit charge.
export function chatGPTUsageReport(value: unknown): ChatGPTUsageReport {
  const response = object(value), raw = object(response.usage);
  const report: ChatGPTUsageReport = {};
  if (typeof response.id === "string" && /^[\w-]{1,200}$/.test(response.id)) report.responseId = response.id;
  if (typeof response.model === "string" && /^[\w.:/-]{1,160}$/.test(response.model)) report.model = response.model;
  if (!count(raw.input_tokens) || !count(raw.output_tokens) || !count(raw.total_tokens) ||
    raw.input_tokens + raw.output_tokens !== raw.total_tokens) return report;
  const usage: ChatGPTTokenUsage = { inputTokens: raw.input_tokens, outputTokens: raw.output_tokens, totalTokens: raw.total_tokens };
  const input = object(raw.input_tokens_details), output = object(raw.output_tokens_details);
  if (count(input.cached_tokens) && input.cached_tokens <= usage.inputTokens) usage.cachedInputTokens = input.cached_tokens;
  if (count(input.cache_write_tokens) && input.cache_write_tokens <= usage.inputTokens) usage.cacheWriteInputTokens = input.cache_write_tokens;
  if (count(output.reasoning_tokens) && output.reasoning_tokens <= usage.outputTokens) usage.reasoningTokens = output.reasoning_tokens;
  return { ...report, usage };
}

export function summarizeChatGPTUsage(attempts: ChatGPTJobAttempt[] = []) {
  const reported = attempts.filter(attempt => attempt.usage).map(attempt => attempt.usage!);
  const missing = attempts.filter(attempt => !attempt.usage && attempt.requestStarted !== false).length;
  const notRequested = attempts.filter(attempt => attempt.requestStarted === false).length;
  if (!reported.length) return { usage: undefined, missing, notRequested, reported: 0 };
  const sum = (key: keyof ChatGPTTokenUsage) => reported.reduce((total, value) => total + (value[key] || 0), 0);
  const usage: ChatGPTTokenUsage = { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), totalTokens: sum("totalTokens") };
  for (const key of ["cachedInputTokens", "cacheWriteInputTokens", "reasoningTokens"] as const) {
    if (reported.every(value => value[key] !== undefined)) usage[key] = sum(key);
  }
  return { usage, missing, notRequested, reported: reported.length };
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { chatGPTUsageReport, summarizeChatGPTUsage } from "../shared/chatgpt-usage.ts";

const raw = { input_tokens: 120, output_tokens: 40, total_tokens: 160, input_tokens_details: { cached_tokens: 80 }, output_tokens_details: { reasoning_tokens: 25 } };
test("usage accepts measured zero but never coerces missing, invalid or inconsistent counts", () => {
  for (const usage of [null, {}, { ...raw, input_tokens: "120" }, { ...raw, output_tokens: -1 }, { ...raw, total_tokens: 159 },
    { ...raw, input_tokens: 1.5 }, { ...raw, total_tokens: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal(chatGPTUsageReport({ usage }).usage, undefined);
  assert.deepEqual(chatGPTUsageReport({ usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } }).usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  const result = chatGPTUsageReport({ usage: { ...raw, input_tokens_details: { cached_tokens: 121 }, output_tokens_details: { reasoning_tokens: -1 } } });
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 40, totalTokens: 160 });
});
test("breakdowns remain subsets and missing attempt measurements make totals partial", () => {
  const usage = chatGPTUsageReport({ usage: raw }).usage;
  const result = summarizeChatGPTUsage([{ usage }, { usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }, { requestStarted: true }, { requestStarted: false }]);
  assert.deepEqual(result, { usage: { inputTokens: 130, outputTokens: 45, totalTokens: 175 }, missing: 1, notRequested: 1, reported: 2 });
  assert.equal(summarizeChatGPTUsage([{ usage }, { usage }]).usage.totalTokens, 320, "Cached and reasoning counts are not added twice");
  assert.equal(summarizeChatGPTUsage().usage, undefined);
});

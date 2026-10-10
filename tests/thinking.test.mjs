import assert from "node:assert/strict";
import { test } from "node:test";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { ollamaThinkingCapability, ollamaThinkValue, analyzeWithOllama, listOllamaModels } from "../desktop/ollama.ts";
import { maskedApiKey, selectedThinking, thinkingKey, onlineThinkingCapability, localThinkingCapability } from "../shared/thinking.ts";
import { onlineModel, outputLimit, maximumCost } from "../shared/online-models.ts";

const input = { jobDescription: "Lead product discovery.", resumeText: "Experience in product discovery." };
function reply(provider) {
  const text = JSON.stringify({ score: 82 });
  return Response.json(provider === "openai" ? { status: "completed", output: [{ content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 100, output_tokens: 4500, output_tokens_details: { reasoning_tokens: 4000 } } }
    : { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "Private reasoning" }, { type: "text", text }],
      usage: { input_tokens: 100, output_tokens: 4500 } });
}
async function request(model, thinkingLevel) {
  let body;
  const result = await onlineAnalysis({ model, thinkingLevel, key: "fixture-only", instructions: "Compare evidence.", input,
    name: "resume_match", schema: { type: "object" }, kind: "match", fetcher: async (_, options) => {
      body = JSON.parse(options.body); return reply(onlineModel(model).provider);
    } });
  return { body, result };
}

test("OpenAI thinking uses supported effort and includes reasoning in the output budget and usage", async () => {
  for (const level of ["low", "medium", "high", "xhigh", "max"]) {
    const { body, result } = await request("gpt-6.1-sol", level);
    assert.equal(body.reasoning.effort, level); assert.equal(body.max_output_tokens, outputLimit("match", level));
    assert.equal(body.store, false); assert.deepEqual(result.result, { score: 82 }); assert.equal(result.usage.output, 4500);
  }
  assert.equal((await request("gpt-6-luna", "off")).body.reasoning.effort, "none");
  await assert.rejects(request("gpt-6-astra", "off"), /supported/);
  assert.ok(maximumCost(onlineModel("gpt-6.1-sol"), 100, 100, "match", "high")
    > maximumCost(onlineModel("gpt-6.1-sol"), 100, 100, "match", "low"));
});

test("Claude uses adaptive effort for current models and manual On or Off for Haiku", async () => {
  for (const model of ["claude-sonnet-5-5", "claude-opus-5-5"]) {
    const { body, result } = await request(model, "xhigh");
    assert.deepEqual(body.thinking, { type: "adaptive" }); assert.equal(body.output_config.effort, "xhigh");
    assert.equal(body.max_tokens, outputLimit("match", "xhigh")); assert.deepEqual(result.result, { score: 82 });
  }
  const on = await request("claude-haiku-4-5-20251001", "on"), off = await request("claude-haiku-4-5-20251001", "off");
  assert.deepEqual(on.body.thinking, { type: "enabled", budget_tokens: 4096 });
  assert.ok(on.body.max_tokens > on.body.thinking.budget_tokens); assert.equal(on.body.output_config.effort, undefined);
  assert.deepEqual(off.body.thinking, { type: "disabled" }); await assert.rejects(request("claude-haiku-4-5-20251001", "high"));
});

test("thinking preferences are scoped per provider, model and local server", () => {
  const key = thinkingKey("openai", "gpt-6.1-sol"), capability = onlineThinkingCapability("gpt-6.1-sol");
  const preferences = { [key]: "max" };
  assert.equal(selectedThinking(preferences, key, capability), "max");
  assert.equal(selectedThinking(preferences, thinkingKey("credits", "gpt-6.1-sol"), capability), "high");
  assert.equal(selectedThinking({ [key]: "off" }, key, capability), "high");
  assert.notEqual(thinkingKey("ollama", "qwen", "http://localhost:11434"), thinkingKey("ollama", "qwen", "http://other:11434"));
  assert.deepEqual(localThinkingCapability(false).options, []); assert.deepEqual(localThinkingCapability(true).options.map(({ value }) => value), ["off", "on"]);
});

test("saved key hints expose a fixed mask and only the last four characters", () => {
  const key = "sk-fixture-secret-1234";
  assert.equal(maskedApiKey(key, "openai"), "sk-••••••••1234");
  assert.equal(maskedApiKey("short", "anthropic"), "sk-ant-••••••••"); assert.equal(maskedApiKey("", "openai"), "");
  assert.ok(!maskedApiKey(key, "openai").includes("fixture-secret"));
});

test("Ollama uses declared thinking values without guessing named levels", async () => {
  const capability = async (payload) => ollamaThinkingCapability("http://localhost:11434", "model", async (url, options) => {
    assert.equal(url, "http://localhost:11434/api/show"); assert.deepEqual(JSON.parse(options.body), { model: "model" }); return Response.json(payload);
  });
  assert.deepEqual((await capability({ thinking: { values: [false, true], default: true } })).options.map(({ value }) => value), ["off", "on"]);
  const levels = await capability({ thinking: { values: ["low", "medium", "high"], default: "medium" } });
  assert.deepEqual(levels.options.map(({ value }) => value), ["level:low", "level:medium", "level:high"]); assert.equal(levels.defaultValue, "level:medium");
  assert.deepEqual((await capability({ thinking: { values: [false] } })).options, []);
  const unknown = await capability({}); assert.equal(unknown.known, false); assert.deepEqual(unknown.options.map(({ value }) => value), ["default"]);
  await assert.rejects(ollamaThinkingCapability("http://localhost:11434", "model", async () => { throw new Error("offline"); }), /server connection/);
  assert.equal(ollamaThinkValue("level:high"), "high"); assert.equal(ollamaThinkValue("default"), null);
});

test("Ollama analysis sends the selected thinking mode, and model lists prefer recently installed models", async () => {
  for (const [level, expected] of [["off", false], ["on", true], ["level:high", "high"], ["default", null]]) {
    await analyzeWithOllama({ baseUrl: "http://localhost:11434", model: "model", thinkingLevel: level,
      instructions: "Compare evidence", content: "Product discovery", schema: { type: "object" } }, async (_, options) => {
      const body = JSON.parse(options.body); assert.equal(body.think, expected);
      return Response.json({ message: { content: '{"score":82}', thinking: "Private reasoning" }, done: true });
    });
  }
  const models = await listOllamaModels("http://localhost:11434", async () => Response.json({ models: [
    { name: "qwen3:8b", modified_at: "2026-10-10" }, { name: "qwen3.8:27b", modified_at: "2026-10-09" },
  ] }));
  assert.deepEqual(models, ["qwen3:8b", "qwen3.8:27b"]);
});

test("cancelling while checking Ollama metadata cancels that request immediately", async () => {
  const cancellation = new AbortController();
  const pending = ollamaThinkingCapability("http://localhost:11434", "model", async (_, options) => {
    cancellation.abort(new DOMException("Cancelled", "AbortError")); options.signal.throwIfAborted();
  }, cancellation.signal);
  await assert.rejects(pending, { name: "AbortError" });
});

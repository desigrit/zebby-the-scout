import assert from "node:assert/strict";
import { test } from "node:test";
import { readChatGPTStream, chatGPTRequest, parseModels } from "../desktop/chatgpt/chatgpt-response.ts";
const schema = { type: "object", additionalProperties: false, properties: { score: { type: "integer", minimum: 0, maximum: 100 } }, required: ["score"] };
const signal = () => new AbortController().signal;
const complete = (text = '{"score":83}') => ({ type: "response.completed", response: { status: "completed", output: [{ content: [{ type: "output_text", text }] }] } });
const events = (...items) => items.map(item => `data: ${JSON.stringify(item)}\r\n\r\n`).join("");
const stream = (text, split = 7) => new Response(new ReadableStream({ start(controller) {
  const bytes = new TextEncoder().encode(text);
  for (let offset = 0; offset < bytes.length; offset += split) controller.enqueue(bytes.slice(offset, offset + split));
  controller.close();
} }), { headers: { "Content-Type": "text/event-stream" } });

test("subscription request uses supported fields and the exact selected model", () => {
  const request = chatGPTRequest({ model: "selected-model", thinking: "high", input: { resumeText: "Evidence" }, instructions: "Analyze", name: "match", schema });
  assert.equal(request.model, "selected-model"); assert.equal(request.stream, true); assert.equal(request.store, false); assert.ok(Array.isArray(request.input));
  for (const key of ["max_output_tokens", "background", "previous_response_id", "temperature", "metadata", "tools"]) assert.equal(key in request, false);
  assert.deepEqual(request.reasoning, { effort: "high" }); assert.equal(request.text.format.strict, true);
});
test("stream handles fragmented events and only accepts a valid completed result", async () => {
  assert.deepEqual(await readChatGPTStream(stream(events({ type: "response.output_text.delta", delta: '{"score":83}' }, complete())), schema, signal()), { score: 83 });
  await assert.rejects(readChatGPTStream(stream(events({ type: "response.output_text.delta", delta: '{"score":83}' })), schema, signal()), /before completion/);
  await assert.rejects(readChatGPTStream(stream(events(complete('{"score":183}'))), schema, signal()), /format/);
  await assert.rejects(readChatGPTStream(stream(events(complete('```json\n{"score":83}\n```'))), schema, signal()), /unreadable/);
});
test("a usage limit arriving after deltas never saves a partial result", async () => {
  await assert.rejects(readChatGPTStream(stream(events({ type: "response.output_text.delta", delta: '{"score":83}' },
    { type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } })), schema, signal()), error => error.recovery === "usage");
});
test("plan streams with no content type still require a valid completed event", async () => {
  const withoutType = text => { const response = stream(text); response.headers.delete("Content-Type"); return response; };
  assert.deepEqual(await readChatGPTStream(withoutType(events(complete())), schema, signal()), { score: 83 });
  await assert.rejects(readChatGPTStream(withoutType(events({ type: "response.output_text.delta", delta: '{"score":83}' })), schema, signal()), /before completion/);
  await assert.rejects(readChatGPTStream(withoutType('{"score":83}'), schema, signal()), /before completion/);
  await assert.rejects(readChatGPTStream(withoutType(events(complete('{"score":183}'))), schema, signal()), /format/);
  await assert.rejects(readChatGPTStream(withoutType(events({ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } })), schema, signal()), error => error.recovery === "usage");
  const html = stream("<html>Unavailable</html>"); html.headers.set("Content-Type", "text/html");
  await assert.rejects(readChatGPTStream(html, schema, signal()), /did not start/);
});
test("refusals, incomplete output, mismatched completion and cancellation remain failures", async () => {
  for (const item of [{ type: "response.incomplete" }, { type: "response.refusal.done" }]) await assert.rejects(readChatGPTStream(stream(events(item)), schema, signal()));
  await assert.rejects(readChatGPTStream(stream(events({ type: "response.output_text.delta", delta: '{"score":12}' }, complete())), schema, signal()), /inconsistent/);
  await assert.rejects(readChatGPTStream(stream(events(complete(), { type: "response.output_text.delta", delta: "extra" })), schema, signal()), /after its final response/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readChatGPTStream(stream(events(complete())), schema, controller.signal), { name: "AbortError" });
});
test("model catalog is account supplied and filters hidden models and unsupported effort values", () => {
  assert.deepEqual(parseModels({ models: [{ slug: "chosen", display_name: "Chosen", visibility: "list", input_modalities: ["text", "image"],
    supported_reasoning_levels: [{ effort: "medium" }, { effort: "high" }, { effort: "invalid" }], default_reasoning_level: "high" },
  { slug: "hidden", display_name: "Hidden", visibility: "hide" }] }), [{ id: "chosen", name: "Chosen", thinking: ["medium", "high"], defaultThinking: "high", vision: true }]);
});

const measured = (item = complete()) => ({ ...item, response: { ...item.response, id: "resp_measured", model: "selected-model",
  usage: { input_tokens: 120, output_tokens: 40, total_tokens: 160, input_tokens_details: { cached_tokens: 80, cache_write_tokens: 10 }, output_tokens_details: { reasoning_tokens: 25 } } } });
test("terminal metadata reports measured tokens before validating output", async () => {
  const reports = [];
  const collect = async report => { await Promise.resolve(); reports.push(report); };
  assert.deepEqual(await readChatGPTStream(stream(events(measured())), schema, signal(), collect), { score: 83 });
  assert.deepEqual(reports[0], { responseId: "resp_measured", model: "selected-model", usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160, cachedInputTokens: 80, cacheWriteInputTokens: 10, reasoningTokens: 25 } });
  await assert.rejects(readChatGPTStream(stream(events(measured(complete('{"score":200}')))), schema, signal(), collect), /format/);
  assert.equal(reports.length, 2, "Invalid output can still consume measured usage");
  for (const type of ["response.failed", "response.incomplete"]) {
    await assert.rejects(readChatGPTStream(stream(events(measured({ type, response: { status: "failed" } }))), schema, signal(), collect));
  }
  assert.equal(reports.length, 4);
});
test("unknown usage stays unknown and duplicate terminal events do not double count", async () => {
  const reports = [];
  await readChatGPTStream(stream(events(complete())), schema, signal(), report => { reports.push(report); });
  assert.equal(reports[0].usage, undefined);
  await assert.rejects(readChatGPTStream(stream(events(measured(), measured())), schema, signal(), report => { reports.push(report); }), /after its final/);
  assert.equal(reports.length, 2);
  await assert.rejects(readChatGPTStream(stream(events({ type: "response.output_text.delta", delta: '{"score":83}' })), schema, signal(), report => { reports.push(report); }));
  assert.equal(reports.length, 2);
});

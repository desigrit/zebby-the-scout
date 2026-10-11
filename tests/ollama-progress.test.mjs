import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { analyzeWithOllama } from "../desktop/ollama.ts";
import { readOllamaResponse } from "../desktop/ollama-response.ts";
import { AnalysisRequests } from "../desktop/analysis-requests.ts";

function streaming(chunks) {
  const bytes = new TextEncoder().encode(chunks.map((chunk) => typeof chunk === "string" ? chunk : JSON.stringify(chunk)).join("\r\n"));
  return new Response(new ReadableStream({ start(controller) {
    // Split UTF-8 code points and the JSON/line boundaries independently.
    for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.subarray(offset, offset + 3));
    controller.close();
  } }), { headers: { "Content-Type": "application/x-ndjson" } });
}
const input = { baseUrl: "http://localhost:11434", model: "qwen3.8:27b", instructions: "Full instructions",
  content: "Complete resume and job", schema: { type: "object" } };

test("Ollama streams real phases, preserves full inputs and fragmented Unicode, and discards thinking", async () => {
  const phases = [];
  const result = await analyzeWithOllama({ ...input, thinkingLevel: "on", onProgress: (phase) => phases.push(phase) }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.stream, true); assert.equal(body.think, true);
    assert.deepEqual(body.messages, [{ role: "system", content: input.instructions }, { role: "user", content: input.content }]);
    assert.deepEqual(body.format, input.schema);
    return streaming(["", { message: { role: "assistant", content: "", thinking: "" }, done: false },
      { message: { thinking: "Private reasoning" }, done: false }, { message: { thinking: "More reasoning" }, done: false },
      { message: { content: '{"overview":"René ' }, done: false },
      { message: { content: '東京 👋","score":81}' }, done: false },
      { message: { content: "" }, done: true, done_reason: "stop" }]);
  });
  assert.deepEqual(result, { overview: "René 東京 👋", score: 81 });
  assert.deepEqual(phases, ["thinking", "generating"]);
});

test("no thinking status is invented when Ollama returns only answer tokens", async () => {
  const phases = [];
  const result = await analyzeWithOllama({ ...input, thinkingLevel: "off", onProgress: (phase) => phases.push(phase) }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).think, false);
    return streaming([{ message: { content: '{"score":90}' }, done: false }, { done: true }]);
  });
  assert.deepEqual(phases, ["generating"]); assert.equal(result.score, 90);
});

test("a nonstreaming proxy response skips the completed thinking phase", async () => {
  const phases = [];
  const result = await analyzeWithOllama({ ...input, onProgress: (phase) => phases.push(phase) }, async () =>
    Response.json({ message: { content: '{"score":82}', thinking: "Private reasoning" }, done: true }));
  assert.equal(result.score, 82); assert.deepEqual(phases, ["generating"]);
});

test("unfinished, token-limited, malformed, oversized, and failed Ollama responses cannot save a partial result", async () => {
  for (const chunks of [
    [{ message: { content: '{"score":90}' }, done: false }],
    [{ message: { content: '{"score":90}' } }],
    [{ message: { content: '{"score":90}' }, done: true, done_reason: "length" }],
    [{ message: { content: '{"score":90}' }, done: false }, { error: "Synthetic model failure" }],
    ["not JSON"],
    [{ message: { content: "x".repeat(128_001) }, done: true }],
  ]) {
    let saved = false;
    const requests = new AnalysisRequests();
    await assert.rejects(requests.run(randomUUID(), async (signal, commit) => {
      const result = await analyzeWithOllama({ ...input, signal }, async () => streaming(chunks));
      return commit(async () => { saved = true; return result; });
    }));
    assert.equal(saved, false);
  }
  await assert.rejects(analyzeWithOllama(input, async () => Response.json({ error: "Model missing" }, { status: 404 })), /Model missing/);
});

test("cancelling an open Ollama stream releases the reader and stops later phases", async () => {
  const controller = new AbortController(), phases = [];
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(stream) {
    stream.enqueue(new TextEncoder().encode(JSON.stringify({ message: { thinking: "Private reasoning", content: '{"score":90}' }, done: true }) + "\n"));
  }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "application/x-ndjson" } });
  await assert.rejects(readOllamaResponse(response, controller.signal, (phase) => { phases.push(phase); controller.abort(); }), { name: "AbortError" });
  assert.deepEqual(phases, ["thinking"]); assert.equal(cancelled, true); assert.equal(response.body.locked, false);
});

test("Ollama silence and partial output obey the request deadline", async () => {
  for (const partial of [false, true]) {
    const controller = new AbortController();
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(stream) {
      if (partial) stream.enqueue(new TextEncoder().encode('{"message":{"content":"{\\"score\\":90}"},"done":false}\n'));
    }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "application/x-ndjson" } });
    const pending = readOllamaResponse(response, controller.signal);
    controller.abort(new DOMException("Deadline", "TimeoutError"));
    await assert.rejects(pending, { name: "TimeoutError" });
    assert.equal(cancelled, true); assert.equal(response.body.locked, false);
  }
});

test("progress stays scoped, deduplicated, and forward-only through an atomic save", async () => {
  const events = [], id = randomUUID(), other = randomUUID();
  const requests = new AnalysisRequests((event) => events.push(event));
  let late;
  await requests.run(id, async (_signal, commit, progress) => {
    late = progress;
    progress("waiting"); progress("waiting"); progress("thinking"); progress("generating"); progress("thinking");
    return commit(async () => { assert.equal(requests.cancel(id), false); return { score: 81 }; });
  });
  late("saving");
  assert.deepEqual(events.map((event) => event.stage), ["preparing", "waiting", "thinking", "generating", "saving"]);
  assert.ok(events.every((event) => event.requestId === id));
  events.length = 0;
  requests.cancel(other);
  await assert.rejects(requests.run(other, async () => {}), { name: "AbortError" });
  assert.deepEqual(events, []);
});

test("cancelled progress cannot advance or overwrite the previous analysis", async () => {
  const events = [], id = randomUUID();
  const requests = new AnalysisRequests((event) => events.push(event.stage));
  let saved = { score: 81 };
  await assert.rejects(requests.run(id, async (_signal, commit, progress) => {
    progress("waiting"); requests.cancel(id); progress("thinking"); progress("generating");
    return commit(async () => { saved = { score: 10 }; return saved; });
  }), { name: "AbortError" });
  assert.deepEqual(events, ["preparing", "waiting"]); assert.deepEqual(saved, { score: 81 });
});

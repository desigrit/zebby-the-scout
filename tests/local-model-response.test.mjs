import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { LocalResponseWatchdog, readLocalCompletion } from "../desktop/local-model-response.ts";

function event(value) { return `data: ${typeof value === "string" ? value : JSON.stringify(value)}\r\n\r\n`; }
function streaming(chunks) {
  const bytes = new TextEncoder().encode(chunks.join(""));
  return new Response(new ReadableStream({ start(controller) {
    // Deliberately split UTF-8 characters, CRLF boundaries, and JSON fragments.
    for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.subarray(offset, offset + 3));
    controller.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
}

test("local model streaming preserves fragmented JSON and Unicode without treating heartbeats as progress", async () => {
  let progress = 0;
  const response = streaming([": keepalive\r\n\r\n", event({ choices: [{ delta: { role: "assistant" } }] }),
    event({ choices: [{ delta: { content: '{"overview":"René ' } }] }),
    event({ choices: [{ delta: { content: '東京 👋","score":81}' } }] }),
    event({ choices: [{ delta: {}, finish_reason: "stop" }] }), event("[DONE]")]);
  const result = await readLocalCompletion(response, new AbortController().signal, () => progress++);
  assert.equal(result.choices[0].finish_reason, "stop");
  assert.deepEqual(JSON.parse(result.choices[0].message.content), { overview: "René 東京 👋", score: 81 });
  assert.equal(progress, 2);
});

test("thinking tokens count as generation progress and never enter the saved JSON", async () => {
  let progress = 0;
  const result = await readLocalCompletion(streaming([
    event({ choices: [{ delta: { reasoning_content: "Private reasoning" } }] }),
    event({ choices: [{ delta: { reasoning: "More private reasoning" } }] }),
    event({ choices: [{ delta: { content: '{"score":82}' }, finish_reason: "stop" }] }), event("[DONE]")]),
  new AbortController().signal, () => progress++);
  assert.equal(progress, 3); assert.equal(result.choices[0].message.content, '{"score":82}');
});

test("an incomplete or token-limited stream cannot claim a complete analysis", async () => {
  for (const finish_reason of [null, "length"]) {
    const result = await readLocalCompletion(streaming([
      event({ choices: [{ delta: { content: '{"score":90}' }, finish_reason }] }), event("[DONE]")]),
    new AbortController().signal, () => {});
    assert.notEqual(result.choices[0].finish_reason, "stop");
  }
  await assert.rejects(readLocalCompletion(streaming([event("{invalid JSON")]), new AbortController().signal, () => {}), /unreadable/);
});

test("first-token and stalled-generation deadlines cancel the reader and release the connection", async () => {
  for (const withToken of [false, true]) {
    const watchdog = new LocalResponseWatchdog(40, 40);
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(withToken
        ? event({ choices: [{ delta: { content: '{"score":' } }] }) : ": keepalive\n\n"));
    }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "text/event-stream" } });
    try {
      const result = readLocalCompletion(response, watchdog.controller.signal, () => watchdog.progress());
      const rejected = assert.rejects(result, { name: "TimeoutError" });
      // Keep the isolated test alive while the production watchdog is unref'd.
      await Promise.all([rejected, delay(80)]);
      assert.equal(cancelled, true);
      assert.equal(watchdog.controller.signal.aborted, true);
      assert.match(watchdog.controller.signal.reason.message, withToken ? /stopped responding/ : /did not start/);
    } finally { watchdog.dispose(); }
  }
});

test("explicit cancellation rejects partial local-model output", async () => {
  const controller = new AbortController();
  const response = new Response(new ReadableStream({ start(stream) {
    stream.enqueue(new TextEncoder().encode(event({ choices: [{ delta: { content: '{"score":90}' } }] })));
  } }), { headers: { "Content-Type": "text/event-stream" } });
  const result = readLocalCompletion(response, controller.signal, () => controller.abort());
  await assert.rejects(result, { name: "AbortError" });
});

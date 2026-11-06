import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { LocalModelEngine } from "../desktop/local-model-engine.ts";
import { getLocalModel } from "../desktop/local-model-catalog.ts";
import { recommendedLocalModels } from "../desktop/local-compute.ts";
import { contextForTokens, localWorkingMemory, localThreadCounts, systemMemoryReserve, localTaskOutputBudget } from "../desktop/local-inference-policy.ts";
import { analyzeWithOllama } from "../desktop/ollama.ts";

const GiB = 1024 ** 3;

test("32 GB Apple Silicon recommends 14B; larger Macs can recommend 30B and 32B without double-counting unified RAM", () => {
  const machine = (available, device) => ({ backend: "metal", availableMemory: available * GiB,
    devices: [{ id: "Metal", name: "Apple GPU", memory: device * GiB, freeMemory: device * GiB }] });
  assert.equal(recommendedLocalModels(machine(22, 24))[0], "qwen3-14b");
  assert.deepEqual(recommendedLocalModels(machine(50, 48)), ["qwen3-32b", "qwen3-30b-a3b"]);
  assert.equal(recommendedLocalModels(machine(10, 48))[0], "qwen3-8b");
  for (const id of ["qwen3-14b", "qwen3-30b-a3b", "qwen3-32b"]) {
    const model = getLocalModel(id);
    assert.equal(model.basic, false); assert.equal(model.supportsThinking, true);
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
    assert.match(model.url, /\/resolve\/[a-f0-9]{40}\//);
  }
});

test("context budgeting preserves the full input and response and reserves memory for other apps", () => {
  assert.equal(contextForTokens(1200, 1800, 32768), 4096);
  assert.equal(contextForTokens(6000, 6000, 32768), 12288);
  assert.throws(() => contextForTokens(31000, 3000, 32768), /cannot fit all/);
  const model = getLocalModel("qwen3-14b");
  assert.ok(localWorkingMemory(model, 8192) + systemMemoryReserve(32 * GiB) < 20 * GiB);
  assert.ok(localWorkingMemory(model, 32768) > localWorkingMemory(model, 8192));
  assert.equal(localTaskOutputBudget("tailored_resume"), 6000);
  assert.ok(localTaskOutputBudget("resume_plan") > localTaskOutputBudget("resume_match"));
  assert.deepEqual(localThreadCounts(10, 8, false), { threads: 7, batch: 8 });
  assert.deepEqual(localThreadCounts(16, 12, true), { threads: 4, batch: 12 });
});

async function fixture(t, overrides = {}) {
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-memory-policy-"));
  const launches = path.join(folder, "launches.jsonl"), worker = path.join(folder, "worker.mjs");
  await writeFile(path.join(folder, "runtime"), "runtime");
  await writeFile(path.join(folder, "runtime.json"), JSON.stringify({ executable: "runtime", backend: "cpu" }));
  await writeFile(worker, `import {appendFileSync} from 'node:fs';
    appendFileSync(${JSON.stringify(launches)}, JSON.stringify(process.argv.slice(3))+'\n');
    process.stdin.on('data', () => process.exit(0)); setInterval(() => {}, 1000);`.replace("+'\n'", "+'\\n'"));
  let memory = { available: 24 * GiB, total: 32 * GiB, pressure: "normal" };
  let tokens = 1200;
  const sent = [], events = [];
  let generation = () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"score":82}' } }] });
  const engine = new LocalModelEngine({ runtimeFolder: folder, workerPath: worker,
    downloads: { readyPath: async () => path.join(folder, "model.gguf") }, memory: async () => memory,
    detectCompute: async () => ({ status: "ready", backend: "cpu", devices: [], availableMemory: memory.available, recommendedModelIds: [] }),
    timeouts: { idleMs: 10000, memoryPollMs: 10000, ...overrides },
    onDiagnostic: (message) => events.push(message),
    fetcher: async (url, options) => {
      if (url.endsWith("/health")) { await delay(60); return Response.json({}); }
      const body = JSON.parse(options.body);
      if (url.endsWith("/apply-template")) return Response.json({ prompt: "<start>" + JSON.stringify(body.messages) });
      if (url.endsWith("/tokenize")) {
        assert.ok(body.content.startsWith("<start>")); assert.equal(body.parse_special, true);
        return Response.json({ tokens: Array(tokens).fill(1) });
      }
      sent.push(body);
      return generation(options);
    },
  });
  t.after(async () => { await engine.shutdown(); assert.ok(folder.startsWith(tmpdir())); await rm(folder, { recursive: true, force: true }); });
  return { engine, sent, events, setTokens: (v) => { tokens = v; }, setMemory: (v) => { memory = { ...memory, ...v }; },
    generate: (fn) => { generation = fn; }, launches: async () => (await readFile(launches, "utf8")).trim().split("\n").map(JSON.parse) };
}

test("tokenizer grows and shrinks context while keeping the selected model, thinking and complete source", async (t) => {
  const f = await fixture(t), input = { resumeText: "Full resume including 東京", jobDescription: "Complete job" };
  f.setTokens(5000);
  await f.engine.analyze("qwen3-06b", "Complete instructions", input, {}, 1800, undefined, "on");
  assert.equal(f.engine.contextTokens, 12288);
  assert.equal(f.sent[0].chat_template_kwargs.enable_thinking, true);
  assert.equal(f.sent[0].max_tokens, 5896);
  assert.deepEqual(JSON.parse(f.sent[0].messages[1].content), input);
  f.setTokens(20);
  await f.engine.analyze("qwen3-06b", "Next instructions", input, {}, 1800);
  assert.equal(f.engine.contextTokens, 4096);
  for (const args of await f.launches()) {
    assert.equal(args[args.indexOf("--cache-ram") + 1], "0");
    assert.equal(args[args.indexOf("--ctx-checkpoints") + 1], "0");
    assert.equal(args[args.indexOf("--parallel") + 1], "1");
  }
});

test("oversized input never reaches generation and releases its loaded model", async (t) => {
  const f = await fixture(t); f.setTokens(16000);
  await assert.rejects(f.engine.analyze("qwen3-06b", "Full instructions", "Full input", {}, 1800), /cannot fit all/);
  assert.equal(f.sent.length, 0); assert.equal(f.engine.modelId, "");
});

test("idle memory exits automatically, subsequent analysis reloads, and manual release also exits", async (t) => {
  const f = await fixture(t, { idleMs: 20 });
  await f.engine.analyze("qwen3-06b", "Instructions", "Input", {});
  assert.ok(f.engine.modelId);
  await delay(150); assert.equal(f.engine.modelId, ""); assert.equal(f.engine.contextTokens, 0);
  await f.engine.analyze("qwen3-06b", "Instructions", "Input", {});
  await f.engine.stop(); assert.equal(f.engine.modelId, "");
  assert.ok((await f.launches()).length >= 2);
  assert.ok(f.events.some((message) => message.includes("memory released")));
});

test("memory pressure evicts idle models and critical pressure aborts active generation without saving output", async (t) => {
  const f = await fixture(t);
  await f.engine.analyze("qwen3-06b", "Instructions", "Input", {});
  f.setMemory({ pressure: "warning" }); await f.engine.checkMemoryPressure(); assert.equal(f.engine.modelId, "");
  f.setMemory({ pressure: "normal" });
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  f.generate(({ signal }) => { started(); return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); });
  const active = f.engine.analyze("qwen3-06b", "Instructions", "Input", {});
  const rejected = assert.rejects(active, /low on memory/);
  await waiting; await assert.rejects(f.engine.stop(), /current local analysis/);
  f.setMemory({ pressure: "critical" }); await f.engine.checkMemoryPressure(); await rejected;
  assert.equal(f.engine.modelId, "");
});

test("cancellation releases native memory and queued work retains its own request", async (t) => {
  const f = await fixture(t), abort = new AbortController(); let started;
  const waiting = new Promise(resolve => { started = resolve; });
  f.generate(({ signal }) => { started(); return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); });
  const active = f.engine.analyze("qwen3-06b", "First", "Input", {}, 1800, abort.signal);
  const rejected = assert.rejects(active, { name: "AbortError" });
  await waiting; abort.abort(); await rejected; assert.equal(f.engine.modelId, "");
  f.generate(() => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"score":70}' } }] }));
  const results = await Promise.all([f.engine.analyze("qwen3-06b", "Second", "Other input", {}), f.engine.analyze("qwen3-06b", "Third", "Third input", {})]);
  assert.deepEqual(results, [{ score: 70 }, { score: 70 }]);
  assert.equal(f.sent.at(-1).messages[0].content, "Third");
});

test("Ollama reserves explicit task context and output, retains model and thinking, and releases after 30 idle seconds", async () => {
  let body;
  const result = await analyzeWithOllama({ baseUrl: "http://localhost:11434", model: "chosen-model", thinkingLevel: "level:high",
    maxTokens: 1800, instructions: "Instructions", content: "Complete input", schema: {} }, async (url, options) => {
    if (url.endsWith("/api/show")) return Response.json({ model_info: { "qwen3.context_length": 32768 } });
    body = JSON.parse(options.body);
    return Response.json({ message: { content: '{"score":80}' }, done: true });
  });
  assert.equal(result.score, 80); assert.equal(body.model, "chosen-model"); assert.equal(body.think, "high");
  assert.equal(body.keep_alive, "30s"); assert.equal(body.options.num_predict, 5896);
  assert.ok(body.options.num_ctx >= 5896 + 1024);
});

test("Ollama rejects a context beyond the model limit before generation", async () => {
  let calls = 0;
  await assert.rejects(analyzeWithOllama({ baseUrl: "http://localhost:11434", model: "chosen", instructions: "Full", content: "x".repeat(20000), schema: {} }, async () => {
    calls++; return Response.json({ model_info: { "llama.context_length": 8192 } });
  }), /safe context budget/);
  assert.equal(calls, 1);
});

test("Ollama thinking activity refreshes the stall deadline even when the visible phase stays the same", async () => {
  let timer, cancelled = false;
  try {
    const result = await analyzeWithOllama({ baseUrl: "http://localhost:11434", model: "chosen", instructions: "Full", content: "Input", schema: {},
      thinkingLevel: "on", timeouts: { firstTokenMs: 150, stallMs: 250, totalMs: 3000 } }, async (url) => {
      if (url.endsWith("/api/show")) return Response.json({});
      let count = 0;
      return new Response(new ReadableStream({ start(controller) {
        timer = setInterval(() => {
          const chunk = ++count < 9 ? { message: { thinking: "Progress" }, done: false }
            : { message: { content: '{"score":80}' }, done: true };
          controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + "\n"));
          if (count === 9) { clearInterval(timer); controller.close(); }
        }, 40);
      }, cancel() { cancelled = true; clearInterval(timer); } }), { headers: { "Content-Type": "application/x-ndjson" } });
    });
    assert.equal(result.score, 80); assert.equal(cancelled, false);
  } finally { clearInterval(timer); }
});

test("Ollama silence times out and releases its stream", async () => {
  let cancelled = false;
  const hold = setInterval(() => {}, 20);
  try {
    await assert.rejects(analyzeWithOllama({ baseUrl: "http://localhost:11434", model: "chosen", instructions: "Full", content: "Input", schema: {},
      timeouts: { firstTokenMs: 40, stallMs: 40, totalMs: 1000 } }, async (url) => {
      if (url.endsWith("/api/show")) return Response.json({});
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "Content-Type": "application/x-ndjson" } });
    }), /timed out/);
    assert.equal(cancelled, true);
  } finally { clearInterval(hold); }
});

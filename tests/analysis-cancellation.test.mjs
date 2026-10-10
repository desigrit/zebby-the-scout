import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { AnalysisRequests } from "../desktop/analysis-requests.ts";
import { analyzeWithOllama } from "../desktop/ollama.ts";
import { LocalModelEngine } from "../desktop/local-model-engine.ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test("cancellation aborts the Ollama transport and never reaches persistence", async () => {
  const requests = new AnalysisRequests(), id = randomUUID();
  let reached;
  const started = new Promise((resolve) => { reached = resolve; });
  let persisted = false;
  const request = requests.run(id, async (signal, commit) => {
    const result = await analyzeWithOllama({ baseUrl: "http://localhost:11434", model: "qwen3.8:27b",
      instructions: "Full instructions", content: "Full resume and posting", schema: {}, signal }, async (_url, options) => {
      reached();
      await new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    });
    return commit(async () => { persisted = true; return result; });
  });
  const rejected = assert.rejects(request, { name: "AbortError" });
  await started;
  assert.equal(requests.cancel(id), true);
  await rejected;
  assert.equal(persisted, false);
});

for (const phase of ["tokenizing", "first-token", "stalled-stream", "worker-exit"]) test(`CPU ${phase} failure stops its worker and permits a fresh analysis`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-engine-recovery-"));
  const pidPath = path.join(folder, "worker.pid");
  await writeFile(path.join(folder, "runtime.json"), JSON.stringify({ executable: "fake-server" }));
  await writeFile(path.join(folder, "fake-server"), "test runtime");
  const worker = path.join(folder, "worker.mjs");
  await writeFile(worker, `import { writeFileSync } from 'node:fs';
    writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
    process.stdin.on('data', () => process.exit(0));
    ${phase === "worker-exit" ? "setTimeout(() => process.exit(7), 50);" : "setInterval(() => {}, 1000);"}`);
  let blocked = true;
  const engine = new LocalModelEngine({ runtimeFolder: folder, workerPath: worker,
    downloads: { readyPath: async () => path.join(folder, "test.gguf") },
    timeouts: { tokenizeMs: 40, firstTokenMs: phase === "worker-exit" ? 2000 : 40, stallMs: 40 },
    fetcher: async (url, options) => {
      if (url.endsWith("/health")) return Response.json({});
      if (url.endsWith("/tokenize")) {
        if (blocked && phase === "tokenizing") {
          options.signal.throwIfAborted();
          await new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
        }
        return Response.json({ tokens: [1, 2] });
      }
      assert.equal(JSON.parse(options.body).stream, true);
      if (!blocked) return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"score":81}' } }] });
      return new Response(new ReadableStream({ start(controller) {
        if (phase === "stalled-stream") controller.enqueue(new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"{\\\"score\\\":"}}]}\n\n'));
      } }), { headers: { "Content-Type": "text/event-stream" } });
    } });
  try {
    await assert.rejects(engine.analyze("smollm2-360m", "instructions", { resume: "complete" }, {}, 200),
      phase === "worker-exit" ? /engine stopped/ : /respond|too long/);
    assert.equal(engine.busy, false);
    assert.equal(engine.status, "idle");
    const pid = Number(await readFile(pidPath, "utf8"));
    assert.throws(() => process.kill(pid, 0), /ESRCH|no such process/i);
    blocked = false;
    assert.deepEqual(await engine.analyze("smollm2-360m", "instructions", { resume: "complete" }, {}, 200), { score: 81 });
  } finally {
    await engine.shutdown();
    assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(folder, { recursive: true, force: true });
  }
});

test("an early cancel skips inference, and a late provider response cannot overwrite results", async () => {
  const requests = new AnalysisRequests();
  const early = randomUUID(); requests.cancel(early);
  await assert.rejects(requests.run(early, async () => assert.fail("Cancelled work must not start")), { name: "AbortError" });
  const late = randomUUID();
  let deliver;
  let saved = { score: 84, keywords: ["Discovery"] };
  const before = structuredClone(saved);
  const request = requests.run(late, async (_signal, commit) => {
    await new Promise((resolve) => { deliver = resolve; });
    return commit(async () => { saved = { score: 10, keywords: ["Late result"] }; return saved; });
  });
  requests.cancel(late); deliver();
  await assert.rejects(request, { name: "AbortError" });
  assert.deepEqual(saved, before);
});

test("cancellation is scoped to one analysis and cannot interrupt an atomic save", async () => {
  const requests = new AnalysisRequests();
  const cancelled = randomUUID(), other = randomUUID();
  requests.cancel(cancelled);
  let finish;
  const save = requests.run(other, (_signal, commit) => commit(async () => {
    await new Promise((resolve) => { finish = resolve; }); return { score: 92 };
  }));
  assert.equal(requests.cancel(other), false);
  finish(); assert.deepEqual(await save, { score: 92 });
  await assert.rejects(requests.run(cancelled, async () => ({})), { name: "AbortError" });
  assert.throws(() => requests.cancel("invalid"), /Invalid analysis request/);
});

test("a completed save cannot acknowledge cancellation while its response is still in transit", async () => {
  const requests = new AnalysisRequests(), id = randomUUID();
  let saved = { score: 84 };
  const result = await requests.run(id, (_signal, commit) => commit(async () => {
    saved = { score: 92 }; return saved;
  }));
  // Persistence completed, but the UI has not received result yet.
  assert.equal(requests.cancel(id), false);
  assert.equal(requests.cancel(id), false);
  assert.deepEqual(saved, result);
  await assert.rejects(requests.run(id, async () => assert.fail("Finished request IDs cannot be replayed")), /already finished/);
  const early = randomUUID();
  assert.equal(requests.cancel(early), true);
  await assert.rejects(requests.run(early, async () => assert.fail("Early cancellation still prevents inference")), { name: "AbortError" });
});

for (const phase of ["loading", "generating"]) test(`CPU cancellation stops the worker during ${phase} and allows another request`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-cancel-engine-"));
  const pidPath = path.join(folder, "worker.pid");
  await writeFile(path.join(folder, "runtime.json"), JSON.stringify({ executable: "fake-server" }));
  await writeFile(path.join(folder, "fake-server"), "test runtime");
  const worker = path.join(folder, "worker.mjs");
  await writeFile(worker, `import { writeFileSync } from 'node:fs';
    writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
    process.stdin.on('data', () => process.exit(0)); setInterval(() => {}, 1000);`);
  let blocked = true, entered;
  const reached = new Promise((resolve) => { entered = resolve; });
  const engine = new LocalModelEngine({ runtimeFolder: folder, workerPath: worker,
    downloads: { readyPath: async () => path.join(folder, "test.gguf") },
    fetcher: async (url, options) => {
      const target = url.endsWith("/health") ? "loading" : url.endsWith("/v1/chat/completions") ? "generating" : "tokens";
      if (blocked && target === phase) {
        entered();
        options.signal.throwIfAborted();
        await new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
      }
      return Response.json(target === "tokens" ? { tokens: [1, 2] } : target === "generating"
        ? { choices: [{ finish_reason: "stop", message: { content: '{"score":81}' } }] } : {});
    } });
  try {
    const controller = new AbortController();
    const request = engine.analyze("smollm2-360m", "instructions", { resume: "complete" }, {}, 200, controller.signal);
    const rejected = assert.rejects(request, { name: "AbortError" });
    await reached;
    for (let i = 0; i < 100 && !(await readFile(pidPath).catch(() => null)); i++) await delay(10);
    const pid = Number(await readFile(pidPath, "utf8"));
    controller.abort(); await rejected;
    assert.equal(engine.busy, false); assert.equal(engine.status, "idle");
    assert.throws(() => process.kill(pid, 0), /ESRCH|no such process/i);
    blocked = false;
    assert.deepEqual(await engine.analyze("smollm2-360m", "instructions", { resume: "complete" }, {}, 200), { score: 81 });
  } finally {
    await engine.shutdown();
    assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(folder, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AnalysisJobs, jobDigest } from "../desktop/chatgpt/analysis-jobs.ts";
import { hasAnalysisReceipt, recordAnalysisReceipt } from "../desktop/analysis-receipts.ts";
import { summarizeChatGPTUsage } from "../shared/chatgpt-usage.ts";
const schema = { type: "object", additionalProperties: false, properties: { score: { type: "integer", minimum: 0, maximum: 100 } }, required: ["score"] };
const request = { version: 1, workspace: "test-workspace", target: "match:application", revision: "r1", account: "test-account", model: "selected-model", thinking: "high",
  name: "application_match", instructions: "Compare source evidence", schema, input: { resumeText: "Resume source", jobDescription: "Job source" } };
const signal = () => new AbortController().signal;
async function fixture(work) {
  const root = await mkdtemp(path.join(tmpdir(), "zebby-private-jobs-"));
  try { await work(root); }
  finally { assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)); await rm(root, { recursive: true, force: true }); }
}
test("a completed result survives restart and retries without another inference", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize(); let calls = 0;
  const result = await jobs.run(request, signal(), async () => { calls++; return { score: 82 }; });
  assert.equal(jobs.summaries[0].state, "ready"); assert.ok(jobs.receipt(result));
  const restored = new AnalysisJobs(folder); await restored.initialize();
  assert.deepEqual(await restored.run(request, signal(), async () => { calls++; throw new Error("Must not call"); }), result);
  assert.equal(calls, 1);
  assert.equal(await readFile(path.join(folder, jobDigest(request), "input/resume.txt"), "utf8"), "Resume source");
  assert.equal(await restored.folderFor(jobDigest(request)), path.join(folder, jobDigest(request)));
  assert.equal(restored.summaries[0].reuseCount, 1);
}));
test("workspace, revision, account, model and instructions isolate cached work", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize(); let calls = 0;
  await jobs.run(request, signal(), async () => { calls++; return { score: 82 }; });
  for (const field of ["workspace", "revision", "account", "model", "instructions"]) {
    await jobs.run({ ...request, [field]: "changed" }, signal(), async () => { calls++; return { score: 80 }; });
  }
  assert.equal(calls, 6);
}));
test("invalid, cancelled and corrupted output cannot be applied or reused", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  await assert.rejects(jobs.run(request, signal(), async () => ({ score: 200 })), /format/);
  const controller = new AbortController();
  await assert.rejects(jobs.run(request, controller.signal, async () => { controller.abort(); return { score: 82 }; }), { name: "AbortError" });
  assert.equal(jobs.summaries[0].state, "cancelled");
  await jobs.run(request, signal(), async () => ({ score: 82 }));
  const statePath = path.join(folder, jobDigest(request), "state.json"), state = JSON.parse(await readFile(statePath, "utf8"));
  await writeFile(path.join(folder, jobDigest(request), "attempts", state.attempt, "result.json"), '{"score":40}');
  const value = await jobs.run(request, signal(), async () => ({ score: 77 })); assert.equal(value.score, 77);
  await jobs.applied(value); assert.equal(jobs.summaries[0].state, "applied");
}));
test("crash during inference becomes an interrupted job and never a completed result", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  await jobs.run(request, signal(), async () => ({ score: 82 }));
  const file = path.join(folder, jobDigest(request), "state.json"), state = JSON.parse(await readFile(file, "utf8"));
  await rm(path.join(folder, jobDigest(request), "attempts", state.attempt, "result.json"));
  await writeFile(file, JSON.stringify({ ...state, state: "running" }));
  const restored = new AnalysisJobs(folder); await restored.initialize(); assert.equal(restored.summaries[0].state, "interrupted");
}));
test("a crash after publishing a validated result recovers it without inference", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  await jobs.run(request, signal(), async () => ({ score: 82 }));
  const file = path.join(folder, jobDigest(request), "state.json"), state = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...state, state: "running", resultHash: undefined }));
  const restored = new AnalysisJobs(folder); await restored.initialize();
  assert.equal(restored.summaries[0].state, "ready");
  assert.deepEqual(await restored.run(request, signal(), async () => { throw new Error("Must not repeat inference"); }), { score: 82 });
}));
test("result and receipt commit together and duplicate application is a no-op", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE values_test (score INTEGER); INSERT INTO values_test VALUES (0); PRAGMA user_version=10");
    const receipt = { id: "a".repeat(64), digest: "a".repeat(64) };
    const apply = () => { db.exec("BEGIN"); if (!hasAnalysisReceipt(db, receipt, "match:1")) {
      db.exec("UPDATE values_test SET score=score+1"); recordAnalysisReceipt(db, receipt, "match:1");
    } db.exec("COMMIT"); };
    apply(); apply(); assert.equal(db.prepare("SELECT score FROM values_test").get().score, 1);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 10);
    assert.throws(() => hasAnalysisReceipt(db, receipt, "match:2"), /another record/);
    const second = { id: "b".repeat(64), digest: "b".repeat(64) };
    db.exec("BEGIN"); recordAnalysisReceipt(db, second, "match:1"); db.exec("ROLLBACK");
    assert.equal(hasAnalysisReceipt(db, second, "match:1"), false);
  } finally { db.close(); }
});
test("a validated Boards cache can acknowledge a job after an interrupted acknowledgement", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  await jobs.run(request, signal(), async () => ({ score: 82 }));
  const restored = new AnalysisJobs(folder); await restored.initialize();
  await restored.appliedRequest({ ...request, workspace: "different" });
  assert.equal(restored.summaries[0].state, "ready");
  await restored.appliedRequest(request); assert.equal(restored.summaries[0].state, "applied");
  await restored.appliedRequest(request); assert.equal(restored.summaries[0].state, "applied");
  assert.equal(restored.summaries[0].reuseCount, 2);
  assert.equal(restored.summaries[0].attempts.length, 1);
}));

const usage = { inputTokens: 120, outputTokens: 40, totalTokens: 160, cachedInputTokens: 80, reasoningTokens: 25 };
test("usage survives failure and retry, and reuse never adds another attempt or tokens", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  await assert.rejects(jobs.run(request, signal(), async execution => {
    await execution.started(); await execution.usage({ usage, responseId: "resp_failed", model: "selected-model" });
    return { score: 200 };
  }), /format/);
  assert.equal(jobs.summaries[0].attempts[0].state, "failed");
  const restarted = new AnalysisJobs(folder); await restarted.initialize();
  const result = await restarted.run(request, signal(), async execution => {
    await execution.started(); await execution.usage({ usage, responseId: "resp_retry" }); return { score: 82 };
  });
  await restarted.applied(result);
  await restarted.run(request, signal(), async () => { throw new Error("Must reuse"); });
  await restarted.run(request, signal(), async () => { throw new Error("Must reuse"); });
  const summary = restarted.summaries[0];
  assert.equal(summary.attempts.length, 2); assert.equal(summary.reuseCount, 2); assert.ok(summary.lastReusedAt);
  assert.equal(summary.model, request.model); assert.equal(summary.thinking, request.thinking);
  assert.deepEqual(summarizeChatGPTUsage(summary.attempts).usage, { inputTokens: 240, outputTokens: 80, totalTokens: 320, cachedInputTokens: 160, reasoningTokens: 50 });
  const again = new AnalysisJobs(folder); await again.initialize();
  assert.deepEqual(again.summaries[0].attempts, summary.attempts);
  assert.equal(again.summaries[0].reuseCount, 2);
}));
test("interruption preserves reported usage and distinguishes requests that never started", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  await assert.rejects(jobs.run(request, signal(), async () => { throw new Error("Stopped in queue"); }));
  assert.equal(jobs.summaries[0].attempts[0].requestStarted, false);
  const controller = new AbortController();
  await assert.rejects(jobs.run(request, controller.signal, async execution => {
    await execution.started(); await execution.usage({ usage }); controller.abort(); return { score: 82 };
  }), { name: "AbortError" });
  assert.equal(jobs.summaries[0].state, "cancelled");
  assert.equal(summarizeChatGPTUsage(jobs.summaries[0].attempts).usage.totalTokens, 160);
  await assert.rejects(jobs.run(request, signal(), async execution => { await execution.started(); throw new Error("Stream interrupted"); }));
  const totals = summarizeChatGPTUsage(jobs.summaries[0].attempts);
  assert.equal(totals.missing, 1); assert.equal(totals.notRequested, 1); assert.equal(totals.usage.totalTokens, 160);
}));
test("legacy history adopts model details without fabricating usage or losing kept jobs", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  const result = await jobs.run(request, signal(), async () => ({ score: 82 })); await jobs.applied(result);
  const file = path.join(folder, jobDigest(request), "state.json"), saved = JSON.parse(await readFile(file, "utf8"));
  for (const key of ["attempts", "model", "thinking", "reuseCount"]) delete saved[key];
  saved.retained = true; saved.updatedAt = "2020-01-01T00:00:00Z";
  await writeFile(file, JSON.stringify(saved));
  const restored = new AnalysisJobs(folder); await restored.initialize();
  assert.equal(restored.summaries.length, 0, "Old history is hidden without deleting its files");
  await restored.run(request, signal(), async () => { throw new Error("Must reuse legacy result"); });
  const summary = restored.summaries[0];
  assert.equal(summary.model, request.model); assert.equal(summary.thinking, "high");
  assert.equal(summarizeChatGPTUsage(summary.attempts).usage, undefined);
  assert.equal(summarizeChatGPTUsage(summary.attempts).missing, 1);
  assert.equal(summary.reuseCount, 1);
  assert.equal(JSON.parse(await readFile(file, "utf8")).retained, true);
}));
test("old job folders survive startup in every state and completed results remain reusable", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  const saved = [];
  for (const state of ["applied", "failed", "cancelled", "ready", "interrupted"]) {
    const jobRequest = { ...request, revision: state };
    await jobs.run(jobRequest, signal(), async () => ({ score: 82 }));
    const id = jobDigest(jobRequest), file = path.join(folder, id, "state.json");
    const raw = { ...JSON.parse(await readFile(file, "utf8")), state, createdAt: "2020-01-01T00:00:00Z", updatedAt: "2020-01-01T00:00:00Z" };
    await writeFile(file, JSON.stringify(raw)); saved.push({ jobRequest, id, file, content: await readFile(file, "utf8") });
  }
  const restored = new AnalysisJobs(folder); await restored.initialize();
  assert.deepEqual(restored.summaries, []);
  for (const job of saved) {
    assert.equal(await readFile(job.file, "utf8"), job.content, "Startup does not rewrite or delete archived history");
    assert.equal(await restored.folderFor(job.id), path.join(folder, job.id));
  }
  const reused = saved[0];
  assert.deepEqual(await restored.run(reused.jobRequest, signal(), async () => { throw new Error("Old result must be reused"); }), { score: 82 });
  assert.equal(restored.summaries.length, 1);
  assert.equal(restored.summaries[0].reuseCount, 1);
  assert.equal(restored.summaries[0].attempts.length, 1);
  assert.equal(restored.summaries[0].createdAt, "2020-01-01T00:00:00Z");
  assert.ok(Date.parse(restored.summaries[0].updatedAt) > Date.parse(restored.summaries[0].createdAt));
}));
test("Usage includes every job active in the last seven days, with an inclusive boundary and no thirty-job cap", () => fixture(async folder => {
  let now = Date.parse("2026-11-07T12:00:00Z");
  const cutoff = now - 7 * 86400_000;
  const seed = async (revision, updatedAt, createdAt = "2020-01-01T00:00:00Z") => {
    const id = jobDigest({ ...request, revision });
    await mkdir(path.join(folder, id));
    await writeFile(path.join(folder, id, "state.json"), JSON.stringify({ id, digest: id, name: request.name,
      model: request.model, state: "failed", createdAt, updatedAt, error: "" }));
    return id;
  };
  const boundary = await seed("boundary", new Date(cutoff).toISOString());
  const expired = await seed("expired", new Date(cutoff - 1).toISOString());
  const fallback = await seed("legacy", undefined, new Date(now - 1000).toISOString());
  for (let index = 0; index < 35; index++) await seed(`recent-${index}`, new Date(now - index).toISOString());
  const jobs = new AnalysisJobs(folder, undefined, () => now); await jobs.initialize();
  assert.equal(jobs.summaries.length, 37);
  assert.equal(jobs.summaries.at(-1).id, boundary);
  assert.ok(!jobs.summaries.some(job => job.id === expired));
  assert.equal(jobs.summaries.find(job => job.id === fallback).updatedAt, new Date(now - 1000).toISOString());
  assert.equal(await jobs.folderFor(expired), path.join(folder, expired));
  now++;
  assert.equal(jobs.summaries.length, 36, "The display window advances without removing a folder");
  assert.equal(await jobs.folderFor(boundary), path.join(folder, boundary));
}));
test("Check all groups measured requests by click, counts cached work once, and survives restart", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  const first = jobs.createBoardBatch(request.model, request.thinking, 3);
  await first.start();
  const board = target => ({ ...request, target, name: "board_extract" });
  const execute = async activity => {
    await activity.started();
    await activity.usage({ usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100, cachedInputTokens: 30, reasoningTokens: 10 } });
    return { score: 82 };
  };
  for (const target of ["one", "two"]) {
    const value = await jobs.run(board(target), signal(), execute, undefined, first.id);
    await jobs.applied(value, first.id);
  }
  await jobs.appliedRequest(board("three"), first.id);
  await first.finish("completed");
  const second = jobs.createBoardBatch(request.model, request.thinking, 1);
  await second.start();
  await jobs.run(board("one"), signal(), assert.fail, undefined, second.id);
  await second.finish("completed");
  const restored = new AnalysisJobs(folder); await restored.initialize();
  assert.equal(restored.summaries.length, 2);
  const batch = restored.summaries.find(item => item.id === first.id);
  assert.equal(batch.boardCount, 3); assert.equal(batch.state, "completed"); assert.equal(batch.reuseCount, 1);
  assert.equal(batch.attempts.length, 2);
  const { usage } = summarizeChatGPTUsage(batch.attempts);
  assert.deepEqual(usage, { inputTokens: 160, outputTokens: 40, totalTokens: 200, cachedInputTokens: 60, reasoningTokens: 20 });
  const report = JSON.parse(await readFile(path.join(await restored.folderFor(first.id), "run.json"), "utf8"));
  assert.deepEqual(report.usage, usage);
  assert.deepEqual(new Set(report.requests.map(entry => entry.jobId)), new Set([jobDigest(board("one")), jobDigest(board("two"))]));
  const cacheOnly = restored.summaries.find(item => item.id === second.id);
  assert.equal(cacheOnly.attempts.length, 0); assert.equal(cacheOnly.reuseCount, 1);
  await restored.run(board("one"), signal(), assert.fail);
  const single = restored.summaries.find(item => item.id === jobDigest(board("one")));
  assert.equal(single.reuseCount, 1); assert.equal(single.attempts.length, 0);
}));
test("standalone retries and interrupted Check all runs keep separate usage and unknown counts", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  const task = { ...request, name: "board_extract" };
  await assert.rejects(jobs.run(task, signal(), async activity => {
    await activity.started(); await activity.usage({ usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 } });
    throw new Error("First attempt failed");
  }), /First attempt failed/);
  const group = jobs.createBoardBatch(request.model, request.thinking, 1); await group.start();
  await assert.rejects(jobs.run(task, signal(), async activity => {
    await activity.started(); throw new Error("Connection ended");
  }, undefined, group.id), /Connection ended/);
  const restored = new AnalysisJobs(folder); await restored.initialize();
  const batch = restored.summaries.find(item => item.id === group.id);
  assert.equal(batch.state, "interrupted"); assert.equal(batch.attempts.length, 1);
  assert.equal(summarizeChatGPTUsage(batch.attempts).missing, 1);
  const single = restored.summaries.find(item => item.id === jobDigest(task));
  assert.equal(single.state, "failed"); assert.equal(single.attempts.length, 1);
  assert.equal(summarizeChatGPTUsage(single.attempts).usage.totalTokens, 10);
}));
test("view job only resolves known real job directories", () => fixture(async folder => {
  const jobs = new AnalysisJobs(folder); await jobs.initialize();
  await jobs.run(request, signal(), async () => ({ score: 82 }));
  const id = jobDigest(request), directory = path.join(folder, id);
  assert.equal(await jobs.folderFor(id), directory);
  for (const value of ["../outside", "b".repeat(64), {}, undefined]) await assert.rejects(jobs.folderFor(value), /not found/);
  const moved = path.join(folder, "moved"); await mkdir(moved);
  await rm(directory, { recursive: true }); await symlink(moved, directory, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(jobs.folderFor(id), /location is invalid/);
}));

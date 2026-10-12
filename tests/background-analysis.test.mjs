import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setImmediate as flush } from "node:timers/promises";
import { AnalysisJobs, jobRunning } from "../desktop/renderer/analysis-jobs.ts";
import { AnalysisRequests } from "../desktop/analysis-requests.ts";
import { editingCommand } from "../desktop/editing-commands.ts";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { anthropicSchema, validStructuredResult, providerFailure } from "../desktop/online-response.ts";
import { planSchema, matchSchema } from "../desktop/analysis-contracts.ts";

const prepare = async () => ({});
test("page subscriptions can leave and return without cancelling any job; results stay bound to their source", async () => {
  const pending = new Map(), cancelled = [];
  const jobs = new AnalysisJobs((url, options) => new Promise((resolve, reject) => {
    pending.set(url, resolve); options.signal.addEventListener("abort", () => reject(options.signal.reason));
  }), async (id) => { cancelled.push(id); return true; });
  const first = { kind: "plan", id: "first" }, second = { kind: "plan", id: "second" }, match = { kind: "match", id: "first" };
  let updates = 0;
  const leave = jobs.subscribe(() => updates++);
  const a = jobs.start(first, { prepare }), b = jobs.start(second, { prepare }), c = jobs.start(match, { prepare });
  await flush();
  assert.equal(pending.size, 3);
  await jobs.start(first, { prepare: () => assert.fail("Duplicate must not prepare or charge") });
  const started = jobs.get(first).startedAt, id = jobs.get(first).requestId;
  leave(); const last = updates;
  jobs.progress({ requestId: id, stage: "thinking" });
  assert.equal(updates, last); assert.equal(cancelled.length, 0);
  pending.get("/api/plans/second/analyze")(Response.json({ plan: { id: "second", overview: "Second result" } }));
  await b;
  assert.equal(jobs.get(second).result.plan.overview, "Second result");
  assert.equal(jobRunning(jobs.get(first)), true);
  const leaveAgain = jobs.subscribe(() => updates++);
  assert.equal(jobs.get(first).startedAt, started); assert.equal(jobs.get(first).stage, "thinking");
  pending.get("/api/applications/first/analyze")(Response.json({ application: { id: "first", matchStrength: 83 } })); await c;
  await jobs.cancel(first); await a;
  assert.equal(jobs.get(first).status, "cancelled"); assert.equal(jobs.get(first).result, undefined);
  assert.equal(jobs.get(match).result.application.matchStrength, 83);
  assert.deepEqual(cancelled, [id]); assert.ok(updates > last); leaveAgain();
});

test("saving is not cancellable, late progress is ignored, failed jobs unlock and can retry", async () => {
  let finish, fail = false;
  const jobs = new AnalysisJobs(() => new Promise(resolve => { finish = () => resolve(Response.json(fail ? { error: "Fixture error" }
    : { plan: { id: "one" } }, { status: fail ? 400 : 200 })); }), async () => assert.fail("Committed job cannot be cancelled"));
  const source = { kind: "plan", id: "one" };
  let task = jobs.start(source, { prepare }); await flush();
  const id = jobs.get(source).requestId;
  jobs.progress({ requestId: id, stage: "saving" }); await jobs.cancel(source);
  finish(); await task;
  jobs.progress({ requestId: id, stage: "thinking" }); assert.equal(jobs.get(source).stage, "saving");
  fail = true; task = jobs.start(source, { prepare }); await flush(); finish(); await task;
  assert.equal(jobRunning(jobs.get(source)), false); assert.equal(jobs.get(source).error, "Fixture error");
  fail = false; task = jobs.start(source, { prepare }); await flush(); finish(); await task;
  assert.equal(jobs.get(source).status, "succeeded");
});

test("cancelling credit preparation unlocks immediately and a late quote never starts a paid run", async () => {
  const sent = [], source = { kind: "plan", id: "paid" };
  let finishQuote, preparationSignal;
  const jobs = new AnalysisJobs(async (_url, options) => {
    sent.push(options.headers["X-Zebby-Credit-Quote"]);
    return Response.json({ plan: { id: source.id } });
  }, async () => true);
  const first = jobs.start(source, { prepare: signal => {
    preparationSignal = signal; return new Promise(resolve => { finishQuote = resolve; });
  } });
  await flush(); await jobs.cancel(source); await first;
  assert.equal(preparationSignal.aborted, true);
  assert.equal(jobs.get(source).status, "cancelled");
  await jobs.start(source, { prepare: async () => ({ quoteId: "new-quote" }) });
  finishQuote({ quoteId: "cancelled-quote" }); await flush();
  assert.deepEqual(sent, ["new-quote"]);
  assert.equal(jobs.get(source).status, "succeeded");
});

test("failed credit checks never send paid requests and independent listings can prepare concurrently", async () => {
  const first = { kind: "plan", id: "first-paid" }, second = { kind: "match", id: "second-paid" };
  const sent = [], jobs = new AnalysisJobs(async (url, options) => {
    sent.push(options.headers["X-Zebby-Credit-Quote"]);
    return Response.json(url.includes("applications") ? { application: { id: second.id } } : { plan: { id: first.id } });
  }, async () => true);
  await jobs.start(first, { prepare: async () => { throw new Error("Credit service unavailable. Try again."); } });
  assert.deepEqual(sent, []); assert.equal(jobs.get(first).status, "failed");
  let finish;
  const pending = jobs.start(first, { prepare: () => new Promise(resolve => { finish = resolve; }) });
  await flush();
  await jobs.start(second, { prepare: async () => ({ quoteId: "second-quote" }) });
  assert.equal(jobs.get(first).status, "running"); assert.equal(jobs.get(second).status, "succeeded");
  finish({ quoteId: "first-quote" }); await pending;
  assert.deepEqual(sent, ["second-quote", "first-quote"]);
});

test("backend locks only the analyzed record, prevents duplicate requests and releases after cancellation", async () => {
  const requests = new AnalysisRequests(), id = randomUUID();
  const task = requests.run(id, async signal => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))), "plan:one");
  assert.throws(() => requests.assertEditable("plan:one"), /Finish or cancel/);
  requests.assertEditable("plan:two"); requests.assertEditable("match:one");
  await assert.rejects(requests.run(randomUUID(), async () => assert.fail(), "plan:one"), /already being analyzed/);
  requests.cancel(id); await assert.rejects(task, { name: "AbortError" });
  requests.assertEditable("plan:one"); assert.equal(requests.busy, false);
});

test("Mac editing supports the native clipboard shortcuts without a legacy menu", () => {
  const base = { type: "keyDown", meta: true, control: false, shift: false, alt: false };
  for (const [key, command] of Object.entries({ c: "copy", v: "paste", x: "cut", a: "selectAll", z: "undo" }))
    assert.equal(editingCommand({ ...base, key }, "darwin"), command);
  assert.equal(editingCommand({ ...base, key: "V", shift: true }, "darwin"), "pasteAndMatchStyle");
  assert.equal(editingCommand({ ...base, key: "v", type: "keyUp" }, "darwin"), undefined);
  assert.equal(editingCommand({ ...base, key: "c", meta: false }, "darwin"), undefined);
  assert.equal(editingCommand({ ...base, key: "z", meta: false, control: true }, "win32"), "undo");
});

test("Anthropic receives a supported schema; original range and list constraints still apply", async () => {
  const original = JSON.stringify(planSchema), adapted = anthropicSchema(planSchema);
  assert.equal(adapted.properties.keywords.minItems, 1);
  assert.equal(adapted.properties.keywords.maxItems, undefined);
  assert.match(adapted.properties.keywords.description, /minItems: 6, maxItems: 20/);
  assert.equal(adapted.properties.score.minimum, undefined);
  assert.match(adapted.properties.score.description, /minimum: 0, maximum: 100/);
  assert.equal(JSON.stringify(planSchema), original);
  const run = score => onlineAnalysis({ model: "claude-sonnet-5-5", key: "synthetic", instructions: "Compare", input: {}, kind: "match",
    name: "match", schema: matchSchema, fetcher: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body).output_config.format.schema, anthropicSchema(matchSchema));
      return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ score, explanation: "Evidence" }) }] });
    } });
  assert.equal((await run(75)).result.score, 75); await assert.rejects(run(120), /required format/);
  assert.equal(validStructuredResult(planSchema, { keywords: [], themes: [], score: 50, overview: "", overviewRationale: "", explanation: "" }), false);
});

test("provider errors distinguish format, account, limits and outages without exposing response content", () => {
  const cases = [[400, "output_config.format.schema: minimum is unsupported", "schema"], [400, "credit balance is too low", "billing"],
    [400, "thinking budget_tokens is invalid", "thinking"], [400, "Invalid request", "request"], [401, "invalid key", "authentication"],
    [402, "payment", "billing"], [403, "not allowed", "permission"], [404, "unknown model", "model"], [413, "too big", "input-size"],
    [429, "rate limit", "rate-limit"], [500, "server error", "service"], [504, "timeout", "timeout"], [529, "overload", "overloaded"]];
  for (const [status, message, category] of cases) {
    const error = providerFailure("Anthropic", "claude-sonnet-5-5", "high", new Response(null, { status, headers: { "request-id": "req_1234567890" } }),
      { error: { type: "invalid_request_error", message: `${message}. PRIVATE RESUME sk-ant-sensitive-key` } });
    assert.match(error.diagnostic, new RegExp(`category=${category}`)); assert.match(error.diagnostic, /req_1234567890/);
    assert.doesNotMatch(`${error.message} ${error.diagnostic}`, /PRIVATE|sensitive-key/);
  }
});

test("Zebby-credit provider billing failures direct recovery to Zebby, while own-key failures keep API billing advice", () => {
  for (const status of [401, 402, 403]) {
    const response = new Response(null, { status });
    const body = { error: { type: "authentication_error", message: "PRIVATE SERVICE KEY" } };
    const credits = providerFailure("OpenAI", "gpt-6.1-sol", "high", response, body, "zebby");
    assert.match(credits.message, /unavailable through Zebby credits/);
    assert.doesNotMatch(credits.message, /Replace it|your API account|PRIVATE/);
    assert.match(credits.diagnostic, new RegExp(`status=${status}`));
  }
  const ownKey = providerFailure("OpenAI", "gpt-6.1-sol", "high", new Response(null, { status: 402 }), {});
  assert.match(ownKey.message, /Billing in your API account/);
  const limited = providerFailure("OpenAI", "gpt-6.1-sol", "high", new Response(null, { status: 429 }), {}, "zebby");
  assert.match(limited.message, /Wait and try again/);
  assert.doesNotMatch(limited.message, /your API limits/);
});

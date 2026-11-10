import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";
import { boardExtractionInput, boardModelContract, validatedBoardExtraction } from "../shared/boards.ts";
import { defaultBoardReaderSettings, controlProvesScope } from "../shared/board-exploration.ts";
import { openAIAnalysisInput } from "../desktop/openai-request.ts";
import { anthropicAnalysisInput } from "../desktop/anthropic-request.ts";
import { validStructuredResult } from "../desktop/online-response.ts";

const folder = await mkdtemp(path.join(tmpdir(), "zebby-thorough-"));
await build({ stdin: { contents: "export * from './desktop/board-thorough'; export * from './desktop/board-runs'; export * from './desktop/boards-store'; export * from './desktop/boards-service';", resolveDir: process.cwd() },
  outfile: path.join(folder, "reader.mjs"), bundle: true, platform: "node", format: "esm", target: "node22" });
const { thoroughlyScanBoard, newBoardCheckpoint, boardScope, mapObservedFeed, BoardRuns, BoardsStore, BoardsService } = await import(pathToFileURL(path.join(folder, "reader.mjs")).href);
after(() => rm(folder, { recursive: true, force: true }));
const url = "https://example.org/careers", image = { mediaType: "image/jpeg", width: 320, height: 240,
  data: (await sharp({ create: { width: 320, height: 240, channels: 3, background: "white" } }).jpeg().toBuffer()).toString("base64") };
const job = (id = 1) => ({ id: "l" + id, url: url + "/" + id, title: "Product Manager " + id, text: "Product Manager" });
const control = (overrides = {}) => ({ id: "e0", name: "Team", role: "combobox", kind: "select", context: "Team filter", value: "Product", href: "", disabled: false,
  expanded: null, visible: true, options: [{ value: "Product", label: "Product", selected: true }], ...overrides });
const checkpoint = (overrides = {}) => newBoardCheckpoint({ boardId: "board-1", workspace: path.join(folder, "workspace.sqlite"), revision: 1, url, provider: "openai", model: "fixture", account: "", instructions: "", ...overrides });
function fixture({ inventory = [job()], total = true, change = false, empty = false, filter = false } = {}) {
  let opens = 0, closed = 0; const actions = [], inputs = [];
  const reader = { async open() { opens++; }, close() { closed++; }, feeds() { return []; }, async act(action) { actions.push(action); }, async observe() {
    const candidates = change && opens % 2 ? [job(9)] : inventory;
    return { image, fingerprint: "observed", pendingRequests: 0, page: { url, title: "Careers", summary: empty ? "No open jobs" : "Product roles",
      candidates, viewportIds: candidates.map(job => job.id), controls: filter ? [control()] : [], counters: total ? [{ id: "t0", text: candidates.length + " open jobs" }] : [],
      sections: [], atBottom: true, loading: false, blocked: false, height: 500, scrollY: 0 } };
  } };
  const extract = async input => { inputs.push(input); if (input.task === "roles") return { decisions: Object.fromEntries(input.candidates.map(job => [job.id, job.title.endsWith("1")])) };
    return { listings: input.candidates.map(job => ({ id: job.id, title: job.title, department: "Product", location: "Seattle" })),
      action: { kind: "finish", targetId: "", value: "" }, excludedIds: [], uncertainIds: [], scopeEvidence: [], irrelevantControls: [],
      totalEvidence: { counterId: total ? "t0" : "", filteredTotal: total ? input.candidates.length : null, interpretation: total ? "filtered" : "unknown" }, empty, complete: true, reason: "All results visible" };
  };
  return { reader, extract, actions, inputs, opens: () => opens, closed: () => closed };
}
async function scan(testFixture, run = checkpoint(), extra = {}) {
  const saves = [];
  const value = await thoroughlyScanBoard({ ...testFixture, checkpoint: run, settings: defaultBoardReaderSettings, url: run.url, instructions: run.instructions,
    provider: "openai", model: "fixture", signal: new AbortController().signal, progress() {}, save: async run => { saves.push(structuredClone(run)); }, ...extra });
  return { value, saves, run };
}

test("thorough checks require two independently opened inventories and then apply criteria", async () => {
  const f = fixture({ inventory: [job(1), job(2)] }), { value, run } = await scan(f, checkpoint({ instructions: "Only Product Manager 1" }));
  assert.equal(f.opens(), 2); assert.equal(f.closed(), 1); assert.equal(value.jobs.length, 2); assert.equal(value.jobs.filter(job => job.matches).length, 1);
  assert.equal(f.inputs.at(-1).task, "roles"); assert.ok(f.inputs.some(input => input.pass === "audit")); assert.equal(run.verifiedPass.length, 2);
});
test("an unknown total requires another complete sweep, while explicit zero is valid", async () => {
  const f = fixture({ total: false }); await scan(f); assert.equal(f.actions.filter(action => action.kind === "scroll" && action.value === "top").length, 2);
  const empty = await scan(fixture({ inventory: [], empty: true })); assert.equal(empty.value.jobs.length, 0);
});
test("changed inventory cannot complete on two disagreeing passes", async () => {
  const f = fixture({ change: true }), run = checkpoint();
  await assert.rejects(scan(f, run), /kept changing/); assert.equal(f.opens(), 3); assert.equal(run.status, "incomplete");
});
test("finish cannot silently skip enabled result controls", async () => {
  for (const name of ["Next page", "Show 20 more jobs", "Explore opportunities"]) {
    const f = fixture(), observe = f.reader.observe;
    f.reader.observe = async () => { const observation = await observe(); observation.page.controls = [control({ name, role: "button", kind: "button", value: "", options: [] })]; return observation; };
    await assert.rejects(scan(f), /further progress|reading limit/);
  }
});
test("URL scope survives fragment filters and requires observed selected values", async () => {
  assert.equal(controlProvesScope(control({ kind: "option", role: "option", value: "Product", options: [] }), "Product"), false, "An unselected menu option cannot prove a filter");
  assert.equal(controlProvesScope(control({ kind: "option", role: "selected", value: "Product", options: [] }), "Product"), true);
  const multi = control({ options: [{ value: "Product", label: "Product", selected: true }, { value: "Design", label: "Design", selected: true }] });
  assert.equal(controlProvesScope(multi, "Product"), false, "An extra selection broadens the saved search");
  assert.equal(controlProvesScope(multi, "Product", ["Product", "Design"]), true);
  assert.deepEqual(boardScope(url + "#openings?category=product"), [{ id: "s0", key: "category", value: "product" }]);
  assert.equal(boardScope(url + "?utm_source=test&sort_by=relevance").length, 0);
  assert.deepEqual(boardScope(url + "?team=Product&team=Design").map(filter => filter.value), ["Product", "Design"]);
  assert.equal(boardScope(url + "?q=%2520")[0].value, "%20");
  await assert.rejects(scan(fixture(), checkpoint({ url: url + "?team=Product" }), { settings: { ...defaultBoardReaderSettings, modelCalls: 8 } }), /reading limit|further progress/);
  const f = fixture({ filter: true }); await scan(f, checkpoint({ url: url + "?team=Product" })); assert.equal(f.opens(), 2);
  const embedded = fixture(), observe = embedded.reader.observe;
  embedded.reader.observe = async () => ({ ...await observe(), scopeControls: [control()] });
  await scan(embedded, checkpoint({ url: url + "?team=Product" }));
  embedded.reader.observe = async () => ({ ...await observe(), scopeControls: [control({ value: "Design", options: [] })] });
  await assert.rejects(scan(embedded, checkpoint({ url: url + "?team=Product" })), /further progress|reading limit/);
});
test("a limit preserves the finished pass and resume starts with an independent audit", async () => {
  const f = fixture(), run = checkpoint();
  await assert.rejects(scan(f, run, { settings: { ...defaultBoardReaderSettings, modelCalls: 2 } }), /reading limit/);
  assert.equal(run.status, "paused"); assert.equal(run.verifiedPass.length, 1);
  const retry = fixture(); await scan(retry, run, { resume: true }); assert.equal(retry.opens(), 1); assert.equal(retry.inputs[0].pass, "audit");
});
test("cancellation preserves discovered jobs and closes the browser", async () => {
  const f = fixture(), run = checkpoint(), abort = new AbortController();
  await assert.rejects(scan(f, run, { signal: abort.signal, save: async run => { if (run.jobs.length) abort.abort(); } }), /abort/i);
  assert.equal(run.status, "paused"); assert.equal(run.jobs.length, 1); assert.equal(f.closed(), 1);
});
test("public feed mapping rejects fabricated paths, duplicate IDs and unobserved link construction", () => {
  const mapping = { usable: true, records: "/jobs", id: "/id", title: "/title", url: "/url", department: "", location: "", total: "/total", next: "" };
  const feed = { id: "feed", url, sample: "", data: { total: 1, jobs: [{ id: 1, title: "Product Manager", url: job().url }] } };
  assert.equal(mapObservedFeed(feed, mapping).complete, true);
  assert.equal(mapObservedFeed(feed, { ...mapping, url: "/fabricated" }), null);
  assert.equal(mapObservedFeed({ ...feed, data: { total: 2, jobs: [feed.data.jobs[0], feed.data.jobs[0]] } }, mapping), null);
  assert.equal(mapObservedFeed(feed, { ...mapping, records: "/__proto__" }), null);
});
test("exploration schemas reject fabricated actions and preserve native image provider input", async () => {
  const f = fixture(); await scan(f); const input = boardExtractionInput.parse(f.inputs[0]), result = await f.extract(input);
  assert.equal(boardModelContract(input).schema.additionalProperties, false);
  assert.throws(() => validatedBoardExtraction({ ...result, action: { kind: "next", targetId: "made-up", value: "" } }, input), /unavailable/);
  assert.throws(() => validatedBoardExtraction({ ...result, listings: [{ id: "not-observed", title: "PM", department: "", location: "" }] }, input), /unobserved/);
  assert.throws(() => validatedBoardExtraction({ ...result, listings: [] }, input), /every visible link/);
  const dangerous = { ...input, controls: [control({ kind: "button", role: "button", name: "Apply now" })] };
  assert.throws(() => validatedBoardExtraction({ ...result, action: { kind: "inspect", targetId: "e0", value: "" } }, dangerous), /unsupported/);
  const contract = boardModelContract(input); const a = openAIAnalysisInput({ ...contract, input, model: "gpt-6.1-sol" }), b = anthropicAnalysisInput({ ...contract, input, model: "claude-sonnet-5-5" });
  assert.ok(JSON.stringify(a).includes("input_image")); assert.ok(JSON.stringify(b).includes('"image"'));
});

test("link and control vocabularies prevent the Zoom unobserved-control failure", async () => {
  const f = fixture(); await scan(f);
  const input = { ...f.inputs[0], controls: [control()] }, result = await f.extract(input);
  const schema = boardModelContract(input).schema;
  assert.equal(validStructuredResult(schema, result), true);
  const linkAsControl = { ...result, irrelevantControls: [input.candidates[0].id] };
  assert.equal(validStructuredResult(schema, linkAsControl), false);
  assert.throws(() => validatedBoardExtraction(linkAsControl, input), /Use only control IDs: e0.*excludedIds/);
  assert.equal(validStructuredResult(schema, { ...result, irrelevantControls: ["e0"] }), true);
  assert.equal(validStructuredResult(schema, { ...result, excludedIds: ["e0"] }), false);
  assert.equal(validStructuredResult(schema, { ...result, totalEvidence: { ...result.totalEvidence, counterId: "t999" } }), false);
  assert.throws(() => validatedBoardExtraction({ ...result, totalEvidence: { counterId: "t999", filteredTotal: null, interpretation: "unknown" } }, input), /unobserved results counter/);
  assert.equal(validStructuredResult(schema, { ...result, scopeEvidence: [{ scopeId: "s999", controlId: "e0", value: "Product" }] }), false);
  assert.equal(validStructuredResult(schema, { ...result, action: { kind: "next", targetId: "e999", value: "" } }), false);
});

test("an empty viewport has valid empty arrays without permitting placeholder IDs", async () => {
  const f = fixture({ inventory: [], total: false, empty: true }); await scan(f);
  const input = f.inputs[0], result = await f.extract(input), schema = boardModelContract(input).schema;
  assert.equal(validStructuredResult(schema, result), true);
  assert.equal(validStructuredResult(schema, { ...result, irrelevantControls: [""] }), false);
  assert.equal(validStructuredResult(schema, { ...result, excludedIds: [""] }), false);
});

test("hash route filters require observed selected values, not the URL or an unchecked input", async () => {
  const zoom = "https://www.careers.zoom.us/job-results#/7bc982e1-3ea0-44c2-94d3-cdbc196a6688/united-states-of-america";
  assert.deepEqual(boardScope(zoom).map(item => item.value), ["7bc982e1-3ea0-44c2-94d3-cdbc196a6688", "united-states-of-america"]);
  assert.deepEqual(boardScope(url + "#/search"), []);
  const unchecked = control({ role: "checkbox", kind: "input", value: "Product", options: [{ value: "Product", label: "Product", selected: false }] });
  assert.equal(controlProvesScope(unchecked, "Product"), false);
  const f = fixture(), observe = f.reader.observe;
  f.reader.observe = async () => {
    const observation = await observe();
    observation.page.controls = boardScope(zoom).map((item, index) => control({ id: "e" + index, name: index ? "United States of America" : "Product", kind: "input", role: "selected", value: item.value,
      options: [{ value: item.value, label: index ? "United States of America" : "Product", selected: true }] }));
    return observation;
  };
  await scan(f, checkpoint({ url: zoom })); assert.ok(f.inputs.every(input => input.coverage.scopeVerified));
  const empty = fixture(); await assert.rejects(scan(empty, checkpoint({ url: zoom })), /further progress|revisiting|reading limit/);
});

test("local settling reuses a validated finish but each independent pass still reads afresh", async () => {
  const f = fixture(); const { run } = await scan(f);
  assert.equal(f.inputs.length, 2); assert.deepEqual(f.inputs.map(input => input.pass), ["collect", "audit"]);
  assert.equal(run.calls, 2); assert.equal(f.actions.filter(action => action.kind === "wait").length, 2);
});

test("cycles with different scroll actions stop when they add no new evidence", async () => {
  const f = fixture(), extract = f.extract; let calls = 0;
  f.extract = async input => ({ ...await extract(input), action: { kind: "scroll", targetId: "", value: ++calls % 2 ? "top" : "down" } });
  await assert.rejects(scan(f), /revisiting|further progress/);
  assert.ok(calls <= 10, `Stopped after ${calls} calls`);
});

test("an unseen results control is revealed and cannot be skipped when the count already matches", async () => {
  const f = fixture(), observe = f.reader.observe, extract = f.extract; let revealed = false, reviewed = false;
  f.reader.observe = async () => {
    const observation = await observe();
    observation.page.controls = reviewed ? [] : [control({ name: "Explore opportunities", kind: "button", role: "button", value: "", options: [], visible: revealed })];
    return observation;
  };
  f.reader.reveal = async id => { assert.equal(id, "e0"); revealed = true; };
  f.extract = async input => {
    const result = await extract(input);
    if (input.controls.some(item => item.id === "e0" && item.visible)) { reviewed = true; return { ...result, irrelevantControls: ["e0"] }; }
    return result;
  };
  await scan(f); assert.equal(revealed, true); assert.equal(reviewed, true);
});
test("journal is isolated by workspace and revision, survives restart and retains old runs", async () => {
  const profile = path.join(folder, "logs"), journal = new BoardRuns(profile), run = checkpoint();
  const board = { id: run.boardId, revision: run.revision, url: run.url, instructions: run.instructions };
  run.jobs = [job()]; await journal.save(run);
  const restarted = new BoardRuns(profile); assert.equal(restarted.summary(run.workspace, board).status, "paused");
  assert.equal(restarted.latest(run.workspace, { ...board, lastCheckId: 1 }), null, "A later successful save supersedes unfinished recovery work");
  assert.equal(restarted.latest(run.workspace + ".other", board), null); assert.equal(restarted.latest(run.workspace, { ...board, revision: 2 }), null);
  await restarted.configure({ ...defaultBoardReaderSettings, automaticThorough: false }); assert.equal(new BoardRuns(profile).settings.automaticThorough, false);
  const second = checkpoint(); await restarted.save(second); assert.ok(await readFile(path.join(profile, "board-reader.json"), "utf8"));
  const { createHash } = await import("node:crypto"), key = createHash("sha256").update(JSON.stringify([path.resolve(run.workspace), run.boardId])).digest("hex");
  assert.ok(await readFile(path.join(profile, "board-runs", key, run.id + ".json"), "utf8"));
});
test("default service fallback establishes a zero-new baseline and later discovers only the delta", async () => {
  const profile = path.join(folder, "service"), store = new BoardsStore(profile); await store.create(path.join(folder, "boards.sqlite"));
  await store.add([{ company: "Fixture", url, instructions: "" }]);
  let inventory = [job(1)], fast = 0, thorough = 0, fail = false;
  const service = new BoardsService(store, { profile, selection: () => ({ provider: "openai", model: "fixture", thinkingLevel: "none" }),
    reader() { const f = fixture({ inventory }); return { thorough: { ...f.reader, async open() { thorough++; await f.reader.open(); } },
      async open() { fast++; throw new Error("The results did not finish loading"); }, close() {}, async read() {}, async next() {} }; },
    async extract(_selection, input) { if (fail) throw new Error("API key authentication failed"); return { value: await fixture({ inventory }).extract(input) }; }, changed() {} });
  const idle = async () => { for (let i = 0; i < 500 && service.busy; i++) await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(service.busy, false); };
  service.check(); await idle(); assert.equal(store.list()[0].newCount, 0); assert.equal(store.list()[0].totalCount, 1);
  inventory = [job(1), job(2)]; service.check(); await idle(); assert.equal(store.list()[0].newCount, 1); assert.equal(store.list()[0].totalCount, 2);
  assert.equal(fast, 2); assert.equal(thorough, 4); assert.equal(service.state.runs.length, 0);
  const previous = store.list()[0]; inventory = [job(1), job(2), job(3)]; fail = true;
  service.check(); await idle();
  assert.equal(store.list()[0].lastCheckId, previous.lastCheckId); assert.equal(store.list()[0].totalCount, 2); assert.equal(store.list()[0].newCount, 1);
  assert.equal(service.state.runs[0].canResume, true);
  fail = false; service.check([previous.id], { resume: true }); await idle();
  assert.equal(store.list()[0].totalCount, 3); assert.equal(store.list()[0].newCount, 2); assert.equal(service.state.runs.length, 0);
  await store.close();
});

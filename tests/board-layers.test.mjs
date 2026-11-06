import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";
import { boardExtractionInput, validatedBoardExtraction, boardModelContract } from "../shared/boards.ts";
import { openAIAnalysisInput, countOpenAIAnalysisInput } from "../desktop/openai-request.ts";
import { anthropicAnalysisInput, countAnthropicAnalysisInput } from "../desktop/anthropic-request.ts";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { creditOutputLimit } from "../shared/online-models.ts";

const folder = await mkdtemp(path.join(tmpdir(), "zebby-layers-"));
await build({ stdin: { contents: "export * from './desktop/board-feeds'; export * from './desktop/boards-scan'; export * from './desktop/boards-store'; export * from './desktop/boards-service'; export * from './desktop/ollama';", resolveDir: process.cwd() },
  outfile: path.join(folder, "layers.mjs"), bundle: true, platform: "node", format: "esm", target: "node22" });
const { boardFeed, readBoardFeed, scanBoard, BoardsStore, BoardsService, ollamaSupportsVision } = await import(pathToFileURL(path.join(folder, "layers.mjs")).href);
after(() => rm(folder, { recursive: true, force: true }));
const signal = () => new AbortController().signal;
const jpeg = await sharp({ create: { width: 320, height: 240, channels: 3, background: "white" } }).jpeg().toBuffer();
const candidate = { id: "l0", url: "https://example.org/jobs/1", text: "", title: "" };
const visual = { task: "visual", pageUrl: "https://example.org/jobs", pageTitle: "Careers", summary: "1 open job",
  image: { mediaType: "image/jpeg", data: jpeg.toString("base64"), width: 320, height: 240 }, candidates: [candidate], controls: [], atBottom: true, expectedTotal: 1 };
const visualResult = { listings: [{ id: "l0", title: "Senior Product Manager", department: "Product", location: "Seattle" }], nextControlId: "", expectedTotal: 1, empty: false, complete: true };

test("feed selection preserves supported filters and declines unknown filters or fragments", () => {
  for (const url of ["https://job-boards.greenhouse.io/twitch?department=product", "https://jobs.ashbyhq.com/example?department=Product",
    "https://jobs.lever.co/example?level=Senior", "https://jobs.lever.co/example#product", "https://jobs.lever.co/example?source=internal"]) assert.equal(boardFeed(url), null);
  const feed = boardFeed("https://jobs.eu.lever.co/example?team=Product&team=Design&location=Berlin&utm_source=test");
  assert.equal(new URL(feed.endpoint).hostname, "api.eu.lever.co");
  assert.deepEqual(new URL(feed.endpoint).searchParams.getAll("team"), ["Product", "Design"]);
  assert.equal(new URL(feed.endpoint).searchParams.get("location"), "Berlin");
});
test("Greenhouse verifies the entire feed and keeps location postings distinct", async () => {
  const feed = boardFeed("https://job-boards.greenhouse.io/twitch"), data = { meta: { total: 3 }, jobs: [
    { id: 1, internal_job_id: 9, title: "Product Manager", location: { name: "Seattle" } },
    { id: 2, internal_job_id: 9, title: "Product Manager", location: { name: "New York" } },
    { id: 3, internal_job_id: null, title: "Join our talent community" }] };
  const page = await readBoardFeed(feed, async () => Response.json(data), signal());
  assert.equal(page.complete, true); assert.equal(page.expectedTotal, 2); assert.equal(page.layer, "structured");
  assert.deepEqual(page.candidates.map(job => job.location), ["Seattle", "New York"]);
  await assert.rejects(readBoardFeed(feed, async () => Response.json({ ...data, meta: { total: 4 } }), signal()), /incomplete/);
  await assert.rejects(readBoardFeed(feed, async () => Response.json({ ...data, jobs: [data.jobs[0], data.jobs[0], data.jobs[2]] }), signal()), /incomplete/);
});
test("Lever collects short batches through an explicit empty end and rejects dropped filters or repeated IDs", async () => {
  const feed = boardFeed("https://jobs.lever.co/example?team=Product"), requests = [];
  const job = index => ({ id: "11111111-1111-4111-8111-" + String(index).padStart(12, "0"), text: "Product Manager", categories: { team: "Product", location: "Seattle" },
    hostedUrl: "https://jobs.lever.co/example/11111111-1111-4111-8111-" + String(index).padStart(12, "0") });
  const page = await readBoardFeed(feed, async url => { const skip = Number(new URL(url).searchParams.get("skip")); requests.push(skip); return Response.json(skip < 2 ? [job(skip + 1)] : []); }, signal());
  assert.deepEqual(requests, [0, 1, 2]); assert.equal(page.expectedTotal, 2);
  await assert.rejects(readBoardFeed(feed, async () => Response.json([job(1)]), signal()), /repeated/);
  await assert.rejects(readBoardFeed(feed, async () => Response.json([{ ...job(1), categories: { team: "Engineering" } }]), signal()), /filters/);
});
test("Ashby excludes unlisted jobs and rejects foreign posting URLs", async () => {
  const feed = boardFeed("https://jobs.ashbyhq.com/example");
  const job = { title: "Product Manager", jobUrl: "https://jobs.ashbyhq.com/example/11111111-1111-4111-8111-111111111111", isListed: true };
  const read = jobs => readBoardFeed(feed, async () => Response.json({ apiVersion: "1", jobs }), signal());
  assert.equal((await read([job, { ...job, isListed: false }])).expectedTotal, 1);
  await assert.rejects(read([{ ...job, jobUrl: job.jobUrl.replace("/example/", "/another/") }]), /outside/);
});
test("visual input validates real image dimensions and observed output IDs", () => {
  assert.equal(boardExtractionInput.parse(visual).task, "visual");
  for (const image of [{ ...visual.image, width: 900 }, { ...visual.image, mediaType: "image/png" }, { ...visual.image, data: "a".repeat(40) }]) {
    assert.equal(boardExtractionInput.safeParse({ ...visual, image }).success, false);
  }
  assert.deepEqual(validatedBoardExtraction(visualResult, visual), visualResult);
  for (const value of [{ ...visualResult, complete: false }, { ...visualResult, listings: [{ ...visualResult.listings[0], id: "invented" }] },
    { ...visualResult, nextControlId: "c9" }, { ...visualResult, empty: true }, { ...visualResult, expectedTotal: 2 }]) assert.throws(() => validatedBoardExtraction(value, visual));
  const inventory = { task: "inventory", pageUrl: visual.pageUrl, pageTitle: "Careers", candidates: [candidate] };
  assert.throws(() => validatedBoardExtraction({ decisions: {} }, inventory), /every observed link/);
  assert.deepEqual(validatedBoardExtraction({ decisions: { l0: "uncertain" } }, inventory).decisions, { l0: "uncertain" });
});
test("counting and generation use identical image inputs for both personal-key providers", async () => {
  for (const model of ["gpt-6-luna", "claude-haiku-5-5"]) {
    const contract = boardModelContract(visual), options = { model, key: "test", input: visual, ...contract, thinkingLevel: model.startsWith("gpt") ? "off" : "low", signal: signal() };
    const openai = model.startsWith("gpt"), request = openai ? openAIAnalysisInput(options) : anthropicAnalysisInput(options);
    const content = openai ? request.input[0].content : request.messages[0].content;
    assert.equal(content.filter(item => item.type.includes("image")).length, 1);
    assert.ok(!JSON.stringify(content.filter(item => item.type.includes("text"))).includes(visual.image.data));
    let counted;
    await (openai ? countOpenAIAnalysisInput : countAnthropicAnalysisInput)({ ...options, fetcher: async (_url, init) => {
      counted = JSON.parse(init.body); return Response.json({ input_tokens: 1200 }); } });
    let generated;
    await onlineAnalysis({ ...options, kind: "board_extract", fetcher: async (_url, init) => {
      generated = JSON.parse(init.body);
      return Response.json(openai ? { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(visualResult) }] }], usage: { input_tokens: 1200, output_tokens: 100 } }
        : { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(visualResult) }], usage: { input_tokens: 1200, output_tokens: 100 } });
    } });
    assert.deepEqual(openai ? generated.input : generated.messages, openai ? counted.input : counted.messages);
    assert.ok((generated.max_output_tokens || generated.max_tokens) >= 8192);
  }
  assert.ok(creditOutputLimit("board_extract", "off", true) >= 8192);
});
test("Ollama visual support is explicit and does not switch providers", async () => {
  for (const capabilities of [["completion", "vision"], ["completion"]]) assert.equal(
    await ollamaSupportsVision("http://localhost:11434", "selected", signal(), async () => Response.json({ capabilities })), capabilities.includes("vision"));
});

const rendered = { url: visual.pageUrl, title: "Careers", summary: "1 open job", candidates: [candidate], controls: [], expectedTotal: 1,
  pageNumber: 1, pageCount: 1, empty: false, blocked: false, loading: false, atBottom: true, scrollY: 0, height: 900, visualNeeded: true };
const options = reader => ({ url: visual.pageUrl, reader, signal: signal(), provider: "openai", model: "gpt-6-luna", instructions: "Senior Product Manager only", progress() {} });
function reader(input = visual) { return { closed: false, open: async () => {}, read: async () => rendered, next: async () => assert.fail("No next page"),
  async *visual() { yield input; }, close() { this.closed = true; } }; }
test("visual fallback enriches verified links before applying criteria, while incomplete or unsupported reads preserve history", async () => {
  const store = new BoardsStore(path.join(folder, "profile")); await store.create(path.join(folder, "Boards.sqlite"));
  const [id] = await store.add([{ company: "Example", url: visual.pageUrl, instructions: "Senior Product Manager only" }]);
  const tasks = [], extract = async input => {
    tasks.push(input.task);
    if (input.task === "inventory") return { decisions: { l0: "uncertain" } };
    if (input.task === "visual") return visualResult;
    assert.equal(input.task, "roles"); assert.equal(input.candidates[0].title, "Senior Product Manager");
    return { decisions: { l0: true } };
  };
  try {
    const result = await scanBoard({ ...options(reader()), extract });
    assert.deepEqual(tasks, ["inventory", "visual", "roles"]);
    await store.complete(id, 1, store.generation, result);
    const before = store.get(id); assert.equal(before.newCount, 0); assert.equal(before.checkedCount, 1);
    assert.equal(store.listings(id, before.lastCheckId).listings[0].title, "Senior Product Manager");
    await assert.rejects(scanBoard({ ...options(reader()), canUseVision: async () => false, extract }), /vision-capable/);
    await assert.rejects(scanBoard({ ...options(reader({ ...visual, atBottom: false })), extract }), /every part/);
    await assert.rejects(scanBoard({ ...options(reader()), extract: input => input.task === "visual" ? { ...visualResult, complete: false } : extract(input) }), /visual read/);
    assert.equal(store.get(id).lastCheckId, before.lastCheckId);
  } finally { await store.close(); }
});
test("inspection pagination and unread history survive failed checks, and stale check IDs are rejected", async () => {
  const store = new BoardsStore(path.join(folder, "inspection")); await store.create(path.join(folder, "Inspection.sqlite"));
  const [id] = await store.add([{ company: "Example", url: visual.pageUrl }]);
  const jobs = Array.from({ length: 61 }, (_, index) => ({ key: "job:" + index, url: "https://example.org/jobs/" + index, title: "Role " + String(index).padStart(3, "0"), matches: index % 2 === 0 }));
  const save = list => store.complete(id, 1, store.generation, { jobs: list, pages: 1, provider: "local", model: "test" });
  try {
    await save(jobs.slice(0, 1)); const baseline = store.get(id).lastCheckId; await save(jobs); const check = store.get(id).lastCheckId;
    assert.equal(store.listings(id, check, "all").listings.length, 50); assert.equal(store.listings(id, check, "all", 50).listings.length, 11);
    assert.equal(store.listings(id, check, "matches").total, 31); assert.equal(store.listings(id, check, "new").total, 30);
    assert.throws(() => store.listings(id, baseline), /newer check/);
    await store.failed(id, 1, store.generation, "Incomplete read"); assert.equal(store.listings(id, check, "all").total, 61);
    await save(jobs.slice(0, 1)); const newer = store.get(id).lastCheckId;
    assert.ok(store.listings(id, newer, "new").listings.every(job => !job.current));
    await store.reviewed(id, newer); assert.equal(store.listings(id, newer, "new").total, 0);
  } finally { await store.close(); }
});
test("insufficient funds during visual reading preserve the baseline and reuse completed paid viewports on retry", async () => {
  const profile = path.join(folder, "paid-visual"), store = new BoardsStore(profile);
  await store.create(path.join(folder, "Paid.sqlite"));
  const [id] = await store.add([{ company: "Example", url: visual.pageUrl }]);
  const second = { ...candidate, id: "l1", url: "https://example.org/jobs/2" };
  let funded = false; const paid = [];
  const service = new BoardsService(store, { profile, selection: () => ({ provider: "credits", model: "gpt-6-luna", thinkingLevel: "off" }), changed() {},
    reader: () => ({ open: async () => {}, read: async () => ({ ...rendered, expectedTotal: 2, candidates: [candidate, second] }), close() {}, next: async () => {},
      async *visual() { yield { ...visual, expectedTotal: 2, atBottom: false }; yield { ...visual, expectedTotal: 2, candidates: [second] }; } }),
    extract: async (_selected, input) => {
      if (input.task === "inventory") return { value: { decisions: { l0: "uncertain", l1: "uncertain" } } };
      paid.push(input.candidates[0].id);
      if (!funded && input.candidates[0].id === "l1") throw Object.assign(new Error("Top up"), { status: 402 });
      return { value: { ...visualResult, expectedTotal: 2, listings: [{ ...visualResult.listings[0], id: input.candidates[0].id }] } };
    },
  });
  const wait = async () => { while (service.busy) await new Promise(resolve => setTimeout(resolve, 10)); };
  try {
    service.check([id]); await wait(); assert.equal(store.get(id).lastCheckId, 0); assert.match(store.get(id).error, /Insufficient/);
    funded = true; service.check([id]); await wait();
    assert.deepEqual(paid, ["l0", "l1", "l1"]); assert.equal(store.get(id).checkedCount, 2); assert.equal(store.get(id).newCount, 0);
  } finally { await service.stop(); await store.close(); }
});

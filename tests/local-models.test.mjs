import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { LocalModelDownloads } from "../desktop/local-model-downloads.ts";
import { LOCAL_MODELS, getLocalModel } from "../desktop/local-model-catalog.ts";
import { basicEvidence, analyzeBasicLocal } from "../desktop/basic-local-analysis.ts";
import { runSelectedAnalysis } from "../desktop/analysis-routing.ts";
import { deleteDownloadedModel } from "../desktop/local-model-removal.ts";
import { localModelFolder } from "../desktop/local-model-storage.ts";
import { availableModelMemory, reclaimableMacMemory } from "../desktop/local-model-memory.ts";
import { acceptModelTerms, modelTermsAccepted } from "../desktop/local-model-consent.ts";
import { localModelMessages, localModelResponseSchema } from "../desktop/local-model-engine.ts";
import { planSchema, matchSchema } from "../desktop/analysis-contracts.ts";

test("licensed models need explicit agreement to the exact terms, and only SmolLM2 uses basic analysis", async () => {
  const original = {};
  for (const id of ["lfm25-350m", "gemma3-270m"]) {
    const item = getLocalModel(id);
    assert.equal(item.basic, false);
    assert.equal(modelTermsAccepted(item, original), false);
    assert.throws(() => acceptModelTerms(item, original), /Review and accept/);
    assert.throws(() => acceptModelTerms(item, original, "outdated terms"), /Review and accept/);
    const accepted = acceptModelTerms(item, original, item.license.version);
    assert.equal(modelTermsAccepted(item, accepted), true);
    assert.equal(acceptModelTerms(item, accepted), accepted);
    assert.deepEqual(original, {});
    const hash = createHash("sha256");
    for (const file of item.license.files) hash.update(await readFile(new URL(`../build/model-licenses/${file.source}`, import.meta.url)));
    assert.equal(hash.digest("hex"), item.license.version, "Terms changes must invalidate the earlier agreement.");
  }
  assert.deepEqual(LOCAL_MODELS.filter((item) => item.basic).map((item) => item.id), ["smollm2-360m"]);
  assert.equal(modelTermsAccepted(getLocalModel("qwen3-06b")), true);
});

test("Gemma's supported chat turns retain full instructions and input", () => {
  const instructions = "Use all supplied resume evidence. Do not invent skills or achievements.";
  const content = JSON.stringify({ jobDescription: "Full job text. ".repeat(4000), resumeText: "Full resume. ".repeat(4000) });
  const gemma = localModelMessages("gemma3-270m", instructions, content);
  assert.deepEqual(gemma.map((message) => message.role), ["user"]);
  assert.ok(gemma[0].content.startsWith(instructions));
  assert.ok(gemma[0].content.endsWith(content));
  const liquid = localModelMessages("lfm25-350m", instructions, content);
  assert.deepEqual(liquid, [{ role: "system", content: instructions }, { role: "user", content }]);
});

test("Gemma bounds repetitive output fields while retaining the entire source and other model contracts", () => {
  const input = { currentCvOverview: "Long CV overview. ".repeat(200), jobDescription: description.repeat(200), resumeText: resume.repeat(200) };
  const original = structuredClone(input);
  const schema = localModelResponseSchema("gemma3-270m", planSchema, input);
  assert.equal(schema.properties.overview.maxLength, input.currentCvOverview.length * 2);
  assert.equal(schema.properties.overviewRationale.maxLength, 600);
  assert.equal(schema.properties.keywords.items.maxLength, 80);
  assert.equal(schema.properties.themes.minItems, 5);
  assert.deepEqual(schema.properties.score, planSchema.properties.score);
  assert.equal(localModelResponseSchema("gemma3-270m", matchSchema, input).properties.explanation.maxLength, 800);
  assert.equal(planSchema.properties.overview.maxLength, undefined);
  assert.deepEqual(input, original);
  for (const model of LOCAL_MODELS.filter((item) => item.id !== "gemma3-270m")) {
    assert.equal(localModelResponseSchema(model.id, planSchema, input), planSchema);
    assert.equal(model.sampling, undefined);
  }
  assert.ok(getLocalModel("gemma3-270m").sampling.temperature > 0);
});

test("Mac model memory includes reclaimable pages without adding active or overlapping counters", async () => {
  const stats = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free: 10000.
Pages active: 900000.
Pages inactive: 150000.
Pages speculative: 20000.
Pages wired down: 200000.
Pages purgeable: 100000.
Pages occupied by compressor: 300000.
`;
  const expected = 180000 * 16384;
  assert.equal(reclaimableMacMemory(stats), expected);
  assert.equal(reclaimableMacMemory(stats.replace("16384", "4096")), 180000 * 4096);
  assert.equal(await availableModelMemory({ platform: "darwin", freeBytes: 10000 * 16384,
    totalBytes: 8 * 1024 ** 3, readMacStats: async () => stats }), expected);
  assert.ok(expected > LOCAL_MODELS[0].minimumFreeMemory);
  assert.equal(await availableModelMemory({ platform: "darwin", freeBytes: 100,
    totalBytes: 1000, readMacStats: async () => stats }), 1000);
});

test("unavailable Mac memory statistics preserve the conservative fallback and Windows avoids the command", async () => {
  assert.equal(reclaimableMacMemory("unknown output"), null);
  assert.equal(reclaimableMacMemory("page size of 16384 bytes\nPages free: 100."), null);
  for (const readMacStats of [async () => "unknown output", async () => { throw new Error("unavailable"); }]) {
    assert.equal(await availableModelMemory({ platform: "darwin", freeBytes: 123, readMacStats }), 123);
  }
  assert.equal(await availableModelMemory({ platform: "win32", freeBytes: 456,
    readMacStats: async () => { throw new Error("Windows must not run vm_stat."); } }), 456);
});

const bytes = Buffer.from("Synthetic model bytes for download lifecycle verification.");
const model = { ...LOCAL_MODELS[0], id: "fixture", filename: "fixture.gguf", bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"), url: "https://example.org/fixture.gguf" };
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "pm-model-test-"));
  const folder = path.join(root, "Models");
  const downloads = new LocalModelDownloads(folder, { models: [model], availableDiskBytes: async () => 1e9, ...options });
  t.after(async () => { await downloads.pause(); await rm(root, { recursive: true, force: true }); });
  await downloads.initialize();
  return { root, folder, downloads, file: downloads.filePath(model.id) };
}
async function until(condition) {
  const deadline = Date.now() + 3000;
  while (!condition()) { if (Date.now() > deadline) throw new Error("Test download did not reach the expected state."); await delay(10); }
}

test("a verified download is reused after restarting, and deletion preserves unrelated files", async (t) => {
  let requests = 0;
  const { root, folder, downloads, file } = await fixture(t, { fetcher: async () => { requests++; return new Response(bytes); } });
  const database = path.join(root, "Applications.sqlite");
  const unrelated = path.join(folder, "user-note.txt");
  await writeFile(database, "preserve application data"); await writeFile(unrelated, "preserve unrelated data");
  await downloads.start(model.id); await downloads.waitForDownload();
  assert.equal(downloads.status(model.id).status, "ready");
  assert.equal(await downloads.readyPath(model.id), file);
  assert.deepEqual(await readFile(file), bytes);
  const restarted = new LocalModelDownloads(folder, { models: [model], fetcher: async () => { throw new Error("Must reuse the download."); } });
  await restarted.initialize(); await restarted.start(model.id);
  assert.equal(restarted.status(model.id).status, "ready");
  await restarted.remove(model.id);
  assert.equal(restarted.status(model.id).status, "not-installed");
  assert.equal(await stat(file).catch(() => null), null);
  assert.equal(await readFile(database, "utf8"), "preserve application data");
  assert.equal(await readFile(unrelated, "utf8"), "preserve unrelated data");
  assert.equal(requests, 1);
});

test("licensed downloads keep full terms next to the model and deletion preserves other models' terms", async (t) => {
  const license = getLocalModel("gemma3-270m").license;
  const licensed = { ...model, license };
  const licensesFolder = path.resolve("build/model-licenses");
  const { folder, downloads } = await fixture(t, { models: [licensed], licensesFolder, fetcher: async () => new Response(bytes) });
  await writeFile(path.join(folder, "lfm25-350m-LICENSE.txt"), "preserve the other model's license");
  await writeFile(path.join(folder, "Applications.sqlite"), "preserve the user's database");
  await downloads.start(model.id); await downloads.waitForDownload();
  assert.equal(downloads.status(model.id).status, "ready");
  for (const file of license.files) {
    assert.deepEqual(await readFile(path.join(folder, file.filename)), await readFile(path.join(licensesFolder, file.source)));
  }
  await rm(path.join(folder, license.files[0].filename));
  await downloads.readyPath(model.id);
  assert.ok((await stat(path.join(folder, license.files[0].filename))).isFile());
  await downloads.remove(model.id);
  for (const file of license.files) assert.equal(await stat(path.join(folder, file.filename)).catch(() => null), null);
  assert.equal(await readFile(path.join(folder, "lfm25-350m-LICENSE.txt"), "utf8"), "preserve the other model's license");
  assert.equal(await readFile(path.join(folder, "Applications.sqlite"), "utf8"), "preserve the user's database");
});

test("pause saves partial bytes and a restarted manager resumes with Range", async (t) => {
  const { folder, downloads, file } = await fixture(t, { fetcher: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(bytes.subarray(0, 12)); },
  })) });
  await downloads.start(model.id);
  await until(() => downloads.status(model.id).downloadedBytes === 12);
  await downloads.pause();
  assert.equal(downloads.status(model.id).status, "paused");
  const restarted = new LocalModelDownloads(folder, { models: [model], availableDiskBytes: async () => 1e9,
    fetcher: async (_url, options) => { assert.equal(options.headers.Range, "bytes=12-");
      return new Response(bytes.subarray(12), { status: 206, headers: { "Content-Range": `bytes 12-${bytes.length - 1}/${bytes.length}` } }); } });
  t.after(() => restarted.pause());
  await restarted.initialize(); assert.equal(restarted.status(model.id).status, "paused");
  await restarted.start(model.id); await restarted.waitForDownload();
  assert.equal(restarted.status(model.id).status, "ready"); assert.deepEqual(await readFile(file), bytes);
});

test("a server ignoring Range replaces the partial download rather than appending", async (t) => {
  const { downloads, file } = await fixture(t, { fetcher: async () => new Response(bytes) });
  await writeFile(`${file}.part`, bytes.subarray(0, 12));
  await downloads.initialize(); await downloads.start(model.id); await downloads.waitForDownload();
  assert.equal(downloads.status(model.id).status, "ready"); assert.deepEqual(await readFile(file), bytes);
});

test("bad resumed ranges, insufficient disk space, and corrupt data never become ready", async (t) => {
  const cases = [
    { options: { fetcher: async () => new Response(bytes.subarray(12), { status: 206,
      headers: { "Content-Range": `bytes 3-${bytes.length - 1}/${bytes.length}` } }) }, partial: true, message: /resume safely/ },
    { options: { availableDiskBytes: async () => 0, fetcher: async () => { throw new Error("Must check disk first."); } }, message: /disk space/ },
    { options: { fetcher: async () => new Response(Buffer.alloc(bytes.length)) }, message: /integrity check/ },
    { options: { fetcher: async () => new Response(bytes.subarray(0, 5)) }, message: /stopped early/ },
  ];
  for (const item of cases) {
    const { downloads, file } = await fixture(t, item.options);
    if (item.partial) await writeFile(`${file}.part`, bytes.subarray(0, 12));
    await downloads.start(model.id); await downloads.waitForDownload();
    assert.equal(downloads.status(model.id).status, "error");
    assert.match(downloads.status(model.id).error, item.message);
    assert.equal(await stat(file).catch(() => null), null);
    await assert.rejects(downloads.readyPath(model.id), /Finish downloading/);
  }
});

test("changed verified files and unknown model paths are rejected", async (t) => {
  const { downloads, file } = await fixture(t, { fetcher: async () => new Response(bytes) });
  await downloads.start(model.id); await downloads.waitForDownload();
  await writeFile(`${file}.verified.json`, JSON.stringify({ bytes: bytes.length, sha256: "wrong", mtimeMs: (await stat(file)).mtimeMs }));
  await assert.rejects(downloads.readyPath(model.id), /file changed/);
  await assert.rejects(downloads.start("../Applications.sqlite"), /Choose a built-in model/);
  await assert.rejects(downloads.remove("../Applications.sqlite"), /Choose a built-in model/);
});

test("a damaged model folder is reported without preventing app startup", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-model-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = path.join(root, "Models"); await writeFile(folder, "occupied by an unrelated file");
  const downloads = new LocalModelDownloads(folder, { models: [model] });
  await downloads.initialize();
  assert.equal(downloads.status(model.id).status, "error");
  await assert.rejects(downloads.readyPath(model.id), /Finish downloading/);
  assert.equal(await readFile(folder, "utf8"), "occupied by an unrelated file");
});

test("rapid model changes pause earlier transfers and delete cancels active writes", async (t) => {
  const second = { ...model, id: "second", filename: "second.gguf" };
  const { downloads, folder } = await fixture(t, { models: [model, second], fetcher: async () =>
    new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 12)); } })) });
  await downloads.start(model.id);
  await until(() => downloads.status(model.id).downloadedBytes === 12);
  await downloads.start(second.id);
  assert.equal(downloads.status(model.id).status, "paused");
  await until(() => downloads.status(second.id).downloadedBytes === 12);
  await downloads.remove(second.id);
  assert.equal(downloads.status(second.id).status, "not-installed");
  assert.equal(await stat(path.join(folder, "second.gguf.part")).catch(() => null), null);
});

test("model deletion defaults to Cancel, releases the engine on confirmation, and blocks analysis races", async () => {
  const calls = [];
  const engine = { busy: false, modelId: "smollm2-360m", stop: async () => { calls.push("stop"); } };
  const downloads = { remove: async (id) => { calls.push(`remove ${id}`); } };
  const confirm = async (dialog) => { assert.equal(dialog.defaultId, 0); assert.equal(dialog.cancelId, 0);
    assert.deepEqual(dialog.buttons, ["Cancel", "Delete model"]); assert.doesNotMatch(dialog.message, /uninstall/i); return false; };
  assert.equal(await deleteDownloadedModel("smollm2-360m", { engine, downloads, confirm }), false);
  assert.deepEqual(calls, []);
  assert.equal(await deleteDownloadedModel("smollm2-360m", { engine, downloads, confirm: async () => true }), true);
  assert.deepEqual(calls, ["stop", "remove smollm2-360m"]);
  calls.length = 0;
  await assert.rejects(deleteDownloadedModel("smollm2-360m", { engine, downloads,
    confirm: async () => { engine.busy = true; return true; } }), /Wait for local analysis/);
  assert.deepEqual(calls, []);
});

test("model storage is local to each OS and the Windows cleanup hook targets only catalog files", async () => {
  assert.equal(localModelFolder("C:\\Users\\Test\\AppData\\Roaming\\pm-application-tracker", "win32", "C:\\Users\\Test\\AppData\\Local"),
    "C:\\Users\\Test\\AppData\\Local\\PM Application Tracker\\Models");
  assert.equal(localModelFolder("/Users/test/Library/Application Support/pm-application-tracker", "darwin"),
    path.join("/Users/test/Library/Application Support/pm-application-tracker", "Models"));
  const cleanup = await readFile(new URL("../build/model-cleanup.nsh", import.meta.url), "utf8");
  assert.doesNotMatch(cleanup, /RMDir\s+\/r/i);
  assert.match(cleanup, /\$\{ifNot\}\s+\$\{isUpdated\}/);
  for (const item of LOCAL_MODELS) {
    for (const suffix of ["", ".part", ".verified.json"]) assert.ok(cleanup.includes(`\\${item.filename}${suffix}"`));
    for (const file of item.license?.files || []) assert.ok(cleanup.includes(`\\${file.filename}"`));
  }
  assert.doesNotMatch(cleanup, /\*|\.sqlite|\.db|backups/i);
});

const description = "Product strategy, customer discovery, roadmap, analytics, SQL, experimentation, stakeholder management and cross-functional collaboration. Prioritization, leadership, communication, agile and product delivery are core responsibilities.";
const resume = "I use customer discovery and product strategy to build a roadmap. I lead cross-functional collaboration, analytics and experimentation, and use SQL for prioritization. I have experience in stakeholder management and product delivery.";
const currentCvOverview = "I use customer discovery and product strategy to build a roadmap with cross-functional teams.";

test("SmolLM2's basic score uses resume evidence and is consistent between Plan and Applications", async () => {
  const input = { jobDescription: description, resumeText: resume, currentCvOverview };
  const evidence = basicEvidence(description, resume);
  assert.ok(evidence.keywords.length >= 6 && evidence.keywords.length <= 20);
  assert.equal(evidence.themes.length, 6);
  assert.ok(evidence.matched.includes("SQL")); assert.ok(evidence.missing.includes("Leadership"));
  assert.equal(evidence.score, Math.round(evidence.matched.length / evidence.keywords.length * 100));
  const match = await analyzeBasicLocal(input, false, async () => { throw new Error("Keyword coverage needs no generation."); });
  const plan = await analyzeBasicLocal(input, true, async () => ({ overview: currentCvOverview }));
  assert.equal(match.score, plan.score); assert.match(match.explanation, /Basic keyword coverage/);
  assert.equal(plan.overview, currentCvOverview); assert.match(plan.overviewRationale, /retained/);
});

test("the compact overview rejects unsupported metrics and retains the original with an honest rationale", async () => {
  const result = await analyzeBasicLocal({ jobDescription: description, resumeText: resume, currentCvOverview }, true,
    async () => ({ overview: "I drive 75% growth using customer discovery and product strategy to build a roadmap with cross-functional teams." }));
  assert.equal(result.overview, currentCvOverview); assert.match(result.overviewRationale, /did not produce a supported/);
});

test("keyword evidence accepts sentence punctuation and aliases without matching partial words", () => {
  const result = basicEvidence("Analytics, SQL, stakeholder management, prioritization and experimentation are required.",
    "I use analytics. I use SQL. I lead stakeholder management. I do prioritization. I run A/B testing.");
  for (const term of ["Analytics", "SQL", "Stakeholder management", "Prioritization", "Experimentation"]) {
    assert.ok(result.matched.includes(term), `${term} should match before punctuation or through a listed alias.`);
  }
  assert.ok(basicEvidence("SQL is required.", "I used PostgreSQL.").missing.includes("SQL"));
});

test("OpenAI, Ollama, and every full-profile built-in model receive the complete request without fallback", async () => {
  const input = { jobDescription: description.repeat(300), resumeText: resume.repeat(200), currentCvOverview };
  const schema = { type: "object", properties: { evidence: { type: "string" } } };
  const selections = [{ provider: "openai", builtInModelId: "qwen3-4b" }, { provider: "ollama", builtInModelId: "qwen3-4b" },
    ...LOCAL_MODELS.filter((model) => !model.basic).map((model) => ({ provider: "builtin", builtInModelId: model.id }))];
  for (const { provider, builtInModelId } of selections) {
    let called = "";
    const providers = {
      openai: async (prompt, content, name, format) => { called = "openai"; assert.equal(prompt, "Complete instructions");
        assert.equal(content, input); assert.equal(name, "resume_plan"); assert.equal(format, schema); return { evidence: "full" }; },
      ollama: async (url, modelId, prompt, content, format) => { called = "ollama"; assert.equal(url, "http://gpu-pc:11434");
        assert.equal(modelId, "qwen3.8:27b"); assert.equal(prompt, "Complete instructions"); assert.equal(content, input); assert.equal(format, schema); return { evidence: "full" }; },
      ready: async (id) => { assert.equal(id, builtInModelId); },
      local: async (id, prompt, content, format) => { called = "builtin"; assert.equal(id, builtInModelId);
        assert.equal(prompt, "Complete instructions"); assert.equal(content, input); assert.equal(format, schema); return { evidence: "full" }; },
    };
    const selected = { provider, ollamaUrl: "http://gpu-pc:11434", ollamaModel: "qwen3.8:27b", builtInModelId };
    assert.deepEqual(await runSelectedAnalysis(selected, providers, "Complete instructions", input, "resume_plan", schema, "Failure"), { evidence: "full" });
    assert.equal(called, provider);
    providers[provider === "builtin" ? "local" : provider] = async () => { throw new Error("Selected provider unavailable"); };
    await assert.rejects(runSelectedAnalysis(selected, providers, "Complete instructions", input, "resume_plan", schema, "Failure"), /Selected provider unavailable/);
  }
  assert.equal(getLocalModel("smollm2-360m").basic, true);
  assert.ok(LOCAL_MODELS.filter((item) => item.id !== "smollm2-360m").every((item) => !item.basic));
});

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalModelDownloads } from "../desktop/local-model-downloads.ts";
import { LocalModelEngine } from "../desktop/local-model-engine.ts";
import { analyzeBasicLocal } from "../desktop/basic-local-analysis.ts";
import { getLocalModel } from "../desktop/local-model-catalog.ts";
import { planInstructions, planSchema, matchInstructions, matchSchema } from "../desktop/analysis-contracts.ts";
import { prepareRuntime } from "./download-llama.mjs";

// Hidden native processes and synthetic source text only. No Electron window,
// user settings, real resume, or selected SQLite database is opened.
const id = process.argv[2] || "smollm2-360m";
const model = getLocalModel(id);
const output = path.resolve("work/local-engine-qa");
await mkdir(output, { recursive: true });
const packaged = process.argv.includes("--packaged");
if (!packaged) await prepareRuntime(process.platform, process.arch);
const platformFolder = `${process.platform === "darwin" ? "mac" : "win"}-${process.arch}`;
const resources = process.platform === "darwin"
  ? path.resolve("desktop-packages/mac-arm64/PM Application Tracker.app/Contents/Resources")
  : path.resolve(`desktop-packages/${process.arch === "arm64" ? "win-arm64-unpacked" : "win-unpacked"}/resources`);
let lastStatus = "";
const downloads = new LocalModelDownloads(path.join(output, "Models"), {
  licensesFolder: packaged ? path.join(resources, "local-runtime/model-licenses") : path.resolve("build/model-licenses"), onChange: () => {
  const status = downloads.status(id).status;
  if (status !== lastStatus) { lastStatus = status; console.log(`${model.name}: ${status}`); }
} });
await downloads.initialize();
await downloads.start(id); await downloads.waitForDownload();
assert.equal(downloads.status(id).status, "ready", downloads.status(id).error);
const engine = new LocalModelEngine({ downloads,
  runtimeFolder: packaged ? path.join(resources, "local-runtime") : path.resolve("build/llama", platformFolder),
  workerPath: packaged ? path.join(resources, "app.asar/desktop-dist/local-runtime-worker.cjs")
    : path.resolve("desktop-dist/local-runtime-worker.cjs"),
  fetcher: async (url, options) => {
    const response = await fetch(url, options);
    if (String(url).endsWith("/v1/chat/completions")) {
      const result = await response.clone().json();
      // Synthetic QA data only, retained for diagnosing generation failures.
      await writeFile(path.join(output, `${id}-response.json`), JSON.stringify(result, null, 2));
    }
    return response;
  } });
const jobDescription = "We are hiring a product manager to lead product strategy and customer discovery. Responsibilities: own the roadmap and prioritization, use analytics and SQL to evaluate product metrics, plan experimentation and A/B testing, communicate technical requirements, and align stakeholders through cross-functional collaboration. Qualifications: product delivery, user research, stakeholder management, agile execution and customer experience. Experience with developer tools is preferred.";
const resumeText = "Alex Example\nProduct Manager\nI lead product strategy and customer discovery to build developer tools. I own a roadmap, use analytics and SQL for product metrics, and use experimentation for prioritization. I work with engineering and design in cross-functional collaboration and stakeholder management. I have delivered agile releases, conducted user research, and improved customer experience. My experience is strongest in product delivery and discovery; I have not managed a people team.";
const currentCvOverview = "I lead product strategy and customer discovery to build useful developer tools. I work with engineering and design to prioritize a roadmap and measure customer outcomes.";
const input = { jobDescription, resumeText, currentCvOverview };
const started = Date.now();
try {
  const generate = (...args) => engine.analyze(id, ...args);
  console.log(`${model.name}: running Plan`);
  const plan = model.basic ? await analyzeBasicLocal(input, true, generate)
    : await generate(planInstructions, input, planSchema);
  console.log(`${model.name}: running match`);
  const match = model.basic ? await analyzeBasicLocal(input, false, generate)
    : await generate(matchInstructions, { jobDescription, resumeText }, matchSchema);
  assert.ok(plan.keywords.length >= 6 && plan.keywords.length <= 20);
  assert.ok(plan.themes.length >= 5 && plan.themes.length <= 6);
  assert.ok(plan.overview && plan.overviewRationale);
  assert.ok(Number.isInteger(plan.score) && plan.score >= 0 && plan.score <= 100);
  assert.ok(Number.isInteger(match.score) && match.score >= 0 && match.score <= 100 && match.explanation);
  const engineUrl = engine.baseUrl;
  const unauthorized = await fetch(`${engineUrl}/v1/chat/completions`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }) });
  assert.equal(unauthorized.status, 401, "The native engine must require the app's random secret.");
  await engine.stop();
  await assert.rejects(fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(2000) }));
  await writeFile(path.join(output, `${id}.json`), JSON.stringify({ model: model.name,
    seconds: Math.round((Date.now() - started) / 1000), plan, match, authentication: "required", shutdown: "verified" }, null, 2));
  console.log(`${model.name}: Plan, match, authenticated loopback access, and shutdown passed (${Math.round((Date.now() - started) / 1000)} seconds).`);
} finally { await downloads.pause(); await engine.shutdown(); }

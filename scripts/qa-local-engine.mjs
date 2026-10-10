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
  ? path.resolve("desktop-packages/mac-arm64/Zebby.app/Contents/Resources")
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
const events = [];
const engine = new LocalModelEngine({ downloads,
  runtimeFolder: packaged ? path.join(resources, "local-runtime") : path.resolve("build/llama", platformFolder),
  workerPath: packaged ? path.join(resources, "app.asar/desktop-dist/local-runtime-worker.cjs")
    : path.resolve("desktop-dist/local-runtime-worker.cjs"),
  onDiagnostic: (message, error) => {
    events.push({ time: new Date().toISOString(), message, error: error instanceof Error ? error.message : undefined });
    console.log(message, error instanceof Error ? error.message : "");
  },
});
let jobDescription = "We are hiring a product manager to lead product strategy and customer discovery. Responsibilities: own the roadmap and prioritization, use analytics and SQL to evaluate product metrics, plan experimentation and A/B testing, communicate technical requirements, and align stakeholders through cross-functional collaboration. Qualifications: product delivery, user research, stakeholder management, agile execution and customer experience. Experience with developer tools is preferred.";
let resumeText = "Alex Example\nProduct Manager\nI lead product strategy and customer discovery to build developer tools. I own a roadmap, use analytics and SQL for product metrics, and use experimentation for prioritization. I work with engineering and design in cross-functional collaboration and stakeholder management. I have delivered agile releases, conducted user research, and improved customer experience. My experience is strongest in product delivery and discovery; I have not managed a people team.";
if (process.argv.includes("--long-input")) {
  jobDescription += "\n\nResponsibilities\n" + Array.from({ length: 18 }, (_, index) =>
    `• Initiative ${index + 1}: Lead customer discovery for developer tools, define technical requirements with engineering, prioritize the product roadmap, and evaluate adoption with analytics and SQL. Partner with design and stakeholders through delivery and experimentation.\n`).join("");
  resumeText += "\n\nExperience\n" + Array.from({ length: 30 }, (_, index) =>
    `Project ${index + 1}: Interviewed customers and used product metrics to prioritize a developer-tools roadmap. Worked with engineering and design on technical requirements and agile product delivery. Used SQL for analytics and planned experimentation to evaluate customer experience.\n`).join("");
}
const currentCvOverview = "I lead product strategy and customer discovery to build useful developer tools. I work with engineering and design to prioritize a roadmap and measure customer outcomes.";
const input = { jobDescription, resumeText, currentCvOverview };
const started = Date.now();
try {
  const generate = (...args) => engine.analyze(id, ...args);
  console.log(`${model.name}: running Plan (${jobDescription.length} job characters, ${resumeText.length} resume characters)`);
  const plan = model.basic ? await analyzeBasicLocal(input, true, generate)
    : await generate(planInstructions, input, planSchema);
  console.log(`${model.name}: running match`);
  const match = model.basic ? await analyzeBasicLocal(input, false, generate)
    : await generate(matchInstructions, { jobDescription, resumeText }, matchSchema);
  assert.ok(plan.keywords.length >= 6 && plan.keywords.length <= 20);
  assert.ok(plan.themes.length >= 5 && plan.themes.length <= 6);
  for (const item of [...plan.keywords, ...plan.themes]) {
    assert.ok(typeof item.text === "string" && item.text.trim());
    assert.ok(Number.isInteger(item.importance) && item.importance >= 0 && item.importance <= 100);
  }
  assert.ok(plan.overview && plan.overviewRationale && plan.explanation);
  assert.ok(Number.isInteger(plan.score) && plan.score >= 0 && plan.score <= 100);
  assert.ok(Number.isInteger(match.score) && match.score >= 0 && match.score <= 100 && match.explanation);
  const engineUrl = engine.baseUrl;
  const unauthorized = await fetch(`${engineUrl}/v1/chat/completions`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }) });
  assert.equal(unauthorized.status, 401, "The native engine must require the app's random secret.");
  await engine.stop();
  await assert.rejects(fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(2000) }));
  await writeFile(path.join(output, `${id}.json`), JSON.stringify({ model: model.name,
    seconds: Math.round((Date.now() - started) / 1000), plan, match, events, authentication: "required", shutdown: "verified" }, null, 2));
  console.log(`${model.name}: Plan, match, authenticated loopback access, and shutdown passed (${Math.round((Date.now() - started) / 1000)} seconds).`);
} catch (error) {
  await writeFile(path.join(output, `${id}-response.json`), JSON.stringify({ model: model.name, events,
    error: error instanceof Error ? error.stack || error.message : String(error),
    jobCharacters: jobDescription.length, resumeCharacters: resumeText.length }, null, 2));
  throw error;
} finally { await downloads.pause(); await engine.shutdown(); }

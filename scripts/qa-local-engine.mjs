import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify, stripVTControlCharacters } from "node:util";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashModelFile, LocalModelDownloads } from "../desktop/local-model-downloads.ts";
import { LocalModelEngine } from "../desktop/local-model-engine.ts";
import { detectLocalCompute } from "../desktop/local-compute-detection.ts";
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
const reportName = id + (packaged ? "-packaged" : "") + (process.argv.includes("--long-input") ? "-long" : "");
if (!packaged) await prepareRuntime(process.platform, process.arch);
const platformFolder = `${process.platform === "darwin" ? "mac" : "win"}-${process.arch}`;
const resources = process.platform === "darwin"
  ? path.resolve("desktop-packages/mac-arm64/Zebby.app/Contents/Resources")
  : path.resolve(`desktop-packages/${process.arch === "arm64" ? "win-arm64-unpacked" : "win-unpacked"}/resources`);
let lastStatus = "";
// Optional read-only source for a previously downloaded model. All QA writes
// still stay inside work/local-engine-qa, never the user's model directory.
if (process.env.ZEBBY_QA_MODEL_FILE) {
  await mkdir(path.join(output, "Models"), { recursive: true });
  const target = path.join(output, "Models", model.filename);
  await copyFile(path.resolve(process.env.ZEBBY_QA_MODEL_FILE), target);
  assert.equal(await hashModelFile(target), model.sha256);
  const file = await stat(target);
  assert.equal(file.size, model.bytes);
  await writeFile(`${target}.verified.json`, JSON.stringify({ sha256: model.sha256, bytes: file.size, mtimeMs: file.mtimeMs }));
}
const downloads = new LocalModelDownloads(path.join(output, "Models"), {
  licensesFolder: packaged ? path.join(resources, "local-runtime/model-licenses") : path.resolve("build/model-licenses"), onChange: () => {
  const status = downloads.status(id).status;
  if (status !== lastStatus) { lastStatus = status; console.log(`${model.name}: ${status}`); }
} });
await downloads.initialize();
await downloads.start(id); await downloads.waitForDownload();
assert.equal(downloads.status(id).status, "ready", downloads.status(id).error);
const events = [], probes = [];
const execute = promisify(execFile);
function verifyCompute() {
  assert.ok(probes.length, "Native device discovery must run before inference.");
  for (const probe of probes) {
    assert.equal(probe.status, "ready", "Native device discovery failed: " + JSON.stringify(probe));
    if (probe.accelerator) {
      assert.ok(probe.output.includes("Available devices:"), "The native device list must be present.");
      if (probe.deviceIds.length) {
        assert.equal(probe.backend, probe.accelerator, "Zebby ignored a GPU reported by its native runtime.");
        assert.ok(probe.deviceIds.includes(probe.selectedDevice), "Selected device must match a native identifier.");
      } else assert.match(probe.output, /^\s*\(none\)\s*$/m, "Missing GPUs must be explicit in native output.");
    }
  }
  if (probes.some(probe => probe.deviceIds.length) || process.argv.includes("--require-gpu")) {
    assert.notEqual(engine.backend, "cpu", "Inference fell back to CPU despite a reported GPU.");
    assert.ok(engine.offloadedLayers > 0, "The native runtime must confirm GPU layer offload.");
  }
}
const engine = new LocalModelEngine({ downloads,
  detectCompute: async (runtime, options) => {
    let nativeOutput = "";
    const compute = await detectLocalCompute(runtime, { ...options,
      execute: async (executable, args, execOptions) => {
        const result = await execute(executable, args, execOptions);
        if (args.includes("--list-devices")) nativeOutput = stripVTControlCharacters([result.stdout, result.stderr].filter(Boolean).join("\n"));
        return result;
      },
    });
    // Independently inspect native IDs. Reusing the app parser here would
    // let a new backend prefix silently pass every inference check on CPU.
    const deviceIds = [...nativeOutput.matchAll(/^\s*([\w-]+):[^\n]+\(\d+ MiB, \d+ MiB free\)\s*$/gm)].map(match => match[1]);
    probes.push({ accelerator: runtime.accelerator?.backend, status: compute.status, backend: compute.backend,
      deviceIds, selectedDevice: compute.devices[0]?.id, output: nativeOutput.slice(0, 8192) });
    console.log("Native device check: " + (compute.status !== "ready" ? "probe failed" : deviceIds.join(", ") || "no GPU reported; CPU checks only"));
    return compute;
  },
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
  const generate = async (...args) => {
    const result = await engine.analyze(id, ...args);
    verifyCompute();
    return result;
  };
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
  verifyCompute();
  if (process.argv.includes("--thinking")) {
    assert.equal(model.supportsThinking, true, "The thinking check requires a supported model.");
    console.log(`${model.name}: checking thinking-enabled structured output`);
    const thoughtMatch = await engine.analyze(id, "Compare the resume evidence with the role. Return a score from 0 to 100 and one short explanation. Do not claim experience absent from the resume.",
      { jobDescription, resumeText }, matchSchema, 800, undefined, "on");
    verifyCompute();
    assert.ok(Number.isInteger(thoughtMatch.score) && thoughtMatch.score >= 0 && thoughtMatch.score <= 100 && thoughtMatch.explanation);
    assert.ok(events.some((event) => event.message.includes("first token")), "Thinking generation must report progress.");
  }
  const engineUrl = engine.baseUrl;
  const unauthorized = await fetch(`${engineUrl}/v1/chat/completions`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }) });
  assert.equal(unauthorized.status, 401, "The native engine must require the app's random secret.");
  await engine.stop();
  await assert.rejects(fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(2000) }));
  await writeFile(path.join(output, `${reportName}.json`), JSON.stringify({ model: model.name,
    seconds: Math.round((Date.now() - started) / 1000), backend: engine.backend, offloadedLayers: engine.offloadedLayers,
    gpuCheck: probes.some(probe => probe.deviceIds.length) ? "offload verified" : "unavailable on this host",
    probes, plan, match, events, authentication: "required", shutdown: "verified" }, null, 2));
  console.log(`${model.name}: Plan, match, authenticated loopback access, and shutdown passed (${Math.round((Date.now() - started) / 1000)} seconds).`);
} catch (error) {
  await writeFile(path.join(output, `${reportName}-response.json`), JSON.stringify({ model: model.name, events, probes,
    error: error instanceof Error ? error.stack || error.message : String(error),
    jobCharacters: jobDescription.length, resumeCharacters: resumeText.length }, null, 2));
  throw error;
} finally { await downloads.pause(); await engine.shutdown(); }

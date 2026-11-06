import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { cpus, homedir, totalmem } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { LocalModelEngine } from "../desktop/local-model-engine.ts";
import { getLocalModel } from "../desktop/local-model-catalog.ts";
import { hashModelFile } from "../desktop/local-model-downloads.ts";
import { availableModelMemory } from "../desktop/local-model-memory.ts";
import { localTaskOutputBudget } from "../desktop/local-inference-policy.ts";
import { planInstructions, planSchema, matchInstructions, matchSchema } from "../desktop/analysis-contracts.ts";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback = "") => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
if (process.argv.includes("--help")) {
  console.log("npm run benchmark:local -- --model qwen3-14b --thinking on --require-gpu\nOptions: --model-file PATH, --repeat 2, --idle-check, --output FOLDER\nMLX comparison: --backend mlx --mlx-model LOCAL_FOLDER --thinking on\nDownloads are managed in Zebby Settings. This command uses existing model files.");
  process.exit(0);
}
const backend = arg("--backend", "llama"), thinking = arg("--thinking", "off");
if (!["llama", "mlx"].includes(backend) || !["off", "on"].includes(thinking)) throw new Error("Choose llama or mlx, and thinking on or off.");
const repeats = Number(arg("--repeat", "2"));
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error("Repeat must be between 1 and 5.");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.resolve(arg("--output", path.join(root, "work/local-benchmarks", stamp)));
await mkdir(output, { recursive: true });

const resumeText = "Alex Example\nProduct Manager, Northstar Tools, 2020-2026. Six years delivering developer tools. Led customer interviews, product strategy and roadmap prioritization with engineering and design. Used SQL and experiments to measure activation. Increased activation by 12%. Has no direct experience training machine learning models or managing people. BA Economics.";
const currentCvOverview = "Product manager with six years building developer tools. I combine customer discovery, SQL analysis and cross-functional delivery to improve activation.";
const productJob = "Product Manager, Developer Tools. Own customer discovery and product strategy. Prioritize the roadmap with engineering and design, define success metrics, and use SQL and experiments to improve activation. Requires four years of product delivery experience. People management is not required. Experience with developer tools is preferred.";
const researchJob = "Principal Research Scientist, Foundation Models. Requires a PhD in machine learning, ten years of research, peer-reviewed publications, and hands-on experience training large language models. Lead distributed pretraining using CUDA and C++, develop new model architectures, and manage a research team. Product roadmap ownership alone does not meet the requirements.";
const tasks = [
  { id: "plan", kind: "resume_plan", instructions: planInstructions, schema: planSchema, input: { jobDescription: productJob, resumeText, currentCvOverview } },
  { id: "match-aligned", kind: "resume_match", instructions: matchInstructions, schema: matchSchema, input: { jobDescription: productJob, resumeText } },
  { id: "match-gaps", kind: "resume_match", instructions: matchInstructions, schema: matchSchema, input: { jobDescription: researchJob, resumeText } },
];
const machine = { platform: process.platform, arch: process.arch, chip: cpus()[0]?.model, logicalCores: cpus().length, totalMemory: totalmem() };
const report = { date: new Date().toISOString(), backend, thinking, machine, runs: [], checks: {}, events: [] };
const tasksFile = path.join(output, "requests.json");
await writeFile(tasksFile, JSON.stringify(tasks.map(task => ({ ...task, maxTokens: localTaskOutputBudget(task.kind) + (thinking === "on" ? 4096 : 0) })), null, 2));

function validate(task, result) {
  assert.ok(result && typeof result === "object");
  assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
  assert.ok(typeof result.explanation === "string" && result.explanation.trim());
  if (task.id === "plan") {
    assert.ok(result.keywords.length >= 6 && result.keywords.length <= 20);
    assert.ok(result.themes.length >= 5 && result.themes.length <= 6);
    for (const item of [...result.keywords, ...result.themes]) {
      assert.ok(item.text?.trim() && Number.isInteger(item.importance) && item.importance >= 0 && item.importance <= 100);
    }
    assert.ok(result.overview?.trim() && result.overviewRationale?.trim());
    assert.ok(!/PhD|Ph\.D|CUDA|trained.*(?:LLM|language model)|managed.*research team/i.test(result.overview), "Summary invents a credential or experience");
    for (const number of result.overview.match(/\d+(?:\.\d+)?/g) || []) {
      assert.ok(["6", "12", "2020", "2026"].includes(number), "Summary invents a numeric claim: " + number);
    }
  }
}

let engine;
try {
  if (backend === "mlx") {
    if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("The MLX comparison requires an Apple Silicon Mac.");
    const mlxModel = path.resolve(arg("--mlx-model"));
    if (!arg("--mlx-model") || !(await stat(mlxModel)).isDirectory()) throw new Error("Provide an already downloaded MLX model folder.");
    const resultPath = path.join(output, "mlx-results.json");
    const python = arg("--python", "python3");
    await execute(python, [path.join(root, "scripts/benchmark-mlx.py"), "--model", mlxModel, "--requests", tasksFile,
      "--output", resultPath, "--thinking", thinking, "--repeat", String(repeats)], {
      timeout: 60 * 60_000, maxBuffer: 1024 * 1024, env: { ...process.env, HF_HUB_OFFLINE: "1", TOKENIZERS_PARALLELISM: "false" },
    });
    const mlx = JSON.parse(await readFile(resultPath, "utf8"));
    report.model = mlxModel; report.runs = mlx.runs; report.loadMs = mlx.loadMs;
    report.checks.processExited = true;
  } else {
    const model = getLocalModel(arg("--model", "qwen3-14b"));
    const folder = process.platform === "darwin" ? path.join(homedir(), "Library/Application Support/Zebby/Models")
      : path.join(process.env.LOCALAPPDATA || homedir(), "Zebby/Models");
    const modelFile = path.resolve(arg("--model-file", path.join(folder, model.filename)));
    assert.equal((await stat(modelFile)).size, model.bytes, "Model size does not match the catalog");
    console.log("Verifying " + model.name);
    assert.equal(await hashModelFile(modelFile), model.sha256, "Model hash does not match the catalog");
    report.model = { id: model.id, bytes: model.bytes, sha256: model.sha256, quantization: model.filename.match(/-(Q[^.]+)\.gguf$/)?.[1] || "unknown" };
    const platform = process.platform === "darwin" ? "mac" : "win";
    engine = new LocalModelEngine({ runtimeFolder: path.join(root, "build/llama", platform + "-" + process.arch),
      workerPath: path.join(root, "desktop-dist/local-runtime-worker.cjs"), downloads: { readyPath: async () => modelFile },
      onDiagnostic: (message, error) => { report.events.push({ at: Date.now(), message, error: error?.message }); },
    });
    await engine.detectHardware(); report.compute = engine.compute;
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const task of tasks) {
        const started = Date.now(), availableBefore = await availableModelMemory(), eventStart = report.events.length;
        console.log(task.id + ", run " + (repeat + 1));
        const result = await engine.analyze(model.id, task.instructions, task.input, task.schema,
          localTaskOutputBudget(task.kind), undefined, thinking);
        const events = report.events.slice(eventStart);
        const first = events.find(event => event.message.includes("first token"));
        report.runs.push({ task: task.id, repeat: repeat + 1, elapsedMs: Date.now() - started,
          firstTokenFromRequestMs: first ? first.at - started : null, contextTokens: engine.contextTokens,
          backend: engine.backend, offloadedLayers: engine.offloadedLayers,
          systemAvailableBefore: availableBefore, systemAvailableAfter: await availableModelMemory(), result });
        if (process.argv.includes("--require-gpu")) assert.ok(engine.backend !== "cpu" && engine.offloadedLayers > 0, "Native runtime did not confirm GPU offload");
      }
    }
    if (process.argv.includes("--idle-check")) {
      const deadline = Date.now() + 35_000;
      while (engine.modelId && Date.now() < deadline) await delay(1000);
      assert.equal(engine.modelId, "", "Model remained loaded beyond its idle deadline");
      report.checks.idleUnload = true;
    }
    await engine.stop(); report.checks.processExited = !engine.modelId;
    report.systemAvailableAfterRelease = await availableModelMemory();
  }
  for (const run of report.runs) validate(tasks.find(task => task.id === run.task), run.result);
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const aligned = report.runs.find(run => run.repeat === repeat && run.task === "match-aligned");
    const gaps = report.runs.find(run => run.repeat === repeat && run.task === "match-gaps");
    assert.ok(aligned.result.score >= gaps.result.score + 15, "Model did not distinguish the strong match from major qualification gaps");
  }
  report.checks.structuredResults = true; report.checks.evidenceSanity = true;
  report.review = ["Check every summary claim against the source resume", "Check ATS priorities against the job requirements",
    "Compare explanations and score variation across repeated runs", "Compare latency and memory with other models on the same Mac"];
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  await engine?.shutdown();
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log("Report: " + path.join(output, "report.json"));
  if (report.error) console.error(report.error);
}

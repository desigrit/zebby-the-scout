import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { recommendedLocalModels } from "../desktop/local-compute.ts";
import { detectLocalCompute, localComputeArguments, parseComputeDevices, readLocalRuntime } from "../desktop/local-compute-detection.ts";
import { LocalModelEngine } from "../desktop/local-model-engine.ts";

const GiB = 1024 ** 3;
const gpu = { status: "ready", backend: "vulkan", devices: [{ id: "Vulkan0", name: "GPU", memory: 16 * GiB, freeMemory: 12 * GiB }], availableMemory: 16 * GiB, recommendedModelIds: [] };

test("runtime detection chooses a supported GPU by available memory, not the display adapter", async () => {
  const output = "Available devices:\n  Vulkan1: Intel Graphics (4096 MiB, 3500 MiB free)\n  Vulkan0: NVIDIA RTX (16384 MiB, 12288 MiB free)\n  RPC0: Remote (99000 MiB, 99000 MiB free)\n";
  const devices = parseComputeDevices(output, "vulkan");
  assert.deepEqual(devices.map((d) => d.id), ["Vulkan0", "Vulkan1"]);
  assert.equal(parseComputeDevices(output.replace("4096 MiB, 3500 MiB", "32768 MiB, 32000 MiB"), "vulkan")[0].id,
    "Vulkan0", "Integrated shared RAM must not outrank a dedicated GPU");
  const result = await detectLocalCompute({ executable: "cpu", accelerator: { executable: "gpu", backend: "vulkan" } }, {
    execute: async (exe, args, opts) => {
      assert.equal(exe, "gpu"); assert.deepEqual(args, ["--list-devices"]);
      assert.equal(opts.windowsHide, true); assert.ok(opts.timeout <= 15_000);
      return { stdout: output, stderr: "" };
    }, memory: async () => 16 * GiB,
  });
  assert.equal(result.backend, "vulkan");
  assert.deepEqual(result.recommendedModelIds, ["qwen3-8b", "qwen3-4b"]);
});

test("recommendations respect VRAM, shared Apple memory and CPU capacity", () => {
  assert.deepEqual(recommendedLocalModels({ ...gpu, backend: "cpu", devices: [] }), ["qwen3-06b", "lfm25-350m"]);
  assert.deepEqual(recommendedLocalModels({ ...gpu, backend: "cpu", devices: [], availableMemory: 1.8 * GiB }), ["lfm25-350m", "smollm2-360m"]);
  assert.deepEqual(recommendedLocalModels({ ...gpu, availableMemory: 0.5 * GiB }), []);
  assert.deepEqual(recommendedLocalModels({ ...gpu, devices: [{ ...gpu.devices[0], freeMemory: 7.5 * GiB }] }), ["qwen3-4b", "qwen3-06b"]);
  const metal = { ...gpu, backend: "metal", devices: parseComputeDevices("  Metal: Apple M3 (12288 MiB, 10240 MiB free)", "metal") };
  assert.deepEqual(recommendedLocalModels(metal), ["qwen3-8b", "qwen3-4b"]);
  assert.deepEqual(recommendedLocalModels({ ...metal, availableMemory: 7 * GiB }), ["qwen3-4b", "qwen3-06b"]);
  assert.equal(parseComputeDevices("Vulkan0: broken", "vulkan").length, 0);
});

test("missing drivers and malformed probes fall back without claiming no GPU exists", async () => {
  for (const execute of [async () => { throw new Error("Missing Vulkan driver"); }, async () => ({ stdout: "unexpected output" })]) {
    const result = await detectLocalCompute({ executable: "cpu", accelerator: { executable: "gpu", backend: "vulkan" } }, { execute, memory: async () => 8 * GiB });
    assert.equal(result.status, "unavailable"); assert.equal(result.backend, "cpu");
    assert.deepEqual(result.recommendedModelIds, ["qwen3-06b", "lfm25-350m"]);
  }
  const result = await detectLocalCompute({ executable: "cpu", accelerator: { executable: "gpu", backend: "vulkan" } }, {
    execute: async () => ({ stdout: "Available devices:\n  (none)\n" }), memory: async () => 8 * GiB,
  });
  assert.equal(result.status, "ready"); assert.equal(result.backend, "cpu");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(detectLocalCompute({ executable: "cpu" }, { signal: controller.signal }), { name: "AbortError" });
});

test("GPU fitting preserves caller context; CPU recovery disables every offload path", () => {
  const args = localComputeArguments(gpu);
  assert.equal(args[args.indexOf("--device") + 1], "Vulkan0");
  assert.equal(args[args.indexOf("--gpu-layers") + 1], "auto");
  assert.ok(!args.includes("--ctx-size"));
  const fallback = localComputeArguments(gpu, true);
  assert.equal(fallback[fallback.indexOf("--device") + 1], "none");
  assert.ok(fallback.includes("--no-kv-offload") && fallback.includes("--no-op-offload"));
});

test("runtime paths cannot escape the package; a missing GPU binary leaves CPU usable", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-runtime-paths-"));
  try {
    await writeFile(path.join(folder, "cpu"), "runtime");
    for (const executable of ["../outside", "missing-gpu"]) {
      await writeFile(path.join(folder, "runtime.json"), JSON.stringify({ backend: "cpu", executable: "cpu", accelerator: { backend: "vulkan", executable } }));
      assert.deepEqual(await readLocalRuntime(folder), { executable: path.join(folder, "cpu") });
    }
    await writeFile(path.join(folder, "runtime.json"), JSON.stringify({ backend: "metal", executable: "cpu" }));
    assert.deepEqual(await readLocalRuntime(folder), {
      executable: path.join(folder, "cpu"), accelerator: { executable: path.join(folder, "cpu"), backend: "metal" },
    });
    await writeFile(path.join(folder, "runtime.json"), JSON.stringify({ executable: "../outside" }));
    await assert.rejects(readLocalRuntime(folder), /engine could not be found/);
  } finally { assert.ok(folder.startsWith(tmpdir())); await rm(folder, { recursive: true, force: true }); }
});

for (const cancel of [false, true]) test(`GPU startup ${cancel ? "cancellation never retries" : "failure retries the same request on CPU"}`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-gpu-fallback-"));
  const launches = path.join(folder, "launches.jsonl"), worker = path.join(folder, "worker.mjs");
  await writeFile(path.join(folder, "cpu"), "runtime"); await writeFile(path.join(folder, "gpu"), "runtime");
  await writeFile(path.join(folder, "runtime.json"), JSON.stringify({ backend: "cpu", executable: "cpu", accelerator: { backend: "vulkan", executable: "gpu" } }));
  await writeFile(worker, `import {appendFileSync} from 'node:fs';
    appendFileSync(${JSON.stringify(launches)}, JSON.stringify(process.argv.slice(3))+'\\n');
    if (process.argv.includes('Vulkan0') && ${!cancel}) setTimeout(() => process.exit(7), 30);
    process.stdin.on('data', () => process.exit(0)); setInterval(() => {}, 1000);`);
  const controller = new AbortController(), input = { jobDescription: "Whole posting", resume: "Whole resume", currentCvOverview: "Unedited summary" };
  const engine = new LocalModelEngine({ runtimeFolder: folder, workerPath: worker,
    downloads: { readyPath: async () => path.join(folder, "qwen.gguf") }, detectCompute: async () => structuredClone(gpu),
    fetcher: async (url, options) => {
      if (url.endsWith("/health")) {
        if (engine.backend !== "cpu") {
          if (cancel) { setTimeout(() => controller.abort(), 80); }
          return new Response(null, { status: 503 });
        }
        return Response.json({});
      }
      if (url.endsWith("/tokenize")) return Response.json({ tokens: [1, 2] });
      const request = JSON.parse(options.body);
      assert.deepEqual(JSON.parse(request.messages[1].content), input);
      assert.equal(request.chat_template_kwargs.enable_thinking, true);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"score":81}' } }] });
    },
  });
  try {
    const result = engine.analyze("qwen3-06b", "Keep all evidence", input, {}, 200, controller.signal, "on");
    if (cancel) await assert.rejects(result, { name: "AbortError" });
    else { assert.deepEqual(await result, { score: 81 }); assert.equal(engine.cpuFallback, true); }
    await engine.shutdown();
    const attempts = (await readFile(launches, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(attempts.length, cancel ? 1 : 2);
    for (const args of attempts) {
      assert.equal(args[args.indexOf("--ctx-size") + 1], "16384");
      assert.equal(args[args.indexOf("--model") + 1], path.join(folder, "qwen.gguf"));
    }
    if (!cancel) assert.equal(attempts[1][attempts[1].indexOf("--gpu-layers") + 1], "0");
  } finally { await engine.shutdown(); assert.ok(folder.startsWith(tmpdir())); await rm(folder, { recursive: true, force: true }); }
});

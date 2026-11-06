import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { totalmem } from "node:os";
import { promisify, stripVTControlCharacters } from "node:util";
import type { ComputeBackend, ComputeDevice, LocalCompute } from "./local-compute.ts";
import { recommendedLocalModels } from "./local-compute.ts";
import { availableModelMemory } from "./local-model-memory.ts";

const execute = promisify(execFile);
export type LocalRuntime = { executable: string; accelerator?: { executable: string; backend: "metal" | "vulkan" } };

export async function readLocalRuntime(folder: string): Promise<LocalRuntime> {
  const root = path.resolve(folder);
  const manifest = await readFile(path.join(root, "runtime.json"), "utf8").then(JSON.parse).catch(() => null);
  if (!manifest?.executable) throw new Error("The local analysis engine is missing. Reinstall the latest app version.");
  async function executable(relative: unknown) {
    if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("Invalid local analysis engine path.");
    const target = path.resolve(root, relative), inside = path.relative(root, target);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || !(await stat(target).catch(() => null))?.isFile()) {
      throw new Error("The local analysis engine could not be found. Reinstall the app.");
    }
    return target;
  }
  const cpu = await executable(manifest.executable);
  if (manifest.backend === "metal" || !manifest.backend && process.platform === "darwin" && process.arch === "arm64") {
    return { executable: cpu, accelerator: { executable: cpu, backend: "metal" } };
  }
  if (manifest.accelerator?.backend === "vulkan") {
    // Keep the independent CPU engine usable if a GPU resource is missing.
    const gpu = await executable(manifest.accelerator.executable).catch(() => null);
    if (gpu) return { executable: cpu, accelerator: { executable: gpu, backend: "vulkan" } };
  }
  return { executable: cpu };
}

export function localRuntimeEnvironment(): NodeJS.ProcessEnv {
  // An unrelated shell's llama settings must not override Zebby's context,
  // model, device, or network policy. Explicit app arguments own those choices.
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LLAMA_|^GGML_/i.test(key)));
}

export function parseComputeDevices(output: string, backend: ComputeBackend): ComputeDevice[] {
  // llama.cpp b11146 reports Apple GPUs as MTL0, not Metal. Preserve the
  // native identifier because it is also the value accepted by --device.
  const deviceId = backend === "metal" ? /^(?:MTL\d+|Metal\d*)$/ : backend === "vulkan" ? /^Vulkan\d+$/ : null;
  if (!deviceId) return [];
  return stripVTControlCharacters(output).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([\w-]+):\s+(.+?)\s+\((\d+) MiB, (\d+) MiB free\)\s*$/);
    if (!match || !deviceId.test(match[1])) return [];
    const memory = Number(match[3]) * 1024 ** 2, freeMemory = Number(match[4]) * 1024 ** 2;
    if (!Number.isSafeInteger(memory) || !Number.isSafeInteger(freeMemory) || memory <= 0) return [];
    return [{ id: match[1], name: match[2], memory, freeMemory: Math.min(memory, freeMemory) }];
  }).sort((a, b) => {
    // Shared system RAM can make an integrated adapter report more memory
    // than a dedicated GPU. Prefer recognizable discrete adapters with room
    // to work; retain memory ordering for other or unknown device families.
    const priority = (device: ComputeDevice) => device.freeMemory < 2 * 1024 ** 3 ? -1
      : /NVIDIA|GeForce|Quadro|RTX|GTX|Tesla|Radeon.*(?:RX|PRO)|Intel.*Arc.*[AB]\d/i.test(device.name) ? 2
      : /UHD|Iris|Intel.*Graphics|Radeon Graphics/i.test(device.name) ? 0 : 1;
    return priority(b) - priority(a) || b.freeMemory - a.freeMemory;
  });
}

export async function detectLocalCompute(runtime: LocalRuntime, options: {
  execute?: typeof execute; memory?: () => Promise<number>; signal?: AbortSignal;
  diagnostic?: (message: string, error?: unknown) => void;
} = {}): Promise<LocalCompute> {
  const compute: LocalCompute = { status: "ready", backend: "cpu", devices: [],
    availableMemory: await (options.memory || availableModelMemory)(), totalMemory: totalmem(), recommendedModelIds: [] };
  options.signal?.throwIfAborted();
  if (runtime.accelerator) {
    try {
      const result = await (options.execute || execute)(runtime.accelerator.executable, ["--list-devices"], {
        cwd: path.dirname(runtime.accelerator.executable), windowsHide: true,
        // The first Metal initialization can compile kernels on a cold Mac.
        // Device discovery loads no model and remains cancellable.
        timeout: runtime.accelerator.backend === "metal" ? 60_000 : 15_000, maxBuffer: 128 * 1024, signal: options.signal, env: localRuntimeEnvironment(),
      });
      const output = stripVTControlCharacters([result.stdout, result.stderr].filter(Boolean).join("\n"));
      const header = output.indexOf("Available devices:");
      if (header < 0) throw new Error("The runtime did not report its devices.");
      const listing = output.slice(header);
      compute.devices = parseComputeDevices(listing, runtime.accelerator.backend);
      if (compute.devices.length) compute.backend = runtime.accelerator.backend;
      else if (!/^\s*\(none\)\s*$/m.test(listing)) {
        throw new Error("The runtime reported devices that Zebby could not use: " + listing.slice(0, 4096));
      }
      options.diagnostic?.(`Local compute detected (${compute.backend}, ${compute.devices.map((d) => `${d.id}: ${d.name}, free ${d.freeMemory}, total ${d.memory}`).join("; ") || "no supported GPU"})`);
    } catch (error) {
      options.signal?.throwIfAborted();
      compute.status = "unavailable";
      options.diagnostic?.("Local GPU detection failed; CPU remains available", error);
    }
  }
  if (process.platform === "darwin") {
    const cores = await (options.execute || execute)("/usr/sbin/sysctl", ["-n", "hw.perflevel0.physicalcpu"],
      { timeout: 2000, maxBuffer: 1024 }).catch(() => null);
    const count = Number(String(cores?.stdout || "").trim());
    if (Number.isInteger(count) && count > 0 && count <= 256) compute.performanceCores = count;
  }
  compute.recommendedModelIds = recommendedLocalModels(compute);
  return compute;
}

export function localComputeArguments(compute: LocalCompute, cpu = false): string[] {
  if (cpu || compute.backend === "cpu" || !compute.devices.length) {
    return ["--device", "none", "--gpu-layers", "0", "--no-kv-offload", "--no-op-offload", "--fit", "off"];
  }
  // Auto-fit chooses how many layers to offload. Context is explicitly set by
  // the caller, so fitting cannot truncate the job or resume to fit the GPU.
  return ["--device", compute.devices[0].id, "--gpu-layers", "auto", "--fit", "on", "--fit-target", "1024"];
}

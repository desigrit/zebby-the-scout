import { LOCAL_MODELS } from "./local-model-catalog.ts";

export type ComputeBackend = "cpu" | "vulkan" | "metal";
export type ComputeDevice = { id: string; name: string; memory: number; freeMemory: number };
export type LocalCompute = {
  status: "checking" | "ready" | "unavailable";
  backend: ComputeBackend;
  devices: ComputeDevice[];
  availableMemory: number;
  recommendedModelIds: string[];
};
const GiB = 1024 ** 3;

// Memory includes room for the model's full context, not just its GGUF file.
// Recommendations never select or download a model on the user's behalf.
export function recommendedLocalModels(compute: Pick<LocalCompute, "backend" | "devices" | "availableMemory">): string[] {
  const cpu = ["qwen3-06b", "lfm25-350m", "smollm2-360m"].filter((id) =>
    LOCAL_MODELS.find((model) => model.id === id)!.minimumFreeMemory <= compute.availableMemory);
  const device = compute.devices[0];
  if (compute.backend === "cpu" || !device) return cpu.slice(0, 2);
  const gpu = ["qwen3-8b", "qwen3-4b", "qwen3-06b"].filter((id) => {
    const model = LOCAL_MODELS.find((item) => item.id === id)!;
    const hostMemory = compute.backend === "metal" ? model.minimumFreeMemory : Math.min(model.minimumFreeMemory, model.bytes + GiB / 2);
    return device.freeMemory - GiB >= model.minimumFreeMemory && compute.availableMemory >= hostMemory;
  });
  return [...new Set([...gpu, ...cpu])].slice(0, 2);
}

export function computeLabel(compute?: LocalCompute): string {
  if (!compute || compute.status === "checking") return "Checking this computer";
  if (compute.backend === "metal") return `${compute.devices[0]?.name || "Apple GPU"} · Metal`;
  if (compute.backend === "vulkan") return `${compute.devices[0]?.name || "GPU"} · Vulkan`;
  return compute.status === "unavailable" ? "CPU · GPU acceleration unavailable" : "CPU";
}

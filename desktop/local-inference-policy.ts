import type { LocalModel } from "./local-model-catalog.ts";

export function localTaskOutputBudget(task: string): number {
  return task === "tailored_resume" ? 6000 : task === "board_extract" ? 4000 : task === "resume_plan" ? 3000 : 1800;
}

export const LOCAL_IDLE_MS = 30_000;
export const LOCAL_MEMORY_POLL_MS = 5_000;
const GiB = 1024 ** 3;

export function systemMemoryReserve(total: number): number {
  return Math.max(GiB, Math.min(4 * GiB, total * 0.1));
}

export function localWorkingMemory(model: LocalModel, context: number): number {
  if (!model.kvBytesPerToken) return model.minimumFreeMemory;
  return Math.ceil(model.bytes + Math.max(0.75 * GiB, model.bytes * 0.1) + model.kvBytesPerToken * context);
}

export function contextForTokens(inputTokens: number, outputTokens: number, limit: number): number {
  const needed = inputTokens + outputTokens + 256;
  if (![inputTokens, outputTokens, limit].every(Number.isSafeInteger) || inputTokens < 0 || outputTokens < 1 || needed > limit) {
    throw new Error("This model cannot fit all the job and resume text. Choose a model with a longer context window or shorten the description.");
  }
  return Math.min(limit, Math.max(4096, Math.ceil(needed / 2048) * 2048));
}

// Only a starting allocation. The native chat template and tokenizer determine
// the final size before generation. No input is truncated to fit this estimate.
export function initialLocalContext(text: string, outputTokens: number, limit: number): number {
  return Math.min(limit, Math.max(4096, Math.ceil((Buffer.byteLength(text, "utf8") / 3 + outputTokens + 512) / 2048) * 2048));
}

export function localThreadCounts(parallelism: number, performanceCores?: number, gpu = false) {
  const available = Math.max(1, Math.floor(parallelism));
  const cores = Math.max(1, Math.min(available, performanceCores || Math.ceil(available * 0.75)));
  return { threads: gpu ? Math.min(4, cores) : Math.min(8, Math.max(1, cores - 1)), batch: Math.min(16, cores) };
}

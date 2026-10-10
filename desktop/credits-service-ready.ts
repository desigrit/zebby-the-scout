import { setTimeout as delay } from "node:timers/promises";

const IDLE_CHECK_MS = 12 * 60 * 1000;

export function needsServiceWakeup(origin: string, lastResponse: number, now = Date.now()) {
  return new URL(origin).hostname.endsWith(".onrender.com") && (!lastResponse || now - lastResponse >= IDLE_CHECK_MS);
}

// Retry only a public health check. Replaying checkout or analysis could repeat a mutation.
export async function waitForCreditsService(origin: string, fetcher: typeof fetch, signal: AbortSignal,
  timing: { waitMs?: number; attemptMs?: number; retryMs?: number } = {}) {
  const deadline = AbortSignal.timeout(timing.waitMs ?? 120000);
  const waiting = AbortSignal.any([signal, deadline]);
  try {
    while (true) {
      waiting.throwIfAborted();
      try {
        const response = await fetcher(origin + "/health", { method: "GET",
          signal: AbortSignal.any([waiting, AbortSignal.timeout(timing.attemptMs ?? 15000)]) });
        const health = await response.json() as { ok?: unknown; mode?: unknown };
        waiting.throwIfAborted();
        if (response.ok && health?.ok === true && ["live", "test"].includes(String(health.mode))) return;
      } catch {
        waiting.throwIfAborted();
      }
      await delay(timing.retryMs ?? 2000, undefined, { signal: waiting });
    }
  } catch {
    signal.throwIfAborted();
    throw new Error("The credits service did not become ready. Try again shortly.");
  }
}

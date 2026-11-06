import { setTimeout as delay } from "node:timers/promises";

export function boardRetryDelay(status: number, attempt: number, header: string | null = null): number | null {
  if (![429, 500, 502, 503, 504].includes(status) || attempt >= 2) return null;
  const seconds = Number(header);
  const requested = header ? Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now() : 0;
  if (requested > 15000) return null;
  return Math.max(1000 * 2 ** attempt, Number.isFinite(requested) ? requested : 0);
}

// Retry only transient HTTP failures, respect Retry-After, and keep cancellation
// responsive. Long server delays remain a visible failed check for a later retry.
export async function boardRequest(request: (url: string, init: RequestInit) => Promise<Response>, url: string,
  init: RequestInit, signal: AbortSignal, wait: (ms: number, signal: AbortSignal) => Promise<unknown> = (ms, signal) => delay(ms, undefined, { signal })) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await request(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    const milliseconds = boardRetryDelay(response.status, attempt, response.headers.get("retry-after"));
    if (milliseconds === null) return response;
    await response.body?.cancel().catch(() => undefined);
    await wait(milliseconds, signal);
  }
}

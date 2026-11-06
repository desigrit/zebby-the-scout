import { setTimeout as delay } from "node:timers/promises";

// Retry only transient HTTP failures, respect Retry-After, and keep cancellation
// responsive. Long server delays remain a visible failed check for a later retry.
export async function boardRequest(request: (url: string, init: RequestInit) => Promise<Response>, url: string,
  init: RequestInit, signal: AbortSignal, wait: (ms: number, signal: AbortSignal) => Promise<unknown> = (ms, signal) => delay(ms, undefined, { signal })) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await request(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (![429, 502, 503, 504].includes(response.status) || attempt >= 2) return response;
    const header = response.headers.get("retry-after"), seconds = Number(header);
    const requested = header ? Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now() : 0;
    if (requested > 15000) return response;
    const milliseconds = Math.max(1000 * 2 ** attempt, Number.isFinite(requested) ? requested : 0);
    await response.body?.cancel().catch(() => undefined);
    await wait(milliseconds, signal);
  }
}

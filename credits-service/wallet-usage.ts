import { z } from "zod";
import type { DailyCreditUsage, Wallet } from "../shared/online-models.ts";

const rowSchema = z.object({ id: z.string().uuid(), created_at: z.string().datetime({ offset: true }), cost: z.number().int().safe().nonnegative() });
type Usage = { completedAnalyses: number; dailyUsage: DailyCreditUsage[] };
type Options = {
  url: string; key: string; fetcher?: typeof fetch; now?: () => number;
  timeoutMs?: number; maxRows?: number; maxCachedWallets?: number; maxInFlight?: number;
  onFailure?: () => void;
};

function exactCount(response: Response) {
  const match = response.headers.get("content-range")?.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
  const count = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Credit usage count unavailable.");
  return count;
}

async function boundedRows(response: Response, signal: AbortSignal) {
  if (!response.body) throw new Error("Credit usage rows unavailable.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 256 * 1024) throw new Error("Credit usage page too large.");
      chunks.push(value);
    }
    return z.array(rowSchema).max(1000).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

function micros(timestamp: string) {
  // Preserve Postgres' microseconds when several completions share a millisecond.
  const fraction = timestamp.match(/\.(\d+)/)?.[1] || "";
  return BigInt(Math.floor(Date.parse(timestamp) / 1000)) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0").slice(0, 6) || "0");
}

/** Transitional read path for installations whose ledger RPC predates usage
 * aggregates. It never writes accounting data and never publishes a partial grid.
 * Once the additive migration is installed, the SQL response bypasses this path. */
export function createWalletUsage(options: Options) {
  const send = options.fetcher || fetch, now = options.now || Date.now;
  const cache = new Map<string, { key: string; until: number; usage: Usage | null }>();
  const pending = new Map<string, { key: string; value: Promise<Wallet> }>();
  const maxCached = options.maxCachedWallets ?? 256, maxRows = options.maxRows ?? 10_000;
  let active = 0;
  function version(wallet: Wallet, day: string) {
    return `${day}:${wallet.updatedAt}:${wallet.used}:${wallet.balance}:${wallet.reserved}:${wallet.purchased}:${wallet.recent[0]?.id || ""}`;
  }
  function remember(user: string, key: string, usage: Usage | null) {
    cache.delete(user); cache.set(user, { key, usage, until: now() + (usage ? 20_000 : 5000) });
    while (cache.size > maxCached) cache.delete(cache.keys().next().value!);
  }
  async function query(user: string, query: URLSearchParams, signal: AbortSignal, head = false, count = false) {
    signal.throwIfAborted();
    // These filters are applied here on every page, never supplied by the caller.
    query.set("user_id", `eq.${user}`); query.set("status", "eq.completed");
    const response = await send(`${options.url}/rest/v1/zebby_runs?${query}`, { method: head ? "HEAD" : "GET", signal,
      headers: { apikey: options.key, Authorization: `Bearer ${options.key}`, ...(count ? { Prefer: "count=exact" } : {}) } });
    signal.throwIfAborted();
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error("Credit usage query unavailable."); }
    return response;
  }
  async function load(user: string, wallet: Wallet, day: string, signal: AbortSignal): Promise<Usage> {
    const end = Date.parse(`${day}T00:00:00Z`) + 86_400_000, start = end - 84 * 86_400_000;
    const dailyUsage = Array.from({ length: 84 }, (_, index) => ({ date: new Date(start + index * 86_400_000).toISOString().slice(0, 10), count: 0, cost: 0 }));
    const completedAnalyses = wallet.completedAnalyses ?? exactCount(await query(user, new URLSearchParams({ select: "id", limit: "1" }), signal, true, true));
    const byDate = new Map(dailyUsage.map((item) => [item.date, item]));
    let cursor: { id: string; created_at: string } | null = null, count = 0, expected: number | null = null, pages = 0;
    for (;;) {
      if (++pages > 25) throw new Error("Credit usage exceeded the page budget.");
      const params = new URLSearchParams({ select: "id,cost,created_at", order: "created_at.asc,id.asc", limit: "1000" });
      params.append("created_at", `gte.${new Date(start).toISOString()}`);
      params.append("created_at", `lt.${new Date(end).toISOString()}`);
      if (cursor) params.set("or", `(created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id}))`);
      const response = await query(user, params, signal, false, expected === null);
      try {
        if (expected === null) {
          expected = exactCount(response);
          if (expected > maxRows || expected > completedAnalyses) throw new Error("Credit activity exceeds the bounded read window.");
        }
      } catch (error) { await response.body?.cancel().catch(() => undefined); throw error; }
      const rows = await boundedRows(response, signal);
      signal.throwIfAborted();
      if (count + rows.length > expected || !rows.length && count !== expected) throw new Error("Incomplete credit usage history.");
      for (const row of rows) {
        const time = Date.parse(row.created_at), previous = cursor && micros(cursor.created_at), current = micros(row.created_at);
        if (time < start || time >= end || cursor && (current < previous! || current === previous && row.id.toLowerCase() <= cursor.id.toLowerCase())) {
          throw new Error("Credit usage pagination was inconsistent.");
        }
        const bucket = byDate.get(new Date(time).toISOString().slice(0, 10))!;
        bucket.count++; bucket.cost += row.cost;
        if (!Number.isSafeInteger(bucket.cost)) throw new Error("Credit usage total exceeds the supported range.");
        count++; cursor = row;
      }
      if (count === expected) return { completedAnalyses, dailyUsage };
    }
  }
  return async function enrich(user: string, wallet: Wallet, readWallet: (signal: AbortSignal) => Promise<Wallet>, requestSignal?: AbortSignal): Promise<Wallet> {
    if (wallet.completedAnalyses !== undefined && wallet.dailyUsage?.length === 84) return wallet;
    if (!z.string().uuid().safeParse(user).success) return wallet;
    const day = new Date(now()).toISOString().slice(0, 10), key = version(wallet, day);
    const cached = cache.get(user);
    if (cached?.key === key && cached.until > now()) {
      cache.delete(user); cache.set(user, cached);
      return cached.usage ? { ...wallet, ...cached.usage } : wallet;
    }
    const running = pending.get(user);
    if (running?.key === key) return running.value;
    if (active >= (options.maxInFlight ?? 8) || requestSignal?.aborted) return wallet;
    active++;
    const controller = new AbortController(), signal = requestSignal ? AbortSignal.any([controller.signal, requestSignal]) : controller.signal;
    let timer: ReturnType<typeof setTimeout>;
    const cancelled = new Promise<Wallet>((resolve) => {
      signal.addEventListener("abort", () => resolve(wallet), { once: true });
      timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);
      timer.unref?.();
    });
    const value = (async () => {
      try {
        return await Promise.race([cancelled, (async () => {
          const usage = await load(user, wallet, day, signal);
          // A settlement between pages invalidates the snapshot. Return the fresh
          // wallet, then retry its new version on the next refresh.
          const latest = await readWallet(signal);
          signal.throwIfAborted();
          if (version(latest, day) !== key || new Date(now()).toISOString().slice(0, 10) !== day) return latest;
          if (pending.get(user)?.key === key) remember(user, key, usage);
          return { ...wallet, ...usage };
        })()]);
      } catch {
        if (!signal.aborted) options.onFailure?.();
        return wallet;
      } finally {
        clearTimeout(timer!); controller.abort(); active--;
        if (pending.get(user)?.key === key) {
          pending.delete(user);
          if (cache.get(user)?.key !== key) remember(user, key, null);
        }
      }
    })();
    pending.set(user, { key, value });
    return value;
  };
}

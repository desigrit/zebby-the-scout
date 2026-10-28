import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createWalletUsage } from "../credits-service/wallet-usage.ts";
import { createService } from "../credits-service/service.ts";

const user = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const today = Date.parse("2026-10-27T00:00:00Z"), day = 86_400_000;
const wallet = { balance: 450_000_000, reserved: 0, purchased: 500_000_000, used: 50_000_000, updatedAt: "2026-10-27T12:00:00Z", recent: [] };
const id = (index) => `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}`;
function fakeDatabase(data) {
  const requests = [];
  const fetcher = async (target, options) => {
    const url = new URL(target), params = url.searchParams;
    assert.equal(url.origin, "https://database.example"); assert.equal(url.pathname, "/rest/v1/zebby_runs");
    assert.equal(params.get("status"), "eq.completed"); assert.match(params.get("user_id"), /^eq\.[\da-f-]{36}$/);
    assert.equal(options.headers.apikey, "private-service-key");
    assert.equal(options.headers.Authorization, "Bearer private-service-key");
    requests.push({ url, options });
    let rows = data.filter((row) => row.user_id === params.get("user_id").slice(3) && row.status === "completed");
    if (options.method === "HEAD") {
      assert.equal(params.get("select"), "id"); assert.equal(options.headers.Prefer, "count=exact");
      return new Response(null, { headers: { "content-range": `*/${rows.length}` } });
    }
    assert.equal(params.get("select"), "id,cost,created_at");
    const boundaries = params.getAll("created_at");
    assert.equal(boundaries.length, 2);
    const start = Date.parse(boundaries.find((value) => value.startsWith("gte.")).slice(4));
    const end = Date.parse(boundaries.find((value) => value.startsWith("lt.")).slice(3));
    assert.equal(end - start, 84 * day);
    rows = rows.filter((row) => Date.parse(row.created_at) >= start && Date.parse(row.created_at) < end)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const cursor = params.get("or")?.match(/created_at\.gt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.gt\.([\da-f-]+)/);
    if (cursor) rows = rows.filter((row) => row.created_at > cursor[1] || row.created_at === cursor[1] && row.id > cursor[2]);
    const batch = rows.slice(0, Number(params.get("limit")));
    return Response.json(batch.map(({ id, created_at, cost }) => ({ id, created_at, cost })), {
      headers: { "content-range": batch.length ? `0-${batch.length - 1}/${rows.length}` : `*/0` },
    });
  };
  return { fetcher, requests };
}
function row(index, options = {}) {
  return { id: id(index), user_id: user, status: "completed", created_at: new Date(today - (index % 84) * day + 3600_000).toISOString(), cost: 1000 + index, ...options };
}

test("legacy usage traverses more than 1000 rows, counts all history and isolates wallets/statuses", async () => {
  const data = Array.from({ length: 1455 }, (_, index) => row(index + 1));
  data.push(row(2000, { created_at: new Date(today - 84 * day).toISOString() }), row(2001, { user_id: other }),
    row(2002, { status: "failed" }), row(2003, { status: "reserved" }));
  const db = fakeDatabase(data);
  const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", fetcher: db.fetcher, now: () => today + 12 * 3600_000 });
  const result = await enrich(user, wallet, async () => wallet);
  assert.equal(result.completedAnalyses, 1456); assert.equal(result.dailyUsage.length, 84);
  assert.equal(result.dailyUsage[0].date, "2026-08-05"); assert.equal(result.dailyUsage.at(-1).date, "2026-10-27");
  assert.equal(result.dailyUsage.reduce((sum, entry) => sum + entry.count, 0), 1455);
  assert.equal(result.dailyUsage.reduce((sum, entry) => sum + entry.cost, 0), data.slice(0, 1455).reduce((sum, entry) => sum + entry.cost, 0));
  assert.equal(db.requests.length, 3); assert.ok(db.requests[2].url.searchParams.get("or"));
  assert.equal(result.balance, wallet.balance); assert.equal(result.used, wallet.used); assert.equal(wallet.dailyUsage, undefined);
  const otherResult = await enrich(other, wallet, async () => wallet);
  assert.equal(otherResult.completedAnalyses, 1); assert.equal(otherResult.dailyUsage.reduce((sum, entry) => sum + entry.count, 0), 1);
});

test("usage cache follows wallet version, UTC day, age and bounded wallet capacity", async () => {
  const data = [row(1)]; const db = fakeDatabase(data);
  let now = today + 12 * 3600_000;
  const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", fetcher: db.fetcher, now: () => now, maxCachedWallets: 1 });
  await enrich(user, wallet, async () => wallet); const first = db.requests.length;
  await enrich(user, wallet, async () => assert.fail("A cache hit needs no verification read"));
  assert.equal(db.requests.length, first);
  const updated = { ...wallet, used: wallet.used + 1000, updatedAt: "2026-10-27T12:00:01Z" };
  data.push(row(2)); await enrich(user, updated, async () => updated); assert.equal(db.requests.length, first + 2);
  now += 20_001; await enrich(user, updated, async () => updated); assert.equal(db.requests.length, first + 4);
  now += day; await enrich(user, updated, async () => updated); assert.equal(db.requests.length, first + 6);
  await enrich(other, wallet, async () => wallet); await enrich(user, updated, async () => updated);
  assert.equal(db.requests.length, first + 10);
});

test("a changed wallet between pages discards the aggregate instead of exposing an inconsistent snapshot", async () => {
  const db = fakeDatabase([row(1)]), fresh = { ...wallet, used: wallet.used + 1000, updatedAt: "2026-10-27T12:01:00Z" };
  const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", fetcher: db.fetcher, now: () => today });
  assert.equal(await enrich(user, wallet, async () => fresh), fresh);
  const result = await enrich(user, fresh, async () => fresh);
  assert.equal(result.dailyUsage.reduce((sum, entry) => sum + entry.count, 0), 1);
});

test("the SQL aggregate fast path makes no compatibility queries", async () => {
  const canonical = { ...wallet, completedAnalyses: 4, dailyUsage: Array.from({ length: 84 }, (_, index) => ({ date: new Date(today - (83 - index) * day).toISOString().slice(0, 10), count: 0, cost: 0 })) };
  const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", fetcher: async () => assert.fail("No fallback fetch after migration") });
  assert.equal(await enrich(user, canonical, async () => assert.fail("No fallback read after migration")), canonical);
});

test("failed, truncated, uncounted and oversized reads retain the original wallet without partial activity", async () => {
  const data = Array.from({ length: 1001 }, (_, index) => row(index + 1));
  const cases = ["failed", "truncated", "no-count", "too-many", "too-large", "repeated"];
  for (const failure of cases) {
    const db = fakeDatabase(data); let page = 0;
    const fetcher = async (url, options) => {
      if (options.method === "HEAD") return db.fetcher(url, options);
      page++;
      if (failure === "failed" && page > 1) return new Response(null, { status: 503 });
      if (failure === "truncated" && page > 1) return Response.json([], { headers: { "content-range": "*/0" } });
      if (failure === "no-count") return Response.json([], { headers: { "content-range": "*/*" } });
      if (failure === "too-large") return new Response("x".repeat(300_000), { headers: { "content-range": "0-999/1001" } });
      if (failure === "repeated" && page > 1) { const first = new URL(url); first.searchParams.delete("or"); return db.fetcher(first, options); }
      return db.fetcher(url, options);
    };
    const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", fetcher, now: () => today, maxRows: failure === "too-many" ? 1000 : 10000 });
    assert.equal(await enrich(user, wallet, async () => wallet), wallet, failure);
  }
});

test("slow usage reads time out, cancel transport, and never delay a wallet indefinitely", async () => {
  let aborted = false;
  const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", timeoutMs: 25,
    fetcher: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => { aborted = true; reject(options.signal.reason); }, { once: true })) });
  const [result] = await Promise.all([enrich(user, wallet, async () => wallet), delay(60)]);
  assert.equal(result, wallet); assert.equal(aborted, true);
});

test("a stalled response body is cancelled when the whole usage read times out", async () => {
  let cancelled = false;
  const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", timeoutMs: 25,
    fetcher: async (_url, options) => options.method === "HEAD" ? new Response(null, { headers: { "content-range": "*/1" } })
      : new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("[")); },
        cancel() { cancelled = true; } }), { headers: { "content-range": "0-0/1" } }) });
  const [result] = await Promise.all([enrich(user, wallet, async () => wallet), delay(60)]);
  assert.equal(result, wallet); assert.equal(cancelled, true);
});

test("parallel refreshes coalesce and new wallets cannot exceed the query concurrency budget", async () => {
  const db = fakeDatabase([]); let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const enrich = createWalletUsage({ url: "https://database.example", key: "private-service-key", maxInFlight: 1,
    now: () => today, fetcher: async (...args) => { await gate; return db.fetcher(...args); } });
  const first = enrich(user, wallet, async () => wallet), second = enrich(user, wallet, async () => assert.fail("Coalesced"));
  assert.equal(await enrich(other, wallet, async () => assert.fail("Concurrency cap")), wallet);
  release();
  const [one, two] = await Promise.all([first, second]); assert.deepEqual(one, two); assert.equal(db.requests.length, 2);
});

test("legacy service wallet still succeeds when the compatibility query is unavailable", async () => {
  const config = { supabaseUrl: "https://database.example", supabaseKey: "private-service-key", publicUrl: "https://credits.example", stripeKey: "sk_test_fixture",
    stripeWebhookSecret: "fixture", openaiKey: "fixture", anthropicKey: "fixture", live: false, port: 8080 };
  const requests = [];
  const service = createService(config, { fetcher: async (target, options) => {
    const url = new URL(target); requests.push({ url, options });
    if (url.pathname === "/auth/v1/user") return Response.json({ id: user, email: "peer@example.com", email_confirmed_at: "2026-10-01" });
    if (url.pathname === "/rest/v1/rpc/zebby_wallet") return Response.json(wallet);
    return new Response(null, { status: 503 });
  } });
  const result = await service.handle("GET", "/v1/wallet", undefined, "user-token", new AbortController().signal);
  assert.deepEqual(result, wallet);
  assert.equal(requests.filter(({ options }) => options.method === "POST").length, 1, "Only the original wallet RPC can run; no accounting mutation is added");
});

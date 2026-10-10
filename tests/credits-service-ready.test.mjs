import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { CreditsClient } from "../desktop/credits-client.ts";
import { needsServiceWakeup, waitForCreditsService } from "../desktop/credits-service-ready.ts";

const origin = "https://fixture.onrender.com";
const wallet = { balance: 500000000, reserved: 0, used: 0, purchased: 500000000,
  updatedAt: new Date().toISOString(), recent: [] };
function stored() {
  return JSON.stringify({ url: origin, session: { id: randomUUID(), deviceId: randomUUID(),
    access: "zby_device_fixture", refresh: "zby_device_fixture", expires: Number.MAX_SAFE_INTEGER, email: "", kind: "guest" }, wallet });
}

test("Render readiness is checked on first use and after idle time, without a background keepalive", () => {
  assert.equal(needsServiceWakeup(origin, 0), true);
  assert.equal(needsServiceWakeup(origin, 1000, 1001), false);
  assert.equal(needsServiceWakeup(origin, 1000, 1000 + 12 * 60 * 1000), true);
  assert.equal(needsServiceWakeup("https://credits.example", 0), false);
  assert.equal(needsServiceWakeup("https://onrender.com.example", 0), false);
});

test("startup HTML, network failures and unhealthy JSON are retried through public health checks", async () => {
  let calls = 0;
  await waitForCreditsService(origin, async (url, options) => {
    assert.equal(url, origin + "/health");
    assert.equal(options.method, "GET");
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    calls++;
    if (calls === 1) return new Response("Starting the service", { status: 503 });
    if (calls === 2) throw new TypeError("Network unavailable");
    if (calls === 3) return Response.json({ ok: false }, { status: 503 });
    return Response.json({ ok: true, mode: "live" });
  }, new AbortController().signal, { retryMs: 1, waitMs: 1000 });
  assert.equal(calls, 4);
});

test("an unavailable service has a bounded wait", async () => {
  await assert.rejects(waitForCreditsService(origin, async () => new Response("Still starting", { status: 503 }),
    new AbortController().signal, { waitMs: 25, retryMs: 1 }), /did not become ready/);
});

test("checkout waits for readiness and is sent once, with warm requests skipping the preflight", async () => {
  const paths = []; let healthChecks = 0;
  const client = new CreditsClient(origin, { save: async () => {}, onChange() {}, fetcher: async (url, options) => {
    const path = new URL(url).pathname; paths.push(path);
    if (path === "/health") {
      assert.equal(options.headers, undefined);
      if (++healthChecks === 1) return new Response("Starting service", { status: 503 });
      return Response.json({ ok: true, mode: "live" });
    }
    if (path === "/v1/checkout") return Response.json({ id: "cs_live_fixture", url: "https://checkout.stripe.com/c/pay/fixture", mode: "live" });
    assert.equal(path, "/v1/wallet"); return Response.json(wallet);
  } });
  client.restore(stored());
  await client.checkout("starter"); await client.refreshWallet();
  assert.deepEqual(paths, ["/health", "/health", "/v1/checkout", "/v1/wallet"]);
});

test("a checkout transport failure is not replayed after the service becomes ready", async () => {
  let posts = 0;
  const client = new CreditsClient(origin, { save: async () => {}, onChange() {}, fetcher: async (url) => {
    if (url.endsWith("/health")) return Response.json({ ok: true, mode: "test" });
    posts++; throw new TypeError("Reply lost");
  } });
  client.restore(stored());
  await assert.rejects(client.checkout("starter"), /Reply lost/);
  assert.equal(posts, 1);
  assert.equal(client.state("gpt-6-luna").wallet.balance, wallet.balance);
});

test("cancelling an analysis during startup preserves wallet access and never sends the paid request", async () => {
  const paths = []; const controller = new AbortController(); let saved;
  const client = new CreditsClient(origin, { save: async value => { saved = value; }, onChange() {},
    fetcher: async (url, options) => {
      const path = new URL(url).pathname; paths.push(path);
      if (path === "/health") {
        if (paths.length === 1) controller.abort(new DOMException("Cancelled", "AbortError"));
        return Response.json({ ok: true, mode: "live" });
      }
      assert.equal(path, "/v1/wallet"); return Response.json(wallet);
    } });
  const original = stored(); client.restore(original);
  await assert.rejects(client.analyze(randomUUID(), {}, controller.signal), { name: "AbortError" });
  await client.refreshWallet();
  assert.ok(!paths.includes("/v1/analysis"));
  assert.deepEqual(JSON.parse(saved).session, JSON.parse(original).session);
  assert.equal(client.state("gpt-6-luna").wallet.balance, wallet.balance);
});

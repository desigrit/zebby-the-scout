import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdtemp, readdir, mkdir, rmdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createService } from "../credits-service/service.ts";
import { CreditsClient } from "../desktop/credits-client.ts";
import { writeProfileSettings } from "../desktop/settings-persistence.ts";
import { DiagnosticLog } from "../desktop/diagnostic-log.ts";
import { clientAddress, trustedProxyHops } from "../credits-service/client-address.ts";

test("wallet rate limits trust only a configured, bounded proxy chain", () => {
  assert.equal(trustedProxyHops(undefined), 0);
  assert.equal(trustedProxyHops(" 2 "), 2);
  for (const invalid of ["-1", "5", "true", "1.5", "1e0"]) assert.throws(() => trustedProxyHops(invalid), /0 to 4/);
  assert.equal(clientAddress("::ffff:192.0.2.5", "203.0.113.2"), "192.0.2.5");
  assert.equal(clientAddress("192.0.2.5", "198.51.100.99, 203.0.113.2", 1), "203.0.113.2");
  assert.equal(clientAddress("192.0.2.5", "198.51.100.99, 203.0.113.2, 192.0.2.6", 2), "203.0.113.2");
  assert.equal(clientAddress("192.0.2.5", "2001:0DB8:0000::1", 1), "2001:db8::1");
  for (const invalid of [undefined, "spoofed, 203.0.113.2", "203.0.113.2:456", ["203.0.113.2"], "1".repeat(2050)]) {
    assert.equal(clientAddress("192.0.2.5", invalid, 1), "192.0.2.5");
  }
  assert.equal(clientAddress("192.0.2.5", "203.0.113.2", 2), "192.0.2.5");
  assert.equal(clientAddress("192.0.2.5", "203.0.113.2", 5), "192.0.2.5");
});

const config = { supabaseUrl: "https://database.example", supabaseKey: "server-secret", publicUrl: "https://credits.example",
  stripeKey: "sk_test_fixture", stripeWebhookSecret: "whsec_fixture", openaiKey: "provider-fixture", anthropicKey: "", live: false, port: 8080 };
const legacyId = "11111111-1111-4111-8111-111111111111";
const token = () => "zby_device_" + randomBytes(32).toString("hex");
const recovery = () => "ZEBBY-" + randomBytes(20).toString("hex").toUpperCase().match(/.{8}/g).join("-");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const input = { company: "Example", title: "Product Manager", jobDescription: "Lead product strategy, customer discovery, design and engineering. ".repeat(10),
  resumeText: "Product manager with experience in customer discovery, roadmaps and measurement." };
async function fixture() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const sql = await readFile(new URL("../credits-service/schema.sql", import.meta.url), "utf8");
  await db.exec(sql);
  const state = { authCalls: 0, providerCalls: 0, checkouts: new Map() };
  const fetcher = async (target, options = {}) => {
    const url = new URL(target);
    if (url.hostname === "database.example") {
      if (url.pathname === "/auth/v1/user") {
        state.authCalls++;
        return options.headers.Authorization === "Bearer legacy" ? Response.json({ id: legacyId, email: "old@example.com", email_confirmed_at: new Date().toISOString() })
          : Response.json({}, { status: 401 });
      }
      const name = url.pathname.split("/").at(-1);
      const body = options.body ? JSON.parse(options.body) : undefined;
      if (url.pathname.includes("/rpc/")) {
        try {
          const keys = Object.keys(body), parameters = keys.map((key, i) => `${key} => $${i + 1}`).join(",");
          return Response.json((await db.query(`select ${name}(${parameters}) as result`, Object.values(body))).rows[0].result);
        } catch (error) { return Response.json({ message: error.message }, { status: 400 }); }
      }
      assert.match(name, /^zebby_(purchases|quotes|runs)$/);
      if (options.method === "POST") {
        const keys = Object.keys(body);
        return Response.json((await db.query(`insert into ${name}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`, Object.values(body))).rows);
      }
      const parameters = [], conditions = [];
      for (const [key, value] of url.searchParams) if (key !== "select") {
        assert.match(key, /^[a-z_]+$/); assert.ok(value.startsWith("eq.")); parameters.push(value.slice(3)); conditions.push(`${key}=$${parameters.length}`);
      }
      if (options.method === "PATCH") {
        const assignments = Object.entries(body).map(([key, value]) => { parameters.push(value); return `${key}=$${parameters.length}`; });
        await db.query(`update ${name} set ${assignments.join(",")} where ${conditions.join(" and ")}`, parameters);
        return new Response(null, { status: 204 });
      }
      return Response.json((await db.query(`select * from ${name} where ${conditions.join(" and ") || "true"}`, parameters)).rows);
    }
    if (url.hostname === "api.stripe.com") {
      if (options.method === "POST") {
        const fields = new URLSearchParams(options.body), id = "cs_test_" + fields.get("metadata[purchase_id]").replaceAll("-", "");
        state.checkouts.set(id, fields);
        return Response.json({ id, url: "https://checkout.stripe.com/c/pay/" + id });
      }
      return Response.json({ status: "open" });
    }
    if (url.hostname === "api.openai.com") {
      state.providerCalls++;
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ score: 68,
        explanation: "The resume demonstrates product strategy, discovery and roadmaps. Enterprise risk is not demonstrated." }) }] }],
      usage: { input_tokens: 5000, output_tokens: 1000 } });
    }
    assert.fail("Unexpected fixture request " + target);
  };
  const service = createService(config, { fetcher });
  const request = (access, route, body, ip = randomUUID()) => service.handle(body === undefined ? "GET" : "POST", route, body, access, new AbortController().signal, ip);
  async function pay(access) {
    const session = await request(access, "/v1/checkout", { pack: "starter", requestId: randomUUID() });
    const fields = state.checkouts.get(session.id);
    const event = { id: "evt_" + randomUUID(), type: "checkout.session.completed", livemode: false, data: { object: {
      id: session.id, payment_status: "paid", currency: "usd", amount_subtotal: 500, payment_intent: "pi_" + randomUUID(),
      client_reference_id: fields.get("client_reference_id"), metadata: { user_id: fields.get("metadata[user_id]"),
        purchase_id: fields.get("metadata[purchase_id]"), pack: "starter" },
    } } };
    const raw = Buffer.from(JSON.stringify(event)), time = Math.floor(Date.now() / 1000);
    const signature = `t=${time},v1=${createHmac("sha256", config.stripeWebhookSecret).update(time + ".").update(raw).digest("hex")}`;
    await service.webhook(raw, signature); await service.webhook(raw, signature);
    return session;
  }
  function bridge(after = () => {}) {
    return async (url, options) => {
      const parsed = new URL(url), body = options.body ? JSON.parse(options.body) : undefined;
      try {
        const result = await request((options.headers.Authorization || "").replace("Bearer ", ""), parsed.pathname, body);
        after(parsed.pathname, result, body);
        return Response.json(result);
      } catch (error) {
        if (error instanceof TypeError) throw error;
        return Response.json({ error: error.message }, { status: error.status || 503 });
      }
    };
  }
  return { db, sql, request, pay, bridge, state, service };
}

test("guest credit wallets preserve ownership, payments and recovery", async (t) => {
  const f = await fixture(), owner = token(), another = token();
  let wallet, code, paired;
  try {
    await t.test("silent creation is idempotent and cannot mint credits", async () => {
      wallet = await f.request("", "/v1/wallet/guest", { deviceToken: owner, name: "Windows desktop" });
      assert.deepEqual(await f.request("", "/v1/wallet/guest", { deviceToken: owner, name: "Windows desktop" }), wallet);
      assert.equal((await f.request(owner, "/v1/wallet")).balance, 0);
      assert.equal(f.state.authCalls, 0);
      await assert.rejects(f.request(token(), "/v1/wallet"), (error) => error.status === 401);
      await assert.rejects(f.request("zby_device_weak", "/v1/wallet"), (error) => error.status === 401);
      assert.equal((await f.db.query("select count(*)::int as total from zebby_wallets")).rows[0].total, 1);
    });
    await t.test("Stripe guest checkout collects payment without an email-code account", async () => {
      const checkout = await f.pay(owner), fields = f.state.checkouts.get(checkout.id);
      assert.equal(fields.get("customer_email"), null); assert.equal(fields.get("customer_creation"), "if_required");
      assert.equal((await f.request(owner, "/v1/wallet")).balance, 500000000);
      assert.equal(f.state.authCalls, 0);
      assert.equal((await f.db.query("select count(*)::int as total from zebby_ledger where kind='purchase'")).rows[0].total, 1);
    });
    await t.test("recovery links an independent device to the same balance using hashes only", async () => {
      code = recovery(); await f.request(owner, "/v1/wallet/recovery", { code });
      const device = { deviceToken: another, name: "Mac laptop", code };
      const restored = await f.request("", "/v1/wallet/restore", device);
      assert.equal(restored.walletId, wallet.walletId); assert.notEqual(restored.deviceId, wallet.deviceId);
      assert.deepEqual(await f.request("", "/v1/wallet/restore", device), restored);
      assert.equal((await f.request(another, "/v1/wallet")).balance, 500000000);
      const stored = JSON.stringify((await f.db.query("select * from zebby_devices")).rows) + JSON.stringify((await f.db.query("select * from zebby_recovery_codes")).rows);
      assert.ok(!stored.includes(owner)); assert.ok(!stored.includes(another)); assert.ok(!stored.includes(code));
      const access = await f.request(another, "/v1/wallet/access");
      assert.equal(access.devices.length, 2); assert.equal(access.devices.find((item) => item.id === restored.deviceId).current, true);
    });
    await t.test("pairing is single use, repeat-safe for a lost reply, and shares deductions", async () => {
      const pairing = await f.request(owner, "/v1/wallet/pairing", {}), third = token();
      paired = await f.request("", "/v1/wallet/connect", { deviceToken: third, name: "Second Windows computer", code: pairing.code });
      assert.equal(paired.walletId, wallet.walletId);
      assert.deepEqual(await f.request("", "/v1/wallet/connect", { deviceToken: third, name: "Second Windows computer", code: pairing.code }), paired);
      await assert.rejects(f.request("", "/v1/wallet/connect", { deviceToken: token(), name: "Unlinked", code: pairing.code }), (error) => error.status === 400);
      const quote = await f.request(third, "/v1/quotes", { kind: "match", model: "gpt-6-luna", input });
      const run = { quoteId: quote.id, requestId: randomUUID(), input };
      assert.equal((await f.request(third, "/v1/analysis", run)).result.score, 68);
      await f.request(another, "/v1/analysis", run);
      assert.equal(f.state.providerCalls, 1);
      const a = await f.request(owner, "/v1/wallet"), b = await f.request(another, "/v1/wallet");
      assert.equal(a.balance, b.balance); assert.equal(a.used, 1000000);
    });
    await t.test("expired, cancelled and replaced pairing codes cannot connect computers", async () => {
      let pairing = await f.request(owner, "/v1/wallet/pairing", {});
      await f.db.query("update zebby_pairing_codes set expires_at=now()-interval '1 second' where wallet_id=$1", [wallet.walletId]);
      await assert.rejects(f.request("", "/v1/wallet/connect", { deviceToken: token(), name: "Expired", code: pairing.code }), (error) => error.status === 400);
      pairing = await f.request(owner, "/v1/wallet/pairing", {});
      await f.request(owner, "/v1/wallet/pairing/cancel", { code: pairing.code });
      await assert.rejects(f.request("", "/v1/wallet/connect", { deviceToken: token(), name: "Cancelled", code: pairing.code }), (error) => error.status === 400);
      pairing = await f.request(owner, "/v1/wallet/pairing", {});
      await f.request(owner, "/v1/wallet/pairing", {});
      await assert.rejects(f.request("", "/v1/wallet/connect", { deviceToken: token(), name: "Replaced", code: pairing.code }), (error) => error.status === 400);
    });
    await t.test("disconnecting another computer revokes its bearer without deleting funds", async () => {
      const session = await f.request(another, "/v1/wallet/session"), before = await f.request(owner, "/v1/wallet");
      await assert.rejects(f.request(another, `/v1/wallet/devices/${session.deviceId}/remove`, {}), (error) => error.status === 400);
      const outsider = token(); await f.request("", "/v1/wallet/guest", { deviceToken: outsider, name: "Different wallet" });
      await assert.rejects(f.request(outsider, `/v1/wallet/devices/${session.deviceId}/remove`, {}), (error) => error.status === 404);
      await f.request(owner, `/v1/wallet/devices/${session.deviceId}/remove`, {});
      await assert.rejects(f.request(another, "/v1/wallet"), (error) => error.status === 401);
      assert.equal((await f.request(owner, "/v1/wallet")).balance, before.balance);
      assert.equal((await f.request(owner, "/v1/wallet/access")).devices.length, 2);
    });
    await t.test("regenerating recovery preserves devices and invalidates the old code", async () => {
      const before = await f.request(owner, "/v1/wallet/access"), replacement = recovery();
      const issued = await f.request(owner, "/v1/wallet/recovery", { code: replacement });
      assert.notEqual(issued.version, before.recoveryVersion);
      assert.equal((await f.request(owner, "/v1/wallet/recovery", { code: replacement })).version, issued.version);
      await assert.rejects(f.request("", "/v1/wallet/restore", { deviceToken: token(), name: "Old code", code }), (error) => error.status === 400);
      assert.equal((await f.request(owner, "/v1/wallet/access")).devices.length, before.devices.length);
    });
    await t.test("previous email-based wallets migrate without changing their ledger identity", async () => {
      await f.request("legacy", "/v1/wallet");
      await f.db.query("update zebby_wallets set balance=123456789,purchased=500000000,used=1000000 where user_id=$1", [legacyId]);
      const migratedToken = token(), migrated = await f.request("legacy", "/v1/wallet/device", { deviceToken: migratedToken, name: "Older installation" });
      assert.equal(migrated.walletId, legacyId);
      assert.equal((await f.request(migratedToken, "/v1/wallet")).balance, 123456789);
      assert.equal((await f.request(migratedToken, "/v1/wallet")).used, 1000000);
    });
    await t.test("public and ordinary Supabase users cannot call guest ledger functions directly", async () => {
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(f.db.transaction(async (tx) => { await tx.exec("set local role " + role); await tx.query("select * from zebby_devices"); }), /permission denied/);
        await assert.rejects(f.db.transaction(async (tx) => { await tx.exec("set local role " + role); await tx.query("select zebby_guest($1,$2,$3)", [randomUUID(), hash(token()), "Forbidden"]); }), /permission denied/);
      }
    });
    await t.test("the updated schema is repeatable and preserves funded wallets", async () => {
      const before = await f.request(owner, "/v1/wallet"); await f.db.exec(f.sql);
      assert.deepEqual(await f.request(owner, "/v1/wallet"), before);
      assert.equal((await f.request(owner, "/v1/wallet/access")).hasRecoveryCode, true);
    });
    await t.test("unauthenticated connection attempts are rate-limited", async () => {
      for (let i = 0; i < 8; i++) await assert.rejects(f.request("", "/v1/wallet/restore", { deviceToken: token(), name: "Guess", code: recovery() }, "limited-ip"), (error) => error.status === 400);
      await assert.rejects(f.request("", "/v1/wallet/restore", { deviceToken: token(), name: "Guess", code: recovery() }, "limited-ip"), (error) => error.status === 429);
    });
  } finally { await f.db.close(); }
});

test("desktop wallet connections survive lost replies and local persistence failures", async (t) => {
  const f = await fixture();
  try {
    await t.test("checkout saves a private device credential before silent wallet creation", async () => {
      let stored = "";
      const client = new CreditsClient(config.publicUrl, { deviceName: "Windows desktop", save: async (value) => { stored = value; }, onChange() {},
        fetcher: f.bridge((route, _result, body) => { if (route === "/v1/wallet/guest") assert.equal(JSON.parse(stored).candidate.token, body.deviceToken); }) });
      await client.checkout("starter");
      assert.equal(client.state("gpt-6-luna").signedIn, true);
      assert.equal(client.state("gpt-6-luna").email, "");
      const access = JSON.parse(stored).session.access;
      assert.ok(!JSON.stringify(client.state("gpt-6-luna")).includes(access));
      const restarted = new CreditsClient(config.publicUrl, { save: async () => {}, onChange() {}, fetcher: f.bridge() }); restarted.restore(stored);
      await restarted.refreshWallet(); assert.equal(restarted.state("gpt-6-luna").wallet.balance, 0);
      assert.equal(f.state.authCalls, 0);
    });
    await t.test("failed secure persistence prevents creating a wallet or opening checkout", async () => {
      let called = false;
      const client = new CreditsClient(config.publicUrl, { save: async () => { throw new Error("Secure storage failed"); }, onChange() {},
        fetcher: async () => { called = true; assert.fail("No payment request may run"); } });
      await assert.rejects(client.checkout("starter"), /Secure storage failed/); assert.equal(called, false);
    });
    await t.test("a lost pairing reply can be recovered after restarting with the candidate token", async () => {
      const owner = token(), session = await f.request("", "/v1/wallet/guest", { deviceToken: owner, name: "Origin" }); await f.pay(owner);
      const pairing = await f.request(owner, "/v1/wallet/pairing", {}); let stored = "", lose = true;
      const client = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge((route) => {
        if (route === "/v1/wallet/connect" && lose) { lose = false; throw new TypeError("Reply lost after connection"); }
      }) });
      await assert.rejects(client.connectWallet("connect", pairing.code), /Reply lost/);
      assert.ok(JSON.parse(stored).candidate);
      const restarted = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge() }); restarted.restore(stored);
      await restarted.refreshWallet();
      assert.equal(JSON.parse(stored).session.id, session.walletId); assert.equal(JSON.parse(stored).candidate, null);
      assert.equal(restarted.state("gpt-6-luna").wallet.balance, 500000000);
    });
    await t.test("a failed final settings save still preserves the linked credential for restart recovery", async () => {
      const owner = token(); await f.request("", "/v1/wallet/guest", { deviceToken: owner, name: "Source" }); await f.pay(owner);
      const pairing = await f.request(owner, "/v1/wallet/pairing", {}); let stored = "", fail = true;
      const client = new CreditsClient(config.publicUrl, { onChange() {}, fetcher: f.bridge(), save: async (value) => {
        if (fail && JSON.parse(value).session) { fail = false; throw new Error("Settings disk full"); } stored = value;
      } });
      await assert.rejects(client.connectWallet("connect", pairing.code), /disk full/);
      assert.equal(JSON.parse(stored).session, null); assert.ok(JSON.parse(stored).candidate);
      const restarted = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge() }); restarted.restore(stored);
      await restarted.refreshWallet(); assert.equal(restarted.state("gpt-6-luna").wallet.balance, 500000000);
    });
    await t.test("a lost recovery-code acknowledgement reuses the saved secret and version", async () => {
      let stored = "", lose = true;
      const client = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge((route) => {
        if (route === "/v1/wallet/recovery" && lose) { lose = false; throw new TypeError("Recovery acknowledgement lost"); }
      }) });
      await client.checkout("starter"); await client.refreshAccess();
      await assert.rejects(client.recoveryCode(), /acknowledgement lost/);
      const generated = JSON.parse(stored).recovery.code;
      const restarted = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge() }); restarted.restore(stored);
      await restarted.refreshAccess(); assert.equal(await restarted.recoveryCode(), generated);
      await restarted.markRecoverySaved(); assert.equal(restarted.state("gpt-6-luna").recoverySaved, true);
      assert.ok(!JSON.stringify(restarted.state("gpt-6-luna")).includes(generated));
    });
    await t.test("an authentication failure cannot erase a purchased wallet or create an empty replacement", async () => {
      let stored = "", reject = false, creations = 0;
      const client = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: async (url, options) => {
        if (reject) return Response.json({ error: "Computer disconnected" }, { status: 401 });
        if (new URL(url).pathname === "/v1/wallet/guest") creations++;
        return f.bridge()(url, options);
      } });
      await client.checkout("starter"); await f.pay(JSON.parse(stored).session.access); await client.refreshWallet();
      const original = JSON.parse(stored).session.access;
      reject = true; await assert.rejects(client.refreshWallet(), /disconnected/); await assert.rejects(client.checkout("starter"), /disconnected/);
      assert.equal(JSON.parse(stored).session.access, original); assert.equal(creations, 1);
      assert.equal(client.state("gpt-6-luna").wallet.balance, 500000000); assert.equal(client.state("gpt-6-luna").stale, true);
    });
    await t.test("malformed optional recovery metadata cannot discard valid wallet access", async () => {
      let stored = ""; const client = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge() });
      await client.checkout("starter");
      const snapshot = JSON.parse(stored); snapshot.recovery = { invalid: true }; snapshot.pending = [null];
      const restarted = new CreditsClient(config.publicUrl, { save: async () => {}, onChange() {}, fetcher: f.bridge() }); restarted.restore(JSON.stringify(snapshot));
      await restarted.refreshWallet(); assert.equal(restarted.state("gpt-6-luna").signedIn, true);
    });
    await t.test("unreadable encrypted access requires explicit recovery instead of silently replacing it", async () => {
      const client = new CreditsClient(config.publicUrl, { save: async () => {}, onChange() {}, fetcher: () => assert.fail("No fresh wallet") });
      client.restoreFailed(); await assert.rejects(client.checkout("starter"), /could not be read/);
    });
    await t.test("changing the service origin cannot silently overwrite an older wallet credential", async () => {
      let stored = "";
      const client = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge() });
      await client.checkout("starter");
      const moved = new CreditsClient("https://another.example", { save: async () => assert.fail("Do not overwrite old access"), onChange() {}, fetcher: () => assert.fail("Do not create a replacement wallet") });
      moved.restore(stored); await assert.rejects(moved.checkout("starter"), /could not be read/);
    });
    await t.test("a recovery code that has not been exported cannot permit losing a funded wallet", async () => {
      let stored = "";
      const client = new CreditsClient(config.publicUrl, { save: async (value) => { stored = value; }, onChange() {}, fetcher: f.bridge() });
      await client.checkout("starter"); await f.pay(JSON.parse(stored).session.access); await client.refreshWallet();
      await client.recoveryCode(); const previous = JSON.parse(stored).session.id;
      await assert.rejects(client.connectWallet("restore", recovery()), /to a file before switching/);
      assert.equal(JSON.parse(stored).session.id, previous); assert.equal(client.state("gpt-6-luna").wallet.balance, 500000000);
    });
  } finally { await f.db.close(); }
});

test("local settings commit as complete files and wallet credentials stay out of logs", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "zebby-wallet-tests-"));
  const filename = path.join(folder, "settings.json"), failed = path.join(folder, "not-a-file");
  try {
    await writeProfileSettings(filename, JSON.stringify({ encryptedCreditSession: "encrypted-one" }));
    await writeProfileSettings(filename, JSON.stringify({ encryptedCreditSession: "encrypted-two" }));
    assert.equal(JSON.parse(await readFile(filename, "utf8")).encryptedCreditSession, "encrypted-two");
    await mkdir(failed); await assert.rejects(writeProfileSettings(failed, "encrypted"));
    assert.equal((await readdir(folder)).some((name) => name.endsWith(".tmp")), false);
    const log = new DiagnosticLog(() => folder);
    const credential = token(), code = recovery();
    log.error("Edge-case fixture", new Error(credential + " " + code)); await log.flush();
    const logged = await readFile(path.join(folder, "tracker.log"), "utf8");
    assert.ok(!logged.includes(credential)); assert.ok(!logged.includes(code)); assert.match(logged, /redacted/);
  } finally {
    await unlink(filename).catch(() => {}); await unlink(path.join(folder, "tracker.log")).catch(() => {}); await rmdir(failed).catch(() => {}); await rmdir(folder);
  }
});

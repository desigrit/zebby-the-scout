import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { CREDIT_PACKS, CREDIT_ESTIMATE, CREDIT_MODELS, NANODOLLARS_PER_CREDIT, onlineModel, usageCost, maximumCost, outputLimit, quoteNeedsCredits } from "../shared/online-models.ts";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { CreditsClient } from "../desktop/credits-client.ts";
import { createService } from "../credits-service/service.ts";
import { serviceConfig } from "../credits-service/config.ts";
import { verifyStripeEvent } from "../credits-service/stripe.ts";
import { runSelectedAnalysis } from "../desktop/analysis-routing.ts";
import { creditUsage } from "../shared/credit-usage.ts";

test("credit usage shows the remaining share of purchased credits", () => {
  assert.deepEqual(creditUsage({ balance: 2790_000_000, reserved: 0, used: 210_000_000, purchased: 3000_000_000 }),
    { available: 2790_000_000, total: 3000_000_000, percentRemaining: 93 });
});
test("credit usage excludes reservations without counting them as spent", () => {
  const value = creditUsage({ balance: 2790_000_000, reserved: 300_000_000, used: 210_000_000, purchased: 3000_000_000 });
  assert.equal(value.available, 2490_000_000);
  assert.equal(value.percentRemaining, 83);
  assert.equal(creditUsage({ balance: 100, reserved: 110, used: 0, purchased: 100 }).available, 0);
});
test("credit usage handles empty, exhausted and restored balances", () => {
  assert.deepEqual(creditUsage({ balance: 0, reserved: 0, used: 0, purchased: 0 }), { available: 0, total: 0, percentRemaining: 0 });
  assert.equal(creditUsage({ balance: 0, reserved: 0, used: 500_000_000, purchased: 500_000_000 }).percentRemaining, 0);
  assert.equal(creditUsage({ balance: 100_000_000, reserved: 0, used: 0, purchased: 0 }).percentRemaining, 100);
});

const userId = "11111111-1111-4111-8111-111111111111", otherId = "22222222-2222-4222-8222-222222222222";
const config = { supabaseUrl: "https://database.example", supabaseKey: "server-secret", publicUrl: "https://credits.example",
  stripeKey: "sk_test_fixture", stripeWebhookSecret: "whsec_fixture", openaiKey: "openai-fixture", anthropicKey: "claude-fixture", live: false, port: 8080 };
const input = { company: "Example", title: "Product Manager", jobDescription: "Lead customer discovery and product strategy. Own product outcomes and work across design and engineering. ".repeat(220),
  resumeText: "Product manager with experience in customer discovery, roadmaps, product strategy and measurement.", currentCvOverview: "Product manager turning customer insights into useful products." };
const match = { score: 68, explanation: "Product strategy is demonstrated. Enterprise risk experience is not demonstrated." };
const plan = { ...match, keywords: Array.from({ length: 6 }, (_, i) => ({ text: "Keyword " + i, importance: 95 - i * 5 })),
  themes: Array.from({ length: 5 }, (_, i) => ({ text: "Theme " + i, importance: 92 - i * 5 })),
  overview: "Product manager turning discovery into measurable product outcomes.", overviewRationale: "Aligned the wording with product outcomes." };
function signature(event, secret = config.stripeWebhookSecret, timestamp = Math.floor(Date.now() / 1000)) {
  const raw = Buffer.from(JSON.stringify(event));
  return { raw, signature: `t=${timestamp},v1=${createHmac("sha256", secret).update(timestamp + ".").update(raw).digest("hex")}` };
}
test("credit pack counts use Sol High with explicitly estimated thinking tokens", () => {
  const example = usageCost(onlineModel(CREDIT_ESTIMATE.model), { input: 0, cached: 0, cacheWrite: CREDIT_ESTIMATE.input, output: CREDIT_ESTIMATE.output });
  assert.equal(example / NANODOLLARS_PER_CREDIT, 130);
  assert.deepEqual(CREDIT_PACKS.map((pack) => pack.analyses), [3, 23, 61, 123]);
  assert.deepEqual(CREDIT_MODELS.map((model) => model.id), ["gpt-6.1-sol", "gpt-6-astra"]);
  for (const pack of CREDIT_PACKS) {
    assert.ok(pack.analyses * example <= pack.credits * NANODOLLARS_PER_CREDIT);
    assert.ok(pack.credits * NANODOLLARS_PER_CREDIT - pack.analyses * example < example);
  }
  assert.equal(usageCost(onlineModel("gpt-6-astra"), { input: 20000, cached: 0, output: 6000 }) / NANODOLLARS_PER_CREDIT, 500);
  assert.equal(usageCost(onlineModel("gpt-6-luna"), { input: 100, cached: 50, output: 10 }), 10500);
  assert.throws(() => usageCost(onlineModel("gpt-6-luna"), { input: 1, cached: 2, output: 0 }));
  assert.throws(() => usageCost(onlineModel("gpt-6-luna"), { input: NaN, cached: 0, output: 0 }));
});
test("Stripe signatures reject changes, stale events, and invalid signatures", () => {
  const event = { id: "evt_fixture", livemode: false }, signed = signature(event);
  assert.deepEqual(verifyStripeEvent(signed.raw, signed.signature, config.stripeWebhookSecret), event);
  assert.throws(() => verifyStripeEvent(Buffer.from("{}"), signed.signature, config.stripeWebhookSecret));
  assert.throws(() => verifyStripeEvent(signed.raw, "t=1,v1=abc", config.stripeWebhookSecret));
  const old = signature(event, config.stripeWebhookSecret, 1);
  assert.throws(() => verifyStripeEvent(old.raw, old.signature, config.stripeWebhookSecret));
});

test("OpenAI cache writes are charged once at the published rate", async () => {
  const response = await onlineAnalysis({ model: "gpt-6-luna", key: "fixture", instructions: "Compare evidence.", input,
    name: "resume_match", schema: { type: "object" }, kind: "match", fetcher: async () => Response.json({
      status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(match) }] }],
      usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 }, output_tokens: 25 },
    }) });
  assert.deepEqual(response.usage, { input: 800, cached: 100, cacheWrite: 200, output: 25 });
  assert.equal(usageCost(onlineModel("gpt-6-luna"), response.usage), 108500);
  assert.ok(maximumCost(onlineModel("gpt-6-luna"), 1000, 0, "match") >= 108500);
});

test("OpenAI maximum quotes cover cache writes and long-context pricing", () => {
  const model = onlineModel("gpt-6-luna");
  assert.equal(usageCost(model, { input: 272000, cached: 0, output: 6000 }), 30200000);
  assert.equal(usageCost(model, { input: 272001, cached: 0, output: 6000 }), 58900200);
  const bound = maximumCost(model, 268000, 0, "plan");
  for (const usage of [
    { input: 0, cached: 0, cacheWrite: 280000, output: 6000 },
    { input: 140000, cached: 100000, cacheWrite: 140000, output: 6000 },
  ]) assert.ok(usageCost(model, usage) <= bound);
  assert.throws(() => usageCost(model, { input: -1, cached: 0, cacheWrite: 1001, output: 0 }));
});

test("Sonnet 5.5 cache hits use its published five-percent input rate", () => {
  assert.equal(usageCost(onlineModel("claude-sonnet-5-5"), { input: 100, cached: 50, output: 10 }), 205000);
});
test("recovering an already paid result is allowed with zero or negative balance", () => {
  const recovery = { id: randomUUID(), model: "gpt-6-luna", maximum: 0, expiresAt: new Date(Date.now()+60000).toISOString(), recovery: true };
  assert.equal(quoteNeedsCredits(recovery, 0), false); assert.equal(quoteNeedsCredits(recovery, -5000000), false);
  assert.equal(quoteNeedsCredits({ ...recovery, recovery: false, maximum: 5000000 }, 0), true);
});
test("service configuration defaults to test mode and rejects accidental live keys", () => {
  const env = { SUPABASE_URL: config.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: config.supabaseKey, ZEBBY_PUBLIC_SERVICE_URL: config.publicUrl,
    STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: config.stripeWebhookSecret };
  assert.equal(serviceConfig(env).live, false);
  assert.equal(serviceConfig({ ...env, STRIPE_SECRET_KEY: "rk_test_fixture" }).live, false);
  assert.throws(() => serviceConfig({ ...env, STRIPE_SECRET_KEY: "sk_live_fixture" }));
  assert.throws(() => serviceConfig({ ...env, STRIPE_SECRET_KEY: "rk_live_fixture" }));
  const liveEnv = { ...env, ZEBBY_ALLOW_LIVE_PAYMENTS: "true" };
  for (const prefix of ["sk_live_", "rk_live_"]) assert.equal(serviceConfig({ ...liveEnv, STRIPE_SECRET_KEY: prefix + "fixture" }).live, true);
  for (const prefix of ["sk_test_", "rk_test_", "pk_live_", "pk_test_"]) assert.throws(() => serviceConfig({ ...liveEnv, STRIPE_SECRET_KEY: prefix + "fixture" }));
  assert.throws(() => serviceConfig({ ...env, ZEBBY_PUBLIC_SERVICE_URL: "http://credits.example" }));
});
test("Anthropic uses structured Messages output and charges reported cache and output usage", async () => {
  let body;
  const response = await onlineAnalysis({ model: "claude-haiku-4-5-20251001", key: "fixture", instructions: "Compare evidence.", input,
    name: "resume_match", schema: { type: "object" }, kind: "match", fetcher: async (url, options) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages"); assert.equal(options.headers["anthropic-version"], "2023-06-01");
      body = JSON.parse(options.body);
      return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(match) }],
        usage: { input_tokens: 100, cache_read_input_tokens: 50, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 }, output_tokens: 25 } });
    } });
  assert.equal(body.output_config.format.type, "json_schema"); assert.equal(body.max_tokens, 3000);
  assert.equal(body.messages[0].content, JSON.stringify(input)); assert.deepEqual(response.result, match);
  assert.equal(usageCost(onlineModel("claude-haiku-4-5-20251001"), response.usage), 282500);
});
test("selected cloud providers never fall back to a smaller local model", async () => {
  const selection = { provider: "anthropic", ollamaUrl: "", ollamaModel: "", builtInModelId: "smollm2-360m" };
  await assert.rejects(runSelectedAnalysis(selection, { anthropic: async () => { throw new Error("offline"); },
    ready: () => assert.fail("fallback"), local: () => assert.fail("fallback"), openai: () => assert.fail("fallback"), ollama: () => assert.fail("fallback") },
    "", input, "resume_match", {}, ""), /offline/);
});
test("desktop paid session stays private, is recoverable, and cannot move to another service origin", async () => {
  let saved = "", requests = [];
  const wallet = { balance: 500000000, reserved: 0, used: 0, purchased: 500000000, updatedAt: new Date().toISOString(), recent: [] };
  const client = new CreditsClient(config.publicUrl, { save: async (value) => { saved = value; }, onChange() {}, fetcher: async (url, options) => {
    requests.push([url, options]);
    if (url.endsWith("/auth/verify")) return Response.json({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600, user: { email: "peer@example.com", id: userId } });
    if (url.endsWith("/auth/logout")) return Response.json({ signedOut: true });
    return Response.json(wallet);
  } });
  await client.verify("peer@example.com", "123456");
  assert.equal(client.state("gpt-6-luna").wallet.balance, wallet.balance);
  assert.doesNotMatch(JSON.stringify(client.state("gpt-6-luna")), /private-access|private-refresh/);
  const restored = new CreditsClient(config.publicUrl, { save: async () => {}, onChange() {} }); restored.restore(saved);
  assert.equal(restored.state("gpt-6-luna").signedIn, true); assert.equal(restored.state("gpt-6-luna").stale, true);
  const moved = new CreditsClient("https://other.example", { save: async () => {}, onChange() {} }); moved.restore(saved);
  assert.equal(moved.state("gpt-6-luna").signedIn, false);
  await client.signOut(); assert.equal(saved, ""); assert.equal(client.state("gpt-6-luna").wallet, null);
  assert.equal(requests.at(-1)[1].headers.Authorization, "Bearer private-access");
});

test("late account A responses cannot replace account B wallet or persisted session", async () => {
  let saved = "", release, started, delay = false;
  const ready = new Promise((resolve) => { started = resolve; });
  const wallet = (amount) => ({ balance: amount, reserved: 0, used: 0, purchased: amount, updatedAt: new Date().toISOString(), recent: [] });
  const client = new CreditsClient(config.publicUrl, { save: async (value) => { saved = value; }, onChange() {}, fetcher: async (url, options) => {
    if (url.endsWith("/auth/verify")) { const email = JSON.parse(options.body).email, isA = email === "a@example.com";
      return Response.json({ access_token: isA ? "access-a" : "access-b", refresh_token: isA ? "refresh-a" : "refresh-b", expires_in: 3600, user: { id: isA ? userId : otherId, email } }); }
    if (url.endsWith("/auth/logout")) return Response.json({ signedOut: true });
    if (options.headers.Authorization === "Bearer access-a" && delay) { started(); return new Promise((resolve) => { release = () => resolve(Response.json(wallet(500000000))); }); }
    return Response.json(wallet(options.headers.Authorization === "Bearer access-a" ? 500000000 : 9000000));
  } });
  await client.verify("a@example.com", "123456"); delay = true;
  const old = client.refreshWallet(), rejected = assert.rejects(old, /wallet changed/); await ready;
  await client.signOut(); await client.verify("b@example.com", "123456"); release(); await rejected;
  assert.equal(client.state("gpt-6-luna").email, "b@example.com"); assert.equal(client.state("gpt-6-luna").wallet.balance, 9000000);
  assert.equal(JSON.parse(saved).session.id, otherId); assert.equal(JSON.parse(saved).wallet.balance, 9000000);
});
test("simultaneous wallet refreshes are coalesced", async () => {
  let calls = 0;
  const wallet = { balance: 0, reserved: 0, used: 0, purchased: 0, updatedAt: new Date().toISOString(), recent: [] };
  const client = new CreditsClient(config.publicUrl, { save: async () => {}, onChange() {}, fetcher: async () => { calls++; return Response.json(wallet); } });
  client.restore(JSON.stringify({ url: config.publicUrl, session: { access: "fixture", refresh: "fixture", expires: Date.now() + 3600000, email: "peer@example.com", id: userId } }));
  await Promise.all([client.refreshWallet(), client.refreshWallet(), client.refreshWallet()]); assert.equal(calls, 1);
});

test("PostgreSQL ledger and service integration", async (t) => {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../credits-service/schema.sql", import.meta.url), "utf8"));
  async function rpc(name, data) {
    const keys = Object.keys(data), placeholders = keys.map((key, i) => `${key} => $${i + 1}`).join(",");
    const { rows } = await db.query(`select public.zebby_${name}(${placeholders}) as result`, Object.values(data)); return rows[0].result;
  }
  let providerCalls = 0, failProvider = false, abortProvider = false, providerResult = plan, lastProviderRequest;
  const fetcher = async (target, options = {}) => {
    const url = new URL(target);
    if (url.hostname === "database.example") {
      if (url.pathname === "/auth/v1/user") { const id = options.headers.Authorization === "Bearer other" ? otherId : userId;
        if (options.headers.Authorization === "Bearer invalid") return Response.json({}, { status: 401 });
        return Response.json({ id, email: "peer@example.com", email_confirmed_at: new Date().toISOString() }); }
      const name = url.pathname.split("/").at(-1);
      if (url.pathname.includes("/rpc/")) {
        try { return Response.json(await rpc(name.replace("zebby_", ""), JSON.parse(options.body))); }
        catch (error) { return Response.json({ message: error.message }, { status: 400 }); }
      }
      assert.match(name, /^zebby_(purchases|quotes|runs)$/);
      const body = options.body ? JSON.parse(options.body) : null;
      if (options.method === "POST") {
        const keys = Object.keys(body), values = keys.map((_, i) => "$" + (i + 1));
        return Response.json((await db.query(`insert into ${name}(${keys.join(",")}) values(${values.join(",")}) returning *`, Object.values(body))).rows);
      }
      const parameters = [], where = [];
      for (const [key, value] of url.searchParams) if (key !== "select") {
        assert.match(key, /^[a-z_]+$/); assert.ok(value.startsWith("eq.")); parameters.push(value.slice(3)); where.push(`${key}=$${parameters.length}`);
      }
      if (options.method === "PATCH") {
        const assignments = Object.entries(body).map(([key, value]) => { parameters.push(value); return `${key}=$${parameters.length}`; });
        await db.query(`update ${name} set ${assignments.join(",")} where ${where.join(" and ")}`, parameters); return new Response(null, { status: 204 });
      }
      return Response.json((await db.query(`select * from ${name} where ${where.join(" and ") || "true"}`, parameters)).rows);
    }
    if (url.hostname === "api.stripe.com") {
      if (options.method === "POST") { const fields = new URLSearchParams(options.body); assert.equal(fields.get("line_items[0][price_data][unit_amount]"), "500");
        return Response.json({ id: "cs_test_fixture", url: "https://checkout.stripe.com/c/pay/fixture" }); }
      return Response.json({ status: "open" });
    }
    assert.equal(url.hostname, "api.openai.com"); providerCalls++;
    const request = JSON.parse(options.body); lastProviderRequest = request; assert.equal(request.model, "gpt-6.1-sol"); assert.equal(request.store, false);
    if (abortProvider) { await new Promise((_, reject) => { options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }); }); }
    if (failProvider) return Response.json({ error: { message: "private resume content" } }, { status: 500 });
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(providerResult) }] }],
      usage: { input_tokens: 20000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 6000 } });
  };
  const service = createService(config, { fetcher }), controller = new AbortController();
  const handle = (method, path, value, token = "owner", signal = controller.signal) => service.handle(method, path, value, token, signal);
  const wallet = () => rpc("wallet", { p_user: userId });
  const newQuote = (thinkingLevel = "low") => handle("POST", "/v1/quotes", { model: "gpt-6.1-sol", thinkingLevel, kind: "plan", input });
  const analyze = (quoteId, requestId = randomUUID(), value = input, token = "owner", signal = controller.signal) =>
    handle("POST", "/v1/analysis", { quoteId, requestId, input: value }, token, signal);
  try {
    await t.test("checkout cannot credit a wallet until a signed matching paid event", async () => {
      const id = randomUUID(); await handle("POST", "/v1/checkout", { pack: "starter", requestId: id }); assert.equal((await wallet()).balance, 0);
      const event = { id: "evt_purchase", livemode: false, type: "checkout.session.completed", data: { object: {
        id: "cs_test_fixture", payment_status: "paid", currency: "usd", amount_subtotal: 500, client_reference_id: userId,
        payment_intent: "pi_fixture", metadata: { user_id: userId, purchase_id: id, pack: "starter" } } } };
      const unpaid = signature({ ...event, id: "evt_unpaid", data: { object: { ...event.data.object, payment_status: "unpaid" } } });
      await service.webhook(unpaid.raw, unpaid.signature); assert.equal((await wallet()).balance, 0);
      const tampered = signature({ ...event, id: "evt_bad", data: { object: { ...event.data.object, amount_subtotal: 50 } } });
      await assert.rejects(service.webhook(tampered.raw, tampered.signature), /does not match/);
      const live = signature({ ...event, livemode: true }); await assert.rejects(service.webhook(live.raw, live.signature), /mode/);
      const valid = signature(event); await service.webhook(valid.raw, valid.signature); await service.webhook(valid.raw, valid.signature);
      assert.equal((await wallet()).balance, 500 * NANODOLLARS_PER_CREDIT); assert.equal((await wallet()).purchased, 500 * NANODOLLARS_PER_CREDIT);
      assert.equal((await handle("GET", "/v1/checkout/cs_test_fixture")).status, "paid");
      await assert.rejects(handle("GET", "/v1/checkout/cs_test_fixture", undefined, "other"), /not found/);
    });
    await t.test("paid quotes bind thinking and reject unsupported models or request overrides", async () => {
      const high = await newQuote("high"), low = await newQuote(), calls = providerCalls;
      assert.equal(high.thinkingLevel, "high"); assert.ok(high.maximum > low.maximum);
      const stored = (await db.query("select thinking_level from zebby_quotes where id=$1", [high.id])).rows[0];
      assert.equal(stored.thinking_level, "high");
      assert.deepEqual((await handle("GET", "/v1/catalog")).models.map((model) => model.id), ["gpt-6.1-sol", "gpt-6-astra"]);
      for (const model of ["gpt-6-luna", "claude-sonnet-5-5"]) await assert.rejects(handle("POST", "/v1/quotes", { model, kind: "plan", input }));
      await assert.rejects(newQuote("off"));
      await assert.rejects(handle("POST", "/v1/analysis", { quoteId: high.id, requestId: randomUUID(), input, thinkingLevel: "max" }));
      assert.equal(providerCalls, calls); assert.equal((await wallet()).reserved, 0);
      // Apply the additive migration twice to an existing quote without losing it.
      const migration = await readFile(new URL("../credits-service/migrations/20261010_analysis_thinking.sql", import.meta.url), "utf8");
      await db.exec(migration); await db.exec(migration);
      assert.equal((await db.query("select thinking_level from zebby_quotes where id=$1", [high.id])).rows[0].thinking_level, "high");
    });
    await t.test("quotes bind ownership and content, and duplicate analysis charges once", async () => {
      const quote = await newQuote(), id = randomUUID();
      await assert.rejects(analyze(quote.id, id, input, "other"), /fresh/);
      await assert.rejects(analyze(quote.id, id, { ...input, resumeText: input.resumeText + "invented" }));
      const response = await analyze(quote.id, id); assert.equal(response.result.score, 68); assert.equal(response.wallet.used, 100 * NANODOLLARS_PER_CREDIT);
      assert.equal(lastProviderRequest.reasoning.effort, "low"); assert.equal(lastProviderRequest.max_output_tokens, outputLimit("plan", "low"));
      assert.equal(response.wallet.reserved, 0); const calls = providerCalls;
      await analyze(quote.id, id); assert.equal(providerCalls, calls); assert.equal((await wallet()).used, 100 * NANODOLLARS_PER_CREDIT);
      await assert.rejects(analyze(quote.id));
    });
    await t.test("lost paid replies recover with the same request, including after a restart before local save", async () => {
      let stored = "", loseReply = true;
      const source = { kind: "plan", id: randomUUID() }, quote = await newQuote(), before = (await wallet()).used, calls = providerCalls;
      const bridgeFetch = async (url, options) => {
        const parsed = new URL(url), body = options.body ? JSON.parse(options.body) : undefined;
        try {
          const result = await handle(options.method || "GET", parsed.pathname, body, "owner", options.signal);
          if (parsed.pathname === "/v1/analysis" && loseReply) { loseReply = false; throw new TypeError("Connection lost after settlement"); }
          return Response.json(result);
        } catch (error) { if (error instanceof TypeError) throw error; return Response.json({ error: error.message }, { status: error.status || 503 }); }
      };
      const options = { save: async (value) => { stored = value; }, onChange() {}, fetcher: bridgeFetch };
      const client = new CreditsClient(config.publicUrl, options);
      client.restore(JSON.stringify({ url: config.publicUrl, session: { access: "owner", refresh: "fixture", expires: Date.now() + 3600000, email: "peer@example.com", id: userId } }));
      assert.equal((await client.analyze(quote.id, input, new AbortController().signal, source)).score, 68);
      assert.equal(providerCalls, calls + 1); assert.equal((await wallet()).used, before + 100 * NANODOLLARS_PER_CREDIT);
      const originalId = JSON.parse(stored).pending[0].requestId;
      const restarted = new CreditsClient(config.publicUrl, options); restarted.restore(stored);
      const recovery = await restarted.recoveryQuote(source, input); assert.equal(recovery.recovery, true); assert.equal(recovery.maximum, 0);
      assert.equal((await restarted.analyze(quote.id, input, new AbortController().signal, source)).score, 68);
      assert.equal(JSON.parse(stored).pending[0].requestId, originalId); assert.equal(providerCalls, calls + 1);
      await restarted.acknowledge(quote.id); assert.equal(JSON.parse(stored).pending.length, 0);
      assert.equal((await wallet()).used, before + 100 * NANODOLLARS_PER_CREDIT);
    });
    await t.test("malformed model output and provider failures refund the hold", async () => {
      const previous = await wallet(); failProvider = true;
      await assert.rejects(analyze((await newQuote()).id), /could not complete/); failProvider = false;
      providerResult = { ...plan, score: 101 }; await assert.rejects(analyze((await newQuote()).id)); providerResult = plan;
      assert.equal((await wallet()).balance, previous.balance); assert.equal((await wallet()).reserved, 0);
    });
    await t.test("cancelling propagates upstream and releases reserved credits", async () => {
      const previous = await wallet(), quote = await newQuote(), cancellation = new AbortController(); abortProvider = true;
      const result = analyze(quote.id, randomUUID(), input, "owner", cancellation.signal);
      const timer = setTimeout(() => cancellation.abort(new DOMException("Cancelled", "AbortError")), 150);
      await assert.rejects(result); clearTimeout(timer); abortProvider = false;
      assert.equal((await wallet()).reserved, 0); assert.equal((await wallet()).balance, previous.balance);
    });
    await t.test("holds reject overspending and restart cleanup releases abandoned holds", async () => {
      const available = (await wallet()).balance;
      await db.query("update zebby_wallets set balance=1000000 where user_id=$1", [userId]);
      const quote = await newQuote(); await assert.rejects(analyze(quote.id));
      await db.query("update zebby_wallets set balance=$2 where user_id=$1", [userId, available]);
      const fresh = await newQuote(), record = (await db.query("select content_hash from zebby_quotes where id=$1", [fresh.id])).rows[0];
      await rpc("reserve", { p_user: userId, p_id: randomUUID(), p_quote: fresh.id, p_hash: record.content_hash });
      assert.ok((await wallet()).reserved > 0);
      await db.exec("update zebby_runs set expires_at=now()-interval '1 minute' where status='reserved'");
      await service.cleanup(); assert.equal((await wallet()).reserved, 0);
    });
    await t.test("expired quotes and invalid authentication never invoke a provider", async () => {
      const quote = await newQuote(), calls = providerCalls;
      await db.query("update zebby_quotes set expires_at=now()-interval '1 second' where id=$1", [quote.id]);
      await assert.rejects(analyze(quote.id)); await assert.rejects(analyze(quote.id, randomUUID(), input, "invalid")); assert.equal(providerCalls, calls);
    });
    await t.test("refunds are cumulative and idempotent, and disputes freeze spending", async () => {
      const previous = (await wallet()).balance;
      const event = signature({ id: "evt_partial_refund", livemode: false, type: "charge.refunded", data: { object: { payment_intent: "pi_fixture", amount_refunded: 100, disputed: false } } });
      await service.webhook(event.raw, event.signature); await service.webhook(event.raw, event.signature);
      assert.equal((await wallet()).balance, previous - 100 * NANODOLLARS_PER_CREDIT);
      const equalIncrement = signature({ id: "evt_equal_refund", livemode: false, type: "charge.refunded", data: { object: { payment_intent: "pi_fixture", amount_refunded: 200, disputed: false } } });
      await service.webhook(equalIncrement.raw, equalIncrement.signature); await service.webhook(equalIncrement.raw, equalIncrement.signature);
      assert.equal((await wallet()).balance, previous - 200 * NANODOLLARS_PER_CREDIT);
      await rpc("reverse", { p_event: "evt_dispute", p_payment: "pi_fixture", p_refunded: 100, p_disputed: true });
      await assert.rejects(analyze((await newQuote()).id));
      await rpc("reverse", { p_event: "evt_won", p_payment: "pi_fixture", p_refunded: 100, p_disputed: false });
      await rpc("reverse", { p_event: "evt_full_refund", p_payment: "pi_fixture", p_refunded: 500, p_disputed: false });
      assert.ok((await wallet()).balance < 0); assert.equal((await wallet()).reserved, 0);
    });
    await t.test("ordinary signed-in clients cannot edit the ledger or call privileged functions", async () => {
      await assert.rejects(db.transaction(async (tx) => { await tx.exec("set local role authenticated"); await tx.query("update zebby_wallets set balance=999999999999"); }), /permission denied/);
      await assert.rejects(db.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select zebby_wallet($1)", [userId]); }), /permission denied/);
    });
  } finally { await db.close(); }
});

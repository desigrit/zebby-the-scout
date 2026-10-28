import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { countOpenAIAnalysisInput, openAIAnalysisInput } from "../desktop/openai-request.ts";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { createService } from "../credits-service/service.ts";
import { matchInstructions, matchSchema } from "../desktop/analysis-contracts.ts";
import { ASTRA_PACK_MESSAGE, CREDIT_PACKS, creditOutputLimit, creditReservationMessage, maximumCost, onlineModel, PRICE_VERSION, usageCost } from "../shared/online-models.ts";

const model = "gpt-6-astra";
const sample = { model, thinkingLevel: "high", key: "fixture", instructions: matchInstructions,
  input: { company: "Example", title: "Product manager", resumeText: "Led product strategy and discovery.",
    jobDescription: "Lead product strategy and customer discovery with design and engineering. Own the roadmap and measure outcomes." },
  schema: matchSchema, name: "resume_match", kind: "match", signal: new AbortController().signal };
const result = { score: 82, explanation: "Strategy and discovery are supported; delivery metrics are missing." };

test("count and generation send identical model, effort, complete source and schema", async () => {
  let counted, generated;
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, "Bearer fixture");
    if (url.endsWith("/input_tokens")) {
      counted = body;
      return Response.json({ object: "response.input_tokens", input_tokens: 3600 });
    }
    generated = body;
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
      usage: { input_tokens: 3600, output_tokens: 500 } });
  };
  assert.equal(await countOpenAIAnalysisInput({ ...sample, fetcher }), 3600);
  await onlineAnalysis({ ...sample, fetcher, maxOutputTokens: creditOutputLimit("match", "high") });
  const { store, max_output_tokens, ...generationInput } = generated;
  assert.deepEqual(counted, generationInput);
  assert.deepEqual(counted, openAIAnalysisInput(sample));
  assert.equal(counted.reasoning.effort, "high");
  assert.deepEqual(counted.text.format.schema, sample.schema);
  assert.equal(counted.input, JSON.stringify(sample.input));
  assert.equal(store, false);
  assert.equal(max_output_tokens, 8192);
});

test("token count failures are explicit and never fall back to bytes or generation", async () => {
  for (const value of [undefined, null, 0, -1, 1.2, "3600", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(countOpenAIAnalysisInput({ ...sample, fetcher: async () => Response.json({ input_tokens: value }) }), /invalid token count/);
  }
  await assert.rejects(countOpenAIAnalysisInput({ ...sample, fetcher: async () => { throw new TypeError("network"); } }), /No credits were reserved/);
  await assert.rejects(countOpenAIAnalysisInput({ ...sample, fetcher: async () => Response.json({ error: { message: "private resume", type: "permission_error" } }, { status: 403 }) }),
    (error) => /unavailable through Zebby/.test(error.message) && !/private resume/.test(error.message));
  const controller = new AbortController();
  const pending = countOpenAIAnalysisInput({ ...sample, signal: controller.signal, fetcher: async (_, options) =>
    new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true })) });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("task budgets preserve effort, cover usage and do not depend on wallet size", () => {
  const astra = onlineModel(model);
  for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
    assert.ok(creditOutputLimit("match", effort) < creditOutputLimit("plan", effort));
    const cap = creditOutputLimit("plan", effort);
    assert.ok(maximumCost(astra, 3600, cap) <= 3000e6);
    for (const input of [3600, 272000, 272001]) {
      assert.equal(maximumCost(astra, input, cap), usageCost(astra, { input: 0, cached: 0, cacheWrite: input, output: cap }));
      assert.ok(usageCost(astra, { input, cached: Math.floor(input / 2), output: cap }) <= maximumCost(astra, input, cap));
    }
  }
  assert.equal(maximumCost(astra, 3600, creditOutputLimit("match", "high")), 454600000);
  assert.equal(maximumCost(astra, 3600, creditOutputLimit("plan", "high")), 659400000);
  for (const value of [NaN, Infinity, -1, 0, 1.2]) assert.throws(() => maximumCost(astra, value, 8192));
  assert.deepEqual(CREDIT_PACKS.filter((p) => p.astra).map((p) => p.dollars), [20, 50, 100]);
  assert.match(creditReservationMessage({ model, maximum: 659400000 }, 450e6), /659.4 credits available to start. You have 450/);
});

test("output exhaustion fails without saving partial JSON or retrying at a different effort", async () => {
  let calls = 0;
  await assert.rejects(onlineAnalysis({ ...sample, billingOwner: "zebby", maxOutputTokens: 8192,
    fetcher: async (_, options) => {
      calls++;
      assert.equal(JSON.parse(options.body).reasoning.effort, "high");
      return Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
        output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] });
    } }), /No credits were charged/);
  assert.equal(calls, 1);
});

test("counted quotes, Astra access and settlement in an isolated ledger", async (t) => {
  const db = new PGlite(), user = randomUUID();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../credits-service/schema.sql", import.meta.url), "utf8"));
  const config = { supabaseUrl: "https://database.example", supabaseKey: "fixture", publicUrl: "https://credits.example",
    stripeKey: "sk_test_fixture", stripeWebhookSecret: "whsec_fixture", openaiKey: "fixture", anthropicKey: "", live: false, port: 8080 };
  async function rpc(name, data) {
    return (await db.query(`select zebby_${name}(${Object.keys(data).map((k, i) => `${k}=>$${i + 1}`).join(",")}) as result`,
      Object.values(data))).rows[0].result;
  }
  let counts = 0, generations = 0, countFails = false, incomplete = false, lastRequest;
  const fetcher = async (target, options = {}) => {
    const url = new URL(target), body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname === "/auth/v1/user") return Response.json({ id: user, email: "test@example.com", email_confirmed_at: "2026-01-01" });
    if (url.hostname === "database.example") {
      const name = url.pathname.split("/").at(-1);
      if (name.startsWith("zebby_") && url.pathname.includes("/rpc/")) {
        try { return Response.json(await rpc(name.replace("zebby_", ""), body)); }
        catch (error) { return Response.json({ message: error.message }, { status: 400 }); }
      }
      assert.equal(name, "zebby_quotes");
      if (options.method === "POST") {
        return Response.json((await db.query(`insert into zebby_quotes(${Object.keys(body).join(",")})
          values(${Object.keys(body).map((_, i) => "$" + (i + 1)).join(",")}) returning *`, Object.values(body))).rows);
      }
      return Response.json((await db.query("select * from zebby_quotes where id=$1 and user_id=$2",
        [url.searchParams.get("id").slice(3), url.searchParams.get("user_id").slice(3)])).rows);
    }
    assert.equal(url.hostname, "api.openai.com");
    if (url.pathname.endsWith("/input_tokens")) {
      counts++;
      return countFails ? Response.json({ input_tokens: null }) : Response.json({ object: "response.input_tokens", input_tokens: 3600 });
    }
    generations++; lastRequest = body;
    if (incomplete) return Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
      usage: { input_tokens: 3600, output_tokens: 500 } });
  };
  const service = createService(config, { fetcher });
  const call = (method, path, body) => service.handle(method, path, body, "fixture", new AbortController().signal);
  const wallet = () => rpc("wallet", { p_user: user });
  const quote = (id = model) => call("POST", "/v1/quotes", { model: id, kind: "match", thinkingLevel: "high", input: sample.input });
  const analyze = (q, id = randomUUID()) => call("POST", "/v1/analysis", { quoteId: q.id, requestId: id, input: sample.input });
  const purchase = randomUUID();
  try {
    await t.test("a $5 wallet cannot request Astra, without counting or invoking generation", async () => {
      await wallet();
      await db.query("update zebby_wallets set balance=500000000,purchased=500000000 where user_id=$1", [user]);
      assert.equal((await wallet()).astraUnlocked, false);
      await assert.rejects(quote(), { message: ASTRA_PACK_MESSAGE });
      assert.equal(counts, 0); assert.equal(generations, 0);
      assert.equal((await quote("gpt-6.1-sol")).model, "gpt-6.1-sol");
    });
    await t.test("existing $20 purchases unlock Astra and repeated migrations retain data", async () => {
      await db.query("insert into zebby_purchases(id,user_id,pack,cents,amount,paid) values($1,$2,'regular',2000,3000000000,true)", [purchase, user]);
      await db.query("update zebby_wallets set balance=3000000000,purchased=3500000000 where user_id=$1", [user]);
      const before = await wallet(), priorQuotes = (await db.query("select * from zebby_quotes order by id")).rows;
      const migration = await readFile(new URL("../credits-service/migrations/20261020_counted_budgets.sql", import.meta.url), "utf8");
      await db.exec(migration); await db.exec(migration);
      await db.exec(await readFile(new URL("../credits-service/migrations/20261027_wallet_usage.sql", import.meta.url), "utf8"));
      assert.deepEqual(await wallet(), before);
      assert.deepEqual((await db.query("select * from zebby_quotes order by id")).rows, priorQuotes);
      assert.equal(before.astraUnlocked, true);
    });
    await t.test("quotes bind exact counts and generation caps and charge actual usage once", async () => {
      const q = await quote(), id = randomUUID(), before = await wallet();
      assert.equal(q.inputTokens, 3600); assert.equal(q.outputTokens, 8192); assert.equal(q.maximum, 454600000);
      const stored = (await db.query("select * from zebby_quotes where id=$1", [q.id])).rows[0];
      assert.equal(stored.price_version, PRICE_VERSION);
      assert.equal(stored.input_tokens, 3600); assert.equal(stored.output_limit, 8192);
      const reply = await analyze(q, id);
      assert.equal(reply.wallet.balance, before.balance - 61e6);
      assert.equal(reply.wallet.reserved, 0);
      assert.equal(lastRequest.max_output_tokens, q.outputTokens);
      assert.equal(lastRequest.model, model); assert.equal(lastRequest.reasoning.effort, "high");
      const calls = generations;
      await analyze(q, id);
      assert.equal(generations, calls); assert.equal((await wallet()).used, before.used + 61e6);
    });
    await t.test("failed counts and unfinished outputs leave the balance and holds unchanged", async () => {
      const before = await wallet(), rows = (await db.query("select count(*) from zebby_quotes")).rows[0].count;
      countFails = true;
      await assert.rejects(quote(), /invalid token count/);
      assert.equal((await db.query("select count(*) from zebby_quotes")).rows[0].count, rows);
      countFails = false; incomplete = true;
      await assert.rejects(analyze(await quote()), /No credits were charged/);
      incomplete = false;
      assert.equal((await wallet()).balance, before.balance); assert.equal((await wallet()).reserved, 0);
    });
    await t.test("concurrent reservations cannot overspend the same balance", async () => {
      const first = await quote(), second = await quote();
      await db.query("update zebby_wallets set balance=600000000 where user_id=$1", [user]);
      const hash = (await db.query("select content_hash from zebby_quotes where id=$1", [first.id])).rows[0].content_hash;
      const id = randomUUID();
      await rpc("reserve", { p_user: user, p_id: id, p_quote: first.id, p_hash: hash });
      const beforeCalls = generations;
      await assert.rejects(analyze(second), (error) => error.status === 402 && /needs 454.6 credits available to start. You have 145.4/.test(error.message));
      assert.equal(generations, beforeCalls);
      assert.equal((await wallet()).reserved, first.maximum);
      await rpc("finish", { p_user: user, p_id: id, p_cost: 0, p_result: null, p_success: false });
      assert.equal((await wallet()).reserved, 0);
    });
    await t.test("Astra access survives spending, and refund/dispute changes are enforced at reserve", async () => {
      const q = await quote(), hash = (await db.query("select content_hash from zebby_quotes where id=$1", [q.id])).rows[0].content_hash;
      await db.query("update zebby_wallets set balance=0 where user_id=$1", [user]);
      assert.equal((await wallet()).astraUnlocked, true);
      await db.query("update zebby_wallets set balance=3000000000 where user_id=$1", [user]);
      await db.query("update zebby_purchases set disputed=true where id=$1", [purchase]);
      assert.equal((await wallet()).astraUnlocked, false);
      await assert.rejects(rpc("reserve", { p_user: user, p_id: randomUUID(), p_quote: q.id, p_hash: hash }), /disputed/);
      await db.query("update zebby_purchases set disputed=false,reversed=amount where id=$1", [purchase]);
      await assert.rejects(rpc("reserve", { p_user: user, p_id: randomUUID(), p_quote: q.id, p_hash: hash }), /Astra/);
      assert.equal((await wallet()).astraUnlocked, false);
    });
  } finally { await db.close(); }
});

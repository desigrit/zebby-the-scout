import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChatGPTService } from "../desktop/chatgpt/chatgpt-service.ts";
import { tailoringSchema } from "../shared/tailored-resume.ts";
import { runSelectedAnalysis } from "../desktop/analysis-routing.ts";

test("public ChatGPT selection routes every analysis type without another provider fallback", async () => {
  for (const name of ["resume_plan", "application_match", "tailored_resume", "board_extract"]) {
    const selected = { provider: "chatgpt", model: "account-model" };
    let calls = 0;
    const providers = new Proxy({ chatgpt: async (instructions, input, formatName) => {
      calls++; assert.equal(formatName, name); assert.equal(instructions, "Use source facts");
      assert.deepEqual(input, { source: name }); return { valid: true };
    } }, { get: (target, key) => key in target ? target[key] : () => { throw new Error("Another provider was called"); } });
    assert.deepEqual(await runSelectedAnalysis(selected, providers, "Use source facts", { source: name }, name, {}, "Failure"), { valid: true });
    assert.equal(calls, 1);
    providers.chatgpt = async () => { throw new Error("ChatGPT allowance reached"); };
    await assert.rejects(runSelectedAnalysis(selected, providers, "Use source facts", {}, name, {}, "Failure"), /ChatGPT allowance reached/);
  }
});
const schema = { type: "object", additionalProperties: false, properties: { score: { type: "integer", minimum: 0, maximum: 100 } }, required: ["score"] };
const request = { version: 1, workspace: "workspace", target: "match:1", revision: "1", account: "account", model: "account-model", thinking: "high", name: "fixture_analysis", instructions: "Compare source facts", input: { resumeText: "Experience", jobDescription: "Job" }, schema };
const signal = () => new AbortController().signal;
const stream = value => new Response(`data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", model: "account-model", usage: {
  input_tokens: 100, output_tokens: 40, total_tokens: 140, input_tokens_details: { cached_tokens: 60 }, output_tokens_details: { reasoning_tokens: 20 },
}, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
async function fixture(work) {
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-chatgpt-service-")), requests = [];
  const control = { respond: async () => stream({ score: 82 }) };
  const profile = { version: 1, hostId: "urn:uuid:11111111-1111-4111-8111-111111111111", active: "account", accounts: [{ id: "account", clientId: "oaiapp_test", subject: "owner", label: "owner@example.org", enabled: true,
    tokens: { access: "fixture-oauth-token", refresh: "fixture-refresh-token", idToken: "fixture-id-token", expiresAt: Date.now() + 3600000 } }] };
  const dependencies = { folder, encrypt: value => Buffer.from(value).toString("base64"), decrypt: value => Buffer.from(value, "base64").toString(), changed() {}, openBrowser: async () => { throw new Error("No sign-in expected"); },
    fetcher: async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer fixture-oauth-token");
      if (url === "https://api.openai.com/v1/models") return Response.json({ models: [{ slug: "account-model", display_name: "Account model", visibility: "list", supported_reasoning_levels: ["low", "high"], input_modalities: ["text", "image"] }] });
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(init.body); requests.push(body);
      assert.equal(body.model, "account-model"); assert.equal(body.store, false); assert.equal(body.stream, true);
      assert.equal("max_output_tokens" in body, false); assert.equal("metadata" in body, false);
      return control.respond(body, init.signal);
    } };
  let service;
  try {
    await writeFile(path.join(folder, "chatgpt-credentials.enc"), dependencies.encrypt(JSON.stringify(profile)));
    service = new ChatGPTService(dependencies); await service.initialize(); await service.configure("account-model", "high");
    await work({ service, requests, control, dependencies });
  } finally { service?.stop(); assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep)); await rm(folder, { recursive: true, force: true }); }
}
test("selected account, model and thinking use OAuth only, with reusable validated results", () => fixture(async ({ service, requests, dependencies }) => {
  const result = await service.analyze(request, signal()); assert.equal(result.score, 82);
  assert.deepEqual(requests[0].reasoning, { effort: "high" });
  await service.jobs.applied(result);
  const restarted = new ChatGPTService(dependencies); await restarted.initialize();
  assert.deepEqual(await restarted.analyze(request, signal()), { score: 82 }); assert.equal(requests.length, 1);
  assert.equal(restarted.state.jobs[0].attempts[0].usage.totalTokens, 140);
  assert.equal(restarted.state.jobs[0].attempts[0].requestStarted, true);
  assert.equal(restarted.state.jobs[0].reuseCount, 1);
  await assert.rejects(service.analyze({ ...request, account: "different" }, signal()), /account changed/);
  await assert.rejects(service.analyze({ ...request, model: "other-model" }, signal()), /available ChatGPT model/);
  assert.equal(requests.length, 1);
}));
test("usage exhaustion pauses inference and retry never repeats completed work", () => fixture(async ({ service, requests, control }) => {
  await service.analyze(request, signal());
  control.respond = async () => Response.json({ error: { code: "subscription_sharing_usage_limit_exceeded" } }, { status: 429 });
  const next = { ...request, target: "match:2" };
  await assert.rejects(service.analyze(next, signal()), /usage limit/);
  assert.equal(service.state.paused, true);
  await assert.rejects(service.analyze({ ...request, target: "match:3" }, signal()), /usage is paused/);
  assert.equal(requests.length, 2);
  control.respond = async () => stream({ score: 80 }); service.resume();
  assert.equal((await service.analyze(request, signal())).score, 82);
  assert.equal(requests.length, 2);
  assert.equal((await service.analyze(next, signal())).score, 80);
  assert.equal(requests.length, 3);
}));
test("the queue permits one inference and cancels a waiting job immediately", () => fixture(async ({ service, requests, control }) => {
  let release, started;
  const active = new Promise(resolve => { started = resolve; });
  control.respond = async () => { started(); await new Promise(resolve => { release = resolve; }); return stream({ score: 82 }); };
  const first = service.analyze(request, signal()); await active;
  const cancel = new AbortController(), second = service.analyze({ ...request, target: "match:2" }, cancel.signal);
  const rejected = assert.rejects(second, { name: "AbortError" }); cancel.abort(); await rejected;
  assert.equal(requests.length, 1); release(); await first;
  assert.equal(service.busy, false);
}));
test("resume edits that modify protected facts fail domain validation before they are reusable", () => fixture(async ({ service, control }) => {
  control.respond = async () => stream({ edits: [{ id: 0, text: "A new name" }] });
  const req = { ...request, name: "tailored_resume", schema: tailoringSchema, input: { resumeBlocks: [{ id: 0, text: "Original Name", style: "name", editable: false }] } };
  await assert.rejects(service.analyze(req, signal()), /protected resume details/);
  assert.equal(service.state.jobs[0].state, "failed");
  assert.equal(service.state.jobs[0].attempts[0].usage.totalTokens, 140);
}));
test("connection test verifies both structured text and a real image input", () => fixture(async ({ service, control, requests }) => {
  control.respond = async () => stream({ ready: true }); await service.testConnection();
  assert.equal(service.state.tested, true); assert.equal(service.state.visionTested, true);
  assert.equal(requests.length, 2);
  const image = requests[1].input[0].content.find(part => part.type === "input_image");
  const png = Buffer.from(image.image_url.split(",")[1], "base64");
  assert.equal(png.readUInt32BE(16), 32); assert.equal(png.readUInt32BE(20), 32);
  assert.equal(service.state.jobs.length, 2);
  assert.ok(service.state.jobs.every(job => job.state === "applied" && job.attempts[0].usage.totalTokens === 140));
  await service.testConnection();
  assert.equal(requests.length, 4, "An explicit test always checks the live connection");
  assert.equal(service.state.jobs.length, 4);
}));

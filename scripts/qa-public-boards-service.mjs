import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { CREDIT_SERVICE_URL } from "../shared/credit-service.ts";

const expectedCommit = process.argv[2];
assert.match(expectedCommit || "", /^[a-f0-9]{40}$/);
const token = "zby_device_" + randomBytes(32).toString("hex");
async function request(path, body, status = 200) {
  const response = await fetch(CREDIT_SERVICE_URL + path, { method: body ? "POST" : "GET", redirect: "error",
    signal: AbortSignal.timeout(45000), headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, status, path + " returned " + response.status);
  return response.json();
}
const health = await request("/health");
assert.equal(health.mode, "live"); assert.equal(health.commit, expectedCommit);
const catalog = await request("/v1/catalog");
for (const kind of ["plan", "match", "resume", "board_extract"]) assert.ok(catalog.analysisKinds.includes(kind));
await request("/v1/wallet/guest", { deviceToken: token, name: "Zebby release verification" });
const wallet = await request("/v1/wallet");
assert.equal(wallet.balance, 0); assert.equal(wallet.reserved, 0);
const input = { task: "roles", criteria: "Product managers only", candidates: [
  { id: "l0", url: "https://example.org/jobs/1", title: "Product Manager", department: "Product", text: "Product Manager" }] };
for (const model of ["gpt-6-luna", "claude-haiku-5-5"]) {
  const quote = await request("/v1/quotes", { kind: "board_extract", model, thinkingLevel: "low", input });
  assert.equal(quote.model, model); assert.ok(quote.maximum > 0);
  await request("/v1/analysis", { quoteId: quote.id, requestId: randomUUID(), input }, 402);
}
const final = await request("/v1/wallet");
assert.equal(final.balance, 0); assert.equal(final.reserved, 0); assert.equal(final.used, 0);
console.log("Production serves the release commit. An ordinary wallet quoted both providers and released all holds.");

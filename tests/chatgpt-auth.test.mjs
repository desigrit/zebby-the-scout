import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { validateIdentity } from "../desktop/chatgpt/chatgpt-auth.ts";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(change = {}) {
  const input = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({ iss: "https://auth.openai.com", sub: "test-subject", aud: "issued-client", nonce: "test-nonce", email: "owner@example.org", exp: Math.floor(Date.now() / 1000) + 3600, ...change })}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString("base64url")}`;
}
const fetcher = async url => Response.json(String(url).endsWith("openid-configuration") ? { issuer: "https://auth.openai.com", jwks_uri: "https://auth.openai.com/jwks" } : { keys: [jwk] });
test("OAuth verifies the issued client, nonce, identity, expiry and signature", async () => {
  assert.deepEqual(await validateIdentity(token(), "issued-client", "test-nonce", fetcher), { subject: "test-subject", label: "owner@example.org" });
  for (const claims of [{ aud: "other-client" }, { nonce: "wrong" }, { iss: "https://other.example" }, { exp: 1 }, { sub: "" }]) {
    await assert.rejects(validateIdentity(token(claims), "issued-client", "test-nonce", fetcher));
  }
  const forged = token().split("."); forged[1] = encode({ sub: "different" });
  await assert.rejects(validateIdentity(forged.join("."), "issued-client", "test-nonce", fetcher), /verification failed/);
});
test("identity discovery cannot redirect key retrieval to another origin", async () => {
  await assert.rejects(validateIdentity(token(), "issued-client", "test-nonce", async () => Response.json({ issuer: "https://auth.openai.com", jwks_uri: "https://attacker.example/jwks" })), /unavailable/);
});

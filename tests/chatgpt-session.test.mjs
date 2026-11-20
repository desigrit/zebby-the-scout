import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChatGPTAuth } from "../desktop/chatgpt/chatgpt-auth.ts";

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...key.publicKey.export({ format: "jwk" }), kid: "fixture-key", alg: "RS256" };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function identity(nonce, subject = "owner") {
  const data = `${encode({ alg: "RS256", kid: jwk.kid })}.${encode({ iss: "https://auth.openai.com", aud: "oaiapp_test", sub: subject, email: "owner@example.com", nonce, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), key.privateKey).toString("base64url")}`;
}
const encrypt = value => Buffer.from(value).toString("base64"), decrypt = value => Buffer.from(value, "base64").toString();
async function fixture(work) {
  const folder = await mkdtemp(path.join(tmpdir(), "zebby-chatgpt-auth-"));
  try {
    const calls = [], controls = { grants: "openid offline_access chatgpt.tokens.use.direct", expiry: 1, refreshError: "", wrongSubject: false, revocationFailure: false };
    let authUrl;
    const dependencies = { folder, encrypt, decrypt, changed() {},
      openBrowser: async url => {
        authUrl = new URL(url); const callback = new URL(authUrl.searchParams.get("redirect_uri"));
        callback.search = new URLSearchParams({ code: "test-code", client_id: "oaiapp_test", state: authUrl.searchParams.get("state") });
        assert.equal((await fetch(callback)).status, 200);
      },
      fetcher: async (url, init = {}) => {
        calls.push({ url, body: init.body, redirect: init.redirect });
        if (String(url).endsWith("openid-configuration")) return Response.json({ issuer: "https://auth.openai.com", jwks_uri: "https://auth.openai.com/jwks", revocation_endpoint: "https://auth.openai.com/revoke" });
        if (String(url).endsWith("/jwks")) return Response.json({ keys: [jwk] });
        if (String(url).endsWith("/revoke")) return new Response("", { status: controls.revocationFailure ? 503 : 200 });
        assert.equal(url, "https://auth.openai.com/api/accounts/oauth/token");
        assert.equal(init.body.get("client_id"), "oaiapp_test");
        assert.equal(init.body.get("resource"), "https://api.openai.com/v1");
        const refresh = init.body.get("grant_type") === "refresh_token";
        if (refresh && controls.refreshError) return Response.json({ error: controls.refreshError }, { status: controls.refreshError === "server_error" ? 503 : 400 });
        if (!refresh) {
          assert.equal(init.body.get("redirect_uri"), authUrl.searchParams.get("redirect_uri"));
          assert.equal(createHash("sha256").update(init.body.get("code_verifier")).digest("base64url"), authUrl.searchParams.get("code_challenge"));
        }
        return Response.json({ token_type: "Bearer", access_token: refresh ? "access-new" : "access-original", refresh_token: refresh ? "refresh-new" : "refresh-original",
          id_token: identity(authUrl.searchParams.get("nonce"), controls.wrongSubject ? "different" : "owner"), expires_in: refresh ? 3600 : controls.expiry, scope: controls.grants });
      } };
    await work({ folder, dependencies, controls, calls, authUrl: () => authUrl });
  } finally { assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep)); await rm(folder, { recursive: true, force: true }); }
}
test("registration persists host identity and serializes rotating refresh tokens", () => fixture(async ({ folder, dependencies, calls, authUrl }) => {
  const auth = new ChatGPTAuth(dependencies); await auth.initialize(); await auth.signIn();
  assert.equal(auth.connected, true); assert.equal(authUrl().searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(authUrl().searchParams.get("agent_name_hint"), "Zebby");
  const host = authUrl().searchParams.get("ext_agent_host_id"), account = auth.active;
  const results = await Promise.all([auth.access(account), auth.access(account), auth.access(account)]);
  assert.deepEqual(results, ["access-new", "access-new", "access-new"]);
  assert.equal(calls.filter(call => call.body?.get("grant_type") === "refresh_token").length, 1);
  const file = await readFile(path.join(folder, "chatgpt-credentials.enc"), "utf8");
  assert.equal(file.includes("access-new"), false);
  assert.equal(JSON.parse(decrypt(file)).accounts[0].tokens.refresh, "refresh-new");
  await auth.acknowledgeWelcome();
  const restored = new ChatGPTAuth(dependencies); await restored.initialize();
  assert.equal(await restored.access(account), "access-new");
  await restored.signIn(account);
  assert.equal(authUrl().searchParams.get("client_id"), "oaiapp_test");
  assert.equal(authUrl().searchParams.get("agent_name_hint"), null);
  assert.ok(authUrl().searchParams.get("id_token_hint"));
  assert.equal(authUrl().searchParams.get("ext_agent_host_id"), host);
  assert.equal(restored.welcome, false);
}));
test("temporary refresh failures preserve credentials and terminal failures require reconnect", () => fixture(async ({ dependencies, controls }) => {
  const auth = new ChatGPTAuth(dependencies); await auth.initialize(); await auth.signIn();
  controls.refreshError = "server_error";
  await assert.rejects(auth.access(auth.active), /Could not renew/); assert.equal(auth.connected, true);
  controls.refreshError = "invalid_grant";
  await assert.rejects(auth.access(auth.active), /expired/); assert.equal(auth.connected, false);
  assert.equal(auth.accounts.length, 1);
}));
test("revocation failure still disconnects locally and never erases the issued registration", () => fixture(async ({ dependencies, controls, calls }) => {
  const auth = new ChatGPTAuth(dependencies); await auth.initialize(); await auth.signIn();
  controls.revocationFailure = true;
  assert.equal(await auth.disconnect(), false); assert.equal(auth.connected, false); assert.equal(auth.accounts.length, 1);
  assert.ok(calls.some(call => String(call.url).endsWith("/revoke")));
  assert.deepEqual(auth.secrets(), []);
}));
test("wrong identity, missing grants and damaged credential storage never enable analysis", () => fixture(async ({ folder, dependencies, controls }) => {
  const auth = new ChatGPTAuth(dependencies); await auth.initialize(); await auth.signIn();
  controls.wrongSubject = true;
  await assert.rejects(auth.signIn(auth.active), /same ChatGPT account/);
  assert.equal(auth.current.subject, "owner");
  controls.wrongSubject = false; controls.grants = "openid";
  await assert.rejects(auth.signIn(auth.active), /Enable permission/); assert.equal(auth.connected, false);
  const file = path.join(folder, "chatgpt-credentials.enc"); await writeFile(file, "broken");
  await assert.rejects(new ChatGPTAuth(dependencies).initialize(), /preserved/);
  assert.equal(await readFile(file, "utf8"), "broken");
}));
test("invalid callback state cannot finish registration and cancellation closes the attempt", () => fixture(async ({ dependencies }) => {
  const auth = new ChatGPTAuth({ ...dependencies, openBrowser: async url => {
    const params = new URL(url).searchParams, callback = new URL(params.get("redirect_uri"));
    callback.search = new URLSearchParams({ state: "wrong", code: "test-code", client_id: "oaiapp_test" });
    assert.equal((await fetch(callback)).status, 400); auth.cancelSignIn();
  } });
  await auth.initialize(); await assert.rejects(auth.signIn(), /cancelled/);
  assert.equal(auth.connecting, false); assert.equal(auth.connected, false);
}));

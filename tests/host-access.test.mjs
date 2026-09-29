import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedHost } from "../lib/host-access.ts";

test("the public workspace only runs on Azure's default hostname", () => {
  const azureHost = "pm-applications-a6gqaeashthkhkeu.eastus-01.azurewebsites.net";
  assert.equal(isAllowedHost(azureHost, false, azureHost), true);
  assert.equal(isAllowedHost(azureHost.toUpperCase(), false, azureHost), true);
  assert.equal(isAllowedHost("raunakoberoi.com", false, azureHost), false);
  assert.equal(isAllowedHost(`${azureHost}.evil.test`, false, azureHost), false);
  assert.equal(isAllowedHost("my-project.vercel.app", false, azureHost), false);
  assert.equal(isAllowedHost(null, false, azureHost), false);
  assert.equal(isAllowedHost(azureHost, false, ""), false);
});

test("local addresses are only enabled for development", () => {
  assert.equal(isAllowedHost("localhost:3000", true), true);
  assert.equal(isAllowedHost("127.0.0.1:3000", true), true);
  assert.equal(isAllowedHost("localhost:3000", false), false);
});

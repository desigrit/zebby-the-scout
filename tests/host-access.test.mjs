import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedHost } from "../lib/host-access.ts";

test("the public workspace only runs on its chosen hostname", () => {
  assert.equal(isAllowedHost("applications424760.raunakoberoi.com"), true);
  assert.equal(isAllowedHost("APPLICATIONS424760.RAUNAKOBEROI.COM"), true);
  assert.equal(isAllowedHost("raunakoberoi.com"), false);
  assert.equal(isAllowedHost("applications424760.raunakoberoi.com.evil.test"), false);
  assert.equal(isAllowedHost("my-project.vercel.app"), false);
  assert.equal(isAllowedHost(null), false);
});

test("local addresses are only enabled for development", () => {
  assert.equal(isAllowedHost("localhost:3000", true), true);
  assert.equal(isAllowedHost("127.0.0.1:3000", true), true);
  assert.equal(isAllowedHost("localhost:3000", false), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress } from "../lib/public-address.ts";

test("job listing lookup accepts public addresses", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("job listing lookup rejects internal and metadata addresses", () => {
  for (const address of [
    "127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

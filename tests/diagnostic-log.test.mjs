import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DiagnosticLog } from "../desktop/diagnostic-log.ts";

test("error logs are automatic, created only on error, ordered, and redact the API key", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "zebby-logs-test-"));
  const folder = path.join(root, "Logs");
  try {
    const key = "synthetic-api-key-for-this-test";
    const log = new DiagnosticLog(() => folder, () => [key]);
    await assert.rejects(access(folder), { code: "ENOENT" });
    log.error("First error", new Error(`Request failed with ${key}`));
    log.error("Second error", "Database unavailable");
    await log.flush();
    const contents = await readFile(path.join(folder, "tracker.log"), "utf8");
    assert.match(contents, /First error.*Request failed with \[redacted\]/);
    assert.equal(contents.includes(key), false);
    assert.ok(contents.indexOf("First error") < contents.indexOf("Second error"));
    await writeFile(path.join(folder, "tracker.log"), "x".repeat(2_000_000));
    log.error("Third error", "Model unavailable");
    await log.flush();
    assert.equal((await readFile(path.join(folder, "tracker.previous.log"))).length, 2_000_000);
    assert.match(await readFile(path.join(folder, "tracker.log"), "utf8"), /Third error: Model unavailable/);
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

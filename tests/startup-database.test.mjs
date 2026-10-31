import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { restoreStartupDatabase } from "../desktop/startup-database.ts";

async function fixture(work) {
  const root = await mkdtemp(path.join(tmpdir(), "zebby-startup-"));
  let store;
  try {
    const bundle = path.join(root, "store.mjs");
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "profile"));
    await work({ root, store, open: file => store.open(file) });
  } finally {
    store?.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
}

test("first launch leaves database creation to the welcome screen", () => fixture(async ({ root, store, open }) => {
  const before = await readdir(root);
  assert.equal(await restoreStartupDatabase(undefined, [path.join(root, "Applications.sqlite")], open), null);
  assert.equal(store.status.filePath, "");
  assert.deepEqual(await readdir(root), before);
}));

test("a selected database reopens with its applications and original bytes", () => fixture(async ({ root, store, open }) => {
  const file = path.join(root, "Selected.sqlite");
  await store.create(file);
  await store.saveApplication({ company: "Preserved company", title: "Product Manager" });
  store.close();
  const before = await readFile(file);
  assert.equal(await restoreStartupDatabase(file, [path.join(root, "Unused.sqlite")], open), file);
  assert.deepEqual(await readFile(file), before);
  assert.equal(store.status.filePath, file);
}));

test("an existing local database is recovered on upgrade without a saved selection", () => fixture(async ({ root, store, open }) => {
  const file = path.join(root, "PM Applications.sqlite");
  await store.create(file); store.close();
  const before = await readFile(file);
  assert.equal(await restoreStartupDatabase(undefined, [path.join(root, "Missing.sqlite"), file], open), file);
  assert.deepEqual(await readFile(file), before);
}));

test("a missing selected cloud file never switches to or creates another database", () => fixture(async ({ root, store, open }) => {
  const fallback = path.join(root, "Local.sqlite");
  await store.create(fallback); store.close();
  const before = await readdir(root);
  const missing = path.join(root, "Cloud.sqlite"), attempts = [];
  await assert.rejects(restoreStartupDatabase(missing, [fallback], file => { attempts.push(file); return open(file); }));
  assert.deepEqual(await readdir(root), before);
  assert.deepEqual(attempts, [missing]);
}));

test("an unreadable existing database keeps its contents and reports the error", () => fixture(async ({ root, open }) => {
  const file = path.join(root, "Invalid.sqlite");
  const bytes = Buffer.from("Keep this original file intact.");
  await writeFile(file, bytes);
  await assert.rejects(restoreStartupDatabase(undefined, [file], open));
  assert.deepEqual(await readFile(file), bytes);
}));

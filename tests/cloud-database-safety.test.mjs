import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, open, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

async function fixture(work) {
  const root = await mkdtemp(path.join(tmpdir(), "zebby-cloud-safety-"));
  let store;
  try {
    const bundle = path.join(root, "store.mjs");
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "profile"));
    const file = path.join(root, "cloud", "Applications.sqlite");
    await store.create(file);
    await work({ root, store, file });
  } finally {
    store?.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
}

test("saving cloud data keeps the original file identity and open file handle", () => fixture(async ({ store, file }) => {
  const handle = await open(file, "r");
  try {
    const original = await handle.stat({ bigint: true });
    const item = await store.saveApplication({ company: "Safety fixture", title: "Product Manager" });
    await store.saveApplicationNotes(item.id, "Retain this note.");
    const current = await stat(file, { bigint: true });
    assert.equal(current.dev, original.dev);
    assert.equal(current.ino, original.ino, "A save must update the existing cloud file, never replace it with another file.");
    const bytes = await readFile(file);
    const heldBytes = Buffer.alloc(bytes.length);
    await handle.read(heldBytes, 0, bytes.length, 0);
    assert.deepEqual(heldBytes, bytes, "A cloud provider holding the original file must see the saved database.");
    const saved = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(saved.prepare("PRAGMA quick_check").get().quick_check, "ok");
      assert.equal(saved.prepare("SELECT notes FROM applications WHERE id = ?").get(item.id).notes, "Retain this note.");
    } finally { saved.close(); }
    store.close();
    await store.open(file);
    assert.deepEqual(await readFile(file), bytes, "Opening and closing a current database must not rewrite it.");
  } finally { await handle.close(); }
}));

test("a locked cloud file keeps its original contents until Retry save succeeds", () => fixture(async ({ store, file }) => {
  const before = await readFile(file);
  const original = await stat(file, { bigint: true });
  const observer = new DatabaseSync(file);
  observer.exec("BEGIN; SELECT * FROM applications;");
  try {
    await assert.rejects(store.saveApplication({ company: "Pending save" }), /Retry save/);
    assert.equal(store.status.dirty, true);
    assert.deepEqual(await readFile(file), before, "A failed publication must leave the last committed cloud database intact.");
  } finally { observer.exec("ROLLBACK"); observer.close(); }
  await store.retrySync();
  assert.equal(store.status.dirty, false);
  assert.equal((await stat(file, { bigint: true })).ino, original.ino);
  assert.equal(store.listApplications()[0].company, "Pending save");
  store.close();
  await store.open(file);
  assert.equal(store.listApplications()[0].company, "Pending save");
}));

test("a missing cloud file is never recreated or overwritten by a save", () => fixture(async ({ store, file }) => {
  const moved = `${file}.external-move`;
  const before = await readFile(file);
  await rename(file, moved);
  await assert.rejects(store.saveApplication({ company: "Must not save" }), /missing/);
  await assert.rejects(stat(file), { code: "ENOENT" });
  assert.deepEqual(await readFile(moved), before);
  assert.equal(store.listApplications().length, 0);
}));

test("schema migration keeps the selected cloud database file identity", () => fixture(async ({ store, file }) => {
  const item = await store.saveApplication({ company: "Existing records" });
  store.close();
  const legacy = new DatabaseSync(file);
  legacy.exec("ALTER TABLE plans DROP COLUMN match_notes; PRAGMA user_version = 9;");
  legacy.close();
  const before = await stat(file, { bigint: true });
  await store.open(file);
  assert.equal((await stat(file, { bigint: true })).ino, before.ino);
  assert.equal(store.listApplications()[0].id, item.id);
}));

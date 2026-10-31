import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, rename, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { mkdirSync, renameSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { distributionChannel, readStorePackageFamily, requireDirectUpdates, requireDurableDatabase, storeDataPaths } from "../desktop/distribution.ts";
import { configureApplicationProfile, migrateApplicationProfile } from "../desktop/app-identity.ts";
import { ReleaseUpdates } from "../desktop/release-updates.ts";

const family = "Desigrit.Zebby_123456789abcd";
const windowsFolders = { packageFamilyName: family, localAppData: "C:\\Users\\Alex\\AppData\\Local",
  home: "C:\\Users\\Alex", documents: "C:\\Users\\Alex\\OneDrive\\Documents" };

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "zebby-store-channel-"));
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test("native package identity and compile-time Store channel disable direct updates only on Windows", () => {
  assert.equal(distributionChannel("win32", true, "direct"), "store");
  assert.equal(distributionChannel("win32", undefined, "store"), "store");
  assert.equal(distributionChannel("win32", false, "direct"), "direct");
  assert.equal(distributionChannel("darwin", undefined, "store"), "direct");
  assert.equal(distributionChannel("linux", true, "store"), "direct");
  assert.throws(() => requireDirectUpdates("store"), /managed by Microsoft Store/);
  assert.doesNotThrow(() => requireDirectUpdates("direct"));
});

test("Store update checks never query GitHub or acquire an installer, including forced checks", async () => {
  let fetches = 0;
  const updates = new ReleaseUpdates({ version: "2.5.2", platform: "win32", arch: "x64", channel: "store",
    fetch: async () => { fetches++; throw new Error("Store builds must not request a direct update"); } });
  await updates.check(); await updates.check(true);
  updates.setDownload({ phase: "ready", received: 100, total: 100, error: "" });
  assert.equal(fetches, 0);
  assert.equal(updates.state.available, null);
  assert.equal(updates.state.checking, false);
  assert.equal(updates.state.checkedAt, "");
  assert.equal(updates.state.download.phase, "idle");
});

test("Store package metadata accepts a bounded family name and rejects missing or unsafe identities", async (t) => {
  const root = await fixture(t);
  assert.throws(() => readStorePackageFamily(root));
  await writeFile(path.join(root, "store-identity.json"), JSON.stringify({ packageFamilyName: family }));
  assert.equal(readStorePackageFamily(root), family);
  for (const value of [{}, { packageFamilyName: "../outside" }, { packageFamilyName: "C:\\outside" },
    { packageFamilyName: "Name_abc" }, { packageFamilyName: `${"a".repeat(51)}_123456789abcd` }, null]) {
    await writeFile(path.join(root, "store-identity.json"), JSON.stringify(value));
    assert.throws(() => readStorePackageFamily(root), /package identity is invalid/);
  }
  await writeFile(path.join(root, "store-identity.json"), " ".repeat(17_000));
  assert.throws(() => readStorePackageFamily(root), /package identity is invalid/);
});

test("Store secrets and models are package-scoped while database and recovery avoid package cleanup", () => {
  const locations = storeDataPaths(windowsFolders);
  assert.equal(locations.profile, `C:\\Users\\Alex\\AppData\\Local\\Packages\\${family}\\LocalState\\Zebby`);
  assert.equal(locations.database, "C:\\Users\\Alex\\OneDrive\\Documents\\Zebby\\Zebby Applications.sqlite");
  assert.equal(locations.recovery, "C:\\Users\\Alex\\Zebby\\Recovery");
  assert.doesNotThrow(() => requireDurableDatabase(locations.database, locations.packageRoot));
  assert.doesNotThrow(() => requireDurableDatabase("D:\\OneDrive\\PM Applications.sqlite", locations.packageRoot));
  assert.doesNotThrow(() => requireDurableDatabase(`${locations.packageRoot}-other\\Application.sqlite`, locations.packageRoot));
  for (const value of [path.win32.join(locations.profile, "lost.sqlite"),
    path.win32.join(locations.profile.toUpperCase(), "..", "lost.sqlite"),
    `\\\\?\\${locations.profile}\\lost.sqlite`]) {
    assert.throws(() => requireDurableDatabase(value, locations.packageRoot), /outside Zebby's Store data folder/);
  }
  assert.throws(() => storeDataPaths({ ...windowsFolders, packageFamilyName: "..\\outside" }), /data folders/);
  assert.throws(() => storeDataPaths({ ...windowsFolders, home: locations.packageRoot }), /outside Zebby's Store/);
  assert.throws(() => storeDataPaths({ ...windowsFolders, documents: locations.packageRoot }), /outside Zebby's Store/);
  assert.throws(() => storeDataPaths({ ...windowsFolders, documents: locations.recovery }), /outside Zebby's Store/);
});

test("package cleanup preserves original and working databases without importing the direct profile or models", async (t) => {
  const root = await fixture(t);
  const paths = storeDataPaths({ home: "unused", documents: "unused", isolatedFolder: root });
  const bundle = path.join(root, "store.mjs");
  await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
    bundle: true, platform: "node", format: "esm", target: "node22" });
  const { DesktopStore } = await import(pathToFileURL(bundle).href);
  const direct = path.join(root, "Roaming", "Zebby");
  await mkdir(path.join(direct, "Models"), { recursive: true });
  await writeFile(path.join(direct, "settings.json"), '{"encryptedApiKey":"keep-in-direct-profile"}');
  await writeFile(path.join(direct, "Models", "model.gguf"), "keep-direct-model");
  const appPaths = { appData: path.dirname(direct), userData: direct };
  const app = { getPath: (name) => appPaths[name], setPath: (name, value) => { appPaths[name] = value; }, setName: () => {} };
  const profile = configureApplicationProfile(app, paths.profile);
  assert.deepEqual(profile.legacyFolders, []);
  await migrateApplicationProfile(profile);
  assert.equal(await readFile(path.join(direct, "settings.json"), "utf8"), '{"encryptedApiKey":"keep-in-direct-profile"}');
  assert.equal(await readFile(path.join(direct, "Models", "model.gguf"), "utf8"), "keep-direct-model");
  await assert.rejects(readFile(path.join(profile.folder, "settings.json")), { code: "ENOENT" });
  await mkdir(path.join(profile.folder, "Models"), { recursive: true });
  await writeFile(path.join(profile.folder, "Models", "download.gguf"), "package-owned-model");
  const db = new DesktopStore(paths.recovery);
  await db.create(paths.database);
  db.close();
  const originals = await readFile(paths.database);
  const working = await readdir(path.join(paths.recovery, "working"));
  assert.equal(working.filter((name) => name.endsWith(".sqlite")).length, 1);
  assert.ok(path.resolve(paths.packageRoot).startsWith(path.resolve(root) + path.sep));
  await rm(paths.packageRoot, { recursive: true, force: true });
  assert.deepEqual(await readFile(paths.database), originals);
  assert.deepEqual(await readdir(path.join(paths.recovery, "working")), working);
  const reopened = new DesktopStore(paths.recovery);
  await reopened.open(paths.database);
  assert.equal(reopened.status.filePath, paths.database);
  reopened.close();
  assert.equal(await readFile(path.join(direct, "Models", "model.gguf"), "utf8"), "keep-direct-model");
});

test("a failed save survives package removal and reopen as a verified recovery copy without changing the original", async (t) => {
  const root = await fixture(t);
  const paths = storeDataPaths({ home: "unused", documents: "unused", isolatedFolder: root });
  const bundle = path.join(root, "store.mjs");
  await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
    bundle: true, platform: "node", format: "esm", target: "node22" });
  const { DesktopStore } = await import(pathToFileURL(bundle).href);
  let failSave = false;
  const offline = paths.database + ".offline";
  const store = new DesktopStore(paths.recovery, (message) => {
    if (failSave && message.startsWith("Database save started")) {
      failSave = false;
      // Model a cloud destination becoming unavailable after the local commit.
      renameSync(paths.database, offline);
      mkdirSync(paths.database);
    }
  });
  t.after(() => store.close());
  await store.create(paths.database);
  await store.saveApplication({ company: "Saved company", title: "Already synced" });
  const original = await readFile(paths.database);
  const workingDir = path.join(paths.recovery, "working");
  const workingFile = path.join(workingDir, (await readdir(workingDir)).find((name) => name.endsWith(".sqlite")));
  const cleanMarker = await readFile(workingFile + ".synced.json");
  failSave = true;
  await assert.rejects(store.saveApplication({ company: "Pending company", title: "Pending local change" }), /database could not be saved/);
  assert.equal(store.status.dirty, true);
  assert.deepEqual(await readFile(workingFile + ".synced.json"), cleanMarker, "Failed sync must not mark pending data clean");
  store.close();
  await rmdir(paths.database);
  await rename(offline, paths.database);
  const pending = await readFile(workingFile);
  await writeFile(workingFile + "-journal", Buffer.alloc(0));
  await mkdir(paths.profile, { recursive: true });
  await writeFile(path.join(paths.profile, "settings.json"), "{}");
  assert.ok(path.resolve(paths.packageRoot).startsWith(path.resolve(root) + path.sep));
  await rm(paths.packageRoot, { recursive: true, force: true });
  assert.deepEqual(await readFile(paths.database), original);
  assert.deepEqual(await readFile(workingFile), pending);

  const reopened = new DesktopStore(paths.recovery);
  t.after(() => reopened.close());
  const recoveredRoot = path.join(paths.recovery, "Recovered");
  await writeFile(recoveredRoot, "Simulated unwritable recovery directory");
  await assert.rejects(reopened.open(paths.database), /could not preserve pending database changes/);
  assert.deepEqual(await readFile(workingFile), pending, "A failed recovery copy must block replacing the working DB");
  assert.deepEqual(await readFile(paths.database), original);
  await rm(recoveredRoot);
  await reopened.open(paths.database);
  assert.equal(reopened.listApplications().length, 1, "Recovery must not silently overwrite the selected original");
  assert.deepEqual(await readFile(paths.database), original);
  const folders = await readdir(recoveredRoot);
  assert.equal(folders.length, 1);
  const recoveryFile = path.join(recoveredRoot, folders[0], "Zebby Applications.sqlite");
  assert.deepEqual(await readFile(recoveryFile), pending);
  assert.deepEqual(await readFile(recoveryFile + "-journal"), Buffer.alloc(0), "Recovery preserves journal companions");
  await assert.rejects(readFile(workingFile + "-journal"), { code: "ENOENT" });
  const recoveryDb = new DatabaseSync(recoveryFile, { readOnly: true });
  try {
    assert.deepEqual(recoveryDb.prepare("SELECT title FROM applications ORDER BY title").all().map((row) => row.title),
      ["Already synced", "Pending local change"]);
  } finally { recoveryDb.close(); }
  const source = JSON.parse(await readFile(path.join(recoveredRoot, folders[0], "source.json"), "utf8"));
  assert.equal(source.originalPath, paths.database);
  reopened.close();
  await reopened.open(paths.database);
  assert.deepEqual(await readdir(recoveredRoot), folders, "A clean reopen must not produce redundant recovery databases");
  reopened.close();
});

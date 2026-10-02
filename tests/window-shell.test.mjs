import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { configureApplicationProfile, migrateApplicationProfile, migrateModelFolder } from "../desktop/app-identity.ts";
import { nativeWindowShell, windowColors } from "../desktop/window-appearance.ts";

test("Zebby migrates the profile, internal database path, logs, models, and encrypted settings without changing originals", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "zebby-identity-"));
  const legacy = path.join(fixture, "pm-application-tracker");
  await mkdir(path.join(legacy, "Models"), { recursive: true });
  const files = { "settings.json": JSON.stringify({ databasePath: path.join(legacy, "PM Applications.sqlite"),
    appearance: "dark", encryptedApiKey: "synthetic-ciphertext", ollamaModel: "qwen3.8:27b", sidebarCollapsed: true }),
    "PM Applications.sqlite": "existing database fixture", "Models/sample.gguf": "existing model fixture",
    "Logs/tracker.log": "synthetic error", "Backups/prior.sqlite": "original backup", "working/fixture.sqlite": "working bytes" };
  for (const [filename, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(legacy, filename)), { recursive: true }); await writeFile(path.join(legacy, filename), text); }
  let name = "pm-application-tracker";
  const paths = { appData: fixture, userData: legacy };
  const app = { setName: value => { name = value; }, getPath: key => paths[key], setPath: (key, value) => { paths[key] = value; } };
  try {
    const profile = configureApplicationProfile(app);
    await migrateApplicationProfile(profile);
    assert.equal(name, "Zebby");
    const destination = path.join(fixture, "Zebby");
    assert.equal(app.getPath("userData"), destination);
    assert.equal(paths.sessionData, path.join(destination, "Session"));
    for (const [filename, text] of Object.entries(files)) {
      if (filename === "settings.json") continue;
      assert.equal(await readFile(path.join(destination, filename), "utf8"), text);
      if (!filename.startsWith("Models/")) assert.equal(await readFile(path.join(legacy, filename), "utf8"), text);
    }
    const migrated = JSON.parse(await readFile(path.join(destination, "settings.json"), "utf8"));
    assert.deepEqual(migrated, { ...JSON.parse(files["settings.json"]), databasePath: path.join(destination, "PM Applications.sqlite") });
    assert.equal(await readFile(path.join(legacy, "settings.json"), "utf8"), files["settings.json"]);
    await assert.rejects(readFile(path.join(legacy, "Models/sample.gguf")), { code: "ENOENT" });
    await writeFile(path.join(destination, "settings.json"), JSON.stringify({ appearance: "light", databasePath: "changed.sqlite" }));
    await migrateApplicationProfile(profile);
    assert.equal(JSON.parse(await readFile(path.join(destination, "settings.json"), "utf8")).appearance, "light");
  } finally {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("an isolated or explicitly chosen profile stays pinned through rebranding", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "zebby-isolated-"));
  let name = "pm-application-tracker", pinned = fixture;
  const app = { setName: value => { name = value; }, getPath: () => pinned,
    setPath: (key, value) => { if (key === "userData") pinned = value; } };
  try {
    app.getPath = key => key === "appData" ? path.dirname(fixture) : pinned;
    const profile = configureApplicationProfile(app, fixture);
    await migrateApplicationProfile(profile);
    assert.equal(profile.folder, fixture);
    assert.deepEqual(profile.legacyFolders, []);
    assert.equal(pinned, fixture);
    assert.equal(name, "Zebby");
  } finally {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("profile migration keeps cloud database paths and prefers an existing Zebby profile", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "zebby-profile-cloud-"));
  const source = path.join(fixture, "PM Application Tracker"), target = path.join(fixture, "Zebby");
  await mkdir(source); await mkdir(target);
  const cloud = path.join(fixture, "cloud", "applications.sqlite");
  await writeFile(path.join(source, "settings.json"), JSON.stringify({ databasePath: cloud, appearance: "dark" }));
  try {
    await migrateApplicationProfile({ folder: target, legacyFolders: [source] });
    assert.equal(JSON.parse(await readFile(path.join(target, "settings.json"), "utf8")).databasePath, cloud);
    await writeFile(path.join(target, "settings.json"), '{"appearance":"light"}');
    await migrateApplicationProfile({ folder: target, legacyFolders: [source] });
    assert.deepEqual(JSON.parse(await readFile(path.join(target, "settings.json"), "utf8")), { appearance: "light" });
  } finally { assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep)); await rm(fixture, { recursive: true, force: true }); }
});

test("interrupted migrations recover from the original profile, and invalid source journals cannot access other folders", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "zebby-profile-resume-"));
  const source = path.join(fixture, "pm-application-tracker"), target = path.join(fixture, "Zebby");
  await mkdir(source); await mkdir(target);
  await writeFile(path.join(source, "settings.json"), '{"appearance":"dark"}');
  await writeFile(path.join(source, "PM Applications.sqlite"), "original bytes");
  await writeFile(path.join(target, "PM Applications.sqlite"), "interrupted bytes");
  await writeFile(path.join(target, "profile-migration.json"), JSON.stringify({ source, complete: false }));
  try {
    await migrateApplicationProfile({ folder: target, legacyFolders: [source] });
    assert.equal(await readFile(path.join(target, "PM Applications.sqlite"), "utf8"), "original bytes");
    assert.equal(JSON.parse(await readFile(path.join(target, "profile-migration.json"), "utf8")).complete, true);
    await writeFile(path.join(target, "profile-migration.json"), JSON.stringify({ source: fixture, complete: false }));
    await assert.rejects(migrateApplicationProfile({ folder: target, legacyFolders: [source] }), /could not be resumed/);
    assert.equal(await readFile(path.join(source, "PM Applications.sqlite"), "utf8"), "original bytes");
  } finally { assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep)); await rm(fixture, { recursive: true, force: true }); }
});

test("model migration reuses files and preserves destination downloads", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "zebby-model-migration-"));
  const source = path.join(fixture, "old", "Models"), target = path.join(fixture, "Zebby", "Models");
  await mkdir(source, { recursive: true }); await mkdir(target, { recursive: true });
  await writeFile(path.join(source, "ready.gguf"), "complete");
  await writeFile(path.join(source, "download.gguf.part"), "old part");
  await writeFile(path.join(target, "download.gguf.part"), "new part");
  try {
    await migrateModelFolder(source, target);
    assert.equal(await readFile(path.join(target, "ready.gguf"), "utf8"), "complete");
    await assert.rejects(readFile(path.join(source, "ready.gguf")), { code: "ENOENT" });
    assert.equal(await readFile(path.join(target, "download.gguf.part"), "utf8"), "new part");
    assert.equal(await readFile(path.join(source, "download.gguf.part"), "utf8"), "old part");
  } finally { assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep)); await rm(fixture, { recursive: true, force: true }); }
});

test("the integrated shell retains native controls on Windows and Mac", () => {
  const windows = nativeWindowShell("win32", "light", true);
  assert.equal(windows.titleBarStyle, "hidden");
  assert.equal(windows.titleBarOverlay.height, 44);
  assert.equal(windows.titleBarOverlay.color, "#f8f6f3");
  assert.equal(windows.titleBarOverlay.symbolColor, "#302c29");
  assert.equal(windows.trafficLightPosition, undefined);
  const mac = nativeWindowShell("darwin", "dark", false);
  assert.equal(mac.titleBarStyle, "hiddenInset");
  assert.equal(mac.titleBarOverlay.height, 44);
  assert.ok(mac.trafficLightPosition.x >= 12 && mac.trafficLightPosition.x + 70 < 96);
  assert.ok(mac.trafficLightPosition.y >= 12 && mac.trafficLightPosition.y + 14 <= 44);
  assert.equal(mac.backgroundColor, "#24201e");
});

test("explicit appearance overrides the OS while Auto follows it", () => {
  for (const systemDark of [true, false]) {
    assert.equal(windowColors("light", systemDark).background, "#f8f6f3");
    assert.equal(windowColors("dark", systemDark).background, "#24201e");
    assert.equal(windowColors("auto", systemDark).background, systemDark ? "#24201e" : "#f8f6f3");
    assert.equal(windowColors(undefined, systemDark).background, systemDark ? "#24201e" : "#f8f6f3");
  }
});

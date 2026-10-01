import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { preserveApplicationProfile } from "../desktop/app-identity.ts";
import { nativeWindowShell, windowColors } from "../desktop/window-appearance.ts";

test("Zebby keeps the earlier profile and its files when the display name changes", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "zebby-identity-"));
  const legacy = path.join(fixture, "PM Application Tracker");
  await mkdir(path.join(legacy, "Models"), { recursive: true });
  const files = { "settings.json": '{"databasePath":"selected.sqlite","appearance":"dark"}',
    "PM Applications.sqlite": "existing database fixture", "Models/sample.gguf": "existing model fixture" };
  for (const [filename, text] of Object.entries(files)) await writeFile(path.join(legacy, filename), text);
  let name = "pm-application-tracker", pinned;
  const app = { setName: value => { name = value; }, getPath: () => pinned || path.join(fixture, name),
    setPath: (_key, value) => { pinned = value; } };
  try {
    assert.equal(await preserveApplicationProfile(app), legacy);
    assert.equal(name, "Zebby");
    assert.equal(app.getPath("userData"), legacy);
    for (const [filename, text] of Object.entries(files)) assert.equal(await readFile(path.join(legacy, filename), "utf8"), text);
  } finally {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("an isolated or explicitly chosen profile stays pinned through rebranding", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "zebby-isolated-"));
  let name = "pm-application-tracker", pinned = fixture;
  const app = { setName: value => { name = value; }, getPath: () => pinned,
    setPath: (_key, value) => { pinned = value; } };
  try {
    assert.equal(await preserveApplicationProfile(app), fixture);
    assert.equal(pinned, fixture);
    assert.equal(name, "Zebby");
  } finally {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("the integrated shell retains native controls on Windows and Mac", () => {
  const windows = nativeWindowShell("win32", "light", true);
  assert.equal(windows.titleBarStyle, "hidden");
  assert.equal(windows.titleBarOverlay.height, 44);
  assert.equal(windows.titleBarOverlay.color, "#f4f5f7");
  assert.equal(windows.titleBarOverlay.symbolColor, "#23252a");
  assert.equal(windows.trafficLightPosition, undefined);
  const mac = nativeWindowShell("darwin", "dark", false);
  assert.equal(mac.titleBarStyle, "hiddenInset");
  assert.equal(mac.titleBarOverlay.height, 44);
  assert.ok(mac.trafficLightPosition.x >= 12 && mac.trafficLightPosition.x + 70 < 96);
  assert.ok(mac.trafficLightPosition.y >= 12 && mac.trafficLightPosition.y + 14 <= 44);
  assert.equal(mac.backgroundColor, "#1d1f24");
});

test("explicit appearance overrides the OS while Auto follows it", () => {
  for (const systemDark of [true, false]) {
    assert.equal(windowColors("light", systemDark).background, "#f4f5f7");
    assert.equal(windowColors("dark", systemDark).background, "#1d1f24");
    assert.equal(windowColors("auto", systemDark).background, systemDark ? "#1d1f24" : "#f4f5f7");
    assert.equal(windowColors(undefined, systemDark).background, systemDark ? "#1d1f24" : "#f4f5f7");
  }
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { SelfUpdater } from "../desktop/self-update.ts";

// Exercise real DMG mounting, bundle copying, shell replacement, reopening,
// rollback, and recovery cleanup with harmless generated apps on a Mac runner.
if (process.platform !== "darwin" || process.env.GITHUB_ACTIONS !== "true") throw new Error("Run this check only on a Mac GitHub Actions runner.");
const run = promisify(execFile), root = await mkdtemp(path.join(tmpdir(), "zebby-mac-update-"));
async function buildApp(folder, version, marker) {
  await mkdir(path.join(folder, "Contents", "MacOS"), { recursive: true });
  await writeFile(path.join(folder, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.desigrit.pmapplications</string>
<key>CFBundleExecutable</key><string>Zebby</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleName</key><string>Zebby</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`);
  const source = path.join(root, `app-${version}.c`);
  await writeFile(source, `#include <stdio.h>\nint main(void) { FILE *f = fopen(${JSON.stringify(marker)}, "w"); if (!f) return 1; fputs("${version}", f); fclose(f); return 0; }\n`);
  await run("/usr/bin/cc", [source, "-o", path.join(folder, "Contents", "MacOS", "Zebby")]);
}
try {
  const target = path.join(root, "Applications", "Zebby.app"), source = path.join(root, "image", "Zebby.app");
  const oldMarker = path.join(root, "old-opened"), newMarker = path.join(root, "new-opened");
  await buildApp(target, "1.0.0", oldMarker); await buildApp(source, "2.0.0", newMarker);
  const dmg = path.join(root, "fixture.dmg");
  await run("/usr/bin/hdiutil", ["create", "-srcfolder", path.dirname(source), "-format", "UDZO", "-ov", dmg]);
  const bytes = await readFile(dmg), folder = path.join(root, "Updates");
  const release = { version: "2.0.0", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    installerUrl: "https://github.com/desigrit/zebby-the-scout/releases/download/v2.0.0/Zebby-2.0.0-mac-arm64.dmg",
    releaseUrl: "https://github.com/desigrit/zebby-the-scout/releases/tag/v2.0.0" };
  const options = { folder, platform: "darwin", arch: "arm64", executable: path.join(target, "Contents", "MacOS", "Zebby"),
    fetch: async () => new Response(bytes), onChange: () => {},
    // A nonexistent PID represents the old app having quit, without terminating this test.
    launch: async (file, args) => { await run(file, [args[0], "99999999", ...args.slice(2)], { timeout: 30_000 }); } };
  const updater = new SelfUpdater(options); await updater.download(release);
  const prepared = JSON.parse(await readFile(path.join(folder, "pending.json"), "utf8"));
  await updater.install();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await access(newMarker).then(() => true, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await readFile(newMarker, "utf8"), "2.0.0");
  assert.match(await readFile(path.join(prepared.backup, "Contents", "Info.plist"), "utf8"), /1\.0\.0/);
  await updater.cleanupInstalled("2.0.0"); await assert.rejects(access(prepared.backup), { code: "ENOENT" });
  // Force an immediate Launch Services error and verify that the previous app is restored.
  const rollback = new SelfUpdater(options); await rollback.download(release);
  const next = JSON.parse(await readFile(path.join(folder, "pending.json"), "utf8"));
  await run("/usr/libexec/PlistBuddy", ["-c", "Set:CFBundleExecutable MissingExecutable", path.join(next.staged, "Contents", "Info.plist")]);
  await assert.rejects(rollback.install());
  await access(path.join(target, "Contents", "MacOS", "Zebby"));
  await assert.rejects(access(next.backup), { code: "ENOENT" });
  assert.match(await readFile(path.join(folder, "update.log"), "utf8"), /Previous app restored/);
  console.log("Native Mac update mounted, verified, staged, replaced, reopened, cleaned recovery files, and restored the old app on launch failure.");
} finally {
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(root, { recursive: true, force: true });
}

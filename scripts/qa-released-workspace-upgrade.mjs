import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { _electron } from "playwright-core";

assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const run = promisify(execFile);
const root = await mkdtemp(path.join(process.env.RUNNER_TEMP, "zebby-released-upgrade-"));
const windows = process.platform === "win32";
assert.ok(windows || process.platform === "darwin" && process.arch === "arm64");
const asset = windows ? "Zebby-2.6.4-win-x64.exe" : "Zebby-2.6.4-mac-arm64.dmg";
const source = path.join(root, asset);
await run("gh", ["release", "download", "v2.6.4", "-R", process.env.GITHUB_REPOSITORY, "-p", asset, "-D", root]);
assert.equal(createHash("sha256").update(await readFile(source)).digest("hex"), windows
  ? "ef588a76f1a8d9ed8d92d52be02283756cc732d5457ae64d6457f02b732ec440"
  : "b7400e4be38a8d2a61d76fba9f912ba793787f9a17cfd5fb805425bd786c5809");
const target = path.join(root, windows ? "install" : "Zebby.app");
const exe = windows ? path.join(target, "Zebby.exe") : path.join(target, "Contents/MacOS/Zebby");
if (windows) {
  await run(source, ["/S", "/D=" + target], { timeout: 180000, windowsHide: true });
} else {
  const volume = path.join(root, "volume");
  await mkdir(volume);
  await run("hdiutil", ["attach", source, "-readonly", "-nobrowse", "-mountpoint", volume]);
  try { await run("ditto", [path.join(volume, "Zebby.app"), target]); }
  finally { await run("hdiutil", ["detach", volume]); }
}
const applicationFile = path.join(root, "Release verification.sqlite");
const companion = path.join(root, "Release verification-boards.sqlite");
await assert.rejects(access(companion), { code: "ENOENT" });
const app = await _electron.launch({ executablePath: exe, args: [], timeout: 90000 });
const page = await app.firstWindow({ timeout: 45000 });
page.setDefaultTimeout(25000);
assert.equal(await app.evaluate(({app}) => app.getVersion()), "2.6.4");
await app.evaluate(({dialog}, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, applicationFile);
await page.getByRole("button", { name: "Create database", exact: true }).click();
await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
const saved = await page.evaluate(async () => {
  const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({company:"Upgrade verification", title:"Product Manager fixture", status:"Applied", matchStrength:84, locations:"Seattle, WA",
      jobDescription:"Lead product discovery and improve the application for customers."}) });
  if (!response.ok) throw Error(await response.text());
  return (await response.json()).application;
});
assert.equal(saved.title, "Product Manager fixture");
await page.getByRole("navigation", {name:"Workspace"}).getByRole("button", {name:"Settings",exact:true}).click();
const updates = page.getByRole("region", {name:"Updates",exact:true});
await page.evaluate(() => window.desktop.checkForUpdates());
await updates.getByRole("button", {name:"Update to 2.7.0",exact:true}).click();
const restart = updates.getByRole("button", {name:"Restart to update",exact:true});
await restart.waitFor({state:"visible",timeout:240000});
await assert.rejects(access(companion), { code: "ENOENT" });
console.log("Public 2.6.4 Settings found, downloaded and verified the 2.7.0 installer.");
await restart.click().catch(error => { if (!/closed|destroyed|gone/i.test(error.message)) throw error; });
let ready = false;
for (let i = 0; i < 180; i++) {
  try { await access(companion); ready = true; break; } catch { await delay(1000); }
}
assert.ok(ready, "The restarted release must restore the old workspace and create its companion.");
const applications = new DatabaseSync(applicationFile, {readOnly:true});
const boards = new DatabaseSync(companion, {readOnly:true});
try {
  assert.equal(applications.prepare("SELECT title FROM applications WHERE id=?").get(saved.id).title, saved.title);
  assert.equal(boards.prepare("PRAGMA application_id").get().application_id, 0x5a424259);
  assert.equal(boards.prepare("SELECT COUNT(*) AS n FROM boards").get().n, 0);
} finally { applications.close(); boards.close(); }
const version = windows
  ? (await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-Item -LiteralPath $env:ZEBBY_QA_EXE).VersionInfo.ProductVersion"], { env:{...process.env,ZEBBY_QA_EXE:exe} })).stdout.trim()
  : (await run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(target,"Contents/Info.plist")])).stdout.trim();
assert.match(version, /^2\.7\.0(?:\.0)?$/);
console.log(process.platform, process.arch, "restarted in", version, "and retained the application in its newly paired workspace.");

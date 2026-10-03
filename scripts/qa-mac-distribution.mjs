import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { _electron } from "playwright-core";

// Validate the distributed bundle, rather than just its Node mode or an update
// fixture. The test uses an isolated profile and never opens a user's database.
if (process.platform !== "darwin" || process.arch !== "arm64" || process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Run this check only on an Apple Silicon Mac GitHub Actions runner.");
}
const run = promisify(execFile);
const output = path.resolve("work/mac-distribution-qa");
const root = await mkdtemp(path.join(tmpdir(), "zebby-mac-distribution-"));
const report = { checks: [], errors: [], notarized: false };
let app;
await mkdir(output, { recursive: true });

async function outcome(file, args) {
  try {
    const result = await run(file, args, { timeout: 60_000 });
    return { code: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: String(error.stdout || "").trim(), stderr: String(error.stderr || "").trim() };
  }
}
async function mounted(dmg, name, inspect) {
  const mount = path.join(root, name);
  await mkdir(mount);
  let attached = false;
  try {
    await run("/usr/bin/hdiutil", ["verify", dmg], { timeout: 60_000 });
    await run("/usr/bin/hdiutil", ["attach", dmg, "-readonly", "-nobrowse", "-mountpoint", mount]);
    attached = true;
    return await inspect(path.join(mount, "Zebby.app"));
  } finally {
    if (attached) await run("/usr/bin/hdiutil", ["detach", mount]);
  }
}
async function comparePreviousRelease(tag) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/);
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "Zebby package QA" };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/desigrit/zebby-the-scout/releases/tags/${tag}`, { headers, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  const release = await response.json();
  const name = `Zebby-${tag.slice(1)}-mac-arm64.dmg`;
  const asset = release.assets.find((item) => item.name === name);
  assert.ok(asset, "Previous Mac installer exists");
  const url = `https://github.com/desigrit/zebby-the-scout/releases/download/${tag}/${name}`;
  assert.equal(asset.browser_download_url, url);
  assert.match(asset.digest, /^sha256:[0-9a-f]{64}$/);
  const download = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  assert.equal(download.status, 200);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.length, asset.size);
  assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, asset.digest);
  const dmg = path.join(root, name);
  await writeFile(dmg, bytes);
  report.previousRelease = await mounted(dmg, "previous", async (bundle) => ({
    tag, checksumVerified: true,
    signature: await outcome("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", bundle]),
    identity: await outcome("/usr/bin/codesign", ["--display", "--verbose=4", bundle]),
  }));
  console.log(`Previous ${tag} signature check exited ${report.previousRelease.signature.code}.`);
}

try {
  report.os = (await run("/usr/bin/sw_vers")).stdout.trim();
  assert.match(report.os, /ProductVersion:\s+26\./);
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  report.version = pkg.version;
  if (process.env.ZEBBY_MAC_COMPARE_RELEASE) await comparePreviousRelease(process.env.ZEBBY_MAC_COMPARE_RELEASE);
  const dmg = path.resolve(`desktop-packages/Zebby-${pkg.version}-mac-arm64.dmg`);
  const installed = path.join(root, "Applications", "Zebby.app");
  await mkdir(path.dirname(installed));
  await mounted(dmg, "current", async (bundle) => {
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", bundle]);
    await run("/usr/bin/ditto", [bundle, installed]);
  });
  report.checks.push("DMG integrity and sealed bundle signature verified before copying");
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", installed]);
  report.signature = (await run("/usr/bin/codesign", ["--display", "--verbose=4", installed])).stderr.trim();
  assert.match(report.signature, /Signature=adhoc/);
  await run("/usr/bin/lipo", [path.join(installed, "Contents/MacOS/Zebby"), "-verify_arch", "arm64"]);
  const plist = path.join(installed, "Contents/Info.plist");
  assert.equal((await run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist])).stdout.trim(), pkg.build.appId);
  assert.equal((await run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plist])).stdout.trim(), pkg.version);
  report.checks.push("Copied app retains its signature, Apple Silicon executable and release identity");

  // Model the browser-download attribute. Ad-hoc signing cannot confer Apple's
  // developer trust. Record policy separately instead of claiming acceptance.
  await run("/usr/bin/xattr", ["-w", "com.apple.quarantine", "0083;00000000;Zebby QA;", installed]);
  report.gatekeeperStatus = await outcome("/usr/sbin/spctl", ["--status"]);
  report.quarantinedAssessment = await outcome("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", installed]);
  report.checks.push("Downloaded-app policy assessment is recorded separately from signature validity and Apple notarization");

  // Apply the documented one-app approval workaround only to this temporary
  // fixture, then exercise Electron's full GUI startup using the copied bundle.
  await run("/usr/bin/xattr", ["-d", "com.apple.quarantine", installed]);
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", installed]);
  app = await _electron.launch({ executablePath: path.join(installed, "Contents/MacOS/Zebby"),
    args: ["--disable-gpu"], timeout: 30_000,
    env: { ...process.env, PM_TRACKER_TEST_USER_DATA: path.join(root, "profile"), PM_TRACKER_TEST_HIDE_WINDOW: "1", ELECTRON_RUN_AS_NODE: "" } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
  const state = await page.evaluate(() => window.desktop.state());
  assert.equal(state.platform, "darwin");
  assert.ok(state.filePath.startsWith(path.join(root, "profile") + path.sep));
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Applications", exact: true }).click();
  await page.getByRole("main", { name: "Applications", exact: true }).waitFor();
  report.checks.push("Actual copied app launches its GUI with a new isolated database on Tahoe");
  console.log(`Zebby ${pkg.version}: signature, DMG copy and actual GUI startup passed on Tahoe. Apple notarization is not configured; first launch needs user approval.`);
} catch (error) {
  report.errors.push(String(error.stack || error));
  throw error;
} finally {
  await app?.close();
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(root, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify, parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { _electron as electron } from "playwright-core";

if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_OS !== "Windows" || process.env.ZEBBY_MSIX_QA_RUNNER !== "github-hosted") {
  throw new Error("Installed MSIX validation is restricted to a disposable GitHub-hosted Windows runner.");
}
const { values } = parseArgs({ options: { installed: { type: "string" }, output: { type: "string" }, phase: { type: "string", default: "smoke" } } });
if (!values.installed || !values.output || !["smoke", "after-uninstall"].includes(values.phase)) throw new Error("Provide --installed, --output and a supported --phase.");
const installed = JSON.parse(await readFile(values.installed, "utf8"));
assert.equal(installed.name, "Zebby.StoreQA");
assert.match(installed.packageFamilyName, /^Zebby\.StoreQA_[a-z0-9]{13}$/);
const output = path.resolve(values.output);
await mkdir(output, { recursive: true });
const execute = promisify(execFile);
const checks = [];
const report = { status: "running", phase: values.phase, packageFamilyName: installed.packageFamilyName, checks };
const reportPath = path.join(output, values.phase === "smoke" ? "smoke-report.json" : "uninstall-report.json");
const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const inside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return !relative || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
async function exists(file) {
  try { await stat(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
let app;
let page;
let profile;

async function nativePackageFamily(pid) {
  assert.ok(Number.isInteger(pid) && pid > 0);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ZebbyQaPackageIdentity {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetPackageFamilyName(IntPtr process, ref uint length, StringBuilder family);
}
'@
$target = [Diagnostics.Process]::GetProcessById(${pid})
[uint32]$length = 0
$result = [ZebbyQaPackageIdentity]::GetPackageFamilyName($target.Handle, [ref]$length, $null)
if ($result -ne 122) { throw "Package identity lookup failed: $result" }
$family = New-Object Text.StringBuilder ([int]$length)
$result = [ZebbyQaPackageIdentity]::GetPackageFamilyName($target.Handle, [ref]$length, $family)
if ($result -ne 0) { throw "Package identity lookup failed: $result" }
[Console]::Write($family.ToString())
`;
  return (await execute("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 })).stdout.trim();
}

try {
  if (values.phase === "after-uninstall") {
    const smoke = JSON.parse(await readFile(path.join(output, "smoke-report.json"), "utf8"));
    assert.equal(smoke.status, "passed");
    assert.equal(smoke.packageFamilyName, installed.packageFamilyName);
    for (const { file, sha256: expected } of smoke.durableFiles) {
      assert.equal(inside(smoke.packageRoot, file), false, "Database originals and working copies must be outside package cleanup");
      assert.equal(await sha256(file), expected, `Uninstall changed a durable database: ${file}`);
    }
    const db = new DatabaseSync(smoke.selectedDatabase, { readOnly: true });
    try {
      const row = db.prepare("SELECT title, match_strength FROM applications").get();
      assert.equal(row.title, "Durable Store application");
      assert.equal(row.match_strength, 84);
    } finally { db.close(); }
    checks.push("Original databases and working SQLite copies survived uninstall byte for byte.");
    for (const file of smoke.packageFiles) {
      assert.equal(inside(smoke.packageRoot, file), true);
      for (let attempt = 0; attempt < 40 && await exists(file); attempt++) await delay(250);
      assert.equal(await exists(file), false, `Windows did not remove package-owned data: ${file}`);
    }
    checks.push("Windows removed package-owned model, settings and session files.");
    for (const { file, sha256: expected } of smoke.standaloneFiles) assert.equal(await sha256(file), expected);
    checks.push("The standalone profile and model files remained unchanged.");
  } else {
    const packageRoot = path.join(process.env.LOCALAPPDATA, "Packages", installed.packageFamilyName);
    const executable = path.join(installed.installLocation, "app", "Zebby.exe");
    assert.equal(path.isAbsolute(installed.installLocation), true);
    assert.equal(inside(installed.installLocation, executable), true);
    const metadata = JSON.parse(await readFile(path.join(installed.installLocation, "app", "resources", "store-identity.json"), "utf8"));
    assert.equal(metadata.identityName, "Zebby.StoreQA");
    assert.equal(metadata.publisher, "CN=Zebby Store QA");
    assert.equal(metadata.packageFamilyName, installed.packageFamilyName);
    assert.equal(metadata.architecture, "x64");

    // Fixture files live only on this disposable runner. Their hashes prove Store setup does not import or move them.
    const standaloneProfile = path.join(process.env.APPDATA, "Zebby", "settings.json");
    const standaloneModel = path.join(process.env.LOCALAPPDATA, "Zebby", "Models", "msix-qa-standalone.gguf");
    for (const file of [standaloneProfile, standaloneModel]) { assert.equal(await exists(file), false, "A fresh runner is required"); await mkdir(path.dirname(file), { recursive: true }); }
    await writeFile(standaloneProfile, JSON.stringify({ analysisProvider: "anthropic", databasePath: "Z:\\MustNotImport.sqlite" }), { flag: "wx" });
    await writeFile(standaloneModel, "Standalone model fixture", { flag: "wx" });
    report.standaloneFiles = await Promise.all([standaloneProfile, standaloneModel].map(async (file) => ({ file, sha256: await sha256(file) })));

    const environment = { ...process.env };
    for (const key of ["PM_TRACKER_TEST_USER_DATA", "ELECTRON_RUN_AS_NODE", "ZEBBY_DISTRIBUTION_CHANNEL"]) delete environment[key];
    app = await electron.launch({ executablePath: executable, args: [], cwd: installed.installLocation, env: environment, timeout: 60_000 });
    page = await app.firstWindow({ timeout: 30_000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(15_000);
    const native = await app.evaluate(({ app }) => ({ pid: process.pid, windowsStore: process.windowsStore, packaged: app.isPackaged,
      executable: app.getPath("exe"), userData: app.getPath("userData"), session: app.getPath("sessionData"),
      documents: app.getPath("documents"), home: app.getPath("home"), resources: process.resourcesPath }));
    assert.equal(native.windowsStore, true, "A compile-time Store flag alone is not a valid installed-package test");
    assert.equal(native.packaged, true);
    assert.equal(path.resolve(native.executable).toLowerCase(), path.resolve(executable).toLowerCase());
    assert.equal(await nativePackageFamily(native.pid), installed.packageFamilyName);
    profile = path.join(packageRoot, "LocalState", "Zebby");
    assert.equal(native.userData.toLowerCase(), profile.toLowerCase());
    assert.equal(native.session.toLowerCase(), path.join(profile, "Session").toLowerCase());
    report.native = native;
    report.packageRoot = packageRoot;
    checks.push("The installed executable has the expected Windows package identity and native process.windowsStore is true.");

    // Keep external services out of the package test. Only the local-server protocol receives fixture replies.
    await app.evaluate(({ shell }) => {
      globalThis.__msixQA = { fetches: [], links: [] };
      shell.openExternal = async (url) => { globalThis.__msixQA.links.push(url); };
      globalThis.fetch = async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        globalThis.__msixQA.fetches.push(url);
        if (/^http:\/\/(localhost|127\.0\.0\.1):11434\/api\/tags$/.test(url)) return Response.json({ models: [{ name: "qa-local-model", modified_at: "2026-01-01T00:00:00Z" }] });
        if (/^http:\/\/(localhost|127\.0\.0\.1):11434\/api\/show$/.test(url)) return Response.json({ capabilities: ["completion"] });
        throw new Error("External requests are disabled during installed-package validation.");
      };
    });
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await nav.waitFor();
    const initial = await page.evaluate(() => window.desktop.state());
    assert.equal(initial.distributionChannel, "store");
    assert.equal(initial.startupError, "");
    assert.equal(initial.filePath.toLowerCase(), path.join(native.documents, "Zebby", "Zebby Applications.sqlite").toLowerCase());
    assert.equal(initial.modelsFolder.toLowerCase(), path.join(profile, "Models").toLowerCase());
    assert.equal(initial.logsPath.toLowerCase(), path.join(profile, "Logs").toLowerCase());
    assert.equal(inside(packageRoot, initial.filePath), false);
    assert.equal(initial.hasApiKey, false);
    const recovery = path.join(native.home, "Zebby", "Recovery");
    assert.equal(inside(packageRoot, recovery), false);
    assert.equal(await exists(path.join(recovery, "working")), true);
    report.defaultDatabase = initial.filePath;
    report.recovery = recovery;
    checks.push("Default SQLite and recovery use durable user folders; private data uses the package LocalState profile.");

    for (const operation of ["downloadUpdate", "installUpdate"]) {
      const message = await page.evaluate(async (name) => { try { await window.desktop[name](); return "Unexpected success"; } catch (error) { return error.message; } }, operation);
      assert.match(message, /Updates are managed by Microsoft Store/);
    }
    const updates = await page.evaluate(async () => { await window.desktop.confirmUpdateLoaded(); return window.desktop.checkForUpdates(); });
    assert.equal(updates.available, null); assert.equal(updates.checkedAt, ""); assert.equal(updates.download.phase, "idle");
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Open Microsoft Store", exact: true }).click();
    assert.deepEqual(await app.evaluate(() => globalThis.__msixQA.links), ["ms-windows-store://downloadsandupdates"]);
    assert.equal(await page.getByRole("button", { name: "Check for updates", exact: true }).count(), 0);
    checks.push("Settings opens Microsoft Store; native IPC refuses GitHub installer download and installation.");

    const provider = page.getByRole("combobox", { name: "Analyze with", exact: true });
    assert.deepEqual(await provider.locator("option").evaluateAll((options) => options.map((option) => option.value)), ["credits", "ollama", "builtin", "openai", "anthropic"]);
    for (const name of ["credits", "ollama", "builtin", "openai", "anthropic"]) {
      await provider.selectOption(name);
      await page.waitForFunction(async (expected) => (await window.desktop.state()).analysisProvider === expected, name);
      if (name === "credits") await page.getByRole("button", { name: "Buy credits", exact: true }).waitFor();
      if (name === "ollama") { await page.getByRole("textbox", { name: "Server URL", exact: true }).waitFor(); await page.getByRole("button", { name: "Test connection", exact: true }).click(); await page.getByText("Connected", { exact: true }).waitFor(); }
      if (name === "builtin") await page.getByRole("combobox", { name: "Local model", exact: true }).waitFor();
      if (name === "openai" || name === "anthropic") {
        assert.equal((await page.evaluate(() => window.desktop.state())).canSaveApiKey, true);
        const key = name === "openai" ? "sk-msix-qa-fixture" : "sk-ant-msix-qa-fixture";
        await page.getByLabel("API key", { exact: true }).fill(key);
        await page.getByLabel("API key", { exact: true }).press("Enter");
        await page.getByRole("button", { name: "Change key", exact: true }).waitFor();
      }
    }
    const privateSettings = await readFile(path.join(profile, "settings.json"), "utf8");
    assert.ok(!privateSettings.includes("sk-msix-qa-fixture") && !privateSettings.includes("sk-ant-msix-qa-fixture"));
    const encrypted = JSON.parse(privateSettings);
    assert.ok(encrypted.encryptedApiKey && encrypted.encryptedAnthropicKey);
    checks.push("All five analysis providers remain selectable, local server connectivity works, and BYOK secrets use Windows encryption.");
    await page.screenshot({ path: path.join(output, "settings-store.png"), fullPage: true });

    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, path.join(profile, "unsafe.sqlite"));
    const refusal = await page.evaluate(async () => { try { await window.desktop.chooseDatabase("create"); return "Unexpected success"; } catch (error) { return error.message; } });
    assert.match(refusal, /outside Zebby's Store data folder/);
    assert.equal(await exists(path.join(profile, "unsafe.sqlite")), false);
    const selectedDatabase = path.join(native.documents, "Zebby", "MSIX QA", "Applications.sqlite");
    assert.equal(await exists(selectedDatabase), false);
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, selectedDatabase);
    await page.getByRole("button", { name: "Create new database", exact: true }).click();
    await page.waitForFunction(async (file) => (await window.desktop.state()).filePath === file, selectedDatabase);
    const saved = await page.evaluate(async () => {
      const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        company: "Store QA", title: "Durable Store application", matchStrength: 84, status: "Applied", locations: "Seattle, WA",
        jobDescription: "Lead product discovery and improve a useful application for customers." }) });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    });
    assert.equal(saved.application.matchStrength, 84);
    report.selectedDatabase = selectedDatabase;
    await nav.getByRole("button", { name: "Applications", exact: true }).click();
    await page.getByText("Durable Store application", { exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(output, "applications-store.png"), fullPage: true });
    await nav.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
    checks.push("Native database picker rejects package-private paths and saves application data to the selected durable file.");

    const packageFiles = [path.join(initial.modelsFolder, "msix-qa-download.gguf"), path.join(native.session, "msix-qa-session.txt")];
    await app.evaluate((_electron, files) => {
      const fs = process.getBuiltinModule("node:fs");
      const path = process.getBuiltinModule("node:path");
      for (const file of files) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "Installed package ownership fixture", { flag: "wx" }); }
    }, packageFiles);
    report.packageFiles = [...packageFiles, path.join(profile, "settings.json")];
    for (const file of report.packageFiles) assert.equal(await exists(file), true, "Native package writes must appear under its real LocalState folder");

    const runtimeRoot = path.join(native.resources, "local-runtime");
    const runtime = JSON.parse(await readFile(path.join(runtimeRoot, "runtime.json"), "utf8"));
    const cpuExecutable = path.resolve(runtimeRoot, runtime.executable);
    assert.equal(inside(runtimeRoot, cpuExecutable), true);
    // Start native code from its owning package, matching the production engine path.
    // A separate QA Node process cannot directly execute private binaries under WindowsApps.
    const worker = await app.evaluate(async ({ app }, cpuExecutable) => {
      const { spawn } = process.getBuiltinModule("node:child_process");
      const path = process.getBuiltinModule("node:path");
      const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LLAMA_|^GGML_/i.test(key)));
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(app.getAppPath(), "desktop-dist", "local-runtime-worker.cjs"), String(process.pid), cpuExecutable, "--version"],
          { cwd: path.dirname(cpuExecutable), windowsHide: true, stdio: ["pipe", "ignore", "pipe"], env: { ...environment, ELECTRON_RUN_AS_NODE: "1" } });
        let stderr = "";
        const timeout = setTimeout(() => { child.kill(); reject(new Error("The installed ASAR worker did not complete its CPU smoke check.")); }, 25_000);
        child.stderr.on("data", (data) => { stderr = (stderr + String(data)).slice(-8192); });
        child.stdin.on("error", () => {});
        child.once("error", (error) => { clearTimeout(timeout); reject(error); });
        child.once("close", (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stderr }); });
      });
    }, cpuExecutable);
    await writeFile(path.join(output, "installed-asar-worker.json"), JSON.stringify(worker, null, 2));
    assert.equal(worker.code, 0, "The packaged app must launch its ASAR worker and CPU runtime successfully");
    assert.equal(worker.signal, null);
    checks.push("The installed app launches Electron RUN_AS_NODE, its ASAR worker and the CPU runtime successfully.");

    const fetches = await app.evaluate(() => globalThis.__msixQA.fetches);
    assert.equal(fetches.some((url) => /api\.github\.com|github\.com\/.*\/releases/.test(url)), false);
    assert.deepEqual(errors, []);
    await app.close(); app = undefined;
    const workingFiles = (await readdir(path.join(recovery, "working"))).filter((name) => name.endsWith(".sqlite")).map((name) => path.join(recovery, "working", name));
    assert.equal(workingFiles.length, 2);
    report.durableFiles = await Promise.all([initial.filePath, selectedDatabase, ...workingFiles].map(async (file) => ({ file, sha256: await sha256(file) })));
    for (const { file, sha256: expected } of report.standaloneFiles) assert.equal(await sha256(file), expected);
    await cp(path.join(profile, "Logs"), path.join(output, "profile-logs"), { recursive: true });
    checks.push("No GitHub updater calls or renderer failures occurred, and the standalone installation's files were unchanged.");
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack || error.message;
  if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  if (profile && await exists(path.join(profile, "Logs"))) await cp(path.join(profile, "Logs"), path.join(output, "profile-logs"), { recursive: true }).catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
}
console.log(`${values.phase}: ${report.status}; ${checks.length} checks. Report: ${reportPath}`);

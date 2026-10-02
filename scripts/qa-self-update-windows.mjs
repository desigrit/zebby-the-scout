import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Real NSIS replacement check, restricted to disposable GitHub Actions machines.
// Silent installs omit --force-run, so no desktop window is launched.
if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true") throw new Error("Run this check only on a Windows GitHub Actions runner.");
const run = promisify(execFile), root = await mkdtemp(path.join(tmpdir(), "zebby-nsis-update-"));
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const installer = path.resolve(`desktop-packages/Zebby-${version}-win-x64.exe`), install = path.join(root, "install");
const profile = path.join(process.env.APPDATA, "Zebby"), models = path.join(process.env.LOCALAPPDATA, "Zebby", "Models");
const fixtures = [[path.join(profile, "update-qa.sqlite"), "synthetic database"],
  [path.join(profile, "update-qa-settings.json"), "synthetic settings"],
  [path.join(models, "SmolLM2-360M-Instruct-Q4_K_M.gguf"), "synthetic model"]];
const created = [];
try {
  await run(installer, ["/S", `/D=${install}`], { windowsHide: true, timeout: 120_000 });
  const installedAsar = path.join(install, "resources", "app.asar");
  const original = createHash("sha256").update(await readFile(installedAsar)).digest("hex");
  for (const [file, text] of fixtures) {
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text, { flag: "wx" }); created.push(file);
  }
  await writeFile(installedAsar, "old app placeholder, never executed");
  await run(installer, ["--updated", "/S", `/D=${install}`], { windowsHide: true, timeout: 120_000 });
  assert.equal(createHash("sha256").update(await readFile(installedAsar)).digest("hex"), original);
  for (const [file, text] of fixtures) assert.equal(await readFile(file, "utf8"), text);
  console.log("Native NSIS update replaced the app and preserved database, settings, and model fixtures. No app window was launched.");
} finally {
  const uninstaller = (await readdir(install).catch(() => [])).find(file => /^Uninstall.*\.exe$/i.test(file));
  if (uninstaller) await run(path.join(install, uninstaller), ["--updated", "/S"], { windowsHide: true, timeout: 120_000 });
  for (const file of created) await rm(file, { force: true });
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

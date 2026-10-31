import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { load } from "cheerio";
import JSZip from "jszip";
import { storeIdentity } from "./msix-package.mjs";

if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_OS !== "Windows" || process.env.ZEBBY_MSIX_QA_RUNNER !== "github-hosted") {
  throw new Error("Interactive MSIX finalizer validation is restricted to a disposable GitHub-hosted Windows runner.");
}
const { values } = parseArgs({ options: { output: { type: "string", default: "work/msix/ci" } } });
const repo = path.resolve(import.meta.dirname, "..");
const output = path.resolve(repo, values.output);
const allowed = path.join(repo, "work", "msix");
const inside = (root, file) => {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
assert.equal(inside(allowed, output), true, "Finalizer QA must stay inside this checkout's work/msix directory");
const buildRoot = path.join(output, "Source and build");
const packages = path.join(output, "Packages");
const validation = path.join(output, "Validation");
const qa = path.join(validation, "interactive-finalizer");
await mkdir(qa, { recursive: true });
const checks = [];
const report = { status: "running", invocation: "Windows PowerShell 5.1 Read-Host", checks };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
const windowsPowerShell = path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const childEnv = { ...process.env };
// Let Windows PowerShell restore its own module search path, including Get-FileHash.
for (const key of Object.keys(childEnv)) if (key.toLowerCase() === "psmodulepath") delete childEnv[key];

async function runPowerShell(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(windowsPowerShell, ["-NoLogo", "-NoProfile", ...args], {
      cwd: output, env: childEnv, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Windows PowerShell finalization timed out.")); }, 15 * 60_000);
    child.stdout.on("data", (data) => { stdout += data.toString("utf8"); });
    child.stderr.on("data", (data) => { stderr += data.toString("utf8"); });
    child.stdin.on("error", () => {});
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stdout, stderr }); });
    child.stdin.end(input);
  });
}

async function prepareTemplate(packageFile) {
  const archive = await JSZip.loadAsync(await readFile(packageFile));
  const manifest = load(await archive.file("AppxManifest.xml").async("string"), { xmlMode: true });
  const publisher = manifest("Package > Properties > PublisherDisplayName");
  assert.equal(publisher.length, 1);
  publisher.empty();
  const template = manifest.xml();
  assert.match(template, /<PublisherDisplayName\s*\/>/, "Exercise the empty XML element that triggered the PowerShell property-adapter failure");
  await writeFile(path.join(buildRoot, "AppxManifest.template.xml"), template);
  let assets = 0;
  for (const item of Object.values(archive.files)) {
    if (item.dir || !item.name.startsWith("Assets/")) continue;
    assert.equal(path.posix.normalize(item.name), item.name);
    const target = path.resolve(buildRoot, item.name);
    assert.equal(inside(path.join(buildRoot, "Assets"), target), true);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await item.async("nodebuffer"));
    assets++;
  }
  assert.ok(assets > 0);
  return assets;
}

try {
  const before = await readJson(path.join(validation, "package-status.json"));
  assert.equal(before.status, "packaged");
  const identity = storeIdentity(before.identity);
  assert.equal(identity.identityName, "Zebby.StoreQA");
  assert.equal(identity.publisher, "CN=Zebby Store QA");
  assert.equal(identity.publisherDisplayName, "Zebby Store QA");
  assert.deepEqual(before.files.map((file) => file.architecture).sort(), ["arm64", "bundle", "x64"]);
  report.identity = identity;
  report.version = before.version;
  const indices = {};
  for (const arch of ["x64", "arm64"]) {
    const index = await readJson(path.join(buildRoot, "payloads", `${arch}.json`));
    assert.equal(index.architecture, arch);
    assert.equal(index.version, before.version);
    assert.match(index.folder, new RegExp(`^${arch}-[A-Za-z0-9]+$`));
    assert.equal(hash(await readFile(path.join(buildRoot, "payloads", index.folder, "resources", "app.asar"))), index.asarSha256);
    indices[arch] = index;
  }
  const source = before.files.find((file) => file.architecture === "x64");
  assert.equal(path.basename(source.name), source.name);
  report.templateAssets = await prepareTemplate(path.join(packages, "Individual architectures", source.name));
  const finalizer = path.join(output, "Finalize Store package.ps1");
  await copyFile(path.join(repo, "scripts", "finalize-msix.ps1"), finalizer);
  checks.push("Prepared both existing payloads and an extracted manifest with an empty PublisherDisplayName element.");

  const probe = await runPowerShell(["-Command", "$ErrorActionPreference = 'Stop'; Get-Command Get-FileHash -ErrorAction Stop | Out-Null; [Console]::Write($PSVersionTable.PSVersion.ToString())"]);
  await writeFile(path.join(qa, "powershell-version.log"), probe.stdout + probe.stderr);
  assert.equal(probe.code, 0);
  assert.match(probe.stdout.trim(), /^5\.1\./);
  report.powerShellVersion = probe.stdout.trim();
  const args = ["-ExecutionPolicy", "Bypass", "-File", finalizer, "-ArtifactsRoot", output, "-OutputRoot", output];
  assert.equal(args.includes("-IdentityPath"), false);
  const answers = [identity.identityName, identity.publisher, identity.publisherDisplayName].join("\r\n") + "\r\n";
  const result = await runPowerShell(args, answers);
  await writeFile(path.join(qa, "read-host-finalization.log"), result.stdout + result.stderr);
  assert.equal(result.code, 0, `Interactive finalization failed: ${result.stderr.slice(-3000)}`);
  assert.equal(result.signal, null);
  assert.ok(result.stdout.includes("Paste the three values from Zebby's Partner Center Product identity page."), "The finalizer must enter its interactive identity branch");
  checks.push("Windows PowerShell 5.1 read all three identity values through Read-Host and finalized both architectures.");

  const after = await readJson(path.join(validation, "package-status.json"));
  assert.equal(after.status, "packaged");
  assert.equal(after.version, before.version);
  for (const name of ["identityName", "publisher", "packageFamilyName"]) assert.equal(after[name], identity[name]);
  assert.deepEqual(storeIdentity(await readJson(path.join(output, "Store identity.json"))), identity);
  assert.deepEqual(after.files.map((file) => file.architecture).sort(), ["arm64", "bundle", "x64"]);
  const verified = [];
  for (const arch of ["x64", "arm64"]) {
    const record = after.files.find((file) => file.architecture === arch);
    assert.equal(record.name, `Individual architectures/Zebby-${before.version}-${arch}.msix`);
    const bytes = await readFile(path.join(packages, record.name));
    assert.equal(hash(bytes), record.sha256);
    assert.equal(bytes.length, record.size);
    const archive = await JSZip.loadAsync(bytes);
    assert.equal(archive.file("AppxSignature.p7x"), null);
    assert.ok(archive.file("resources.pri"));
    const manifestText = await archive.file("AppxManifest.xml").async("string");
    const manifest = load(manifestText, { xmlMode: true });
    const declaration = manifest("Package > Identity");
    assert.equal(declaration.length, 1);
    for (const [attribute, expected] of Object.entries({ Name: identity.identityName, Publisher: identity.publisher, Version: before.version, ProcessorArchitecture: arch })) assert.equal(declaration.attr(attribute), expected);
    assert.equal(manifest("Package > Properties > PublisherDisplayName").text(), identity.publisherDisplayName);
    const savedManifest = load(await readFile(path.join(validation, `AppxManifest-${arch}.xml`), "utf8"), { xmlMode: true });
    assert.deepEqual(savedManifest("Package > Identity").attr(), declaration.attr());
    assert.equal(savedManifest("Package > Properties > PublisherDisplayName").text(), identity.publisherDisplayName);
    const metadata = JSON.parse(await archive.file("app/resources/store-identity.json").async("string"));
    assert.deepEqual(storeIdentity(metadata), identity);
    assert.equal(metadata.version, before.version);
    assert.equal(metadata.architecture, arch);
    assert.equal(metadata.distributionChannel, "store");
    assert.equal(hash(await archive.file("app/resources/app.asar").async("nodebuffer")), indices[arch].asarSha256);
    assert.deepEqual(await readJson(path.join(buildRoot, "payloads", `${arch}.json`)), indices[arch]);
    verified.push(record);
  }
  checks.push("Both unsigned packages have the exact manifest identity, publisher text, architecture, runtime PFN and unchanged prepared ASAR payload.");
  const bundleRecord = after.files.find((file) => file.architecture === "bundle");
  assert.equal(bundleRecord.name, `Zebby-${before.version}.msixbundle`);
  const bundleBytes = await readFile(path.join(packages, bundleRecord.name));
  assert.equal(hash(bundleBytes), bundleRecord.sha256);
  assert.equal(bundleBytes.length, bundleRecord.size);
  const bundle = await JSZip.loadAsync(bundleBytes);
  assert.equal(bundle.file("AppxSignature.p7x"), null);
  const bundledPackages = Object.keys(bundle.files).filter((name) => /\.msix$/.test(name)).sort();
  assert.deepEqual(bundledPackages, verified.map((record) => path.posix.basename(record.name)).sort());
  for (const record of verified) assert.equal(hash(await bundle.file(path.posix.basename(record.name)).async("nodebuffer")), record.sha256);
  const checksums = (await readFile(path.join(packages, "SHA256SUMS.txt"), "utf8")).replace(/^\uFEFF/, "").trim().split(/\r?\n/).sort();
  assert.deepEqual(checksums, after.files.map((record) => `${record.sha256}  ${record.name}`).sort());
  report.files = after.files;
  checks.push("The bundle contains exactly the verified x64 and ARM64 packages; package status and SHA256SUMS match every output.");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(qa, "report.json"), JSON.stringify(report, null, 2));
}
console.log(`Interactive finalizer: ${report.status}; ${checks.length} checks. Report: ${path.join(qa, "report.json")}`);

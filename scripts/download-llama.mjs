import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const execute = promisify(execFile);
const release = "b11146";
const assets = {
  "win-x64": { filename: `llama-${release}-bin-win-cpu-x64.zip`, sha256: "14cf1303ca9ac3abd94816850532f9f9a69ac66fbaca3776fc6f9061c2fac1d1" },
  "win-arm64": { filename: `llama-${release}-bin-win-cpu-arm64.zip`, sha256: "1727d241f3bf6d27360e984e851cf013928fd655bf89f8628e70da027f377b7d" },
  "mac-arm64": { filename: `llama-${release}-bin-macos-arm64.tar.gz`, sha256: "1ad3f9eff80edb9dbef4259ad564d1720612ef7eea48fa4afed0e54f5f3d5711" },
};

async function filesIn(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(filename));
    else files.push(filename);
  }
  return files;
}

function inside(root, target) {
  const relative = path.relative(root, path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unsafe runtime build path.");
}

export async function prepareRuntime(platform, arch) {
  const key = `${platform === "darwin" ? "mac" : platform === "win32" ? "win" : platform}-${arch}`;
  const asset = assets[key];
  if (!asset) throw new Error(`Built-in analysis has no packaged runtime for ${key}.`);
  const root = path.resolve("build/llama");
  const destination = path.join(root, key);
  await mkdir(root, { recursive: true });
  const manifest = await readFile(path.join(destination, "runtime.json"), "utf8").then(JSON.parse).catch(() => null);
  if (manifest?.release === release && manifest.archiveSha256 === asset.sha256 &&
    await lstat(path.join(destination, manifest.executable)).catch(() => null)) return;
  console.log(`Preparing CPU analysis engine for ${key} (${release}).`);
  const response = await fetch(`https://github.com/ggml-org/llama.cpp/releases/download/${release}/${asset.filename}`,
    { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Runtime download failed: ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("Runtime integrity check failed.");
  const staging = await mkdtemp(path.join(root, ".prepare-"));
  try {
    const unpacked = path.join(staging, "unpacked");
    const ready = path.join(staging, "ready");
    await mkdir(unpacked); await mkdir(ready);
    if (asset.filename.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(bytes);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const target = path.resolve(unpacked, entry.name);
        inside(unpacked, target);
        if (!/llama-server\.exe$|\.dll$|(?:LICENSE|NOTICE)(?:[^/]*)$/i.test(entry.name)) continue;
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, await entry.async("nodebuffer"));
      }
    } else {
      const archive = path.join(staging, asset.filename);
      await writeFile(archive, bytes);
      const listing = await execute("tar", ["-tzf", archive]);
      for (const entry of listing.stdout.split(/\r?\n/).filter(Boolean)) inside(unpacked, path.resolve(unpacked, entry));
      await execute("tar", ["-xzf", archive, "-C", unpacked]);
    }
    const files = await filesIn(unpacked);
    const executable = files.find((filename) => path.basename(filename) === (key.startsWith("win") ? "llama-server.exe" : "llama-server"));
    if (!executable) throw new Error("The runtime archive is missing llama-server.");
    // Preserve the archive's bin/lib relationship for macOS dynamic-library lookup.
    const archiveRoot = path.basename(path.dirname(executable)) === "bin" ? path.dirname(path.dirname(executable)) : path.dirname(executable);
    for (const filename of files) {
      if (!filename.startsWith(archiveRoot + path.sep)) continue;
      if (filename !== executable && !/\.(?:dll|dylib|so|metal)$|(?:LICENSE|NOTICE)(?:[^/\\]*)$/i.test(filename)) continue;
      const target = path.join(ready, path.relative(archiveRoot, filename));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(filename, target, { dereference: false, verbatimSymlinks: true });
    }
    const relativeExecutable = path.relative(archiveRoot, executable);
    if (!key.startsWith("win")) await chmod(path.join(ready, relativeExecutable), 0o755);
    const licenseResponse = await fetch(`https://raw.githubusercontent.com/ggml-org/llama.cpp/${release}/LICENSE`, { signal: AbortSignal.timeout(30_000) });
    if (!licenseResponse.ok) throw new Error("Could not include the runtime license.");
    await writeFile(path.join(ready, "LICENSE-llama.cpp.txt"), await licenseResponse.text());
    await copyFile("build/local-model-notices.txt", path.join(ready, "MODEL-NOTICES.txt"));
    await copyFile("build/LICENSE-Apache-2.0.txt", path.join(ready, "LICENSE-Apache-2.0.txt"));
    await writeFile(path.join(ready, "runtime.json"), JSON.stringify({ release, archiveSha256: asset.sha256,
      executable: relativeExecutable }, null, 2));
    inside(root, destination);
    await rm(destination, { recursive: true, force: true });
    await cp(ready, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
  } finally { inside(root, staging); await rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareRuntime(process.argv[2] || process.platform, process.argv[3] || process.arch);
}

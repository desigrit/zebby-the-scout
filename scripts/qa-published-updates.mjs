import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.env.GITHUB_ACTIONS, "true", "Run published update checks on GitHub only.");
assert.equal(process.platform, "darwin", "Mac installer staging requires a Mac runner.");
const { ReleaseUpdates } = await import("../previous-source/desktop/release-updates.ts");
const { SelfUpdater } = await import("../previous-source/desktop/self-update.ts");
const tagVersion = /^v\d+\.\d+\.\d+$/.test(process.env.GITHUB_REF_NAME || "") ? process.env.GITHUB_REF_NAME.slice(1) : "";
const expectedVersion = process.env.EXPECTED_RELEASE_VERSION || tagVersion ||
  JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
assert.match(expectedVersion, /^\d+\.\d+\.\d+$/);
const endpoint = "https://api.github.com/repos/desigrit/zebby-the-scout/releases/latest";
const report = { previousVersion: "2.6.4", expectedVersion, passed: false, metadata: [], downloads: [], errors: [] };

async function releaseFetch(input, options) {
  assert.equal(input, endpoint, "The workflow token must stay on the public release metadata endpoint.");
  let response = await fetch(input, { ...options, redirect: "error" });
  const observation = { anonymousStatus: response.status, remaining: response.headers.get("x-ratelimit-remaining"), authenticated: false };
  // Hosted runners share anonymous API quotas. Authenticate only this test's
  // metadata request after an explicit rate-limit response. Installer downloads
  // and the old updater's release parsing and checksum checks remain unchanged.
  if ((response.status === 403 && observation.remaining === "0" || response.status === 429) && process.env.GH_TOKEN) {
    await response.body?.cancel();
    response = await fetch(input, { ...options, redirect: "error", headers: { ...options.headers, Authorization: `Bearer ${process.env.GH_TOKEN}` } });
    observation.authenticated = true;
    observation.authenticatedStatus = response.status;
  }
  const body = await response.clone().json().catch(() => null);
  observation.tag = body?.tag_name || null;
  observation.assets = Array.isArray(body?.assets) ? body.assets.map(asset => ({ name: asset.name, state: asset.state, hasDigest: Boolean(asset.digest) })) : [];
  report.metadata.push(observation);
  console.log("Release metadata", JSON.stringify(observation));
  return response;
}

try {
  for (const [platform, arch] of [["win32", "x64"], ["win32", "arm64"], ["darwin", "arm64"]]) {
    const checker = new ReleaseUpdates({ version: "2.6.4", platform, arch, fetch: releaseFetch, onError(error) {
      const diagnostic = { message: error instanceof Error ? error.message : String(error), cause: error?.cause?.code || null };
      report.errors.push(diagnostic); console.error("Update discovery", JSON.stringify(diagnostic));
    } });
    let release;
    for (let attempt = 0; attempt < 8; attempt++) {
      release = (await checker.check(true)).available;
      if (release?.version === expectedVersion) break;
      await delay(10000);
    }
    assert.equal(release?.version, expectedVersion, "The existing updater must discover the published version.");
    const folder = await mkdtemp(path.join(os.tmpdir(), "zebby-update-"));
    let phase;
    const executable = path.join(process.env.RUNNER_TEMP, "previous/Zebby.app/Contents/MacOS/Zebby");
    const updater = new SelfUpdater({ platform, arch, folder, executable, onChange: state => { phase = state.phase; } });
    await updater.download(release);
    assert.equal(phase, "ready");
    report.downloads.push({ platform, arch, version: release.version, size: release.size, sha256: release.sha256, verified: true });
    console.log(platform, arch, release.version, "download verified");
  }
  report.passed = true;
} finally {
  await mkdir("qa-output/public-updates", { recursive: true });
  await writeFile("qa-output/public-updates/verification.json", JSON.stringify(report, null, 2));
}

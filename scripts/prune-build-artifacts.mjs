import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const diagnostics = new Set(["desktop-visual-review", "local-engine-qa-windows", "local-engine-qa-macos", "mac-distribution-qa",
  "credits-renderer-qa-windows", "credits-renderer-qa-macos"]);

function artifactGroup(name) {
  const installer = /^(?:zebby|pm-application-tracker)-(windows-x64|windows-arm64|macos-arm64)$/.exec(name);
  return installer ? `installer:${installer[1]}` : diagnostics.has(name) ? name : null;
}

export function planArtifactCleanup(artifacts, runs) {
  const runStates = new Map(runs.map((run) => [run.id, run.status]));
  const newest = new Map();
  const ordered = artifacts.filter((artifact) => !artifact.expired).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  for (const artifact of ordered) {
    const group = artifactGroup(artifact.name);
    if (group && !newest.has(group)) newest.set(group, artifact.id);
  }
  const remove = ordered.filter((artifact) => {
    const group = artifactGroup(artifact.name);
    return group && newest.get(group) !== artifact.id && runStates.get(artifact.workflow_run?.id) === "completed";
  });
  const removeIds = new Set(remove.map((artifact) => artifact.id));
  return { remove, keep: ordered.filter((artifact) => !removeIds.has(artifact.id)) };
}

function github(args) {
  const result = spawnSync("gh", ["api", ...args], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || "GitHub API request failed.");
  return result.stdout;
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY || "desigrit/zebby-the-scout";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid repository name.");
  const prefix = `repos/${repository}/actions`;
  const artifactPages = JSON.parse(github(["--paginate", "--slurp", `${prefix}/artifacts?per_page=100`]));
  const runPages = JSON.parse(github(["--paginate", "--slurp", `${prefix}/runs?per_page=100`]));
  const artifacts = artifactPages.flatMap((page) => page.artifacts);
  const runs = runPages.flatMap((page) => page.workflow_runs);
  const plan = planArtifactCleanup(artifacts, runs);
  const report = { repository, applied: process.argv.includes("--apply"), beforeCount: artifacts.filter((artifact) => !artifact.expired).length, deleteCount: plan.remove.length, removeBytes: plan.remove.reduce((total, artifact) => total + artifact.size_in_bytes, 0), kept: plan.keep.map(({ id, name, size_in_bytes }) => ({ id, name, size_in_bytes })), deleted: [] };
  const reportIndex = process.argv.indexOf("--report");
  const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : null;
  if (reportIndex >= 0 && !reportPath) throw new Error("A report path is required.");
  const saveReport = () => { if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`); };
  saveReport();
  console.log(`${report.applied ? "Deleting" : "Would delete"} ${report.deleteCount} older artifacts from ${repository}; keeping ${plan.keep.length}.`);
  if (report.applied) {
    for (const artifact of plan.remove) {
      if (!Number.isSafeInteger(artifact.id) || artifact.id <= 0 || artifact.url !== `https://api.github.com/${prefix}/artifacts/${artifact.id}`) throw new Error("Artifact does not match the selected repository.");
      github(["--method", "DELETE", `${prefix}/artifacts/${artifact.id}`]);
      report.deleted.push({ id: artifact.id, name: artifact.name, size_in_bytes: artifact.size_in_bytes });
      saveReport();
      if (report.deleted.length % 10 === 0) console.log(`Deleted ${report.deleted.length}/${report.deleteCount}.`);
    }
  }
  console.log(JSON.stringify({ deleted: report.deleted.length, reclaimedGiB: report.deleted.reduce((total, artifact) => total + artifact.size_in_bytes, 0) / (1024 ** 3), kept: report.kept }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, mkdtempSync, openSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { github, listPages, validatedRepository, validateArtifact } from './prune-actions-storage.mjs';

export function selectStoreArchive(artifacts, releases) {
  const published = new Map(releases.filter(r => !r.draft).map(r => [r.tag_name, r]));
  return artifacts.filter(a => !a.expired && a.name === 'store-submission-bundle' && /^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(a.workflow_run?.head_branch || '') && published.has(a.workflow_run.head_branch))
    .toSorted((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    .map(artifact => ({ artifact, release: published.get(artifact.workflow_run.head_branch) }))[0] || null;
}

function command(args, options = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', windowsHide: true, timeout: 1_200_000, ...options });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || 'Store archive failed');
  return result.stdout;
}

export async function main() {
  const repository = validatedRepository(process.env.GITHUB_REPOSITORY);
  const prefix = `repos/${repository}`;
  const pair = selectStoreArchive(listPages(`${prefix}/actions/artifacts`, 'artifacts'), listPages(`${prefix}/releases`, null));
  if (!pair) { console.log('No released Store bundle needs archiving.'); return; }
  const { artifact, release } = pair;
  validateArtifact(repository, artifact);
  const run = github([`${prefix}/actions/runs/${artifact.workflow_run.id}`]);
  if (run.status !== 'completed' || run.conclusion !== 'success') { console.log('Store build is not complete and successful.'); return; }
  if (!['push', 'workflow_dispatch'].includes(run.event) || run.head_repository?.full_name !== repository) throw new Error('Store package did not come from a trusted release build');
  let tag = github([`${prefix}/git/ref/tags/${release.tag_name}`]).object;
  for (let depth = 0; tag.type === 'tag' && depth < 5; depth++) tag = github([`${prefix}/git/tags/${tag.sha}`]).object;
  if (tag.type !== 'commit' || tag.sha !== artifact.workflow_run.head_sha) throw new Error('Store package does not match the release tag');
  const name = `Zebby-${release.tag_name.slice(1)}-Microsoft-Store.zip`;
  const existing = release.assets.find(a => a.name === name);
  if (existing) {
    if (existing.state !== 'uploaded' || existing.size <= 0 || !existing.digest || (artifact.digest && existing.digest !== artifact.digest)) throw new Error('Existing Store archive failed verification');
    console.log(`Store package already archived: ${existing.browser_download_url}`); return;
  }
  if (!process.argv.includes('--apply')) { console.log(`Would archive ${name} on ${release.tag_name}.`); return; }
  const directory = mkdtempSync(join(tmpdir(), 'store-archive-'));
  try {
    const file = join(directory, name);
    const fd = openSync(file, 'wx');
    try { command(['api', `${prefix}/actions/artifacts/${artifact.id}/zip`], { stdio: ['ignore', fd, 'pipe'] }); }
    finally { closeSync(fd); }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    const digest = `sha256:${hash.digest('hex')}`;
    if (artifact.digest && artifact.digest !== digest) throw new Error('Downloaded Store archive checksum mismatch');
    command(['release', 'upload', release.tag_name, file, '--repo', repository]);
    const saved = github([`${prefix}/releases/${release.id}`]).assets.find(a => a.name === name);
    if (saved?.state !== 'uploaded' || saved.size !== statSync(file).size || saved.digest !== digest) throw new Error('Uploaded Store archive failed verification');
    console.log(`Store package archived and verified: ${saved.browser_download_url}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

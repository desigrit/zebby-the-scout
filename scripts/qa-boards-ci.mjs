import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import electron from 'electron';

// Run every native Boards regression in one hosted Windows job. Shared setup,
// the Figma sample, and thorough navigation are each performed only once.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function run(executable, args) {
  console.log('Running ' + args.join(' '));
  const result = spawnSync(executable, args, { env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Check failed: ' + args.join(' ') + ' (exit ' + result.status + ')');
}

async function native(script, output, args = []) {
  await build({ entryPoints: [script], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['electron'] });
  run(electron, [output, ...args]);
}

await native('scripts/qa-board-layers.mjs', 'qa-output/board-layers/runner.mjs');
await native('scripts/qa-board-thorough.mjs', 'qa-output/board-layers/thorough.mjs');
await native('scripts/qa-board-evidence.mjs', 'qa-output/board-evidence/runner.mjs', process.env.LIVE_ZOOM === 'true' ? ['--live'] : []);
await native('scripts/qa-board-unavailable.mjs', 'qa-output/slack-board/unavailable.mjs');
await native('scripts/qa-slack-board.mjs', 'qa-output/slack-board/runner.mjs');
await native('scripts/qa-twitch-board.mjs', 'qa-output/twitch-reader/runner.mjs');
run(process.execPath, ['scripts/qa-board-reader.mjs',
  'https://www.figma.com/careers/#job-openings',
  'https://explore.jobs.netflix.net/careers?Teams=Product%20Management&Region=ucan&domain=netflix.com&sort_by=relevance']);
run(process.execPath, ['scripts/qa-boards-recovery.mjs']);
if (process.env.CHECK_ZOOX === 'true') await native('scripts/qa-zoox-board.mjs', 'qa-output/board-layers/zoox.mjs');
if (process.env.CHECK_LYFT === 'true') await native('scripts/qa-lyft-board.mjs', 'qa-output/board-layers/lyft.mjs');

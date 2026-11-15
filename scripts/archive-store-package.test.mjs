import test from 'node:test';
import assert from 'node:assert/strict';
import { selectStoreArchives } from './archive-store-package.mjs';
const artifact = (id, branch, extra = {}) => ({ id, name: 'store-submission-bundle', created_at: new Date(2026, 0, id).toISOString(), workflow_run: { head_branch: branch }, ...extra });
test('archives only a Store package associated with an existing published release', () => {
  const releases = [{ tag_name: 'v2.10.1', draft: false }, { tag_name: 'v2.10.2', draft: true }];
  const selected = selectStoreArchives([artifact(1, 'v2.10.1'), artifact(2, 'feature'), artifact(3, 'v2.10.2'), artifact(4, 'v2.10.1', { expired: true })], releases);
  assert.deepEqual(selected.map(pair => pair.artifact.id), [1]);
});
test('does not archive or publish unreleased output', () => {
  assert.deepEqual(selectStoreArchives([artifact(1, 'v2.10.1')], []), []);
});

test('daily maintenance preserves every published release since the previous run', () => {
  const releases = [{ tag_name: 'v2.10.1', draft: false }, { tag_name: 'v2.10.2', draft: false }];
  const selected = selectStoreArchives([artifact(1, 'v2.10.1'), artifact(2, 'v2.10.2')], releases);
  assert.deepEqual(selected.map(pair => pair.release.tag_name), ['v2.10.2', 'v2.10.1']);
  assert.deepEqual(selected.map(pair => pair.artifact.id), [2, 1]);
});

test('repeated builds select one latest unexpired bundle per release', () => {
  const releases = [{ tag_name: 'v2.10.1', draft: false }, { tag_name: 'v2.10.2', draft: false }];
  const selected = selectStoreArchives([artifact(1, 'v2.10.1'), artifact(2, 'v2.10.1'), artifact(3, 'v2.10.2'), artifact(4, 'v2.10.1', { expired: true })], releases);
  assert.deepEqual(selected.map(pair => pair.artifact.id), [3, 2]);
});

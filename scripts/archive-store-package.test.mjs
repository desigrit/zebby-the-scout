import test from 'node:test';
import assert from 'node:assert/strict';
import { selectStoreArchive } from './archive-store-package.mjs';
const artifact = (id, branch, extra = {}) => ({ id, name: 'store-submission-bundle', created_at: new Date(2026, 0, id).toISOString(), workflow_run: { head_branch: branch }, ...extra });
test('archives only a Store package associated with an existing published release', () => {
  const releases = [{ tag_name: 'v2.10.1', draft: false }, { tag_name: 'v2.10.2', draft: true }];
  const selected = selectStoreArchive([artifact(1, 'v2.10.1'), artifact(2, 'feature'), artifact(3, 'v2.10.2'), artifact(4, 'v2.10.1', { expired: true })], releases);
  assert.equal(selected.artifact.id, 1);
});
test('does not archive or publish unreleased output', () => {
  assert.equal(selectStoreArchive([artifact(1, 'v2.10.1')], []), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { planArtifactCleanup } from "../scripts/prune-build-artifacts.mjs";

function artifact(id, name, runId, createdAt = "2026-10-01T00:00:00Z", expired = false) {
  return { id, name, workflow_run: { id: runId }, created_at: createdAt, expired };
}

test("old product names share one retained installer per platform with Zebby", () => {
  const old = [artifact(1, "pm-application-tracker-windows-x64", 10), artifact(2, "pm-application-tracker-windows-arm64", 10), artifact(3, "pm-application-tracker-macos-arm64", 10)];
  const latest = [artifact(4, "zebby-windows-x64", 20, "2026-10-03T00:00:00Z"), artifact(5, "zebby-windows-arm64", 20, "2026-10-03T00:00:00Z"), artifact(6, "zebby-macos-arm64", 20, "2026-10-03T00:00:00Z")];
  const plan = planArtifactCleanup([...old, ...latest], [{ id: 10, status: "completed" }, { id: 20, status: "completed" }]);
  assert.deepEqual(plan.remove.map((entry) => entry.id).sort(), [1, 2, 3]);
  assert.deepEqual(plan.keep.map((entry) => entry.id).sort(), [4, 5, 6]);
});

test("active, queued, waiting and unknown runs are preserved even with newer artifacts", () => {
  const protectedArtifacts = [artifact(1, "zebby-windows-x64", 10), artifact(2, "zebby-windows-x64", 20), artifact(3, "zebby-windows-x64", 30), artifact(4, "zebby-windows-x64", 40)];
  const newest = artifact(5, "zebby-windows-x64", 50, "2026-10-03T00:00:00Z");
  const plan = planArtifactCleanup([...protectedArtifacts, newest], [{ id: 10, status: "in_progress" }, { id: 20, status: "queued" }, { id: 30, status: "waiting" }, { id: 50, status: "completed" }]);
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.keep.length, 5);
});

test("cleanup skips unrelated names, malformed run references and expired artifacts", () => {
  const artifacts = [artifact(1, "zebby-windows-x64", 10), artifact(2, "zebby-windows-x64", 20, "2026-10-03T00:00:00Z", true), artifact(3, "unrelated-backup", 10), { id: 4, name: "zebby-windows-x64", created_at: "2026-09-30T00:00:00Z", expired: false }];
  const plan = planArtifactCleanup(artifacts, [{ id: 10, status: "completed" }]);
  assert.equal(plan.remove.length, 0);
  assert.deepEqual(plan.keep.map((entry) => entry.id).sort(), [1, 3, 4]);
});

test("only the latest diagnostic artifact remains, without changing the source snapshot", () => {
  const artifacts = [artifact(1, "mac-distribution-qa", 10), artifact(2, "mac-distribution-qa", 20, "2026-10-03T00:00:00Z")];
  const snapshot = JSON.stringify(artifacts);
  const plan = planArtifactCleanup(artifacts, [{ id: 10, status: "completed" }, { id: 20, status: "completed" }]);
  assert.deepEqual(plan.remove.map((entry) => entry.id), [1]);
  assert.deepEqual(plan.keep.map((entry) => entry.id), [2]);
  assert.equal(JSON.stringify(artifacts), snapshot);
});

test("older credits screenshots are pruned separately for Windows and Mac", () => {
  const artifacts = [artifact(1, "credits-renderer-qa-windows", 10), artifact(2, "credits-renderer-qa-macos", 10),
    artifact(3, "credits-renderer-qa-windows", 20, "2026-10-10T00:00:00Z"), artifact(4, "credits-renderer-qa-macos", 20, "2026-10-10T00:00:00Z")];
  const plan = planArtifactCleanup(artifacts, [{ id: 10, status: "completed" }, { id: 20, status: "completed" }]);
  assert.deepEqual(plan.remove.map(({ id }) => id).sort(), [1, 2]); assert.deepEqual(plan.keep.map(({ id }) => id).sort(), [3, 4]);
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const root = await mkdtemp(path.join(tmpdir(), "zebby-private-workspaces-")), bundle = path.join(root, "stores.mjs");
await build({ stdin: { contents: "export * from './desktop/store'; export * from './desktop/boards-store'; export * from './lib/board-identity';", resolveDir: process.cwd() }, outfile: bundle, bundle: true, platform: "node", format: "esm", target: "node22" });
const { DesktopStore, BoardsStore, boardJobIdentity } = await import(pathToFileURL(bundle).href);
after(async () => { assert.ok(root.startsWith(path.resolve(tmpdir()) + path.sep)); await rm(root, { recursive: true, force: true }); });
const receipt = letter => ({ id: letter.repeat(64), digest: letter.repeat(64) });
const planInput = { listingUrl: "https://example.org/jobs/product", company: "Example", title: "Product Manager", team: "", locations: "Remote", description: "Own a product roadmap and lead customer research.", keywords: [], themes: [], overview: "", currentOverview: "Product leader." };

test("Plan, Match and tailored resume receipts survive reopen and do not duplicate artifacts", async () => {
  const folder = await mkdtemp(path.join(root, "applications-")), file = path.join(folder, "Applications.sqlite");
  let store = new DesktopStore(path.join(folder, "profile"));
  try {
    await store.create(file);
    const application = await store.saveApplication({ company: "Example", title: "Product Manager", jobDescription: "Own a product roadmap." });
    const plan = await store.savePlan(planInput);
    const saveMatch = () => store.saveMatchAnalysis(application.id, application.updatedAt, 82, "Relevant product experience.", application.jobDescription, receipt("a"));
    const savePlan = () => store.savePlanAnalysis(plan.id, plan.updatedAt, ["Product strategy"], ["Lead discovery"], "Product leader with discovery experience.", "Emphasizes existing discovery work.", 82, [95], [90], "Relevant product experience.", receipt("b"));
    await saveMatch(); const analyzed = await savePlan();
    const saveResume = () => store.saveTailoredResume(plan.id, analyzed.updatedAt, "Product resume", "source-hash", new Uint8Array([1]), new Uint8Array([2]), "Reference layout preserved.", receipt("c"));
    const tailored = await saveResume(), resumes = store.listResumes(); assert.equal(resumes.length, 2);
    store.close(); store = new DesktopStore(path.join(folder, "profile")); await store.open(file);
    await saveMatch(); await savePlan(); await saveResume();
    assert.deepEqual(store.listResumes(), resumes);
    assert.equal(store.getPlan(plan.id).updatedAt, tailored.updatedAt);
    assert.equal(store.getPlan(plan.id).tailoredResume.layoutNote, "Reference layout preserved.");
    assert.equal(store.listApplications()[0].matchStrength, 82);
    store.close();
    const db = new DatabaseSync(file, { readOnly: true });
    try { assert.equal(db.prepare("PRAGMA user_version").get().user_version, 10); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analysis_receipts").get().n, 3); }
    finally { db.close(); }
  } finally { store.close(); }
});

test("a stale record cannot acquire a receipt or overwrite a later result", async () => {
  const folder = await mkdtemp(path.join(root, "stale-")), file = path.join(folder, "Applications.sqlite"), store = new DesktopStore(path.join(folder, "profile"));
  try {
    await store.create(file); const item = await store.saveApplication({ company: "Example", matchStrength: 70 });
    await assert.rejects(store.saveMatchAnalysis(item.id, "stale-revision", 90, "New result", "Job", receipt("d")), /changed while/);
    assert.equal(store.listApplications()[0].matchStrength, 70);
    store.close(); const db = new DatabaseSync(file, { readOnly: true });
    try { assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='analysis_receipts'").get(), undefined); }
    finally { db.close(); }
  } finally { store.close(); }
});

test("Boards receipts preserve baseline, later discovery and interrupted history across reopening", async () => {
  const folder = await mkdtemp(path.join(root, "boards-")), file = path.join(folder, "Applications-boards.sqlite"), profile = path.join(folder, "profile");
  let store = new BoardsStore(profile);
  const scan = (ids, letter) => ({ jobs: ids.map(id => ({ ...boardJobIdentity(`https://jobs.uber.com/en/jobs/${id}/`), matches: true })), pages: 1, provider: "chatgpt", model: "account-model", receipt: receipt(letter) });
  try {
    await store.create(file); const [id] = await store.add([{ company: "Example", url: "https://jobs.uber.com/en/jobs/?team=Product" }]);
    await store.complete(id, 1, store.generation, scan([1, 2], "a")); assert.equal(store.get(id).newCount, 0);
    await store.complete(id, 1, store.generation, scan([1, 2, 3], "b")); const before = store.get(id);
    assert.equal(before.newCount, 1);
    await store.failed(id, 1, store.generation, "ChatGPT usage limit reached.");
    assert.equal(store.get(id).lastCheckId, before.lastCheckId); assert.equal(store.get(id).totalCount, 3);
    await store.close(); store = new BoardsStore(profile); await store.open(file);
    await store.complete(id, 1, store.generation, scan([1, 2, 3], "b"));
    assert.equal(store.get(id).lastCheckId, before.lastCheckId); assert.equal(store.get(id).newCount, 1);
    await store.complete(id, 1, store.generation, scan([1, 2, 3, 4], "c")); assert.equal(store.get(id).newCount, 2);
  } finally { await store.close(); }
});

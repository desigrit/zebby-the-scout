import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFile, copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("desktop SQLite file stores applications, resumes, and plans across reopen", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-desktop-test-"));
  const bundle = path.join(root, "store.mjs");
  const file = path.join(root, "cloud", "applications.sqlite");
  const userData = path.join(root, "computer-a");
  let store;
  try {
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(userData);
    await store.create(file);
    const resume = await store.addResume("PM Resume.pdf", "application/pdf", new Uint8Array([37, 80, 68, 70]));
    const application = await store.saveApplication({ company: "Example Co", title: "Product Manager",
      team: "Growth", locations: "Remote", listingUrl: "https://example.org/jobs/1",
      appliedDate: "2026-09-29", matchStrength: 82, resumeId: resume.id, status: "Applied" });
    const plan = await store.savePlan({ listingUrl: "https://example.org/jobs/2",
      company: "Example Co", title: "Senior PM", team: "", locations: "",
      description: "A detailed job description", keywords: ["strategy", "discovery"],
      themes: ["Lead product strategy"], overview: "Ideal candidate overview." });
    assert.equal(store.listApplications()[0].id, application.id);
    assert.equal(store.listPlans()[0].id, plan.id);
    assert.deepEqual([...store.getResume(resume.id).data], [37, 80, 68, 70]);
    assert.equal(store.status.dirty, false);
    assert.ok((await readdir(store.backupsPath)).some((name) => name.endsWith(".sqlite")));
    store.close();

    store = new DesktopStore(path.join(root, "computer-b"));
    await store.open(file);
    assert.equal(store.listApplications()[0].resumeName, "PM Resume.pdf");
    assert.equal(store.listPlans()[0].keywords[0], "strategy");
    assert.deepEqual([...store.getResume(resume.id).data], [37, 80, 68, 70]);

    const previous = path.join(root, "previous.sqlite");
    await copyFile(file, previous);
    await appendFile(file, Buffer.from("external change"));
    await assert.rejects(store.savePlan({ ...plan, title: "Edited" }, plan.id), /changed outside/);
    assert.equal(store.listPlans()[0].title, "Senior PM");
    await copyFile(previous, file);
    await store.open(file);
    assert.equal((await readFile(file)).subarray(0, 15).toString(), "SQLite format 3");
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

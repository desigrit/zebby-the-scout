import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFile, copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
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
      jobDescription: "Editable summary", snapshotText: "Original job posting from the page.", snapshotSource: "page",
      appliedDate: "2026-09-29", matchStrength: 82, resumeId: resume.id, status: "Applied" });
    const plan = await store.savePlan({ listingUrl: "https://example.org/jobs/2",
      company: "Example Co", title: "Senior PM", team: "", locations: "",
      description: "A detailed job description", snapshotText: "Original plan posting from the page.",
      snapshotSource: "page", currentOverview: "I turn customer insights into product direction.",
      resumeId: resume.id, keywords: ["strategy", "discovery"],
      themes: ["Lead product strategy"], overview: "Ideal candidate overview." });
    assert.equal(store.listApplications()[0].id, application.id);
    assert.equal(application.notes, "Original job posting from the page.");
    const withNotes = await store.saveApplicationNotes(application.id, "Pre-screen: discuss roadmap tradeoffs.\nContact: Hiring manager");
    assert.match(withNotes.notes, /roadmap tradeoffs/);
    assert.equal(store.listPlans()[0].id, plan.id);
    assert.equal(store.listPlans()[0].resumeId, resume.id);
    assert.equal(store.listPlans()[0].currentOverview, "I turn customer insights into product direction.");
    const analyzedPlan = await store.savePlanAnalysis(plan.id, plan.updatedAt,
      ["Customer research", "Product strategy"], ["Lead customer discovery"],
      "I use customer research to guide product strategy.",
      "I brought customer research forward because the role emphasizes discovery.", 84);
    assert.equal(analyzedPlan.matchStrength, 84);
    assert.match(analyzedPlan.overviewRationale, /customer research forward/);
    const preservedPlan = await store.savePlan({ ...analyzedPlan, overview: "Edited overview." }, plan.id);
    assert.equal(preservedPlan.matchStrength, 84);
    assert.equal(preservedPlan.overviewRationale, "");
    assert.deepEqual([...store.getResume(resume.id).data], [37, 80, 68, 70]);
    const draft = await store.saveApplication({ company: "", title: "", team: "", locations: "",
      listingUrl: "", jobDescription: "", appliedDate: "", matchStrength: null,
      resumeId: "", status: "Applied" });
    assert.equal(draft.matchStrength, null);
    assert.equal(draft.resumeId, "");
    assert.equal(store.listApplications().length, 2);
    await store.saveMatchAnalysis(application.id, withNotes.updatedAt, 76,
      "Relevant product experience, with one gap in analytics tools.", "A detailed job description");
    assert.equal(store.listApplications().find((item) => item.id === application.id).matchStrength, 76);
    const edited = await store.saveApplication({ ...withNotes, jobDescription: "A different job description",
      matchStrength: 76 }, application.id);
    assert.equal(edited.matchStrength, null);
    assert.equal(edited.matchNotes, "");
    assert.equal(edited.snapshotText, "Original job posting from the page.");
    assert.equal(edited.snapshotSource, "page");
    const editedPlan = await store.savePlan({ ...preservedPlan, description: "A tailored analysis description" }, plan.id);
    assert.equal(editedPlan.snapshotText, "Original plan posting from the page.");
    assert.equal(editedPlan.description, "A tailored analysis description");
    assert.equal(editedPlan.matchStrength, null);
    assert.equal(store.status.dirty, false);
    assert.ok((await readdir(store.backupsPath)).some((name) => name.endsWith(".sqlite")));
    store.close();

    store = new DesktopStore(path.join(root, "computer-b"));
    await store.open(file);
    assert.equal(store.listApplications()[0].resumeName, "PM Resume.pdf");
    assert.equal(store.listApplications().length, 2);
    assert.equal(store.listPlans()[0].keywords[0], "Customer research");
    assert.equal(store.listPlans()[0].resumeId, resume.id);
    assert.equal(store.listPlans()[0].snapshotText, "Original plan posting from the page.");
    assert.equal(store.listApplications().find((item) => item.id === application.id).snapshotText,
      "Original job posting from the page.");
    assert.match(store.listApplications().find((item) => item.id === application.id).notes, /Hiring manager/);
    assert.deepEqual([...store.getResume(resume.id).data], [37, 80, 68, 70]);

    const previous = path.join(root, "previous.sqlite");
    await copyFile(file, previous);
    await appendFile(file, Buffer.from("external change"));
    await assert.rejects(store.savePlan({ ...plan, title: "Edited" }, plan.id), /changed outside/);
    assert.equal(store.listPlans()[0].title, "Senior PM");
    await copyFile(previous, file);
    await store.open(file);
    assert.equal((await readFile(file)).subarray(0, 15).toString(), "SQLite format 3");
    const copy = path.join(root, "cloud", "second.sqlite");
    await store.copyCurrentTo(copy);
    assert.equal(store.listApplications().length, 2);
    assert.equal(store.listPlans()[0].title, "Senior PM");
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("version 2 desktop databases migrate without losing applications or resumes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-migration-test-"));
  const bundle = path.join(root, "store.mjs");
  const file = path.join(root, "legacy.sqlite");
  let store;
  try {
    const db = new DatabaseSync(file);
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE resumes (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL,
        size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE applications (id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL,
        team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '', listing_url TEXT NOT NULL,
        applied_date TEXT NOT NULL, match_strength INTEGER NOT NULL CHECK (match_strength BETWEEN 0 AND 100),
        resume_id TEXT NOT NULL REFERENCES resumes(id), status TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE plans (id TEXT PRIMARY KEY, listing_url TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '', keywords_json TEXT NOT NULL DEFAULT '[]',
        themes_json TEXT NOT NULL DEFAULT '[]', overview TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX applications_date_idx ON applications(applied_date DESC, created_at DESC);
      CREATE INDEX plans_updated_idx ON plans(updated_at DESC);
      PRAGMA user_version = 2;
    `);
    db.prepare("INSERT INTO resumes VALUES (?, ?, ?, ?, ?, ?)").run("resume-1", "Old Resume.pdf",
      "application/pdf", 4, new Uint8Array([37, 80, 68, 70]), "2026-09-01");
    db.prepare("INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "app-1", "Old Co", "PM", "", "", "https://example.org/old", "2026-09-01",
      80, "resume-1", "Applied", "2026-09-01", "2026-09-01");
    db.close();
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "user-data"));
    await store.open(file);
    assert.equal(store.listApplications()[0].company, "Old Co");
    assert.equal(store.listApplications()[0].matchStrength, 80);
    assert.equal(store.listApplications()[0].resumeName, "Old Resume.pdf");
    const migrated = new DatabaseSync(file, { readOnly: true });
    assert.equal(migrated.prepare("PRAGMA user_version").get().user_version, 9);
    migrated.close();
    const blank = await store.saveApplication({});
    assert.equal(blank.resumeId, "");
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("version 1 desktop databases gain Plan and optional application fields", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-v1-test-"));
  const file = path.join(root, "legacy.sqlite");
  const bundle = path.join(root, "store.mjs");
  let store;
  try {
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE resumes (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL,
        size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE applications (id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL,
        team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '', listing_url TEXT NOT NULL,
        applied_date TEXT NOT NULL, match_strength INTEGER NOT NULL CHECK (match_strength BETWEEN 0 AND 100),
        resume_id TEXT NOT NULL REFERENCES resumes(id), status TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX applications_date_idx ON applications(applied_date DESC, created_at DESC);
      PRAGMA user_version = 1;
    `);
    db.close();
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "user-data"));
    await store.open(file);
    const application = await store.saveApplication({});
    assert.equal(application.matchStrength, null);
    assert.deepEqual(store.listPlans(), []);
    const check = new DatabaseSync(file, { readOnly: true });
    assert.equal(check.prepare("PRAGMA user_version").get().user_version, 9);
    check.close();
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("version 3 descriptions become offline copies during migration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-v3-test-"));
  const file = path.join(root, "legacy.sqlite");
  const bundle = path.join(root, "store.mjs");
  let store;
  try {
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE resumes (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL,
        size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE applications (id TEXT PRIMARY KEY, company TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '',
        listing_url TEXT NOT NULL DEFAULT '', job_description TEXT NOT NULL DEFAULT '',
        applied_date TEXT NOT NULL DEFAULT '', match_strength INTEGER,
        match_notes TEXT NOT NULL DEFAULT '', match_analyzed_at TEXT NOT NULL DEFAULT '',
        resume_id TEXT REFERENCES resumes(id), status TEXT NOT NULL DEFAULT 'Applied',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE plans (id TEXT PRIMARY KEY, listing_url TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '',
        locations TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        keywords_json TEXT NOT NULL DEFAULT '[]', themes_json TEXT NOT NULL DEFAULT '[]',
        overview TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      PRAGMA user_version = 3;
    `);
    db.prepare("INSERT INTO applications (id, listing_url, job_description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("app-3", "https://example.org/job", "Previous application description", "2026-09-01", "2026-09-02");
    db.prepare("INSERT INTO plans (id, listing_url, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("plan-3", "https://example.org/job", "Previous plan description", "2026-09-01", "2026-09-03");
    db.close();
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "user-data"));
    await store.open(file);
    assert.equal(store.listApplications()[0].snapshotText, "Previous application description");
    assert.equal(store.listApplications()[0].notes, "Previous application description");
    assert.equal(store.listApplications()[0].snapshotSource, "saved");
    assert.equal(store.listPlans()[0].snapshotText, "Previous plan description");
    assert.equal(store.listPlans()[0].snapshotSource, "saved");
    const check = new DatabaseSync(file, { readOnly: true });
    assert.equal(check.prepare("PRAGMA user_version").get().user_version, 9);
    check.close();
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("version 4 desktop databases gain CV inputs and match scores", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-v4-test-"));
  const file = path.join(root, "legacy.sqlite");
  const bundle = path.join(root, "store.mjs");
  let store;
  try {
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE resumes (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL,
        size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE applications (id TEXT PRIMARY KEY, snapshot_text TEXT NOT NULL DEFAULT '');
      CREATE TABLE plans (id TEXT PRIMARY KEY, listing_url TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '',
        locations TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '',
        snapshot_source TEXT NOT NULL DEFAULT '', keywords_json TEXT NOT NULL DEFAULT '[]',
        themes_json TEXT NOT NULL DEFAULT '[]', overview TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      PRAGMA user_version = 4;
    `);
    db.prepare("INSERT INTO plans (id, listing_url, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("plan-v4", "https://example.org/v4", "Existing role", "Original description", "2026-09-01", "2026-09-01");
    db.close();
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "user-data"));
    await store.open(file);
    const plan = store.getPlan("plan-v4");
    assert.equal(plan.title, "Existing role");
    assert.equal(plan.currentOverview, "");
    assert.equal(plan.resumeId, "");
    assert.equal(plan.matchStrength, null);
    const check = new DatabaseSync(file, { readOnly: true });
    try { assert.equal(check.prepare("PRAGMA user_version").get().user_version, 9); }
    finally { check.close(); }
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("version 5 plans gain a saved overview explanation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-v5-test-"));
  const file = path.join(root, "legacy.sqlite");
  const bundle = path.join(root, "store.mjs");
  let store;
  try {
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE resumes (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL,
        size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE applications (id TEXT PRIMARY KEY, snapshot_text TEXT NOT NULL DEFAULT '');
      CREATE TABLE plans (id TEXT PRIMARY KEY, listing_url TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '',
        locations TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '',
        snapshot_source TEXT NOT NULL DEFAULT '', current_overview TEXT NOT NULL DEFAULT '',
        resume_id TEXT REFERENCES resumes(id), keywords_json TEXT NOT NULL DEFAULT '[]',
        themes_json TEXT NOT NULL DEFAULT '[]', overview TEXT NOT NULL DEFAULT '',
        match_strength INTEGER CHECK (match_strength BETWEEN 0 AND 100),
        match_analyzed_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      PRAGMA user_version = 5;
    `);
    db.prepare("INSERT INTO plans (id, listing_url, current_overview, overview, match_strength, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("plan-v5", "https://example.org/v5", "I plan products.", "I plan products.", 72, "2026-09-01", "2026-09-01");
    db.close();
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "user-data"));
    await store.open(file);
    const plan = store.getPlan("plan-v5");
    assert.equal(plan.overviewRationale, "");
    assert.equal(plan.overview, "I plan products.");
    assert.equal(plan.matchStrength, 72);
    const check = new DatabaseSync(file, { readOnly: true });
    try { assert.equal(check.prepare("PRAGMA user_version").get().user_version, 9); }
    finally { check.close(); }
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("version 6 applications gain editable notes without losing scores", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-v6-test-"));
  const file = path.join(root, "legacy.sqlite");
  const bundle = path.join(root, "store.mjs");
  let store;
  try {
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE resumes (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL,
        size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE applications (
        id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL, team TEXT NOT NULL DEFAULT '',
        locations TEXT NOT NULL DEFAULT '', listing_url TEXT NOT NULL DEFAULT '', job_description TEXT NOT NULL DEFAULT '',
        snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '', snapshot_source TEXT NOT NULL DEFAULT '',
        applied_date TEXT NOT NULL DEFAULT '', match_strength INTEGER, match_notes TEXT NOT NULL DEFAULT '',
        match_analyzed_at TEXT NOT NULL DEFAULT '', resume_id TEXT, status TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE plans (id TEXT PRIMARY KEY, listing_url TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '', current_overview TEXT NOT NULL DEFAULT '', resume_id TEXT,
        keywords_json TEXT NOT NULL DEFAULT '[]', themes_json TEXT NOT NULL DEFAULT '[]',
        overview TEXT NOT NULL DEFAULT '', overview_rationale TEXT NOT NULL DEFAULT '',
        snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '', snapshot_source TEXT NOT NULL DEFAULT '',
        match_strength INTEGER, match_analyzed_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      PRAGMA user_version = 6;
    `);
    db.prepare("INSERT INTO applications (id, company, title, match_strength, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("app-v6", "Example Co", "Product Manager", 82, "Applied", "2026-09-01", "2026-09-01");
    db.close();
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "user-data"));
    await store.open(file);
    assert.equal(store.listApplications()[0].notes, "");
    const updated = await store.saveApplicationNotes("app-v6", "Spoke with recruiter.");
    assert.equal(updated.notes, "Spoke with recruiter.");
    assert.equal(updated.matchStrength, 82);
    const check = new DatabaseSync(file, { readOnly: true });
    try { assert.equal(check.prepare("PRAGMA user_version").get().user_version, 9); }
    finally { check.close(); }
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("version 7 moves saved listings into Notes once and keeps an untouched upgrade backup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-v7-test-"));
  const file = path.join(root, "shared.sqlite");
  const bundle = path.join(root, "store.mjs");
  const longListing = "Responsibilities\n\n• Lead customer discovery\n• Shape product strategy\n\n" + "Detailed requirements. ".repeat(3300).trimEnd();
  const oldNotes = "Recruiter: Sam\nPre-screen on Friday.";
  let store;
  try {
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "original-profile"));
    await store.create(file);
    const resume = await store.addResume("CV.pdf", "application/pdf", new Uint8Array([37, 80, 68, 70]));
    const emptyNotes = await store.saveApplication({ company: "Expedia", title: "Senior Product Manager",
      appliedDate: "2026-09-29", resumeId: resume.id, matchStrength: 92,
      snapshotText: longListing, snapshotSource: "page" });
    const existingNotes = await store.saveApplication({ company: "Meta", snapshotText: "Team\n\n• Build platforms",
      snapshotSource: "manual", notes: oldNotes });
    const alreadyIncluded = await store.saveApplication({ snapshotText: "One original posting", notes: "Contact: Pat\nOne original posting" });
    const noCopy = await store.saveApplication({ notes: oldNotes });
    const plan = await store.savePlan({ listingUrl: "https://example.org/plan", company: "", title: "", team: "", locations: "",
      description: "A saved Plan", keywords: [], themes: [], overview: "My overview" });
    store.close();
    const legacy = new DatabaseSync(file);
    legacy.prepare("UPDATE applications SET notes = '' WHERE id = ?").run(emptyNotes.id);
    legacy.prepare("UPDATE applications SET notes = ? WHERE id = ?").run(oldNotes, existingNotes.id);
    legacy.exec(`ALTER TABLE plans DROP COLUMN keyword_importance_json;
      ALTER TABLE plans DROP COLUMN theme_importance_json;
      DROP TABLE workspace_preferences; PRAGMA user_version = 7;`);
    legacy.close();
    const originalBytes = await readFile(file);

    store = new DesktopStore(path.join(root, "upgrade-profile"));
    await store.open(file);
    const byId = new Map(store.listApplications().map((item) => [item.id, item]));
    assert.deepEqual(byId.get(emptyNotes.id), { ...emptyNotes, notes: longListing });
    assert.deepEqual(byId.get(existingNotes.id), { ...existingNotes, notes: `${oldNotes}\n\nJob listing\n${existingNotes.snapshotText}` });
    assert.deepEqual(byId.get(alreadyIncluded.id), alreadyIncluded);
    assert.deepEqual(byId.get(noCopy.id), noCopy);
    assert.deepEqual(store.getPlan(plan.id), plan);
    assert.deepEqual([...store.getResume(resume.id).data], [37, 80, 68, 70]);
    const upgrades = (await readdir(store.backupsPath)).filter((name) => name.includes("before-v9"));
    assert.equal(upgrades.length, 1);
    assert.deepEqual(await readFile(path.join(store.backupsPath, upgrades[0])), originalBytes);
    const backupDb = new DatabaseSync(path.join(store.backupsPath, upgrades[0]), { readOnly: true });
    try {
      assert.equal(backupDb.prepare("PRAGMA user_version").get().user_version, 7);
      assert.equal(backupDb.prepare("SELECT notes FROM applications WHERE id = ?").get(emptyNotes.id).notes, "");
    } finally { backupDb.close(); }

    store.close();
    await store.open(file);
    assert.deepEqual(store.listApplications().find((item) => item.id === existingNotes.id), byId.get(existingNotes.id));
    assert.equal((await readdir(store.backupsPath)).filter((name) => name.includes("before-v9")).length, 1);
    const edited = await store.saveApplicationNotes(emptyNotes.id, `${longListing}\n\nRecruiter conversation`);
    assert.ok(edited.notes.length > 20_000);
    assert.equal(edited.snapshotText, longListing);
    assert.equal(edited.matchStrength, 92);
    const cleared = await store.saveApplicationNotes(existingNotes.id, "My new notes");
    assert.equal((await store.saveApplication({ ...cleared, status: "Heard back" }, cleared.id)).notes, "My new notes");
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("new listing captures and analysis-supplied descriptions stay available in Notes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-listing-notes-test-"));
  const bundle = path.join(root, "store.mjs");
  let store;
  try {
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "profile"));
    await store.create(path.join(root, "applications.sqlite"));
    const application = await store.saveApplication({ listingUrl: "https://example.org/job", notes: "Recruiter: Sam" });
    const analyzed = await store.saveMatchAnalysis(application.id, application.updatedAt, 82,
      "Good product strategy fit.", "Responsibilities\n\n• Lead product strategy\n• Talk to customers");
    assert.equal(analyzed.notes, `Recruiter: Sam\n\nJob listing\n${analyzed.snapshotText}`);
    const captured = await store.saveApplication({ ...analyzed, snapshotText: "Original page content", snapshotSource: "page" }, application.id);
    assert.equal(captured.notes, `${analyzed.notes}\n\nJob listing\nOriginal page content`);
    const updated = await store.saveApplication({ ...captured, team: "Growth" }, application.id);
    assert.equal(updated.notes, captured.notes);
    const manual = await store.saveApplication({ jobDescription: "Manually pasted posting\n\n• Build platforms" });
    assert.equal(manual.notes, manual.jobDescription);
    const freshNotes = `${manual.notes}\n\nRecruiter: Sam. Call on Friday.`;
    await store.saveApplicationNotes(manual.id, freshNotes);
    // Saving a previously opened edit form or status control must keep the latest Notes.
    const savedStaleForm = await store.saveApplication({ ...manual, team: "Growth" }, manual.id);
    assert.equal(savedStaleForm.notes, freshNotes);
    assert.equal(savedStaleForm.snapshotText, manual.snapshotText);
    const savedStaleStatus = await store.saveApplication({ ...manual, status: "Heard back" }, manual.id);
    assert.equal(savedStaleStatus.notes, freshNotes);
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("v8 upgrade preserves data and notes, remembers the overview, and keeps job importance independent of match", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-priorities-test-"));
  const file = path.join(root, "cloud", "applications.sqlite");
  let store;
  try {
    const bundle = path.join(root, "store.mjs");
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "original-profile"));
    await store.create(file);
    const resume = await store.addResume("CV.pdf", "application/pdf", new Uint8Array([37, 80, 68, 70]));
    const application = await store.saveApplication({ company: "Example", snapshotText: "Archived job\n• Lead discovery", resumeId: resume.id });
    const clearedNotes = await store.saveApplicationNotes(application.id, "Recruiter: Sam. I deliberately removed the old listing from these notes.");
    const plan = await store.savePlan({ listingUrl: "https://example.org/job", company: "Example", title: "PM", team: "Growth", locations: "Remote",
      description: "Responsibilities\n• Lead discovery and roadmap", currentOverview: "I turn customer insights into product direction.",
      resumeId: resume.id, keywords: ["Discovery", "Roadmap"], themes: ["Lead customer discovery"], overview: "An existing overview." });
    store.close();
    const legacy = new DatabaseSync(file);
    legacy.exec(`ALTER TABLE plans DROP COLUMN keyword_importance_json;
      ALTER TABLE plans DROP COLUMN theme_importance_json;
      DROP TABLE workspace_preferences; PRAGMA user_version = 8;`);
    legacy.close();
    const originalBytes = await readFile(file);

    store = new DesktopStore(path.join(root, "computer-a"));
    await store.open(file);
    assert.deepEqual(store.getPlan(plan.id), plan);
    assert.deepEqual(store.listApplications()[0], clearedNotes, "The v7 Notes migration must not run again on v8 data.");
    assert.deepEqual([...store.getResume(resume.id).data], [37, 80, 68, 70]);
    assert.deepEqual(store.getPlan(plan.id).keywordImportance, [null, null]);
    assert.equal(store.getLastCurrentOverview(), plan.currentOverview);
    const backups = (await readdir(store.backupsPath)).filter((name) => name.includes("before-v9"));
    assert.equal(backups.length, 1);
    assert.deepEqual(await readFile(path.join(store.backupsPath, backups[0])), originalBytes);

    const analyzed = await store.savePlanAnalysis(plan.id, plan.updatedAt, plan.keywords, plan.themes,
      "I focus on discovery to shape useful products.", "Discovery is the role's main requirement.", 42, [96, 80], [94]);
    assert.equal(analyzed.matchStrength, 42);
    assert.deepEqual(analyzed.keywordImportance, [96, 80]);
    const cvChanged = await store.savePlan({ ...analyzed, currentOverview: "I lead product delivery.", resumeId: "" }, plan.id);
    assert.equal(cvChanged.matchStrength, null);
    assert.deepEqual(cvChanged.keywordImportance, [96, 80], "Job importance is independent of the resume and overview.");
    const edited = await store.savePlan({ ...cvChanged, keywords: ["Roadmap", "New skill", "Discovery"], themes: ["A revised theme"] }, plan.id);
    assert.deepEqual(edited.keywordImportance, [80, null, 96]);
    assert.deepEqual(edited.themeImportance, [null]);
    await assert.rejects(store.savePlanAnalysis(plan.id, plan.updatedAt, ["Bad"], ["Bad"], "Bad", "Bad", 99, [101], [80]), /importance/);
    const jobChanged = await store.savePlan({ ...edited, description: "Responsibilities\n• Focus on product delivery" }, plan.id);
    assert.deepEqual(jobChanged.keywordImportance, [null, null, null]);
    const scored = await store.savePlanAnalysis(plan.id, jobChanged.updatedAt, ["Product delivery"], ["Own delivery"], "A supported overview.", "Delivery matters here.", 61, [91], [89]);

    store.close();
    store = new DesktopStore(path.join(root, "computer-b"));
    await store.open(file);
    assert.deepEqual(store.getPlan(plan.id), scored);
    assert.equal(store.getLastCurrentOverview(), "I lead product delivery.");
    assert.deepEqual(store.listApplications()[0], clearedNotes);
    const blank = await store.savePlan({ ...scored, currentOverview: "" }, plan.id);
    assert.equal(store.getLastCurrentOverview(), "", "An explicitly cleared overview stays cleared.");
    store.close();
    await store.open(file);
    assert.equal(store.getLastCurrentOverview(), "");
    assert.deepEqual(store.getPlan(plan.id).keywordImportance, blank.keywordImportance);
    await store.create(path.join(root, "other.sqlite"));
    assert.equal(store.getLastCurrentOverview(), "", "The default belongs to the selected database only.");
  } finally {
    store?.close();
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

import { randomUUID, createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { z } from "zod";
import { applicationInputSchema } from "../lib/application-validation";
import { MAX_APPLICATION_NOTES_CHARS } from "../lib/application-types";
import type { Application, ApplicationInput, Resume } from "../lib/application-types";
import { normalizeJobText } from "../lib/job-text";
import { importanceForTerms } from "./plan-importance";

export type Plan = {
  id: string;
  listingUrl: string;
  company: string;
  title: string;
  team: string;
  locations: string;
  description: string;
  snapshotText: string;
  snapshotCapturedAt: string;
  snapshotSource: "page" | "manual" | "saved" | "";
  currentOverview: string;
  resumeId: string;
  keywords: string[];
  themes: string[];
  keywordImportance: Array<number | null>;
  themeImportance: Array<number | null>;
  overview: string;
  overviewRationale: string;
  matchStrength: number | null;
  matchNotes: string;
  matchAnalyzedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanInput = Omit<Plan, "id" | "createdAt" | "updatedAt" | "snapshotCapturedAt" | "snapshotText" | "snapshotSource" | "overviewRationale" | "matchStrength" | "matchNotes" | "matchAnalyzedAt" | "keywordImportance" | "themeImportance"> & {
  snapshotText?: string;
  snapshotSource?: Plan["snapshotSource"];
};

const planInputSchema = z.object({
  listingUrl: z.string().trim().url().max(2000).refine((value) => new URL(value).protocol === "https:"),
  company: z.string().trim().max(120),
  title: z.string().trim().max(160),
  team: z.string().trim().max(160),
  locations: z.string().trim().max(500),
  description: z.string().trim().max(80_000),
  snapshotText: z.string().trim().max(80_000).default(""),
  snapshotSource: z.enum(["page", "manual", "saved", ""]).default(""),
  currentOverview: z.string().trim().max(20_000).default(""),
  resumeId: z.union([z.literal(""), z.string().uuid()]).default(""),
  keywords: z.array(z.string().trim().max(200)).max(100),
  themes: z.array(z.string().trim().max(1000)).max(100),
  overview: z.string().trim().max(20_000),
});

type Row = Record<string, unknown>;

function notesWithListing(notes: string, listing: string) {
  if (!listing.trim() || normalizeJobText(notes).includes(normalizeJobText(listing))) return notes;
  const combined = notes.trim() ? `${notes}\n\nJob listing\n${listing}` : listing;
  if (combined.length > MAX_APPLICATION_NOTES_CHARS) {
    throw new Error("These notes are too long to include another listing. Shorten the notes before saving.");
  }
  return combined;
}

function snapshotValues(input: { listingUrl: string; snapshotText?: string; snapshotSource?: string },
  description: string, previous: Row | undefined, now: string) {
  const sameListing = previous && String(previous.listing_url) === input.listingUrl;
  if (sameListing && previous.snapshot_text &&
      !(input.snapshotSource === "page" && input.snapshotText?.trim() && previous.snapshot_source !== "page")) {
    return [String(previous.snapshot_text), String(previous.snapshot_captured_at || ""),
      String(previous.snapshot_source || "saved")];
  }
  const supplied = input.snapshotText?.trim() || "";
  const text = previous && !sameListing && supplied === normalizeJobText(String(previous.snapshot_text || ""))
    ? "" : supplied;
  const fallback = previous && !sameListing && description === normalizeJobText(String(previous.job_description || previous.description || ""))
    ? "" : description;
  const captured = text || fallback;
  const source = text ? input.snapshotSource || "page" : captured ? "manual" : "";
  return [captured, captured ? now : "", source];
}

function mapApplication(row: Row): Application {
  return {
    id: String(row.id), company: String(row.company), title: String(row.title),
    team: String(row.team || ""), locations: String(row.locations || ""),
    listingUrl: String(row.listing_url), jobDescription: normalizeJobText(String(row.job_description || "")),
    notes: normalizeJobText(String(row.notes || "")),
    snapshotText: normalizeJobText(String(row.snapshot_text || "")),
    snapshotCapturedAt: String(row.snapshot_captured_at || ""),
    snapshotSource: String(row.snapshot_source || "") as Application["snapshotSource"],
    appliedDate: String(row.applied_date),
    matchStrength: row.match_strength === null ? null : Number(row.match_strength),
    matchNotes: String(row.match_notes || ""), matchAnalyzedAt: String(row.match_analyzed_at || ""),
    resumeId: String(row.resume_id || ""), resumeName: String(row.resume_name || ""),
    status: row.status as Application["status"],
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapResume(row: Row): Resume {
  return {
    id: String(row.id), filename: String(row.filename),
    contentType: String(row.content_type), size: Number(row.size),
    createdAt: String(row.created_at),
  };
}

function mapPlan(row: Row): Plan {
  const keywords = JSON.parse(String(row.keywords_json || "[]")) as string[];
  const themes = JSON.parse(String(row.themes_json || "[]")) as string[];
  return {
    id: String(row.id), listingUrl: String(row.listing_url),
    company: String(row.company || ""), title: String(row.title || ""),
    team: String(row.team || ""), locations: String(row.locations || ""),
    description: normalizeJobText(String(row.description || "")),
    snapshotText: normalizeJobText(String(row.snapshot_text || "")),
    snapshotCapturedAt: String(row.snapshot_captured_at || ""),
    snapshotSource: String(row.snapshot_source || "") as Plan["snapshotSource"],
    currentOverview: String(row.current_overview || ""),
    resumeId: String(row.resume_id || ""),
    keywords, themes,
    keywordImportance: importanceForTerms(keywords, JSON.parse(String(row.keyword_importance_json || "[]")), keywords),
    themeImportance: importanceForTerms(themes, JSON.parse(String(row.theme_importance_json || "[]")), themes),
    overview: String(row.overview || ""),
    overviewRationale: String(row.overview_rationale || ""),
    matchNotes: String(row.match_notes || ""),
    matchStrength: row.match_strength === null || row.match_strength === undefined ? null : Number(row.match_strength),
    matchAnalyzedAt: String(row.match_analyzed_at || ""),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function createSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    CREATE TABLE resumes (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL,
      size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE applications (
      id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL,
      team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '',
      listing_url TEXT NOT NULL DEFAULT '', job_description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '',
      snapshot_source TEXT NOT NULL DEFAULT '',
      applied_date TEXT NOT NULL DEFAULT '',
      match_strength INTEGER CHECK (match_strength BETWEEN 0 AND 100),
      match_notes TEXT NOT NULL DEFAULT '', match_analyzed_at TEXT NOT NULL DEFAULT '',
      resume_id TEXT REFERENCES resumes(id),
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE plans (
      id TEXT PRIMARY KEY, listing_url TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '',
      locations TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '',
      snapshot_source TEXT NOT NULL DEFAULT '',
      current_overview TEXT NOT NULL DEFAULT '', resume_id TEXT REFERENCES resumes(id),
      keywords_json TEXT NOT NULL DEFAULT '[]', themes_json TEXT NOT NULL DEFAULT '[]',
      keyword_importance_json TEXT NOT NULL DEFAULT '[]', theme_importance_json TEXT NOT NULL DEFAULT '[]',
      overview TEXT NOT NULL DEFAULT '', overview_rationale TEXT NOT NULL DEFAULT '',
      match_strength INTEGER CHECK (match_strength BETWEEN 0 AND 100),
      match_notes TEXT NOT NULL DEFAULT '',
      match_analyzed_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX applications_date_idx ON applications(applied_date DESC, created_at DESC);
    CREATE INDEX plans_updated_idx ON plans(updated_at DESC);
    CREATE TABLE workspace_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version = 10;
  `);
}

function migrate(db: DatabaseSync): boolean {
  const version = Number((db.prepare("PRAGMA user_version").get() as Row).user_version);
  if (version === 10) return false;
  if (version < 1 || version > 9) throw new Error("This is not a supported Zebby database.");
  if (version === 1) db.exec(`
    CREATE TABLE plans (
      id TEXT PRIMARY KEY, listing_url TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '',
      locations TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]', themes_json TEXT NOT NULL DEFAULT '[]',
      overview TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX plans_updated_idx ON plans(updated_at DESC);
    PRAGMA user_version = 2;
  `);
  if (version <= 2) db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE applications_v3 (
      id TEXT PRIMARY KEY, company TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
      team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '',
      listing_url TEXT NOT NULL DEFAULT '', job_description TEXT NOT NULL DEFAULT '',
      applied_date TEXT NOT NULL DEFAULT '',
      match_strength INTEGER CHECK (match_strength BETWEEN 0 AND 100),
      match_notes TEXT NOT NULL DEFAULT '', match_analyzed_at TEXT NOT NULL DEFAULT '',
      resume_id TEXT REFERENCES resumes(id),
      status TEXT NOT NULL DEFAULT 'Applied', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO applications_v3 (id, company, title, team, locations, listing_url,
      applied_date, match_strength, resume_id, status, created_at, updated_at)
    SELECT id, company, title, team, locations, listing_url, applied_date,
      match_strength, resume_id, status, created_at, updated_at FROM applications;
    DROP TABLE applications;
    ALTER TABLE applications_v3 RENAME TO applications;
    CREATE INDEX applications_date_idx ON applications(applied_date DESC, created_at DESC);
    PRAGMA user_version = 3;
    COMMIT;
  `);
  if (version <= 3) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE applications ADD COLUMN snapshot_text TEXT NOT NULL DEFAULT '';
    ALTER TABLE applications ADD COLUMN snapshot_captured_at TEXT NOT NULL DEFAULT '';
    ALTER TABLE applications ADD COLUMN snapshot_source TEXT NOT NULL DEFAULT '';
    ALTER TABLE plans ADD COLUMN snapshot_text TEXT NOT NULL DEFAULT '';
    ALTER TABLE plans ADD COLUMN snapshot_captured_at TEXT NOT NULL DEFAULT '';
    ALTER TABLE plans ADD COLUMN snapshot_source TEXT NOT NULL DEFAULT '';
    UPDATE applications SET snapshot_text = job_description,
      snapshot_captured_at = updated_at, snapshot_source = 'saved'
      WHERE length(trim(job_description)) > 0;
    UPDATE plans SET snapshot_text = description,
      snapshot_captured_at = updated_at, snapshot_source = 'saved'
      WHERE length(trim(description)) > 0;
    PRAGMA user_version = 4;
    COMMIT;
  `);
  if (version <= 4) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE plans ADD COLUMN current_overview TEXT NOT NULL DEFAULT '';
    ALTER TABLE plans ADD COLUMN resume_id TEXT REFERENCES resumes(id);
    ALTER TABLE plans ADD COLUMN match_strength INTEGER CHECK (match_strength BETWEEN 0 AND 100);
    ALTER TABLE plans ADD COLUMN match_analyzed_at TEXT NOT NULL DEFAULT '';
    PRAGMA user_version = 5;
    COMMIT;
  `);
  if (version <= 5) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE plans ADD COLUMN overview_rationale TEXT NOT NULL DEFAULT '';
    PRAGMA user_version = 6;
    COMMIT;
  `);
  if (version <= 6) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE applications ADD COLUMN notes TEXT NOT NULL DEFAULT '';
    PRAGMA user_version = 7;
    COMMIT;
  `);
  if (version <= 7) db.exec(`
    BEGIN IMMEDIATE;
    UPDATE applications SET notes = CASE
      WHEN length(trim(notes)) = 0 THEN snapshot_text
      ELSE notes || char(10) || char(10) || 'Job listing' || char(10) || snapshot_text
    END
    WHERE length(trim(snapshot_text)) > 0 AND instr(notes, snapshot_text) = 0;
    PRAGMA user_version = 8;
    COMMIT;
  `);
  if (version <= 8) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE plans ADD COLUMN keyword_importance_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE plans ADD COLUMN theme_importance_json TEXT NOT NULL DEFAULT '[]';
    CREATE TABLE workspace_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO workspace_preferences (key, value)
      SELECT 'last_current_overview', current_overview FROM plans ORDER BY updated_at DESC LIMIT 1;
    PRAGMA user_version = 9;
    COMMIT;
  `);
  db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE plans ADD COLUMN match_notes TEXT NOT NULL DEFAULT '';
    PRAGMA user_version = 10;
    COMMIT;
  `);
  return true;
}

function validate(db: DatabaseSync) {
  const check = (db.prepare("PRAGMA quick_check").get() as Row).quick_check;
  if (check !== "ok") throw new Error("The selected database failed its integrity check.");
  const version = Number((db.prepare("PRAGMA user_version").get() as Row).user_version);
  if (version < 1 || version > 10) throw new Error("This is not a supported Zebby database.");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Row[];
  const names = new Set(tables.map((row) => String(row.name)));
  if (!names.has("applications") || !names.has("resumes")) {
    throw new Error("This file does not contain a Zebby database.");
  }
}

async function hashFile(file: string) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export class DesktopStore {
  private db: DatabaseSync | null = null;
  private filePath = "";
  private workingPath = "";
  private syncedHash = "";
  private dirty = false;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly userData: string) {}

  get status() {
    return { filePath: this.filePath, filename: this.filePath ? path.basename(this.filePath) : "", dirty: this.dirty };
  }

  get backupsPath() { return path.join(this.userData, "Backups"); }

  private requireDb(): DatabaseSync {
    if (!this.db) throw new Error("Choose a database in Settings first.");
    return this.db;
  }

  async create(filePath: string) {
    await this.writeQueue;
    if (this.dirty) throw new Error("Save the pending database changes before creating a new file.");
    const target = path.resolve(filePath);
    if (existsSync(target)) throw new Error("That file already exists. Use Open database instead.");
    await mkdir(path.dirname(target), { recursive: true });
    const scratch = path.join(this.userData, `new-${randomUUID()}.sqlite`);
    await mkdir(this.userData, { recursive: true });
    const db = new DatabaseSync(scratch);
    try {
      createSchema(db);
    } finally { db.close(); }
    try {
      await copyFile(scratch, target, constants.COPYFILE_EXCL);
      await this.open(target);
    } finally { await unlink(scratch).catch(() => undefined); }
  }

  async open(filePath: string) {
    await this.writeQueue;
    if (this.dirty) throw new Error("Save the pending database changes before switching files.");
    const target = path.resolve(filePath);
    if (!(await stat(target).catch(() => null))?.isFile()) throw new Error("The database file could not be found. Wait for cloud sync, then try again.");
    const checkDb = new DatabaseSync(target, { readOnly: true });
    let previousVersion = 0;
    try {
      validate(checkDb);
      previousVersion = Number((checkDb.prepare("PRAGMA user_version").get() as Row).user_version);
    } finally { checkDb.close(); }
    if (previousVersion < 10) {
      await mkdir(this.backupsPath, { recursive: true });
      const prefix = createHash("sha256").update(target.toLowerCase()).digest("hex").slice(0, 12);
      await copyFile(target, path.join(this.backupsPath,
        `${prefix}-${new Date().toISOString().slice(0, 10)}-before-v10-${randomUUID()}.sqlite`));
    }
    const workingDir = path.join(this.userData, "working");
    await mkdir(workingDir, { recursive: true });
    const workingPath = path.join(workingDir, createHash("sha256").update(target.toLowerCase()).digest("hex") + ".sqlite");
    const temp = workingPath + ".incoming";
    await copyFile(target, temp);
    const incoming = new DatabaseSync(temp);
    let migrated = false;
    try {
      incoming.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA busy_timeout = 3000;");
      migrated = migrate(incoming);
    } finally { incoming.close(); }
    this.db?.close();
    await rename(temp, workingPath);
    this.db = new DatabaseSync(workingPath);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA busy_timeout = 3000;");
    this.filePath = target;
    this.workingPath = workingPath;
    this.syncedHash = await hashFile(target);
    this.dirty = migrated;
    if (migrated) await this.flush();
    return this.status;
  }

  private async assertCurrentFile() {
    if (!this.filePath || !existsSync(this.filePath)) {
      throw new Error("The selected database is missing. Wait for cloud sync, then reopen it.");
    }
    if (await hashFile(this.filePath) !== this.syncedHash) {
      throw new Error("The cloud database changed outside this app. Reopen it in Settings before editing.");
    }
  }

  private async flush() {
    const db = this.requireDb();
    await this.assertCurrentFile();
    const temp = path.join(path.dirname(this.filePath), `.${path.basename(this.filePath)}.${randomUUID()}.tmp`);
    try {
      await backup(db, temp);
      await rename(temp, this.filePath);
      this.syncedHash = await hashFile(this.filePath);
      this.dirty = false;
    } finally { await unlink(temp).catch(() => undefined); }
  }

  async retrySync() {
    if (this.dirty) await this.flush();
    return this.status;
  }

  private async mutate<T>(work: (db: DatabaseSync) => T): Promise<T> {
    const run = this.writeQueue.then(async () => {
      if (this.dirty) throw new Error("A previous change has not reached the cloud file. Use Retry save in Settings.");
      await this.assertCurrentFile();
      const db = this.requireDb();
      db.exec("BEGIN IMMEDIATE");
      let result: T;
      try { result = work(db); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
      this.dirty = true;
      await this.flush();
      return result;
    });
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  listApplications(): Application[] {
    return (this.requireDb().prepare(`SELECT a.*, r.filename AS resume_name FROM applications a
      LEFT JOIN resumes r ON r.id = a.resume_id ORDER BY a.applied_date DESC, a.created_at DESC`).all() as Row[]).map(mapApplication);
  }

  private findApplication(id: string): Application | null {
    const row = this.requireDb().prepare(`SELECT a.*, r.filename AS resume_name FROM applications a
      LEFT JOIN resumes r ON r.id = a.resume_id WHERE a.id = ?`).get(id) as Row | undefined;
    return row ? mapApplication(row) : null;
  }

  async saveApplication(value: unknown, id?: string): Promise<Application> {
    const parsed = applicationInputSchema.safeParse(value);
    if (!parsed.success) throw new Error("Check the application fields and try again.");
    const item: ApplicationInput = { ...parsed.data, team: parsed.data.team || "", locations: parsed.data.locations || "",
      jobDescription: normalizeJobText(parsed.data.jobDescription), snapshotText: normalizeJobText(parsed.data.snapshotText),
      notes: normalizeJobText(parsed.data.notes) };
    const resultId = id || randomUUID();
    await this.mutate((db) => {
      if (item.resumeId && !db.prepare("SELECT id FROM resumes WHERE id = ?").get(item.resumeId)) throw new Error("The selected resume could not be found.");
      const now = new Date().toISOString();
      if (id) {
        const previous = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as Row | undefined;
        if (!previous) throw new Error("Application not found.");
        const snapshot = snapshotValues(item, item.jobDescription, previous, now);
        // Notes have a separate save action; an open record form can carry an older value.
        const currentNotes = String(previous.notes || "");
        const applicationNotes = snapshot[0] !== String(previous.snapshot_text || "")
          ? notesWithListing(currentNotes, snapshot[0]) : currentNotes;
        const sameSource = String(previous.resume_id || "") === item.resumeId &&
          String(previous.listing_url) === item.listingUrl &&
          normalizeJobText(String(previous.job_description || "")) === item.jobDescription;
        const sameScore = (previous.match_strength === null ? null : Number(previous.match_strength)) === item.matchStrength;
        const preserveAnalysis = sameSource && sameScore;
        const score = !sameSource && previous.match_analyzed_at && sameScore ? null : item.matchStrength;
        const result = db.prepare(`UPDATE applications SET company = ?, title = ?, team = ?, locations = ?,
          listing_url = ?, job_description = ?, notes = ?, snapshot_text = ?, snapshot_captured_at = ?,
          snapshot_source = ?, applied_date = ?, match_strength = ?,
          match_notes = ?, match_analyzed_at = ?, resume_id = ?, status = ?, updated_at = ?
          WHERE id = ?`).run(item.company, item.title, item.team, item.locations, item.listingUrl,
          item.jobDescription, applicationNotes, ...snapshot, item.appliedDate, score,
          preserveAnalysis ? String(previous.match_notes || "") : "",
          preserveAnalysis ? String(previous.match_analyzed_at || "") : "",
          item.resumeId || null, item.status, now, id);
        if (!result.changes) throw new Error("Application not found.");
      } else {
        const snapshot = snapshotValues(item, item.jobDescription, undefined, now);
        db.prepare(`INSERT INTO applications (id, company, title, team, locations, listing_url,
          job_description, notes, snapshot_text, snapshot_captured_at, snapshot_source, applied_date,
          match_strength, resume_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(resultId, item.company, item.title,
          item.team, item.locations, item.listingUrl, item.jobDescription, notesWithListing(item.notes, snapshot[0]), ...snapshot, item.appliedDate,
          item.matchStrength, item.resumeId || null, item.status, now, now);
      }
    });
    return this.findApplication(resultId)!;
  }

  async saveApplicationNotes(id: string, notes: unknown): Promise<Application> {
    if (typeof notes !== "string" || notes.length > MAX_APPLICATION_NOTES_CHARS) throw new Error("Notes must be 200,000 characters or less.");
    await this.mutate((db) => {
      const result = db.prepare("UPDATE applications SET notes = ?, updated_at = ? WHERE id = ?")
        .run(normalizeJobText(notes), new Date().toISOString(), id);
      if (!result.changes) throw new Error("Application not found.");
    });
    return this.findApplication(id)!;
  }

  findPlanByListingUrl(listingUrl: string): Plan | null {
    const row = this.requireDb().prepare("SELECT * FROM plans WHERE listing_url = ? ORDER BY updated_at DESC LIMIT 1")
      .get(listingUrl) as Row | undefined;
    return row ? mapPlan(row) : null;
  }

  async saveMatchAnalysis(id: string, expectedUpdatedAt: string, score: number,
    notes: string, jobDescription: string): Promise<Application> {
    if (!Number.isInteger(score) || score < 0 || score > 100 || !notes.trim()) {
      throw new Error("The match analysis was incomplete. Try again.");
    }
    jobDescription = normalizeJobText(jobDescription);
    await this.mutate((db) => {
      const previous = db.prepare("SELECT notes, snapshot_text FROM applications WHERE id = ?").get(id) as Row | undefined;
      if (!previous) throw new Error("Application not found.");
      const applicationNotes = previous.snapshot_text ? String(previous.notes || "")
        : notesWithListing(String(previous.notes || ""), jobDescription);
      const result = db.prepare(`UPDATE applications SET match_strength = ?, match_notes = ?,
        match_analyzed_at = ?, job_description = ?, notes = ?,
        snapshot_text = CASE WHEN snapshot_text = '' THEN ? ELSE snapshot_text END,
        snapshot_captured_at = CASE WHEN snapshot_captured_at = '' THEN ? ELSE snapshot_captured_at END,
        snapshot_source = CASE WHEN snapshot_source = '' THEN 'saved' ELSE snapshot_source END,
        updated_at = ? WHERE id = ? AND updated_at = ?`)
        .run(score, notes.trim().slice(0, 4000), new Date().toISOString(), jobDescription, applicationNotes,
          jobDescription, new Date().toISOString(), new Date().toISOString(), id, expectedUpdatedAt);
      if (!result.changes) throw new Error("This application changed while analysis ran. Run it again from the latest version.");
    });
    return this.findApplication(id)!;
  }

  async deleteApplication(id: string) {
    await this.mutate((db) => {
      const result = db.prepare("DELETE FROM applications WHERE id = ?").run(id);
      if (!result.changes) throw new Error("Application not found.");
    });
  }

  listResumes(): Resume[] {
    return (this.requireDb().prepare("SELECT id, filename, content_type, size, created_at FROM resumes ORDER BY created_at DESC").all() as Row[]).map(mapResume);
  }

  getResume(id: string): { resume: Resume; data: Uint8Array } | null {
    const row = this.requireDb().prepare("SELECT * FROM resumes WHERE id = ?").get(id) as Row | undefined;
    return row ? { resume: mapResume(row), data: row.file_data as Uint8Array } : null;
  }

  async addResume(filename: string, contentType: string, data: Uint8Array): Promise<Resume> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.mutate((db) => db.prepare(`INSERT INTO resumes
      (id, filename, content_type, size, file_data, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, filename, contentType, data.byteLength, data, now));
    return { id, filename, contentType, size: data.byteLength, createdAt: now };
  }

  listPlans(): Plan[] {
    return (this.requireDb().prepare("SELECT * FROM plans ORDER BY updated_at DESC").all() as Row[]).map(mapPlan);
  }

  getPlan(id: string): Plan | null {
    const row = this.requireDb().prepare("SELECT * FROM plans WHERE id = ?").get(id) as Row | undefined;
    return row ? mapPlan(row) : null;
  }

  getLastCurrentOverview(): string {
    const row = this.requireDb().prepare("SELECT value FROM workspace_preferences WHERE key = 'last_current_overview'").get() as Row | undefined;
    return String(row?.value || "");
  }

  async savePlan(input: PlanInput, id?: string): Promise<Plan> {
    const parsed = planInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Check the plan fields and enter a public HTTPS job listing link.");
    const item = { ...parsed.data, description: normalizeJobText(parsed.data.description),
      snapshotText: normalizeJobText(parsed.data.snapshotText) };
    const resultId = id || randomUUID();
    await this.mutate((db) => {
      if (item.resumeId && !db.prepare("SELECT id FROM resumes WHERE id = ?").get(item.resumeId)) {
        throw new Error("The selected resume could not be found.");
      }
      const now = new Date().toISOString();
      const fields = [item.listingUrl, item.company, item.title, item.team,
        item.locations, item.description, item.currentOverview, item.resumeId || null,
        JSON.stringify(item.keywords.filter(Boolean)),
        JSON.stringify(item.themes.filter(Boolean)), item.overview];
      if (id) {
        const previous = db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as Row | undefined;
        if (!previous) throw new Error("Plan not found.");
        const snapshot = snapshotValues(item, item.description, previous, now);
        const sameJob = String(previous.listing_url) === item.listingUrl &&
          String(previous.company) === item.company && String(previous.title) === item.title &&
          String(previous.team) === item.team && String(previous.locations) === item.locations &&
          normalizeJobText(String(previous.description)) === item.description;
        const sameSource = sameJob &&
          String(previous.current_overview || "") === item.currentOverview &&
          String(previous.resume_id || "") === item.resumeId;
        const keepRationale = sameSource && String(previous.overview || "") === item.overview;
        const result = db.prepare(`UPDATE plans SET listing_url = ?, company = ?, title = ?, team = ?,
          locations = ?, description = ?, current_overview = ?, resume_id = ?,
          keywords_json = ?, themes_json = ?, overview = ?, overview_rationale = ?,
          snapshot_text = ?, snapshot_captured_at = ?, snapshot_source = ?,
          match_strength = ?, match_analyzed_at = ?, match_notes = ?, keyword_importance_json = ?, theme_importance_json = ?, updated_at = ? WHERE id = ?`)
          .run(...fields, keepRationale ? String(previous.overview_rationale || "") : "",
            ...snapshot, sameSource && previous.match_strength !== null
            ? Number(previous.match_strength) : null,
            sameSource ? String(previous.match_analyzed_at || "") : "",
            sameSource ? String(previous.match_notes || "") : "",
            JSON.stringify(sameJob ? importanceForTerms(JSON.parse(String(previous.keywords_json)),
              JSON.parse(String(previous.keyword_importance_json)), item.keywords.filter(Boolean)) : []),
            JSON.stringify(sameJob ? importanceForTerms(JSON.parse(String(previous.themes_json)),
              JSON.parse(String(previous.theme_importance_json)), item.themes.filter(Boolean)) : []), now, id);
        if (!result.changes) throw new Error("Plan not found.");
      } else {
        const snapshot = snapshotValues(item, item.description, undefined, now);
        db.prepare(`INSERT INTO plans (id, listing_url, company, title, team, locations,
          description, current_overview, resume_id, keywords_json, themes_json, overview,
          snapshot_text, snapshot_captured_at, snapshot_source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(resultId, ...fields, ...snapshot, now, now);
      }
      db.prepare(`INSERT INTO workspace_preferences (key, value) VALUES ('last_current_overview', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(item.currentOverview);
    });
    return this.getPlan(resultId)!;
  }

  async savePlanAnalysis(id: string, expectedUpdatedAt: string, keywords: string[],
    themes: string[], overview: string, overviewRationale: string, matchStrength: number,
    keywordImportance: number[] = [], themeImportance: number[] = [], matchNotes = ""): Promise<Plan> {
    if (!Number.isInteger(matchStrength) || matchStrength < 0 || matchStrength > 100) {
      throw new Error("The match score must be between 0 and 100.");
    }
    if (!overviewRationale.trim()) throw new Error("The overview explanation was incomplete. Try again.");
    if (!matchNotes.trim()) throw new Error("The match explanation was incomplete. Try again.");
    for (const [items, values] of [[keywords, keywordImportance], [themes, themeImportance]] as const) {
      if (values.length && (values.length !== items.length || values.some((value) => !Number.isInteger(value) || value < 0 || value > 100))) {
        throw new Error("Job importance must be between 0 and 100 for every recommendation.");
      }
    }
    await this.mutate((db) => {
      const result = db.prepare(`UPDATE plans SET keywords_json = ?, themes_json = ?, overview = ?, overview_rationale = ?,
        match_strength = ?, keyword_importance_json = ?, theme_importance_json = ?, match_notes = ?, match_analyzed_at = ?, updated_at = ? WHERE id = ? AND updated_at = ?`)
        .run(JSON.stringify(keywords), JSON.stringify(themes), overview, overviewRationale.trim().slice(0, 2000), matchStrength,
          JSON.stringify(keywordImportance), JSON.stringify(themeImportance), matchNotes.trim().slice(0, 4000), new Date().toISOString(), new Date().toISOString(), id, expectedUpdatedAt);
      if (!result.changes) throw new Error("This plan changed while analysis ran. Run it again from the latest version.");
      db.prepare(`INSERT INTO workspace_preferences (key, value)
        SELECT 'last_current_overview', current_overview FROM plans WHERE id = ?
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(id);
    });
    return this.getPlan(id)!;
  }

  async deletePlan(id: string) {
    await this.mutate((db) => {
      const result = db.prepare("DELETE FROM plans WHERE id = ?").run(id);
      if (!result.changes) throw new Error("Plan not found.");
    });
  }

  close() { this.db?.close(); this.db = null; }
}

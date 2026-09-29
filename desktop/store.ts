import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { z } from "zod";
import { applicationInputSchema } from "../lib/application-validation";
import type { Application, ApplicationInput, Resume } from "../lib/application-types";

export type Plan = {
  id: string;
  listingUrl: string;
  company: string;
  title: string;
  team: string;
  locations: string;
  description: string;
  keywords: string[];
  themes: string[];
  overview: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanInput = Omit<Plan, "id" | "createdAt" | "updatedAt">;

const planInputSchema = z.object({
  listingUrl: z.string().trim().url().max(2000).refine((value) => new URL(value).protocol === "https:"),
  company: z.string().trim().max(120),
  title: z.string().trim().max(160),
  team: z.string().trim().max(160),
  locations: z.string().trim().max(500),
  description: z.string().trim().max(80_000),
  keywords: z.array(z.string().trim().max(200)).max(100),
  themes: z.array(z.string().trim().max(1000)).max(100),
  overview: z.string().trim().max(20_000),
});

type Row = Record<string, unknown>;

function mapApplication(row: Row): Application {
  return {
    id: String(row.id), company: String(row.company), title: String(row.title),
    team: String(row.team || ""), locations: String(row.locations || ""),
    listingUrl: String(row.listing_url), jobDescription: String(row.job_description || ""),
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
  return {
    id: String(row.id), listingUrl: String(row.listing_url),
    company: String(row.company || ""), title: String(row.title || ""),
    team: String(row.team || ""), locations: String(row.locations || ""),
    description: String(row.description || ""),
    keywords: JSON.parse(String(row.keywords_json || "[]")) as string[],
    themes: JSON.parse(String(row.themes_json || "[]")) as string[],
    overview: String(row.overview || ""),
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
      keywords_json TEXT NOT NULL DEFAULT '[]', themes_json TEXT NOT NULL DEFAULT '[]',
      overview TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX applications_date_idx ON applications(applied_date DESC, created_at DESC);
    CREATE INDEX plans_updated_idx ON plans(updated_at DESC);
    PRAGMA user_version = 3;
  `);
}

function migrate(db: DatabaseSync): boolean {
  const version = Number((db.prepare("PRAGMA user_version").get() as Row).user_version);
  if (version === 3) return false;
  if (version !== 1 && version !== 2) throw new Error("This is not a supported PM Application Tracker database.");
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
  db.exec(`
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
  return true;
}

function validate(db: DatabaseSync) {
  const check = (db.prepare("PRAGMA quick_check").get() as Row).quick_check;
  if (check !== "ok") throw new Error("The selected database failed its integrity check.");
  const version = Number((db.prepare("PRAGMA user_version").get() as Row).user_version);
  if (version !== 1 && version !== 2 && version !== 3) throw new Error("This is not a supported PM Application Tracker database.");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Row[];
  const names = new Set(tables.map((row) => String(row.name)));
  if (!names.has("applications") || !names.has("resumes")) {
    throw new Error("This file does not contain a PM Application Tracker database.");
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
      await copyFile(scratch, target);
      await this.open(target);
    } finally { await unlink(scratch).catch(() => undefined); }
  }

  async copyCurrentTo(filePath: string) {
    const target = path.resolve(filePath);
    if (existsSync(target)) throw new Error("That file already exists. Choose another name.");
    await this.writeQueue;
    if (this.dirty) throw new Error("Retry the pending save before copying this database.");
    await this.assertCurrentFile();
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(this.filePath, target);
    await this.open(target);
    return this.status;
  }

  async open(filePath: string) {
    if (this.dirty) throw new Error("Save the pending database changes before switching files.");
    const target = path.resolve(filePath);
    if (!(await stat(target).catch(() => null))?.isFile()) throw new Error("The database file could not be found. Wait for cloud sync, then try again.");
    const checkDb = new DatabaseSync(target, { readOnly: true });
    try { validate(checkDb); } finally { checkDb.close(); }
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
    await this.weeklyBackup();
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
      await this.weeklyBackup().catch((error) => console.error("Weekly backup failed", error));
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

  private async weeklyBackup() {
    await mkdir(this.backupsPath, { recursive: true });
    const prefix = createHash("sha256").update(this.filePath.toLowerCase()).digest("hex").slice(0, 12);
    const backups = (await readdir(this.backupsPath)).filter((name) => name.startsWith(prefix + "-") && name.endsWith(".sqlite")).sort().reverse();
    const newest = backups[0] ? await stat(path.join(this.backupsPath, backups[0])).catch(() => null) : null;
    if (!newest || Date.now() - newest.mtimeMs >= 7 * 24 * 60 * 60 * 1000) {
      const name = `${prefix}-${new Date().toISOString().slice(0, 10)}.sqlite`;
      const target = path.join(this.backupsPath, name);
      if (!existsSync(target)) await copyFile(this.filePath, target);
    }
    for (const old of backups.slice(12)) await unlink(path.join(this.backupsPath, old)).catch(() => undefined);
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
    const item: ApplicationInput = { ...parsed.data, team: parsed.data.team || "", locations: parsed.data.locations || "" };
    const resultId = id || randomUUID();
    await this.mutate((db) => {
      if (item.resumeId && !db.prepare("SELECT id FROM resumes WHERE id = ?").get(item.resumeId)) throw new Error("The selected resume could not be found.");
      const now = new Date().toISOString();
      if (id) {
        const previous = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as Row | undefined;
        if (!previous) throw new Error("Application not found.");
        const sameSource = String(previous.resume_id || "") === item.resumeId &&
          String(previous.listing_url) === item.listingUrl &&
          String(previous.job_description || "") === item.jobDescription;
        const sameScore = (previous.match_strength === null ? null : Number(previous.match_strength)) === item.matchStrength;
        const preserveAnalysis = sameSource && sameScore;
        const score = !sameSource && previous.match_analyzed_at && sameScore ? null : item.matchStrength;
        const result = db.prepare(`UPDATE applications SET company = ?, title = ?, team = ?, locations = ?,
          listing_url = ?, job_description = ?, applied_date = ?, match_strength = ?,
          match_notes = ?, match_analyzed_at = ?, resume_id = ?, status = ?, updated_at = ?
          WHERE id = ?`).run(item.company, item.title, item.team, item.locations, item.listingUrl,
          item.jobDescription, item.appliedDate, score,
          preserveAnalysis ? String(previous.match_notes || "") : "",
          preserveAnalysis ? String(previous.match_analyzed_at || "") : "",
          item.resumeId || null, item.status, now, id);
        if (!result.changes) throw new Error("Application not found.");
      } else {
        db.prepare(`INSERT INTO applications (id, company, title, team, locations, listing_url,
          job_description, applied_date, match_strength, resume_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(resultId, item.company, item.title,
          item.team, item.locations, item.listingUrl, item.jobDescription, item.appliedDate,
          item.matchStrength, item.resumeId || null, item.status, now, now);
      }
    });
    return this.findApplication(resultId)!;
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
    await this.mutate((db) => {
      const result = db.prepare(`UPDATE applications SET match_strength = ?, match_notes = ?,
        match_analyzed_at = ?, job_description = ?, updated_at = ? WHERE id = ? AND updated_at = ?`)
        .run(score, notes.trim().slice(0, 4000), new Date().toISOString(), jobDescription,
          new Date().toISOString(), id, expectedUpdatedAt);
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

  async savePlan(input: PlanInput, id?: string): Promise<Plan> {
    const parsed = planInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Check the plan fields and enter a public HTTPS job listing link.");
    const item = parsed.data;
    const resultId = id || randomUUID();
    await this.mutate((db) => {
      const now = new Date().toISOString();
      const fields = [item.listingUrl, item.company, item.title, item.team,
        item.locations, item.description, JSON.stringify(item.keywords.filter(Boolean)),
        JSON.stringify(item.themes.filter(Boolean)), item.overview];
      if (id) {
        const result = db.prepare(`UPDATE plans SET listing_url = ?, company = ?, title = ?, team = ?,
          locations = ?, description = ?, keywords_json = ?, themes_json = ?, overview = ?,
          updated_at = ? WHERE id = ?`).run(...fields, now, id);
        if (!result.changes) throw new Error("Plan not found.");
      } else {
        db.prepare(`INSERT INTO plans (id, listing_url, company, title, team, locations,
          description, keywords_json, themes_json, overview, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(resultId, ...fields, now, now);
      }
    });
    return this.getPlan(resultId)!;
  }

  async deletePlan(id: string) {
    await this.mutate((db) => {
      const result = db.prepare("DELETE FROM plans WHERE id = ?").run(id);
      if (!result.changes) throw new Error("Plan not found.");
    });
  }

  close() { this.db?.close(); this.db = null; }
}

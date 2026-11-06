import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { BOARDS_MISSING_FILE, boardInputSchema, type Board, type BoardInput, type BoardScan, type BoardListings, type BoardListingFilter } from "../shared/boards";
import { boardSearchKey } from "../lib/board-identity";
import { writeProfileSettings } from "./settings-persistence";

export function boardsCompanionPath(applications: string) {
  const file = path.parse(path.resolve(applications));
  return path.join(file.dir, file.name + "-boards.sqlite");
}

function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
async function exists(file: string) {
  try { await lstat(file); return true; }
  catch (error) { if (missing(error)) return false; throw error; }
}

const APPLICATION_ID = 0x5a424259;
type Row = Record<string, unknown>;
type Recovery = { target: string; working: string; hash: string };
function hasDetails(db: DatabaseSync) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='board_job_details'").get()); }
function watchKey(url: string, instructions: string) {
  const link = boardSearchKey(url);
  return instructions ? JSON.stringify([link, instructions]) : link;
}
async function hash(file: string) { return createHash("sha256").update(await readFile(file)).digest("hex"); }
function contents(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    validate(db);
    return JSON.stringify([db.prepare("SELECT * FROM boards ORDER BY id").all(),
      db.prepare("SELECT * FROM board_checks ORDER BY id").all(),
      db.prepare("SELECT * FROM board_jobs ORDER BY board_id,revision,identity").all(),
      hasDetails(db) ? db.prepare("SELECT * FROM board_job_details ORDER BY board_id,revision,identity").all() : [],
      db.prepare("SELECT * FROM sqlite_sequence ORDER BY name").all()]);
  } finally { db.close(); }
}
function validate(db: DatabaseSync) {
  if (db.prepare("PRAGMA application_id").get()?.application_id !== APPLICATION_ID ||
      ![1, 2].includes(Number(db.prepare("PRAGMA user_version").get()?.user_version)) ||
      db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") {
    throw new Error("Choose a Zebby Boards database. Your Applications database is a separate file.");
  }
  const v2 = db.prepare("PRAGMA user_version").get()?.user_version === 2;
  db.prepare("SELECT id,company,url,search_key,revision,last_check_id,reviewed_through,last_checked_at,last_attempt_at,total_count,error,created_at" +
    (v2 ? ",instructions" : "") + " FROM boards LIMIT 0").all();
  db.prepare("SELECT id,board_id,revision,checked_at,status,pages,total,provider,model,error FROM board_checks LIMIT 0").all();
  db.prepare("SELECT board_id,revision,identity,url,first_check_id,last_check_id" + (v2 ? ",matches" : "") + " FROM board_jobs LIMIT 0").all();
  if (hasDetails(db)) db.prepare("SELECT board_id,revision,identity,title,department,location,check_id FROM board_job_details LIMIT 0").all();
}
function schema(db: DatabaseSync) {
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 2;
    CREATE TABLE boards (id TEXT PRIMARY KEY, company TEXT NOT NULL, url TEXT NOT NULL,
      search_key TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 1, instructions TEXT NOT NULL DEFAULT '',
      last_check_id INTEGER NOT NULL DEFAULT 0, reviewed_through INTEGER NOT NULL DEFAULT 0,
      last_checked_at TEXT NOT NULL DEFAULT '', last_attempt_at TEXT NOT NULL DEFAULT '',
      total_count INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE board_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL, checked_at TEXT NOT NULL, status TEXT NOT NULL,
      pages INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '');
    CREATE TABLE board_jobs (board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL, identity TEXT NOT NULL, url TEXT NOT NULL,
      first_check_id INTEGER NOT NULL, last_check_id INTEGER NOT NULL, matches INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(board_id, revision, identity));
    CREATE INDEX board_jobs_unreviewed ON board_jobs(board_id, revision, first_check_id);`);
}

function upgradeWorkingCopy(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("PRAGMA user_version").get()?.user_version === 1) db.exec(`ALTER TABLE boards ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
      ALTER TABLE board_jobs ADD COLUMN matches INTEGER NOT NULL DEFAULT 1;
      PRAGMA user_version = 2;`);
    // Optional metadata keeps the existing v2 history readable by older apps.
    // A check ID prevents an older client's later scan from showing stale text.
    db.exec(`CREATE TABLE IF NOT EXISTS board_job_details (board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL, identity TEXT NOT NULL, title TEXT NOT NULL, department TEXT NOT NULL, location TEXT NOT NULL,
      check_id INTEGER NOT NULL, PRIMARY KEY(board_id,revision,identity)); COMMIT;`);
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export class BoardsStore {
  private db: DatabaseSync | null = null;
  private target = "";
  private companion = "";
  private hasRecoveryCopy = false;
  private fileMissing = false;
  private savedCopyPath = "";
  private working = "";
  private sourceHash = "";
  private dirty = false;
  private queue: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private recoveryFile: string;
  constructor(private readonly profile: string) { this.recoveryFile = path.join(profile, "boards-pending.json"); }
  get generation() { return this.epoch; }
  get status() { return { filePath: this.target, filename: this.target ? path.basename(this.target) : "", dirty: this.dirty,
    expectedPath: this.companion, canRecover: this.hasRecoveryCopy || this.fileMissing && Boolean(this.working),
    fileMissing: this.fileMissing, savedCopyPath: this.savedCopyPath }; }
  private database() { if (!this.db) throw new Error("Choose a Boards database first."); return this.db; }
  private async current() {
    const source = await stat(this.target).catch(error => { if (missing(error)) return null; throw error; });
    this.fileMissing = !source;
    if (this.fileMissing) throw new Error(BOARDS_MISSING_FILE);
    if (!source?.isFile()) throw new Error("The Boards location is not a file. Restore your Boards file, then retry.");
    if (await hash(this.target) !== this.sourceHash) throw new Error(this.dirty
      ? "The Boards database changed outside this app. Save a recovery copy before reopening it."
      : "The Boards database changed outside this app. Open it again before making changes.");
  }
  private async flush() {
    await this.current();
    try { await backup(this.database(), this.target); }
    catch { throw new Error("Boards changes are saved on this computer. Use Retry save when OneDrive is ready."); }
    this.sourceHash = await hash(this.target);
    await unlink(this.recoveryFile).catch(error => { if (error.code !== "ENOENT") throw error; });
    this.dirty = false;
  }
  private write<T>(action: (db: DatabaseSync) => T): Promise<T> {
    const run = this.queue.then(async () => {
      if (this.dirty) throw new Error("Use Retry save for the Boards database before making another change.");
      await this.current();
      const db = this.database();
      // Write the recovery marker before committing locally. A crash after the
      // commit must never cause startup to replace pending data with cloud data.
      await writeProfileSettings(this.recoveryFile, JSON.stringify({ target: this.target, working: this.working, hash: this.sourceHash }));
      db.exec("BEGIN IMMEDIATE");
      let result: T;
      try { result = action(db); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); await unlink(this.recoveryFile); throw error; }
      this.dirty = true;
      await this.flush();
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  private workingPath(file: string) {
    const resolved = path.resolve(file);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    return path.join(this.profile, `boards-${createHash("sha256").update(key).digest("hex")}.sqlite`);
  }
  async readyToSwitch() {
    await this.queue;
    if (this.dirty) throw new Error("Save pending Boards changes or save a recovery copy before switching workspaces.");
  }
  async openCompanion(applications: string) {
    await this.readyToSwitch();
    await this.close();
    this.target = ""; this.working = ""; this.sourceHash = ""; this.savedCopyPath = "";
    this.fileMissing = false; this.hasRecoveryCopy = false;
    const target = boardsCompanionPath(applications);
    this.companion = target;
    this.hasRecoveryCopy = await exists(this.workingPath(target));
    this.fileMissing = !await exists(target);
    if (!this.fileMissing || await exists(this.recoveryFile)) {
      await this.open(target);
    } else if (this.hasRecoveryCopy) {
      throw new Error(BOARDS_MISSING_FILE);
    } else {
      try { await this.create(target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await this.open(target);
      }
    }
    this.hasRecoveryCopy = false;
  }
  async createMissingCompanion(applications: string) {
    await this.readyToSwitch();
    const target = boardsCompanionPath(applications);
    if (target !== this.companion || !this.fileMissing) {
      throw new Error("Retry opening your Boards file before creating a new one.");
    }
    if (await exists(this.recoveryFile)) {
      throw new Error("Save a copy of your pending Boards changes before creating a new file.");
    }
    // Sync may restore the file after the recovery screen appeared.
    if (await exists(target)) { await this.openCompanion(applications); return; }
    const working = this.workingPath(target);
    let savedCopyPath = "";
    if (await exists(working)) {
      const file = path.parse(target);
      savedCopyPath = path.join(file.dir, file.name + "-saved-" + randomUUID().slice(0, 8) + ".sqlite");
      // Keep the original bytes even if the cached file cannot be opened.
      // An archive failure stops creation before the working copy is replaced.
      await copyFile(working, savedCopyPath, constants.COPYFILE_EXCL);
      this.savedCopyPath = savedCopyPath;
    }
    try { await this.create(target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await this.openCompanion(applications);
    }
    this.hasRecoveryCopy = false;
    this.fileMissing = false;
    this.savedCopyPath = savedCopyPath;
  }
  async importHistory(sourceFile: string) {
    await this.readyToSwitch();
    if (!this.target || path.resolve(sourceFile) === this.target) throw new Error("Choose a different saved Boards file to import.");
    const generation = this.epoch;
    const source = new DatabaseSync(sourceFile, { readOnly: true });
    try {
      source.exec("BEGIN");
      validate(source);
      await this.write(db => {
        if (generation !== this.epoch || db.prepare("SELECT 1 FROM boards LIMIT 1").get()) {
          throw new Error("Boards history can only be imported into an empty companion file.");
        }
        for (const table of ["boards", "board_checks", "board_jobs", ...(hasDetails(source) ? ["board_job_details"] : [])]) {
          const sourceColumns = new Set(source.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
          const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => String(row.name)).filter(name => sourceColumns.has(name));
          const fields = columns.join(",");
          const insert = db.prepare(`INSERT INTO ${table} (${fields}) VALUES (${columns.map(() => "?").join(",")})`);
          for (const row of source.prepare(`SELECT ${fields} FROM ${table}`).iterate()) insert.run(...columns.map(name => row[name]));
        }
        const sequence = source.prepare("SELECT seq FROM sqlite_sequence WHERE name='board_checks'").get();
        if (sequence) {
          db.prepare("DELETE FROM sqlite_sequence WHERE name='board_checks'").run();
          db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('board_checks',?)").run(sequence.seq);
        }
      });
    } finally { source.close(); }
  }
  async create(file: string) {
    await this.queue;
    if (this.dirty) throw new Error("Save pending Boards changes before creating another database.");
    await mkdir(this.profile, { recursive: true });
    const temporary = path.join(this.profile, `boards-new-${randomUUID()}.sqlite`);
    const db = new DatabaseSync(temporary);
    try { schema(db); } finally { db.close(); }
    try { await copyFile(temporary, file, constants.COPYFILE_EXCL); }
    finally { await unlink(temporary); }
    await this.open(file);
  }
  async open(file: string) {
    await this.queue;
    if (this.dirty) throw new Error("Save pending Boards changes or save a recovery copy before opening another database.");
    await mkdir(this.profile, { recursive: true });
    const target = path.resolve(file);
    let recovered: Recovery | null = null;
    try { recovered = JSON.parse(await readFile(this.recoveryFile, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The pending Boards save could not be read. Keep the local recovery files."); }
    const working = this.workingPath(target);
    if (recovered && (recovered.target !== target || recovered.working !== working || !/^[a-f0-9]{64}$/.test(recovered.hash))) {
      throw new Error("Open the Boards database with pending changes first: " + recovered.target);
    }
    const incoming = recovered ? working : working + ".incoming";
    let sourceHash = recovered?.hash || "";
    if (!recovered) {
      await copyFile(target, incoming);
      sourceHash = await hash(incoming);
      if (sourceHash !== await hash(target)) { await unlink(incoming); throw new Error("The Boards database changed while opening. Wait for OneDrive and try again."); }
    }
    const check = new DatabaseSync(incoming, { readOnly: true });
    try { validate(check); } finally { check.close(); }
    // SQLite backup changes header counters. Compare records, not file bytes,
    // when recovering a crash after publication but before marker removal.
    if (recovered) {
      const publishedHash = await hash(target).catch(() => "");
      let publishedContents: string | null = null;
      try { if (publishedHash && publishedHash !== sourceHash) publishedContents = contents(target); }
      catch { /* A damaged cloud file must not prevent local recovery. */ }
      if (publishedContents !== null && publishedContents === contents(working)) {
        await unlink(this.recoveryFile); sourceHash = publishedHash; recovered = null;
      }
    }
    this.db?.close();
    if (incoming !== working) { await copyFile(incoming, working); await unlink(incoming); }
    this.db = new DatabaseSync(working);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA busy_timeout = 3000;");
    upgradeWorkingCopy(this.db);
    this.target = target; this.working = working; this.sourceHash = sourceHash; this.dirty = Boolean(recovered); this.epoch++;
    this.fileMissing = !await exists(target);
  }
  async recoverOnStartup(): Promise<boolean> {
    let marker: Recovery;
    try { marker = JSON.parse(await readFile(this.recoveryFile, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    if (typeof marker?.target !== "string") throw new Error("The pending Boards save could not be read.");
    await this.open(marker.target); return true;
  }
  async retrySave() {
    const run = this.queue.then(async () => { if (this.dirty) await this.flush(); });
    this.queue = run.catch(() => undefined); return run;
  }
  async saveRecoveryCopy(file: string) {
    const run = this.queue.then(async () => {
      // Exclusive creation prevents the recovery action from overwriting a database.
      const working = this.working || (this.companion && this.workingPath(this.companion));
      if (!working) throw new Error("There is no Boards recovery copy for this workspace.");
      const checked = new DatabaseSync(working, { readOnly: true });
      try { validate(checked); } finally { checked.close(); }
      await copyFile(working, file, constants.COPYFILE_EXCL);
      if (this.dirty) {
        await unlink(this.recoveryFile);
        this.dirty = false;
      }
      return file;
    });
    this.queue = run.catch(() => undefined); return run;
  }
  list(): Board[] {
    if (!this.db) return [];
    return (this.db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM board_jobs j WHERE j.board_id=b.id AND j.revision=b.revision
      AND j.matches=1 AND j.first_check_id>b.reviewed_through) AS new_count,
      (SELECT COUNT(*) FROM board_jobs j WHERE j.board_id=b.id AND j.revision=b.revision AND j.last_check_id=b.last_check_id) AS checked_count
      FROM boards b ORDER BY b.created_at,b.id`).all() as Row[]).map(row => ({
      id: String(row.id), company: String(row.company), url: String(row.url), revision: Number(row.revision),
      instructions: String(row.instructions),
      lastCheckedAt: String(row.last_checked_at), lastAttemptAt: String(row.last_attempt_at), lastCheckId: Number(row.last_check_id),
      newCount: Number(row.new_count), totalCount: Number(row.total_count), checkedCount: Number(row.checked_count), error: String(row.error), createdAt: String(row.created_at),
    }));
  }
  get(id: string) { const board = this.list().find(board => board.id === id); if (!board) throw new Error("This board is no longer available."); return board; }
  listings(id: string, checkId: number, filter: BoardListingFilter = "matches", offset = 0): BoardListings {
    if (typeof id !== "string" || !Number.isSafeInteger(checkId) || checkId <= 0 || !["matches", "new", "all"].includes(filter) ||
        !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new Error("Choose a completed board check.");
    const board = this.get(id), db = this.database();
    if (board.lastCheckId !== checkId) throw new Error("This board has a newer check. Open its listings again.");
    const reviewed = Number(db.prepare("SELECT reviewed_through FROM boards WHERE id=?").get(id)!.reviewed_through);
    const where = "j.board_id=? AND j.revision=? AND " + (filter === "new" ? "j.matches=1 AND j.first_check_id>" + reviewed
      : "j.last_check_id=" + checkId + (filter === "matches" ? " AND j.matches=1" : ""));
    const total = Number(db.prepare("SELECT COUNT(*) AS count FROM board_jobs j WHERE " + where).get(id, board.revision)!.count);
    const rows = db.prepare(`SELECT j.*,d.title,d.department,d.location FROM board_jobs j LEFT JOIN board_job_details d
      ON d.board_id=j.board_id AND d.revision=j.revision AND d.identity=j.identity AND d.check_id=j.last_check_id
      WHERE ${where} ORDER BY LOWER(COALESCE(d.title,j.url)),j.identity LIMIT 50 OFFSET ?`).all(id, board.revision, offset);
    return { checkId, total, offset, listings: rows.map(row => ({ key: String(row.identity), url: String(row.url), matches: Boolean(row.matches),
      title: row.title ? String(row.title) : undefined, department: row.department ? String(row.department) : undefined,
      location: row.location ? String(row.location) : undefined, current: row.last_check_id === checkId,
      unread: Boolean(row.matches) && Number(row.first_check_id) > reviewed })) };
  }
  knownMatches(id: string, revision: number) {
    const rows = this.database().prepare("SELECT identity,matches FROM board_jobs WHERE board_id=? AND revision=?").all(id, revision);
    return new Map(rows.map(row => [String(row.identity), Boolean(row.matches)]));
  }
  async add(inputs: BoardInput[]) {
    if (!inputs.length || inputs.length > 100) throw new Error("Add between 1 and 100 board links.");
    const values = inputs.map(input => boardInputSchema.parse(input));
    return this.write(db => values.map(input => {
      const instructions = input.instructions ?? "", key = watchKey(input.url, instructions);
      if (db.prepare("SELECT id FROM boards WHERE search_key=?").get(key)) throw new Error("This board link is already saved with the same tracking instructions.");
      const id = randomUUID();
      db.prepare("INSERT INTO boards(id,company,url,search_key,instructions,created_at) VALUES (?,?,?,?,?,?)")
        .run(id, input.company, input.url, key, instructions, new Date().toISOString()); return id;
    }));
  }
  async update(id: string, input: BoardInput) {
    const value = boardInputSchema.parse(input);
    return this.write(db => {
      const board = this.get(id), instructions = value.instructions ?? board.instructions;
      const key = watchKey(value.url, instructions), changed = watchKey(board.url, board.instructions) !== key;
      if (db.prepare("SELECT id FROM boards WHERE search_key=? AND id<>?").get(key, id)) throw new Error("This board link is already saved with the same tracking instructions.");
      db.prepare("UPDATE boards SET company=?,url=?,search_key=?,instructions=? WHERE id=?").run(value.company, value.url, key, instructions, id);
      if (changed) db.prepare("UPDATE boards SET revision=revision+1,last_check_id=0,reviewed_through=0,last_checked_at='',last_attempt_at='',total_count=0,error='' WHERE id=?").run(id);
    });
  }
  async remove(id: string) { return this.write(db => { db.prepare("DELETE FROM boards WHERE id=?").run(id); }); }
  async reviewed(id: string, through: number) {
    return this.write(db => {
      const board = this.get(id);
      if (!Number.isSafeInteger(through) || through < 0 || through > board.lastCheckId) throw new Error("Refresh Boards before marking this check reviewed.");
      const check = db.prepare("SELECT id FROM board_checks WHERE id=? AND board_id=? AND revision=? AND status='complete'").get(through, id, board.revision);
      if (!check) throw new Error("This check belongs to an earlier board link. Refresh Boards.");
      db.prepare("UPDATE boards SET reviewed_through=MAX(reviewed_through,?) WHERE id=?").run(through, id);
    });
  }
  async complete(id: string, revision: number, generation: number, scan: BoardScan) {
    return this.write(db => {
      const board = this.get(id);
      if (this.epoch !== generation || board.revision !== revision) throw new Error("The board or database changed during this check. Check it again.");
      const now = new Date().toISOString();
      const jobs = [...new Map(scan.jobs.map(job => [job.key, job])).values()];
      const total = jobs.filter(job => job.matches).length;
      const check = Number(db.prepare("INSERT INTO board_checks(board_id,revision,checked_at,status,pages,total,provider,model) VALUES (?,?,?,'complete',?,?,?,?)")
        .run(id, revision, now, scan.pages, total, scan.provider, scan.model).lastInsertRowid);
      const insert = db.prepare(`INSERT INTO board_jobs(board_id,revision,identity,url,first_check_id,last_check_id,matches) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(board_id,revision,identity) DO UPDATE SET url=excluded.url,last_check_id=excluded.last_check_id`);
      const detail = db.prepare(`INSERT INTO board_job_details(board_id,revision,identity,title,department,location,check_id) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(board_id,revision,identity) DO UPDATE SET title=excluded.title,department=excluded.department,location=excluded.location,check_id=excluded.check_id`);
      for (const job of jobs) {
        insert.run(id, revision, job.key, job.url, check, check, Number(job.matches));
        detail.run(id, revision, job.key, (job.title || "").slice(0, 300), (job.department || "").slice(0, 200), (job.location || "").slice(0, 300), check);
      }
      db.prepare("UPDATE boards SET last_check_id=?,last_checked_at=?,last_attempt_at=?,total_count=?,error='',reviewed_through=CASE WHEN last_check_id=0 THEN ? ELSE reviewed_through END WHERE id=?")
        .run(check, now, now, total, check, id);
    });
  }
  async failed(id: string, revision: number, generation: number, message: string) {
    return this.write(db => {
      const board = this.get(id);
      if (this.epoch !== generation || board.revision !== revision) return;
      const now = new Date().toISOString(), error = message.slice(0, 1000);
      db.prepare("INSERT INTO board_checks(board_id,revision,checked_at,status,error) VALUES(?,?,?,'failed',?)").run(id, revision, now, error);
      db.prepare("UPDATE boards SET last_attempt_at=?,error=? WHERE id=?").run(now, error, id);
    });
  }
  async close() { await this.queue; this.db?.close(); this.db = null; this.epoch++; }
}

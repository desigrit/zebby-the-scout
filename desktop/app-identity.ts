import { mkdirSync } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const APP_NAME = "Zebby";
const LEGACY_NAMES = ["pm-application-tracker", "PM Application Tracker"];
const ARTIFACTS = ["settings.json", "PM Applications.sqlite", "Zebby Applications.sqlite", "working", "Backups", "Logs"];

type AppIdentity = {
  setName(name: string): void;
  getPath(name: "userData" | "appData"): string;
  setPath(name: "userData" | "sessionData", folder: string): void;
};
export type ApplicationProfile = { folder: string; legacyFolders: string[] };

// Acquire the existing single-instance lock first, then pin paths before ready.
// The package identity and lock location stay stable across older releases.
export function configureApplicationProfile(app: AppIdentity, isolatedFolder?: string): ApplicationProfile {
  const previous = app.getPath("userData"), root = app.getPath("appData");
  const custom = ![...LEGACY_NAMES, APP_NAME].includes(path.basename(previous));
  const folder = path.resolve(isolatedFolder || (custom ? previous : path.join(root, APP_NAME)));
  const legacyFolders = isolatedFolder || custom ? [] : [...new Set([previous, ...LEGACY_NAMES.map((name) => path.join(root, name))])]
    .filter((candidate) => path.resolve(candidate) !== folder);
  mkdirSync(path.join(folder, "Session"), { recursive: true });
  app.setPath("userData", folder);
  app.setPath("sessionData", path.join(folder, "Session"));
  app.setName(APP_NAME);
  return { folder, legacyFolders };
}

async function exists(file: string) {
  try { return await lstat(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function writeJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2), "utf8"); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}

function relativeInside(folder: string, file: string) {
  const relative = path.relative(folder, file);
  return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? relative : "";
}

// Moving models on the same volume avoids duplicating gigabytes during upgrade.
// Existing destination files win, including an in-progress download.
export async function migrateModelFolder(source: string, target: string) {
  if (path.resolve(source) === path.resolve(target) || !(await exists(source))) return;
  if (!(await lstat(source)).isDirectory()) throw new Error("The previous model folder is unavailable.");
  await mkdir(path.dirname(target), { recursive: true });
  if (!(await exists(target))) {
    try { await rename(source, target); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      await mkdir(target);
    }
  }
  if (!(await lstat(target)).isDirectory()) throw new Error("The Zebby model folder is unavailable.");
  for (const item of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, item.name), to = path.join(target, item.name);
    if (item.isDirectory()) await migrateModelFolder(from, to);
    else if (!(await exists(to))) {
      try { await rename(from, to); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await cp(from, to); await unlink(from);
      }
    }
  }
}

export async function migrateApplicationProfile({ folder, legacyFolders }: ApplicationProfile) {
  if (!legacyFolders.length) return;
  const journalPath = path.join(folder, "profile-migration.json");
  let journal: { source: string; complete: boolean } | null = null;
  if (await exists(journalPath)) {
    journal = JSON.parse(await readFile(journalPath, "utf8"));
    if (!journal || !legacyFolders.includes(journal.source) || typeof journal.complete !== "boolean") {
      throw new Error("The profile migration could not be resumed. Your previous files are preserved.");
    }
  }
  let source = journal && !journal.complete ? journal.source : "";
  const current = (await Promise.all(ARTIFACTS.slice(0, 3).map((name) => exists(path.join(folder, name))))).some(Boolean);
  if (!source && !journal?.complete && !current) {
    for (const candidate of legacyFolders) {
      if ((await Promise.all(ARTIFACTS.map((name) => exists(path.join(candidate, name))))).some(Boolean)) {
        source = candidate; break;
      }
    }
  }
  if (source) {
    const staging = path.join(folder, `.profile-migration-${randomUUID()}`);
    await writeJson(journalPath, { source, complete: false });
    await mkdir(staging);
    try {
      const artifacts = new Set(ARTIFACTS);
      const oldSettings = path.join(source, "settings.json");
      let settings: Record<string, unknown> | null = null;
      if (await exists(oldSettings)) {
        settings = JSON.parse(await readFile(oldSettings, "utf8"));
        if (!settings || Array.isArray(settings) || typeof settings !== "object") throw new Error("The previous settings could not be read.");
        if (typeof settings.databasePath === "string") {
          const relative = relativeInside(source, settings.databasePath);
          if (relative) { artifacts.add(relative.split(path.sep)[0]); settings.databasePath = path.join(folder, relative); }
        }
      }
      // Preserve original records and logs for recovery. Chromium gets a fresh Session folder.
      for (const name of artifacts) {
        if (name === "Models" || !(await exists(path.join(source, name)))) continue;
        await cp(path.join(source, name), path.join(staging, name), { recursive: true });
      }
      if (settings) await writeFile(path.join(staging, "settings.json"), JSON.stringify(settings, null, 2), "utf8");
      for (const name of artifacts) {
        if (name === "settings.json" || !(await exists(path.join(staging, name)))) continue;
        await cp(path.join(staging, name), path.join(folder, name), { recursive: true });
      }
      if (settings) await rename(path.join(staging, "settings.json"), path.join(folder, "settings.json"));
      await migrateModelFolder(path.join(source, "Models"), path.join(folder, "Models"));
      await writeJson(journalPath, { source, complete: true });
    } finally {
      if (!relativeInside(folder, staging)) throw new Error("The migration staging folder is invalid.");
      await rm(staging, { recursive: true, force: true });
    }
  }
  for (const candidate of legacyFolders) await migrateModelFolder(path.join(candidate, "Models"), path.join(folder, "Models"));
}

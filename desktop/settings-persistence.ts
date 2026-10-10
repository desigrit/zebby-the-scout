import { open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Use only for the local settings profile, never for a user-selected database.
export async function writeProfileSettings(filename: string, text: string) {
  const temporary = path.join(path.dirname(filename), `.settings-${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(text, "utf8"); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => undefined); }
}

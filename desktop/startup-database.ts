import { stat } from "node:fs/promises";

/** Restore a chosen or existing local database without creating a file at startup. */
export async function restoreStartupDatabase(
  selectedPath: string | undefined,
  localPaths: string[],
  open: (filePath: string) => Promise<void>,
): Promise<string | null> {
  if (selectedPath) {
    // A missing cloud file must remain selected, so reconnecting can retry it.
    // Never hide that failure by switching to a different, empty workspace.
    await open(selectedPath);
    return selectedPath;
  }
  for (const filePath of new Set(localPaths)) {
    let exists = false;
    try { exists = (await stat(filePath)).isFile(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (!exists) continue;
    await open(filePath);
    return filePath;
  }
  return null;
}

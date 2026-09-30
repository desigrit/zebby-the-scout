import { execFile } from "node:child_process";
import { freemem, totalmem } from "node:os";
import { promisify } from "node:util";

const execute = promisify(execFile);

export function reclaimableMacMemory(stats: string): number | null {
  const pageSize = Number(stats.match(/page size of (\d+) bytes/)?.[1]);
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) return null;
  let pages = 0;
  // Inactive and speculative pages can be reclaimed. Active, wired,
  // compressed, and purgeable counters are not added or double counted.
  for (const counter of ["free", "inactive", "speculative"]) {
    const match = stats.match(new RegExp(`^Pages ${counter}:\\s+(\\d+)\\.?\\s*$`, "m"));
    if (!match) return null;
    pages += Number(match[1]);
  }
  const bytes = pages * pageSize;
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
}

async function readMacMemoryStats(): Promise<string> {
  const { stdout } = await execute("/usr/bin/vm_stat", [], {
    timeout: 2000, maxBuffer: 32 * 1024, encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

export async function availableModelMemory(options: {
  platform?: NodeJS.Platform;
  freeBytes?: number;
  totalBytes?: number;
  readMacStats?: () => Promise<string>;
} = {}): Promise<number> {
  const free = options.freeBytes ?? freemem();
  if ((options.platform ?? process.platform) !== "darwin") return free;
  // Node 22's Darwin free-memory API omits reclaimable cached pages.
  const stats = await (options.readMacStats ?? readMacMemoryStats)().catch(() => "");
  const available = reclaimableMacMemory(stats);
  return available === null ? free : Math.min(available, options.totalBytes ?? totalmem());
}

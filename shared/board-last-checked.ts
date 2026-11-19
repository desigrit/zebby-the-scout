const HOUR_MS = 60 * 60 * 1000;

/** Use elapsed time for recent checks, keeping older dates in the computer's locale. */
export function boardLastCheckedLabel(value: string, now = Date.now()): string {
  const checked = new Date(value);
  if (!Number.isFinite(checked.getTime())) return "Never checked";
  const elapsed = Math.max(0, now - checked.getTime());
  if (elapsed < HOUR_MS) return "Just now";
  if (elapsed < 24 * HOUR_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  return checked.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

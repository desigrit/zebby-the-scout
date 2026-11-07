const filterKeys = new Set(["category", "location", "search"]);
export function isLyftCareers(url: URL) {
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
    url.hostname === "www.lyft.com" && /^\/careers\/?$/.test(url.pathname);
}

// Lyft writes filters after #openings when a visitor has followed that anchor,
// but restores only location.search on a fresh visit. Preserve either form.
// Its dropdown values are URI encoded before the query serializer encodes them.
export function lyftFilters(url: URL): Map<string, string> | null {
  if (!isLyftCareers(url) || url.hash && !/^#openings(?:\?|$)/.test(url.hash)) return null;
  const fragment = new URLSearchParams(url.hash.includes("?") ? url.hash.slice(url.hash.indexOf("?") + 1) : "");
  const filters = new Map<string, string>();
  for (const [key, value] of [...url.searchParams, ...fragment]) {
    if (/^utm_/i.test(key)) continue;
    if (!filterKeys.has(key) || !value) return null;
    let decoded: string;
    try { decoded = decodeURIComponent(value.toLowerCase()); } catch { return null; }
    // Identical repeated values agree; conflicting values are ambiguous.
    if (filters.has(key) && filters.get(key) !== decoded) return null;
    filters.set(key, decoded);
  }
  return filters;
}

export function lyftListingUrl(value: string, id: number): string {
  const url = new URL(value);
  const careerpuck = url.hostname === "app.careerpuck.com" && url.pathname === `/job-board/lyft/job/${id}`;
  const greenhouse = ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname) && url.pathname === `/lyft/jobs/${id}`;
  if (url.protocol !== "https:" || url.username || url.password || url.port || !careerpuck && !greenhouse ||
      url.hash || url.searchParams.getAll("gh_jid").some(value => value !== String(id)) ||
      [...url.searchParams.keys()].some(key => key !== "gh_jid" && key !== "gh_src" && !/^utm_/i.test(key))) {
    throw new Error("Lyft's job feed returned a listing outside the saved board.");
  }
  return url.href;
}

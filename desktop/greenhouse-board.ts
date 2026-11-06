// Greenhouse's embedded and hosted job boards share posting IDs and pagination.
export function greenhouseBoard(url: URL): string {
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) return "";
  if (/^\/embed\/job_board\/?$/.test(url.pathname)) {
    const tokens = url.searchParams.getAll("for");
    return tokens.length === 1 && /^[\w-]+$/.test(tokens[0]) ? tokens[0] : "";
  }
  const token = url.pathname.match(/^\/([\w-]+)\/?$/)?.[1] || "";
  return ["embed", "jobs", "users"].includes(token) ? "" : token;
}

// Pagination may change, but the company and all search filters must stay put.
// Greenhouse redirects its old hostname to job-boards.greenhouse.io.
export function sameGreenhouseSearch(current: string, original: string): boolean {
  try {
    const key = (value: string) => {
      const url = new URL(value);
      if (!greenhouseBoard(url)) return null;
      url.searchParams.delete("page");
      url.searchParams.delete("validityToken");
      url.searchParams.sort();
      return url.pathname.replace(/\/$/, "") + url.search + url.hash;
    };
    const saved = key(original);
    return saved !== null && key(current) === saved;
  } catch { return false; }
}

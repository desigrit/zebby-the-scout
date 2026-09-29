export const APPLICATION_HOST = "applications424760.raunakoberoi.com";

export function isAllowedHost(hostHeader: string | null, development = false): boolean {
  const host = hostHeader?.trim().toLowerCase() || "";
  if (host === APPLICATION_HOST) return true;
  if (!development) return false;
  return /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host);
}

export function isAllowedHost(
  hostHeader: string | null,
  development = false,
  azureHostname = process.env.WEBSITE_DEFAULT_HOSTNAME || process.env.WEBSITE_HOSTNAME,
): boolean {
  const host = hostHeader?.trim().toLowerCase() || "";
  if (azureHostname && host === azureHostname.trim().toLowerCase()) return true;
  if (!development) return false;
  return /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host);
}

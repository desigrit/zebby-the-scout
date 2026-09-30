import path from "node:path";

export function localModelFolder(userData: string, platform: NodeJS.Platform, localAppData?: string) {
  if (platform === "win32" && localAppData && path.win32.isAbsolute(localAppData)) {
    return path.win32.join(localAppData, "PM Application Tracker", "Models");
  }
  return path.join(userData, "Models");
}

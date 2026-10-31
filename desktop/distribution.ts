import { readFileSync } from "node:fs";
import path from "node:path";

export type DistributionChannel = "direct" | "store";
export const STORE_UPDATES_URI = "ms-windows-store://downloadsandupdates";

export function distributionChannel(platform: string, windowsStore: boolean | undefined, builtChannel?: string): DistributionChannel {
  return platform === "win32" && (windowsStore === true || builtChannel === "store") ? "store" : "direct";
}

export function requireDirectUpdates(channel: DistributionChannel) {
  if (channel === "store") throw new Error("Updates are managed by Microsoft Store.");
}

export function readStorePackageFamily(resources: string): string {
  const source = readFileSync(path.join(resources, "store-identity.json"), "utf8");
  if (source.length > 16_384) throw new Error("The Microsoft Store package identity is invalid. Reinstall Zebby from the Store.");
  const identity: unknown = JSON.parse(source);
  const family = identity && typeof identity === "object" ? (identity as Record<string, unknown>).packageFamilyName : undefined;
  if (typeof family !== "string" || !/^[A-Za-z0-9.-]{3,50}_[a-z0-9]{13}$/.test(family)) {
    throw new Error("The Microsoft Store package identity is invalid. Reinstall Zebby from the Store.");
  }
  return family;
}

function inside(root: string, value: string) {
  const normalize = (input: string) => path.win32.resolve(input.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "")).toLowerCase();
  const relative = path.win32.relative(normalize(root), normalize(value));
  return !relative || relative !== ".." && !relative.startsWith("..\\") && !path.win32.isAbsolute(relative);
}

export function storeDataPaths(options: { packageFamilyName?: string; localAppData?: string; home: string; documents: string; isolatedFolder?: string }) {
  // QA can exercise the Store channel without using or creating real profiles.
  if (options.isolatedFolder) {
    const root = path.resolve(options.isolatedFolder);
    return { packageRoot: path.join(root, "Package"), profile: path.join(root, "Package", "LocalState", "Zebby"),
      recovery: path.join(root, "Home", "Zebby", "Recovery"), database: path.join(root, "Documents", "Zebby", "Zebby Applications.sqlite") };
  }
  if (!options.localAppData || !path.win32.isAbsolute(options.localAppData) ||
    !path.win32.isAbsolute(options.home) || !path.win32.isAbsolute(options.documents) ||
    !options.packageFamilyName || !/^[A-Za-z0-9.-]{3,50}_[a-z0-9]{13}$/.test(options.packageFamilyName)) {
    throw new Error("Zebby could not find its Microsoft Store data folders.");
  }
  const packageRoot = path.win32.join(options.localAppData, "Packages", options.packageFamilyName);
  const recovery = path.win32.join(options.home, "Zebby", "Recovery");
  const database = path.win32.join(options.documents, "Zebby", "Zebby Applications.sqlite");
  if (inside(packageRoot, recovery) || inside(packageRoot, database) || inside(recovery, database)) {
    throw new Error("Choose a Documents folder outside Zebby's Store data folder to keep databases after uninstall.");
  }
  return { packageRoot, profile: path.win32.join(packageRoot, "LocalState", "Zebby"), recovery, database };
}

export function requireDurableDatabase(filePath: string, packageRoot: string) {
  if (inside(packageRoot, path.win32.resolve(filePath))) {
    throw new Error("Choose a database outside Zebby's Store data folder so it stays available after uninstall.");
  }
}

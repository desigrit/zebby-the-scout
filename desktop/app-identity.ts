import { mkdir } from "node:fs/promises";

export const APP_NAME = "Zebby";

type AppIdentity = {
  setName(name: string): void;
  getPath(name: "userData"): string;
  setPath(name: "userData", folder: string): void;
};

export async function preserveApplicationProfile(app: AppIdentity) {
  // Resolve the profile exactly as earlier releases did before changing the
  // display name. Existing database selection, API keys, and Mac models stay here.
  app.setName("PM Application Tracker");
  const folder = app.getPath("userData");
  await mkdir(folder, { recursive: true });
  app.setPath("userData", folder);
  app.setName(APP_NAME);
  return folder;
}

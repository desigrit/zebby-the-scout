import { headers } from "next/headers";
import { isAllowedHost } from "./host-access";

// Keep the original workspace key so existing records stay in the same workspace.
export const WORKSPACE_ID = "applications424760.raunakoberoi.com";

export async function getWorkspaceId(): Promise<string | null> {
  const requestHeaders = await headers();
  return isAllowedHost(requestHeaders.get("host"), process.env.NODE_ENV === "development")
    ? WORKSPACE_ID
    : null;
}

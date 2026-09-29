import { headers } from "next/headers";
import { APPLICATION_HOST, isAllowedHost } from "./host-access";

// All visitors to the chosen hostname intentionally share this workspace.
export const WORKSPACE_ID = APPLICATION_HOST;

export async function getWorkspaceId(): Promise<string | null> {
  const requestHeaders = await headers();
  return isAllowedHost(requestHeaders.get("host"), process.env.NODE_ENV === "development")
    ? WORKSPACE_ID
    : null;
}

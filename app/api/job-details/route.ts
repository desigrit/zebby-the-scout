import { z } from "zod";
import { getWorkspaceId } from "../../../lib/workspace-access";
import { fetchJobPosting } from "../../../lib/job-fetch";
import { jsonError } from "../../../lib/server-data";

const inputSchema = z.object({ url: z.string().trim().url().max(2000) });

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError("Enter a valid job listing link.", 400);
  try {
    const { details } = await fetchJobPosting(input.data.url, new URL(request.url).hostname.toLowerCase());
    return Response.json({ details }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "The listing could not be read.", 400);
  }
}

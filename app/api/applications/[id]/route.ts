import { getWorkspaceId } from "../../../../lib/workspace-access";
import {
  applicationInputSchema,
  queryDatabase,
  findApplication,
  jsonError,
  ownsResume,
} from "../../../../lib/server-data";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);
  const { id } = await context.params;
  const input = applicationInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError("Check the application fields and try again.", 400);

  try {
    if (!(await ownsResume(workspaceId, input.data.resumeId))) {
      return jsonError("Choose an uploaded resume.", 400);
    }
    const item = input.data;
    const rows = await queryDatabase<{ id: string }>(`UPDATE applications SET
        company = $1, title = $2, team = COALESCE($3, team), locations = COALESCE($4, locations),
        listing_url = $5, applied_date = $6, match_strength = $7,
        resume_id = $8, status = $9, updated_at = $10
        WHERE id = $11 AND user_id = $12 RETURNING id`, [
        item.company, item.title, item.team ?? null, item.locations ?? null, item.listingUrl, item.appliedDate,
        item.matchStrength, item.resumeId, item.status, new Date().toISOString(),
        id, workspaceId,
      ]);
    if (!rows.length) return jsonError("Application not found.", 404);
    return Response.json({ application: await findApplication(workspaceId, id) });
  } catch (error) {
    console.error("Failed to update application", error);
    return jsonError("Application could not be updated. Try again.", 503);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);
  const { id } = await context.params;
  try {
    const rows = await queryDatabase<{ id: string }>(
      "DELETE FROM applications WHERE id = $1 AND user_id = $2 RETURNING id", [id, workspaceId],
    );
    if (!rows.length) return jsonError("Application not found.", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete application", error);
    return jsonError("Application could not be deleted. Try again.", 503);
  }
}

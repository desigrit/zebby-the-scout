import { getWorkspaceId } from "../../../lib/workspace-access";
import {
  applicationInputSchema,
  queryDatabase,
  findApplication,
  jsonError,
  mapApplication,
  ownsResume,
} from "../../../lib/server-data";

export async function GET() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);

  try {
    const rows = await queryDatabase<Record<string, unknown>>(`SELECT a.*, r.filename AS resume_name
        FROM applications a JOIN resumes r ON r.id = a.resume_id
        WHERE a.user_id = $1
        ORDER BY a.applied_date DESC, a.created_at DESC`, [workspaceId]);
    return Response.json({ applications: rows.map(mapApplication) });
  } catch (error) {
    console.error("Failed to load applications", error);
    return jsonError("Applications could not be loaded. Try again.", 503);
  }
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);

  const input = applicationInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError("Check the application fields and try again.", 400);

  try {
    if (!(await ownsResume(workspaceId, input.data.resumeId))) {
      return jsonError("Choose an uploaded resume.", 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const item = input.data;
    await queryDatabase(`INSERT INTO applications
        (id, user_id, company, title, team, locations, listing_url, applied_date,
         match_strength, resume_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, [
        id, workspaceId, item.company, item.title, item.team ?? "", item.locations ?? "", item.listingUrl,
        item.appliedDate, item.matchStrength, item.resumeId, item.status, now, now,
      ]);
    return Response.json({ application: await findApplication(workspaceId, id) }, { status: 201 });
  } catch (error) {
    console.error("Failed to add application", error);
    return jsonError("Application could not be saved. Try again.", 503);
  }
}

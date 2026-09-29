import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  applicationInputSchema,
  database,
  findApplication,
  jsonError,
  ownsResume,
} from "../../../../lib/server-data";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to update an application.", 401);
  const { id } = await context.params;
  const input = applicationInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError("Check the application fields and try again.", 400);

  try {
    if (!(await ownsResume(user.userId, input.data.resumeId))) {
      return jsonError("Choose one of your uploaded resumes.", 400);
    }
    const item = input.data;
    const result = await database()
      .prepare(`UPDATE applications SET
        company = ?, title = ?, team = COALESCE(?, team), locations = COALESCE(?, locations),
        listing_url = ?, applied_date = ?, match_strength = ?,
        resume_id = ?, status = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`)
      .bind(
        item.company, item.title, item.team ?? null, item.locations ?? null, item.listingUrl, item.appliedDate,
        item.matchStrength, item.resumeId, item.status, new Date().toISOString(),
        id, user.userId,
      )
      .run();
    if (!result.meta.changes) return jsonError("Application not found.", 404);
    return Response.json({ application: await findApplication(user.userId, id) });
  } catch (error) {
    console.error("Failed to update application", error);
    return jsonError("Application could not be updated. Try again.", 503);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to delete an application.", 401);
  const { id } = await context.params;
  try {
    const result = await database()
      .prepare("DELETE FROM applications WHERE id = ? AND user_id = ?")
      .bind(id, user.userId)
      .run();
    if (!result.meta.changes) return jsonError("Application not found.", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete application", error);
    return jsonError("Application could not be deleted. Try again.", 503);
  }
}

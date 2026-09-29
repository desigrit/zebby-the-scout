import { getChatGPTUser } from "../../chatgpt-auth";
import {
  applicationInputSchema,
  database,
  findApplication,
  jsonError,
  mapApplication,
  ownsResume,
} from "../../../lib/server-data";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to view applications.", 401);

  try {
    const rows = await database()
      .prepare(`SELECT a.*, r.filename AS resume_name
        FROM applications a JOIN resumes r ON r.id = a.resume_id
        WHERE a.user_id = ?
        ORDER BY a.applied_date DESC, a.created_at DESC`)
      .bind(user.userId)
      .all<Record<string, unknown>>();
    return Response.json({ applications: rows.results.map(mapApplication) });
  } catch (error) {
    console.error("Failed to load applications", error);
    return jsonError("Applications could not be loaded. Try again.", 503);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to add an application.", 401);

  const input = applicationInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError("Check the application fields and try again.", 400);

  try {
    if (!(await ownsResume(user.userId, input.data.resumeId))) {
      return jsonError("Choose one of your uploaded resumes.", 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const item = input.data;
    await database()
      .prepare(`INSERT INTO applications
        (id, user_id, company, title, team, locations, listing_url, applied_date,
         match_strength, resume_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, user.userId, item.company, item.title, item.team ?? "", item.locations ?? "", item.listingUrl,
        item.appliedDate, item.matchStrength, item.resumeId, item.status, now, now,
      )
      .run();
    return Response.json({ application: await findApplication(user.userId, id) }, { status: 201 });
  } catch (error) {
    console.error("Failed to add application", error);
    return jsonError("Application could not be saved. Try again.", 503);
  }
}

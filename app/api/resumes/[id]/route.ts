import { getChatGPTUser } from "../../../chatgpt-auth";
import { database, jsonError, resumeBucket } from "../../../../lib/server-data";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to download a resume.", 401);
  const { id } = await context.params;
  try {
    const resume = await database()
      .prepare(`SELECT filename, content_type, object_key
        FROM resumes WHERE id = ? AND user_id = ?`)
      .bind(id, user.userId)
      .first<{ filename: string; content_type: string; object_key: string }>();
    if (!resume) return jsonError("Resume not found.", 404);
    const object = await resumeBucket().get(resume.object_key);
    if (!object) return jsonError("Resume file is unavailable.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": resume.content_type,
        "Content-Disposition": `attachment; filename="resume"; filename*=UTF-8''${encodeURIComponent(resume.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to download resume", error);
    return jsonError("Resume could not be downloaded. Try again.", 503);
  }
}

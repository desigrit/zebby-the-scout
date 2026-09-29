import { getWorkspaceId } from "../../../../lib/workspace-access";
import { jsonError, queryDatabase, resumeContainer } from "../../../../lib/server-data";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);
  const { id } = await context.params;
  try {
    const rows = await queryDatabase<{ filename: string; content_type: string; object_key: string }>(
      `SELECT filename, content_type, object_key FROM resumes WHERE id = $1 AND user_id = $2`,
      [id, workspaceId],
    );
    const resume = rows[0];
    if (!resume) return jsonError("Resume not found.", 404);
    const object = await resumeContainer().getBlockBlobClient(resume.object_key).download();
    if (!object.readableStreamBody) return jsonError("Resume file is unavailable.", 404);
    return new Response(object.readableStreamBody as unknown as ReadableStream, {
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

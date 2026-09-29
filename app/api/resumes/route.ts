import { getWorkspaceId } from "../../../lib/workspace-access";
import { jsonError, mapResume, queryDatabase, resumeContainer } from "../../../lib/server-data";

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export async function GET() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);
  try {
    const rows = await queryDatabase<Record<string, unknown>>(`SELECT id, filename, content_type, size, created_at
      FROM resumes WHERE user_id = $1 ORDER BY created_at DESC`, [workspaceId]);
    return Response.json({ resumes: rows.map(mapResume) });
  } catch (error) {
    console.error("Failed to load resumes", error);
    return jsonError("Resumes could not be loaded. Try again.", 503);
  }
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return jsonError("Not found.", 404);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("Choose a resume file.", 400);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = ALLOWED_TYPES[extension];
  if (!contentType) return jsonError("Upload a PDF, DOCX, or DOC file.", 400);
  if (file.size === 0 || file.size > MAX_RESUME_BYTES) {
    return jsonError("Resume files must be between 1 byte and 10 MB.", 400);
  }
  const filename = file.name.replace(/[\r\n\\/]/g, " ").trim().slice(0, 180);
  if (!filename) return jsonError("Give the resume file a name.", 400);
  try {
    const id = crypto.randomUUID();
    const objectKey = `${id}.${extension}`;
    const container = resumeContainer();
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(objectKey);
    await blob.uploadData(Buffer.from(await file.arrayBuffer()), {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    const now = new Date().toISOString();
    try {
      await queryDatabase(`INSERT INTO resumes
        (id, user_id, filename, content_type, size, object_key, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, workspaceId, filename, contentType, file.size, objectKey, now]);
    } catch (error) {
      await blob.deleteIfExists().catch(() => undefined);
      throw error;
    }
    return Response.json({ resume: { id, filename, contentType, size: file.size, createdAt: now } }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload resume", error);
    return jsonError("Resume could not be uploaded. Try again.", 503);
  }
}

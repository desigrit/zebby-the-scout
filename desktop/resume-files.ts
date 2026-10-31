import { mkdir, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DesktopStore } from "./store";

export async function materializeTailoredResume(store: DesktopStore, documents: string, planId: string, format: "docx" | "pdf") {
  const tailored = store.getPlan(planId)?.tailoredResume;
  if (!tailored || !["docx", "pdf"].includes(format)) throw new Error("Create a tailored resume first.");
  const item = store.getResume(tailored[format].id);
  if (!item) throw new Error("This tailored resume could not be found in your database.");
  const folder = path.join(documents, "Zebby", "Tailored resumes", tailored.docx.id);
  const filename = path.basename(item.resume.filename).replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ");
  if (!filename.toLowerCase().endsWith(`.${format}`)) throw new Error("The tailored file format is invalid.");
  await mkdir(folder, { recursive: true });
  const target = path.join(folder, filename);
  try { await writeFile(target, item.data, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await lstat(target);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("Choose a regular folder for your tailored resumes.");
    // A user may have edited the exported Word file. Never overwrite that work.
  }
  return target;
}

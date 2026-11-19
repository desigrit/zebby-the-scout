import { readPdfReference, tailorPdfReference } from "./resume-pdf-reference.ts";
import { readWordReference, tailorWordReference } from "./resume-word-reference.ts";
import type { ResumeBlock } from "../shared/tailored-resume";

export async function readResumeReference(filename: string, data: Uint8Array) {
  if (/\.pdf$/i.test(filename)) return readPdfReference(data);
  if (/\.docx$/i.test(filename)) return readWordReference(data);
  throw new Error("Upload a PDF or Word (.docx) reference resume to keep its formatting.");
}
export type ResumeReference = Awaited<ReturnType<typeof readResumeReference>>;

export async function exportTailoredReference(reference: ResumeReference, blocks: ResumeBlock[], signal: AbortSignal,
  printWord: (data: Uint8Array, signal: AbortSignal) => Promise<Uint8Array>) {
  signal.throwIfAborted();
  if (reference.kind === "pdf") {
    const output = await tailorPdfReference(reference, blocks);
    signal.throwIfAborted();
    return output;
  }
  const result = await tailorWordReference(reference, blocks);
  signal.throwIfAborted();
  const pdf = await printWord(result.docx, signal);
  signal.throwIfAborted();
  return { ...result, pdf };
}

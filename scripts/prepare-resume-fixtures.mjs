import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { referencePdf, referenceWord } from "../tests/fixtures/reference-resume.mjs";
import { readResumeReference } from "../desktop/resume-reference.ts";
import { tailorPdfReference } from "../desktop/resume-pdf-reference.ts";
import { tailorWordReference } from "../desktop/resume-word-reference.ts";
import { applyResumeEdits } from "../shared/tailored-resume.ts";

const root = path.resolve("qa-output/tailored-resume");
await mkdir(root, { recursive: true });
const pdf = await referencePdf(), word = await referenceWord();
const pdfReference = await readResumeReference("Reference.pdf", pdf);
const wordReference = await readResumeReference("Reference.docx", word);
const pdfBlock = pdfReference.blocks.find(b => b.editable && b.text.startsWith("Built a weekly"));
const wordBlock = wordReference.blocks.find(b => b.editable && b.text.includes("activation"));
const revisedPdf = await tailorPdfReference(pdfReference, applyResumeEdits(pdfReference.blocks, {
  edits: [{ id: pdfBlock.id, text: pdfBlock.text.replace("Built a weekly", "Led a weekly") }],
}));
const revisedWord = await tailorWordReference(wordReference, applyResumeEdits(wordReference.blocks, {
  edits: [{ id: wordBlock.id, text: wordBlock.text.replace("Led customer research", "Drove customer research") }],
}));
await Promise.all(Object.entries({
  "pdf-reference.pdf": pdf, "pdf-tailored.pdf": revisedPdf.pdf, "pdf-tailored.docx": revisedPdf.docx,
  "word-reference.docx": word, "word-tailored.docx": revisedWord.docx,
}).map(([file, data]) => writeFile(path.join(root, file), data)));
console.log("Reference layout fixtures prepared.");

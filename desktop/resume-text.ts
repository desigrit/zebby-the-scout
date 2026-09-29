import { extractText } from "unpdf";
import * as mammoth from "mammoth";
import WordExtractor from "word-extractor";

export async function extractResumeText(filename: string, data: Uint8Array): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase();
  let text = "";
  try {
    if (extension === "pdf") {
      const result = await extractText(new Uint8Array(data), { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else if (extension === "docx") {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(data) })).value;
    } else if (extension === "doc") {
      const document = await new WordExtractor().extract(Buffer.from(data));
      text = document.getBody();
    } else {
      throw new Error("Use a PDF, DOCX, or DOC resume for local analysis.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Use a PDF")) throw error;
    throw new Error("The resume text could not be read locally. Try another PDF or Word file.");
  }
  const cleaned = text.replace(/\u0000/g, "").replace(/\r/g, "")
    .split("\n").map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean).join("\n").trim();
  if (!cleaned) {
    throw new Error("This resume has no readable text. For scanned PDFs, use a text-based file or OpenAI analysis.");
  }
  return cleaned.slice(0, 60_000);
}

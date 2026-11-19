import { readFile } from "node:fs/promises";
import path from "node:path";

export const resumeFontDirectory = typeof __dirname === "string"
  ? path.join(__dirname, "renderer", "resume-fonts") : path.resolve("public", "resume-fonts");

export async function readResumeFonts() {
  return Promise.all(["Regular", "Bold", "Italic", "BoldItalic"].map(async style => ({
    style, data: new Uint8Array(await readFile(path.join(resumeFontDirectory, `Carlito-${style}.ttf`))),
  })));
}

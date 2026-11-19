import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const resumeFontDirectory = typeof __dirname === "string"
  ? path.join(__dirname, "renderer", "resume-fonts") : fileURLToPath(new URL("../public/resume-fonts", import.meta.url));

export async function readResumeFonts() {
  return Promise.all(["Regular", "Bold", "Italic", "BoldItalic"].map(async style => ({
    style, data: new Uint8Array(await readFile(path.join(resumeFontDirectory, `Carlito-${style}.ttf`))),
  })));
}

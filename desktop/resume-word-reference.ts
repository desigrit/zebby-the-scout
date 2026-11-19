import JSZip from "jszip";
import { load } from "cheerio";
import type { ResumeBlock } from "../shared/tailored-resume";
import { readResumeBlocks } from "./tailored-resume.ts";
import { compactText, mapEditedTokens } from "./resume-rich-text.ts";

export type WordReference = {
  kind: "docx"; data: Uint8Array; blocks: ResumeBlock[];
  paragraphs: { part: string; index: number }[];
};

export async function readWordReference(data: Uint8Array): Promise<WordReference> {
  // Reuse the bounded reader and its referenced-header validation.
  const blocks = await readResumeBlocks("reference.docx", data);
  const zip = await JSZip.loadAsync(data);
  const $ = load(await zip.file("word/document.xml")!.async("string"), { xml: true });
  const rel = zip.file("word/_rels/document.xml.rels");
  const relationships = load(rel ? await rel.async("string") : "<Relationships/>", { xml: true });
  const parts = (kind: string) => [...new Set($(`w\\:${kind}Reference`).map((_, node) => {
    const id = $(node).attr("r:id");
    const target = relationships("Relationship").filter((_, r) => relationships(r).attr("Id") === id).attr("Target")!;
    return target.startsWith("/") ? target.slice(1) : `word/${target}`;
  }).get())];
  const paragraphs: WordReference["paragraphs"] = [];
  for (const part of [...parts("header"), "word/document.xml", ...parts("footer")]) {
    const xml = load(await zip.file(part)!.async("string"), { xml: true });
    xml("w\\:p").each((index, p) => {
      const text = xml(p).find("w\\:t,w\\:tab,w\\:br").map((_, n) => n.tagName === "w:t" ? xml(n).text() : " ").get().join("");
      if (compactText(text)) {
        const id = paragraphs.length;
        paragraphs.push({ part, index });
        // Fields, drawings and revision markup must remain untouched.
        if (part !== "word/document.xml" || xml(p).find("w\\:fldChar,w\\:instrText,w\\:drawing,w\\:del,w\\:ins").length) blocks[id].editable = false;
      }
    });
  }
  if (paragraphs.length !== blocks.length) throw new Error("This Word file could not be mapped to its original layout.");
  return { kind: "docx", data: new Uint8Array(data), blocks, paragraphs };
}

export async function tailorWordReference(reference: WordReference, revised: ResumeBlock[]) {
  const zip = await JSZip.loadAsync(reference.data);
  const parts = new Map<string, ReturnType<typeof load>>();
  let kept = 0, changed = 0;
  for (const block of revised) {
    const source = reference.blocks[block.id];
    if (block.text === source.text) continue;
    const { part, index } = reference.paragraphs[block.id];
    if (!parts.has(part)) parts.set(part, load(await zip.file(part)!.async("string"), { xml: true }));
    const $ = parts.get(part)!, paragraph = $("w\\:p").eq(index);
    const nodes = paragraph.find("w\\:t").toArray();
    // Keep the native tab stops, breaks, links, lists, frames and section styles.
    // Rewriting across a tab or manual line break can destroy its layout.
    if (paragraph.find("w\\:tab,w\\:br").length) { kept++; continue; }
    const raw = nodes.map(n => $(n).text()).join("");
    const leading = raw.match(/^\s*[•●▪◦‣*\-]\s+/)?.[0] ?? "";
    const text = leading + block.text;
    const links = paragraph.find("w\\:hyperlink").map((_, n) => $(n).find("w\\:t").text()).get();
    if (links.some(link => !text.includes(link))) { kept++; continue; }
    const ends: number[] = []; let length = 0;
    for (const node of nodes) { length += $(node).text().length; ends.push(length); }
    const output = nodes.map(() => "");
    for (const token of mapEditedTokens(raw, text)) {
      const slot = Math.max(0, ends.findIndex(end => token.source < end));
      output[slot] += token.text;
    }
    nodes.forEach((node, n) => { $(node).text(output[n]); $(node).attr("xml:space", "preserve"); });
    changed++;
  }
  if (!changed) return { docx: new Uint8Array(reference.data), kept };
  for (const [part, $] of parts) zip.file(part, $.xml());
  return { docx: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), kept };
}

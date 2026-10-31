import JSZip from "jszip";
import { load } from "cheerio";
import { getDocumentProxy } from "unpdf";
import { extractResumeText } from "./resume-text.ts";
import type { ResumeBlock } from "../shared/tailored-resume";

const section = /^(?:(?:professional|work|relevant|selected|additional|technical|core)\s+)?(?:summary|profile|experience|employment|education|skills|expertise|competencies|projects|certifications?|qualifications|achievements|accomplishments|awards|publications|volunteering|interests|languages)(?:\s+(?:history|experience|summary|and\s+\w+))?\s*:?$/i;
const contact = /@|https?:\/\/|www\.|linkedin\.com|github\.com|(?:\+?\d[\d ().-]{7,}\d)/i;
const date = /\b(?:19|20)\d{2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4}\b/i;

export async function readResumeBlocks(filename: string, data: Uint8Array): Promise<ResumeBlock[]> {
  let lines: { text: string; bullet?: boolean; heading?: boolean }[] = [];
  if (/\.docx$/i.test(filename)) {
    const zip = await JSZip.loadAsync(data), document = zip.file("word/document.xml");
    if (!document) throw new Error("This Word file has no readable document.");
    // Contact details often live in Word headers. Read referenced parts once,
    // including tables, without repeating the header on every generated page.
    let totalXml = 0;
    const readXml = async (name: string) => {
      const part = zip.file(name);
      if (!part) throw new Error("This Word file is missing part of its content.");
      const xml = await part.async("string"); totalXml += xml.length;
      if (totalXml > 4_000_000) throw new Error("This Word document is too large to tailor.");
      return load(xml, { xml: true });
    };
    const body = await readXml("word/document.xml");
    const relationships = zip.file("word/_rels/document.xml.rels");
    const rels = relationships ? load(await relationships.async("string"), { xml: true }) : null;
    const parts = (kind: "header" | "footer") => [...new Set(body(`w\\:${kind}Reference`).map((_, node) => {
      const id = body(node).attr("r:id");
      const rel = rels?.("Relationship").filter((_, item) => rels(item).attr("Id") === id);
      const target = rel?.attr("Target") || "";
      if (rel?.attr("TargetMode") === "External" || !/^(?:\/word\/)?(?:header|footer)[^/\\]*\.xml$/.test(target)) {
        throw new Error("This Word file has an unreadable header or footer.");
      }
      return target.startsWith("/") ? target.slice(1) : `word/${target}`;
    }).get())];
    const readParagraphs = ($: ReturnType<typeof load>) => {
      $("w\\:p").each((_, p) => {
        const text = $(p).find("w\\:t,w\\:tab,w\\:br").map((_, node) => node.tagName === "w:t" ? $(node).text() : " ").get().join("");
        const style = $(p).find("w\\:pStyle").attr("w:val") || "";
        if (text.trim()) lines.push({ text, bullet: $(p).find("w\\:numPr").length > 0 || /listparagraph/i.test(style), heading: /^heading/i.test(style) });
      });
    };
    for (const part of parts("header")) readParagraphs(await readXml(part));
    readParagraphs(body);
    for (const part of parts("footer")) readParagraphs(await readXml(part));
  } else if (/\.pdf$/i.test(filename)) {
    const document = await getDocumentProxy(new Uint8Array(data));
    try {
      if (document.numPages > 30) throw new Error("Choose a resume with 30 pages or fewer.");
      for (let p = 1; p <= document.numPages; p++) {
        const page = await document.getPage(p), content = await page.getTextContent();
        const pageLines: { text: string; x: number; y: number; size: number; bottom: number }[] = [];
        const items = content.items.filter(item => "str" in item).filter(item => item.str.trim())
          .sort((a, b) => Math.abs(a.transform[5] - b.transform[5]) > 3 ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4]);
        for (const item of items) {
          const previous = pageLines.at(-1), x = item.transform[4], y = item.transform[5], size = item.height || Math.abs(item.transform[3]);
          if (previous && Math.abs(previous.y - y) <= 3) {
            previous.text += ` ${item.str.trim()}`; previous.size = Math.max(previous.size, size);
          } else pageLines.push({ text: item.str.trim(), x, y, bottom: y, size });
        }
        const paragraphs: typeof pageLines = [];
        for (const next of pageLines) {
          const previous = paragraphs.at(-1);
          const metadata = (text: string) => section.test(text) || date.test(text) || contact.test(text);
          if (previous && Math.abs(previous.size - next.size) < 1 && previous.bottom > next.y && previous.bottom - next.y < next.size * 1.65
            && next.x >= previous.x - 2 && next.x <= previous.x + 22
            && !/^[•●▪◦‣*\-]\s+/.test(next.text) && !metadata(next.text) && !metadata(previous.text)
            && !/[.!?:;]$/.test(previous.text)) {
            previous.text += ` ${next.text}`; previous.bottom = next.y;
          } else paragraphs.push({ ...next });
        }
        lines.push(...paragraphs.map(({ text }) => ({ text })));
      }
    } finally { await document.loadingTask.destroy(); }
  } else lines = (await extractResumeText(filename, data)).split("\n").map(text => ({ text }));
  const clean = lines.map(line => ({ ...line, text: line.text.replace(/[\u0000\r]/g, "").replace(/\s+/g, " ").trim() })).filter(line => line.text);
  if (!clean.length || clean.reduce((n, line) => n + line.text.length, 0) < 30) throw new Error("Could not read your resume. Use a text-based PDF or Word file.");
  if (clean.length > 800 || clean.reduce((n, line) => n + line.text.length, 0) > 60_000) throw new Error("This resume is too long to tailor. Use a shorter copy.");
  return clean.map((line, id) => {
    const bullet = line.bullet || /^[•●▪◦‣*\-]\s+/.test(line.text);
    const style = id === 0 ? "name" : contact.test(line.text) && !bullet ? "contact" : line.heading || section.test(line.text) ? "heading" : bullet ? "bullet" : "paragraph";
    return { id, text: line.text.replace(/^[•●▪◦‣*\-]\s+/, ""), style,
      editable: ["paragraph", "bullet"].includes(style) && line.text.length >= 55 && !date.test(line.text) && !contact.test(line.text) };
  });
}

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
export function resumeHtml(blocks: ResumeBlock[]) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    @page { size: Letter; margin: .6in .65in; } *{box-sizing:border-box} body{margin:0;font:10.5pt/1.3 Arial,Helvetica,sans-serif;color:#252525}
    p{margin:0 0 5pt;white-space:pre-wrap;overflow-wrap:anywhere;orphans:2;widows:2}.name{font-size:21pt;font-weight:700;margin-bottom:4pt;break-after:avoid}
    .contact{font-size:9.5pt;color:#484848;margin-bottom:4pt;break-after:avoid}.heading{font-size:11pt;font-weight:700;margin-top:13pt;margin-bottom:6pt;border-bottom:1px solid #d4d4d4;padding-bottom:3pt;break-after:avoid}
    .bullet{padding-left:12pt;position:relative}.bullet::before{content:"•";position:absolute;left:0}
  </style></head><body>${blocks.map(block => `<p class="${block.style}">${escape(block.text)}</p>`).join("")}</body></html>`;
}

export async function resumeDocx(blocks: ResumeBlock[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="21"/><w:color w:val="252525"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="312" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  const paragraphs = blocks.map(block => {
    const heading = block.style === "heading", name = block.style === "name", contact = block.style === "contact";
    const props = heading ? '<w:keepNext/><w:spacing w:before="260" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="3" w:color="D4D4D4"/></w:pBdr>'
      : name || contact ? '<w:keepNext/><w:spacing w:after="80"/>' : block.style === "bullet" ? '<w:ind w:left="240" w:hanging="240"/>' : "";
    return `<w:p><w:pPr>${props}</w:pPr><w:r><w:rPr>${name || heading ? '<w:b/>' : ""}<w:sz w:val="${name ? 42 : heading ? 22 : contact ? 19 : 21}"/></w:rPr><w:t xml:space="preserve">${block.style === "bullet" ? "•  " : ""}${escape(block.text)}</w:t></w:r></w:p>`;
  }).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="864" w:right="936" w:bottom="864" w:left="936" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export function tailoredBaseName(original: string, listingUrl: string, planId: string) {
  let jobId = "";
  try {
    const url = new URL(listingUrl);
    jobId = ["gh_jid", "jobId", "job_id", "requisitionId"].map(key => url.searchParams.get(key)).find(Boolean) ||
      url.pathname.split("/").findLast(part => /^(?:\d{4,}|[a-z]*\d{4,}[a-z\d-]*|[\da-f]{8}-[\da-f-]{27})$/i.test(part)) || "";
  } catch { /* An internal plan ID also works for manually entered listings. */ }
  const safe = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\u2014/g, "-").replace(/[. ]+$/g, "").trim();
  return `${safe(original.replace(/\.[^.]+$/, "")).slice(0, 100) || "Resume"} - ${safe(jobId || planId.slice(0, 8)).slice(0, 60)} - tailored`;
}

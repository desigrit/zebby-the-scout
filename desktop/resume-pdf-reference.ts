import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import type { ResumeBlock } from "../shared/tailored-resume";
import { resumeDocx } from "./tailored-resume.ts";
import { compactText, mapEditedTokens, xmlEscape as esc } from "./resume-rich-text.ts";
import { readResumeFonts } from "./resume-fonts.ts";

type Color = [number, number, number];
type Font = { name: string; data?: Uint8Array; standard?: StandardFonts; metrics?: PDFFont; bold: boolean; italic: boolean; parsed?: ReturnType<typeof fontkit.create> };
type Run = { text: string; x: number; y: number; width: number; size: number; font: string; color: Color; start: number; end: number; link?: string; retained?: boolean };
type Line = { runs: Run[]; x: number; y: number; right: number; size: number; text: string; bodyX: number };
type Paragraph = { id: number; lines: Line[]; page: number };
type Command = { start: number; end: number; insertAt: number; prefix: string };
type Operation = { start: number; end: number; advance: number; color: Color; matrix: number[] };
type Rule = { x: number; y: number; width: number; height: number; color: Color };
type Page = { width: number; height: number; content: string; commands: Command[]; operations: Operation[]; paragraphs: Paragraph[]; rules: Rule[] };
export type PdfReference = { kind: "pdf"; data: Uint8Array; blocks: ResumeBlock[]; pages: Page[]; fonts: Map<string, Font> };
const unsupported = () => new Error("This PDF's layout cannot be preserved safely. Upload the Word (.docx) version of your resume.");
const canonical = (s: string) => s.normalize("NFKC").replace(/[\s\u0000\u00ad]/g, "");
const bullet = /^[•●▪◦‣*\-]\s*/;
const section = /^(?:(?:professional|work|relevant|selected|additional|technical|core|honors?\s+and)\s+)?(?:summary|profile|experience|employment|education|skills|expertise|competencies|projects|certifications?|qualifications|achievements|accomplishments|awards|publications|volunteering|interests|languages)\s*:?$/i;

// A small PDF content lexer, not a regex over binary streams. Strings, hex
// strings, comments and arrays can contain operator-looking text.
export function pdfTextCommands(content: string): Command[] {
  const result: Command[] = []; let i = 0, operandStart = 0, inText = false, textStart = 0;
  const whitespace = (c: string) => /[\s\u0000]/.test(c);
  const skipString = () => {
    let depth = 1; i++;
    while (i < content.length && depth) {
      if (content[i] === "\\") { i += 2; continue; }
      if (content[i] === "(") depth++;
      if (content[i] === ")") depth--;
      i++;
    }
    if (depth) throw unsupported();
  };
  while (i < content.length) {
    if (whitespace(content[i])) { i++; continue; }
    if (content[i] === "%") { while (i < content.length && !/[\r\n]/.test(content[i])) i++; continue; }
    if (content[i] === "(") { skipString(); continue; }
    if (content[i] === "<" && content[i + 1] !== "<") {
      i = content.indexOf(">", i + 1); if (i < 0) throw unsupported(); i++; continue;
    }
    if (content[i] === "/") { i++; while (i < content.length && !/[\s()[\]<>/%]/.test(content[i])) i++; continue; }
    if (/[\[\]<>]/.test(content[i])) { i++; continue; }
    const start = i;
    while (i < content.length && !/[\s()[\]<>/%\u0000]/.test(content[i])) i++;
    if (i === start) { i++; continue; }
    const token = content.slice(start, i);
    if (/^[+\-\d.]/.test(token) || ["true", "false", "null"].includes(token)) continue;
    if (token === "BI") throw unsupported(); // Inline image bytes need a different parser.
    if (token === "BT") { inText = true; textStart = result.length; }
    if (token === "ET") { inText = false; for (let c = textStart; c < result.length; c++) result[c].insertAt = i; }
    if (inText && ["Tj", "TJ", "'", '"'].includes(token)) {
      let prefix = token === "'" ? "T* " : "";
      if (token === '"') {
        const numbers = content.slice(operandStart, start).trim().match(/^([+\-\d.]+)\s+([+\-\d.]+)/);
        if (!numbers) throw unsupported();
        prefix = `${numbers[1]} Tw ${numbers[2]} Tc T* `;
      }
      result.push({ start: operandStart, end: i, insertAt: -1, prefix });
    }
    operandStart = i;
  }
  if (inText || result.some(c => c.insertAt < 0)) throw unsupported();
  return result;
}

function multiply(a: number[], b: number[]) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function inverse(m: number[]) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < .00001) throw unsupported();
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

function pageContent(document: PDFDocument, page: ReturnType<PDFDocument["getPage"]>) {
  const contents = page.node.Contents();
  if (!contents) throw unsupported();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  return streams.map(ref => {
    const stream = document.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) throw unsupported();
    const bytes = decodePDFRawStream(stream).decode();
    if (bytes.length > 8_000_000) throw unsupported();
    return Buffer.from(bytes).toString("latin1");
  }).join("\n");
}

export async function readPdfReference(data: Uint8Array): Promise<PdfReference> {
  const pdf = await getDocumentProxy(new Uint8Array(data), { fontExtraProperties: true, useSystemFonts: false });
  const native = await PDFDocument.load(data, { updateMetadata: false });
  const { OPS } = await getResolvedPDFJS();
  const pages: Page[] = [], fonts = new Map<string, Font>(), blocks: ResumeBlock[] = [];
  try {
    if (pdf.numPages > 30) throw new Error("Choose a resume with 30 pages or fewer.");
    for (let n = 0; n < pdf.numPages; n++) {
      const page = await pdf.getPage(n + 1), text = await page.getTextContent(), operators = await page.getOperatorList();
      const viewport = page.getViewport({ scale: 1 });
      if (page.rotate || page.view[0] || page.view[1]) throw unsupported();
      const content = pageContent(native, native.getPage(n)), commands = pdfTextCommands(content);
      if (/\/ActualText\b/.test(content)) throw unsupported();
      const operations: Operation[] = [];
      const rules: Rule[] = [];
      let color: Color = [0, 0, 0], size = 10, charSpace = 0, wordSpace = 0, offset = 0, formDepth = 0, matrix = [1, 0, 0, 1, 0, 0];
      const stack: { color: Color; size: number; charSpace: number; wordSpace: number; matrix: number[] }[] = [];
      for (let op = 0; op < operators.fnArray.length; op++) {
        const fn = operators.fnArray[op], args = operators.argsArray[op];
        if (fn === OPS.save) stack.push({ color, size, charSpace, wordSpace, matrix });
        if (fn === OPS.restore && stack.length) ({ color, size, charSpace, wordSpace, matrix } = stack.pop()!);
        if (fn === OPS.transform) matrix = multiply(matrix, args);
        if (fn === OPS.paintFormXObjectBegin) formDepth++;
        if (fn === OPS.paintFormXObjectEnd) formDepth--;
        if (fn === OPS.setFont) size = args[1];
        if (fn === OPS.setCharSpacing) charSpace = args[0];
        if (fn === OPS.setWordSpacing) wordSpace = args[0];
        if (fn === OPS.setTextRenderingMode && args[0] !== 0) throw unsupported();
        if (fn === OPS.setFillRGBColor) {
          // Current PDF.js emits a CSS hex color; older versions emit RGB bytes.
          color = typeof args[0] === "string" ? [1, 3, 5].map(i => parseInt(args[0].slice(i, i + 2), 16) / 255) as Color
            : Array.from(args).slice(0, 3).map(v => Number(v) / 255) as Color;
        }
        if (fn === OPS.constructPath && args[0] === OPS.fill && args[2]) {
          const bounds = Array.from(args[2]) as number[];
          if (bounds[3] - bounds[1] > 0 && bounds[3] - bounds[1] <= 2 && bounds[2] - bounds[0] > 15
            && matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 1) {
            rules.push({ x: bounds[0] + matrix[4], y: bounds[1] + matrix[5],
              width: bounds[2] - bounds[0], height: bounds[3] - bounds[1], color });
          }
        }
        if (fn === OPS.showText) {
          if (formDepth) throw unsupported();
          const glyphs = args[0] as (number | { unicode: string; width: number; isSpace: boolean })[];
          const str = glyphs.map(g => typeof g === "number" ? "" : g.unicode).join("");
          const length = canonical(str).length;
          const advance = glyphs.reduce<number>((total, g) => total + (typeof g === "number" ? -g
            : g.width + 1000 * (charSpace + (g.isSpace ? wordSpace : 0)) / size), 0);
          operations.push({ start: offset, end: offset + length, advance, color, matrix }); offset += length;
        }
      }
      if (commands.length !== operations.length) throw unsupported();
      const actual = operators.fnArray.flatMap((fn, i) => fn === OPS.showText
        ? (operators.argsArray[i][0] as { unicode?: string }[]).map(g => typeof g === "number" ? "" : g.unicode || "") : []).join("");
      const items = text.items.filter(item => "str" in item);
      if (canonical(items.map(item => item.str).join("")) !== canonical(actual)) throw unsupported();
      const annotations = await page.getAnnotations();
      const runs: Run[] = []; offset = 0;
      for (const item of items) {
        const start = offset; offset += canonical(item.str).length;
        if (!item.str.trim()) continue;
        if (Math.abs(item.transform[1]) > .01 || Math.abs(item.transform[2]) > .01 || item.dir === "rtl") throw unsupported();
        if (!fonts.has(item.fontName)) {
          const f = page.commonObjs.get(item.fontName) as { name: string; data?: Uint8Array };
          const name = f.name.replace(/^[A-Z]{6}\+/, "");
          const bytes = f.data && new Uint8Array(f.data);
          const standard = Object.values(StandardFonts).find(value => value === name);
          fonts.set(item.fontName, { name, data: bytes, standard, metrics: standard ? native.embedStandardFont(standard) : undefined,
            bold: /bold|semibold|heavy/i.test(name), italic: /italic|oblique/i.test(name), parsed: bytes ? fontkit.create(bytes) : undefined });
        }
        const x = item.transform[4], y = item.transform[5], size = Math.abs(item.transform[3]);
        const link = annotations.find(a => a.url && a.rect && x >= a.rect[0] - 1 && x <= a.rect[2] + 1 && y >= a.rect[1] - 1 && y <= a.rect[3] + 1)?.url;
        runs.push({ text: item.str, x, y, width: item.width, size, font: item.fontName, start, end: offset,
          color: operations.find(o => o.start < offset && o.end > start)?.color || [0, 0, 0], link });
      }
      const lines: Line[] = [];
      for (const run of runs.sort((a, b) => Math.abs(a.y - b.y) > 1.5 ? b.y - a.y : a.x - b.x)) {
        const prior = lines.at(-1);
        if (prior && Math.abs(prior.y - run.y) <= 1.5 && run.x - prior.right < Math.max(35, run.size * 4)) {
          const gap = run.x - prior.right;
          prior.text += (gap > run.size * .12 && !/\s$/.test(prior.text) && !/^\s/.test(run.text) ? " " : "") + run.text;
          prior.runs.push(run); prior.right = Math.max(prior.right, run.x + run.width);
          prior.size = Math.max(prior.size, run.size);
        } else lines.push({ runs: [run], text: run.text, x: run.x, bodyX: run.x, y: run.y, right: run.x + run.width, size: run.size });
      }
      const paragraphs: Paragraph[] = [];
      for (const line of lines) {
        line.text = compactText(line.text);
        if (bullet.test(line.text)) line.bodyX = line.runs.find(r => r.text.trim() && !bullet.test(r.text.trim()))?.x || line.x + 12;
        const previous = paragraphs.at(-1), prior = previous?.lines.at(-1);
        const boldLine = (l: Line) => l.runs.every(r => fonts.get(r.font)!.bold);
        const special = (l: Line) => section.test(l.text) || /@|https?:|linkedin\.com|github\.com/.test(l.text) || boldLine(l);
        if (previous && prior && prior.y - line.y > 1.5 && prior.y - line.y <= line.size * 1.55
          && Math.abs(line.x - previous.lines[0].bodyX) < 3 && Math.abs(prior.size - line.size) < 1
          && !bullet.test(line.text) && !special(line) && !special(prior)) previous.lines.push(line);
        else paragraphs.push({ id: -1, page: n, lines: [line] });
      }
      for (const paragraph of paragraphs) {
        paragraph.id = blocks.length;
        const str = paragraph.lines.map(line => line.text).join(" "), isBullet = bullet.test(str);
        const style = blocks.length === 0 ? "name" : section.test(str) ? "heading"
          : /@|https?:\/\/|linkedin\.com|github\.com/.test(str) && !isBullet ? "contact" : isBullet ? "bullet" : "paragraph";
        const editable = ["bullet", "paragraph"].includes(style) && str.length >= 55
          && !paragraph.lines.flatMap(l => l.runs).filter(r => !bullet.test(r.text.trim()))
            .some(r => r.link || (!fonts.get(r.font)?.data && !fonts.get(r.font)?.standard))
          && !/\b(?:19|20)\d{2}\b/.test(str) && !/@/.test(str)
          && !paragraph.lines.every(l => l.runs.every(r => fonts.get(r.font)!.bold));
        blocks.push({ id: paragraph.id, text: str.replace(bullet, ""), style, editable });
      }
      pages.push({ width: viewport.width, height: viewport.height, content, commands, operations, paragraphs, rules });
    }
    if (!blocks.length || blocks.reduce((n, b) => n + b.text.length, 0) < 30) throw new Error("Could not read your resume. Use a text-based PDF or Word file.");
    if (blocks.length > 800 || blocks.reduce((n, b) => n + b.text.length, 0) > 60_000) throw new Error("This resume is too long to tailor. Use a shorter copy.");
    if ([...fonts.values()].some(f => /^Calibri(?:-|$)/i.test(f.name))) {
      for (const { style, data } of await readResumeFonts()) {
        fonts.set(`carlito-${style}`, { name: style === "Regular" ? "Calibri" : `Calibri-${style}`,
          data, bold: style.includes("Bold"), italic: style.includes("Italic"), parsed: fontkit.create(data) });
      }
    }
    return { kind: "pdf", data: new Uint8Array(data), blocks, pages, fonts };
  } finally { await pdf.loadingTask.destroy(); }
}

function styleTokens(reference: PdfReference, paragraph: Paragraph, revised: string) {
  const sources: { start: number; end: number; run: Run }[] = [];
  let raw = "";
  for (const line of paragraph.lines) {
    if (raw) raw += " ";
    for (let i = 0; i < line.runs.length; i++) {
      const run = line.runs[i], previous = line.runs[i - 1];
      if (previous && run.x - previous.x - previous.width > run.size * .12 && !/\s$/.test(raw) && !/^\s/.test(run.text)) raw += " ";
      const start = raw.length; raw += run.text; sources.push({ start, end: raw.length, run });
    }
  }
  const prefix = raw.match(bullet)?.[0] || "";
  const text = prefix + revised;
  const tokens = mapEditedTokens(raw, text);
  return tokens.map(token => {
    let source = sources.find(s => token.source >= s.start && token.source < s.end)?.run || sources[0].run;
    if (token.text.trim() && !bullet.test(token.text) && bullet.test(source.text.trim())) source = sources.find(s => !bullet.test(s.run.text.trim()) && s.run.text.trim())!.run;
    const font = reference.fonts.get(source.font)!;
    if (token.text.trim() && font.parsed && [...token.text].some(c => !font.parsed!.hasGlyphForCodePoint(c.codePointAt(0)!))) {
      const alternative = [...reference.fonts].find(([, f]) => f.name === font.name
        && f.parsed && [...token.text].every(c => f.parsed!.hasGlyphForCodePoint(c.codePointAt(0)!)));
      if (alternative) source = { ...source, font: alternative[0] };
    }
    return { ...source, text: token.text };
  });
}

export function fitPdfParagraph(reference: PdfReference, paragraph: Paragraph, revised: string): Line[] | null {
  const tokens = styleTokens(reference, paragraph, revised);
  // Keep bullet glyphs at their original position; only flow their text.
  const isBullet = reference.blocks[paragraph.id].style === "bullet";
  if (isBullet && bullet.test(tokens[0]?.text || "")) {
    tokens.shift(); while (tokens[0] && !tokens[0].text.trim()) tokens.shift();
  }
  const right = Math.max(...paragraph.lines.map(l => l.right));
  const widthOf = (text: string, run: Run) => {
    const font = reference.fonts.get(run.font)?.parsed;
    if (!text.trim()) return run.size * .23 * text.length;
    const metrics = reference.fonts.get(run.font)?.metrics;
    if (!font) {
      try { return metrics?.widthOfTextAtSize(text, run.size) ?? NaN; } catch { return NaN; }
    }
    if ([...text].some(c => !font.hasGlyphForCodePoint(c.codePointAt(0)!))) return NaN;
    return font.layout(text, { liga: false, clig: false }).glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth, 0) / font.unitsPerEm * run.size;
  };
  for (const scale of [1, .98, .96]) {
    const lines = paragraph.lines.map(line => ({ ...line, text: "", runs: [] as Run[] }));
    let index = 0, x = isBullet ? paragraph.lines[0].bodyX : lines[0].x;
    for (const token of tokens) {
      const width = widthOf(token.text, token) * scale;
      if (!Number.isFinite(width)) return null;
      if (x + width > right + .1 && token.text.trim()) {
        index++; if (index === lines.length) break;
        x = paragraph.lines[index].x;
      }
      if (!token.text.trim() && !lines[index].runs.length) continue;
      lines[index].runs.push({ ...token, x, y: lines[index].y, width });
      lines[index].text += token.text; x += width;
    }
    if (index === lines.length) continue;
    if (isBullet) {
      const glyph = paragraph.lines[0].runs[0];
      lines[0].runs.unshift({ ...glyph, text: glyph.text.match(bullet)?.[0]?.trim() || "•", width: Math.min(glyph.width, paragraph.lines[0].bodyX - glyph.x), retained: true });
    }
    return lines;
  }
  return null;
}

export async function tailorPdfReference(reference: PdfReference, revised: ResumeBlock[]) {
  const document = await PDFDocument.load(reference.data, { updateMetadata: false });
  document.registerFontkit(fontkit);
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument["embedFont"]>>>();
  const outputPages: Page[] = [];
  let kept = 0, changed = 0;
  for (let n = 0; n < reference.pages.length; n++) {
    const source = reference.pages[n], page = document.getPage(n), removed = new Set<number>(), insertions = new Map<number, string>();
    const output: Page = { ...source, paragraphs: [] };
    for (const paragraph of source.paragraphs) {
      const edit = revised[paragraph.id];
      if (edit.text === reference.blocks[paragraph.id].text) { output.paragraphs.push(paragraph); continue; }
      const lines = fitPdfParagraph(reference, paragraph, edit.text);
      const ranges = paragraph.lines.flatMap(l => l.runs).filter(r => !bullet.test(r.text.trim())).map(r => [r.start, r.end]);
      const overlaps = source.operations.map((op, i) => ({ op, i })).filter(({ op }) => ranges.some(([start, end]) => op.start < end && op.end > start));
      const fullyCovered = overlaps.every(({ op }) => {
        for (let c = op.start; c < op.end; c++) if (!ranges.some(([start, end]) => c >= start && c < end)) return false;
        return true;
      });
      if (!lines || !fullyCovered || !overlaps.length) { kept++; output.paragraphs.push(paragraph); continue; }
      for (const { i } of overlaps) removed.add(i);
      output.paragraphs.push({ ...paragraph, lines }); changed++;
      const first = overlaps[0];
      let drawing = `\nq\n${inverse(first.op.matrix).join(" ")} cm\n`;
      for (const line of lines) for (const run of line.runs) {
        if (!run.text.trim() || run.retained) continue;
        const info = reference.fonts.get(run.font)!;
        if (!embedded.has(run.font)) embedded.set(run.font, info.data
          ? await document.embedFont(info.data, { subset: true, features: { liga: false, clig: false } }) : document.embedStandardFont(info.standard!));
        const font = embedded.get(run.font)!, name = page.node.newFontDictionary("ZebbyResume", font.ref);
        const width = font.widthOfTextAtSize(run.text, run.size);
        drawing += `BT\n${name.toString()} ${run.size} Tf\n0 Tc 0 Tw 100 Tz 0 Ts 0 Tr\n${run.color.join(" ")} rg\n${run.width / width} 0 0 1 ${run.x} ${run.y} Tm\n${font.encodeText(run.text).toString()} Tj\nET\n`;
      }
      drawing += "Q\n";
      const at = source.commands[first.i].insertAt;
      insertions.set(at, (insertions.get(at) || "") + drawing);
    }
    outputPages.push(output);
    if (!removed.size) continue;
    const changes = [...insertions].map(([at, text]) => ({ start: at, end: at, text }));
    for (const i of removed) {
      const cmd = source.commands[i], op = source.operations[i];
      changes.push({ start: cmd.start, end: cmd.end, text: `\n${cmd.prefix}[${-op.advance}] TJ\n` });
    }
    let content = source.content;
    for (const change of changes.sort((a, b) => b.start - a.start)) content = content.slice(0, change.start) + change.text + content.slice(change.end);
    page.node.set(PDFName.of("Contents"), document.context.register(document.context.flateStream(Buffer.from(content, "latin1"))));
  }
  return { pdf: changed ? await document.save() : new Uint8Array(reference.data),
    docx: await pdfReferenceDocx(reference, outputPages), kept };
}

async function pdfReferenceDocx(reference: PdfReference, pages: Page[]) {
  const zip = await JSZip.loadAsync(await resumeDocx([]));
  const relationships = [`<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`];
  const twips = (n: number) => Math.round(n * 20);
  const sections: string[] = [];
  for (let n = 0; n < pages.length; n++) {
    const page = pages[n];
    const paragraphs = page.paragraphs.flatMap(paragraph => paragraph.lines.map(line => {
      const tabs: string[] = [], runs: string[] = [];
      let position = line.x;
      for (const run of line.runs) {
        if (run.x - position > 1) {
          tabs.push(`<w:tab w:val="left" w:pos="${twips(run.x - line.x)}"/>`);
          runs.push("<w:r><w:tab/></w:r>");
        }
        const font = reference.fonts.get(run.font)!;
        const family = font.name.replace(/[-,](?:BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular)$/i, "").replace(/MT$/, "");
        const color = run.color.map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
        let xml = `<w:r><w:rPr><w:rFonts w:ascii="${esc(family)}" w:hAnsi="${esc(family)}"/><w:sz w:val="${Math.round(run.size * 2)}"/>${font.bold ? "<w:b/>" : ""}${font.italic ? "<w:i/>" : ""}<w:color w:val="${color}"/>${run.link ? '<w:u w:val="single"/>' : ""}</w:rPr><w:t xml:space="preserve">${esc(run.text)}</w:t></w:r>`;
        if (run.link && /^https?:\/\//i.test(run.link)) {
          const id = `link${relationships.length}`;
          relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(run.link)}" TargetMode="External"/>`);
          xml = `<w:hyperlink r:id="${id}">${xml}</w:hyperlink>`;
        }
        runs.push(xml); position = run.x + run.width;
      }
      // Native Word frames retain the PDF's page geometry while leaving all
      // text editable and selectable. They are not screenshots of the resume.
      return `<w:p><w:pPr><w:framePr w:w="${twips(page.width - line.x)}" w:hAnchor="page" w:vAnchor="page" w:x="${twips(line.x)}" w:y="${twips(page.height - line.y - line.size)}" w:wrap="none"/><w:spacing w:before="0" w:after="0" w:line="${twips(line.size * 1.2)}" w:lineRule="exact"/><w:tabs>${tabs.join("")}</w:tabs></w:pPr>${runs.join("")}</w:p>`;
    })).join("");
    const rules = page.rules.map((rule, i) => {
      const color = rule.color.map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
      return `<w:p><w:pPr><w:spacing w:line="1" w:lineRule="exact" w:before="0" w:after="0"/></w:pPr><w:r><w:pict><v:rect id="rule-${n}-${i}" style="position:absolute;margin-left:${rule.x}pt;margin-top:${page.height - rule.y - rule.height}pt;width:${rule.width}pt;height:${rule.height}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page" fillcolor="#${color}" stroked="f"/></w:pict></w:r></w:p>`;
    }).join("");
    const properties = `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${twips(page.width)}" w:h="${twips(page.height)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/></w:sectPr>`;
    sections.push(paragraphs + rules + (n < pages.length - 1 ? `<w:p><w:pPr>${properties}</w:pPr></w:p>` : properties));
  }
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>${sections.join("")}</w:body></w:document>`);
  zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { load } from "cheerio";
import { getDocumentProxy } from "unpdf";
import { PDFDocument } from "pdf-lib";
import { referencePdf, referenceWord } from "./fixtures/reference-resume.mjs";
import { readResumeReference, exportTailoredReference } from "../desktop/resume-reference.ts";
import { tailorPdfReference, pdfTextCommands } from "../desktop/resume-pdf-reference.ts";
import { tailorWordReference } from "../desktop/resume-word-reference.ts";
import { applyResumeEdits } from "../shared/tailored-resume.ts";

test("PDF tailoring keeps page geometry, unchanged text positions and links, replaces rather than overlays source text", async () => {
  const bytes = await referencePdf(), reference = await readResumeReference("Reference.pdf", bytes);
  const target = reference.blocks.find(b => b.editable && b.text.startsWith("Built a weekly"));
  assert.ok(target, "A complete achievement remains one editable block");
  const replacement = target.text.replace("Built a weekly", "Led a weekly");
  const blocks = applyResumeEdits(reference.blocks, { edits: [{ id: target.id, text: replacement }] });
  const output = await tailorPdfReference(reference, blocks);
  assert.equal(output.kept, 0);
  const original = await getDocumentProxy(new Uint8Array(bytes)), tailored = await getDocumentProxy(new Uint8Array(output.pdf));
  try {
    assert.equal(tailored.numPages, 2);
    for (let i = 1; i <= 2; i++) {
      const a = await original.getPage(i), b = await tailored.getPage(i);
      assert.deepEqual(b.view, a.view);
      assert.deepEqual((await b.getAnnotations()).map(a => [a.url, a.rect]), (await a.getAnnotations()).map(a => [a.url, a.rect]));
      const before = (await a.getTextContent()).items.filter(i => "str" in i && i.str.trim());
      const after = (await b.getTextContent()).items.filter(i => "str" in i && i.str.trim());
      for (const item of before.filter(item => !item.str.startsWith("Built a weekly"))) {
        assert.ok(after.some(other => other.str === item.str && JSON.stringify(other.transform) === JSON.stringify(item.transform)), item.str);
      }
      if (i === 1) {
        const text = after.map(i => i.str).join(" ").replace(/\s+/g, " ");
        assert.ok(text.includes(replacement), text);
        assert.ok(!text.includes("Built a weekly"), "The previous wording is removed from searchable text");
      }
    }
    const zip = await JSZip.loadAsync(output.docx), xml = await zip.file("word/document.xml").async("string");
    assert.match(xml, /w:framePr/); assert.match(xml, /w:hyperlink/); assert.match(xml, /w:b\//);
    assert.match(xml, /w:w="12240" w:h="15840"/);
  } finally { await original.loadingTask.destroy(); await tailored.loadingTask.destroy(); }
});

test("PDF no-op is byte-identical, long edits keep the source paragraph instead of adding pages or clipping", async () => {
  const bytes = await referencePdf(), reference = await readResumeReference("Reference.pdf", bytes);
  assert.deepEqual((await tailorPdfReference(reference, reference.blocks)).pdf, bytes);
  const target = reference.blocks.find(b => b.editable && b.text.startsWith("Built a weekly"));
  const revised = reference.blocks.map(b => b.id === target.id ? { ...b, text: b.text.repeat(12) } : b);
  const result = await tailorPdfReference(reference, revised);
  assert.equal(result.kept, 1); assert.deepEqual(result.pdf, bytes);
});

test("Word tailoring retains native styles, tables, dates, headers/footers, links and bold runs", async () => {
  const bytes = await referenceWord(), reference = await readResumeReference("Reference.docx", bytes);
  const target = reference.blocks.find(b => b.editable && b.text.includes("activation"));
  assert.ok(target);
  const text = target.text.replace("Led customer research", "Drove customer research");
  const output = await tailorWordReference(reference, applyResumeEdits(reference.blocks, { edits: [{ id: target.id, text }] }));
  assert.equal(output.kept, 0);
  const before = await JSZip.loadAsync(bytes), after = await JSZip.loadAsync(output.docx);
  for (const name of Object.keys(before.files).filter(name => name !== "word/document.xml" && !before.files[name].dir)) {
    assert.equal(await after.file(name).async("string"), await before.file(name).async("string"), name);
  }
  const original = load(await before.file("word/document.xml").async("string"), { xml: true });
  const edited = load(await after.file("word/document.xml").async("string"), { xml: true });
  assert.equal(original("w\\:tbl").toString(), edited("w\\:tbl").toString());
  assert.equal(original("w\\:sectPr").toString(), edited("w\\:sectPr").toString());
  assert.equal(edited("w\\:r").filter((_, r) => edited(r).find("w\\:b").length && edited(r).find("w\\:t").text() === "18%.").length, 1);
  const reread = await readResumeReference("Tailored.docx", output.docx);
  assert.equal(reread.blocks[target.id].text, text);
  assert.deepEqual((await tailorWordReference(reference, reference.blocks)).docx, bytes);
});

test("missing and unsupported references do not silently create a generic resume; cancellation cannot save", async () => {
  await assert.rejects(readResumeReference("Resume.doc", new Uint8Array()), /reference resume/);
  const reference = await readResumeReference("Resume.docx", await referenceWord());
  const controller = new AbortController(); controller.abort();
  await assert.rejects(exportTailoredReference(reference, reference.blocks, controller.signal, () => assert.fail("Should not print")), { name: "AbortError" });
});

test("PDF lexer does not confuse escaped text, names, comments or hex with text operators", () => {
  const data = "BT /Font 10 Tf [(BT \\(ET\\) Tj) -20 <454254>] TJ % ET\n (other) Tj ET";
  const commands = pdfTextCommands(data);
  assert.equal(commands.length, 2);
  assert.equal(commands[0].insertAt, data.length);
  assert.match(data.slice(commands[0].start, commands[0].end), /TJ$/);
  assert.throws(() => pdfTextCommands("BI /W 1 ID binary EI"), /layout/);
});

test("rotated PDF pages stop before inference instead of exporting an incorrect layout", async () => {
  const document = await PDFDocument.load(await referencePdf());
  document.getPage(0).node.set((await import("pdf-lib")).PDFName.of("Rotate"), document.context.obj(90));
  await assert.rejects(readResumeReference("Rotated.pdf", await document.save()), /layout cannot be preserved/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeWithOllama, listOllamaModels, normalizeOllamaUrl } from "../desktop/ollama.ts";
import { extractResumeText } from "../desktop/resume-text.ts";
import JSZip from "jszip";

function simplePdf(text) {
  const escaped = text.replace(/[\\()]/g, "\\$&");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("local analysis extracts actual text from a PDF resume", async () => {
  assert.match(await extractResumeText("resume.pdf", simplePdf("Product strategy and customer discovery")),
    /Product strategy and customer discovery/);
  await assert.rejects(extractResumeText("resume.pdf", Buffer.from("not a PDF")),
    /could not be read locally/);
});

test("local analysis extracts text from a DOCX resume", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Customer discovery and product strategy</w:t></w:r></w:p></w:body></w:document>');
  const data = await zip.generateAsync({ type: "nodebuffer" });
  assert.match(await extractResumeText("resume.docx", data), /Customer discovery and product strategy/);
});

test("Ollama settings normalize URLs and list installed models", async () => {
  assert.equal(normalizeOllamaUrl("http://localhost:11434/api/chat"), "http://localhost:11434");
  assert.throws(() => normalizeOllamaUrl("file:///tmp/model"), /HTTP or HTTPS/);
  let requested;
  const models = await listOllamaModels("http://localhost:11434", async (url) => {
    requested = url;
    return Response.json({ models: [{ name: "qwen3:8b" }, { name: "qwen3.8:27b" }] });
  });
  assert.equal(requested, "http://localhost:11434/api/tags");
  assert.deepEqual(models, ["qwen3:8b", "qwen3.8:27b"]);
});

test("Ollama analysis requests structured JSON without streaming", async () => {
  let request;
  const result = await analyzeWithOllama({ baseUrl: "http://localhost:11434",
    model: "qwen3:8b", instructions: "Analyze this posting.", content: "Product strategy",
    schema: { type: "object", properties: { score: { type: "integer" } }, required: ["score"] } },
  async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return Response.json({ message: { content: '{"score":82}' }, done: true });
  });
  assert.equal(request.url, "http://localhost:11434/api/chat");
  assert.equal(request.body.model, "qwen3:8b");
  assert.equal(request.body.stream, false);
  assert.deepEqual(request.body.format.required, ["score"]);
  assert.deepEqual(result, { score: 82 });
});

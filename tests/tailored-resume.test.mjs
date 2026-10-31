import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { applyResumeEdits } from "../shared/tailored-resume.ts";
import { readResumeBlocks, resumeDocx, resumeHtml, tailoredBaseName } from "../desktop/tailored-resume.ts";
import { materializeTailoredResume } from "../desktop/resume-files.ts";
import { validateInput, validateResult } from "../credits-service/validation.ts";
import { AnalysisJobs } from "../desktop/renderer/analysis-jobs.ts";
import { setImmediate as flush } from "node:timers/promises";

const blocks = [
  { id: 0, text: "Alex Morgan", style: "name", editable: false },
  { id: 1, text: "alex@example.com | Seattle, WA", style: "contact", editable: false },
  { id: 2, text: "Experience", style: "heading", editable: false },
  { id: 3, text: "Product Manager | Example Company | 2022 - Present", style: "paragraph", editable: false },
  { id: 4, text: "Led customer research and partnered with engineering to improve activation by 18%.", style: "bullet", editable: true },
];
const edited = "Partnered with engineering on customer research, improving activation by 18%.";

test("tailoring edits only existing editable paragraphs and keeps identity, dates, numbers and order", () => {
  const result = applyResumeEdits(blocks, { edits: [{ id: 4, text: edited }] });
  assert.deepEqual(result.slice(0, 4), blocks.slice(0, 4));
  assert.equal(result[4].text, edited);
  assert.deepEqual(blocks[4].text, "Led customer research and partnered with engineering to improve activation by 18%.");
  for (const edits of [[{ id: 0, text: "Another name" }], [{ id: 99, text: "Invented section" }],
    [{ id: 4, text: edited.replace("18%", "40%") }], [{ id: 4, text: edited }, { id: 4, text: edited }]]) {
    assert.throws(() => applyResumeEdits(blocks, { edits }));
  }
  assert.deepEqual(applyResumeEdits(blocks, { edits: [] }), blocks);
});

test("Word export retains all paragraphs and its content can be read back for analysis", async () => {
  const data = await resumeDocx(blocks), parsed = await readResumeBlocks("resume.docx", data);
  assert.deepEqual(parsed.map(block => block.text), blocks.map(block => block.text));
  assert.equal(parsed[4].style, "bullet");
  assert.equal(parsed[4].editable, true);
  assert.equal(parsed[3].editable, false);
});

test("PDF markup escapes resume text and blocks scripts and remote resources", () => {
  const html = resumeHtml([{ ...blocks[4], text: '<img src="https://example.com/x" onerror="alert(1)">' }]);
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("default-src 'none'"));
  assert.doesNotMatch(html, /<img|<script|<iframe/);
});

test("artifact names use the job ID and cannot escape the output folder", () => {
  assert.equal(tailoredBaseName("Alex Resume.pdf", "https://job-boards.greenhouse.io/example/jobs/5434361008", "aaaaaaaa-bbbb"), "Alex Resume - 5434361008 - tailored");
  assert.equal(tailoredBaseName("Alex.docx", "https://example.com/?gh_jid=123456", "aaaaaaaa-bbbb"), "Alex - 123456 - tailored");
  assert.equal(tailoredBaseName("Alex.doc", "https://example.com/roles/designer", "aaaaaaaa-bbbb"), "Alex - aaaaaaaa - tailored");
  assert.doesNotMatch(tailoredBaseName("../CON: Bad.pdf", "https://example.com/?jobId=../../bad", "aaaaaaaa-bbbb"), /[<>:"/\\|?*]/);
});

test("the paid service validates resume source and edits before charging", () => {
  const input = validateInput({ resumeText: blocks.map(block => block.text).join("\n"), jobDescription: "Lead customer discovery and partner with engineering to improve product activation and onboarding.",
    resumeBlocks: blocks, keywords: ["Customer research"], themes: ["Improving activation"] }, "resume");
  assert.deepEqual(validateResult({ edits: [{ id: 4, text: edited }] }, "resume", input), { edits: [{ id: 4, text: edited }] });
  assert.throws(() => validateResult({ edits: [{ id: 4, text: edited.replace("18%", "80%") }] }, "resume", input));
  assert.throws(() => validateInput({ ...input, resumeBlocks: [blocks[0], blocks[0]] }, "resume"));
});

test("tailoring survives navigation, excludes simultaneous plan analysis, and supports cancellation", async () => {
  let complete;
  const jobs = new AnalysisJobs((url, options) => new Promise((resolve, reject) => {
    assert.equal(url, "/api/plans/one/tailor"); complete = () => resolve(Response.json({ plan: { id: "one", tailoredResume: {} } }));
    options.signal.addEventListener("abort", () => reject(options.signal.reason));
  }), async () => true);
  const source = { kind: "resume", id: "one" }, prepare = async () => ({});
  const task = jobs.start(source, { prepare }); await flush();
  const leave = jobs.subscribe(() => {}); leave();
  await jobs.start({ kind: "plan", id: "one" }, { prepare: () => assert.fail("The same plan is locked") });
  complete(); await task;
  assert.equal(jobs.get(source).status, "succeeded");
  const again = jobs.start(source, { prepare }); await flush(); await jobs.cancel(source); await again;
  assert.equal(jobs.get(source).status, "cancelled");
});

test("both generated files persist with the plan, original resume and score stay intact, and exported edits are never overwritten", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "zebby-tailored-"));
  let store;
  try {
    const bundle = path.join(root, "store.mjs");
    await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle, bundle: true, platform: "node", format: "esm", target: "node22" });
    const { DesktopStore } = await import(pathToFileURL(bundle).href);
    store = new DesktopStore(path.join(root, "profile")); await store.create(path.join(root, "Applications.sqlite"));
    const originalBytes = await resumeDocx(blocks);
    const resume = await store.addResume("Alex Resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", originalBytes);
    const input = { listingUrl: "https://example.com/jobs/123456", company: "Example", title: "Product Manager", team: "", locations: "", description: "A job description.",
      currentOverview: "", resumeId: resume.id, keywords: [], themes: [], overview: "" };
    const first = await store.savePlan(input);
    const file = await store.saveTailoredResume(first.id, first.updatedAt, "Alex Resume - 123456 - tailored", "hash", originalBytes, Buffer.from("%PDF-test"));
    assert.equal(file.resumeId, resume.id);
    assert.equal(file.matchStrength, first.matchStrength);
    assert.deepEqual(store.getResume(resume.id).data, originalBytes);
    assert.equal(store.getResume(file.tailoredResume.pdf.id).resume.filename, "Alex Resume - 123456 - tailored.pdf");
    const exported = await materializeTailoredResume(store, path.join(root, "Documents"), first.id, "docx");
    await writeFile(exported, "User edited Word file");
    await materializeTailoredResume(store, path.join(root, "Documents"), first.id, "docx");
    assert.equal(await readFile(exported, "utf8"), "User edited Word file");
    store.close(); await store.open(path.join(root, "Applications.sqlite"));
    assert.equal(store.getPlan(first.id).tailoredResume.docx.id, file.tailoredResume.docx.id);
    const count = store.listResumes().length;
    await assert.rejects(store.saveTailoredResume(first.id, "stale", "Other", "hash", originalBytes, Buffer.from("%PDF-test")));
    assert.equal(store.listResumes().length, count);
  } finally {
    store?.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});

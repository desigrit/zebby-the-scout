import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { boardScope, thoroughlyScanBoard, newBoardCheckpoint } from "../desktop/board-thorough.ts";
import { defaultBoardReaderSettings, controlProvesScope } from "../shared/board-exploration.ts";
import { boardModelContract, validatedBoardExtraction } from "../shared/boards.ts";
import { validStructuredResult } from "../desktop/online-response.ts";

const output = path.resolve("qa-output/board-evidence"), reports = [];
const url = "https://www.careers.zoom.us/job-results#/7bc982e1-3ea0-44c2-94d3-cdbc196a6688/united-states-of-america";
const filters = boardScope(url), titles = ["Principal AI Product Manager", "Chat Product Manager"];
const instructions = 'Set filters to Product specialization, Country to United States of America and only track roles with "Product Manager" in the role title.';
// The split counter and adjacent checkbox labels reproduce the public Zoom
// markup captured by the hosted diagnostic, without a site-specific reader.
const results = `<div class="filters"><div data-filter-type="professionID" data-filter-value="${filters[0].value}" data-filter-path="${filters[0].value}"><input type="checkbox" checked> Product (2)</div>
<div data-filter-type="country" data-filter-value="United States of America" data-filter-path="${filters[1].value}"><input type="checkbox" checked> United States of America (2)</div></div>
<div>Your search resulted in: <span>2</span> <span>positions</span></div>
${titles.map((title, index) => `<article><div><a href="https://www.careers.zoom.us/job-details/pm-${index}">${title}</a></div><p>Seattle (WA), Product</p><a href="https://www.careers.zoom.us/job-details/pm-${index}">Read More</a></article>`).join("")}`;
const html = `<!doctype html><html><head><title>Careers</title><style>body{font:18px system-ui;margin:24px}article{padding:30px}header{height:400px}footer{padding:80px 0}footer a{display:inline-block;width:170px;padding:8px}</style></head><body>
<header><a href="https://www.careers.zoom.us/">Careers</a><button aria-expanded="false">Open menu</button></header>
<main><h1>Job results</h1><div id="results"></div></main>
<div hidden><a href="https://www.careers.zoom.us/hidden" data-zebby-explore="e999" data-zebby-explore-label="link e999">Hidden link</a></div>
<footer>${Array.from({length:45},(_,index)=>`<a href="https://www.careers.zoom.us/about/${index}">About ${index}</a>`).join("")}</footer>
<script>setTimeout(()=>document.querySelector('#results').innerHTML=${JSON.stringify(results)},1700)</script></body></html>`;

async function scan(name, live = false) {
  const abort = new AbortController(), owner = new BoardBrowser(abort.signal), observations = [], decisions = [], actions = [];
  const timer = setTimeout(() => abort.abort(new Error("Evidence verification deadline")), 240000);
  if (!live) await owner.window.webContents.session.protocol.handle("https", () => new Response(html, { headers: { "content-type": "text/html" } }));
  const run = newBoardCheckpoint({ boardId: name, workspace: "evidence.sqlite", revision: 1, url, instructions, provider: "fixture", model: "observed-evidence", account: "" });
  const originalObserve = owner.thorough.observe.bind(owner.thorough), originalAct = owner.thorough.act.bind(owner.thorough), originalReveal = owner.thorough.reveal.bind(owner.thorough);
  owner.thorough.observe = async () => {
    const observation = await originalObserve();
    const page = observation.page;
    await writeFile(path.join(output, name + "-page.json"), JSON.stringify(page));
    const labels = await owner.window.webContents.executeJavaScript("[...document.querySelectorAll('[data-zebby-explore-label]')].map(node=>node.getAttribute('data-zebby-explore-label'))");
    const linkIds = new Set(page.viewportIds), controlIds = new Set(page.controls.filter(control => control.visible).map(control => control.id)), counterIds = new Set(page.counters.map(counter => counter.id));
    for (const label of labels) {
      const [kind, id] = label.split(" ");
      assert.ok(kind === "link" ? linkIds.has(id) : kind === "control" ? controlIds.has(id) : kind === "link/control" ? linkIds.has(id) && controlIds.has(id) : kind === "count" && counterIds.has(id), "Only current evidence IDs may be labelled: " + label);
    }
    if (!live && observations.length === 0) assert.ok(page.counters.length, "The delayed results must load before the first model observation");
    observations.push({ pass: run.pass, candidates: page.candidates.length, counters: page.counters, selected: page.controls.filter(item => item.role === "selected"), atBottom: page.atBottom });
    if (page.counters.some(counter => /2 positions/.test(counter.text))) {
      assert.equal(page.counters.filter(counter => /2 positions/.test(counter.text)).length, 1, "Count containers must be deduplicated");
      assert.ok(filters.every(filter => page.controls.some(control => controlProvesScope(control, filter.value, filters.map(item => item.value)))));
      await writeFile(path.join(output, name + "-results.jpg"), Buffer.from(observation.image.data, "base64"));
    }
    return observation;
  };
  owner.thorough.act = async (action, observation) => { actions.push(action); return originalAct(action, observation); };
  owner.thorough.reveal = async (id, observation) => { actions.push({ kind: "reveal", target: observation.page.candidates.find(item => item.id === id) || observation.page.controls.find(item => item.id === id) }); return originalReveal(id, observation); };
  const started = Date.now();
  try {
    const value = await thoroughlyScanBoard({ url, instructions, reader: owner.thorough, signal: abort.signal, provider: "fixture", model: "observed-evidence",
      checkpoint: run, settings: { ...defaultBoardReaderSettings, minutes: 4, modelCalls: 30 }, progress() {}, save: async checkpoint => {
        await writeFile(path.join(output, name + "-progress.json"), JSON.stringify({ message: checkpoint.message, calls: checkpoint.calls, jobs: checkpoint.jobs.map(job => job.title) }));
      }, extract: async input => {
        if (input.task === "roles") return { decisions: Object.fromEntries(input.candidates.map(job => [job.id, job.title.includes("Product Manager")])) };
        if (input.task === "feed_map") return { usable: false, records: "", id: "", title: "", url: "", department: "", location: "", total: "", next: "" };
        assert.equal(input.task, "explore");
        const jobs = input.candidates.filter(job => new URL(job.url).pathname.startsWith("/job-details/"));
        const counter = input.counters.find(counter => /Your search resulted in: 2 positions/.test(counter.text));
        const next = input.controls.find(control => !control.disabled && /^(?:next|load more|show more)/i.test(control.name));
        const result = { listings: jobs.map(job => ({ id: job.id, title: job.title, department: "Product", location: "Seattle (WA)" })),
          excludedIds: input.candidates.filter(job => !jobs.includes(job)).map(job => job.id), uncertainIds: [], scopeEvidence: [],
          irrelevantControls: input.controls.filter(control => control !== next && !controlProvesScope(control, filters[0].value) && !controlProvesScope(control, filters[1].value)).map(control => control.id),
          totalEvidence: { counterId: counter?.id || "", filteredTotal: counter ? 2 : null, interpretation: counter ? "filtered" : "unknown" },
          action: next ? { kind: "next", targetId: next.id, value: "" } : { kind: "finish", targetId: "", value: "" },
          empty: false, complete: true, reason: "Classified the observed viewport; verify the remaining document and independent pass" };
        assert.equal(validStructuredResult(boardModelContract(input).schema, result), true);
        validatedBoardExtraction(result, input);
        decisions.push({ pass: input.pass, links: input.candidates.length, jobs: jobs.map(job => job.title), controls: input.controls.length, scope: input.coverage.scopeVerified, feedback: input.feedback, candidates: input.candidates.map(item => item.url) });
        if (jobs.length) await writeFile(path.join(output, name + "-sample.json"), JSON.stringify({ input, expected: { titles, filters: filters.map(item => item.value) } }));
        return result;
      } });
    assert.deepEqual(value.jobs.map(job => job.title).sort(), titles.slice().sort());
    assert.ok(value.jobs.every(job => job.matches));
    assert.ok(decisions.some(item => item.pass === "collect") && decisions.some(item => item.pass === "audit"));
    assert.ok(decisions.length <= 18, `Expected bounded reading, got ${decisions.length} decisions`);
    reports.push({ name, status: "passed", jobs: value.jobs.map(job => ({ title: job.title, url: job.url })), observations: observations.length, modelDecisions: decisions.length, elapsedMs: Date.now() - started });
  } catch (error) {
    reports.push({ name, status: "failed", error: String(error), observations, decisions, actions, checkpoint: run }); throw error;
  } finally { clearTimeout(timer); owner.close(); await writeFile(path.join(output, "report.json"), JSON.stringify(reports, null, 2)); }
}

async function filterEvidence() {
  const abort = new AbortController(), owner = new BoardBrowser(abort.signal);
  await owner.window.webContents.session.protocol.handle("https", () => new Response(html, { headers: { "content-type": "text/html" } }));
  try {
    await owner.thorough.open(url);
    let observation = await owner.thorough.observe();
    const proves = () => observation.page.controls.some(control => controlProvesScope(control, filters[0].value, filters.map(filter => filter.value)));
    assert.equal(proves(), true);
    await owner.window.webContents.executeJavaScript("document.querySelector('[data-filter-type=professionID] input').checked=false");
    observation = await owner.thorough.observe(); assert.equal(proves(), false, "An unchecked filter cannot prove the route even when the URL and counter still match");
    await owner.window.webContents.executeJavaScript(`document.querySelector('[data-filter-type=professionID] input').checked=true;
      document.querySelector('.filters').insertAdjacentHTML('beforeend','<div data-filter-type="professionID" data-filter-path="engineering"><input type="checkbox" checked> Engineering (4)</div>')`);
    observation = await owner.thorough.observe(); assert.equal(proves(), false, "An extra selected specialization broadens the search and must not pass");
    reports.push({ name: "native checkbox state and group evidence", status: "passed" });
  } finally { owner.close(); }
}

async function main() {
  await mkdir(path.join(output, "profile"), { recursive: true }); app.setPath("userData", path.join(output, "profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  try {
    await filterEvidence();
    await scan("delayed-route-results");
    if (process.argv.includes("--live")) { await scan("zoom-cold-1", true); await scan("zoom-cold-2", true); }
    console.log(JSON.stringify(reports)); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}
void main();

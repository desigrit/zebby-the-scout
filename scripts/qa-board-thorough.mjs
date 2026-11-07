import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { thoroughlyScanBoard, newBoardCheckpoint } from "../desktop/board-thorough.ts";
import { defaultBoardReaderSettings } from "../shared/board-exploration.ts";

const output = path.resolve("qa-output/board-layers"), reports = [];
const html = body => new Response(`<!doctype html><html><head><title>Careers</title><style>body{margin:24px;font:18px system-ui}button,select{padding:10px}article{padding:25px}a{display:block}</style></head><body>${body}</body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
const url = "https://example.org/careers#openings?team=Product";
const page = `<h1>Open roles</h1><button id="filter" role="combobox" aria-expanded="false" aria-valuetext="All teams">Team: All teams</button>
<div id="options" hidden><button role="option" data-value="Product">Product</button></div><div id="results" aria-busy="true"></div>
<script>
const filter=document.querySelector('#filter'),options=document.querySelector('#options'),results=document.querySelector('#results');
let team='All teams', count=0;
filter.onclick=()=>{options.hidden=!options.hidden;filter.setAttribute('aria-expanded',String(!options.hidden))};
options.querySelector('button').onclick=()=>{team='Product';filter.textContent='Team: Product';filter.setAttribute('aria-valuetext',team);filter.setAttribute('aria-expanded','false');options.hidden=true;render()};
function render(){results.setAttribute('aria-busy','true');setTimeout(()=>{results.innerHTML='<p>Showing '+(team==='Product'?5:12)+' of 12 results</p><details><summary>Product openings</summary><div id="scroller" style="height:250px;overflow:auto" aria-label="Job results"></div><button id="more">Load more jobs</button></details>';count=0;more();results.querySelector('#more').onclick=more;results.setAttribute('aria-busy','false')},400)}
function more(){const list=results.querySelector('#scroller');for(let i=0;i<3&&count<5;i++){count++;list.insertAdjacentHTML('beforeend','<article><a href="https://example.org/job/'+count+'">'+(count===5?'Apply':'Senior Product Manager '+count)+'</a><p>Seattle</p></article>')}if(count===5)results.querySelector('#more').remove()}
render();</script>`;

async function runFixture(name, { iframe = false, oracleFailure = false } = {}) {
  const abort = new AbortController(), owner = new BoardBrowser(abort.signal), observed = [], actions = [], checkpoints = [];
  const deadline = setTimeout(() => abort.abort(new Error("Native fixture deadline")), 150000);
  let stage = "initializing";
  const mark = async value => { stage = value; await writeFile(path.join(output, name + "-progress.json"), JSON.stringify({ stage, actions, observed: observed.slice(-8) })); };
  const originalOpen = owner.thorough.open.bind(owner.thorough), originalObserve = owner.thorough.observe.bind(owner.thorough);
  owner.thorough.open = async value => { await mark("opening"); return originalOpen(value); };
  owner.thorough.observe = async () => { await mark("observing"); const value = await originalObserve(); await mark("observed"); return value; };
  const originalAct = owner.thorough.act.bind(owner.thorough);
  owner.thorough.act = async (action, observation) => { actions.push(action.kind); await mark("action: " + action.kind); return originalAct(action, observation); };
  await owner.window.webContents.session.protocol.handle("https", request => {
    const target = new URL(request.url);
    if (target.pathname.startsWith("/job/")) return html('<main><h1>Senior Product Manager ' + target.pathname.split('/').at(-1) + '</h1><p>Product, Seattle</p></main>');
    if (iframe && target.pathname === "/careers") return html('<h1>Our careers</h1><iframe title="Job opportunities" src="https://www.iana.org/list" style="display:block;width:1100px;height:700px"></iframe>');
    return html(page);
  });
  const run = newBoardCheckpoint({ boardId: name, workspace: "fixture.sqlite", revision: 1, url, instructions: "", provider: "fixture", model: "observed-controls", account: "" });
  let first = true;
  try {
    const result = await thoroughlyScanBoard({ url, reader: owner.thorough, signal: abort.signal, provider: "fixture", model: "observed-controls",
      checkpoint: run, settings: { ...defaultBoardReaderSettings, minutes: 2, modelCalls: 70 }, progress() {}, save: async run => checkpoints.push(structuredClone(run)),
      extract: async input => {
        if (input.task === "feed_map") return { usable: false, records: "", id: "", title: "", url: "", department: "", location: "", total: "", next: "" };
        assert.equal(input.task, "explore"); observed.push({ pass: input.pass, jobs: input.coverage.verifiedCount, controls: input.controls.length, scope: input.coverage.scopeVerified });
        if (observed.length % 10 === 0) console.log(name, JSON.stringify({ call: observed.length, pass: input.pass, coverage: input.coverage, atBottom: input.atBottom, feedback: input.feedback }));
        if (first) { first = false; await writeFile(path.join(output, name + ".jpg"), Buffer.from(input.image.data, "base64")); }
        if (oracleFailure && input.coverage.verifiedCount > 0) throw new Error("Provider unavailable");
        const frame = input.controls.find(control => control.kind === "document");
        const option = input.controls.find(control => control.kind === "option" && control.value === "Product");
        const team = input.controls.find(control => control.role === "combobox");
        const section = input.controls.find(control => control.name === "Product openings" && control.expanded === false);
        const apply = input.candidates.find(job => job.url.includes("/job/") && job.title === "Apply");
        const nested = input.controls.find(control => control.kind === "scroll" && Number(control.value.split("/")[0]) < Number(control.value.split("/")[1]) - 8);
        const next = input.controls.find(control => control.name === "Load more jobs");
        let action = { kind: "finish", targetId: "", value: "" };
        if (frame) action = { kind: "document", targetId: frame.id, value: "" };
        else if (option) action = { kind: "choose", targetId: option.id, value: "" };
        else if (team && team.value !== "Product") action = { kind: "expand", targetId: team.id, value: "" };
        else if (section) action = { kind: "expand", targetId: section.id, value: "" };
        else if (apply) action = { kind: "inspect", targetId: apply.id, value: "" };
        else if (nested || !input.atBottom) action = { kind: "scroll", targetId: nested?.id || "", value: "down" };
        else if (next) action = { kind: "next", targetId: next.id, value: "" };
        const result = { listings: input.candidates.filter(job => job.url.includes("/job/") && job.title !== "Apply").map(job => ({ id: job.id, title: job.title, department: "Product", location: "Seattle" })),
          action, excludedIds: input.candidates.filter(job => !job.url.includes("/job/")).map(job => job.id), uncertainIds: apply ? [apply.id] : [],
          scopeEvidence: [], irrelevantControls: team?.value === "Product" ? [team.id] : [], totalEvidence: { counterId: input.counters[0]?.id || "",
            filteredTotal: input.coverage.scopeVerified && input.counters.length ? 5 : null, interpretation: input.coverage.scopeVerified && input.counters.length ? "filtered" : "unknown" }, empty: false, complete: true, reason: "Read every result control" };
        if (input.candidates.some(job => job.url.includes("/job/")) && input.pass === "collect") {
          await writeFile(path.join(output, name + "-results.jpg"), Buffer.from(input.image.data, "base64"));
          await writeFile(path.join(output, "thorough-sample.json"), JSON.stringify({ input, expected: { listingIds: result.listings.map(job => job.id) } }));
        }
        return result;
      },
    });
    assert.equal(result.jobs.length, 5); assert.ok(result.jobs.every(job => job.title.startsWith("Senior Product Manager")));
    assert.ok(actions.includes("choose") && actions.includes("expand") && actions.includes("next") && actions.includes("scroll") && actions.includes("inspect"));
    if (iframe) assert.ok(actions.includes("document"));
    assert.equal(run.verifiedPass.length, 5); assert.ok(observed.some(item => item.pass === "audit"));
    reports.push({ name, verified: result.jobs.length, observations: observed.length, actions, status: "passed" });
  } catch (error) {
    if (!oracleFailure) { reports.push({ name, status: "failed", error: String(error), actions, observations: observed, checkpoint: run }); throw error; }
    assert.ok(run.jobs.length > 0); assert.equal(run.status, "incomplete");
    reports.push({ name, found: run.jobs.length, observations: observed.length, status: "interrupted with checkpoint" });
  } finally { clearTimeout(deadline); owner.close(); }
}

async function buttonFixture() {
  const abort = new AbortController(), owner = new BoardBrowser(abort.signal), source = "https://example.org/careers";
  await owner.window.webContents.session.protocol.handle("https", request => new URL(request.url).pathname === "/job/42"
    ? html("<main><h1>Principal Product Manager</h1><p>Seattle</p></main>")
    : html('<h1>Open roles</h1><p>1 open job</p><button onclick="window.open(\'https://example.org/job/42\',\'_blank\')">Principal Product Manager</button>'));
  const run = newBoardCheckpoint({ boardId: "button-fixture", workspace: "fixture.sqlite", revision: 1, url: source, provider: "fixture", model: "observed-controls", account: "", instructions: "" });
  try {
    const scan = await thoroughlyScanBoard({ url: source, reader: owner.thorough, signal: abort.signal, provider: "fixture", model: "observed-controls", checkpoint: run,
      settings: { ...defaultBoardReaderSettings, minutes: 2, modelCalls: 20 }, progress() {}, save: async () => {}, extract: async input => {
        assert.equal(input.task, "explore");
        return { listings: input.candidates.map(job => ({ id: job.id, title: job.title, department: "Product", location: "Seattle" })), excludedIds: [], uncertainIds: [],
          action: input.candidates.length ? { kind: "finish", targetId: "", value: "" } : { kind: "inspect", targetId: input.controls.find(control => control.name === "Principal Product Manager").id, value: "" },
          scopeEvidence: [], irrelevantControls: [], totalEvidence: { counterId: input.counters[0].id, filteredTotal: 1, interpretation: "filtered" }, empty: false, complete: true, reason: "Observed vacancy" };
      } });
    assert.equal(scan.jobs.length, 1); assert.equal(scan.jobs[0].url, "https://example.org/job/42"); assert.equal(scan.jobs[0].title, "Principal Product Manager");
    reports.push({ name: "button-only vacancy opens an observed detail URL", verified: 1, status: "passed" });
  } finally { owner.close(); }
}

async function main() {
  await mkdir(path.join(output, "thorough-profile"), { recursive: true }); app.setPath("userData", path.join(output, "thorough-profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  try {
    await runFixture("thorough-custom-filters");
    await runFixture("thorough-embedded", { iframe: true });
    await buttonFixture();
    await runFixture("thorough-recovery", { oracleFailure: true });
    console.log(JSON.stringify(reports));
    await writeFile(path.join(output, "thorough-report.json"), JSON.stringify(reports, null, 2)); app.exit(0);
  } catch (error) {
    console.error(error); await writeFile(path.join(output, "thorough-report.json"), JSON.stringify(reports, null, 2)); app.exit(1);
  }
}
void main().catch(error => { console.error(error); app.exit(1); });

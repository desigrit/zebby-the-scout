import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { scanBoard } from "../desktop/boards-scan.ts";

const url = "https://www.lyft.com/careers#openings?category=product";
const queryUrl = "https://www.lyft.com/careers?category=product#openings";
const output = path.resolve("qa-output/board-layers");
const report = { url, queryUrl, coldScans: [], status: "pending" };
const jobId = value => new URL(value).pathname.match(/^\/job-board\/lyft\/job\/(\d+)$/)?.[1];
const ids = jobs => jobs.map(job => jobId(job.url)).sort();

async function coldScan() {
  const signal = new AbortController().signal, reader = new BoardBrowser(signal), started = Date.now();
  const result = await scanBoard({ url, reader, signal, provider: "chatgpt", model: "selected-model", progress() {},
    extract: async () => assert.fail("A verified Lyft inventory with blank instructions must not need AI"),
    canUseVision: async () => assert.fail("The complete feed must not request screenshots"),
  });
  assert.ok(result.jobs.length > 0, "The live Product sample must be nonempty");
  assert.ok(result.jobs.every(job => job.department === "Product" && jobId(job.url)));
  report.coldScans.push({ elapsed: Date.now() - started, checked: result.jobs.length, aiCalls: 0, ids: ids(result.jobs) });
  return result;
}

async function compareRenderedPage(expected) {
  const reader = new BoardBrowser(new AbortController().signal);
  try {
    // Independently compare the site-rendered Product selection with the feed.
    // Use the query form that Lyft restores on a fresh visit; its own UI can
    // instead write an unrestorable fragment form when #openings was followed.
    reader.source = queryUrl;
    await reader.loadPage();
    const page = await reader.read();
    const state = await reader.window.webContents.executeJavaScript("(() => ({" +
      "url: location.href, category: document.querySelector('input[name=categoryFiter]')?.value," +
      "count: [...document.querySelectorAll('#openings [role=status]')].map(item => item.innerText).find(text => /Showing/.test(text))," +
      "jobs: [...document.querySelectorAll('#openings a[href]')].filter(item => item.href.startsWith('https://app.careerpuck.com/job-board/lyft/job/'))" +
      ".map(item => ({url:item.href,title:item.querySelector('h3')?.innerText,text:item.innerText}))" +
      "}))()");
    assert.equal(state.url, queryUrl); assert.equal(state.category, "Product");
    const counts = state.count?.match(/Showing ([\d,]+) of ([\d,]+) results/i);
    assert.ok(counts, "Lyft's filtered and overall counters must be present");
    assert.equal(Number(counts[1].replaceAll(",", "")), state.jobs.length);
    assert.deepEqual(ids(state.jobs), ids(expected.jobs), "The feed must match every rendered Product posting");
    report.rendered = { ...state, parsedOverallTotal: page.expectedTotal };
    let captured = false;
    for await (const viewport of reader.visual()) {
      if (!viewport.candidates.some(job => jobId(job.url))) continue;
      report.capture = { candidates: viewport.candidates, atBottom: viewport.atBottom };
      await writeFile(path.join(output, "lyft-product.jpg"), Buffer.from(viewport.image.data, "base64"));
      captured = true; break;
    }
    assert.ok(captured, "The visual reader must expose the Product listings");
  } finally { reader.close(); }
}

async function failedFeedPreservesScope() {
  const reader = new BoardBrowser(new AbortController().signal), requests = [];
  try {
    await reader.window.webContents.session.protocol.handle("https", request => {
      requests.push(request.url); return new Response("Unavailable", { status: 503 });
    });
    await assert.rejects(reader.open(url), /Lyft's job list could not be verified/);
    assert.equal(requests.length, 3);
    assert.ok(requests.every(value => value === "https://api.greenhouse.io/v1/boards/lyft/jobs?content=true"));
    assert.equal(reader.window.webContents.getURL(), "", "A failed feed must not load an unfiltered careers page");
    await assert.rejects(reader.open(url + "&unrecognized_filter=value"), /could not verify the filters/);
    assert.equal(requests.length, 3, "Unknown scope must be rejected before fetching");
    report.failedFeed = { boundedAttempts: requests.length, unfilteredFallback: false, unknownFiltersRejected: true };
  } finally { reader.close(); }
}

async function run() {
  const timeout = setTimeout(() => { console.error("Lyft reader check timed out"); app.exit(1); }, 240000); timeout.unref();
  await mkdir(path.join(output, "lyft-profile"), { recursive: true });
  app.setPath("userData", path.join(output, "lyft-profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  try {
    const first = await coldScan();
    for (let attempt = 0; attempt < 2; attempt++) assert.deepEqual(ids((await coldScan()).jobs), ids(first.jobs));
    await compareRenderedPage(first);
    await failedFeedPreservesScope();
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = error.message; throw error; }
  finally {
    await writeFile(path.join(output, "lyft-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
  clearTimeout(timeout); app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

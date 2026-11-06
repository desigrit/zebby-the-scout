import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { scanBoard } from "../desktop/boards-scan.ts";

const output = path.resolve("qa-output/slack-board"), reports = [];
const source = "https://slack.com/careers/dept/product";
const errorPage = '<!doctype html><title>Server Error</title><h1>Server Error</h1><p>Sorry! Something went wrong.</p><a href="https://slack-status.com/">Status</a>';
const goodPage = '<!doctype html><title>Product careers</title><h1>Product</h1><p>1 open position</p><a href="https://salesforce.wd12.myworkdayjobs.com/en-US/Slack/job/Seattle/Product-Manager_JR123">Product Manager</a>';
async function runCase(name, responder, expected, abort = false) {
  const controller = new AbortController(), reader = new BoardBrowser(controller.signal);
  let requests = 0, calls = 0;
  await reader.window.webContents.session.protocol.handle("https", request => {
    if (new URL(request.url).pathname !== "/careers/dept/product") return new Response("", {status:404});
    const result = responder(++requests);
    if (abort && requests === 1) setTimeout(() => controller.abort(), 150);
    return new Response(result.body, {status: result.status, headers: {"content-type":"text/html; charset=utf-8", ...result.headers}});
  });
  const scan = () => scanBoard({ url: source, reader, signal: controller.signal, provider:"fixture", model:"observed-ids", progress(){},
    extract: async input => { calls++; assert.equal(input.task, "listings"); return { listingIds: input.candidates.map(item => item.id), nextControlId:"" }; } });
  if (expected.error) await assert.rejects(scan(), expected.error);
  else { const result = await scan(); assert.equal(result.jobs.length, 1); }
  assert.equal(requests, expected.requests, name + " request limit");
  assert.equal(calls, expected.calls, name + " model calls");
  reports.push({name, requests, modelCalls:calls});
}
async function run() {
  const timeout = setTimeout(() => { console.error("Unavailable-page checks timed out"); app.exit(1); }, 180000); timeout.unref();
  await mkdir(path.join(output, "unavailable-profile"), {recursive:true});
  app.setPath("userData", path.join(output, "unavailable-profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  await runCase("HTTP 500 never reaches AI", () => ({status:500, body:"<title>Careers</title><h1>Unavailable</h1>"}), {error:/temporarily unavailable/, requests:3, calls:0});
  await runCase("HTTP 200 server error never reaches AI", () => ({status:200, body:errorPage}), {error:/temporarily unavailable/, requests:3, calls:0});
  await runCase("Transient errors recover on the same filtered URL", count => ({status:count < 3 ? 503 : 200, body:count < 3 ? errorPage : goodPage}), {requests:3, calls:1});
  await runCase("HTTP 404 is not retried", () => ({status:404, body:"<title>Careers</title><h1>Missing</h1>"}), {error:/could not be found/, requests:1, calls:0});
  await runCase("Long Retry-After is preserved for a later check", () => ({status:503, body:errorPage, headers:{"Retry-After":"90"}}), {error:/temporarily unavailable/, requests:1, calls:0});
  await runCase("Cancellation stops the retry wait", () => ({status:503, body:errorPage}), {error:/abort/i, requests:1, calls:0}, true);
  await runCase("Error words in a real role do not block listings", () => ({status:200, body:goodPage.replace("Product Manager</a>", "Error Handling Product Manager</a>")}), {requests:1, calls:1});
  await writeFile(path.join(output, "unavailable-report.json"), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports)); clearTimeout(timeout); app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

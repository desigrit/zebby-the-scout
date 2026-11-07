import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { scanBoard } from "../desktop/boards-scan.ts";
import { isBoardActionLabel } from "../shared/board-listing-title.ts";

// Live website availability is recorded separately from a completed job scan.
// No credentials, paid model calls or personal databases are used.
const output = path.resolve("qa-output/slack-board");
async function run() {
  const timeout = setTimeout(() => { console.error("Slack reader check timed out"); app.exit(1); }, 180000); timeout.unref();
  await mkdir(path.join(output, "profile"), { recursive: true });
  app.setPath("userData", path.join(output, "profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  const url = "https://slack.com/careers/dept/product", controller = new AbortController();
  const reader = new BoardBrowser(controller.signal), tasks = [], responses = [];
  const report = { url, tasks, responses, status: "", error: "" };
  const read = reader.read.bind(reader);
  reader.read = async () => {
    const page = await read();
    report.observed = page.candidates.filter(item => item.url.includes(".myworkdayjobs.com/")).map(({ title, url, text }) => ({ title, url, text }));
    report.cards = await reader.window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('a[href*=".myworkdayjobs.com/"]')).filter(a => a.getClientRects().length).slice(0,5).map(a => (a.closest('tr,article') || a.parentElement.parentElement).outerHTML.slice(0,8000))`);
    return page;
  };
  reader.window.webContents.on("did-frame-navigate", (_event, target, status, _text, main) => { if (main) responses.push({ url: target, status }); });
  try {
    const result = await scanBoard({ url, reader, signal: controller.signal, provider: "coverage-test", model: "observed-ids", progress(message) { console.log(message); },
      extract: async input => {
        tasks.push(input.task);
        assert.equal(input.task, "listings", "The readable Slack job list should not need screenshot or navigation analysis");
        return { listingIds: input.candidates.map(item => item.id), nextControlId: "" };
      }
    });
    report.status = "complete"; report.jobs = result.jobs.length; report.pages = result.pages;
    report.listings = result.jobs.map(({ title, url }) => ({ title, url }));
    assert.ok(result.jobs.every(job => job.title && !isBoardActionLabel(job.title)), "Each Slack job has a role title, not a CTA");
    assert.ok(report.observed.every(job => job.title && !isBoardActionLabel(job.title)), "Visible Slack rows provide role names before URL recovery");
  } catch (error) {
    report.error = error.message;
    report.status = error.message === "This careers website is temporarily unavailable. Try again later." ? "website-unavailable" : "failed";
  } finally { reader.close(); }
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.notEqual(report.status, "failed", report.error);
  if (report.status === "website-unavailable") {
    assert.equal(tasks.length, 0, "An unavailable website must not start AI analysis");
    assert.ok(responses.length <= 3, "Retries are bounded");
  }
  clearTimeout(timeout); app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

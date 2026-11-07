import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { scanBoard } from "../desktop/boards-scan.ts";

const url = "https://zoox.com/careers?job=Product,+Features+%26+Homologation&type=Full-time#job-search-bottom";
const output = path.resolve("qa-output/board-layers");
const listing = value => /^https:\/\/jobs\.lever\.co\/zoox\/[0-9a-f-]{36}$/.test(value);
async function run() {
  const timeout = setTimeout(() => { console.error("Zoox reader check timed out"); app.exit(1); }, 180000); timeout.unref();
  await mkdir(path.join(output, "zoox-profile"), { recursive: true });
  app.setPath("userData", path.join(output, "zoox-profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  const signal = new AbortController().signal, reader = new BoardBrowser(signal);
  const report = { url, tasks: [], status: "pending" };
  const read = reader.read.bind(reader);
  reader.read = async () => {
    const page = await read();
    report.page = { url: page.url, expectedTotal: page.expectedTotal, visualNeeded: page.visualNeeded,
      visualCandidateUrls: page.visualCandidateUrls, controls: page.controls,
      listings: page.candidates.filter(item => listing(item.url)) };
    assert.equal(page.url, url, "The saved filters and fragment must survive");
    assert.match(page.summary, /Product, Features & Homologation/);
    assert.match(page.summary, /Full-time/i);
    assert.ok(page.expectedTotal > 0, "This reproduction needs a nonempty filtered board");
    assert.equal(report.page.listings.length, page.expectedTotal, "Every filtered job must have an observed link");
    assert.ok(report.page.listings.every(item => /Product, Features & Homologation/.test(item.text) && /FULL-TIME/.test(item.text)));
    await writeFile(path.join(output, "zoox-results.jpg"), (await reader.window.webContents.capturePage()).toJPEG(80));
    return page;
  };
  try {
    // The live DOM is checked against the provider's verified inventory shape.
    // No account credentials or model requests are used by this regression.
    const result = await scanBoard({ url, reader, signal, provider: "fixture", model: "observed-link-oracle", progress(message) { console.log(message); },
      extract: async input => {
        report.tasks.push(input.task);
        if (input.task === "inventory") return { decisions: Object.fromEntries(input.candidates.map(item => [item.id, listing(item.url) ? "listing" : "other"])) };
        assert.equal(input.task, "navigation", "A complete filtered inventory must not trigger a whole-page visual read");
        return { listingIds: [], nextControlId: "" };
      },
    });
    assert.equal(result.jobs.length, report.page.expectedTotal);
    report.status = "passed"; report.jobs = result.jobs;
  } catch (error) { report.status = "failed"; report.error = error.message; throw error; }
  finally {
    reader.close();
    await writeFile(path.join(output, "zoox-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
  clearTimeout(timeout); app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

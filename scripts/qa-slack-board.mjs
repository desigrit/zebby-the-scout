import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { scanBoard } from "../desktop/boards-scan.ts";

const output = path.resolve("qa-output/slack-board");
async function run() {
const timeout = setTimeout(() => { console.error("Slack reader check timed out"); app.exit(1); }, 180000); timeout.unref();
await mkdir(output, { recursive: true });
app.setPath("userData", path.join(output, "profile"));
app.on("window-all-closed", () => {});
await app.whenReady();
const url = "https://slack.com/careers/dept/product";
const controller = new AbortController();
const reader = new BoardBrowser(controller.signal);
const report = { url, tasks: [], page: null, error: "" };
report.responses = [];
reader.window.webContents.on("did-frame-navigate", (_event, target, status, _text, main) => { if (main) report.responses.push({ url: target, status }); });
try {
  const originalRead = reader.read.bind(reader);
  reader.read = async () => {
    const page = await originalRead();
    report.page = page;
    await writeFile(path.join(output, "page.json"), JSON.stringify(page, null, 2));
    const decorations = await reader.window.webContents.executeJavaScript(`(() => {
      const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
      return {
        opaqueLinks: [...document.querySelectorAll("a[href]")].filter(element => visible(element) && !element.innerText.trim() && !element.getAttribute("aria-label") && element.querySelector("img,svg,canvas")).map(element => ({url: element.href, html: element.outerHTML.slice(0, 2200), parent: element.parentElement?.outerHTML.slice(0, 3000)})),
        canvases: [...document.querySelectorAll("canvas")].filter(visible).map(element => ({html: element.outerHTML, parent: element.parentElement?.outerHTML.slice(0, 3000)}))
      };
    })()`);
    await writeFile(path.join(output, "decorations.json"), JSON.stringify(decorations, null, 2));
    return page;
  };
  const result = await scanBoard({ url, reader, signal: controller.signal, provider: "coverage-test", model: "observed-ids", progress(message) { console.log(message); },
    extract: async input => {
      report.tasks.push(input.task);
      if (input.task === "listings") return { listingIds: input.candidates.map(item => item.id), nextControlId: "" };
      if (input.task === "visual") {
        await writeFile(path.join(output, "first-visual.jpg"), Buffer.from(input.image.data, "base64"));
        await writeFile(path.join(output, "first-visual.json"), JSON.stringify({ ...input, image: undefined }, null, 2));
      }
      throw new Error("Diagnostic reached " + input.task + " analysis");
    }
  });
  report.result = result;
} catch (error) { report.error = error.message; }
finally { reader.close(); }
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({tasks: report.tasks, candidates: report.page?.candidates.length, visualNeeded: report.page?.visualNeeded, expectedTotal: report.page?.expectedTotal, error: report.error}));
const rootReader = new BoardBrowser(controller.signal);
try {
  await rootReader.open("https://slack.com/careers");
  const page = await rootReader.read();
  await writeFile(path.join(output, "root-page.json"), JSON.stringify(page, null, 2));
  const filters = await rootReader.window.webContents.executeJavaScript(`(() => ({
    selects: [...document.querySelectorAll("select")].map(element => ({name: element.name, id: element.id, html: element.outerHTML})),
    filters: [...document.querySelectorAll('input,button,a[href*="/careers/"]')].filter(element => /product|department|apply|job.listing/i.test(element.outerHTML)).map(element => element.outerHTML.slice(0, 3000)),
    careers: [...document.querySelectorAll('a[href*="myworkdayjobs"]')].slice(0, 3).map(element => element.parentElement?.parentElement?.outerHTML.slice(0, 8000))
  }))()`);
  await writeFile(path.join(output, "root-filters.json"), JSON.stringify(filters, null, 2));
  await writeFile(path.join(output, "root.html"), await rootReader.window.webContents.executeJavaScript("document.documentElement.outerHTML"));
} catch (error) { console.error("Root careers page: " + error.message); }
finally { rootReader.close(); }
clearTimeout(timeout);
app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

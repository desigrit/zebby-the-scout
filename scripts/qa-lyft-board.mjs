import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";

const url = "https://www.lyft.com/careers#openings?category=product";
const output = path.resolve("qa-output/board-layers");
async function run() {
  const timeout = setTimeout(() => { console.error("Lyft reader check timed out"); app.exit(1); }, 240000); timeout.unref();
  await mkdir(path.join(output, "lyft-profile"), { recursive: true });
  app.setPath("userData", path.join(output, "lyft-profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  const reader = new BoardBrowser(new AbortController().signal);
  const started = Date.now(), report = { url, snapshots: [], viewports: [], status: "pending" };
  const snapshot = reader.snapshot.bind(reader);
  reader.snapshot = async () => {
    const page = await snapshot();
    report.snapshots.push({ elapsed: Date.now() - started, expectedTotal: page.expectedTotal,
      loading: page.loading, atBottom: page.atBottom, height: page.height, scrollY: page.scrollY,
      candidates: page.candidates.map(item => ({ url: item.url, title: item.title })) });
    return page;
  };
  const describe = () => reader.window.webContents.executeJavaScript(`(() => ({
    url: location.href, text: document.body.innerText,
    scripts: [...document.scripts].map(item => item.src).filter(Boolean),
    resources: performance.getEntriesByType('resource').filter(item => /fetch|xmlhttprequest/.test(item.initiatorType)).map(item => item.name),
    inputs: [...document.querySelectorAll('select,input,[role=combobox],[aria-selected=true],[aria-checked=true]')].map(item => ({tag:item.tagName,role:item.getAttribute('role'),name:item.getAttribute('name'),value:item.value,text:item.innerText,aria:item.getAttribute('aria-label')})),
    openings: document.querySelector('#openings')?.outerHTML || ''
  }))()`);
  try {
    await reader.open(url);
    report.initial = await describe();
    report.documents = await reader.documents();
    report.page = await reader.read();
    report.loaded = await describe();
    await writeFile(path.join(output, "lyft-loaded.jpg"), (await reader.window.webContents.capturePage()).toJPEG(80));
    for await (const viewport of reader.visual()) {
      const { image, ...metadata } = viewport;
      report.viewports.push(metadata);
      await writeFile(path.join(output, "lyft-view-" + report.viewports.length + ".jpg"), Buffer.from(image.data, "base64"));
    }
    report.status = "captured";
  } catch (error) { report.status = "failed"; report.error = error.message; throw error; }
  finally {
    reader.close();
    await writeFile(path.join(output, "lyft-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, expectedTotal: report.page?.expectedTotal,
      candidates: report.page?.candidates, controls: report.page?.controls, viewports: report.viewports.length, error: report.error }));
  }
  clearTimeout(timeout); app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

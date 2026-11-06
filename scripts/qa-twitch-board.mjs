import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { lookup } from "node:dns/promises";
import { isPublicAddress } from "../lib/public-address.ts";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { captureBoardPage } from "../desktop/board-page.ts";

async function run() {
console.log("Twitch diagnostic starting");
setTimeout(() => { console.error("Twitch diagnostic exceeded its two-minute limit"); app.exit(1); }, 120000).unref();
const output = path.resolve("qa-output/twitch-reader");
await mkdir(path.join(output, "profile"), { recursive: true });
app.setPath("userData", path.join(output, "profile"));
app.on("window-all-closed", () => {});
await app.whenReady();
console.log("Twitch diagnostic Electron ready");
const source = "https://careers.twitch.com/en/careers";
const controller = new AbortController(), reader = new BoardBrowser(controller.signal);
const events = [], started = Date.now();
const cleanUrl = value => { const url = new URL(value); return url.origin + url.pathname; };
reader.window.webContents.session.webRequest.onCompleted(details => {
  if (["mainFrame", "subFrame", "xhr", "script"].includes(details.resourceType)) events.push({
    elapsed: Date.now() - started, url: cleanUrl(details.url), type: details.resourceType, status: details.statusCode });
});
reader.window.webContents.session.webRequest.onErrorOccurred(details => events.push({
  elapsed: Date.now() - started, url: cleanUrl(details.url), type: details.resourceType, error: details.error }));
async function inspect(label) {
  const result = await reader.window.webContents.executeJavaScript("(" + captureBoardPage.toString() + ")()");
  const dom = await reader.window.webContents.executeJavaScript("(" + (() => {
    const roles = [...document.querySelectorAll("a,button,[role=link],li,tr")].filter(element =>
      element.getClientRects().length && /\bproduct manager\b/i.test(element.innerText || ""));
    return {
      title: document.title, url: location.href, text: document.body.innerText.slice(0, 20000),
      anchors: document.querySelectorAll("a[href]").length,
      iframes: [...document.querySelectorAll("iframe")].map(frame => ({ src: frame.src, title: frame.title })),
      roleNodes: roles.filter(element => element.innerText.length < 700).slice(0, 20).map(element => ({
        html: element.outerHTML.slice(0, 3500), parent: element.parentElement?.outerHTML.slice(0, 5000) })),
      scripts: [...document.scripts].map(script => script.src).filter(Boolean),
      shadowRoots: [...document.querySelectorAll("*")].filter(element => element.shadowRoot).map(element => element.tagName)
    };
  }).toString() + ")()");
  await writeFile(path.join(output, label + ".json"), JSON.stringify({ result, dom }, null, 2));
  console.log(JSON.stringify({ label, elapsed: Date.now() - started, url: result.url, candidates: result.candidates,
    controls: result.controls, expectedTotal: result.expectedTotal, empty: result.empty, loading: result.loading,
    text: dom.text, anchors: dom.anchors, iframes: dom.iframes, roleNodes: dom.roleNodes, scripts: dom.scripts, shadowRoots: dom.shadowRoots }));
}
try {
  const addresses = await lookup(new URL(source).hostname, { all: true });
  console.log(JSON.stringify({ stage: "dns", addresses: addresses.map(item => ({ ...item, public: isPublicAddress(item.address) })) }));
  const response = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  console.log(JSON.stringify({ stage: "http", status: response.status, location: response.headers.get("location"), body: (await response.text()).slice(0, 1500) }));
  await reader.open(source);
  console.log(JSON.stringify({ stage: "opened", elapsed: Date.now() - started }));
  try {
    const page = await reader.read();
    console.log(JSON.stringify({ stage: "reader-complete", elapsed: Date.now() - started, page }));
  } catch(error) { console.log(JSON.stringify({ stage: "reader-error", elapsed: Date.now() - started, error: error.message })); }
  await inspect("initial");
  await new Promise(resolve => setTimeout(resolve, 5000)); await inspect("after-5-seconds");
  await new Promise(resolve => setTimeout(resolve, 10000)); await inspect("after-15-seconds");
  console.log(JSON.stringify({ events }));
  await writeFile(path.join(output, "network.json"), JSON.stringify(events, null, 2));
} catch(error) { console.error(error); process.exitCode = 1; }
finally {
  console.log(JSON.stringify({ stage: "final", navigationError: reader.navigationError, events }));
  await writeFile(path.join(output, "network.json"), JSON.stringify(events, null, 2));
  reader.close(); app.exit(process.exitCode || 0);
}

}
void run().catch(error => { console.error(error); app.exit(1); });

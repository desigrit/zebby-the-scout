import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

// Compose a flow board from unmodified renderer captures. Run after capturing
// synthetic screens: node scripts/build-screen-flow.mjs <capture-directory>.
const source = path.resolve(process.argv[2] || (existsSync("work/polish-captures/manifest.json") ? "work/polish-captures" : "docs/screenshots"));
const destination = path.resolve("docs/screenshots");
const working = path.resolve("work/polish-flow");
await mkdir(working, { recursive: true });
await mkdir(destination, { recursive: true });
const names = ["startup", "plan", "plan-input", "move-to-applied", "new-application", "applications", "settings",
  "settings-server", "settings-models", "credits", "plan-dark", "applications-dark", "settings-dark", "credits-dark"];
const manifest = JSON.parse(await readFile(path.join(source, existsSync(path.join(source, "manifest.json")) ? "manifest.json" : "capture-manifest.json"), "utf8"));
manifest.screenshotNames = names.map((name) => `${name}.png`);
await writeFile(path.join(destination, "capture-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const images = {};
for (const name of names) {
  const buffer = await sharp(path.join(source, `${name}.png`)).png({ compressionLevel: 9 })
    .withMetadata({ comments: [`Zebby ${manifest.version}; synthetic data; current compiled renderer; Windows CSS; headless Chromium at 2x.`] })
    .toBuffer();
  await writeFile(path.join(destination, `${name}.png`), buffer);
  images[name] = `data:image/png;base64,${buffer.toString("base64")}`;
}
const W = 2778, H = 1330;
const screenWidth = 810, screenHeight = screenWidth * 960 / 1550;
function screen({ x, y, name, title }) {
  return `<g transform="translate(${x},${y})">
    <text x="0" y="-26" class="screen-title">${title}</text>
    <image href="${images[name]}" width="${screenWidth}" height="${screenHeight}" clip-path="inset(0 round 12px)"/>
    <rect width="${screenWidth}" height="${screenHeight}" rx="12" fill="none" stroke="#ddd7d0" stroke-width="1.5"/>
  </g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">Zebby screen flow</title>
  <desc id="desc">From OOBE, prepare a role in Plan mode or add a New application directly. Both lead to Applications stats. Open Settings to choose how to analyze.</desc>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M2 1 L8 5 L2 9" fill="none" stroke="#b4b4b4" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></marker>
  </defs>
  <style>
    text{font-family:'Segoe UI',Arial,sans-serif;fill:#302c29}
    .screen-title{font-size:32px;font-weight:600;letter-spacing:-.5px}
    .route{fill:none;stroke:#b4b4b4;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .directed{marker-end:url(#arrow)}
  </style>
  <rect width="${W}" height="${H}" fill="#f8f6f3"/>

  <!-- Unlabelled paths stay in the gutters between equal-sized screens. -->
  <path class="route" d="M886 669 H916 Q930 669 930 655 V367 Q930 353 944 353"/>
  <path class="route directed" d="M944 353 H972"/>
  <path class="route directed" d="M930 655 V1001 Q930 1015 944 1015 H972"/>
  <path class="route directed" d="M1806 353 H1892"/>
  <path class="route" d="M1806 1015 H1834 Q1848 1015 1848 1001 V367 Q1848 353 1862 353"/>
  <path class="route directed" d="M2309 616 V750"/>

  ${screen({ x: 64, y: 418, name: "startup", title: "OOBE" })}
  ${screen({ x: 984, y: 102, name: "plan", title: "Plan mode" })}
  ${screen({ x: 984, y: 764, name: "new-application", title: "New application" })}
  ${screen({ x: 1904, y: 102, name: "applications", title: "Applications stats" })}
  ${screen({ x: 1904, y: 764, name: "settings", title: "Settings" })}
</svg>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Zebby screen flow</title><style>*{box-sizing:border-box}body{margin:0;background:#f8f6f3}svg{display:block}</style>${svg}</html>`;
await writeFile(path.join(working, "screen-flow.html"), html);
const executablePath = process.env.PM_TRACKER_BROWSER || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.join(working, "screen-flow.html")).href);
  await page.evaluate(async () => { await document.fonts.ready; });
  const buffer = await page.screenshot();
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(path.join(destination, "screen-flow.png"));
  await sharp(buffer).resize({ width: 2200 }).png({ compressionLevel: 9 }).toFile(path.join(destination, "screen-flow-overview.png"));
} finally { await browser.close(); }
console.log(JSON.stringify({ flow: path.join(destination, "screen-flow.png"), resolution: `${W * 2} x ${H * 2}`, screens: names.length }));

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { LOCAL_MODELS } from "../desktop/local-model-catalog.ts";

// Capture the shipping renderer with an isolated, in-memory desktop bridge.
// Never opens Electron, a user profile, a database, or a payment session.
// Run from the repository root after desktop:build, using Node 22.13 or later.
const destination = path.resolve(process.argv[2] || "qa-output/microsoft-store");
const screenshotDirectory = path.join(destination, "Screenshots");
const artworkDirectory = path.join(destination, "Store artwork");
const renderer = path.resolve("desktop-dist/renderer");
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const today = "2026-10-31";
const now = `${today}T18:00:00Z`;
const executablePath = process.env.PM_TRACKER_BROWSER || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
const viewport = { width: 1550, height: 960 };
const description = "About the role\n\nHelp people discover products that fit their needs. Partner with design, engineering, and research to turn customer insight into a clear product strategy.\n\nWhat you will do\n• Lead customer discovery and define the roadmap.\n• Build and test new search and recommendation experiences.\n• Set meaningful success metrics and evaluate experiments.\n• Bring cross-functional teams together around customer outcomes.\n\nWhat you bring\n• Experience delivering consumer products from discovery to launch.\n• Clear written communication and sound product judgment.\n• A track record of using research and data to make decisions.";
const summary = "Product manager with seven years of experience building consumer products. I connect customer research, product strategy, and thoughtful experimentation to help teams deliver useful experiences and measurable growth.";
const resume = { id: "resume-1", filename: "Product Manager CV.pdf", contentType: "application/pdf", size: 248600, createdAt: "2026-10-01T12:00:00Z" };
const companies = ["Northstar", "Meridian", "Threadline", "Fieldwork", "Daybreak", "Arc Studio", "Lattice Works", "Waypoint"];
const titles = ["Senior Product Manager", "Product Manager", "Lead Product Manager", "Product Manager, Growth", "Principal Product Manager"];
const dailyCounts = [0, 2, 1, 0, 3, 1, 4, 0, 2, 3, 1, 0, 5, 2, 1, 3, 0, 4, 2, 3, 6, 0, 2, 4, 1, 0, 3, 5, 2, 4];
const applications = dailyCounts.flatMap((count, day) => Array.from({ length: count }, (_, index) => {
  const sequence = dailyCounts.slice(0, day).reduce((sum, value) => sum + value, 0) + index;
  const appliedDate = new Date(Date.parse(`${today}T12:00:00Z`) - (29 - day) * 86400000).toISOString().slice(0, 10);
  const status = sequence % 19 === 0 ? "Offer received" : sequence % 7 === 0 ? "Interview scheduled" : sequence % 5 === 0 ? "Heard back" : sequence % 4 === 0 ? "Rejected" : "Applied";
  return { id: `application-${sequence}`, company: companies[sequence % companies.length], title: titles[sequence % titles.length],
    team: ["Consumer experience", "Search & discovery", "Growth", "Platform"][sequence % 4],
    locations: sequence % 3 === 0 ? "Seattle, WA; San Francisco, CA" : sequence % 3 === 1 ? "Remote" : "New York, NY",
    listingUrl: `https://example.org/careers/product-${sequence}`, jobDescription: description,
    notes: "Conversation with the hiring team\n\nFocus: product discovery, experimentation, and collaboration with design.\n\nQuestions to ask\n• How does the team choose which customer problems to pursue?\n• What would success look like in the first six months?",
    snapshotText: description, snapshotSource: "page", snapshotCapturedAt: `${appliedDate}T12:00:00Z`, appliedDate,
    matchStrength: 72 + (sequence * 7 % 24), matchNotes: "Your resume shows strong evidence of product strategy, customer discovery, and cross-functional delivery. Experiment design is relevant, but clearer examples of search and recommendation work would strengthen the match.",
    matchAnalyzedAt: now, resumeId: resume.id, resumeName: resume.filename, status,
    createdAt: `${appliedDate}T${String(10 + index).padStart(2, "0")}:00:00Z`, updatedAt: now };
})).reverse();
Object.assign(applications[0], { company: "Northstar", title: "Senior Product Manager", team: "Search & discovery", matchStrength: 88, status: "Interview scheduled" });
const plan = { id: "plan-1", listingUrl: "https://example.org/careers/senior-product-manager", company: "Northstar", title: "Senior Product Manager", team: "Search & discovery", locations: "Seattle, WA; Remote",
  description, snapshotText: description, snapshotSource: "page", snapshotCapturedAt: now, currentOverview: summary, resumeId: resume.id,
  keywords: ["Product strategy", "Customer discovery", "Experimentation", "Search & recommendations", "Roadmap prioritization", "Cross-functional leadership"],
  themes: ["Turn customer insight into product direction", "Connect experiments to measurable outcomes", "Lead through design and engineering partnerships", "Balance discovery with focused delivery", "Make complex experiences feel simple"],
  keywordImportance: [96, 94, 91, 89, 87, 86], themeImportance: [96, 93, 90, 87, 83],
  overview: "Product manager with seven years of experience shaping consumer products through customer discovery, product strategy, and experimentation. I partner with design and engineering to turn customer insights into focused roadmaps and measurable improvements to the product experience.",
  overviewRationale: "Brings customer discovery and experimentation forward, while keeping the summary grounded in your experience.",
  matchStrength: 88, matchNotes: "Your resume demonstrates product strategy, customer discovery, and cross-functional delivery. The main opportunity is to show more direct evidence of search and recommendation work. Clearer examples of experiment design and measured outcomes would strengthen the application.",
  matchAnalyzedAt: now, createdAt: "2026-10-30T12:00:00Z", updatedAt: now };
const plans = [plan, ...["Meridian", "Fieldwork", "Threadline", "Daybreak"].map((company, index) => ({ ...plan, id: `plan-${index + 2}`, company,
  title: ["Lead Product Manager", "Product Manager", "Principal Product Manager", "Product Manager, Growth"][index],
  updatedAt: new Date(Date.parse(now) - (index + 1) * 86400000).toISOString() }))];
const dailyUsage = Array.from({ length: 84 }, (_, index) => {
  const count = index % 7 === 0 || index < 13 ? 0 : [0, 1, 2, 0, 3, 1, 1, 0, 2][index % 9];
  return { date: new Date(Date.parse(`${today}T00:00:00Z`) - (83 - index) * 86400000).toISOString().slice(0, 10), count, cost: Math.round(count * (2.8 + index % 5 * 1.15) * 1000000) };
});
const used = dailyUsage.reduce((sum, day) => sum + day.cost, 0);
const state = { filePath: "C:\\Users\\Alex\\Documents\\Zebby\\Applications.sqlite", filename: "Applications.sqlite", dirty: false, startupError: "",
  hasApiKey: true, hasAnthropicKey: false, apiKeyHint: "sk-••••••••7K4P", anthropicKeyHint: "", thinkingLevels: {}, openaiModel: "gpt-6.1-sol", anthropicModel: "claude-sonnet-5-5",
  credits: { available: true, signedIn: true, email: "", stale: false, error: "", model: "gpt-6.1-sol", recoverySaved: true, pendingConnection: false,
    wallet: { balance: 3000000000 - used, reserved: 0, used, purchased: 3000000000, astraUnlocked: true,
      completedAnalyses: dailyUsage.reduce((sum, day) => sum + day.count, 0), dailyUsage, updatedAt: now,
      recent: [5.7, 1.2, 14.8, 6.3, 1.1, 5.9, 4.2, 1.4, 7.8, 6.1].map((cost, index) => ({ id: `usage-${index}`,
        model: ["gpt-6.1-sol", "gpt-6-luna", "gpt-6-astra", "gpt-6.1-sol"][index % 4], kind: index % 3 ? "match" : "plan", cost: Math.round(cost * 1000000),
        createdAt: new Date(Date.parse(now) - index * 86400000).toISOString() })) },
    access: { hasRecoveryCode: true, recoveryVersion: "11111111-1111-4111-8111-111111111111", devices: [
      { id: "22222222-2222-4222-8222-222222222222", name: "Windows desktop", current: true, createdAt: "2026-10-01T12:00:00Z", lastSeenAt: now },
      { id: "33333333-3333-4333-8333-333333333333", name: "MacBook Air", current: false, createdAt: "2026-10-12T12:00:00Z", lastSeenAt: "2026-10-30T15:00:00Z" }] } },
  analysisProvider: "credits", ollamaUrl: "http://localhost:11434", ollamaModel: "qwen3:8b", canSaveApiKey: true,
  appearance: "light", sidebarCollapsed: false, logsPath: "", platform: "win32", distributionChannel: "store",
  builtInModelId: "qwen3-4b", acceptedModelTerms: [], localModels: LOCAL_MODELS.map(({ id, bytes }) =>
    ({ id, status: ["qwen3-4b", "qwen3-06b"].includes(id) ? "ready" : "not-installed", downloadedBytes: ["qwen3-4b", "qwen3-06b"].includes(id) ? bytes : 0, error: "" })),
  modelsFolder: "C:\\Users\\Alex\\AppData\\Local\\Packages\\Zebby\\LocalState\\Models", localEngine: { status: "idle", modelId: "" }, totalMemory: 32e9, availableMemory: 16e9,
  localCompute: { status: "ready", backend: "vulkan", devices: [{ id: "Vulkan0", name: "NVIDIA GeForce RTX 4070", memory: 12e9, freeMemory: 10e9 }],
    availableMemory: 16e9, recommendedModelIds: ["qwen3-8b", "qwen3-4b"] },
  updates: { currentVersion: version, checking: false, checkedAt: now, error: "", available: null, download: { phase: "idle", received: 0, total: 0, error: "" } } };

await Promise.all([mkdir(screenshotDirectory, { recursive: true }), mkdir(artworkDirectory, { recursive: true })]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const filename = path.resolve(renderer, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!filename.startsWith(renderer + path.sep)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" })[path.extname(filename)] || "application/octet-stream" }); response.end(await readFile(filename)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const captures = [];
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, timezoneId: "America/Los_Angeles", locale: "en-US", reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date(now));
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(initialState => {
    const listeners = new Set();
    const snapshot = () => structuredClone(initialState);
    const notify = () => { for (const listener of listeners) listener(snapshot()); return snapshot(); };
    const noop = async () => {};
    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
    window.storeCapture = { state: initialState, notify };
    window.desktop = {
      state: async () => snapshot(), onDatabaseChanged: () => () => {}, onNavigate: () => () => {}, onAnalysisProgress: () => () => {},
      onLocalModelsChanged: subscribe, onUpdatesChanged: () => () => {}, onCreditsChanged: subscribe,
      refreshCredits: async () => snapshot(), refreshCreditAccess: async () => snapshot(),
      confirmUpdateLoaded: noop, openLogs: noop, openModelFolder: noop, openStoreUpdates: noop, checkForUpdates: async () => initialState.updates,
      chooseDatabase: async () => null, downloadResume: async () => true, warmCreditsService: noop,
      setAnalysisProvider: async provider => { initialState.analysisProvider = provider; return snapshot(); },
      setAppearance: async appearance => { initialState.appearance = appearance; return snapshot(); },
      setSidebarCollapsed: async collapsed => { initialState.sidebarCollapsed = collapsed; return snapshot(); },
      setThinkingLevel: async ({ provider, model, level }) => { initialState.thinkingLevels[JSON.stringify(provider === "ollama" ? [provider, initialState.ollamaUrl, model] : [provider, model])] = level; return snapshot(); },
      setOnlineModel: async (provider, model) => { if (provider === "credits") initialState.credits.model = model; else initialState[provider === "openai" ? "openaiModel" : "anthropicModel"] = model; return snapshot(); },
      setOllamaConfig: async ({ url, model }) => { initialState.ollamaUrl = url; initialState.ollamaModel = model; return snapshot(); },
      listOllamaModels: async () => ["qwen3:8b", "qwen3:4b"],
      ollamaThinkingCapability: async () => ({ options: [{ value: "off", label: "Off" }, { value: "on", label: "On" }], defaultValue: "on", known: true }),
      selectLocalModel: async id => { initialState.builtInModelId = id; return snapshot(); },
      cancelAnalysis: async () => true, saveCreditRecoveryCode: async () => ({ saved: true, state: snapshot() }),
      createCreditPairing: async () => ({ code: "ABCD2345", expiresAt: new Date(Date.now() + 600000).toISOString() }),
      cancelCreditPairing: noop,
      startCreditCheckout: async () => { throw new Error("Payment is disabled in the capture fixture."); },
      quoteCreditAnalysis: async () => { throw new Error("Analysis is disabled in the capture fixture."); },
    };
  }, state);
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") { await route.abort(); throw new Error(`External request blocked: ${url.origin}`); }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    let data;
    if (url.pathname === "/api/applications") data = { applications };
    else if (url.pathname === "/api/plans") data = { plans, lastCurrentOverview: summary };
    else if (url.pathname === "/api/resumes") data = { resumes: [resume] };
    else if (url.pathname === "/api/locations/recent") data = { locations: ["Seattle, WA", "San Francisco, CA", "Remote", "New York, NY"] };
    else throw new Error(`Unexpected capture API: ${url.pathname}`);
    await route.fulfill({ json: data });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
  const nav = page.getByRole("navigation", { name: "Workspace" });
  async function capture(filename, caption) {
    await page.mouse.move(1500, 40);
    await page.evaluate(async () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: path.join(screenshotDirectory, filename) });
    captures.push({ file: filename, caption });
  }
  await nav.getByRole("button", { name: "Applications", exact: true }).click();
  await page.locator(".application-row").first().waitFor();
  await page.locator(".application-row-select").first().click();
  await capture("01-applications.png", "Track applications, hiring stages, and daily activity. Open a role to see its details and match score.");
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.locator(".plan-item").first().click();
  await capture("03-plan-workspace.png", "Bring a job posting and your resume together. Save a plan, then move it to Applied with its analysis intact.");
  await page.locator(".plan-document-scroll").evaluate(element => {
    const target = element.querySelector(".analysis-section");
    element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top - 24;
  });
  await capture("02-resume-direction.png", "Review resume match, core ATS keywords, job priorities, and suggested edits to your summary.");
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  const provider = page.getByRole("combobox", { name: "Analyze with", exact: true });
  await provider.selectOption("openai");
  await capture("04-your-model-your-key.png", "Use your own OpenAI or Anthropic API key. Choose the model and supported thinking level in Settings.");
  await provider.selectOption("builtin");
  await page.getByRole("combobox", { name: "Local model", exact: true }).waitFor();
  await capture("05-local-models.png", "Download a model for local analysis. Zebby recommends models for your hardware and uses supported GPU acceleration.");
  await provider.selectOption("credits");
  await page.getByRole("button", { name: "Manage credits", exact: true }).click();
  await page.getByRole("dialog", { name: "Credits and devices", exact: true }).waitFor();
  await capture("06-credits-and-devices.png", "See your credit balance, connected computers, and analysis history. Keep access with a recovery code.");
  await page.getByRole("button", { name: "Close credits and devices", exact: true }).click();
  await page.getByRole("button", { name: "Buy credits", exact: true }).click();
  await page.getByRole("heading", { name: "A little fuel for your next move", exact: true }).waitFor();
  await capture("07-optional-credits.png", "Optional Zebby credits provide online analysis without an API key or signup. Choose a pack when you need it.");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Appearance", exact: true }).getByRole("radio", { name: "Dark", exact: true }).check();
  await nav.getByRole("button", { name: "Applications", exact: true }).click();
  await page.locator(".application-row-select").first().click();
  await capture("08-applications-dark.png", "Switch between light and dark appearance while keeping your applications, notes, and progress close at hand.");
  assert.deepEqual(errors, [], "The captured renderer must have no uncaught errors.");
} finally { await browser.close(); server.close(); }

const approvedIcon = await readFile("public/brand-icon.png");
await sharp(approvedIcon).resize(300, 300).png().toFile(path.join(artworkDirectory, "Zebby-Store-icon-300.png"));
await sharp(approvedIcon).resize(1080, 1080).png().toFile(path.join(artworkDirectory, "Zebby-icon-master-1080.png"));
// Store super-hero artwork contains no text or app UI. Preserve the approved raster art.
const heroIcon = await sharp(approvedIcon).resize(1450, 1450).png().toBuffer();
await sharp({ create: { width: 3840, height: 2160, channels: 4, background: "#f0ece6" } })
  .composite([{ input: heroIcon, left: 1195, top: 220 }]).png().toFile(path.join(artworkDirectory, "Zebby-hero-3840x2160.png"));
const rendererAssets = await readdir(path.join(renderer, "assets"));
const rendererDigest = createHash("sha256");
for (const filename of rendererAssets.sort()) {
  rendererDigest.update(filename); rendererDigest.update(await readFile(path.join(renderer, "assets", filename)));
}
const manifest = { version, sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  rendererAssetsSha256: rendererDigest.digest("hex"), capturedAt: new Date().toISOString(), viewport, deviceScaleFactor: 2, screenshots: [] };
for (const entry of captures.sort((a, b) => a.file.localeCompare(b.file))) {
  const filename = path.join(screenshotDirectory, entry.file);
  const bytes = await readFile(filename);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 3100); assert.equal(metadata.height, 1920); assert.ok(bytes.length < 50 * 1024 * 1024);
  assert.ok(entry.caption.length <= 200); assert.ok(!entry.caption.includes("\u2014"));
  manifest.screenshots.push({ ...entry, width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(path.join(screenshotDirectory, "capture-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(path.join(screenshotDirectory, "captions-en-US.txt"), manifest.screenshots.map(({ file, caption }) => `${file}\n${caption}\n`).join("\n"));
const artworkManifest = { source: "public/brand-icon.png", sourceSha256: createHash("sha256").update(approvedIcon).digest("hex"),
  treatment: "Approved zebra artwork, resized without changing the art. Hero adds the existing Ember sidebar background.", images: [] };
for (const file of ["Zebby-Store-icon-300.png", "Zebby-icon-master-1080.png", "Zebby-hero-3840x2160.png"]) {
  const bytes = await readFile(path.join(artworkDirectory, file)), metadata = await sharp(bytes).metadata();
  artworkManifest.images.push({ file, width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(path.join(artworkDirectory, "asset-manifest.json"), JSON.stringify(artworkManifest, null, 2) + "\n");
const listing = JSON.parse(await readFile("docs/microsoft-store/listing-en-US.json", "utf8"));
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
await mkdir(path.join(destination, "Listing metadata"), { recursive: true });
await writeFile(path.join(destination, "Listing metadata", "Listing preview.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zebby | Microsoft Store listing</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f6f3;color:#302c29;font:16px/1.6 "Segoe UI",Arial,sans-serif}
main{max-width:1180px;margin:auto;padding:64px 36px 80px}header{display:flex;align-items:center;gap:28px;margin-bottom:36px}
header img{width:104px;height:104px}h1{font-size:40px;line-height:1.1;margin:0 0 9px;font-weight:650;letter-spacing:-.02em}
header p{margin:0;color:#71675f}h2{font-size:21px;font-weight:650;margin:0 0 18px}h3{font-size:15px;margin:0 0 4px}
.summary{font-size:23px;max-width:780px;line-height:1.45;margin:0 0 16px}.free{display:inline-block;color:#a64a34;background:#f8e8e1;border-radius:7px;padding:5px 12px;font-size:14px}
section{margin-top:42px}.screens{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
figure{margin:0;min-width:0}figure a{display:block;border:1px solid #ddd7d0;border-radius:12px;overflow:hidden;background:white}
figure img{display:block;width:100%;height:auto}figcaption{font-size:13px;color:#71675f;line-height:1.45;padding:11px 1px 0}
.details{display:grid;grid-template-columns:1.25fr 1fr;gap:70px;border-top:1px solid #ddd7d0;padding-top:34px}
.details p{margin:0 0 22px;font-size:15px;white-space:pre-line}.details ul{padding-left:20px;font-size:15px}.details li{padding-bottom:8px}
.links{display:flex;gap:24px;flex-wrap:wrap;border-top:1px solid #ddd7d0;padding-top:24px}a{color:#a64a34;text-underline-offset:4px}
@media(max-width:760px){main{padding:32px 20px}.screens,.details{grid-template-columns:1fr}.details{gap:24px}header{gap:18px}header img{width:72px;height:72px}h1{font-size:32px}.summary{font-size:20px}}
</style></head><body><main><header><img src="../Store%20artwork/Zebby-Store-icon-300.png" alt="Zebby zebra"><div><h1>Zebby</h1><p>Desigrit Labs · Productivity</p></div></header>
<p class="summary">${escape(listing.shortDescription)}</p><span class="free">Free · Optional credit purchases</span>
<section aria-label="Screenshots"><div class="screens">${manifest.screenshots.map(item => `<figure><a href="../Screenshots/${item.file}"><img src="../Screenshots/${item.file}" alt="${escape(item.caption)}" loading="lazy"></a><figcaption>${escape(item.caption)}</figcaption></figure>`).join("")}</div></section>
<section class="details"><div><h2>About Zebby</h2>${listing.description.split("\n\n").map(paragraph => `<p>${escape(paragraph)}</p>`).join("")}</div><div><h2>Features</h2><ul>${listing.features.map(feature => `<li>${escape(feature)}</li>`).join("")}</ul></div></section>
<section class="links"><a href="${listing.website}">Project</a><a href="${listing.support}">Support</a><a href="Privacy%20policy.md">Privacy policy</a><a href="Certification%20notes.txt">Certification notes</a></section></main></body></html>`);
console.log(`Created ${manifest.screenshots.length} Store screenshots and approved-icon artwork in ${destination}`);

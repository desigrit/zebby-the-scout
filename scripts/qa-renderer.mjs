import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
import { LOCAL_MODELS } from "../desktop/local-model-catalog.ts";
import { importanceForTerms } from "../desktop/plan-importance.ts";

// Checks the compiled renderer with synthetic data in an invisible browser.
// It does not launch Electron, read settings, or open an application database.
const renderer = path.resolve("desktop-dist/renderer");
const output = path.resolve("qa-output/renderer-1.3.0");
const executablePath = process.env.PM_TRACKER_BROWSER || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((candidate) => existsSync(candidate));
const description = "Responsibilities\n\n• Lead discovery and product strategy\n• Prioritize roadmap work with design and engineering\n\nQualifications\n\nExperience delivering products and measuring customer outcomes.";
const resume = { id: "resume-1", filename: "Sample Product CV.pdf", contentType: "application/pdf", size: 4, createdAt: "2026-09-01T12:00:00Z" };
const base = { team: "", listingUrl: "https://example.org/jobs/pm", jobDescription: description, notes: description,
  snapshotText: description, snapshotSource: "page", snapshotCapturedAt: "2026-09-29T12:00:00Z",
  appliedDate: "2026-09-29", matchStrength: 92, matchNotes: "Strong product strategy experience.", matchAnalyzedAt: "2026-09-29T12:00:00Z",
  resumeId: resume.id, resumeName: resume.filename, status: "Applied", createdAt: "2026-09-29T12:00:00Z", updatedAt: "2026-09-29T12:00:00Z" };
let applications = [
  { ...base, id: "app-1", company: "Expedia Group", title: "Senior Product Manager", team: "Search & Recommendations Quality", locations: "Seattle, WA, United States" },
  { ...base, id: "app-2", company: "Meta", title: "Product Manager", locations: "Sunnyvale, CA; Bellevue, WA; Redmond, WA; Menlo Park, CA; Burlingame, CA; New York, NY; Seattle, WA; San Francisco, CA" },
  ...Array.from({ length: 9 }, (_, index) => ({ ...base, id: `older-${index}`, company: "Northstar Labs", title: "Product Manager",
    locations: "Remote", appliedDate: `2026-09-${String(6 + index * 2).padStart(2, "0")}`, matchStrength: index % 2 ? 83 : null, resumeId: "", resumeName: "",
    status: index % 3 ? "Applied" : "Heard back" })),
];
let plan = { id: "plan-1", listingUrl: "https://example.org/jobs/pm", company: "Expedia Group", title: "Senior Product Manager", team: "Growth", locations: "Seattle, WA",
  description, snapshotText: description, snapshotSource: "page", snapshotCapturedAt: "2026-09-29T12:00:00Z",
  currentOverview: "I help teams find customer needs and build useful products with clear priorities.", resumeId: resume.id,
  keywords: ["Product strategy", "Customer discovery", "Roadmap", "Analytics", "Prioritization", "Leadership"], themes: ["Lead discovery", "Shape strategy", "Prioritize roadmap", "Measure outcomes", "Align teams"],
  keywordImportance: [96, 94, 89, 82, 80, 73], themeImportance: [95, 92, 87, 81, 76],
  overview: "I help teams find customer needs and build useful products with clear priorities.", overviewRationale: "The overview already reflects discovery and priorities.",
  matchStrength: 84, matchAnalyzedAt: "2026-09-29T12:00:00Z", createdAt: "2026-09-29T12:00:00Z", updatedAt: "2026-09-29T12:00:00Z" };
let plans = [plan];
let lastCurrentOverview = plan.currentOverview;
const state = { filePath: "example.sqlite", filename: "Applications.sqlite", dirty: false, startupError: "", hasApiKey: false,
  analysisProvider: "ollama", ollamaUrl: "http://localhost:11434", ollamaModel: "qwen3.8:27b", canSaveApiKey: true,
  backupsPath: "", appearance: "light", sidebarCollapsed: false, captureLogs: false, logsPath: "", platform: "win32",
  builtInModelId: "", acceptedModelTerms: [], localModels: LOCAL_MODELS.map(({ id }) =>
    ({ id, status: "not-installed", downloadedBytes: 0, error: "" })), modelsFolder: "example/Models",
  localEngine: { status: "idle", modelId: "" }, totalMemory: 32e9, availableMemory: 16e9 };
const pending = new Map();
const requested = new Map();
async function completeAnalysis(pathname) {
  if (!pending.has(pathname)) await new Promise((resolve) => requested.set(pathname, resolve));
  pending.get(pathname)();
}
const server = createServer(async (request, response) => {
  const file = path.resolve(renderer, `.${new URL(request.url, "http://localhost").pathname === "/" ? "/index.html" : new URL(request.url, "http://localhost").pathname}`);
  if (!file.startsWith(renderer + path.sep)) { response.writeHead(403); response.end(); return; }
  try {
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(file)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": mime }); response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
let browser;
try {
  await mkdir(output, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1550, height: 850 }, timezoneId: "America/Los_Angeles", locale: "en-US" });
  await page.clock.setFixedTime(new Date("2026-09-30T20:00:00Z"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function captureSettings(filename, fullPage = true) {
    await page.evaluate(async () => {
      window.scrollTo({ top: 0, behavior: "instant" });
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter((animation) =>
        animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined)));
    });
    await page.screenshot({ path: path.join(output, filename), fullPage });
  }
  async function captureAnalysis(filename, docsFilename) {
    const viewport = page.viewportSize();
    await page.setViewportSize({ ...viewport, height: 1200 });
    const section = page.locator(".analysis-section");
    await section.evaluate((element) => window.scrollTo({
      top: element.getBoundingClientRect().top + window.scrollY - 68, behavior: "instant",
    }));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter((animation) =>
        animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined)));
    });
    await section.screenshot({ path: path.join(output, filename) });
    if (process.env.ZEBBY_CAPTURE_DOCS && docsFilename) await page.screenshot({ path: path.join(output, docsFilename) });
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  await page.addInitScript(({ initialState, licenseVersions }) => {
    const listeners = new Set();
    const snapshot = () => structuredClone(initialState);
    const update = (id, change) => { initialState.localModels = initialState.localModels.map((item) =>
      item.id === id ? { ...item, ...change } : item); for (const listener of listeners) listener(snapshot()); };
    window.modelQA = { confirmDelete: false, deleteRequests: [], selections: [], rejectSidebarSave: false, update,
      setPlatform: (platform) => { initialState.platform = platform; } };
    window.desktop = { state: async () => initialState, onDatabaseChanged: () => () => {}, onNavigate: () => () => {},
      onLocalModelsChanged: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      downloadResume: async () => true,
      listOllamaModels: async () => ["qwen3.8:27b", "qwen3:8b"],
      setAnalysisProvider: async (provider) => { initialState.analysisProvider = provider; return snapshot(); },
      setAppearance: async (appearance) => { initialState.appearance = appearance; return snapshot(); },
      setSidebarCollapsed: async (collapsed) => {
        if (window.modelQA.rejectSidebarSave) throw new Error("Synthetic settings save error");
        initialState.sidebarCollapsed = collapsed; return snapshot();
      },
      selectLocalModel: async (id) => { window.modelQA.selections.push(id); initialState.builtInModelId = id;
        if ((!licenseVersions[id] || initialState.acceptedModelTerms.includes(id)) &&
          initialState.localModels.find((item) => item.id === id).status !== "ready")
          update(id, { status: "downloading", downloadedBytes: 0, error: "" }); return snapshot(); },
      pauseModelDownload: async () => { for (const item of initialState.localModels)
        if (["downloading", "verifying"].includes(item.status)) update(item.id, { status: "paused" }); return snapshot(); },
      resumeModelDownload: async (id, termsVersion) => {
        if (licenseVersions[id] && !initialState.acceptedModelTerms.includes(id)) {
          if (termsVersion !== licenseVersions[id]) throw new Error("Review the model terms first.");
          initialState.acceptedModelTerms.push(id);
        }
        if (initialState.localModels.find((item) => item.id === id).status !== "ready")
          update(id, { status: "downloading", error: "" }); return snapshot(); },
      deleteLocalModel: async (id) => { window.modelQA.deleteRequests.push(id);
        if (window.modelQA.confirmDelete) update(id, { status: "not-installed", downloadedBytes: 0, error: "" }); return snapshot(); },
      openModelFolder: async () => "",
    };
  }, { initialState: state, licenseVersions: Object.fromEntries(LOCAL_MODELS.filter((model) => model.license)
    .map((model) => [model.id, model.license.version])) });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data;
    if (pathname === "/api/applications") data = { applications };
    else if (pathname === "/api/job-posting") data = { details: { company: "Example", title: "Product Manager", team: "", locations: "Remote" }, text: description };
    else if (pathname === "/api/resumes") data = { resumes: [resume] };
    else if (pathname === "/api/plans" && method === "GET") data = { plans, lastCurrentOverview };
    else if (pathname === "/api/plans" && method === "POST") {
      const input = route.request().postDataJSON();
      const saved = { ...plan, ...input, id: `plan-${plans.length + 1}`, keywordImportance: [], themeImportance: [], matchStrength: null,
        matchAnalyzedAt: "", overviewRationale: "", updatedAt: "2026-09-30T20:00:00Z" };
      plans = [saved, ...plans]; lastCurrentOverview = saved.currentOverview;
      data = { plan: saved };
    }
    else if (pathname.endsWith("/analyze")) {
      await new Promise((resolve) => { pending.set(pathname, resolve); requested.get(pathname)?.(); requested.delete(pathname); });
      pending.delete(pathname);
      if (pathname.startsWith("/api/applications/")) {
        const id = pathname.split("/")[3];
        applications = applications.map((item) => item.id === id ? { ...item, matchStrength: 89, updatedAt: "2026-09-30T20:00:00Z" } : item);
        data = { application: applications.find((item) => item.id === id) };
      } else { plan = { ...plan, matchStrength: 86 }; plans = plans.map((item) => item.id === plan.id ? plan : item); data = { plan }; }
    } else if (pathname.startsWith("/api/plans/") && method === "PUT") {
      const id = pathname.split("/")[3];
      const previous = plans.find((item) => item.id === id);
      const input = route.request().postDataJSON();
      const saved = { ...previous, ...input,
        keywordImportance: importanceForTerms(previous.keywords, previous.keywordImportance, input.keywords),
        themeImportance: importanceForTerms(previous.themes, previous.themeImportance, input.themes), updatedAt: "2026-09-30T20:00:00Z" };
      plans = plans.map((item) => item.id === id ? saved : item); if (id === plan.id) plan = saved;
      lastCurrentOverview = saved.currentOverview; data = { plan: saved };
    } else if (pathname.endsWith("/notes") && method === "PATCH") {
      const id = pathname.split("/")[3];
      applications = applications.map((item) => item.id === id ? { ...item, notes: route.request().postDataJSON().notes } : item);
      data = { application: applications.find((item) => item.id === id) };
    } else if (pathname.startsWith("/api/applications/") && method === "PATCH") {
      const id = pathname.split("/")[3];
      const input = route.request().postDataJSON();
      applications = applications.map((item) => item.id === id ? { ...item, ...input, notes: item.notes } : item);
      data = { application: applications.find((item) => item.id === id) };
    } else throw new Error(`Unexpected mock API request: ${method} ${pathname}`);
    await route.fulfill({ json: data });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
  assert.equal(await page.title(), "Zebby");
  assert.equal(await page.locator(".desktop-titlebar").innerText(), "Zebby");
  assert.equal(await page.locator(".sidebar-brand").innerText(), "");
  const chrome = await page.locator(".desktop-titlebar").evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    background: getComputedStyle(element).backgroundColor,
    drag: getComputedStyle(element).getPropertyValue("-webkit-app-region"),
    sidebar: getComputedStyle(document.querySelector(".titlebar-sidebar")).backgroundColor,
    sidebarBody: getComputedStyle(document.querySelector(".desktop-sidebar")).backgroundColor,
  }));
  assert.equal(chrome.height, 44);
  assert.equal(chrome.background, "rgb(244, 245, 247)");
  assert.equal(chrome.drag, "drag");
  assert.equal(chrome.sidebar, chrome.sidebarBody);
  assert.equal(await page.getByRole("heading", { name: "Plan", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Refresh analysis" }).click();
  await page.getByRole("status", { name: "Analyzing role" }).waitFor();
  assert.doesNotMatch(await page.locator(".match-result").innerText(), /Analyzing|Calculating|84%/);
  await completeAnalysis("/api/plans/plan-1/analyze");
  await page.locator(".match-result").getByText("86%").waitFor();
  const keywordRows = page.locator(".recommendations-keywords .recommendation-row");
  const themeRows = page.locator(".recommendations-themes .recommendation-row");
  assert.equal(await keywordRows.first().locator(".recommendation-importance").innerText(), "96%");
  assert.equal(await themeRows.first().locator(".recommendation-importance").innerText(), "95%");
  assert.equal(await page.getByText("Percentages estimate importance to the job.", { exact: false }).count(), 1);
  assert.equal(await page.locator(".brand-mark").evaluate((element) => element.complete && element.naturalWidth > 0), true);
  await captureSettings("plan-windows-light.png");
  const overviewBeforeCollapse = await page.getByRole("textbox", { name: "Current CV Overview", exact: true }).inputValue();
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".sidebar-toggle")?.getAttribute("aria-expanded") === "false" && !document.querySelector(".sidebar-toggle")?.disabled);
  assert.equal(await nav.locator(".nav-label").first().isVisible(), false);
  assert.equal(await nav.getByRole("button", { name: "Plan", exact: true }).isVisible(), true);
  assert.equal(await page.locator(".desktop-sidebar").evaluate((element) => element.getBoundingClientRect().width), 96);
  assert.equal(await page.locator(".titlebar-sidebar").evaluate((element) => element.getBoundingClientRect().width), 96);
  assert.equal(await page.getByRole("textbox", { name: "Current CV Overview", exact: true }).inputValue(), overviewBeforeCollapse);
  assert.equal(await page.evaluate(async () => (await window.desktop.state()).sidebarCollapsed), true);
  await captureSettings("plan-windows-collapsed-light.png");
  await page.getByRole("button", { name: "Expand navigation", exact: true }).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).waitFor();
  assert.equal(await nav.locator(".nav-label").first().isVisible(), true);
  await captureAnalysis("plan-analysis-light.png", "readme-plan.png");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await captureSettings("plan-windows-dark.png");
  await captureAnalysis("plan-analysis-dark.png");
  await page.setViewportSize({ width: 1050, height: 900 });
  await captureSettings("plan-windows-compact.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 790, height: 850 });
  await captureSettings("plan-windows-narrow.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1550, height: 850 });
  // Percentages survive CV edits but become unknown when the job or term changes.
  const currentOverview = page.getByRole("textbox", { name: "Current CV Overview", exact: true });
  const originalOverview = await currentOverview.inputValue();
  await currentOverview.fill("I lead product teams and measure customer outcomes.");
  assert.equal(await keywordRows.first().locator(".recommendation-importance").innerText(), "96%");
  await currentOverview.fill(originalOverview);
  await page.getByRole("textbox", { name: "Core ATS keyword 1", exact: true }).fill("Product vision");
  assert.equal(await keywordRows.first().locator(".recommendation-importance").innerText(), "Unrated");
  assert.equal(await keywordRows.nth(1).locator(".recommendation-importance").innerText(), "94%");
  await page.getByRole("textbox", { name: "Core ATS keyword 1", exact: true }).fill("Product strategy");
  await page.getByRole("textbox", { name: "Company", exact: true }).fill("Changed company");
  assert.equal(await page.locator(".recommendation-importance:not(.unrated)").count(), 0);
  await page.getByRole("textbox", { name: "Company", exact: true }).fill("Expedia Group");
  await page.getByRole("button", { name: "Add keyword", exact: true }).click();
  await page.getByRole("textbox", { name: "Core ATS keyword 7", exact: true }).fill("SQL");
  assert.equal(await keywordRows.last().locator(".recommendation-importance").innerText(), "Unrated");
  await page.getByRole("button", { name: "Remove keyword 7", exact: true }).click();
  await page.getByRole("button", { name: "New plan", exact: true }).click();
  assert.equal(await currentOverview.inputValue(), originalOverview);
  assert.equal(await page.getByText("Unsaved changes", { exact: true }).count(), 0);
  assert.equal(await keywordRows.count(), 0);
  await currentOverview.fill("I lead discovery and turn evidence into clear product decisions.");
  await page.getByRole("textbox", { name: "Job listing link", exact: true }).fill("https://example.org/new-role");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await page.getByText("Plan saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New plan", exact: true }).click();
  assert.equal(await currentOverview.inputValue(), lastCurrentOverview);
  assert.equal(lastCurrentOverview, "I lead discovery and turn evidence into clear product decisions.");
  await page.getByRole("button", { name: /Senior Product Manager.*Expedia Group.*Edited/ }).click();
  assert.equal(await currentOverview.inputValue(), originalOverview, "Opening an existing plan keeps that plan's overview.");
  const savedPriority = plan.keywordImportance;
  plan = { ...plan, keywordImportance: [], themeImportance: [] }; plans = [plan, ...plans.filter((item) => item.id !== plan.id)];
  await page.reload();
  await page.getByRole("textbox", { name: "Core ATS keyword 1", exact: true }).waitFor();
  assert.equal(await page.locator(".recommendation-importance:not(.unrated)").count(), 0);
  plan = { ...plan, keywordImportance: savedPriority, themeImportance: [95, 92, 87, 81, 76] }; plans = plans.map((item) => item.id === plan.id ? plan : item);
  await page.reload();
  await page.getByRole("textbox", { name: "Core ATS keyword 1", exact: true }).waitFor();
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await nav.getByRole("button", { name: "Applications", exact: true }).click();
  await page.getByRole("main", { name: "Applications", exact: true }).waitFor();
  const table = page.getByRole("table");
  await table.getByText("Expedia Group", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Applications", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Analyze again" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Saved copy" }).count(), 0);
  assert.equal(await page.locator(".activity-day").count(), 30);
  assert.match(await page.locator(".activity-caption").innerText(), /11 applications/);
  const today = page.getByRole("button", { name: "Sep 30, 2026: 0 applications", exact: true });
  await today.focus(); await today.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Sep 29, 2026: 2 applications");
  await page.locator(".activity-day:focus").press("Home");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Sep 1, 2026: 0 applications");
  await page.getByRole("button", { name: "Show all 8 locations" }).click();
  const expanded = page.locator(".location-expanded");
  assert.equal(await expanded.locator(".location-place").count(), 8);
  assert.equal(await expanded.isVisible(), true);
  await page.getByRole("button", { name: "Hide extra locations" }).click();
  assert.equal(await expanded.isVisible(), false);
  await page.getByRole("button", { name: "Edit Senior Product Manager at Expedia Group" }).click();
  await page.getByLabel("Team", { exact: true }).fill("Search & Recommendations");
  await page.getByRole("button", { name: "Notes for Senior Product Manager at Expedia Group" }).click();
  const notes = page.getByRole("dialog", { name: "Application notes" }).getByRole("textbox", { name: "Notes" });
  assert.equal(await notes.inputValue(), description);
  await notes.fill(`${description}\n\nRecruiter: Sam`);
  await captureSettings("notes.png", false);
  await page.getByRole("button", { name: "Save notes" }).click();
  await page.getByText("Notes saved.").waitFor();
  assert.equal(applications[0].notes, `${description}\n\nRecruiter: Sam`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Application updated.").waitFor();
  assert.equal(applications[0].notes, `${description}\n\nRecruiter: Sam`);
  await page.getByRole("button", { name: "Refresh match for Senior Product Manager at Expedia Group" }).click();
  await page.getByRole("status", { name: "Analyzing resume match" }).waitFor();
  assert.equal(await table.locator(".match-cell").first().innerText(), "");
  assert.equal(await table.getByRole("button", { name: "Refresh match for Product Manager at Meta" }).count(), 1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await captureSettings("applications-light.png", false);
  await page.getByRole("button", { name: "Refresh match for Product Manager at Meta" }).click();
  assert.equal(await table.getByRole("status", { name: "Analyzing resume match" }).count(), 2);
  await completeAnalysis("/api/applications/app-1/analyze");
  await completeAnalysis("/api/applications/app-2/analyze");
  await table.getByText("89%").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".match-progress").length === 0);
  await captureSettings("applications-ready-light.png", false);
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  await page.getByRole("button", { name: "Expand navigation", exact: true }).waitFor();
  await captureSettings("applications-collapsed-light.png", false);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await captureSettings("applications-collapsed-dark.png", false);
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).waitFor();
  if (process.env.ZEBBY_CAPTURE_DOCS) {
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("button", { name: "Applications", exact: true }).click();
    await page.getByRole("button", { name: "Add application", exact: true }).waitFor();
    await page.mouse.move(30, 30);
    await captureSettings("readme-applications.png", false);
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await captureSettings("applications-dark.png", false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Refresh match for Senior Product Manager at Expedia Group" }).click();
  await page.getByRole("status", { name: "Analyzing resume match" }).waitFor();
  assert.equal(await page.locator(".match-progress-arc").evaluate((element) => getComputedStyle(element).animationName), "none");
  await completeAnalysis("/api/applications/app-1/analyze");
  await page.waitForFunction(() => document.querySelectorAll(".match-progress").length === 0);
  await page.setViewportSize({ width: 1050, height: 900 });
  await captureSettings("applications-compact.png", false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await table.locator("thead").isVisible(), false);
  assert.equal(await table.locator(".actions-cell").first().evaluate((element) => element.getBoundingClientRect().right <= innerWidth), true);
  await page.setViewportSize({ width: 780, height: 900 });
  await captureSettings("applications-narrow.png", false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  // Provider choice, download lifecycle, deletion cancellation, and reuse.
  // The native confirmation itself is covered in the model removal tests.
  await page.setViewportSize({ width: 1440, height: 960 });
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const provider = page.getByRole("combobox", { name: "Provider", exact: true });
  await page.getByRole("combobox", { name: "Model", exact: true }).getByRole("option", { name: "qwen3.8:27b", exact: true }).waitFor({ state: "attached" });
  await provider.selectOption("builtin");
  const localModel = page.getByRole("combobox", { name: "Local model", exact: true });
  assert.equal(await localModel.getByRole("option").count(), LOCAL_MODELS.length + 1);
  assert.equal(await page.getByRole("button", { name: /Delete SmolLM2/ }).count(), 0);
  await localModel.selectOption("smollm2-360m");
  await page.getByText("Downloading SmolLM2 360M", { exact: true }).waitFor();
  await page.evaluate(() => window.modelQA.update("smollm2-360m", { downloadedBytes: 81000000 }));
  await page.getByText("81 MB / 271 MB", { exact: true }).waitFor();
  const progress = page.getByRole("progressbar", { name: "SmolLM2 360M download progress" });
  assert.equal(await progress.getAttribute("max"), "270590880");
  await captureSettings("settings-windows-download.png");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByText("Download paused", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Resume download", exact: true }).click();
  await page.evaluate(() => window.modelQA.update("smollm2-360m", { status: "error", error: "The download stopped early. Choose Retry download to continue." }));
  await page.getByRole("alert").getByText(/stopped early/).waitFor();
  await page.getByRole("button", { name: "Retry download", exact: true }).click();
  await page.evaluate(() => window.modelQA.update("smollm2-360m", { status: "verifying", downloadedBytes: 270590880 }));
  await page.getByText("Checking download", { exact: true }).waitFor();
  await page.evaluate(() => window.modelQA.update("smollm2-360m", { status: "ready" }));
  await page.getByText("Ready for offline analysis", { exact: true }).waitFor();
  assert.equal(await progress.count(), 0);
  const deleteModel = page.getByRole("button", { name: "Delete SmolLM2 360M", exact: true });
  await deleteModel.click(); // Simulated native Cancel result.
  assert.equal(await page.getByText("Ready for offline analysis", { exact: true }).count(), 1);
  await provider.selectOption("openai");
  await page.getByRole("textbox", { name: "API key", exact: true }).waitFor();
  await provider.selectOption("ollama");
  assert.equal(await page.getByRole("textbox", { name: "Server URL", exact: true }).inputValue(), "http://localhost:11434");
  assert.equal(await page.getByRole("combobox", { name: "Model", exact: true }).inputValue(), "qwen3.8:27b");
  await provider.selectOption("builtin");
  assert.equal(await page.getByText("Ready for offline analysis", { exact: true }).count(), 1);
  await captureSettings("settings-windows-ready.png");
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByText("Compact mode uses basic keyword coverage and limited overview suggestions.").waitFor();
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await captureSettings("settings-windows-dark.png");
  await localModel.selectOption("qwen3-4b");
  await page.evaluate(() => window.modelQA.update("qwen3-4b", { status: "ready", downloadedBytes: 2497280256 }));
  await page.getByText("Other downloads (1)").click();
  await page.getByRole("button", { name: "Delete SmolLM2 360M", exact: true }).waitFor();
  await page.setViewportSize({ width: 790, height: 850 });
  await captureSettings("settings-windows-compact.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.evaluate(() => { window.modelQA.confirmDelete = true; });
  await page.getByRole("button", { name: "Delete SmolLM2 360M", exact: true }).click();
  assert.equal(await page.getByText("Other downloads (1)").count(), 0);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(() => { window.modelQA.setPlatform("darwin"); });
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  if (process.env.ZEBBY_CAPTURE_DOCS) await captureSettings("readme-settings.png", false);
  await page.getByText("Delete downloaded models here before removing the app from your Mac.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: /uninstall/i }).count(), 0);
  await captureSettings("settings-mac-ready.png");
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  await page.getByRole("button", { name: "Expand navigation", exact: true }).waitFor();
  await captureSettings("settings-mac-collapsed-light.png");
  await page.getByRole("button", { name: "Database settings", exact: true }).click();
  assert.equal(await nav.getByRole("button", { name: "Settings", exact: true }).getAttribute("aria-current"), "page");
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).waitFor();
  await page.setViewportSize({ width: 790, height: 850 });
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await captureSettings("settings-mac-compact-dark.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  // The newly added models require explicit agreement before download.
  for (const id of ["lfm25-350m", "gemma3-270m"]) {
    await page.evaluate((platform) => window.modelQA.setPlatform(platform), id === "lfm25-350m" ? "win32" : "darwin");
    await page.setViewportSize(id === "lfm25-350m" ? { width: 1440, height: 960 } : { width: 790, height: 850 });
    await page.getByRole("radio", { name: id === "lfm25-350m" ? "Light" : "Dark", exact: true }).check();
    await localModel.selectOption(id);
    await page.getByText("Review model terms to continue", { exact: true }).waitFor();
    assert.equal(await page.getByRole("progressbar").count(), 0);
    assert.equal(await page.getByRole("link", { name: "Model terms", exact: true }).getAttribute("target"), "_blank");
    if (id === "gemma3-270m") {
      assert.equal(await page.getByRole("link", { name: "Use restrictions", exact: true }).getAttribute("href"),
        "https://ai.google.dev/gemma/prohibited_use_policy");
    }
    await captureSettings(`settings-${id}-terms.png`);
    await page.getByRole("button", { name: "Agree and download", exact: true }).click();
    await page.getByText(`Downloading ${LOCAL_MODELS.find((model) => model.id === id).name}`, { exact: true }).waitFor();
    await page.evaluate(({ id, bytes }) => window.modelQA.update(id, { status: "ready", downloadedBytes: bytes }),
      { id, bytes: LOCAL_MODELS.find((model) => model.id === id).bytes });
    await page.getByText("Ready for offline analysis", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Agree and download", exact: true }).count(), 0);
    await nav.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByText(`Analysis runs on this computer with ${LOCAL_MODELS.find((model) => model.id === id).name}.`, { exact: false }).waitFor();
    assert.equal(await page.getByText("Compact mode uses basic keyword coverage and limited overview suggestions.").count(), 0);
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await captureSettings(`settings-${id}-ready.png`);
  }
  await page.setViewportSize({ width: 1550, height: 850 });
  await page.evaluate(() => window.modelQA.setPlatform("darwin"));
  await provider.selectOption("ollama");
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("textbox", { name: "Core ATS keyword 1", exact: true }).waitFor();
  await captureSettings("plan-mac-light.png");
  await page.setViewportSize({ width: 790, height: 850 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await captureSettings("plan-mac-compact-dark.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.evaluate(() => { window.modelQA.rejectSidebarSave = true; });
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Could not save the navigation preference. Try again." }).waitFor();
  assert.equal(await page.locator(".desktop-shell").evaluate((element) => element.classList.contains("sidebar-collapsed")), false);
  await page.evaluate(() => { window.modelQA.rejectSidebarSave = false; });
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  await page.getByRole("button", { name: "Expand navigation", exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").filter({ hasText: "Could not save the navigation preference. Try again." }).count(), 0);
  await captureSettings("plan-mac-collapsed-dark.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(`Headless renderer checks passed. No desktop app was launched. Screenshots: ${output}`);
} finally {
  for (const resolve of pending.values()) resolve();
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

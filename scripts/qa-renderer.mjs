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
const output = path.resolve("qa-output/renderer-1.5.0");
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
  matchStrength: 84, matchNotes: "", matchAnalyzedAt: "2026-09-29T12:00:00Z", createdAt: "2026-09-29T12:00:00Z", updatedAt: "2026-09-29T12:00:00Z" };
let plans = [plan];
let lastCurrentOverview = plan.currentOverview;
const state = { filePath: "example.sqlite", filename: "Applications.sqlite", dirty: false, startupError: "", hasApiKey: false,
  hasAnthropicKey: false, openaiModel: "gpt-6.1-sol", anthropicModel: "claude-sonnet-5-5",
  credits: { available: false, signedIn: false, email: "", wallet: null, stale: true, error: "", model: "gpt-6-luna",
    access: null, recoverySaved: false, pendingConnection: false },
  analysisProvider: "ollama", ollamaUrl: "http://localhost:11434", ollamaModel: "qwen3.8:27b", canSaveApiKey: true,
  appearance: "light", sidebarCollapsed: false, logsPath: "", platform: "win32",
  builtInModelId: "", acceptedModelTerms: [], localModels: LOCAL_MODELS.map(({ id }) =>
    ({ id, status: "not-installed", downloadedBytes: 0, error: "" })), modelsFolder: "example/Models",
  localEngine: { status: "idle", modelId: "" }, totalMemory: 32e9, availableMemory: 16e9,
  updates: { currentVersion: "1.5.0", checking: false, checkedAt: "", error: "", available: null,
    download: { phase: "idle", received: 0, total: 0, error: "" } } };
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
  async function assertApplicationMetrics() {
    const geometry = await page.locator(".application-row").evaluateAll((rows) => rows.slice(0, 4).map((row) => {
      const metrics = row.querySelector(".application-row-metrics"), date = metrics.firstElementChild, match = metrics.lastElementChild;
      const summary = row.querySelector(".application-row-summary"), main = row.querySelector(".application-row-main");
      const controls = [main, date, match, summary.querySelector(".status-select"), summary.querySelector(".row-actions")];
      const boxes = controls.map((element) => element.getBoundingClientRect());
      const gaps = boxes.slice(1).map((box, index) => box.left - boxes[index].right);
      const mid = boxes[0].top + boxes[0].height / 2;
      const buttons = [...summary.querySelectorAll(".row-actions > button")];
      const meta = main.querySelector(".application-row-meta").getBoundingClientRect();
      const heading = main.querySelector(".application-row-select").getBoundingClientRect();
      const location = main.querySelector(".role-context")?.getBoundingClientRect(), listing = main.querySelector(".listing-link")?.getBoundingClientRect();
      return { dateFirst: date.tagName === "TIME", matchSecond: match.classList.contains("match-control"), gaps,
        lineOffset: Math.max(...[...controls, ...buttons].map((element) => { const b = element.getBoundingClientRect(); return Math.abs(b.top + b.height / 2 - mid); })),
        actionCount: buttons.length, twoRows: heading.bottom < meta.top && heading.height < 26,
        metadataOffset: location && listing ? Math.abs(location.top + location.height / 2 - listing.top - listing.height / 2) : 0,
        width: summary.clientWidth, overflow: row.scrollWidth > row.clientWidth };
    }));
    assert.ok(geometry.length);
    for (const row of geometry) {
      assert.equal(row.dateFirst && row.matchSecond, true);
      assert.ok(row.gaps.every((gap) => gap >= 7) && Math.max(...row.gaps) - Math.min(...row.gaps) <= 1, `Evenly separated groups ${JSON.stringify(row)}`);
      if (row.width >= 850) assert.ok(row.gaps[1] > 64);
      assert.ok(row.lineOffset <= 1, "Date, match, status and all actions vertically center on the job block");
      assert.equal(row.actionCount, 3); assert.equal(row.twoRows, true); assert.ok(row.metadataOffset <= 1, JSON.stringify(row));
      assert.equal(row.overflow, false);
    }
  }
  async function captureSettings(filename, fullPage = true) {
    await page.evaluate(async () => {
      window.scrollTo({ top: 0, behavior: "instant" });
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter((animation) =>
        animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined)));
    });
    if (filename.startsWith("credits-") && await page.locator(".analysis-dialog[open]").count()) {
      const bounds = await page.locator(".analysis-dialog[open]").evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(bounds.x >= 16 && bounds.y >= 16, "Analysis dialogs leave space around the window edges");
      assert.ok(Math.abs(bounds.x + bounds.width / 2 - bounds.viewportWidth / 2) <= 1, "Analysis dialogs center horizontally");
      assert.ok(Math.abs(bounds.y + bounds.height / 2 - bounds.viewportHeight / 2) <= 1, "Analysis dialogs center vertically");
    }
    await page.screenshot({ path: path.join(output, filename), fullPage });
  }
  async function settleSidebar() {
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter((animation) =>
        animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined)));
    });
  }
  async function assertLocationKeyboard(editor, label) {
    const add = editor.getByRole("button", { name: "Add location", exact: true });
    await add.click();
    const input = editor.getByRole("textbox", { name: "New location", exact: true });
    for (const location of ["Portland, OR", "Austin, TX"]) {
      assert.equal(await input.evaluate((element) => document.activeElement === element), true, `${label}: input gets focus`);
      await input.fill(location); await input.press("Enter");
      assert.equal(await editor.locator(".location-chip").filter({ hasText: location }).count(), 1);
      assert.equal(await add.evaluate((element) => document.activeElement === element), true, `${label}: focus returns to plus`);
      assert.equal(await add.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(248, 232, 225)");
      await page.keyboard.press("Enter");
    }
    await input.press("Enter");
    assert.equal(await input.isVisible(), true, "Blank Enter stays in the input");
    await input.press("Escape");
    assert.equal(await add.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press("Enter");
    await editor.getByRole("button", { name: "Cancel adding location", exact: true }).click();
    assert.equal(await add.evaluate((element) => document.activeElement === element), true);
    for (const location of ["Portland, OR", "Austin, TX"]) await editor.getByRole("button", { name: `Remove ${location}`, exact: true }).click();
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
    window.controlsQA = { copied: "", failCopy: false };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => {
      if (window.controlsQA.failCopy) throw new Error("Synthetic clipboard failure");
      window.controlsQA.copied = text;
    } }, configurable: true });
    const listeners = new Set(), updateListeners = new Set(), creditListeners = new Set();
    const snapshot = () => structuredClone(initialState);
    const update = (id, change) => { initialState.localModels = initialState.localModels.map((item) =>
      item.id === id ? { ...item, ...change } : item); for (const listener of listeners) listener(snapshot()); };
    const updateState = (change) => {
      initialState.updates = { ...initialState.updates, ...change };
      for (const listener of updateListeners) listener(structuredClone(initialState.updates));
    };
    const updateCredits = (change) => {
      initialState.credits = { ...initialState.credits, ...change };
      for (const listener of creditListeners) listener(snapshot());
    };
    const wallet = { balance: 500000000, reserved: 0, used: 0, purchased: 500000000,
      updatedAt: "2026-09-30T20:00:00Z", recent: [] };
    const firstDevice = { id: "11111111-1111-4111-8111-111111111111", name: "Windows desktop", current: true,
      createdAt: "2026-09-30T20:00:00Z", lastSeenAt: "2026-09-30T20:00:00Z" };
    const secondDevice = { ...firstDevice, id: "22222222-2222-4222-8222-222222222222", name: "Mac laptop", current: false };
    const walletAccess = { hasRecoveryCode: false, recoveryVersion: null, devices: [firstDevice] };
    window.creditQA = { update: updateCredits, checkouts: [], models: [], connections: [], recoverySaves: [],
      cancelRecovery: false, confirmDisconnect: false, disconnects: [], pairingCancelled: 0, payment: "open", quote: null,
      resumeMode: "none", failedResumes: 0 };
    window.modelQA = { confirmDelete: false, deleteRequests: [], selections: [], rejectSidebarSave: false,
      updateState, installRequests: 0, failInstall: false, failCheck: false, finishDownload: null,
      logOpens: 0, failLogOpen: false, databaseRequests: [], update,
      setPlatform: (platform) => { initialState.platform = platform; } };
    window.desktop = { state: async () => initialState, onDatabaseChanged: () => () => {}, onNavigate: () => () => {},
      onLocalModelsChanged: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      onUpdatesChanged: (listener) => { updateListeners.add(listener); return () => updateListeners.delete(listener); },
      onCreditsChanged: (listener) => { creditListeners.add(listener); return () => creditListeners.delete(listener); },
      refreshCredits: async () => {
        if (window.creditQA.resumeMode === "error") { window.creditQA.failedResumes++; throw new Error("Connection interrupted. Retry when online."); }
        if (window.creditQA.resumeMode === "complete") updateCredits({ signedIn: true, pendingConnection: false, wallet: { ...wallet }, access: walletAccess, error: "", stale: false });
        return snapshot();
      },
      refreshCreditAccess: async () => snapshot(),
      saveCreditRecoveryCode: async (rotate = false) => {
        window.creditQA.recoverySaves.push(rotate);
        if (window.creditQA.cancelRecovery) return { saved: false, state: snapshot() };
        updateCredits({ recoverySaved: true, access: { ...initialState.credits.access, hasRecoveryCode: true,
          recoveryVersion: "33333333-3333-4333-8333-333333333333" } });
        return { saved: true, state: snapshot() };
      },
      connectCreditWallet: async (kind, code) => {
        window.creditQA.connections.push({ kind, code });
        if (code === "BAD-CODE") throw new Error("That pairing code was used or expired. Generate a new code on your other computer.");
        updateCredits({ access: { ...initialState.credits.access, devices: [firstDevice, secondDevice] } });
        return { connected: true, state: snapshot() };
      },
      createCreditPairing: async () => ({ code: "ABCD2345", expiresAt: new Date(Date.now() + 600000).toISOString() }),
      cancelCreditPairing: async () => { window.creditQA.pairingCancelled++; },
      removeCreditDevice: async (id) => {
        window.creditQA.disconnects.push(id);
        if (window.creditQA.confirmDisconnect) updateCredits({ access: { ...initialState.credits.access,
          devices: initialState.credits.access.devices.filter((item) => item.id !== id) } });
        return snapshot();
      },
      startCreditCheckout: async (pack) => { window.creditQA.checkouts.push(pack);
        updateCredits({ signedIn: true, wallet: { ...wallet, balance: 0, purchased: 0 }, access: walletAccess, stale: false });
        return { id: "cs_test_fixture", mode: "test" }; },
      creditCheckoutStatus: async () => {
        if (window.creditQA.payment === "paid") updateCredits({ wallet: { ...wallet }, stale: false });
        return window.creditQA.payment;
      },
      quoteCreditAnalysis: async () => window.creditQA.quote || { id: "quote-fixture", model: initialState.credits.model,
        maximum: 20000000, expiresAt: "2026-09-30T20:05:00Z" },
      setOnlineModel: async (provider, model) => {
        window.creditQA.models.push({ provider, model });
        if (provider === "credits") updateCredits({ model });
        else if (provider === "openai") initialState.openaiModel = model;
        else initialState.anthropicModel = model;
        return snapshot();
      },
      confirmUpdateLoaded: async () => {},
      checkForUpdates: async () => {
        updateState({ checking: true }); await new Promise(resolve => setTimeout(resolve, 25));
        updateState({ checking: false, checkedAt: new Date().toISOString(), error: window.modelQA.failCheck ? "Could not check for updates. Try again." : "" });
        return structuredClone(initialState.updates);
      },
      downloadUpdate: async () => {
        updateState({ download: { phase: "downloading", received: 40, total: 100, error: "" } });
        await new Promise(resolve => { window.modelQA.finishDownload = resolve; });
        return structuredClone(initialState.updates);
      },
      installUpdate: async () => { window.modelQA.installRequests++;
        if (window.modelQA.failInstall) throw new Error("Synthetic database save failure. Try again.");
        updateState({ download: { phase: "installing", received: 100, total: 100, error: "" } });
      },
      downloadResume: async () => true,
      chooseDatabase: async (kind) => { window.modelQA.databaseRequests.push(kind); return null; },
      openLogs: async () => { if (window.modelQA.failLogOpen) throw new Error("Synthetic logs folder error"); window.modelQA.logOpens++; },
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
        matchAnalyzedAt: "", matchNotes: "", overviewRationale: "", updatedAt: "2026-09-30T20:00:00Z" };
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
      } else { plan = { ...plan, matchStrength: 86,
        matchNotes: "Customer discovery and roadmap delivery are well demonstrated in the selected resume. The posting asks for deeper experimentation experience than the resume shows." };
        plans = plans.map((item) => item.id === plan.id ? plan : item); data = { plan }; }
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
  assert.equal(chrome.background, "rgb(248, 246, 243)");
  assert.equal(chrome.drag, "drag");
  assert.equal(chrome.sidebar, chrome.sidebarBody);
  assert.equal(await page.getByRole("heading", { name: "Plan", exact: true }).count(), 0);
  const sidebarPosition = await page.locator(".desktop-sidebar").evaluate((element) => ({
    padding: getComputedStyle(element).paddingTop,
    brandBottom: getComputedStyle(element.querySelector(".sidebar-brand")).paddingBottom,
    zebraTop: element.querySelector(".brand-mark").getBoundingClientRect().top - element.getBoundingClientRect().top,
    zebraLeft: element.querySelector(".brand-mark").getBoundingClientRect().left - element.getBoundingClientRect().left,
    iconSize: element.querySelector(".navigation-icon").getBoundingClientRect().width,
    navHeight: element.querySelector("nav button").getBoundingClientRect().height,
  }));
  assert.deepEqual(sidebarPosition, { padding: "22px", brandBottom: "12px", zebraTop: 26, zebraLeft: 26, iconSize: 24, navHeight: 48 });
  await page.waitForFunction(() => [...document.querySelectorAll('.navigation-icon')].every(icon => icon.dataset.ready === "true"));
  assert.equal(await nav.locator('.navigation-icon-player svg').count(), 3);
  const animatedPlan = nav.locator('[data-kind="plan"]');
  // Compare painted geometry with subpixel tolerance rather than serialized
  // SVG bookkeeping, which need not be identical after an animation.
  await animatedPlan.evaluate((element) => {
    const number = (value) => String(Math.round(Number(value) * 1000) / 1000);
    const geometry = () => JSON.stringify([...element.querySelectorAll('.navigation-icon-player svg :is(g, path)')].map((shape) => ({
      kind: shape.tagName,
      path: (shape.getAttribute('d') || '').replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi, number),
      transform: (shape.getAttribute('transform') || '').replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi, number),
      opacity: number(getComputedStyle(shape).opacity),
      strokeWidth: number(Number.parseFloat(getComputedStyle(shape).strokeWidth)),
    })));
    window.__zebbyIconGeometry = geometry;
    window.__zebbyRestGeometry = geometry();
  });
  // Observe real SVG changes inside the browser before clicking. A fixed delay
  // between remote calls can miss this short animation on a busy CI runner.
  await animatedPlan.evaluate((element) => {
    const player = element.querySelector('.navigation-icon-player');
    const probe = { changed: false, returnedToRest: false };
    const observer = new MutationObserver(() => {
      const geometry = window.__zebbyIconGeometry();
      if (geometry !== window.__zebbyRestGeometry) probe.changed = true;
      else if (probe.changed) probe.returnedToRest = true;
    });
    observer.observe(player, { childList: true, subtree: true, attributes: true });
    window.__zebbyMotionProbe = probe;
    window.__stopZebbyMotionProbe = () => observer.disconnect();
  });
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.waitForFunction(() => window.__zebbyMotionProbe.changed, null, { timeout: 5000 });
  await captureSettings("navigation-click-motion.png", false);
  await page.waitForFunction(() => window.__zebbyMotionProbe.returnedToRest &&
    document.querySelector('[data-kind="plan"]').dataset.playing === "false", null, { timeout: 5000 }).catch(async (error) => {
    const diagnostic = await page.evaluate(() => ({
      probe: window.__zebbyMotionProbe,
      playing: document.querySelector('[data-kind="plan"]').dataset.playing,
      expected: window.__zebbyRestGeometry,
      actual: window.__zebbyIconGeometry(),
    }));
    throw new Error(`Navigation icon did not return to rest: ${JSON.stringify(diagnostic)}`, { cause: error });
  });
  assert.equal(await page.evaluate(() => window.__zebbyIconGeometry() === window.__zebbyRestGeometry), true);
  await page.evaluate(() => {
    window.__stopZebbyMotionProbe();
    delete window.__stopZebbyMotionProbe;
    delete window.__zebbyMotionProbe;
    delete window.__zebbyIconGeometry;
    delete window.__zebbyRestGeometry;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await nav.getByRole("button", { name: "Plan", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await animatedPlan.getAttribute("data-playing"), "false");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const control of [page.locator('.sidebar-toggle'), nav.getByRole('button', { name: 'Plan', exact: true }),
    page.locator('.match-why summary'), page.getByRole('button', { name: 'Analyze', exact: true })]) {
    assert.equal(await control.evaluate(element => getComputedStyle(element).cursor), "default");
  }
  assert.equal(await page.getByRole('textbox', { name: 'Current resume overview', exact: true }).evaluate(element => getComputedStyle(element).cursor), "text");
  await page.locator(".match-why summary").click();
  assert.match(await page.locator(".match-why").innerText(), /Refresh analysis to add an explanation/);
  assert.equal(await page.locator(".cv-section").getByRole("button", { name: "Analyze", exact: true }).count(), 1);
  assert.equal(await page.locator(".analysis-section").getByRole("button", { name: "Analyze", exact: true }).count(), 0);
  const analyzePosition = await page.locator(".cv-section").evaluate((element) =>
    element.querySelector(".plan-analyze-actions").getBoundingClientRect().top >= element.querySelector(".plan-upload").getBoundingClientRect().bottom);
  assert.equal(analyzePosition, true);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("status", { name: "Analyzing role" }).waitFor();
  assert.doesNotMatch(await page.locator(".match-result").innerText(), /Analyzing|Calculating/);
  assert.equal(await page.locator(".match-why").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Analysis in progress", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Copy keyword 1", exact: true }).isDisabled(), true);
  await completeAnalysis("/api/plans/plan-1/analyze");
  await page.locator(".match-result").getByText("86%").waitFor();
  await page.locator(".match-why summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".match-why").getAttribute("open"), "");
  assert.match(await page.locator(".match-why").innerText(), /deeper experimentation experience/);
  const keywordRows = page.locator(".recommendations-keywords .recommendation-row");
  const themeRows = page.locator(".recommendations-themes .recommendation-row");
  assert.equal(await keywordRows.first().locator(".recommendation-importance").innerText(), "96%");
  assert.equal(await themeRows.first().locator(".recommendation-importance").innerText(), "95%");
  assert.equal(await page.getByRole("button", { name: "Copy ATS keywords", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Copy resume themes", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Copy keyword 1", exact: true }).click();
  assert.equal(await page.evaluate(() => window.controlsQA.copied), "Product strategy");
  await page.getByRole("button", { name: "Copy theme 1", exact: true }).click();
  assert.equal(await page.evaluate(() => window.controlsQA.copied), "Lead discovery");
  await page.getByText("Copied theme 1", { exact: true }).waitFor();
  const copyPosition = await themeRows.first().getByRole("button", { name: "Copy theme 1", exact: true }).boundingBox();
  const removePosition = await themeRows.first().getByRole("button", { name: "Remove theme 1", exact: true }).boundingBox();
  assert.ok(copyPosition.x + copyPosition.width <= removePosition.x);
  await page.evaluate(() => { window.controlsQA.failCopy = true; });
  await page.getByRole("button", { name: "Copy theme 1", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Could not copy. Select the text and copy it." }).waitFor();
  await page.evaluate(() => { window.controlsQA.failCopy = false; });
  await page.getByRole("button", { name: "Copy theme 1", exact: true }).click();
  assert.equal(await page.getByRole("alert").filter({ hasText: "Could not copy." }).count(), 0);
  assert.equal(await page.getByText("Estimated job importance.", { exact: false }).count(), 1);
  assert.equal(await page.locator(".brand-mark").evaluate((element) => element.complete && element.naturalWidth > 0), true);
  await captureSettings("plan-windows-light.png");
  await page.locator(".cv-section").screenshot({ path: path.join(output, "plan-cv-actions-light.png") });
  const overviewBeforeCollapse = await page.getByRole("textbox", { name: "Current resume overview", exact: true }).inputValue();
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".sidebar-toggle")?.getAttribute("aria-expanded") === "false" && !document.querySelector(".sidebar-toggle")?.disabled);
  await settleSidebar();
  assert.equal(await nav.locator(".nav-label").first().isVisible(), false);
  assert.equal(await nav.getByRole("button", { name: "Plan", exact: true }).isVisible(), true);
  assert.equal(await page.locator(".desktop-sidebar").evaluate((element) => element.getBoundingClientRect().width), 96);
  assert.equal(await page.locator(".titlebar-sidebar").evaluate((element) => element.getBoundingClientRect().width), 96);
  assert.equal(await page.getByRole("textbox", { name: "Current resume overview", exact: true }).inputValue(), overviewBeforeCollapse);
  assert.equal(await page.evaluate(async () => (await window.desktop.state()).sidebarCollapsed), true);
  assert.equal(await page.locator(".sidebar-database").count(), 0);
  await captureSettings("plan-windows-collapsed-light.png");
  await page.getByRole("button", { name: "Expand navigation", exact: true }).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).waitFor();
  await settleSidebar();
  assert.equal(await nav.locator(".nav-label").first().isVisible(), true);
  await captureAnalysis("plan-analysis-light.png", "readme-plan.png");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await captureSettings("plan-windows-dark.png");
  await captureAnalysis("plan-analysis-dark.png");
  await page.locator(".cv-section").screenshot({ path: path.join(output, "plan-cv-actions-dark.png") });
  await page.setViewportSize({ width: 1050, height: 900 });
  await captureSettings("plan-windows-compact.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 790, height: 850 });
  await captureSettings("plan-windows-narrow.png");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1550, height: 850 });
  // Percentages survive CV edits but become unknown when the job or term changes.
  const currentOverview = page.getByRole("textbox", { name: "Current resume overview", exact: true });
  const originalOverview = await currentOverview.inputValue();
  await currentOverview.fill("I lead product teams and measure customer outcomes.");
  assert.equal(await page.locator(".match-why").count(), 0);
  assert.equal(await page.locator(".match-result").getByText("Not analyzed", { exact: true }).count(), 1);
  assert.equal(await keywordRows.first().locator(".recommendation-importance").innerText(), "96%");
  await currentOverview.fill(originalOverview);
  await page.getByRole("textbox", { name: "Core ATS keyword 1", exact: true }).fill("Product vision");
  await page.getByRole("button", { name: "Copy keyword 1", exact: true }).click();
  assert.equal(await page.evaluate(() => window.controlsQA.copied), "Product vision");
  assert.equal(await keywordRows.first().locator(".recommendation-importance").innerText(), "Unrated");
  assert.equal(await keywordRows.nth(1).locator(".recommendation-importance").innerText(), "94%");
  await page.getByRole("textbox", { name: "Core ATS keyword 1", exact: true }).fill("Product strategy");
  await page.getByRole("textbox", { name: "Company", exact: true }).fill("Changed company");
  assert.equal(await page.locator(".recommendation-importance:not(.unrated)").count(), 0);
  await page.getByRole("textbox", { name: "Company", exact: true }).fill("Expedia Group");
  await page.getByRole("button", { name: "Add keyword", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Copy keyword 7", exact: true }).isDisabled(), true);
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
  const table = page.locator(".application-list");
  await table.getByText("Expedia Group", { exact: true }).waitFor();
  await assertApplicationMetrics();
  const pane = page.getByRole("complementary", { name: "Selected role details", exact: true });
  const firstRow = table.locator(".application-row").first(), firstSelector = firstRow.locator(".application-row-select");
  const listWidth = await table.evaluate((element) => element.clientWidth);
  await pane.getByRole("button", { name: "Close details", exact: true }).click();
  assert.equal(await pane.count(), 0);
  assert.equal(await firstSelector.evaluate((element) => element === document.activeElement), true);
  assert.ok(await table.evaluate((element) => element.clientWidth) > listWidth + 300);
  const firstBox = await firstRow.boundingBox();
  await firstRow.click({ position: { x: firstBox.width / 2, y: firstBox.height - 8 } });
  await pane.waitFor();
  assert.equal(await firstSelector.getAttribute("aria-expanded"), "true");
  await pane.getByRole("button", { name: "Close details", exact: true }).click();
  await firstSelector.press("Space"); await pane.waitFor();
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
  await table.getByRole("button", { name: "Edit Senior Product Manager at Expedia Group" }).click();
  await assertLocationKeyboard(page.locator(".editor .location-editor"), "Windows Applications");
  await page.getByLabel("Team", { exact: true }).fill("Search & Recommendations");
  await table.getByRole("button", { name: "Notes for Senior Product Manager at Expedia Group" }).click();
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
  await table.getByRole("button", { name: "Refresh match for Senior Product Manager at Expedia Group" }).click();
  await table.getByRole("status", { name: "Analyzing resume match" }).first().waitFor();
  assert.equal(await table.locator(".match-control").first().innerText(), "");
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
  await table.getByRole("button", { name: "Refresh match for Senior Product Manager at Expedia Group" }).click();
  await table.getByRole("status", { name: "Analyzing resume match" }).first().waitFor();
  assert.equal(await table.locator(".match-progress-arc").evaluate((element) => getComputedStyle(element).animationName), "none");
  await completeAnalysis("/api/applications/app-1/analyze");
  await page.waitForFunction(() => document.querySelectorAll(".match-progress").length === 0);
  await page.setViewportSize({ width: 1050, height: 900 });
  await captureSettings("applications-compact.png", false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator(".application-inspector").count(), 0);
  assert.equal(await table.locator(".row-actions").first().evaluate((element) => element.getBoundingClientRect().right <= innerWidth), true);
  await page.setViewportSize({ width: 780, height: 900 });
  await assertApplicationMetrics();
  await captureSettings("applications-narrow.png", false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  // Provider choice, download lifecycle, deletion cancellation, and reuse.
  // The native confirmation itself is covered in the model removal tests.
  await page.setViewportSize({ width: 1440, height: 960 });
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const provider = page.getByRole("combobox", { name: "Analyze with", exact: true });
  await page.getByRole("main", { name: "Settings", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Settings", exact: true }).count(), 0);
  assert.equal(await page.getByText("Preferences for this computer.", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("switch").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Create database copy", exact: true }).count(), 0);
  assert.doesNotMatch(await page.locator(".settings-page").innerText(), /weekly backups|Logs may include/i);
  assert.equal(await page.getByText("Quit Zebby and wait for file sync before switching computers.", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Create new database", exact: true }).click();
  await page.getByRole("button", { name: "Open database", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.modelQA.databaseRequests), ["create", "open"]);
  assert.equal(await page.getByRole("link", { name: "Report an issue", exact: true }).getAttribute("href"),
    "https://github.com/desigrit/zebby-the-scout/issues/new");
  assert.equal(await page.getByRole("link", { name: "Report an issue", exact: true }).getAttribute("target"), "_blank");
  await page.evaluate(() => { window.modelQA.failLogOpen = true; });
  await page.getByRole("button", { name: "Open logs folder", exact: true }).click();
  await page.getByRole("alert").getByText("Synthetic logs folder error", { exact: true }).waitFor();
  await page.evaluate(() => { window.modelQA.failLogOpen = false; });
  await page.getByRole("button", { name: "Open logs folder", exact: true }).click();
  assert.equal(await page.evaluate(() => window.modelQA.logOpens), 1);
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.getByRole("combobox", { name: "Model", exact: true }).getByRole("option", { name: "qwen3.8:27b", exact: true }).waitFor({ state: "attached" });
  await provider.selectOption("builtin");
  const localModel = page.getByRole("combobox", { name: "Local model", exact: true });
  await localModel.waitFor();
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
  await page.getByText("Ready", { exact: true }).waitFor();
  assert.equal(await progress.count(), 0);
  const deleteModel = page.getByRole("button", { name: "Delete SmolLM2 360M", exact: true });
  await deleteModel.click(); // Simulated native Cancel result.
  assert.equal(await page.getByText("Ready", { exact: true }).count(), 1);
  await provider.selectOption("openai");
  await page.getByRole("textbox", { name: "API key", exact: true }).waitFor();
  await provider.selectOption("ollama");
  assert.equal(await page.getByRole("textbox", { name: "Server URL", exact: true }).inputValue(), "http://localhost:11434");
  assert.equal(await page.getByRole("combobox", { name: "Model", exact: true }).inputValue(), "qwen3.8:27b");
  await provider.selectOption("builtin");
  await page.getByText("Ready", { exact: true }).waitFor();
  assert.equal(await page.getByText("Ready", { exact: true }).count(), 1);
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
  await page.getByText("Storage and privacy", { exact: true }).click();
  await page.getByText("Delete models here before removing Zebby from your Mac.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: /uninstall/i }).count(), 0);
  await captureSettings("settings-mac-ready.png");
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  await page.getByRole("button", { name: "Expand navigation", exact: true }).waitFor();
  await captureSettings("settings-mac-collapsed-light.png");
  assert.equal(await page.getByRole("button", { name: "Database settings", exact: true }).count(), 0);
  assert.equal(await page.locator(".sidebar-database").count(), 0);
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
    await page.getByText("Ready", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Agree and download", exact: true }).count(), 0);
    await nav.getByRole("button", { name: "Plan", exact: true }).click();
    assert.equal(await page.locator(".plan-analyze-actions small").innerText(), LOCAL_MODELS.find((model) => model.id === id).name);
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
  await page.getByRole("button", { name: "Copy theme 1", exact: true }).click();
  assert.equal(await page.evaluate(() => window.controlsQA.copied), await page.getByRole("textbox", { name: "Core resume theme 1", exact: true }).inputValue());
  await page.locator(".analysis-section").evaluate((element) => {
    const scroll = element.closest(".plan-document-scroll");
    scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
  });
  await captureSettings("plan-mac-item-copy-light.png", false);
  await nav.getByRole("button", { name: "Applications", exact: true }).click();
  const macRow = page.locator(".application-row").first(), macSelector = macRow.locator(".application-row-select");
  await pane.getByRole("button", { name: "Close details", exact: true }).click();
  assert.equal(await macSelector.evaluate((element) => element === document.activeElement), true);
  await captureSettings("applications-mac-pane-closed.png", false);
  const macBox = await macRow.boundingBox();
  await macRow.click({ position: { x: macBox.width / 2, y: macBox.height - 8 } });
  await pane.waitFor();
  await captureSettings("applications-mac-pane-open.png", false);
  await assertApplicationMetrics();
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.setViewportSize({ width: 790, height: 850 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await captureSettings("plan-mac-compact-dark.png");
  await page.locator(".analysis-section").evaluate((element) => {
    const scroll = element.closest(".plan-document-scroll");
    scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
  });
  await captureSettings("plan-mac-item-copy-compact-dark.png", false);
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
  assert.equal(await page.locator('.brand-mark').evaluate(element => element.getBoundingClientRect().top), 69);
  const macInsets = await page.locator(".desktop-sidebar").evaluate((element) => {
    const icon = element.querySelector(".brand-mark").getBoundingClientRect(), box = element.getBoundingClientRect();
    return { top: icon.top - box.top, left: icon.left - box.left };
  });
  assert.deepEqual(macInsets, { top: 25, left: 25 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await assertLocationKeyboard(page.locator(".location-editor"), "Mac Plan");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await page.locator(".save-state").filter({ hasText: "Saved" }).waitFor();
  // All payment and guest-wallet traffic below uses the synthetic desktop bridge.
  // These checks send no email, open no checkout, and request no provider inference.
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Analyze with", exact: true }).selectOption("openai");
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  const analyze = page.getByRole("button", { name: "Analyze", exact: true });
  const analysisDialog = page.getByRole("dialog");
  await analyze.click();
  await analysisDialog.getByRole("heading", { name: "How would you like to analyze?", exact: true }).waitFor();
  assert.equal(await analysisDialog.getByRole("radio").count(), 5);
  for (const name of ["Local server", "Download a model", "OpenAI API key", "Anthropic API key", "Buy credits"]) {
    assert.equal(await analysisDialog.getByRole("radio", { name: new RegExp(name) }).count(), 1);
  }
  await page.setViewportSize({ width: 1550, height: 850 });
  await page.evaluate(() => { window.modelQA.setPlatform("win32"); document.documentElement.dataset.platform = "win32";
    document.documentElement.dataset.theme = "light"; });
  await captureSettings("credits-choice-windows-light.png", false);
  await analysisDialog.getByRole("radio", { name: /Buy credits/ }).check();
  await analysisDialog.getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal(await analysisDialog.getByRole("radio").count(), 4);
  assert.equal(await analysisDialog.getByRole("combobox").count(), 0);
  assert.match(await analysisDialog.innerText(), /Choose your model after purchasing credits/);
  assert.equal(await analysisDialog.getByRole("button", { name: "Continue, $20", exact: true }).isDisabled(), true);
  assert.match(await analysisDialog.innerText(), /Paid credits are not available yet/);
  await captureSettings("credits-packs-windows-light.png", false);
  await page.setViewportSize({ width: 790, height: 850 });
  await page.evaluate(() => { window.modelQA.setPlatform("darwin"); document.documentElement.dataset.platform = "darwin";
    document.documentElement.dataset.theme = "dark"; });
  assert.equal(await analysisDialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
  await captureSettings("credits-packs-mac-dark-narrow.png", false);
  await analysisDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await analysisDialog.waitFor({ state: "hidden" });
  assert.equal(await analyze.evaluate(element => element === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.creditQA.checkouts.length), 0);
  await page.evaluate(() => window.creditQA.update({ available: true }));
  await analyze.click();
  await analysisDialog.getByRole("radio", { name: /Buy credits/ }).check();
  await analysisDialog.getByRole("button", { name: "Continue", exact: true }).click();
  await analysisDialog.getByRole("radio", { name: /^\$5\b/ }).check();
  await analysisDialog.getByRole("button", { name: "Continue, $5", exact: true }).click();
  await analysisDialog.getByText("Test checkout. No real payment is taken.", { exact: true }).waitFor();
  assert.equal(await analysisDialog.getByRole("textbox").count(), 0);
  assert.equal(await analysisDialog.getByRole("combobox").count(), 0);
  await page.evaluate(() => { window.creditQA.payment = "paid"; });
  await analysisDialog.getByRole("button", { name: "Check payment", exact: true }).click();
  await analysisDialog.getByRole("heading", { name: "Your credits are ready", exact: true }).waitFor();
  const paidModel = analysisDialog.getByRole("combobox", { name: "Model", exact: true });
  assert.equal(await paidModel.locator("option").count(), 6);
  await paidModel.selectOption("claude-sonnet-5-5");
  await page.evaluate(() => { window.creditQA.cancelRecovery = true; });
  await analysisDialog.getByRole("button", { name: "Save recovery code", exact: true }).click();
  assert.equal(await analysisDialog.getByRole("button", { name: "Save recovery code", exact: true }).isVisible(), true);
  await page.evaluate(() => { window.creditQA.cancelRecovery = false; });
  await analysisDialog.getByRole("button", { name: "Save recovery code", exact: true }).click();
  await analysisDialog.getByText("Recovery code saved.", { exact: true }).waitFor();
  await analysisDialog.getByRole("button", { name: "Continue to analysis", exact: true }).click();
  await analysisDialog.getByText("Maximum for this analysis", { exact: true }).waitFor();
  assert.match(await analysisDialog.innerText(), /20 credits/);
  assert.match(await analysisDialog.innerText(), /Zebby and Anthropic/);
  await captureSettings("credits-quote-mac-dark-narrow.png", false);
  await analysisDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const sidebarWallet = page.locator(".sidebar-credits").getByRole("button", { name: "500 credits available, 0 used", exact: true });
  await sidebarWallet.click();
  await page.getByRole("button", { name: "Close credits", exact: true }).click();
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  const creditsSettings = page.getByRole("region", { name: "Credits", exact: true });
  await creditsSettings.getByRole("combobox", { name: "Model", exact: true }).waitFor();
  assert.equal(await creditsSettings.getByRole("combobox", { name: "Model", exact: true }).inputValue(), "claude-sonnet-5-5");
  assert.equal(await creditsSettings.getByRole("button", { name: "Sign out", exact: true }).count(), 0);
  await creditsSettings.getByRole("button", { name: "Connect another computer", exact: true }).click();
  await creditsSettings.getByLabel("Pairing code", { exact: true }).waitFor();
  await creditsSettings.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.equal(await page.evaluate(() => window.controlsQA.copied), "ABCD-2345");
  await captureSettings("credits-wallet-pairing-mac-dark-narrow.png", false);
  assert.equal(await creditsSettings.evaluate(element => element.scrollWidth > element.clientWidth), false);
  await creditsSettings.getByRole("button", { name: "Cancel pairing", exact: true }).click();
  assert.equal(await page.evaluate(() => window.creditQA.pairingCancelled), 1);
  await creditsSettings.getByRole("button", { name: "Connect this computer", exact: true }).click();
  const pairInput = creditsSettings.getByLabel("Pairing code", { exact: true });
  assert.equal(await pairInput.evaluate(element => element === document.activeElement), true);
  await pairInput.fill("BAD-CODE"); await pairInput.press("Enter");
  await creditsSettings.getByRole("alert").filter({ hasText: "That pairing code was used or expired" }).waitFor();
  assert.equal(await pairInput.inputValue(), "BAD-CODE");
  await pairInput.fill("ABCD-2345"); await pairInput.press("Enter");
  await creditsSettings.getByText("Computer connected.", { exact: true }).waitFor();
  assert.equal(await creditsSettings.getByRole("button", { name: "Connect this computer", exact: true }).evaluate(element => element === document.activeElement), true);
  await creditsSettings.getByText("Connected computers (2)", { exact: true }).click();
  await creditsSettings.getByText("Mac laptop", { exact: true }).waitFor();
  await creditsSettings.getByRole("button", { name: "Disconnect", exact: true }).click();
  assert.equal(await creditsSettings.getByText("Mac laptop", { exact: true }).isVisible(), true);
  await page.evaluate(() => { window.creditQA.confirmDisconnect = true; });
  await creditsSettings.getByRole("button", { name: "Disconnect", exact: true }).click();
  assert.equal(await creditsSettings.getByText("Mac laptop", { exact: true }).count(), 0);
  await creditsSettings.getByRole("button", { name: "Restore credits", exact: true }).click();
  const recoveryInput = creditsSettings.getByLabel("Recovery code", { exact: true });
  await recoveryInput.fill("synthetic private recovery code"); await recoveryInput.press("Escape");
  assert.equal(await recoveryInput.count(), 0);
  assert.equal(await creditsSettings.getByRole("button", { name: "Restore credits", exact: true }).evaluate(element => element === document.activeElement), true);
  await page.setViewportSize({ width: 1550, height: 850 });
  await page.evaluate(() => { window.modelQA.setPlatform("win32"); document.documentElement.dataset.platform = "win32"; document.documentElement.dataset.theme = "light"; });
  await creditsSettings.scrollIntoViewIfNeeded();
  await captureSettings("credits-wallet-settings-windows-light.png", false);
  assert.equal(await creditsSettings.evaluate(element => element.scrollWidth > element.clientWidth), false);
  await page.evaluate(() => {
    window.creditQA.resumeMode = "error";
    window.creditQA.update({ signedIn: false, pendingConnection: true, wallet: null, access: null, error: "Connection interrupted. Retry when online." });
  });
  await page.waitForFunction(() => window.creditQA.failedResumes > 0);
  await creditsSettings.getByText("A wallet connection is pending. Refresh balance to finish connecting.", { exact: true }).waitFor();
  await creditsSettings.scrollIntoViewIfNeeded();
  await captureSettings("credits-wallet-pending-windows-light.png", false);
  await page.setViewportSize({ width: 790, height: 850 });
  await page.evaluate(() => { window.modelQA.setPlatform("darwin"); document.documentElement.dataset.platform = "darwin"; document.documentElement.dataset.theme = "dark"; });
  await creditsSettings.scrollIntoViewIfNeeded();
  await captureSettings("credits-wallet-pending-mac-dark-narrow.png", false);
  await creditsSettings.getByRole("button", { name: "Refresh balance", exact: true }).click();
  await creditsSettings.getByRole("alert").filter({ hasText: "Connection interrupted" }).waitFor();
  assert.equal(await creditsSettings.getByRole("button", { name: "Refresh balance", exact: true }).isEnabled(), true);
  await page.evaluate(() => { window.creditQA.resumeMode = "complete"; });
  await creditsSettings.getByRole("button", { name: "Refresh balance", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".credit-settings-content")?.textContent.includes("A wallet connection is pending"));
  assert.equal(await creditsSettings.getByRole("alert").count(), 0);
  await creditsSettings.getByRole("combobox", { name: "Model", exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.creditQA.checkouts), ["starter"]);
  await page.getByRole("combobox", { name: "Analyze with", exact: true }).selectOption("ollama");
  await page.setViewportSize({ width: 1550, height: 850 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  // Updates are available in both navigation modes and Settings, without opening an installer during QA.
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await page.getByText('You have the latest version.', { exact: true }).waitFor();
  await page.evaluate(() => window.modelQA.updateState({ available: { version: '2.0.0', size: 100, sha256: 'a'.repeat(64),
    installerUrl: 'https://github.com/desigrit/zebby-the-scout/releases/download/v2.0.0/Zebby-2.0.0-mac-arm64.dmg',
    releaseUrl: 'https://github.com/desigrit/zebby-the-scout/releases/tag/v2.0.0' } }));
  await page.locator('.desktop-sidebar').getByRole('button', { name: 'Update to 2.0.0', exact: true }).waitFor();
  assert.equal(await page.locator('.sidebar-database').count(), 0);
  await captureSettings('updates-mac-collapsed.png');
  await page.locator('.desktop-sidebar').getByRole('button', { name: 'Update to 2.0.0', exact: true }).click();
  await page.getByRole('button', { name: 'Downloading 40%', exact: true }).first().waitFor();
  assert.equal(await nav.getByRole('button', { name: 'Plan', exact: true }).isEnabled(), true);
  await page.evaluate(() => {
    window.modelQA.updateState({ download: { phase: 'ready', received: 100, total: 100, error: '' } });
    window.modelQA.finishDownload();
  });
  await page.getByRole('button', { name: 'Restart to update', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).waitFor();
  await captureSettings('updates-mac-ready-dark.png');
  await page.evaluate(() => { window.modelQA.failInstall = true; });
  await page.locator('.desktop-sidebar').getByRole('button', { name: 'Restart to update', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic database save failure' }).waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('.desktop-workspace').inert), false);
  await page.evaluate(() => { window.modelQA.failInstall = false; });
  await nav.getByRole('button', { name: 'Applications', exact: true }).click();
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  await page.locator('.desktop-dashboard .editor').waitFor();
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Unsaved company fixture');
  await page.locator('.desktop-sidebar').getByRole('button', { name: 'Restart to update', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Finish editing the open form or dialog before updating.' }).waitFor();
  assert.equal(await page.evaluate(() => window.modelQA.installRequests), 1);
  assert.equal(await page.getByRole('textbox', { name: 'Company', exact: true }).inputValue(), 'Unsaved company fixture');
  await page.getByRole('button', { name: 'Close form', exact: true }).click();
  await nav.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('textbox', { name: 'Core ATS keyword 1', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Current resume overview', exact: true }).fill('Unsaved update guard fixture');
  await page.locator('.save-state.unsaved').waitFor();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.desktop-sidebar').getByRole('button', { name: 'Restart to update', exact: true }).click();
  assert.equal(await page.evaluate(() => window.modelQA.installRequests), 1);
  assert.equal(await page.getByRole('textbox', { name: 'Current resume overview', exact: true }).inputValue(), 'Unsaved update guard fixture');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.desktop-sidebar').getByRole('button', { name: 'Restart to update', exact: true }).click();
  await page.getByRole('button', { name: 'Restarting', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('.desktop-workspace').inert), true);
  assert.equal(await page.evaluate(() => window.modelQA.installRequests), 2);
  assert.deepEqual(errors, []);
  console.log(`Headless renderer checks passed. No desktop app was launched. Screenshots: ${output}`);
} finally {
  for (const resolve of pending.values()) resolve();
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

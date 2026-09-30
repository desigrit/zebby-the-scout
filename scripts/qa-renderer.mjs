import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

// Checks the compiled renderer with synthetic data in an invisible browser.
// It does not launch Electron, read settings, or open an application database.
const renderer = path.resolve("desktop-dist/renderer");
const output = path.resolve("qa-output/renderer-1.0.2");
const executablePath = process.env.PM_TRACKER_BROWSER || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((candidate) => existsSync(candidate));
const description = "Responsibilities\n\n• Lead discovery and product strategy\n• Prioritize roadmap work with design and engineering\n\nQualifications\n\nExperience delivering products and measuring customer outcomes.";
const resume = { id: "resume-1", filename: "Raunak Oberoi - AI Product Manager.pdf", contentType: "application/pdf", size: 4, createdAt: "2026-09-01T12:00:00Z" };
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
  overview: "I help teams find customer needs and build useful products with clear priorities.", overviewRationale: "The overview already reflects discovery and priorities.",
  matchStrength: 84, matchAnalyzedAt: "2026-09-29T12:00:00Z", createdAt: "2026-09-29T12:00:00Z", updatedAt: "2026-09-29T12:00:00Z" };
const state = { filePath: "example.sqlite", filename: "Applications.sqlite", dirty: false, startupError: "", hasApiKey: false,
  analysisProvider: "ollama", ollamaUrl: "http://localhost:11434", ollamaModel: "qwen3.8:27b", canSaveApiKey: true,
  backupsPath: "", appearance: "light", captureLogs: false, logsPath: "", platform: "win32" };
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, timezoneId: "America/Los_Angeles", locale: "en-US" });
  await page.clock.setFixedTime(new Date("2026-09-30T20:00:00Z"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((initialState) => {
    window.desktop = { state: async () => initialState, onDatabaseChanged: () => () => {}, onNavigate: () => () => {},
      downloadResume: async () => true };
  }, state);
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data;
    if (pathname === "/api/applications") data = { applications };
    else if (pathname === "/api/resumes") data = { resumes: [resume] };
    else if (pathname === "/api/plans") data = { plans: [plan] };
    else if (pathname.endsWith("/analyze")) {
      await new Promise((resolve) => { pending.set(pathname, resolve); requested.get(pathname)?.(); requested.delete(pathname); });
      pending.delete(pathname);
      if (pathname.startsWith("/api/applications/")) {
        const id = pathname.split("/")[3];
        applications = applications.map((item) => item.id === id ? { ...item, matchStrength: 89, updatedAt: "2026-09-30T20:00:00Z" } : item);
        data = { application: applications.find((item) => item.id === id) };
      } else { plan = { ...plan, matchStrength: 86 }; data = { plan }; }
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
  assert.equal(await page.getByRole("heading", { name: "Plan", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Refresh analysis" }).click();
  await page.getByRole("status", { name: "Analyzing role" }).waitFor();
  assert.doesNotMatch(await page.locator(".match-result").innerText(), /Analyzing|Calculating|84%/);
  await completeAnalysis("/api/plans/plan-1/analyze");
  await page.locator(".match-result").getByText("86%").waitFor();
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
  await page.screenshot({ path: path.join(output, "notes.png") });
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
  await page.screenshot({ path: path.join(output, "applications-light.png") });
  await page.getByRole("button", { name: "Refresh match for Product Manager at Meta" }).click();
  assert.equal(await table.getByRole("status", { name: "Analyzing resume match" }).count(), 2);
  await completeAnalysis("/api/applications/app-1/analyze");
  await completeAnalysis("/api/applications/app-2/analyze");
  await table.getByText("89%").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".match-progress").length === 0);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: path.join(output, "applications-dark.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Refresh match for Senior Product Manager at Expedia Group" }).click();
  await page.getByRole("status", { name: "Analyzing resume match" }).waitFor();
  assert.equal(await page.locator(".match-progress-arc").evaluate((element) => getComputedStyle(element).animationName), "none");
  await completeAnalysis("/api/applications/app-1/analyze");
  await page.waitForFunction(() => document.querySelectorAll(".match-progress").length === 0);
  await page.setViewportSize({ width: 1050, height: 900 });
  await page.screenshot({ path: path.join(output, "applications-compact.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await table.locator("thead").isVisible(), false);
  assert.equal(await table.locator(".actions-cell").first().evaluate((element) => element.getBoundingClientRect().right <= innerWidth), true);
  await page.setViewportSize({ width: 780, height: 900 });
  await page.screenshot({ path: path.join(output, "applications-narrow.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(`Headless renderer checks passed. No desktop app was launched. Screenshots: ${output}`);
} finally {
  for (const resolve of pending.values()) resolve();
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

// Native Electron verification, isolated from the user's profile and database.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { _electron } from "playwright-core";
import sharp from "sharp";

const repo = path.resolve(".");
const output = path.resolve(process.env.ZEBBY_QA_OUTPUT || "work/ember-implementation/round-1");
const profile = path.join(output, `profile-${Date.now()}`);
const dbPath = path.join(profile, "cloud", "Sample applications.sqlite");
await mkdir(path.dirname(dbPath), { recursive: true });
await mkdir(path.join(output, "captures"), { recursive: true });
await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: path.join(output, "store.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node22" });
const { DesktopStore } = await import(pathToFileURL(path.join(output, "store.mjs")));
const description = "Senior Product Manager, Growth Platform\n\nAbout the team\nWe build tools that help customers get more value from their first week.\n\nResponsibilities\n• Own the product strategy and roadmap for onboarding and activation.\n• Partner with engineering, design and analytics to test hypotheses.\n• Turn customer research into measurable outcomes.\n• Communicate priorities and tradeoffs to executive stakeholders.\n\nExperience\n• Cross-functional discovery and delivery.\n• Experimentation, product analytics, prioritization and clear writing.\n\nThis is synthetic QA data.";
const keywords = ["Product strategy", "Customer discovery", "Roadmap prioritization", "Experimentation", "Activation", "Product analytics", "Cross-functional leadership", "Stakeholder alignment", "Onboarding", "Customer empathy", "Outcome measurement", "Executive communication"];
const themes = ["Turn customer insights into product strategy", "Lead cross-functional discovery and delivery", "Prioritize outcomes with evidence and clear tradeoffs", "Improve activation through experimentation", "Measure and communicate business impact", "Align teams through clear executive communication"];
function pdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let data = "%PDF-1.4\n"; const offsets = [];
  for (const [i, item] of objects.entries()) { offsets.push(Buffer.byteLength(data)); data += `${i + 1} 0 obj\n${item}\nendobj\n`; }
  const xref = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(data);
}
const store = new DesktopStore(profile); await store.create(dbPath);
const resume = await store.addResume("Alex Morgan - Enterprise AI Product Management and Leadership - October 2026.pdf", "application/pdf",
  pdf("Product strategy, customer discovery, roadmap, leadership and activation experiments"));
const companies = ["Northstar Labs", "Fieldwork", "Juniper", "Orbit", "Mosaic", "Northstar Labs"];
const titles = ["Senior Product Manager", "Product Manager", "Director of Product Management", "Principal Product Manager, AI Experiences and Enterprise Platform", "Product Manager, Developer Experience"];
const statuses = ["Applied", "Heard back", "Interview scheduled", "Rejected"];
for (let i = 0; i < 36; i++) {
  const date = new Date(); date.setDate(date.getDate() - Math.floor(i / 2));
  const application = await store.saveApplication({ company: companies[i % 6], title: titles[i % 5], team: "Growth and Activation",
    locations: i % 3 ? "Seattle, WA" : "Seattle, WA; Bellevue, WA; New York, NY; San Francisco, CA; Remote",
    listingUrl: `https://example.org/jobs/qa-${i}`, jobDescription: description, notes: "Recruiter: Sam\nAsk about the first 90 days.",
    snapshotText: description, snapshotSource: "page", appliedDate: date.toLocaleDateString("en-CA"),
    matchStrength: 78 + i % 17, resumeId: resume.id, status: statuses[i % 4] });
  await store.saveMatchAnalysis(application.id, application.updatedAt, application.matchStrength,
    "Strong product strategy and discovery evidence. The resume shows less direct evidence of quantified activation outcomes. This is an estimate, not a hiring prediction.", description);
}
for (let i = 0; i < 13; i++) {
  const plan = await store.savePlan({ listingUrl: `https://example.org/jobs/plan-${i}`, company: companies[i % 6], title: titles[i % 5], team: "Growth",
    locations: "Seattle, WA; Bellevue, WA; Remote", description, snapshotText: description, snapshotSource: "page",
    currentOverview: "I help teams find customer needs and turn them into useful products. I bring clear priorities, thoughtful collaboration, and a practical approach to product strategy.",
    resumeId: resume.id, keywords, themes, overview: "I help teams turn customer insight into product strategy and measurable growth. I bring clear priorities, thoughtful collaboration, and a practical approach to activation." });
  await store.savePlanAnalysis(plan.id, plan.updatedAt, keywords, themes, plan.overview,
    "A light revision brings customer insight and activation forward while preserving the short, direct style.", 86,
    keywords.map((_, j) => 99 - j * 2), themes.map((_, j) => 98 - j * 3), "Product strategy and discovery are well demonstrated. Quantified activation results would strengthen the resume.");
}
store.close();
await writeFile(path.join(profile, "settings.json"), JSON.stringify({ databasePath: dbPath, analysisProvider: "ollama",
  ollamaUrl: "http://localhost:11434", ollamaModel: "qwen3.8:27b", appearance: "light", sidebarCollapsed: false }));
let app;
const captures = [], checks = [], errors = [];
try {
  app = await _electron.launch({ executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
    args: [repo, "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding", "--disable-gpu"], cwd: repo,
    env: { ...process.env, PM_TRACKER_TEST_USER_DATA: profile, PM_TRACKER_TEST_HIDE_WINDOW: "1" } });
  const page = await app.firstWindow(); page.setDefaultTimeout(5000);
  // Keep the compositor drawing without placing a visible window or taking focus.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setOpacity(0); win.setSkipTaskbar(true); win.setFocusable(false); win.showInactive();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
  await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
  await app.evaluate(() => {
    const original = globalThis.fetch;
    globalThis.__emberQA = { pending: new Map(), aborted: 0, calls: [] };
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith("https://api.github.com/")) return Response.json([]);
      if (target.endsWith("/api/tags")) return Response.json({ models: [{ name: "qwen3.8:27b" }, { name: "qwen3:8b" }] });
      const openai = target === "https://api.openai.com/v1/responses";
      if (target.endsWith("/api/chat") || openai) {
        const body = JSON.parse(options.body), qa = globalThis.__emberQA;
        const format = openai ? body.text.format.schema : body.format;
        const isPlan = format.required.includes("keywords");
        const key = crypto.randomUUID();
        qa.calls.push({ provider: openai ? "openai" : "ollama", model: body.model, bytes: options.body.length });
        options.signal.throwIfAborted();
        await new Promise((resolve, reject) => {
          qa.pending.set(key, resolve);
          options.signal.addEventListener("abort", () => { qa.aborted++; qa.pending.delete(key); reject(options.signal.reason); }, { once: true });
        });
        qa.pending.delete(key);
        const result = isPlan ? {
          keywords: ["Strategy", "Discovery", "Roadmap", "Experimentation", "Activation", "Analytics"].map((text, i) => ({ text, importance: 98 - i * 3 })),
          themes: ["Lead discovery", "Shape strategy", "Prioritize outcomes", "Run activation experiments", "Communicate tradeoffs"].map((text, i) => ({ text, importance: 98 - i * 3 })),
          score: 85, explanation: "Strategy and discovery fit well. Add quantified activation evidence if supported.",
          overview: "I help teams turn customer insight into product strategy and measurable growth.", overviewRationale: "Light revision to foreground customer insight and growth." }
          : { score: 85, explanation: "Strategy and discovery fit well. Add quantified activation evidence if supported." };
        return Response.json(openai ? { output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] }
          : { done: true, message: { content: JSON.stringify(result) } });
      }
      return original(url, options);
    };
  });
  await page.evaluate(({ description }) => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.__emberCopied = text; } }, configurable: true });
    const original = window.fetch;
    window.fetch = (url, options) => String(url).startsWith("/api/job-posting")
      ? Promise.resolve(Response.json({ details: { company: "Northstar Labs", title: "Senior Product Manager", team: "Growth", locations: "Seattle, WA; Remote" }, text: description }))
      : original(url, options);
  }, { description });
  async function pending() { return app.evaluate(() => globalThis.__emberQA.pending.size); }
  async function waitForRequest() { for (let i = 0; i < 100 && !(await pending()); i++) await page.waitForTimeout(50); assert.equal(await pending(), 1); }
  const finish = () => app.evaluate(() => { for (const resolve of globalThis.__emberQA.pending.values()) resolve(); });
  async function api(pathname) { return page.evaluate(async (url) => (await fetch(url)).json(), pathname); }
  async function bounds(width, height = 850) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setBounds(size), { width, height });
    await page.waitForTimeout(100);
  }
  async function theme(value) {
    if (await page.getByRole("radiogroup", { name: "Appearance" }).count()) {
      await page.getByRole("radio", { name: value === "dark" ? "Dark" : "Light", exact: true }).check();
    } else await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, value);
    await page.waitForFunction((value) => document.documentElement.dataset.theme === value, value);
  }
  async function capture(name) {
    if (process.env.ZEBBY_QA_CHECKS_ONLY === "1") return;
    if (process.env.ZEBBY_QA_RECAPTURE && !process.env.ZEBBY_QA_RECAPTURE.split(",").includes(name)) return;
    await page.mouse.move(10, 10);
    const zoom = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
    await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom + 0.001), zoom);
    await page.waitForTimeout(150);
    await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), zoom);
    await page.waitForTimeout(450);
    await page.waitForTimeout(80);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => {
      const rect = (element) => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const selectors = [".desktop-workspace", ".plan-document-scroll", ".application-list", ".application-inspector"];
      return { viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
        navigation: [...document.querySelectorAll(".sidebar-nav button")].map((e) => ({ label: e.getAttribute("aria-label"), selected: e.getAttribute("aria-current"), background: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color, opacity: Number(getComputedStyle(e).opacity), canvas: getComputedStyle(document.querySelector(".desktop-sidebar")).backgroundColor, ...rect(e) })),
        regions: selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((e) => ({ selector, ...rect(e), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight }))),
        controls: [...document.querySelectorAll("button,input,select,textarea,summary")].map((e) => ({ name: e.getAttribute("aria-label") || e.labels?.[0]?.innerText || e.innerText, ...rect(e) })) };
    });
    const file = path.join(output, "captures", `${name}.png`);
    const png = Buffer.from(await app.evaluate(async ({ BrowserWindow }) => {
      const capture = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      return capture.toPNG().toString("base64");
    }), "base64");
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const selected = geometry.navigation.find((item) => item.selected === "page");
    const px = Math.floor((selected.x + 3) * geometry.viewport.dpr), py = Math.floor((selected.y + selected.h / 2) * geometry.viewport.dpr);
    const offset = (py * info.width + px) * info.channels;
    const color = selected.background.match(/\d+/g).map(Number), canvas = selected.canvas.match(/\d+/g).map(Number);
    const expected = color.slice(0, 3).map((value, index) => Math.round(value * selected.opacity + canvas[index] * (1 - selected.opacity)));
    assert.ok([...data.subarray(offset, offset + 3)].every((value, index) => Math.abs(value - expected[index]) <= 1), `${name}: navigation pixels agree with selected DOM state`);
    await writeFile(file, png);
    captures.push({ name, file, ...geometry });
    for (const region of geometry.regions) assert.ok(region.scrollWidth <= region.clientWidth + 2, `${name}: horizontal overflow in ${region.selector}`);
    for (const region of geometry.regions.filter((item) => item.selector === ".application-list")) {
      assert.ok(region.clientHeight >= 100, `${name}: application list retains usable height`);
    }
  }
  async function assertRowMetrics(label) {
    const geometry = await page.locator(".application-row").evaluateAll((rows) => rows.slice(0, 4).map((row) => {
      const metrics = row.querySelector(".application-row-metrics"), date = metrics.firstElementChild, match = metrics.lastElementChild;
      const r = row.getBoundingClientRect(), m = metrics.getBoundingClientRect(), d = date.getBoundingClientRect(), s = match.getBoundingClientRect();
      const locations = row.querySelector(".location-expanded:not([hidden])");
      return { dateTag: date.tagName, matchClass: match.classList.contains("match-control"), gap: s.left - d.right,
        lineOffset: Math.abs(d.top + d.height / 2 - s.top - s.height / 2),
        centerOffset: Math.abs(r.left + r.width / 2 - m.left - m.width / 2), overflow: row.scrollWidth > row.clientWidth,
        locationOverlap: locations ? locations.getBoundingClientRect().bottom > m.top + 1 : false };
    }));
    assert.ok(geometry.length, `${label}: rows available`);
    for (const row of geometry) {
      assert.equal(row.dateTag, "TIME"); assert.equal(row.matchClass, true);
      assert.ok(row.gap >= 23 && row.lineOffset <= 1 && row.centerOffset <= 1, `${label}: date first, spaced match second, one centered line`);
      assert.equal(row.overflow, false); assert.equal(row.locationOverlap, false);
    }
  }
  await bounds(1550);
  await capture("plan-light-top");
  assert.equal(await page.locator(".plan-inputs").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length), 2);
  assert.equal(await page.getByRole("button", { name: "Analyze", exact: true }).evaluate((e) => e.getBoundingClientRect().bottom < innerHeight), true);
  assert.equal(await page.getByRole("button", { name: "Save plan", exact: true }).evaluate((e) => e.getBoundingClientRect().bottom < innerHeight), true);
  const input = page.getByRole("textbox", { name: "Current resume overview", exact: true });
  const initial = await input.inputValue();
  await input.focus(); await page.keyboard.press("End"); await page.keyboard.type("!"); await page.keyboard.press("Control+z");
  assert.equal(await input.inputValue(), initial); checks.push("Native editing Undo preserves the controlled overview");
  await page.keyboard.press("Control+f");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.command), "search");
  const beforePlan = JSON.stringify((await api("/api/plans")).plans[0]);
  await page.getByRole("button", { name: "Analyze", exact: true }).click(); await waitForRequest();
  assert.equal(await input.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Copy keyword 1", exact: true }).isDisabled(), true);
  await page.waitForFunction(() => [...document.querySelectorAll(".sidebar-nav button")].every((button) => button.disabled));
  assert.equal(await nav.getByRole("button", { name: "Settings", exact: true }).isDisabled(), true);
  await capture("plan-analysis-running");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByText("Analysis cancelled.", { exact: true }).waitFor();
  assert.equal(JSON.stringify((await api("/api/plans")).plans[0]), beforePlan);
  assert.equal(await app.evaluate(() => globalThis.__emberQA.aborted), 1); checks.push("Plan cancellation aborts Ollama and leaves the full saved record unchanged");
  await page.locator(".analysis-section").evaluate((e) => {
    const scroll = e.closest(".plan-document-scroll");
    scroll.scrollTop += e.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
  });
  await capture("plan-light-results");
  assert.equal(await page.locator(".analysis-grid").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length), 2);
  assert.equal(await page.getByRole("button", { name: "Copy ATS keywords", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Copy resume themes", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Copy keyword 1", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__emberCopied), keywords[0]);
  await page.getByRole("button", { name: "Copy theme 1", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__emberCopied), themes[0]); checks.push("Individual keyword/theme copy uses only the current item (clipboard mocked)");
  await theme("dark"); await capture("plan-dark-results");
  await page.locator(".plan-document-scroll").evaluate((e) => e.scrollTo(0, 0)); await capture("plan-dark-top"); await theme("light");
  await nav.getByRole("button", { name: "Applications", exact: true }).click();
  await page.locator(".application-row").first().waitFor();
  await assertRowMetrics("Wide inspector open");
  await capture("applications-light");
  const row = page.locator(".application-row").first();
  const selector = row.locator(".application-row-select");
  const pane = page.getByRole("complementary", { name: "Selected role details", exact: true });
  const openWidth = await page.locator(".application-list").evaluate((element) => element.clientWidth);
  await pane.getByRole("button", { name: "Close details", exact: true }).click();
  assert.equal(await pane.count(), 0);
  assert.equal(await selector.getAttribute("aria-expanded"), "false");
  assert.equal(await selector.evaluate((element) => element === document.activeElement), true);
  assert.ok(await page.locator(".application-list").evaluate((element) => element.clientWidth) > openWidth + 300);
  await assertRowMetrics("Inspector closed");
  await capture("applications-pane-closed");
  const blankPositions = [
    () => ({ x: 8, y: 8 }),
    (box) => ({ x: box.width / 2, y: box.height - 8 }),
    (box) => ({ x: box.width - 8, y: box.height / 2 }),
  ];
  for (const position of blankPositions) {
    await row.click({ position: position(await row.boundingBox()) });
    await pane.waitFor();
    assert.equal(await selector.getAttribute("aria-expanded"), "true");
    await pane.getByRole("button", { name: "Close details", exact: true }).click();
  }
  await selector.press("Enter"); await pane.waitFor();
  await capture("applications-pane-reopened");
  const second = page.locator(".application-row").nth(1), secondBox = await second.boundingBox();
  await second.click({ position: { x: secondBox.width / 2, y: secondBox.height - 8 } });
  assert.equal(await pane.getByRole("heading", { level: 3 }).innerText(), await second.locator(".role-heading strong").innerText());
  await pane.getByRole("button", { name: "Close details", exact: true }).click();
  await second.getByRole("button", { name: /^Notes for/ }).click();
  await page.getByRole("dialog", { name: "Application notes" }).waitFor();
  assert.equal(await pane.count(), 0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await selector.click(); await pane.waitFor();
  checks.push("Blank row regions select roles; close releases width/restores focus; same/other roles reopen; Notes stays independent");
  await second.getByRole("button", { name: /^Show all \d+ locations$/ }).click();
  await assertRowMetrics("Expanded locations"); await capture("applications-locations-expanded");
  await second.getByRole("button", { name: "Hide extra locations", exact: true }).click();
  checks.push("Date then match share one centered line, including wide/closed and expanded-location rows");
  const appBefore = (await api("/api/applications")).applications[0];
  const refresh = row.getByRole("button", { name: /^Refresh match/ });
  await refresh.click(); await waitForRequest();
  assert.equal(await row.locator("select").isDisabled(), true);
  assert.equal(await row.getByRole("button", { name: /^Edit / }).isDisabled(), true);
  await assertRowMetrics("Match analysis running");
  await capture("application-analysis-running");
  await row.getByRole("button", { name: /^Cancel match analysis/ }).click();
  await page.getByText("Analysis cancelled.", { exact: true }).waitFor();
  assert.equal(JSON.stringify((await api("/api/applications")).applications.find((a) => a.id === appBefore.id)), JSON.stringify(appBefore));
  checks.push("Application cancellation protects row controls and keeps prior analysis");
  await row.locator("select").focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  const focus = await row.locator("select").evaluate((e) => ({ width: getComputedStyle(e).outlineWidth, style: getComputedStyle(e).outlineStyle }));
  assert.deepEqual(focus, { width: "2px", style: "solid" });
  await capture("applications-status-focus"); await theme("dark"); await capture("applications-dark"); await theme("light");
  for (const width of [1260, 1000, 851, 850, 790]) {
    await bounds(width, 760); await assertRowMetrics(`Window ${width}`); await capture(`applications-${width}`);
    await nav.getByRole("button", { name: "Plan", exact: true }).click();
    await capture(`plan-${width}`);
    if (width === 790) {
      await page.locator(".analysis-section").evaluate((element) => {
        const scroll = element.closest(".plan-document-scroll");
        scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
      });
      await capture("plan-790-results");
    }
    await nav.getByRole("button", { name: "Applications", exact: true }).click();
  }
  await page.getByRole("button", { name: "Collapse navigation" }).click(); await capture("applications-790-collapsed");
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await page.locator(".application-row-select").first().click(); await capture("applications-790-expanded-details");
  await bounds(1550);
  await nav.getByRole("button", { name: "Settings", exact: true }).click(); await capture("settings-ollama-light");
  await theme("dark"); await capture("settings-ollama-dark"); await theme("light");
  await page.getByRole("combobox", { name: "Analyze with", exact: true }).selectOption("openai");
  await capture("settings-openai-setup");
  await page.getByRole("textbox", { name: "API key", exact: true }).fill("sk-zebby-fixture");
  await page.getByRole("button", { name: "Save API key", exact: true }).click();
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  const beforeOpenai = JSON.stringify((await api("/api/plans")).plans[0]);
  await page.getByRole("button", { name: "Analyze", exact: true }).click(); await waitForRequest();
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await page.getByText("Analysis cancelled.", { exact: true }).waitFor();
  assert.equal(JSON.stringify((await api("/api/plans")).plans[0]), beforeOpenai); checks.push("Plan cancellation also aborts OpenAI");
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (/\/api\/plans\/[^/]+\/analyze$/.test(String(url))) {
        window.__heldAnalysisSignal = options.signal;
        window.__analysisResponseHeld = true;
        await new Promise((resolve) => { window.__deliverAnalysis = resolve; });
      }
      return response;
    };
  });
  await page.getByRole("button", { name: "Analyze", exact: true }).click(); await waitForRequest(); await finish();
  await page.waitForFunction(() => window.__analysisResponseHeld === true);
  assert.equal((await api("/api/plans")).plans[0].matchStrength, 85);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__heldAnalysisSignal.aborted), false);
  assert.equal(await page.getByRole("status", { name: "Analyzing role" }).count(), 1);
  assert.equal(await page.getByText("Analysis cancelled.", { exact: true }).count(), 0);
  await page.evaluate(() => window.__deliverAnalysis());
  checks.push("Cancel after persistence keeps response delivery and UI consistent");
  await page.getByText("Analysis saved.", { exact: true }).waitFor();
  assert.equal((await api("/api/plans")).plans[0].matchStrength, 85); checks.push("Successful analysis still saves all structured results");
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Analyze with", exact: true }).selectOption("builtin");
  await capture("settings-local-setup");
  await bounds(790, 760); await capture("settings-790");
  await bounds(1550);
  for (const zoom of [1.25, 1.5, 2]) {
    await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(value), zoom);
    await capture(`settings-zoom-${zoom}`);
    await nav.getByRole("button", { name: "Applications", exact: true }).click(); await capture(`applications-zoom-${zoom}`);
    if (zoom === 2) {
      const list = page.locator(".application-list");
      assert.ok(await list.evaluate((e) => e.clientHeight >= 200));
      const role = page.locator(".application-row-select").first();
      await role.scrollIntoViewIfNeeded(); await role.focus();
      assert.equal(await role.evaluate((e) => { const b = e.getBoundingClientRect(); return b.top >= 44 && b.bottom <= innerHeight; }), true);
      await page.keyboard.press("Enter");
      await page.locator(".application-inline-details").first().waitFor();
      await assertRowMetrics("200 percent scaling with inline details");
      await page.evaluate(() => {
        const root = document.querySelector(".desktop-workspace"), layout = document.querySelector(".applications-layout");
        root.scrollTop += layout.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
        document.querySelector(".application-list").scrollTop = 0;
      });
      await capture("applications-zoom-2-scrolled");
      checks.push("High-scaling role list stays scrollable and keyboard reachable");
    }
    await nav.getByRole("button", { name: "Plan", exact: true }).click(); await capture(`plan-zoom-${zoom}`);
    if (zoom === 2) {
      await page.locator(".recommendations-keywords").evaluate((element) => {
        const scroll = element.closest(".plan-document-scroll");
        scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
      });
      assert.equal(await page.getByRole("button", { name: "Copy keyword 1", exact: true }).evaluate((element) => {
        const box = element.getBoundingClientRect(), scroll = element.closest(".plan-document-scroll").getBoundingClientRect();
        return box.top >= scroll.top && box.bottom <= scroll.bottom;
      }), true);
      await capture("plan-zoom-2-results");
    }
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await nav.getByRole("button", { name: "Applications", exact: true }).click();
  await page.keyboard.press("Control+n"); await page.locator(".editor").waitFor();
  await capture("new-application-full-form");
  assert.equal(await page.getByRole("button", { name: "Save application", exact: true }).evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight), true);
  for (const label of ["Job listing link", "Company", "Job title", "Team", "Date applied", "Match strength", "Job description"]) {
    assert.ok(await page.getByLabel(label, { exact: label !== "Job description" }).count(), `${label} stays in the full form`);
  }
  await page.getByLabel("Date applied", { exact: true }).fill("");
  await page.keyboard.press("Control+s"); await page.getByText("Application added.", { exact: true }).waitFor();
  assert.equal((await api("/api/applications")).applications.length, 37); checks.push("New and Save shortcuts, and saving a blank optional application");
  const blank = page.locator(".application-row").filter({ has: page.getByRole("button", { name: "View details for untitled role at unknown company", exact: true }) });
  assert.equal(await blank.locator(".application-applied-date").getAttribute("datetime"), null);
  assert.match(await blank.locator(".application-applied-date").innerText(), /Not set/);
  assert.match(await blank.locator(".application-row-metrics .match-control").innerText(), /Not scored/);
  await page.keyboard.press("Control+f"); assert.equal(await page.evaluate(() => document.activeElement.dataset.command), "search");
  await page.getByRole("textbox", { name: "Search applications", exact: true }).fill("Northstar");
  assert.match(await page.locator(".section-toolbar p").innerText(), /12 of 37/); checks.push("Search and filtered counts");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "manifest.json"), JSON.stringify({ captures, checks, errors,
    inference: await app.evaluate(() => ({ aborted: globalThis.__emberQA.aborted, calls: globalThis.__emberQA.calls })),
    scope: "Hidden native Windows Electron. Synthetic data, mocked provider outputs. No real database or model downloads used." }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, captures: captures.length, errors }));
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: String(error.stack), captures, checks, errors }, null, 2));
  throw error;
} finally { await app?.close(); }

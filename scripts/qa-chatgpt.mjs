import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
import { LOCAL_MODELS } from "../desktop/local-model-catalog.ts";

assert.equal(process.env.GITHUB_ACTIONS, "true", "Run ChatGPT browser checks on an isolated GitHub runner.");

const renderer = path.resolve("desktop-dist/renderer"), output = path.resolve("qa-output/chatgpt");
const state = {
  filePath: "C:/Workspace/Applications.sqlite", filename: "Applications.sqlite", dirty: false, startupError: "",
  hasApiKey: false, hasAnthropicKey: false, apiKeyHint: "", anthropicKeyHint: "", thinkingLevels: {},
  openaiModel: "gpt-6.1-sol", anthropicModel: "claude-sonnet-5-5", analysisProvider: "chatgpt", canSaveApiKey: true,
  ollamaUrl: "http://localhost:11434", ollamaModel: "", appearance: "light", sidebarCollapsed: false, logsPath: "", platform: "win32",
  builtInModelId: "", acceptedModelTerms: [], modelsFolder: "C:/Workspace/Models",
  localModels: LOCAL_MODELS.map(({ id }) => ({ id, status: "not-installed", downloadedBytes: 0, error: "" })),
  localEngine: { status: "idle", modelId: "" }, totalMemory: 32e9, availableMemory: 16e9,
  credits: { available: false, signedIn: false, email: "", wallet: null, stale: true, error: "", model: "gpt-6.1-sol", access: null, recoverySaved: false, pendingConnection: false },
  updates: { currentVersion: "2.11.0", checking: false, checkedAt: "", error: "", available: null, download: { phase: "idle", received: 0, total: 0, error: "" } },
  chatgpt: { available: true, connected: false, connecting: false, account: "", activeAccount: "", accounts: [], models: [], model: "", thinking: "", tested: false, visionTested: false, notice: "", error: "", paused: false, welcome: false, jobs: [] },
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = path.resolve(renderer, "." + (pathname === "/" ? "/index.html" : pathname));
  if (!file.startsWith(renderer + path.sep)) { response.writeHead(403); response.end(); return; }
  try { const data = await readFile(file); response.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(file)] || "application/octet-stream" }); response.end(data); }
  catch { response.writeHead(404); response.end(); }
});
let browser, page;
try {
  await mkdir(output, { recursive: true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1550, height: 950 }, locale: "en-US" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    const data = pathname === "/api/plans" ? { plans: [], lastCurrentOverview: "" } : pathname === "/api/resumes" ? { resumes: [] }
      : pathname === "/api/applications" ? { applications: [] } : pathname === "/api/locations/recent" ? { locations: [] } : null;
    assert.ok(data, `Unexpected API: ${pathname}`);
    return route.fulfill({ json: data });
  });
  await page.addInitScript(initial => {
    const listeners = new Set(), snapshot = () => structuredClone(initial);
    const update = change => { Object.assign(initial.chatgpt, change); for (const listener of listeners) listener(snapshot()); return snapshot(); };
    const updateListeners = new Set();
    const setUpdates = change => { Object.assign(initial.updates, change); for (const listener of updateListeners) listener(structuredClone(initial.updates)); return structuredClone(initial.updates); };
    window.chatGPTQA = { usage: 0, folders: [], checks: 0, downloads: 0, installs: 0, update, setUpdates, failTest: false, failUpdate: false, failFolder: false, slowTest: false };
    const boards = { filePath: "C:/Workspace/Applications-boards.sqlite", filename: "Applications-boards.sqlite", dirty: false, error: "", boards: [], progress: [] };
    window.desktop = new Proxy({
      state: async () => snapshot(), boardsState: async () => boards,
      confirmUpdateLoaded: async () => undefined,
      onChatGPTChanged: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      setAnalysisProvider: async provider => { initial.analysisProvider = provider; return snapshot(); },
      setAppearance: async appearance => { initial.appearance = appearance; return snapshot(); },
      setSidebarCollapsed: async value => { initial.sidebarCollapsed = value; return snapshot(); },
      connectChatGPT: async () => update({ connected: true, account: "owner@example.com", activeAccount: "account-1", welcome: true,
        accounts: [{ id: "account-1", label: "owner@example.com (1)" }],
        models: [{ id: "gpt-6.1-sol", name: "GPT-6.1 Sol", thinking: ["low", "medium", "high"], defaultThinking: "medium", vision: true }] }),
      cancelChatGPTConnect: async () => update({ connecting: false }),
      disconnectChatGPT: async () => update({ connected: false, models: [], notice: "Disconnected from ChatGPT." }),
      configureChatGPT: async (model, thinking) => update({ model, thinking }),
      refreshChatGPTModels: async () => snapshot(),
      testChatGPT: async () => {
        if (window.chatGPTQA.slowTest) await new Promise(resolve => { window.chatGPTQA.finishTest = resolve; });
        if (window.chatGPTQA.failTest) { update({ notice: "", paused: true }); throw new Error("ChatGPT usage limit reached. Manage usage in Settings, then retry."); }
        return update({ tested: true, visionTested: true, paused: false, error: "", notice: "Connected. Structured analysis and image inputs verified." });
      },
      manageChatGPTUsage: async () => { window.chatGPTQA.usage++; },
      acknowledgeChatGPTWelcome: async () => update({ welcome: false }),
      openChatGPTJobs: async id => { window.chatGPTQA.folders.push(id || "all"); if (window.chatGPTQA.failFolder) throw new Error("Could not open the analysis job folder."); },
      onUpdatesChanged: listener => { updateListeners.add(listener); return () => updateListeners.delete(listener); },
      checkForUpdates: async () => {
        window.chatGPTQA.checks++;
        return setUpdates({ checking: false, checkedAt: new Date().toISOString(), error: window.chatGPTQA.failUpdate ? "Could not check for updates." : "" });
      },
      downloadUpdate: async () => { window.chatGPTQA.downloads++; return setUpdates({ download: { phase: "downloading", received: 50, total: 100, error: "" } }); },
      installUpdate: async () => { window.chatGPTQA.installs++; setUpdates({ download: { phase: "installing", received: 100, total: 100, error: "" } }); },
    }, { get: (target, property) => property in target ? target[property] : String(property).startsWith("on") ? () => () => {} : () => { throw new Error(`Unexpected bridge call: ${String(property)}`); } });
  }, state);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(await page.getByLabel("Analyze with", { exact: true }).locator('option[value="chatgpt"]').innerText(), "ChatGPT plan");
  assert.equal(await page.locator(".desktop-titlebar").innerText(), "Zebby");
  await page.getByLabel("Analyze with", { exact: true }).selectOption("chatgpt");
  const showAnalysis = () => page.locator("#ai-settings").evaluate(element => element.closest(".settings-section").scrollIntoView({ block: "start", behavior: "instant" }));
  await showAnalysis();
  await page.getByRole("button", { name: "Continue with ChatGPT", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "settings-disconnected.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Continue with ChatGPT", exact: true }).click();
  const welcome = page.getByRole("dialog", { name: "You're using your ChatGPT plan" });
  await welcome.waitFor();
  await page.screenshot({ path: path.join(output, "welcome.png"), animations: "disabled" });
  await welcome.getByRole("button", { name: "Got it", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "ChatGPT model");
  await page.getByLabel("ChatGPT model", { exact: true }).selectOption("gpt-6.1-sol");
  await page.getByLabel("ChatGPT thinking level", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByText("Connected. Structured analysis and image inputs verified.", { exact: true }).waitFor();
  for (const theme of ["light", "dark"]) {
    await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).check();
    for (const width of [1550, 1050, 790]) {
      await page.setViewportSize({ width, height: 950 });
      await showAnalysis();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
      await page.screenshot({ path: path.join(output, `settings-connected-${theme}-${width}.png`), fullPage: true, animations: "disabled" });
    }
  }
  await page.setViewportSize({ width: 1050, height: 950 });
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await page.evaluate(() => { window.chatGPTQA.failTest = true; });
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByRole("alert").getByText("ChatGPT usage limit reached. Manage usage in Settings, then retry.", { exact: true }).waitFor();
  await showAnalysis();
  await page.screenshot({ path: path.join(output, "settings-limit.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Manage usage", exact: true }).click();
  assert.equal(await page.evaluate(() => window.chatGPTQA.usage), 1);
  await page.getByRole("alert").getByText("ChatGPT usage limit reached. Manage usage in Settings, then retry.", { exact: true }).waitFor();
  await page.evaluate(() => { window.chatGPTQA.failTest = false; });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("Connected. Structured analysis and image inputs verified.", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.chatGPTQA.usage), 1);
  await page.evaluate(() => {
    const usage = { inputTokens: 6000, outputTokens: 1600, totalTokens: 7600, cachedInputTokens: 4000, reasoningTokens: 1200 };
    const attempt = (id, state, details) => ({ id, state, startedAt: "2026-11-06T12:00:00Z", requestStarted: true, ...details });
    const job = (id, name, state, details) => ({ id: id.repeat(64), name, state, createdAt: "2020-01-01T00:00:00Z", updatedAt: "2026-11-06T12:00:00Z", model: "gpt-6.1-sol", thinking: "high", error: "", ...details });
    window.chatGPTQA.update({ jobs: [
      job("a", "resume_plan", "applied", { reuseCount: 2, attempts: [attempt("a1", "failed", { usage }), attempt("a2", "completed", { usage })] }),
      job("b", "board_extract", "failed", { attempts: [attempt("b1", "interrupted"), attempt("b2", "failed", { usage })], error: "The connection ended before completion. Retry the original action." }),
      job("c", "application_match", "applied", {}),
      job("d", "tailored_resume", "ready", { attempts: [attempt("d1", "completed", { usage })] }),
      job("e", "connection_image_test", "running", { attempts: [attempt("e1", "running")] }),
      job("f", "connection_test", "cancelled", { attempts: [attempt("f1", "cancelled", { requestStarted: false })] }),
    ] });
  });
  const history = page.getByRole("list", { name: "Analysis usage", exact: true });
  const planJob = history.locator(":scope > li").filter({ hasText: "Plan analysis" });
  await planJob.getByText("15,200 tokens", { exact: true }).waitFor();
  assert.equal(await history.locator(":scope > li").count(), 5);
  assert.equal(await page.getByRole("button", { name: /^(Keep|Kept|Export job)$/ }).count(), 0);
  await planJob.getByText("Saved result reused", { exact: true }).waitFor();
  assert.equal(await history.getByText("Saved", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /Clear finished jobs|View job/ }).count(), 0);
  assert.equal(await planJob.locator("time").innerText(), "Nov 6, 2026");
  await planJob.getByRole("button", { name: "Run details for Plan analysis", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.chatGPTQA.folders), ["a".repeat(64)]);
  for (const theme of ["light", "dark"]) {
    await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).check();
    for (const width of [1550, 1050, 790]) {
      await page.setViewportSize({ width, height: 1150 }); await showAnalysis();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Usage overflow at ${width}`);
      const alignment = await history.locator(":scope > li").evaluateAll(rows => rows.map(row => {
        const info = row.querySelector(".chatgpt-job-info").getBoundingClientRect();
        const tokens = row.querySelector(".chatgpt-job-total").getBoundingClientRect();
        const link = row.querySelector(".chatgpt-run-details").getBoundingClientRect();
        const center = rect => rect.y + rect.height / 2;
        return { tokens: Math.abs(center(info) - center(tokens)), link: Math.abs(center(info) - center(link)) };
      }));
      assert.ok(alignment.every(row => row.tokens < 2 && row.link < 2), `Usage actions are centered at ${width}: ${JSON.stringify(alignment)}`);
      await page.screenshot({ path: path.join(output, `usage-${theme}-${width}.png`), animations: "disabled" });
    }
  }
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await page.setViewportSize({ width: 1050, height: 1150 });
  await planJob.locator(".chatgpt-job-toggle").focus(); await page.keyboard.press("Space");
  await planJob.locator(".chatgpt-job-detail").waitFor();
  assert.equal(await planJob.locator(".chatgpt-job-toggle").getAttribute("aria-expanded"), "true");
  const breakdown = planJob.locator(".chatgpt-job-detail > .chatgpt-token-breakdown");
  assert.deepEqual(await breakdown.locator("dd").allTextContents(), ["12,000", "3,200", "8,000", "2,400"]);
  await planJob.getByText("Saved result reused 2 times. Reuse makes no new model request.", { exact: true }).waitFor();
  await planJob.getByRole("list", { name: "Analysis attempts" }).waitFor();
  await showAnalysis();
  await page.screenshot({ path: path.join(output, "usage-expanded-light-1050.png"), animations: "disabled" });
  await planJob.locator(".chatgpt-job-toggle").click();
  const boardJob = history.locator(":scope > li").filter({ hasText: "Boards analysis" });
  await boardJob.locator(".chatgpt-job-toggle").click();
  await boardJob.getByText("Usage is unavailable for 1 attempt. The reported total is incomplete.", { exact: true }).waitFor();
  await page.getByRole("radio", { name: "Dark", exact: true }).check(); await page.setViewportSize({ width: 790, height: 1150 }); await boardJob.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "usage-partial-dark-790.png"), animations: "disabled" });
  await boardJob.locator(".chatgpt-job-toggle").click();
  await page.getByRole("button", { name: "Show 6 recent jobs", exact: true }).click();
  await history.getByText("No model request", { exact: true }).waitFor();
  assert.equal(await history.locator(":scope > li").count(), 6);
  await page.getByRole("button", { name: "Show recent jobs", exact: true }).click();
  await page.evaluate(() => { window.chatGPTQA.failFolder = true; });
  await planJob.getByRole("button", { name: "Run details for Plan analysis", exact: true }).click();
  await page.getByRole("alert").getByText("Could not open the analysis job folder.", { exact: true }).waitFor();
  await page.getByRole("radio", { name: "Light", exact: true }).check(); await page.setViewportSize({ width: 1050, height: 1150 });
  await page.getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "usage-folder-error.png"), animations: "disabled" });
  await page.evaluate(() => { window.chatGPTQA.failFolder = false; });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  assert.equal(await history.locator(":scope > li").count(), 5);
  await page.evaluate(() => { window.chatGPTQA.slowTest = true; });
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.chatGPTQA.finishTest));
  assert.equal(await page.getByRole("button", { name: "Manage usage", exact: true }).isDisabled(), true);
  await showAnalysis(); await page.screenshot({ path: path.join(output, "usage-connection-busy.png"), animations: "disabled" });
  await page.evaluate(() => { window.chatGPTQA.slowTest = false; window.chatGPTQA.finishTest(); });
  await page.waitForFunction(() => document.activeElement?.textContent === "Test connection" && !document.activeElement.disabled);
  assert.equal(await history.locator(":scope > li").count(), 5, "Connection checks preserve history");
  await page.getByText("About this history", { exact: true }).click();
  await page.getByText(/All job files stay in your folder until you delete them/).waitFor();
  await page.getByRole("button", { name: "Open jobs folder", exact: true }).click();
  assert.equal(await page.evaluate(() => window.chatGPTQA.folders.at(-1)), "all");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Continue with ChatGPT", exact: true }).waitFor();
  const updates = page.getByRole("region", { name: "Updates", exact: true });
  await updates.getByRole("button", { name: "Check for updates", exact: true }).click();
  await updates.getByText("Up to date", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.chatGPTQA.checks), 1);
  await page.evaluate(() => { window.chatGPTQA.failUpdate = true; });
  await updates.getByRole("button", { name: "Check for updates", exact: true }).click();
  await updates.getByRole("alert").getByText(/Could not check for updates/).waitFor();
  await page.setViewportSize({ width: 790, height: 950 });
  await updates.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "updates-offline-light-790.png"), animations: "disabled" });
  await page.evaluate(() => { window.chatGPTQA.failUpdate = false; });
  await updates.getByRole("button", { name: "Retry", exact: true }).click();
  await updates.getByText("Up to date", { exact: true }).waitFor();
  await page.evaluate(() => window.chatGPTQA.setUpdates({ checking: true }));
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="updates-settings"] button')?.disabled);
  assert.equal(await updates.getByRole("button", { name: "Check for updates", exact: true }).isDisabled(), true);
  await page.evaluate(() => window.chatGPTQA.setUpdates({ checking: false, available: { version: "2.11.0", size: 100, sha256: "a".repeat(64),
    installerUrl: "https://github.com/desigrit/zebby-the-scout/releases/download/v2.11.0/Zebby-2.11.0-win-x64.exe",
    releaseUrl: "https://github.com/desigrit/zebby-the-scout/releases/tag/v2.11.0" } }));
  await updates.getByRole("button", { name: "Update to 2.11.0", exact: true }).click();
  await updates.getByRole("button", { name: "Downloading 50%", exact: true }).waitFor();
  assert.equal(await updates.getByRole("button", { name: "Downloading 50%", exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.chatGPTQA.downloads), 1);
  await page.evaluate(() => window.chatGPTQA.setUpdates({ download: { phase: "error", received: 0, total: 100, error: "The update could not be verified. Try downloading again." } }));
  await updates.getByRole("button", { name: "Retry", exact: true }).click();
  assert.equal(await page.evaluate(() => window.chatGPTQA.downloads), 2);
  await page.evaluate(() => window.chatGPTQA.setUpdates({ download: { phase: "ready", received: 100, total: 100, error: "" } }));
  for (const theme of ["light", "dark"]) {
    await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).check();
    for (const width of [1550, 1050, 790]) {
      await page.setViewportSize({ width, height: 950 }); await updates.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Update overflow at ${width}`);
      await updates.getByRole("button", { name: "Restart to update", exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `updates-ready-${theme}-${width}.png`), animations: "disabled" });
    }
  }
  await updates.getByRole("button", { name: "Restart to update", exact: true }).click();
  assert.equal(await page.evaluate(() => window.chatGPTQA.installs), 1);
  assert.equal(await updates.getByRole("button", { name: "Restarting", exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("Public Settings verified: connection, welcome, model, thinking, usage, recovery, responsive layouts and public updates.");
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => undefined);
    await writeFile(path.join(output, "failure.txt"), `${String(error)}\n\n${await page.locator("body").innerText().catch(() => "")}`);
  }
  throw error;
} finally { await browser?.close(); server.close(); server.closeAllConnections(); }

import { planInstructions, planSchema, matchInstructions, matchSchema } from "./analysis-contracts";
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, safeStorage, shell } from "electron";
import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchJobPosting } from "../lib/job-fetch";
import type { ApplicationInput } from "../lib/application-types";
import { analyzeWithOllama, DEFAULT_OLLAMA_URL, listOllamaModels, normalizeOllamaUrl } from "./ollama";
import { extractResumeText } from "./resume-text";
import { DesktopStore, type PlanInput } from "./store";
import { getLocalModel } from "./local-model-catalog";
import { LocalModelDownloads } from "./local-model-downloads";
import { LocalModelEngine } from "./local-model-engine";
import { publicAnalysisText, runSelectedAnalysis } from "./analysis-routing";
import { deleteDownloadedModel } from "./local-model-removal";
import { localModelFolder } from "./local-model-storage";
import { freemem, totalmem } from "node:os";

protocol.registerSchemesAsPrivileged([{
  scheme: "tracker", privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

const appRoot = __dirname;
const rendererRoot = path.join(appRoot, "renderer");
let mainWindow: BrowserWindow | null = null;
let store: DesktopStore;
let apiKey = "";
let startupError = "";
let modelDownloads: LocalModelDownloads;
let modelEngine: LocalModelEngine;
let shuttingDown = false;
type Appearance = "auto" | "dark" | "light";
type AnalysisProvider = "ollama" | "openai" | "builtin";
let settings: { databasePath?: string; encryptedApiKey?: string; appearance?: Appearance;
  captureLogs?: boolean; analysisProvider?: AnalysisProvider; ollamaUrl?: string; ollamaModel?: string; builtInModelId?: string } = {};
let logQueue = Promise.resolve();

function settingsPath() { return path.join(app.getPath("userData"), "settings.json"); }
function logsPath() { return path.join(app.getPath("userData"), "Logs"); }

function logDiagnostic(message: string, error?: unknown) {
  if (!settings.captureLogs) return;
  const detail = error instanceof Error ? error.stack || error.message : error ? String(error) : "";
  const line = `${new Date().toISOString()} ${message}${detail ? `: ${detail}` : ""}\n`.slice(0, 8000);
  logQueue = logQueue.then(async () => {
    const folder = logsPath();
    const file = path.join(folder, "tracker.log");
    await mkdir(folder, { recursive: true });
    if (((await stat(file).catch(() => null))?.size || 0) > 2_000_000) {
      const previous = path.join(folder, "tracker.previous.log");
      await unlink(previous).catch(() => undefined);
      await rename(file, previous);
    }
    await appendFile(file, line, "utf8");
  }).catch((failure) => console.error("Could not write diagnostic log", failure));
}

async function saveSettings() {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

async function loadSettings() {
  try { settings = JSON.parse(await readFile(settingsPath(), "utf8")); }
  catch { settings = {}; }
  if (!["auto", "dark", "light"].includes(settings.appearance || "auto")) settings.appearance = "auto";
  if (!["ollama", "openai", "builtin"].includes(settings.analysisProvider || "")) {
    settings.analysisProvider = settings.encryptedApiKey ? "openai" : "ollama";
  }
  settings.ollamaUrl ||= DEFAULT_OLLAMA_URL;
  settings.ollamaModel ||= "";
  try { if (settings.builtInModelId) getLocalModel(settings.builtInModelId); }
  catch { settings.builtInModelId = ""; }
  settings.captureLogs = settings.captureLogs === true;
  if (settings.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try { apiKey = safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, "base64")); }
    catch { apiKey = ""; }
  }
  if (settings.databasePath) {
    try { await store.open(settings.databasePath); }
    catch (error) { startupError = error instanceof Error ? error.message : "The last database could not be opened.";
      logDiagnostic("Could not open the saved database", error); }
  }
  if (!store.status.filePath) {
    const localPath = path.join(app.getPath("userData"), "PM Applications.sqlite");
    if ((await stat(localPath).catch(() => null))?.isFile()) await store.open(localPath);
    else await store.create(localPath);
    if (!settings.databasePath) {
      settings.databasePath = localPath;
      await saveSettings();
    }
  }
}

function state() {
  return {
    ...store.status, startupError, hasApiKey: Boolean(apiKey),
    analysisProvider: settings.analysisProvider || "ollama",
    ollamaUrl: settings.ollamaUrl || DEFAULT_OLLAMA_URL,
    ollamaModel: settings.ollamaModel || "",
    builtInModelId: settings.builtInModelId || "",
    localModels: modelDownloads?.list() || [], modelsFolder: modelDownloads?.folder || "",
    localEngine: { status: modelEngine?.status || "idle", modelId: modelEngine?.modelId || "" },
    totalMemory: totalmem(), availableMemory: freemem(),
    canSaveApiKey: safeStorage.isEncryptionAvailable(),
    backupsPath: store.backupsPath,
    appearance: settings.appearance || "auto", captureLogs: Boolean(settings.captureLogs), logsPath: logsPath(),
    platform: process.platform,
  };
}

async function chooseDatabase(kind: "open" | "create") {
  const parent = mainWindow || undefined;
  const defaultPath = settings.databasePath ? path.dirname(settings.databasePath) : app.getPath("documents");
  let filePath = "";
  if (kind === "open") {
    const result = await dialog.showOpenDialog(parent!, {
      title: "Open application database", defaultPath,
      properties: ["openFile"],
      filters: [{ name: "SQLite databases", extensions: ["sqlite", "db"] }],
    });
    if (result.canceled) return null;
    filePath = result.filePaths[0];
    await store.open(filePath);
  } else {
    const result = await dialog.showSaveDialog(parent!, {
      title: "Create application database", defaultPath: path.join(defaultPath, "PM Applications.sqlite"),
      filters: [{ name: "SQLite database", extensions: ["sqlite"] }],
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
    if (store.status.filePath) await store.copyCurrentTo(filePath);
    else await store.create(filePath);
  }
  settings.databasePath = filePath;
  startupError = "";
  await saveSettings();
  mainWindow?.webContents.send("desktop:database-changed", state());
  return state();
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function captureListing<T extends { listingUrl?: string; snapshotText?: string;
  snapshotSource?: "page" | "manual" | "saved" | ""; jobDescription?: string; description?: string }>(
  input: T, saved?: { listingUrl: string; snapshotText: string }): Promise<T> {
  const url = input?.listingUrl?.trim() || "";
  if (!/^https:\/\//i.test(url) || url.length > 2000 || input.snapshotText?.trim() ||
      saved?.listingUrl === url && saved.snapshotText) return input;
  try {
    const { text } = await fetchJobPosting(url);
    if (text) return { ...input, snapshotText: text, snapshotSource: "page",
      jobDescription: input.jobDescription || text, description: input.description || text };
  } catch { /* The user can save a manually pasted description when a site blocks reading. */ }
  return input;
}

async function analyzeWithOpenAI(instructions: string, input: unknown, name: string,
  schema: Record<string, unknown>, failure: string): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error("Add an OpenAI API key in Settings to run analysis.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model: "gpt-6-sol", reasoning: { effort: "low" }, store: false,
      instructions, input: Array.isArray(input) || typeof input === "string" ? input : JSON.stringify(input),
      text: { format: { type: "json_schema", name, strict: true, schema } } }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const detail = payload.error && typeof payload.error === "object"
      ? String((payload.error as Record<string, unknown>).message || "") : "";
    throw new Error(detail || `OpenAI returned ${response.status}. Check your API key and billing settings.`);
  }
  const output = Array.isArray(payload.output) ? payload.output : [];
  const content = output.flatMap((item) => item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).content)
    ? (item as { content: unknown[] }).content : []);
  const outputText = content.filter((item) => item && typeof item === "object" &&
    (item as Record<string, unknown>).type === "output_text")
    .map((item) => String((item as Record<string, unknown>).text || "")).join("");
  if (!outputText) throw new Error(failure);
  try { return JSON.parse(outputText) as Record<string, unknown>; }
  catch { throw new Error(failure); }
}

function selectedAnalysis() {
  return { provider: settings.analysisProvider || "ollama", ollamaUrl: settings.ollamaUrl || DEFAULT_OLLAMA_URL,
    ollamaModel: settings.ollamaModel || "", builtInModelId: settings.builtInModelId || "" };
}

async function analyzeWithSelectedProvider(instructions: string, input: unknown, name: string,
  schema: Record<string, unknown>, failure: string, selected: ReturnType<typeof selectedAnalysis>): Promise<Record<string, unknown>> {
  return runSelectedAnalysis(selected, {
    ollama: (baseUrl, model, prompt, content, format) => analyzeWithOllama({ baseUrl,
      model, instructions: prompt, content: JSON.stringify(content), schema: format }),
    openai: analyzeWithOpenAI,
    ready: (id) => modelDownloads.readyPath(id),
    local: (...args) => modelEngine.analyze(...args),
  }, instructions, input, name, schema, failure);
}

async function analyzePlan(id: string) {
  const selected = selectedAnalysis();
  const plan = store.getPlan(id);
  if (!plan) throw new Error("Plan not found.");
  if (!plan.currentOverview.trim()) throw new Error("Paste your current CV overview before analyzing this plan.");
  if (!plan.resumeId) throw new Error("Choose a resume for this plan before analyzing it.");
  const resume = store.getResume(plan.resumeId);
  if (!resume) throw new Error("The selected resume could not be found.");
  const description = [plan.description.trim(), plan.snapshotText.trim()]
    .find((item) => item.length >= 100) || plan.description.trim() || plan.snapshotText.trim();
  if (description.length < 100) {
    throw new Error("Add the job description before analyzing this plan.");
  }
  const job = { url: plan.listingUrl, company: plan.company, title: plan.title, team: plan.team,
    locations: plan.locations, jobDescription: description, currentCvOverview: plan.currentOverview };
  const input = selected.provider !== "openai"
    ? { ...job, resumeText: await extractResumeText(resume.resume.filename, resume.data) }
    : [{ role: "user", content: [
      { type: "input_file", filename: resume.resume.filename,
        file_data: `data:${resume.resume.contentType};base64,${Buffer.from(resume.data).toString("base64")}` },
      { type: "input_text", text: JSON.stringify(job) },
    ] }];
  const analysis = await analyzeWithSelectedProvider(planInstructions,
    input, "resume_plan", planSchema,
    "The analysis was incomplete. Try again.", selected);
  const keywords = Array.isArray(analysis.keywords) ? analysis.keywords.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(publicAnalysisText) : [];
  const themes = Array.isArray(analysis.themes) ? analysis.themes.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(publicAnalysisText) : [];
  const overview = typeof analysis.overview === "string" ? publicAnalysisText(analysis.overview.trim()) : "";
  const rawRationale = typeof analysis.overviewRationale === "string" ? publicAnalysisText(analysis.overviewRationale.trim()) : "";
  const sameOverview = overview.replace(/\s+/g, " ") === plan.currentOverview.trim().replace(/\s+/g, " ");
  const claimedEdit = /\b(?:I|we)\s+(?:changed|rewrote|replaced|added|removed|shifted|refocused|emphasized)\b/i.test(rawRationale);
  const overviewRationale = sameOverview && claimedEdit
    ? "The overview was returned unchanged. Review it against the role and edit it if you want to emphasize different experience."
    : rawRationale;
  const score = analysis.score;
  if (keywords.length < 6 || keywords.length > 20 || themes.length < 5 || themes.length > 6 || !overview || !overviewRationale ||
      typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("The analysis was incomplete. Try again.");
  }
  return store.savePlanAnalysis(id, plan.updatedAt, keywords, themes, overview, overviewRationale, score);
}

async function analyzeApplicationMatch(id: string) {
  const selected = selectedAnalysis();
  const application = store.listApplications().find((item) => item.id === id);
  if (!application) throw new Error("Application not found.");
  if (!application.resumeId) throw new Error("Add a resume to this application, then analyze the match.");
  const resume = store.getResume(application.resumeId);
  if (!resume) throw new Error("The selected resume could not be found.");
  const relatedPlan = application.listingUrl ? store.findPlanByListingUrl(application.listingUrl) : undefined;
  const descriptions = [application.jobDescription.trim(), application.snapshotText.trim(),
    relatedPlan?.description.trim() || "", relatedPlan?.snapshotText.trim() || ""];
  let description = descriptions.find((item) => item.length >= 80) || descriptions.find(Boolean) || "";
  if (description.length < 80 && application.listingUrl) {
    try { description = (await fetchJobPosting(application.listingUrl)).text.trim(); }
    catch { /* Some job boards block automated reading. */ }
  }
  if (description.length < 80) {
    throw new Error("Add the job description in this application or its matching Plan, then analyze the match.");
  }
  const input = selected.provider !== "openai"
    ? { resumeText: await extractResumeText(resume.resume.filename, resume.data),
      company: application.company, title: application.title, jobDescription: description.slice(0, 80_000) }
    : [{ role: "user", content: [
      { type: "input_file", filename: resume.resume.filename,
        file_data: `data:${resume.resume.contentType};base64,${Buffer.from(resume.data).toString("base64")}` },
      { type: "input_text", text: JSON.stringify({ company: application.company,
        title: application.title, jobDescription: description.slice(0, 80_000) }) },
    ] }];
  const analysis = await analyzeWithSelectedProvider(matchInstructions, input,
    "application_match", matchSchema, "The match analysis was incomplete. Try again.", selected);
  const score = analysis.score;
  const explanation = typeof analysis.explanation === "string" ? publicAnalysisText(analysis.explanation.trim()) : "";
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100 || !explanation) {
    throw new Error("The match analysis was incomplete. Try again.");
  }
  return store.saveMatchAnalysis(id, application.updatedAt, score, explanation, description);
}

async function handleApi(request: Request, pathname: string): Promise<Response> {
  const method = request.method.toUpperCase();
  try {
    if (pathname === "/api/applications") {
      if (method === "GET") return Response.json({ applications: store.listApplications() });
      if (method === "POST") return Response.json({ application: await store.saveApplication(
        await captureListing(await request.json() as ApplicationInput)) }, { status: 201 });
    }
    const applicationId = pathname.match(/^\/api\/applications\/([\da-f-]+)$/i)?.[1];
    if (applicationId) {
      if (method === "PATCH") return Response.json({ application: await store.saveApplication(
        await captureListing(await request.json() as ApplicationInput,
          store.listApplications().find((item) => item.id === applicationId)),
        applicationId) });
      if (method === "DELETE") { await store.deleteApplication(applicationId); return new Response(null, { status: 204 }); }
    }
    const matchId = pathname.match(/^\/api\/applications\/([\da-f-]+)\/analyze$/i)?.[1];
    if (matchId && method === "POST") return Response.json({ application: await analyzeApplicationMatch(matchId) });
    const notesId = pathname.match(/^\/api\/applications\/([\da-f-]+)\/notes$/i)?.[1];
    if (notesId && method === "PATCH") {
      const input = await request.json() as { notes?: unknown };
      return Response.json({ application: await store.saveApplicationNotes(notesId, input?.notes) });
    }
    if (pathname === "/api/resumes") {
      if (method === "GET") return Response.json({ resumes: store.listResumes() });
      if (method === "POST") {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return jsonError("Choose a resume file.");
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        const allowed: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword" };
        if (!allowed[extension]) return jsonError("Upload a PDF, DOCX, or DOC file.");
        if (!file.size || file.size > 10 * 1024 * 1024) return jsonError("Resume files must be between 1 byte and 10 MB.");
        const filename = file.name.replace(/[\r\n\\/]/g, " ").trim().slice(0, 180);
        if (!filename) return jsonError("Give the resume file a name.");
        return Response.json({ resume: await store.addResume(filename, allowed[extension], new Uint8Array(await file.arrayBuffer())) }, { status: 201 });
      }
    }
    if (pathname === "/api/job-details" && method === "POST") {
      const input = await request.json() as { url?: string };
      if (!input?.url || input.url.length > 2000) return jsonError("Enter a valid job listing link.");
      const { details } = await fetchJobPosting(input.url);
      return Response.json({ details });
    }
    if (pathname === "/api/job-posting" && method === "POST") {
      const input = await request.json() as { url?: string };
      if (!input?.url || input.url.length > 2000) return jsonError("Enter a valid job listing link.");
      return Response.json(await fetchJobPosting(input.url));
    }
    if (pathname === "/api/plans") {
      if (method === "GET") return Response.json({ plans: store.listPlans() });
      if (method === "POST") return Response.json({ plan: await store.savePlan(
        await captureListing(await request.json() as PlanInput)) }, { status: 201 });
    }
    const planId = pathname.match(/^\/api\/plans\/([\da-f-]+)$/i)?.[1];
    if (planId) {
      if (method === "PUT") return Response.json({ plan: await store.savePlan(
        await captureListing(await request.json() as PlanInput, store.getPlan(planId) || undefined), planId) });
      if (method === "DELETE") { await store.deletePlan(planId); return new Response(null, { status: 204 }); }
    }
    const analysisId = pathname.match(/^\/api\/plans\/([\da-f-]+)\/analyze$/i)?.[1];
    if (analysisId && method === "POST") return Response.json({ plan: await analyzePlan(analysisId) });
    return jsonError("Not found.", 404);
  } catch (error) {
    console.error("Desktop API request failed", pathname, error);
    logDiagnostic(`Request failed (${method} ${pathname})`, error);
    const message = error instanceof Error ? error.message : "The request could not be completed.";
    return jsonError(message, /changed outside|changed while/.test(message) ? 409 : 400);
  }
}

function registerProtocol() {
  protocol.handle("tracker", async (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Not found", { status: 404 });
    if (url.pathname.startsWith("/api/")) return handleApi(request, url.pathname);
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const target = path.resolve(rendererRoot, "." + pathname);
    const relative = path.relative(rendererRoot, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return new Response("Not found", { status: 404 });
    if (!(await stat(target).catch(() => null))?.isFile()) return new Response("Not found", { status: 404 });
    const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
      ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };
    return new Response(await readFile(target), {
      headers: { "Content-Type": mime[path.extname(target)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" },
    });
  });
}

function registerIpc() {
  ipcMain.handle("desktop:state", () => state());
  ipcMain.handle("desktop:choose-database", async (_event, kind: "open" | "create") => {
    try { return await chooseDatabase(kind); }
    catch (error) { logDiagnostic(`Could not ${kind} database`, error); throw error; }
  });
  ipcMain.handle("desktop:retry-sync", async () => {
    try { return await store.retrySync(); }
    catch (error) { logDiagnostic("Could not save database", error); throw error; }
  });
  ipcMain.handle("desktop:open-backups", () => shell.openPath(store.backupsPath));
  ipcMain.handle("desktop:set-appearance", async (_event, value: Appearance) => {
    if (value !== "auto" && value !== "dark" && value !== "light") throw new Error("Choose an appearance option.");
    settings.appearance = value;
    await saveSettings();
    return state();
  });
  ipcMain.handle("desktop:set-log-capture", async (_event, value: boolean) => {
    if (typeof value !== "boolean") throw new Error("Choose whether to capture logs.");
    settings.captureLogs = value;
    await saveSettings();
    if (value) logDiagnostic("Diagnostic logging enabled");
    return state();
  });
  ipcMain.handle("desktop:open-logs", async () => {
    await mkdir(logsPath(), { recursive: true });
    return shell.openPath(logsPath());
  });
  ipcMain.on("desktop:renderer-error", (_event, message: unknown) => {
    if (typeof message === "string") logDiagnostic("Renderer error", message.slice(0, 4000));
  });
  ipcMain.handle("desktop:set-api-key", async (_event, value: string) => {
    if (typeof value !== "string" || value.length > 500) throw new Error("The API key is invalid.");
    apiKey = value.trim();
    settings.encryptedApiKey = apiKey && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(apiKey).toString("base64") : undefined;
    await saveSettings();
    return state();
  });
  ipcMain.handle("desktop:set-analysis-provider", async (_event, value: AnalysisProvider) => {
    if (value !== "ollama" && value !== "openai" && value !== "builtin") throw new Error("Choose an analysis provider.");
    settings.analysisProvider = value;
    await saveSettings();
    return state();
  });
  ipcMain.handle("desktop:set-ollama-config", async (_event, value: { url?: string; model?: string }) => {
    if (!value || typeof value.url !== "string" || typeof value.model !== "string" ||
        value.model.length > 200 || /[\r\n]/.test(value.model)) {
      throw new Error("Enter an Ollama server URL and model.");
    }
    settings.ollamaUrl = normalizeOllamaUrl(value.url);
    settings.ollamaModel = value.model.trim();
    await saveSettings();
    return state();
  });
  ipcMain.handle("desktop:list-ollama-models", async (_event, url: string) => {
    if (typeof url !== "string" || url.length > 500) throw new Error("Enter an Ollama server URL.");
    return listOllamaModels(url);
  });
  ipcMain.handle("desktop:select-local-model", async (_event, id: string) => {
    getLocalModel(id);
    settings.builtInModelId = id;
    await saveSettings();
    await modelDownloads.start(id);
    return state();
  });
  ipcMain.handle("desktop:pause-model-download", async () => { await modelDownloads.pause(); return state(); });
  ipcMain.handle("desktop:resume-model-download", async (_event, id: string) => {
    getLocalModel(id); await modelDownloads.start(id); return state();
  });
  ipcMain.handle("desktop:delete-local-model", async (_event, id: string) => {
    await deleteDownloadedModel(id, { engine: modelEngine, downloads: modelDownloads,
      confirm: async (options) => (await dialog.showMessageBox(mainWindow!, options)).response === 1,
    });
    return state();
  });
  ipcMain.handle("desktop:open-model-folder", () => shell.openPath(modelDownloads.folder));
  ipcMain.handle("desktop:download-resume", async (_event, id: string) => {
    const file = store.getResume(id);
    if (!file) throw new Error("Resume not found.");
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: file.resume.filename,
      title: "Save resume" });
    if (!result.canceled && result.filePath) await writeFile(result.filePath, file.data);
    return !result.canceled;
  });
}

function createMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: app.name, submenu: [
    { role: "about" }, { type: "separator" }, { role: "services" }, { type: "separator" },
    { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" },
  ] }]));
}

function openWebLink(url: string) {
  try {
    const target = new URL(url);
    if (target.protocol === "http:" || target.protocol === "https:") {
      void shell.openExternal(target.toString()).catch((error) => logDiagnostic("Could not open web link", error));
    }
  } catch { /* Ignore malformed links. */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1250, height: 850, minWidth: 790, minHeight: 620,
    backgroundColor: "#f5f3ed", title: "PM Application Tracker", autoHideMenuBar: true,
    icon: path.join(rendererRoot, "icon.png"),
    webPreferences: { preload: path.join(appRoot, "preload.cjs"), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openWebLink(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("tracker://app/")) {
      event.preventDefault();
      openWebLink(url);
    }
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) =>
    logDiagnostic("Renderer process stopped", `${details.reason}, exit code ${details.exitCode}`));
  void mainWindow.loadURL("tracker://app/");
  mainWindow.on("closed", () => { mainWindow = null; });
}

if (process.env.PM_TRACKER_TEST_USER_DATA) app.setPath("userData", path.resolve(process.env.PM_TRACKER_TEST_USER_DATA));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    app.setName("PM Application Tracker");
    store = new DesktopStore(app.getPath("userData"));
    await loadSettings();
    const modelsChanged = () => mainWindow?.webContents.send("desktop:local-models-changed", state());
    modelDownloads = new LocalModelDownloads(localModelFolder(app.getPath("userData"), process.platform,
      process.env.LOCALAPPDATA), { onChange: modelsChanged });
    await modelDownloads.initialize();
    const platformFolder = `${process.platform === "darwin" ? "mac" : "win"}-${process.arch}`;
    modelEngine = new LocalModelEngine({ downloads: modelDownloads, onChange: modelsChanged,
      runtimeFolder: app.isPackaged ? path.join(process.resourcesPath, "local-runtime") : path.resolve(appRoot, "../build/llama", platformFolder),
      workerPath: path.join(appRoot, "local-runtime-worker.cjs") });
    registerProtocol();
    registerIpc();
    createMenu();
    createWindow();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch((error) => { console.error("Could not start PM Application Tracker", error);
    logDiagnostic("Could not start the app", error);
    dialog.showErrorBox("Could not start PM Application Tracker", String(error)); app.quit(); });
  app.on("before-quit", (event) => {
    if (store?.status.dirty) {
      event.preventDefault();
      dialog.showMessageBoxSync({ type: "warning", title: "Changes have not synced",
        message: "The latest changes are still on this computer.",
        detail: "Open Settings and use Retry save before closing the app.", buttons: ["Keep app open"] });
    } else if (!shuttingDown) {
      event.preventDefault(); shuttingDown = true;
      void Promise.all([modelDownloads?.pause(), modelEngine?.shutdown()])
        .finally(() => { store?.close(); app.quit(); });
    } else store?.close();
  });
}

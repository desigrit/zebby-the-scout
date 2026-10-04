import { planInstructions, planSchema, matchInstructions, matchSchema } from "./analysis-contracts";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, safeStorage, screen, shell } from "electron";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchJobPosting } from "../lib/job-fetch";
import type { ApplicationInput } from "../lib/application-types";
import { analyzeWithOllama, DEFAULT_OLLAMA_URL, listOllamaModels, normalizeOllamaUrl } from "./ollama";
import { extractResumeText } from "./resume-text";
import { DesktopStore, type PlanInput } from "./store";
import { getLocalModel, LOCAL_MODELS } from "./local-model-catalog";
import { LocalModelDownloads } from "./local-model-downloads";
import { LocalModelEngine } from "./local-model-engine";
import { publicAnalysisText, runSelectedAnalysis } from "./analysis-routing";
import { deleteDownloadedModel } from "./local-model-removal";
import { localModelFolder } from "./local-model-storage";
import { acceptModelTerms, modelTermsAccepted, type AcceptedModelTerms } from "./local-model-consent";
import { parsePlanRecommendations } from "./plan-importance";
import { freemem, totalmem } from "node:os";
import { APP_NAME, configureApplicationProfile, migrateApplicationProfile, migrateModelFolder } from "./app-identity";
import { ReleaseUpdates } from "./release-updates";
import { SelfUpdater } from "./self-update";
import { nativeWindowShell, windowColors, type Appearance } from "./window-appearance";
import { DiagnosticLog } from "./diagnostic-log";
import { randomUUID, createHash } from "node:crypto";
import { AnalysisRequests } from "./analysis-requests";
import { CreditsClient } from "./credits-client";
import { onlineAnalysis } from "./online-analysis";
import { onlineModel, type AnalysisProvider, type AnalysisSource } from "../shared/online-models";

protocol.registerSchemesAsPrivileged([{
  scheme: "tracker", privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

const appRoot = __dirname;
const rendererRoot = path.join(appRoot, "renderer");
let mainWindow: BrowserWindow | null = null;
let store: DesktopStore;
let apiKey = "";
let anthropicKey = "";
let creditsClient: CreditsClient;
const paidQuotes = new Map<string, { source: AnalysisSource; model: string; hash: string; expires: number; recovery?: boolean }>();
let startupError = "";
let modelDownloads: LocalModelDownloads;
let modelEngine: LocalModelEngine;
let shuttingDown = false;
let selfUpdater: SelfUpdater;
let installingUpdate = false;
let activeApiRequests = 0;
let activeSettingsRequests = 0;
const analysisRequests = new AnalysisRequests();
const updates = new ReleaseUpdates({ version: app.getVersion(), platform: process.platform, arch: process.arch,
  onChange: (value) => mainWindow?.webContents.send("desktop:updates-changed", value),
  onError: (error) => logDiagnostic("Could not check for updates", error) });
let settings: { databasePath?: string; encryptedApiKey?: string; appearance?: Appearance; sidebarCollapsed?: boolean;
  analysisProvider?: AnalysisProvider; ollamaUrl?: string; ollamaModel?: string; builtInModelId?: string;
  encryptedAnthropicKey?: string; encryptedCreditSession?: string; openaiModel?: string; anthropicModel?: string; creditModel?: string;
  acceptedModelTerms?: AcceptedModelTerms } = {};
const diagnosticLog = new DiagnosticLog(() => logsPath(), () => [apiKey, anthropicKey, ...(creditsClient?.secrets() || [])]);

function settingsPath() { return path.join(app.getPath("userData"), "settings.json"); }
function logsPath() { return path.join(app.getPath("userData"), "Logs"); }

function logDiagnostic(message: string, error?: unknown) {
  diagnosticLog.error(message, error);
}

async function saveSettings() {
  const snapshot = JSON.stringify(settings, null, 2);
  settingsWrites = settingsWrites.catch(() => undefined).then(() => writeFile(settingsPath(), snapshot, "utf8"));
  await settingsWrites;
}
let settingsWrites: Promise<unknown> = Promise.resolve();

async function loadSettings() {
  try { settings = JSON.parse(await readFile(settingsPath(), "utf8")); }
  catch (error) {
    settings = {};
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") logDiagnostic("Could not read local settings", error);
  }
  if (!["auto", "dark", "light"].includes(settings.appearance || "auto")) settings.appearance = "auto";
  if (!["ollama", "openai", "builtin", "anthropic", "credits"].includes(settings.analysisProvider || "")) {
    settings.analysisProvider = settings.encryptedApiKey ? "openai" : "ollama";
  }
  settings.ollamaUrl ||= DEFAULT_OLLAMA_URL;
  settings.ollamaModel ||= "";
  try { if (settings.builtInModelId) getLocalModel(settings.builtInModelId); }
  catch { settings.builtInModelId = ""; }
  if (!settings.acceptedModelTerms || typeof settings.acceptedModelTerms !== "object" || Array.isArray(settings.acceptedModelTerms)) {
    settings.acceptedModelTerms = {};
  }
  delete (settings as typeof settings & { captureLogs?: boolean }).captureLogs;
  if (settings.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try { apiKey = safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, "base64")); }
    catch (error) { apiKey = ""; logDiagnostic("Could not read the saved API key", error); }
  }
  for (const [field, fallback, provider] of [["openaiModel", "gpt-6.1-sol", "openai"],
    ["anthropicModel", "claude-sonnet-5-5", "anthropic"], ["creditModel", "gpt-6-luna", "credits"]] as const) {
    try { if (provider !== "credits" && onlineModel(settings[field] || fallback).provider !== provider) throw new Error(); onlineModel(settings[field] || fallback); }
    catch { settings[field] = fallback; }
  }
  if (settings.encryptedAnthropicKey && safeStorage.isEncryptionAvailable()) {
    try { anthropicKey = safeStorage.decryptString(Buffer.from(settings.encryptedAnthropicKey, "base64")); }
    catch (error) { logDiagnostic("Could not read the saved Anthropic key", error); }
  }
  creditsClient = new CreditsClient(process.env.ZEBBY_CREDITS_SERVICE_URL || "", {
    save: async (value) => { if (value && safeStorage.isEncryptionAvailable()) settings.encryptedCreditSession = safeStorage.encryptString(value).toString("base64");
      else delete settings.encryptedCreditSession; await saveSettings(); },
    onChange: () => mainWindow?.webContents.send("desktop:credits-changed", state()),
  });
  if (settings.encryptedCreditSession && safeStorage.isEncryptionAvailable()) {
    try { creditsClient.restore(safeStorage.decryptString(Buffer.from(settings.encryptedCreditSession, "base64"))); }
    catch (error) { logDiagnostic("Could not restore credit sign-in", error); }
  }
  if (settings.databasePath) {
    try { await store.open(settings.databasePath); }
    catch (error) { startupError = error instanceof Error ? error.message : "The last database could not be opened.";
      logDiagnostic("Could not open the saved database", error); }
  }
  if (!store.status.filePath) {
    const previousLocal = path.join(app.getPath("userData"), "PM Applications.sqlite");
    const localPath = (await stat(previousLocal).catch(() => null))?.isFile()
      ? previousLocal : path.join(app.getPath("userData"), "Zebby Applications.sqlite");
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
    ...store.status, startupError, hasApiKey: Boolean(apiKey), hasAnthropicKey: Boolean(anthropicKey),
    openaiModel: settings.openaiModel || "gpt-6.1-sol", anthropicModel: settings.anthropicModel || "claude-sonnet-5-5",
    credits: creditsClient.state(settings.creditModel || "gpt-6-luna"),
    analysisProvider: settings.analysisProvider || "ollama",
    ollamaUrl: settings.ollamaUrl || DEFAULT_OLLAMA_URL,
    ollamaModel: settings.ollamaModel || "",
    builtInModelId: settings.builtInModelId || "",
    acceptedModelTerms: LOCAL_MODELS.filter((model) => model.license && modelTermsAccepted(model, settings.acceptedModelTerms))
      .map((model) => model.id),
    localModels: modelDownloads?.list() || [], modelsFolder: modelDownloads?.folder || "",
    localEngine: { status: modelEngine?.status || "idle", modelId: modelEngine?.modelId || "" },
    totalMemory: totalmem(), availableMemory: freemem(),
    canSaveApiKey: safeStorage.isEncryptionAvailable(),
    appearance: settings.appearance || "auto", sidebarCollapsed: settings.sidebarCollapsed === true,
    logsPath: logsPath(),
    platform: process.platform,
    updates: updates.state,
  };
}

async function chooseDatabase(kind: "open" | "create") {
  if (kind !== "open" && kind !== "create") throw new Error("Choose whether to open or create a database.");
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
      title: "Create new database", defaultPath: path.join(defaultPath, "Zebby Applications.sqlite"),
      filters: [{ name: "SQLite database", extensions: ["sqlite"] }],
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
    await store.create(filePath);
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
  schema: Record<string, unknown>, _failure: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return (await onlineAnalysis({ model: settings.openaiModel || "gpt-6.1-sol", key: apiKey, instructions,
    input, name, schema, kind: name === "resume_plan" ? "plan" : "match", signal })).result;
}

function selectedAnalysis() {
  return { provider: settings.analysisProvider || "ollama", ollamaUrl: settings.ollamaUrl || DEFAULT_OLLAMA_URL,
    ollamaModel: settings.ollamaModel || "", builtInModelId: settings.builtInModelId || "" };
}

function analysisHash(input: unknown) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
async function quoteAnalysis(source: AnalysisSource) {
  if (!source || !["plan", "match"].includes(source.kind) || typeof source.id !== "string" || !/^[\da-f-]{36}$/i.test(source.id)) throw new Error("Choose a saved job to analyze.");
  let input: Record<string, unknown>;
  if (source.kind === "plan") {
    const plan = store.getPlan(source.id), resume = plan?.resumeId && store.getResume(plan.resumeId);
    if (!plan || !resume) throw new Error("Save the plan with a resume before analyzing it.");
    const description = [plan.description.trim(), plan.snapshotText.trim()].find((item) => item.length >= 100) || "";
    if (!description || !plan.currentOverview.trim()) throw new Error("Add the job description and your current resume overview.");
    input = { url: plan.listingUrl, company: plan.company, title: plan.title, team: plan.team, locations: plan.locations,
      jobDescription: description, currentCvOverview: plan.currentOverview, resumeText: await extractResumeText(resume.resume.filename, resume.data) };
  } else {
    const item = store.listApplications().find((value) => value.id === source.id), resume = item?.resumeId && store.getResume(item.resumeId);
    if (!item || !resume) throw new Error("Add a resume before analyzing the match.");
    const related = item.listingUrl ? store.findPlanByListingUrl(item.listingUrl) : undefined;
    const description = [item.jobDescription.trim(), item.snapshotText.trim(), related?.description.trim() || "", related?.snapshotText.trim() || ""]
      .find((value) => value.length >= 80);
    if (!description) throw new Error("Add the job description before analyzing the match.");
    input = { resumeText: await extractResumeText(resume.resume.filename, resume.data), company: item.company,
      title: item.title, jobDescription: description.slice(0, 80000) };
  }
  for (const [id, quote] of paidQuotes) if (quote.expires < Date.now()) paidQuotes.delete(id);
  if (paidQuotes.size >= 20) paidQuotes.delete(paidQuotes.keys().next().value!);
  const recovery = await creditsClient.recoveryQuote(source, input);
  if (recovery) { paidQuotes.set(recovery.id, { source, model: recovery.model, hash: analysisHash(input), expires: Date.parse(recovery.expiresAt), recovery: true }); return recovery; }
  const quote = await creditsClient.quote(source.kind, input, settings.creditModel || "gpt-6-luna");
  paidQuotes.set(quote.id, { source, model: quote.model, hash: analysisHash(input), expires: Date.parse(quote.expiresAt) });
  return quote;
}

async function analyzeWithSelectedProvider(instructions: string, input: unknown, name: string,
  schema: Record<string, unknown>, failure: string, selected: ReturnType<typeof selectedAnalysis>, signal: AbortSignal,
  paid?: { quoteId: string; source: AnalysisSource }): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  return runSelectedAnalysis(selected, {
    ollama: (baseUrl, model, prompt, content, format) => analyzeWithOllama({ baseUrl,
      model, instructions: prompt, content: JSON.stringify(content), schema: format, signal }),
    openai: (...args) => analyzeWithOpenAI(...args, signal),
    anthropic: async (prompt, content, formatName, format) => (await onlineAnalysis({ model: settings.anthropicModel || "claude-sonnet-5-5",
      key: anthropicKey, instructions: prompt, input: content, name: formatName, schema: format,
      kind: formatName === "resume_plan" ? "plan" : "match", signal })).result,
    credits: async () => {
      const quote = paid && paidQuotes.get(paid.quoteId);
      if (!paid || !quote || quote.source.id !== paid.source.id || quote.source.kind !== paid.source.kind || quote.expires < Date.now()
        || !quote.recovery && quote.model !== (settings.creditModel || "gpt-6-luna") || quote.hash !== analysisHash(input)) {
        throw new Error("Confirm a fresh credit quote before analyzing this job.");
      }
      return creditsClient.analyze(paid.quoteId, input, signal, paid.source, quote.model);
    },
    ready: (id) => {
      acceptModelTerms(getLocalModel(id), settings.acceptedModelTerms || {});
      return modelDownloads.readyPath(id);
    },
    local: (id, prompt, content, format, maxTokens) => modelEngine.analyze(id, prompt, content, format, maxTokens, signal),
  }, instructions, input, name, schema, failure);
}

async function analyzePlan(id: string, signal: AbortSignal, commit: <T>(persist: () => Promise<T>) => Promise<T>, quoteId = "") {
  const selected = selectedAnalysis();
  const plan = store.getPlan(id);
  if (!plan) throw new Error("Plan not found.");
  if (!plan.currentOverview.trim()) throw new Error("Add your current resume overview to analyze this plan.");
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
    "The analysis was incomplete. Try again.", selected, signal, { quoteId, source: { kind: "plan", id } });
  signal.throwIfAborted();
  const keywords = parsePlanRecommendations(analysis.keywords, 6, 20, 200);
  const themes = parsePlanRecommendations(analysis.themes, 5, 6, 1000);
  const overview = typeof analysis.overview === "string" ? publicAnalysisText(analysis.overview.trim()) : "";
  const rawRationale = typeof analysis.overviewRationale === "string" ? publicAnalysisText(analysis.overviewRationale.trim()) : "";
  const sameOverview = overview.replace(/\s+/g, " ") === plan.currentOverview.trim().replace(/\s+/g, " ");
  const claimedEdit = /\b(?:I|we)\s+(?:changed|rewrote|replaced|added|removed|shifted|refocused|emphasized)\b/i.test(rawRationale);
  const overviewRationale = sameOverview && claimedEdit
    ? "The overview was returned unchanged. Review it against the role and edit it if you want to emphasize different experience."
    : rawRationale;
  const score = analysis.score;
  const explanation = typeof analysis.explanation === "string" ? publicAnalysisText(analysis.explanation.trim()) : "";
  if (keywords.length < 6 || keywords.length > 20 || themes.length < 5 || themes.length > 6 || !overview || !overviewRationale ||
      !explanation || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("The analysis was incomplete. Try again.");
  }
  const saved = await commit(() => store.savePlanAnalysis(id, plan.updatedAt, keywords.map((item) => item.text),
    themes.map((item) => item.text), overview, overviewRationale, score,
    keywords.map((item) => item.importance), themes.map((item) => item.importance), explanation));
  if (selected.provider === "credits") { await creditsClient.acknowledge(quoteId).catch((error) => logDiagnostic("Could not clear completed credit recovery", error)); paidQuotes.delete(quoteId); }
  return saved;
}

async function analyzeApplicationMatch(id: string, signal: AbortSignal, commit: <T>(persist: () => Promise<T>) => Promise<T>, quoteId = "") {
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
    "application_match", matchSchema, "The match analysis was incomplete. Try again.", selected, signal, { quoteId, source: { kind: "match", id } });
  signal.throwIfAborted();
  const score = analysis.score;
  const explanation = typeof analysis.explanation === "string" ? publicAnalysisText(analysis.explanation.trim()) : "";
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100 || !explanation) {
    throw new Error("The match analysis was incomplete. Try again.");
  }
  const saved = await commit(() => store.saveMatchAnalysis(id, application.updatedAt, score, explanation, description));
  if (selected.provider === "credits") { await creditsClient.acknowledge(quoteId).catch((error) => logDiagnostic("Could not clear completed credit recovery", error)); paidQuotes.delete(quoteId); }
  return saved;
}

async function handleApi(request: Request, pathname: string): Promise<Response> {
  const method = request.method.toUpperCase();
  if (installingUpdate && method !== "GET") return jsonError("Zebby is restarting to install an update.", 503);
  activeApiRequests++;
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
    if (matchId && method === "POST") return Response.json({ application: await analysisRequests.run(
      request.headers.get("X-Zebby-Analysis-ID") || randomUUID(), (signal, commit) => analyzeApplicationMatch(matchId, signal, commit,
        request.headers.get("X-Zebby-Credit-Quote") || "")) });
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
      if (method === "GET") return Response.json({ plans: store.listPlans(), lastCurrentOverview: store.getLastCurrentOverview() });
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
    if (analysisId && method === "POST") return Response.json({ plan: await analysisRequests.run(
      request.headers.get("X-Zebby-Analysis-ID") || randomUUID(), (signal, commit) => analyzePlan(analysisId, signal, commit,
        request.headers.get("X-Zebby-Credit-Quote") || "")) });
    return jsonError("Not found.", 404);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return jsonError("Analysis cancelled.", 499);
    console.error("Desktop API request failed", pathname, error);
    logDiagnostic(`Request failed (${method} ${pathname})`, error);
    const message = error instanceof Error ? error.message : "The request could not be completed.";
    return jsonError(message, /changed outside|changed while/.test(message) ? 409 : 400);
  } finally { activeApiRequests--; }
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
  function handle<Args extends unknown[], Result>(channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Result | Promise<Result>) {
    ipcMain.handle(channel, async (event, ...args: Args) => {
      const changing = !["desktop:state", "desktop:check-updates", "desktop:download-update", "desktop:install-update",
        "desktop:list-ollama-models", "desktop:open-logs", "desktop:open-model-folder", "desktop:download-resume"].includes(channel);
      if (installingUpdate && changing) throw new Error("Zebby is restarting to install an update.");
      if (changing) activeSettingsRequests++;
      try { return await listener(event, ...args); }
      catch (error) { logDiagnostic(`Request failed (${channel})`, error); throw error; }
      finally { if (changing) activeSettingsRequests--; }
    });
  }
  handle("desktop:state", () => state());
  handle("desktop:send-credit-code", (_event, email: string) => creditsClient.sendCode(email));
  handle("desktop:verify-credit-code", async (_event, email: string, code: string) => { await creditsClient.verify(email, code); return state(); });
  handle("desktop:sign-out-credits", async () => { paidQuotes.clear(); await creditsClient.signOut(); return state(); });
  handle("desktop:refresh-credits", async () => { await creditsClient.refreshWallet(); return state(); });
  handle("desktop:start-credit-checkout", async (_event, pack: string) => {
    const checkout = await creditsClient.checkout(pack); await shell.openExternal(checkout.url);
    return { id: checkout.id, mode: checkout.mode };
  });
  handle("desktop:credit-checkout-status", (_event, id: string) => creditsClient.checkoutStatus(id));
  handle("desktop:quote-credit-analysis", (_event, source: AnalysisSource) => quoteAnalysis(source));
  handle("desktop:set-online-model", async (_event, provider: string, model: string) => {
    const selected = onlineModel(model);
    if (!["openai", "anthropic", "credits"].includes(provider) || provider !== "credits" && selected.provider !== provider) throw new Error("Choose a model for this provider.");
    settings[provider === "credits" ? "creditModel" : provider === "openai" ? "openaiModel" : "anthropicModel"] = model;
    paidQuotes.clear(); await saveSettings(); return state();
  });
  handle("desktop:set-anthropic-key", async (_event, value: string) => {
    if (typeof value !== "string" || value.length > 500) throw new Error("Enter an Anthropic API key.");
    anthropicKey = value.trim();
    if (anthropicKey && safeStorage.isEncryptionAvailable()) settings.encryptedAnthropicKey = safeStorage.encryptString(anthropicKey).toString("base64");
    else delete settings.encryptedAnthropicKey;
    await saveSettings(); return state();
  });
  handle("desktop:cancel-analysis", (_event, id: string) => analysisRequests.cancel(id));
  handle("desktop:check-updates", () => updates.check(true));
  handle("desktop:confirm-update-loaded", () => selfUpdater.cleanupInstalled(app.getVersion()));
  handle("desktop:download-update", async () => {
    if (!app.isPackaged) throw new Error("Automatic updates are available in the installed app.");
    const available = updates.state.available;
    if (!available) throw new Error("Check for an available update first.");
    await selfUpdater.download(available);
    return updates.state;
  });
  handle("desktop:install-update", async () => {
    if (installingUpdate) return;
    if (!app.isPackaged || updates.state.download.phase !== "ready") throw new Error("Download the update before restarting.");
    if (activeApiRequests || activeSettingsRequests) throw new Error("Wait for analysis and saving to finish, then restart to update.");
    installingUpdate = true;
    try {
      await store.retrySync();
      await Promise.all([modelDownloads.pause(), modelEngine.shutdown()]);
      await store.retrySync();
      await diagnosticLog.flush();
      await selfUpdater.install();
      shuttingDown = true;
      setImmediate(() => app.quit());
    } catch (error) { installingUpdate = false; throw error; }
  });
  handle("desktop:choose-database", (_event, kind: "open" | "create") => chooseDatabase(kind));
  handle("desktop:retry-sync", () => store.retrySync());
  handle("desktop:set-appearance", async (_event, value: Appearance) => {
    if (value !== "auto" && value !== "dark" && value !== "light") throw new Error("Choose an appearance option.");
    settings.appearance = value;
    nativeTheme.themeSource = value === "auto" ? "system" : value;
    updateWindowAppearance();
    await saveSettings();
    return state();
  });
  handle("desktop:set-sidebar-collapsed", async (_event, value: boolean) => {
    if (typeof value !== "boolean") throw new Error("Choose a navigation layout.");
    const previous = settings.sidebarCollapsed;
    settings.sidebarCollapsed = value;
    try { await saveSettings(); return state(); }
    catch (error) { settings.sidebarCollapsed = previous; throw error; }
  });
  handle("desktop:open-logs", async () => {
    await mkdir(logsPath(), { recursive: true });
    const error = await shell.openPath(logsPath());
    if (error) throw new Error(error);
  });
  ipcMain.on("desktop:renderer-error", (_event, message: unknown) => {
    if (typeof message === "string") logDiagnostic("Renderer error", message.slice(0, 4000));
  });
  handle("desktop:set-api-key", async (_event, value: string) => {
    if (typeof value !== "string" || value.length > 500) throw new Error("The API key is invalid.");
    apiKey = value.trim();
    settings.encryptedApiKey = apiKey && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(apiKey).toString("base64") : undefined;
    await saveSettings();
    return state();
  });
  handle("desktop:set-analysis-provider", async (_event, value: AnalysisProvider) => {
    if (!["ollama", "openai", "builtin", "anthropic", "credits"].includes(value)) throw new Error("Choose an analysis provider.");
    settings.analysisProvider = value;
    await saveSettings();
    return state();
  });
  handle("desktop:set-ollama-config", async (_event, value: { url?: string; model?: string }) => {
    if (!value || typeof value.url !== "string" || typeof value.model !== "string" ||
        value.model.length > 200 || /[\r\n]/.test(value.model)) {
      throw new Error("Enter an Ollama server URL and model.");
    }
    settings.ollamaUrl = normalizeOllamaUrl(value.url);
    settings.ollamaModel = value.model.trim();
    await saveSettings();
    return state();
  });
  handle("desktop:list-ollama-models", async (_event, url: string) => {
    if (typeof url !== "string" || url.length > 500) throw new Error("Enter an Ollama server URL.");
    return listOllamaModels(url);
  });
  handle("desktop:select-local-model", async (_event, id: string) => {
    const model = getLocalModel(id);
    settings.builtInModelId = id;
    await saveSettings();
    if (modelTermsAccepted(model, settings.acceptedModelTerms)) await modelDownloads.start(id);
    else await modelDownloads.pause();
    return state();
  });
  handle("desktop:pause-model-download", async () => { await modelDownloads.pause(); return state(); });
  handle("desktop:resume-model-download", async (_event, id: string, termsVersion?: string) => {
    const accepted = settings.acceptedModelTerms || {};
    const next = acceptModelTerms(getLocalModel(id), accepted, termsVersion);
    if (next !== accepted) { settings.acceptedModelTerms = next; await saveSettings(); }
    await modelDownloads.start(id); return state();
  });
  handle("desktop:delete-local-model", async (_event, id: string) => {
    await deleteDownloadedModel(id, { engine: modelEngine, downloads: modelDownloads,
      confirm: async (options) => (await dialog.showMessageBox(mainWindow!, options)).response === 1,
    });
    return state();
  });
  handle("desktop:open-model-folder", () => shell.openPath(modelDownloads.folder));
  handle("desktop:download-resume", async (_event, id: string) => {
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

function updateWindowAppearance() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const colors = windowColors(settings.appearance, nativeTheme.shouldUseDarkColors);
  mainWindow.setBackgroundColor(colors.background);
  if (process.platform !== "darwin") {
    mainWindow.setTitleBarOverlay({ color: colors.background, symbolColor: colors.foreground });
  }
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    show: !(process.env.PM_TRACKER_TEST_USER_DATA && process.env.PM_TRACKER_TEST_HIDE_WINDOW),
    width: Math.min(1550, workArea.width), height: Math.min(850, workArea.height),
    minWidth: Math.min(790, workArea.width), minHeight: Math.min(620, workArea.height),
    ...nativeWindowShell(process.platform, settings.appearance, nativeTheme.shouldUseDarkColors),
    title: APP_NAME, autoHideMenuBar: true,
    icon: path.join(rendererRoot, "icon.png"),
    webPreferences: { preload: path.join(appRoot, "preload.cjs"), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true,
      ...(process.env.PM_TRACKER_TEST_USER_DATA && process.env.PM_TRACKER_TEST_HIDE_WINDOW ? { backgroundThrottling: false } : {}) },
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
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.alt || !(process.platform === "darwin" ? input.meta : input.control)) return;
    const key = input.key.toLowerCase();
    if (key === "z" || process.platform !== "darwin" && key === "y") {
      event.preventDefault();
      if (input.shift || key === "y") mainWindow?.webContents.redo();
      else mainWindow?.webContents.undo();
    }
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) =>
    logDiagnostic("Renderer process stopped", `${details.reason}, exit code ${details.exitCode}`));
  void mainWindow.loadURL("tracker://app/");
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("focus", () => { void updates.check(); });
}

if (process.env.PM_TRACKER_TEST_USER_DATA) app.setPath("userData", path.resolve(process.env.PM_TRACKER_TEST_USER_DATA));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let profile: ReturnType<typeof configureApplicationProfile> | undefined;
  let profileError: unknown;
  try { profile = configureApplicationProfile(app, process.env.PM_TRACKER_TEST_USER_DATA); }
  catch (error) { profileError = error; }
  app.on("second-instance", () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    if (!profile) throw profileError || new Error("The Zebby data folder could not be created.");
    await migrateApplicationProfile(profile);
    store = new DesktopStore(app.getPath("userData"));
    await loadSettings();
    nativeTheme.themeSource = settings.appearance === "auto" || !settings.appearance ? "system" : settings.appearance;
    nativeTheme.on("updated", updateWindowAppearance);
    const downloadErrors = new Map<string, string>();
    const modelsChanged = () => {
      for (const model of modelDownloads?.list() || []) {
        if (model.status === "error" && model.error) {
          if (downloadErrors.get(model.id) !== model.error) logDiagnostic(`Model download failed (${model.id})`, model.error);
          downloadErrors.set(model.id, model.error);
        } else downloadErrors.delete(model.id);
      }
      mainWindow?.webContents.send("desktop:local-models-changed", state());
    };
    const platformFolder = `${process.platform === "darwin" ? "mac" : "win"}-${process.arch}`;
    const runtimeFolder = app.isPackaged ? path.join(process.resourcesPath, "local-runtime")
      : path.resolve(appRoot, "../build/llama", platformFolder);
    const localAppData = process.env.PM_TRACKER_TEST_USER_DATA ? undefined : process.env.LOCALAPPDATA;
    const modelsFolder = localModelFolder(app.getPath("userData"), process.platform, localAppData);
    await migrateModelFolder(path.join(profile.folder, "Models"), modelsFolder);
    if (process.platform === "win32" && localAppData && path.win32.isAbsolute(localAppData)) {
      for (const name of ["PM Application Tracker", "pm-application-tracker"]) {
        await migrateModelFolder(path.join(localAppData, name, "Models"), modelsFolder);
      }
    }
    modelDownloads = new LocalModelDownloads(modelsFolder, { onChange: modelsChanged, licensesFolder: path.join(runtimeFolder, "model-licenses") });
    await modelDownloads.initialize();
    modelEngine = new LocalModelEngine({ downloads: modelDownloads, onChange: modelsChanged,
      runtimeFolder,
      workerPath: path.join(appRoot, "local-runtime-worker.cjs") });
    selfUpdater = new SelfUpdater({ folder: path.join(path.dirname(modelsFolder), "Updates"), platform: process.platform,
      executable: app.getPath("exe"), onChange: (download) => updates.setDownload(download) });
    registerProtocol();
    registerIpc();
    createMenu();
    createWindow();
    void updates.check();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch((error) => { console.error("Could not start Zebby", error);
    logDiagnostic("Could not start the app", error);
    dialog.showErrorBox("Could not start Zebby", String(error)); app.quit(); });
  app.on("before-quit", (event) => {
    if (store?.status.dirty) {
      event.preventDefault();
      dialog.showMessageBoxSync({ type: "warning", title: "Changes have not synced",
        message: "The latest changes are still on this computer.",
        detail: "Open Settings and use Retry save before closing the app.", buttons: ["Keep app open"] });
    } else if (!shuttingDown) {
      event.preventDefault(); shuttingDown = true;
      analysisRequests.cancelAll();
      void Promise.all([modelDownloads?.pause(), modelEngine?.shutdown(), selfUpdater?.cancel()])
        .catch((error) => logDiagnostic("Could not stop the local model", error))
        .then(() => diagnosticLog.flush())
        .finally(() => { store?.close(); app.quit(); });
    } else store?.close();
  });
}

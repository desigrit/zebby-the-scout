import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ChatGPTAuth } from "./chatgpt-auth.ts";
import { AnalysisJobs, type JobExecution, type JobRequest } from "./analysis-jobs.ts";
import { chatGPTError, chatGPTRequest, parseModels, readChatGPTStream } from "./chatgpt-response.ts";
import { ChatGPTPlanError, type ChatGPTModel, type ChatGPTState } from "../../shared/chatgpt-plan.ts";
import { writeProfileSettings } from "../settings-persistence.ts";
import { validatedBoardExtraction, type BoardExtractionInput } from "../../shared/boards.ts";
import { applyResumeEdits, type ResumeBlock } from "../../shared/tailored-resume.ts";
import { boardVisualParts } from "../../shared/analysis-images.ts";
import { parsePlanRecommendations } from "../plan-importance.ts";

type Preferences = { model: string; thinking: string; tested: string; visionTested: string };
type Dependencies = ConstructorParameters<typeof ChatGPTAuth>[0];
const ENDPOINT = "https://api.openai.com/v1";
const probeSchema = { type: "object", additionalProperties: false, properties: { ready: { type: "boolean" } }, required: ["ready"] };
export class ChatGPTService {
  readonly auth: ChatGPTAuth;
  readonly jobs: AnalysisJobs;
  private preferences: Preferences = { model: "", thinking: "", tested: "", visionTested: "" };
  private models: ChatGPTModel[] = [];
  private queue: { run: () => Promise<void>; priority: number }[] = [];
  private running = false;
  private controllers = new Set<AbortController>();
  private paused = false;
  private notice = "";
  private error = "";
  private initialized = false;
  private deps: Dependencies;
  constructor(deps: Dependencies) {
    this.deps = deps;
    this.auth = new ChatGPTAuth(deps);
    this.jobs = new AnalysisJobs(path.join(deps.folder, "analysis-jobs"), deps.changed);
  }
  private get config() { return path.join(this.deps.folder, "chatgpt-settings.json"); }
  private get testKey() { return `${this.auth.active}:${this.preferences.model}:${this.preferences.thinking}`; }
  get state(): ChatGPTState {
    return { available: true, connected: this.auth.connected, connecting: this.auth.connecting, account: this.auth.current?.label || "",
      activeAccount: this.auth.active, accounts: this.auth.accounts, models: this.models, ...this.preferences,
      tested: this.preferences.tested === this.testKey, visionTested: this.preferences.visionTested === this.testKey,
      notice: this.notice, error: this.error, paused: this.paused, welcome: this.auth.welcome, jobs: this.jobs.summaries };
  }
  get selection() { return { account: this.auth.active, model: this.preferences.model, thinking: this.preferences.thinking }; }
  get busy() { return this.controllers.size > 0; }
  async initialize() {
    try {
      await this.auth.initialize();
      try {
        const p = JSON.parse(await readFile(this.config, "utf8"));
        if (["model", "thinking", "tested", "visionTested"].every(k => typeof p[k] === "string" && p[k].length <= 500)) this.preferences = p;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.notice = "Choose your ChatGPT model again in Settings."; }
      await this.jobs.initialize(); this.initialized = true;
      if (this.auth.connected) await this.refreshModels();
    } catch (error) { this.error = this.message(error); }
    this.deps.changed();
  }
  private message(error: unknown) { return error instanceof ChatGPTPlanError ? error.message : "Could not complete the ChatGPT request. Try again."; }
  private assertIdle() { if (this.busy) throw new Error("Finish or cancel ChatGPT analysis before changing the connection."); }
  async connect(accountId?: string) {
    this.assertIdle(); this.error = ""; this.notice = "";
    try {
      // Never replace an unreadable saved credential file with a new registration.
      if (!this.initialized) { await this.auth.initialize(); await this.jobs.initialize(); this.initialized = true; }
      await this.auth.signIn(accountId); this.models = []; this.paused = false;
      await this.refreshModels();
    } catch (error) { this.error = this.message(error); throw new ChatGPTPlanError(this.error); }
    finally { this.deps.changed(); }
  }
  async disconnect() {
    this.stop();
    this.notice = await this.auth.disconnect() ? "Disconnected from ChatGPT." : "Disconnected on this computer. Open ChatGPT settings to confirm remote access is removed.";
    this.models = []; this.paused = false; this.error = ""; this.deps.changed();
  }
  stop() { for (const controller of this.controllers) controller.abort(new DOMException("Analysis cancelled.", "AbortError")); this.auth.cancelSignIn(); }
  resume() { this.paused = false; this.error = ""; this.deps.changed(); }
  async refreshModels() {
    const account = this.auth.active, token = await this.auth.access(account);
    const response = await this.auth.fetcher(`${ENDPOINT}/models`, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw chatGPTError(await response.json().catch(() => null), response.status);
    const models = parseModels(await response.json());
    if (account !== this.auth.active) throw new ChatGPTPlanError("The ChatGPT account changed. Refresh models again.");
    if (!models.length) throw new ChatGPTPlanError("No compatible models are available for this ChatGPT account.", "settings");
    this.models = models; this.error = ""; this.deps.changed();
  }
  async configure(model: string, thinking: string) {
    this.assertIdle();
    const chosen = this.models.find(item => item.id === model);
    if (!chosen || thinking && !chosen.thinking.includes(thinking)) throw new Error("Choose an available ChatGPT model and thinking level.");
    const next = { ...this.preferences, model, thinking };
    await writeProfileSettings(this.config, JSON.stringify(next, null, 2)); this.preferences = next; this.error = ""; this.notice = ""; this.deps.changed();
  }
  private schedule<T>(priority: number, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      const entry = { priority, run: async () => {
        signal.removeEventListener("abort", cancel);
        try { signal.throwIfAborted(); resolve(await operation()); } catch (error) { reject(error); }
      } };
      const cancel = () => { this.queue = this.queue.filter(item => item !== entry); reject(signal.reason); };
      signal.addEventListener("abort", cancel, { once: true });
      this.queue.push(entry);
      this.queue.sort((a, b) => b.priority - a.priority); void this.drain();
    });
  }
  private async drain() {
    if (this.running) return; this.running = true;
    try { while (this.queue.length) await this.queue.shift()!.run(); }
    finally { this.running = false; }
  }
  private async generate(request: JobRequest, signal: AbortSignal, execution: JobExecution) {
    if (this.paused) throw new ChatGPTPlanError("ChatGPT usage is paused. Manage usage in Settings, then retry.", "usage");
    if (!this.models.some(model => model.id === request.model)) throw new ChatGPTPlanError("Choose an available ChatGPT model in Settings.", "settings");
    const token = await this.auth.access(request.account);
    signal.throwIfAborted();
    const timeout = AbortSignal.timeout(8 * 60_000), combined = AbortSignal.any([signal, timeout]);
    try {
      await execution.started(); combined.throwIfAborted();
      const response = await this.auth.fetcher(`${ENDPOINT}/responses`, { method: "POST", redirect: "error", signal: combined,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(chatGPTRequest(request)) });
      return await readChatGPTStream(response, request.schema, combined, execution.usage);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ChatGPTPlanError && error.recovery === "usage") { this.paused = true; this.error = error.message; this.deps.changed(); }
      if (error instanceof ChatGPTPlanError) throw error;
      if (timeout.aborted) throw new ChatGPTPlanError("ChatGPT timed out before finishing. Try again or choose a lower thinking level.");
      throw new ChatGPTPlanError("The ChatGPT connection was interrupted. Retry to run the unfinished analysis.");
    }
  }
  async analyze(request: JobRequest, signal: AbortSignal, batchId?: string) {
    if (!this.initialized) throw new ChatGPTPlanError("Connect ChatGPT in Settings first.", "signin");
    if (request.account !== this.auth.active) throw new ChatGPTPlanError("The ChatGPT account changed. Retry the analysis.", "signin");
    const controller = new AbortController(); this.controllers.add(controller);
    const combined = AbortSignal.any([signal, controller.signal]);
    try {
      return await this.jobs.run(request, combined, execution => this.schedule(request.name.startsWith("board_") ? 0 : 1, combined,
        () => this.generate(request, combined, execution)), value => {
        const result = value as Record<string, unknown>;
        if (["resume_plan", "application_match"].includes(request.name) &&
          (typeof result.explanation !== "string" || !result.explanation.trim() || !Number.isInteger(result.score) || Number(result.score) < 0 || Number(result.score) > 100)) {
          throw new ChatGPTPlanError("ChatGPT returned an incomplete analysis. No result was saved. Try again.", "invalid");
        }
        if (request.name === "resume_plan") {
          parsePlanRecommendations(result.keywords, 6, 20, 200);
          parsePlanRecommendations(result.themes, 5, 6, 1000);
          if (typeof result.overview !== "string" || !result.overview.trim() || typeof result.overviewRationale !== "string" || !result.overviewRationale.trim()) {
            throw new ChatGPTPlanError("ChatGPT returned an incomplete Plan analysis. No result was saved. Try again.", "invalid");
          }
        }
        if (request.name.startsWith("board_")) validatedBoardExtraction(value, request.input as BoardExtractionInput);
        if (request.name === "tailored_resume") applyResumeEdits((request.input as { resumeBlocks: ResumeBlock[] }).resumeBlocks, value);
      }, batchId);
    } finally { this.controllers.delete(controller); this.deps.changed(); }
  }
  async testConnection() {
    this.assertIdle(); this.notice = ""; this.resume();
    await this.refreshModels();
    const selection = this.selection;
    if (!selection.model) throw new Error("Choose a ChatGPT model before testing the connection.");
    const controller = new AbortController(); this.controllers.add(controller);
    const request: JobRequest = { version: 1, workspace: "connection-test", target: "connection-test", revision: randomUUID(), ...selection,
      name: "connection_test", instructions: "Return the required JSON with ready set to true.", input: { test: "connection" }, schema: probeSchema };
    try {
      const validateProbe = (value: unknown) => {
        if ((value as { ready?: boolean }).ready !== true) throw new ChatGPTPlanError("ChatGPT did not return the required test result.", "invalid");
      };
      const result = await this.jobs.run(request, controller.signal, execution => this.schedule(2, controller.signal,
        () => this.generate(request, controller.signal, execution)), validateProbe);
      await this.jobs.applied(result);
      const next = { ...this.preferences, tested: this.testKey, visionTested: "" };
      // A real image input tests the selected route. Metadata alone is not proof.
      const png = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJklEQVR4nO3NMQ0AAAwDoPo33arYsQQMkB6LQCAQCAQCgUAg+BIMi1X0pjxKe0gAAAAASUVORK5CYII=";
      const token = await this.auth.access(selection.account);
      const body = chatGPTRequest(request);
      body.input = [{ role: "user", content: [{ type: "input_text", text: "An image is attached. Return the required JSON with ready set to true." },
        { type: "input_image", image_url: `data:image/png;base64,${png}`, detail: "low" }] }] as typeof body.input;
      try {
        const imageRequest = { ...request, name: "connection_image_test", input: { test: "image connection", image: { mediaType: "image/png", data: png } } };
        const imageResult = await this.jobs.run(imageRequest, controller.signal, execution => this.schedule(2, controller.signal, async () => {
          const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]);
          await execution.started(); combined.throwIfAborted();
          const response = await this.auth.fetcher(`${ENDPOINT}/responses`, { method: "POST", redirect: "error", signal: combined,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body) });
          return readChatGPTStream(response, probeSchema, combined, execution.usage);
        }), validateProbe);
        await this.jobs.applied(imageResult);
        if (imageResult.ready === true) next.visionTested = this.testKey;
      } catch (error) {
        controller.signal.throwIfAborted();
        if (error instanceof ChatGPTPlanError && error.recovery === "usage") { this.paused = true; this.error = error.message; }
      }
      await writeProfileSettings(this.config, JSON.stringify(next, null, 2)); this.preferences = next;
      this.notice = next.visionTested ? "Connected. Structured analysis and image inputs verified." : "Connected. Text analysis verified. Image analysis needs another test or model.";
    } finally { this.controllers.delete(controller); this.deps.changed(); }
  }
  supportsVision() { return this.preferences.visionTested === this.testKey || this.models.find(m => m.id === this.preferences.model)?.vision === true; }
  validateVisionInput(input: unknown) {
    if (boardVisualParts(input) && !this.supportsVision()) throw new ChatGPTPlanError("This board needs image analysis. Test image support for your ChatGPT model in Settings, then retry.", "settings");
  }
}

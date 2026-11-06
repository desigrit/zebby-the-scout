import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getLocalModel } from "./local-model-catalog.ts";
import type { LocalModelDownloads } from "./local-model-downloads.ts";
import { localMemoryState, type LocalMemoryState } from "./local-model-memory.ts";
import { contextForTokens, initialLocalContext, localThreadCounts, localWorkingMemory, systemMemoryReserve,
  LOCAL_IDLE_MS, LOCAL_MEMORY_POLL_MS } from "./local-inference-policy.ts";
import { LocalResponseWatchdog, readLocalCompletion } from "./local-model-response.ts";
import type { ComputeBackend, LocalCompute } from "./local-compute.ts";
import { detectLocalCompute, localComputeArguments, localRuntimeEnvironment, readLocalRuntime, type LocalRuntime } from "./local-compute-detection.ts";

export function localModelMessages(id: string, instructions: string, content: string) {
  // Gemma's chat template accepts user/model turns, not a system turn.
  // Keep all instructions and input in the user turn for that model.
  return getLocalModel(id).supportsSystemRole === false
    ? [{ role: "user", content: `${instructions}\n\n${content}` }]
    : [{ role: "system", content: instructions }, { role: "user", content }];
}

export function localModelResponseSchema(id: string, schema: Record<string, unknown>, input: unknown) {
  if (id !== "gemma3-270m") return schema;
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const overviewLength = typeof source.currentCvOverview === "string" ? source.currentCvOverview.length : 0;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  // Bound the requested short output fields in the grammar, so a repetitive
  // string cannot use the entire response budget. Source text is never shortened.
  const limits: Record<string, number> = { overview: Math.max(800, overviewLength * 2), overviewRationale: 600, explanation: 800 };
  return { ...schema, properties: Object.fromEntries(Object.entries(properties).map(([key, field]) => {
    if (field.type === "string" && limits[key]) return [key, { ...field, minLength: 1, maxLength: limits[key] }];
    if (["keywords", "themes"].includes(key) && field.type === "array") {
      const item = field.items as Record<string, unknown>;
      const maxLength = key === "keywords" ? 80 : 180;
      if (item.type === "object") {
        const properties = item.properties as Record<string, Record<string, unknown>>;
        return [key, { ...field, items: { ...item, properties: { ...properties,
          text: { ...properties.text, minLength: 1, maxLength } } } }];
      }
      return [key, { ...field, items: { ...item, minLength: 1, maxLength } }];
    }
    return [key, field];
  })) };
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start local analysis.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

type EngineOptions = {
  runtimeFolder: string;
  workerPath: string;
  downloads: LocalModelDownloads;
  onChange?: () => void;
  onDiagnostic?: (message: string, error?: unknown) => void;
  fetcher?: typeof fetch;
  detectCompute?: typeof detectLocalCompute;
  memory?: () => Promise<LocalMemoryState>;
  timeouts?: { loadMs?: number; tokenizeMs?: number; firstTokenMs?: number; stallMs?: number; totalMs?: number; idleMs?: number; memoryPollMs?: number };
};

export class LocalModelEngine {
  private options: EngineOptions;
  private child: ChildProcess | null = null;
  private loadedId = "";
  private baseUrl = "";
  private secret = "";
  private idleTimer?: NodeJS.Timeout;
  private memoryTimer?: NodeJS.Timeout;
  private checkingMemory = false;
  private stopping?: Promise<void>;
  private allocatedContext = 0;
  private requests = Promise.resolve();
  private pending = 0;
  private shuttingDown = false;
  private controller = new AbortController();
  private detection?: Promise<LocalCompute>;
  compute: LocalCompute = { status: "checking", backend: "cpu", devices: [], availableMemory: 0, recommendedModelIds: [] };
  backend: ComputeBackend = "cpu";
  cpuFallback = false;
  offloadedLayers: number | null = null;
  status: "idle" | "loading" | "analyzing" = "idle";

  constructor(options: EngineOptions) { this.options = options; }
  get busy() { return this.pending > 0; }
  get modelId() { return this.loadedId; }
  get contextTokens() { return this.allocatedContext; }
  private memory() { return (this.options.memory || localMemoryState)(); }

  private watchMemory() {
    clearInterval(this.memoryTimer);
    this.memoryTimer = setInterval(() => { void this.checkMemoryPressure(); }, this.options.timeouts?.memoryPollMs ?? LOCAL_MEMORY_POLL_MS);
    this.memoryTimer.unref();
  }

  async checkMemoryPressure() {
    if (this.checkingMemory || !this.child) return;
    this.checkingMemory = true;
    const child = this.child;
    try {
      const memory = await this.memory();
      if (this.child !== child) return;
      const critical = memory.pressure === "critical" || memory.available < 512 * 1024 ** 2;
      const idlePressure = !this.busy && (memory.pressure !== "normal" || memory.available < systemMemoryReserve(memory.total));
      if (critical || idlePressure) {
        this.diagnostic("Local model releasing memory (pressure " + memory.pressure + ", available " + memory.available + ", busy " + this.busy + ")");
        this.controller.abort(new Error("Local analysis stopped because this computer is low on memory. Close other apps and try again."));
        await this.stop(true);
      }
    } catch (error) { this.diagnostic("Local memory check unavailable", error); }
    finally { this.checkingMemory = false; }
  }
  private changed() { this.options.onChange?.(); }
  private diagnostic(message: string, error?: unknown) { this.options.onDiagnostic?.(message, error); }

  async detectHardware(runtime?: LocalRuntime, signal?: AbortSignal) {
    if (this.detection) return this.detection;
    this.detection = (async () => {
      try {
        const engine = runtime || await readLocalRuntime(this.options.runtimeFolder);
        this.compute = await (this.options.detectCompute || detectLocalCompute)(engine, {
          signal, diagnostic: (message, error) => this.diagnostic(message, error),
        });
      } catch (error) {
        signal?.throwIfAborted();
        this.compute = { status: "unavailable", backend: "cpu", devices: [], availableMemory: (await this.memory()).available, recommendedModelIds: [] };
        this.diagnostic("Local hardware check unavailable", error);
      }
      this.changed(); return this.compute;
    })();
    try { return await this.detection; } finally { this.detection = undefined; }
  }

  async stop(force = false) {
    if (this.busy && !force) throw new Error("Wait for the current local analysis to finish, then try again.");
    if (this.stopping) return this.stopping;
    this.stopping = this.stopWorker();
    try { await this.stopping; } finally { this.stopping = undefined; }
  }

  private async stopWorker() {
    clearTimeout(this.idleTimer); clearInterval(this.memoryTimer);
    this.controller.abort(); this.controller = new AbortController();
    const child = this.child;
    if (child) this.diagnostic("Local model releasing memory (" + this.loadedId + ")");
    this.child = null; this.loadedId = ""; this.baseUrl = ""; this.secret = ""; this.allocatedContext = 0;
    this.status = "idle"; this.changed();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.stdin?.end("stop\n");
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await Promise.race([exited, delay(1000)]);
      }
      this.diagnostic("Local model process stopped; memory released");
    }
  }

  async shutdown() { this.shuttingDown = true; await this.stop(true); }

  private async start(id: string, context: number, requestSignal?: AbortSignal, probe = false) {
    requestSignal?.throwIfAborted();
    if (this.shuttingDown) throw new Error("The app is closing.");
    const modelFile = await this.options.downloads.readyPath(id);
    if (this.loadedId === id && this.allocatedContext === context && this.child?.exitCode === null && this.child.signalCode === null) return;
    await this.stop(true);
    requestSignal?.throwIfAborted();
    const model = getLocalModel(id);
    const runtime = await readLocalRuntime(this.options.runtimeFolder);
    const compute = await this.detectHardware(runtime, requestSignal);
    requestSignal?.throwIfAborted();
    const memory = await this.memory();
    const gpu = compute.backend !== "cpu" && Boolean(runtime.accelerator);
    const reserve = systemMemoryReserve(memory.total);
    const requiredMemory = (tokens: number) => (gpu && compute.backend !== "metal"
      ? Math.min(localWorkingMemory(model, tokens), model.bytes + 512 * 1024 ** 2)
      : localWorkingMemory(model, tokens)) + reserve;
    // A small context lets us tokenize first when the estimate would not fit.
    if (probe && requiredMemory(context) > memory.available) context = Math.min(4096, model.context);
    const required = requiredMemory(context);
    this.diagnostic("Local model memory check (" + id + ", available " + memory.available + ", required " + required + ", context " + context + ", reserve " + reserve + ")");
    if (memory.pressure === "critical" || memory.available < required) {
      throw new Error("Not enough memory to run " + model.name + " with this job and resume. Close other apps or choose a smaller model.");
    }
    this.cpuFallback = false;
    try {
      await this.launch(id, modelFile, gpu ? runtime.accelerator!.executable : runtime.executable, compute, !gpu, context, requestSignal);
    } catch (error) {
      if (!gpu || requestSignal?.aborted || this.shuttingDown || error instanceof Error && error.name === "AbortError") throw error;
      this.diagnostic(`Local GPU startup failed (${id}); retrying the same model on CPU`, error);
      await this.stop(true);
      requestSignal?.throwIfAborted();
      const fallbackMemory = await this.memory();
      if (fallbackMemory.pressure === "critical" || fallbackMemory.available < localWorkingMemory(model, context) + reserve) {
        throw new Error(`GPU analysis could not start and there is not enough free memory for ${model.name} on CPU. Close other apps and try again.`, { cause: error });
      }
      this.cpuFallback = true;
      await this.launch(id, modelFile, runtime.executable, compute, true, context, requestSignal);
    }
  }

  private async launch(id: string, modelFile: string, executable: string, compute: LocalCompute, cpu: boolean, context: number, requestSignal?: AbortSignal) {
    const port = await availablePort();
    requestSignal?.throwIfAborted();
    if (this.shuttingDown) throw new Error("The app is closing.");
    this.secret = randomBytes(32).toString("hex");
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.loadedId = id; this.status = "loading"; this.backend = cpu ? "cpu" : compute.backend;
    this.offloadedLayers = null; this.allocatedContext = context; this.changed();
    this.diagnostic(`Local model loading (${id}, ${process.platform}/${process.arch})`);
    const { threads, batch } = localThreadCounts(availableParallelism(), compute.performanceCores, !cpu);
    this.diagnostic(`Local model worker starting (${id}, ${this.backend}, ${threads}/${batch} threads, context ${context}, device ${cpu ? "CPU" : compute.devices[0]?.id})`);
    const child = spawn(process.execPath, [this.options.workerPath, String(process.pid), executable,
      "--model", modelFile, "--host", "127.0.0.1", "--port", String(port),
      "--ctx-size", String(context), "--parallel", "1", "--threads", String(threads),
      "--threads-batch", String(batch), "--flash-attn", "auto", "--cache-ram", "0", "--ctx-checkpoints", "0", ...localComputeArguments(compute, cpu), "--prio", "-1",
      "--no-webui", "--no-agent", "--no-context-shift", "--jinja", "--reasoning", "auto", "--log-verbosity", "4"], {
      cwd: path.dirname(executable), windowsHide: true, stdio: ["pipe", "ignore", "pipe"],
      env: { ...localRuntimeEnvironment(), ELECTRON_RUN_AS_NODE: "1", LLAMA_API_KEY: this.secret },
    });
    this.child = child; this.watchMemory();
    let diagnostics = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const lines = (diagnostics + chunk.toString("utf8")).split(/\r?\n/);
      diagnostics = (lines.pop() || "").slice(-128);
      for (const line of lines) {
        const layers = line.match(/^ZEBBY_GPU_LAYERS=(\d+)\/(\d+)$/);
        if (layers && this.child === child) {
          this.offloadedLayers = Number(layers[1]);
          this.diagnostic(`Local model GPU offload (${id}, ${layers[1]}/${layers[2]} layers)`);
          if (!this.offloadedLayers && !cpu) { this.backend = "cpu"; this.cpuFallback = true; }
          this.changed();
        }
      }
    });
    child.stdin?.on("error", () => {});
    const runtimeController = this.controller;
    let failed = false;
    child.once("error", (error) => {
      failed = true;
      runtimeController.abort(new Error("The local analysis engine could not start. Reinstall the latest app.", { cause: error }));
    });
    child.once("exit", (code, signal) => { failed = true; if (this.child === child) {
      this.diagnostic(`Local model engine exited (${id}, code ${code}, signal ${signal})`);
      runtimeController.abort(new Error("The local analysis engine stopped. Close other apps or try another model."));
      clearInterval(this.memoryTimer);
      this.child = null; this.loadedId = ""; this.allocatedContext = 0; this.status = "idle"; this.changed();
    } });
    const deadline = Date.now() + (this.options.timeouts?.loadMs ?? 300_000);
    const loadingSignal = requestSignal ? AbortSignal.any([this.controller.signal, requestSignal]) : this.controller.signal;
    while (Date.now() < deadline) {
      if (failed || this.child !== child) throw new Error("The local analysis engine stopped. Close other apps or reinstall the app.");
      loadingSignal.throwIfAborted();
      const health = await (this.options.fetcher || fetch)(`${this.baseUrl}/health`,
        { signal: AbortSignal.any([loadingSignal, AbortSignal.timeout(1500)]) }).catch(() => null);
      if (health?.ok) { this.diagnostic(`Local model ready (${id})`); return; }
      try { await delay(250, undefined, { signal: loadingSignal }); }
      catch (error) { loadingSignal.throwIfAborted(); throw error; }
    }
    await this.stop(true);
    throw new Error("The local model took too long to load. Close other apps or choose a smaller model.");
  }

  analyze(id: string, instructions: string, input: unknown, schema: Record<string, unknown>, maxTokens = 1800, requestSignal?: AbortSignal,
    thinkingLevel = "off", onProgress?: (stage: "thinking" | "generating") => void): Promise<Record<string, unknown>> {
    if (!["off", "on"].includes(thinkingLevel) || thinkingLevel === "on" && !getLocalModel(id).supportsThinking) {
      return Promise.reject(new Error("This downloaded model does not support that thinking level."));
    }
    const thinking = thinkingLevel === "on";
    if (thinking) maxTokens += 4096;
    if (this.shuttingDown) return Promise.reject(new Error("The app is closing."));
    this.pending++; clearTimeout(this.idleTimer);
    const result = this.requests.then(async () => {
      requestSignal?.throwIfAborted();
      const content = typeof input === "string" ? input : JSON.stringify(input);
      const model = getLocalModel(id);
      const messages = localModelMessages(id, instructions, content);
      const fetcher = this.options.fetcher || fetch;
      const deadline = AbortSignal.timeout(this.options.timeouts?.totalMs ?? 1_800_000);
      const requestDeadline = requestSignal ? AbortSignal.any([deadline, requestSignal]) : deadline;
      const initial = this.loadedId === id && this.child ? this.allocatedContext
        : initialLocalContext(instructions + content, maxTokens, model.context);
      await this.start(id, initial, requestDeadline, true);
      requestDeadline.throwIfAborted();
      const preflightSignal = AbortSignal.any([this.controller.signal, requestDeadline]);
      const preflightHeaders = { Authorization: "Bearer " + this.secret, "Content-Type": "application/json" };
      this.diagnostic("Local model reading input (" + id + ")");
      const templateResponse = await fetcher(this.baseUrl + "/apply-template", { method: "POST", headers: preflightHeaders,
        body: JSON.stringify({ messages, add_generation_prompt: true, chat_template_kwargs: { enable_thinking: thinking } }),
        signal: AbortSignal.any([preflightSignal, AbortSignal.timeout(this.options.timeouts?.tokenizeMs ?? 30_000)]) });
      const template = await templateResponse.json() as { prompt?: string };
      if (!templateResponse.ok || typeof template.prompt !== "string") throw new Error("The local model could not prepare this request. Try again.");
      const tokenResponse = await fetcher(this.baseUrl + "/tokenize", { method: "POST", headers: preflightHeaders,
        body: JSON.stringify({ content: template.prompt, add_special: false, parse_special: true }),
        signal: AbortSignal.any([preflightSignal, AbortSignal.timeout(this.options.timeouts?.tokenizeMs ?? 30_000)]) });
      const tokenData = await tokenResponse.json() as { tokens?: number[] };
      if (!tokenResponse.ok || !Array.isArray(tokenData.tokens)) throw new Error("The local model could not read this request. Try again.");
      const context = contextForTokens(tokenData.tokens.length, maxTokens, model.context);
      if (this.allocatedContext !== context) {
        this.diagnostic("Local model resizing context (" + id + ", " + this.allocatedContext + " to " + context + ", input " + tokenData.tokens.length + ", output " + maxTokens + ")");
        await this.start(id, context, requestDeadline);
      }
      requestDeadline.throwIfAborted();
      this.status = "analyzing"; this.changed();
      const headers = { Authorization: "Bearer " + this.secret, "Content-Type": "application/json" };
      const signal = AbortSignal.any([this.controller.signal, requestDeadline]);
      const watchdog = new LocalResponseWatchdog(this.options.timeouts?.firstTokenMs ?? 600_000,
        this.options.timeouts?.stallMs ?? 120_000);
      const generationSignal = AbortSignal.any([signal, watchdog.controller.signal]);
      const started = Date.now();
      let responded = false;
      this.diagnostic(`Local model generating (${id}, ${tokenData.tokens.length} input tokens)`);
      try {
        const response = await fetcher(`${this.baseUrl}/v1/chat/completions`, { method: "POST", headers, signal: generationSignal,
          body: JSON.stringify({ messages,
            stream: true, temperature: 0, ...getLocalModel(id).sampling,
            ...(thinking ? { temperature: 0.6, top_k: 20, top_p: 0.95, min_p: 0 } : {}), seed: 0, max_tokens: maxTokens,
            response_format: { type: "json_object", schema: localModelResponseSchema(id, schema, input) },
            chat_template_kwargs: { enable_thinking: thinking } }) });
        const payload = await readLocalCompletion(response, generationSignal, (stage) => {
          watchdog.progress();
          onProgress?.(stage);
          if (!responded) { responded = true; this.diagnostic(`Local model first token (${id}, ${Date.now() - started} ms)`); }
        });
        if (!response.ok) throw new Error(payload.error?.message || "Local analysis failed. Try again.");
        const choice = payload.choices?.[0];
        if (choice?.finish_reason !== "stop" || !choice.message?.content) {
          this.diagnostic(`Local model response incomplete (${id}, finish ${choice?.finish_reason || "missing"})`);
          throw new Error("The model did not finish its answer. Try less thinking or another model. No new result was saved.");
        }
        let analysis: unknown;
        try { analysis = JSON.parse(choice.message.content); }
        catch { throw new Error("The local model returned an unreadable analysis. Try again."); }
        if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error("The local analysis was incomplete. Try again.");
        generationSignal.throwIfAborted();
        this.diagnostic(`Local model completed (${id}, ${Date.now() - started} ms)`);
        return analysis as Record<string, unknown>;
      } finally { watchdog.dispose(); }
    }).catch(async (error) => {
      if (requestSignal?.aborted) this.diagnostic(`Local model request cancelled (${id})`);
      else this.diagnostic(`Local model request failed (${id})`, error);
      // Also stop failed and timed-out workers, so the next request starts with
      // a healthy process rather than queueing behind an abandoned generation.
      await this.stop(true);
      if (requestSignal?.aborted) {
        // Terminate the CPU worker too, including model loading or a server
        // that keeps generating after its HTTP connection closes.
        requestSignal.throwIfAborted();
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(error.message === "The operation was aborted due to timeout"
          ? "The local model took too long to respond. Try again or choose a smaller model." : error.message, { cause: error });
      }
      if (error instanceof TypeError && error.message === "fetch failed") {
        throw new Error("Connection to the local model was lost. Try again.", { cause: error });
      }
      throw error;
    });
    this.requests = result.then(() => {}, () => {});
    return result.finally(() => {
      this.pending--; if (!this.pending) {
        this.status = "idle"; this.changed();
        this.idleTimer = setTimeout(() => { void this.stop().catch(() => undefined); }, this.options.timeouts?.idleMs ?? LOCAL_IDLE_MS);
        this.idleTimer.unref();
      }
    });
  }
}

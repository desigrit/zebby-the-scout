import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisProvider } from "../shared/online-models";
import { BOARD_CREDIT_MESSAGE, boardCreditError, boardModelContract, validatedBoardExtraction, type BoardExtractionInput, type BoardProgress, type BoardsState } from "../shared/boards";
import { BoardsStore } from "./boards-store";
import { scanBoard } from "./boards-scan";
import type { BoardReader } from "./board-browser";
import { writeProfileSettings } from "./settings-persistence";
import { BoardRuns } from "./board-runs";
import { newBoardCheckpoint, thoroughlyScanBoard, BoardReadLimit, type BoardCheckpoint } from "./board-thorough";
import type { BoardCheckOptions } from "../shared/board-exploration";

export type BoardSelection = { provider: AnalysisProvider; model: string; thinkingLevel: string; ollamaUrl?: string };
type Dependencies<Selection extends BoardSelection> = { profile: string; selection(): Selection;
  reader(signal: AbortSignal): BoardReader;
  canUseVision?(selection: Selection, signal: AbortSignal): Promise<boolean>;
  extract(selection: Selection, input: BoardExtractionInput, signal: AbortSignal, sourceId: string): Promise<{ value: unknown; acknowledge?: () => Promise<void> }>;
  acknowledgeCached?(selection: Selection, input: BoardExtractionInput, sourceId: string): Promise<void>;
  changed(): void;
};

export class BoardsService<Selection extends BoardSelection> {
  private pending = new Map<string, { progress: BoardProgress; abort: AbortController }>();
  private queue: Promise<unknown> = Promise.resolve();
  private runs: BoardRuns;
  error = "";
  constructor(readonly store: BoardsStore, private dependencies: Dependencies<Selection>) { this.runs = new BoardRuns(dependencies.profile); }
  get busy() { return this.pending.size > 0; }
  get state(): BoardsState { return { ...this.store.status, error: this.error, boards: this.store.list(),
    readerSettings: this.runs.settings, runs: this.store.list().flatMap(board => {
      const summary = this.runs.summary(this.store.status.filePath, board); return summary ? [summary] : [];
    }), progress: [...this.pending.values()].map(entry => ({ ...entry.progress })) }; }
  async configure(value: unknown) { this.assertIdle(); await this.runs.configure(value); this.changed(); return this.state; }
  preview(id: string) { return this.runs.preview(this.store.status.filePath, this.store.get(id)); }
  changed() { this.dependencies.changed(); }
  assertIdle(id?: string) { if (id ? this.pending.has(id) : this.busy) throw new Error("Finish or cancel the board check before changing this selection."); }
  check(ids?: string[], options: BoardCheckOptions = {}) {
    if (!options || typeof options !== "object" || Object.keys(options).some(key => !["thorough", "resume"].includes(key)) ||
        [options.thorough, options.resume].some(value => value !== undefined && typeof value !== "boolean")) throw new Error("Choose a supported check mode.");
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== "string"))) throw new Error("Choose up to 100 saved boards.");
    if (this.store.status.dirty) throw new Error("Use Retry save for Boards before checking again.");
    const boards = ids ? ids.map(id => this.store.get(id)) : this.store.list();
    const selected = this.dependencies.selection(), generation = this.store.generation, settings = { ...this.runs.settings }, workspace = this.store.status.filePath;
    this.error = "";
    let balanceError: unknown;
    for (const board of boards) {
      if (this.pending.has(board.id)) continue;
      const entry = { abort: new AbortController(), progress: { boardId: board.id, requestId: randomUUID(), phase: "queued" as BoardProgress["phase"], message: "Waiting to check" } };
      this.pending.set(board.id, entry);
      const run = this.queue.then(async () => {
        const signal = entry.abort.signal;
        let requestSignal = signal, checkpoint: BoardCheckpoint | null = null;
        const report = (message: string, phase: BoardProgress["phase"]) => {
          entry.progress = { ...entry.progress, message, phase }; this.changed();
        };
        try {
          signal.throwIfAborted();
          if (generation !== this.store.generation || this.store.get(board.id).revision !== board.revision) return;
          const cacheRoot = path.join(this.dependencies.profile, "board-extractions");
          await mkdir(cacheRoot, { recursive: true });
          const extract = async (input: BoardExtractionInput) => {
            const digest = createHash("sha256").update(JSON.stringify({ instructions: boardModelContract(input).instructions,
              input, provider: selected.provider, model: selected.model, thinking: selected.thinkingLevel,
              endpoint: selected.provider === "ollama" ? selected.ollamaUrl : "" })).digest("hex");
            const cachePath = path.join(cacheRoot, digest + ".json");
            const sourceId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
            let cached: unknown;
            try {
              cached = JSON.parse(await readFile(cachePath, "utf8"));
            } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
            let validated;
            try { if (cached) validated = validatedBoardExtraction(cached, input); }
            catch { /* Reject corrupted or obsolete cached results. */ }
            if (validated) {
              await this.dependencies.acknowledgeCached?.(selected, input, sourceId);
              if (checkpoint) checkpoint.reused++;
              return validated;
            }
            requestSignal.throwIfAborted();
            if (balanceError) throw balanceError;
            const response = await this.dependencies.extract(selected, input, requestSignal, sourceId);
            const result = validatedBoardExtraction(response.value, input);
            requestSignal.throwIfAborted();
            // Persist a paid result before acknowledging it. Interrupted scans
            // can reuse this exact extraction without another paid request.
            await writeProfileSettings(cachePath, JSON.stringify(result));
            await response.acknowledge?.();
            return result;
          };
          const canUseVision = () => this.dependencies.canUseVision?.(selected, signal) ?? Promise.resolve(selected.provider !== "builtin" && selected.provider !== "ollama");
          const scanOptions = { url: board.url, extract, signal, canUseVision,
            instructions: board.instructions, knownMatches: board.instructions ? this.store.knownMatches(board.id, board.revision) : undefined,
            provider: selected.provider, model: selected.model, batchSize: selected.provider === "builtin" ? 4 : selected.provider === "ollama" ? 12 : 40,
            progress: report };
          const thorough = async () => {
            signal.throwIfAborted();
            if (!await canUseVision()) throw new Error("A thorough check needs a model that can read images. Choose one in Settings, then retry. Your last successful check is unchanged.");
            const prior = this.runs.latest(workspace, board), account = "";
            const compatible = prior && prior.provider === selected.provider && prior.model === selected.model && prior.account === account;
            const resumePrior = Boolean(compatible && prior.status !== "complete" && (!options.thorough || options.resume));
            checkpoint = resumePrior && prior ? prior : newBoardCheckpoint({ boardId: board.id,
              workspace, revision: board.revision, baseCheckId: board.lastCheckId, url: board.url, provider: selected.provider, model: selected.model, account, instructions: board.instructions });
            if (!options.thorough && compatible && prior.recipe.length) checkpoint.recipe = prior.recipe;
            checkpoint.status = "reading";
            const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(new BoardReadLimit("This check reached its time limit. Resume to continue, or adjust the limits in Settings.")), settings.minutes * 60000);
            requestSignal = AbortSignal.any([signal, deadline.signal]);
            const initialRequests = checkpoint.calls - checkpoint.reused;
            try {
              for (let attempt = 0; attempt < 2; attempt++) {
                const remaining = settings.modelCalls - (checkpoint.calls - checkpoint.reused - initialRequests);
                if (remaining <= 0) throw new BoardReadLimit("This check reached its reading limit. Resume to continue.");
                const owner = this.dependencies.reader(requestSignal);
                try {
                  if (!owner.thorough) throw new Error("The thorough reader is unavailable. Update Zebby and retry.");
                  return await thoroughlyScanBoard({ ...scanOptions, reader: owner.thorough, signal: requestSignal,
                    settings: { ...settings, modelCalls: remaining }, checkpoint,
                    resume: resumePrior || attempt > 0, forceFresh: options.thorough && !options.resume && !attempt,
                    save: async run => { await this.runs.save(run); this.changed(); } });
                } catch (error) {
                  requestSignal.throwIfAborted();
                  if (attempt || error instanceof BoardReadLimit || !/took too long|page.*(?:changed|replaced)|results.*changed|object has been destroyed|temporar|network|ERR_(?:CONNECTION|TIMED_OUT)/i.test(String(error))) throw error;
                  checkpoint.status = "reading"; checkpoint.message = "Reopening the page after an interrupted read";
                  await this.runs.save(checkpoint); report(checkpoint.message, "reading");
                } finally { owner.close(); }
              }
              throw new Error("The page could not finish loading. Resume to try again.");
            } finally { clearTimeout(timer); requestSignal = signal; }
          };
          let scan;
          if (options.thorough || options.resume) scan = await thorough();
          else {
            const initialReader = this.dependencies.reader(signal);
            try { scan = await scanBoard({ ...scanOptions, reader: initialReader }); }
            catch (error) {
              signal.throwIfAborted();
              if (!initialReader.thorough || !settings.automaticThorough || balanceError || boardCreditError(error) ||
                  /API key|authentication|sign.?in|unsupported model|model.*not.*available|credit|allowance|quota|billing/i.test(String(error))) throw error;
              report("Starting a thorough check", "reading"); scan = await thorough();
            }
          }
          signal.throwIfAborted(); report("Saving check", "saving");
          await this.store.complete(board.id, board.revision, generation, scan);
          const resolved = checkpoint || this.runs.latest(workspace, board);
          if (resolved) {
            resolved.status = "complete"; resolved.updatedAt = new Date().toISOString(); resolved.message = "Check completed and saved";
            try { await this.runs.save(resolved); } catch { this.error = "The check was saved, but its recovery log could not be updated."; }
          }
        } catch (error) {
          if (checkpoint?.status === "reading") {
            checkpoint.status = signal.aborted ? "paused" : "incomplete"; checkpoint.updatedAt = new Date().toISOString();
            checkpoint.message = signal.aborted ? "Check paused. Resume when ready" : (error instanceof Error ? error.message : "The check could not finish").slice(0, 4000);
            try { await this.runs.save(checkpoint); } catch { this.error = "The check stopped, but its latest recovery log could not be saved."; }
          }
          if (!signal.aborted) {
            const needsCredits = selected.provider === "credits" && boardCreditError(error);
            if (needsCredits) balanceError = error;
            const detail = error instanceof Error ? error.message : "The board could not be checked. Try again.";
            const message = needsCredits ? BOARD_CREDIT_MESSAGE + " " + detail : detail;
            try { await this.store.failed(board.id, board.revision, generation, message); }
            catch { this.error = message; }
          }
        } finally { this.pending.delete(board.id); this.changed(); }
      });
      this.queue = run.catch(error => { this.error = String(error); this.pending.delete(board.id); this.changed(); });
    }
    this.changed(); return this.state;
  }
  cancel(id: string) {
    const entry = this.pending.get(id);
    if (!entry || entry.progress.phase === "saving") return false;
    entry.abort.abort(new DOMException("Board check cancelled.", "AbortError")); return true;
  }
  async stop() { for (const id of this.pending.keys()) this.cancel(id); await this.queue; }
}

import { ANALYSIS_STAGES, type AnalysisProgress, type AnalysisStage } from "../../shared/analysis-progress.ts";
import type { AnalysisSource } from "../../shared/online-models.ts";
import type { Plan } from "../store.ts";
import type { Application } from "../../lib/application-types.ts";

export type AnalysisJob = AnalysisSource & {
  requestId: string; startedAt: number; stage: AnalysisStage;
  status: "running" | "succeeded" | "cancelled" | "failed";
  cancelling: boolean; automatic: boolean; modelLabel: string; error: string;
  result?: { plan?: Plan; application?: Application };
};
export const jobKey = (source: AnalysisSource) => `${source.kind}:${source.id}`;
export const jobRunning = (job: AnalysisJob | undefined) => job?.status === "running";

// Workspace-owned requests outlive individual pages. A source keeps its own
// controller, result and progress, so completion cannot replace another draft.
export class AnalysisJobs {
  private jobs: readonly AnalysisJob[] = [];
  private listeners = new Set<() => void>();
  private controllers = new Map<string, AbortController>();
  private send: typeof fetch;
  private cancelRequest: (id: string) => Promise<boolean>;
  constructor(send: typeof fetch, cancelRequest: (id: string) => Promise<boolean>) {
    this.send = send; this.cancelRequest = cancelRequest;
  }
  snapshot = () => this.jobs;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get(source: AnalysisSource) { return this.jobs.find((job) => jobKey(job) === jobKey(source)); }
  private publish() { for (const listener of this.listeners) listener(); }
  private update(requestId: string, changes: Partial<AnalysisJob>) {
    this.jobs = this.jobs.map((job) => job.requestId === requestId ? { ...job, ...changes } : job); this.publish();
  }
  dismiss(source: AnalysisSource) {
    if (jobRunning(this.get(source))) return;
    this.jobs = this.jobs.filter((job) => jobKey(job) !== jobKey(source)); this.publish();
  }
  progress = (progress: AnalysisProgress) => {
    const job = this.jobs.find((value) => value.requestId === progress.requestId);
    if (!jobRunning(job) || !job || !Object.hasOwn(ANALYSIS_STAGES, progress.stage) ||
        this.controllers.get(job.requestId)?.signal.aborted ||
        ANALYSIS_STAGES[progress.stage].order <= ANALYSIS_STAGES[job.stage].order) return;
    this.update(job.requestId, { stage: progress.stage });
  };
  async start(source: AnalysisSource, options: { prepare: (signal: AbortSignal) => Promise<{ quoteId?: string } | null>;
    automatic?: boolean; modelLabel?: string }) {
    if (jobRunning(this.get(source))) return;
    const requestId = crypto.randomUUID(), controller = new AbortController();
    this.controllers.set(requestId, controller);
    this.jobs = [...this.jobs.filter((job) => jobKey(job) !== jobKey(source)), { ...source, requestId,
      startedAt: performance.now(), stage: "preparing", status: "running", cancelling: false,
      automatic: Boolean(options.automatic), modelLabel: options.modelLabel || "", error: "" }];
    this.publish();
    try {
      // A sleeping credit service can take time to prepare. Cancel releases the
      // listing immediately, and a late quote can never start a paid request.
      const authorization = await new Promise<{ quoteId?: string } | null>((resolve, reject) => {
        const cancel = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", cancel, { once: true });
        Promise.resolve().then(() => { controller.signal.throwIfAborted(); return options.prepare(controller.signal); })
          .then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", cancel));
      });
      controller.signal.throwIfAborted();
      if (!authorization) { this.jobs = this.jobs.filter((job) => job.requestId !== requestId); this.publish(); return; }
      const path = source.kind === "plan" ? "plans" : "applications";
      const response = await this.send(`/api/${path}/${encodeURIComponent(source.id)}/analyze`, {
        method: "POST", headers: { "X-Zebby-Analysis-ID": requestId,
          ...(authorization.quoteId ? { "X-Zebby-Credit-Quote": authorization.quoteId } : {}) }, signal: controller.signal,
      });
      const result = await response.json() as AnalysisJob["result"] & { error?: string };
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(result?.error || "The analysis could not be completed. Try again.");
      if (!(source.kind === "plan" ? result?.plan : result?.application)) throw new Error("The analysis returned no saved result. Try again.");
      this.update(requestId, { status: "succeeded", result, error: "", cancelling: false });
    } catch (cause) {
      this.update(requestId, { status: controller.signal.aborted ? "cancelled" : "failed", cancelling: false,
        error: controller.signal.aborted ? "" : cause instanceof Error ? cause.message : "The analysis could not be completed. Try again." });
    } finally { this.controllers.delete(requestId); }
  }
  async cancel(source: AnalysisSource) {
    const job = this.get(source);
    if (!job || !jobRunning(job) || job.cancelling || job.stage === "saving") return;
    this.update(job.requestId, { cancelling: true });
    try {
      if (await this.cancelRequest(job.requestId)) this.controllers.get(job.requestId)?.abort();
    } catch { throw new Error("Could not cancel analysis. Try again."); }
    finally { this.update(job.requestId, { cancelling: false }); }
  }
}

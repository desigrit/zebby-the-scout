// Renderer fetch cancellation does not reliably cancel an Electron protocol
// handler. Carry a request ID through IPC and use one signal for inference and
// the final persistence check instead.
export class AnalysisRequests {
  private active = new Map<string, { controller: AbortController; committing: boolean }>();
  private cancelled = new Map<string, number>();
  private finished = new Map<string, number>();

  cancel(id: string) {
    this.validate(id);
    this.prune();
    const request = this.active.get(id);
    if (request?.committing || this.finished.has(id)) return false;
    if (request) request.controller.abort(new DOMException("Analysis cancelled.", "AbortError"));
    else {
      // A click can arrive before the protocol handler starts the request.
      this.remember(this.cancelled, id);
    }
    return true;
  }

  async run<T>(id: string, work: (signal: AbortSignal, commit: <V>(persist: () => Promise<V>) => Promise<V>) => Promise<T>): Promise<T> {
    this.validate(id);
    this.prune();
    if (this.active.has(id)) throw new Error("This analysis is already running.");
    if (this.finished.has(id)) throw new Error("This analysis has already finished.");
    const controller = new AbortController();
    if (this.cancelled.delete(id)) controller.abort(new DOMException("Analysis cancelled.", "AbortError"));
    const request = { controller, committing: false };
    this.active.set(id, request);
    try {
      controller.signal.throwIfAborted();
      const result = await work(controller.signal, async (persist) => {
        controller.signal.throwIfAborted();
        request.committing = true;
        return persist();
      });
      if (!request.committing) controller.signal.throwIfAborted();
      return result;
    } finally {
      this.active.delete(id);
      // The renderer can still be awaiting its response after persistence ends.
      this.remember(this.finished, id);
    }
  }

  cancelAll() { for (const id of this.active.keys()) this.cancel(id); }
  private validate(id: string) {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
      throw new Error("Invalid analysis request.");
    }
  }
  private remember(entries: Map<string, number>, id: string) {
    if (entries.size >= 100) entries.delete(entries.keys().next().value!);
    entries.set(id, Date.now() + 60_000);
  }
  private prune() {
    for (const entries of [this.cancelled, this.finished]) {
      for (const [id, until] of entries) if (until < Date.now()) entries.delete(id);
    }
  }
}

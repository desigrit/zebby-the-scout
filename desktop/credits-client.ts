import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { onlineModel, type AnalysisSource, type CreditQuote, type CreditsState, type Wallet, type AnalysisKind } from "../shared/online-models.ts";
const integer = z.number().int().safe();
const walletSchema = z.object({ balance: integer, reserved: integer.nonnegative(), used: integer.nonnegative(),
  purchased: integer.nonnegative(), updatedAt: z.string(), recent: z.array(z.object({ id: z.string().uuid(),
    model: z.string(), kind: z.string(), cost: integer.nonnegative(), createdAt: z.string() })).max(10) });
const sessionSchema = z.object({ access_token: z.string().min(1).max(8192), refresh_token: z.string().min(1).max(8192),
  expires_at: z.number().optional(), expires_in: z.number().optional(), user: z.object({ email: z.string().email(), id: z.string().uuid() }) });
const pendingSchema = z.object({ quoteId: z.string().uuid(), requestId: z.string().uuid(), userId: z.string().uuid(), hash: z.string(),
  model: z.string(), expires: z.number(), source: z.object({ kind: z.enum(["plan", "match"]), id: z.string().uuid() }) });
const recoveredSchema = z.object({ status: z.enum(["reserved", "completed", "failed"]), result: z.record(z.unknown()).nullable(),
  model: z.string(), kind: z.enum(["plan", "match"]), cost: integer.nonnegative(), quoteId: z.string().uuid(), wallet: walletSchema });
type PendingRun = z.infer<typeof pendingSchema>;
type Session = { access: string; refresh: string; expires: number; email: string; id: string };
type ClientOptions = { save: (value: string) => Promise<void>; onChange: () => void; fetcher?: typeof fetch };
class HttpError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
const hashInput = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export class CreditsClient {
  private session: Session | null = null;
  private wallet: Wallet | null = null;
  private stale = true;
  private error = "";
  private generation = 0;
  private refreshing: { generation: number; promise: Promise<void> } | null = null;
  private walletRefresh: { generation: number; promise: Promise<void> } | null = null;
  private controllers = new Set<AbortController>();
  private pending = new Map<string, PendingRun>();
  readonly url: string;
  private options: ClientOptions;
  constructor(url: string, options: ClientOptions) {
    this.options = options;
    if (url) { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error("The credits service URL must be an HTTPS origin."); this.url = parsed.origin; }
    else this.url = "";
  }
  restore(value: string) {
    try {
      const stored = JSON.parse(value);
      if (!this.url || stored.url !== this.url) return;
      this.session = stored.session ? z.object({ access: z.string().min(1).max(8192), refresh: z.string().min(1).max(8192), expires: z.number(),
        email: z.string().email(), id: z.string().uuid() }).parse(stored.session) : null;
      this.wallet = this.session && stored.wallet ? walletSchema.parse(stored.wallet) : null;
      for (const item of z.array(pendingSchema).max(20).parse(stored.pending || [])) if (item.expires > Date.now()) this.pending.set(item.quoteId, item);
    } catch { this.session = null; this.wallet = null; this.pending.clear(); }
  }
  state(model: string): CreditsState { return { available: Boolean(this.url), signedIn: Boolean(this.session),
    email: this.session?.email || "", wallet: this.wallet, stale: this.stale, error: this.error, model }; }
  secrets() { return [this.session?.access || "", this.session?.refresh || ""]; }
  private checkGeneration(generation: number) { if (generation !== this.generation) throw new DOMException("The signed-in account changed.", "AbortError"); }
  private invalidate(clearPending = false) {
    this.generation++; for (const controller of this.controllers) controller.abort(); this.controllers.clear();
    this.session = null; this.wallet = null; this.stale = true; this.error = "";
    if (clearPending) this.pending.clear();
  }
  private async persist() {
    for (const [id, run] of this.pending) if (run.expires < Date.now()) this.pending.delete(id);
    await this.options.save(this.session || this.pending.size ? JSON.stringify({ url: this.url, session: this.session,
      wallet: this.wallet, pending: [...this.pending.values()] }) : "");
  }
  private async request(path: string, body?: unknown, authenticated = true, signal?: AbortSignal): Promise<unknown> {
    if (!this.url) throw new Error("Paid credits are not available yet. Choose a local model or your own API key.");
    const generation = this.generation;
    if (authenticated) {
      if (!this.session) throw new Error("Sign in to use credits.");
      if (this.session.expires < Date.now() + 60000) {
        if (this.refreshing?.generation !== generation) {
          const promise = this.refreshSession(generation).finally(() => { if (this.refreshing?.generation === generation) this.refreshing = null; });
          this.refreshing = { generation, promise };
        }
        await this.refreshing.promise;
      }
      this.checkGeneration(generation);
    }
    const controller = new AbortController(); if (authenticated) this.controllers.add(controller);
    try {
      const response = await (this.options.fetcher || fetch)(this.url + path, { method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${this.session!.access}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(path === "/v1/analysis" ? 210000 : 20000), ...(signal ? [signal] : [])]) });
      let result: unknown;
      try { result = await response.json(); } catch { throw new Error("The credit service returned an unreadable response."); }
      this.checkGeneration(generation);
      if (!response.ok) {
        if (response.status === 401 && authenticated) { this.invalidate(); await this.persist(); this.options.onChange(); }
        const error = z.object({ error: z.string() }).safeParse(result);
        throw new HttpError(error.success ? error.data.error.slice(0, 400) : "The credit service is unavailable. Try again.", response.status);
      }
      return result;
    } finally { this.controllers.delete(controller); }
  }
  private async setSession(value: unknown, generation: number, expectedUser?: string) {
    this.checkGeneration(generation);
    const parsed = sessionSchema.parse(value);
    if (expectedUser && parsed.user.id !== expectedUser) throw new Error("Sign in again to confirm your account.");
    this.session = { access: parsed.access_token, refresh: parsed.refresh_token,
      expires: parsed.expires_at ? parsed.expires_at * 1000 : Date.now() + (parsed.expires_in || 3600) * 1000,
      email: parsed.user.email, id: parsed.user.id };
    for (const [id, run] of this.pending) if (run.userId !== parsed.user.id) this.pending.delete(id);
    await this.persist(); this.checkGeneration(generation);
  }
  private async refreshSession(generation: number) {
    const session = this.session!;
    try { await this.setSession(await this.request("/v1/auth/refresh", { refreshToken: session.refresh }, false), generation, session.id); }
    catch (error) {
      if (generation === this.generation && error instanceof HttpError && error.status === 401) { this.invalidate(); await this.persist(); this.options.onChange(); }
      throw error;
    }
  }
  async sendCode(email: string) { z.string().email().max(254).parse(email); await this.request("/v1/auth/send-code", { email }, false); }
  async verify(email: string, code: string) {
    this.invalidate(); const generation = this.generation;
    await this.persist(); this.options.onChange();
    await this.setSession(await this.request("/v1/auth/verify", { email, code }, false), generation);
    await this.refreshWallet();
  }
  async signOut() {
    const session = this.session; this.invalidate(true); await this.persist(); this.options.onChange();
    // Revoke this device's old refresh session without allowing its reply to change a newer account.
    if (session && this.url) await (this.options.fetcher || fetch)(this.url + "/v1/auth/logout", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access}` }, body: "{}", signal: AbortSignal.timeout(10000) }).catch(() => undefined);
  }
  async refreshWallet() {
    if (!this.session) return;
    const generation = this.generation;
    if (this.walletRefresh?.generation === generation) return this.walletRefresh.promise;
    const operation = async () => {
      try { const wallet = walletSchema.parse(await this.request("/v1/wallet")); this.checkGeneration(generation);
        this.wallet = wallet; this.stale = false; this.error = ""; await this.persist(); }
      catch (error) { if (generation === this.generation) { this.stale = true; this.error = error instanceof Error ? error.message : "Could not refresh credits."; } throw error; }
      finally { if (generation === this.generation) this.options.onChange(); }
    };
    const promise = operation().finally(() => { if (this.walletRefresh?.generation === generation) this.walletRefresh = null; });
    this.walletRefresh = { generation, promise }; return promise;
  }
  async checkout(pack: string) {
    const generation = this.generation;
    const result = z.object({ id: z.string().regex(/^cs_[a-zA-Z0-9_]+$/), url: z.string().url(), mode: z.enum(["test", "live"]) })
      .parse(await this.request("/v1/checkout", { pack, requestId: randomUUID() })); this.checkGeneration(generation);
    const url = new URL(result.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) throw new Error("The payment provider returned an invalid checkout link.");
    return result;
  }
  async checkoutStatus(id: string) {
    if (!/^cs_[a-zA-Z0-9_]+$/.test(id)) throw new Error("Invalid checkout session.");
    const generation = this.generation;
    const result = z.object({ status: z.enum(["paid", "pending", "expired"]), wallet: walletSchema.optional() }).parse(await this.request("/v1/checkout/" + id));
    this.checkGeneration(generation);
    if (result.status === "paid") { this.wallet = walletSchema.parse(result.wallet); this.stale = false; this.error = ""; await this.persist(); this.options.onChange(); }
    return result.status;
  }
  async quote(kind: AnalysisKind, input: unknown, model: string): Promise<CreditQuote> {
    onlineModel(model);
    return z.object({ id: z.string().uuid(), model: z.string(), maximum: integer.positive(), expiresAt: z.string() })
      .parse(await this.request("/v1/quotes", { kind, input, model }));
  }
  private async inspect(run: PendingRun) {
    const generation = this.generation;
    const result = recoveredSchema.parse(await this.request("/v1/analyses/" + run.requestId));
    this.checkGeneration(generation);
    if (result.quoteId !== run.quoteId || result.model !== run.model) throw new Error("The recovered analysis does not match this job.");
    this.wallet = result.wallet; this.stale = false; this.error = ""; await this.persist(); this.options.onChange();
    return result;
  }
  async recoveryQuote(source: AnalysisSource, input: unknown): Promise<CreditQuote | null> {
    const hash = hashInput(input);
    const run = [...this.pending.values()].find((item) => item.userId === this.session?.id && item.source.id === source.id && item.source.kind === source.kind && item.hash === hash);
    if (!run) return null;
    try {
      const result = await this.inspect(run);
      if (result.status === "failed" || result.status === "completed" && !result.result) { await this.acknowledge(run.quoteId); return null; }
      return { id: run.quoteId, model: run.model, maximum: 0, expiresAt: new Date(run.expires).toISOString(),
        recovery: true, pending: result.status === "reserved", cost: result.cost };
    } catch (error) { if (error instanceof HttpError && error.status === 404) { await this.acknowledge(run.quoteId); return null; } throw error; }
  }
  async acknowledge(quoteId: string) { this.pending.delete(quoteId); await this.persist(); }
  async analyze(quoteId: string, input: unknown, signal: AbortSignal, source?: AnalysisSource, model = "gpt-6-luna") {
    z.string().uuid().parse(quoteId);
    const generation = this.generation, hash = hashInput(input);
    let run = this.pending.get(quoteId);
    if (run && (run.userId !== this.session?.id || run.hash !== hash)) throw new Error("This analysis belongs to different source data or another account.");
    if (!run) {
      if (!this.session) throw new Error("Sign in to use credits.");
      if (this.pending.size >= 20) throw new Error("Finish or recover your pending analyses first.");
      run = { quoteId, requestId: randomUUID(), userId: this.session.id, hash, model,
        expires: Date.now() + 24 * 3600000, source: source || { kind: "match", id: quoteId } };
      this.pending.set(quoteId, run); await this.persist();
    }
    this.checkGeneration(generation); signal.throwIfAborted();
    try {
      const body = { quoteId, requestId: run.requestId, input };
      let response: { result: Record<string, unknown>; wallet: Wallet };
      try { response = z.object({ result: z.record(z.unknown()), wallet: walletSchema }).parse(await this.request("/v1/analysis", body, true, signal)); }
      catch (error) {
        this.checkGeneration(generation); signal.throwIfAborted();
        // A lost reply may follow a successful settlement. Inspect, never create another paid run.
        const recovered = await this.inspect(run).catch(() => null);
        this.checkGeneration(generation); signal.throwIfAborted();
        if (recovered?.status === "completed" && recovered.result) response = { result: recovered.result, wallet: recovered.wallet };
        else { if (recovered?.status === "failed") await this.acknowledge(quoteId); throw error; }
      }
      this.checkGeneration(generation); signal.throwIfAborted();
      this.wallet = response.wallet; this.stale = false; this.error = ""; await this.persist(); this.options.onChange();
      // Main acknowledges only after the result has been saved to the selected database.
      return response.result;
    } finally { if (generation === this.generation) void this.refreshWallet().catch(() => undefined); }
  }
}

import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeProfileSettings } from "../settings-persistence.ts";
import { ChatGPTPlanError } from "../../shared/chatgpt-plan.ts";

const AUTH = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
type Tokens = { access: string; refresh: string; idToken: string; expiresAt: number };
type Registration = { id: string; clientId: string; subject: string; label: string; enabled: boolean; tokens?: Tokens };
type Profile = { version: 1; hostId: string; active: string; accounts: Registration[]; welcome?: boolean };
type Dependencies = { folder: string; encrypt(value: string): string; decrypt(value: string): string;
  openBrowser(url: string): Promise<void>; changed(): void; fetcher?: typeof fetch };
const secret = () => randomBytes(32).toString("base64url");
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const failure = (message: string) => new ChatGPTPlanError(message, "signin");

export async function validateIdentity(token: string, clientId: string, nonce: string | undefined, fetcher: typeof fetch = fetch) {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 30000) throw failure("ChatGPT returned an invalid identity. Sign in again.");
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], "base64url").toString()); claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()); }
  catch { throw failure("ChatGPT returned an unreadable identity. Sign in again."); }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw failure("ChatGPT returned an unsupported identity signature.");
  const metadataResponse = await fetcher(`${AUTH}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!metadataResponse.ok) throw failure("Could not verify ChatGPT sign-in. Try again.");
  const metadata = await metadataResponse.json() as { issuer: string; jwks_uri: string };
  if (metadata.issuer !== AUTH || new URL(metadata.jwks_uri).origin !== AUTH) throw failure("ChatGPT identity verification is unavailable.");
  const response = await fetcher(metadata.jwks_uri, { signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw failure("Could not verify ChatGPT sign-in. Try again.");
  const jwks = await response.json() as { keys: (JsonWebKey & { kid?: string; alg?: string; use?: string })[] };
  const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
  if (!jwk || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))) {
    throw failure("ChatGPT identity verification failed. Sign in again.");
  }
  const now = Math.floor(Date.now() / 1000);
  const audience = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
  if (claims.iss !== AUTH || !Array.isArray(audience) || !audience.includes(clientId) ||
      audience.length > 1 && claims.azp !== clientId || !Number.isFinite(claims.exp) || claims.exp <= now ||
      typeof claims.sub !== "string" || !claims.sub || claims.iat > now + 60 || nonce !== undefined && claims.nonce !== nonce) {
    throw failure("ChatGPT sign-in did not match this connection. Sign in again.");
  }
  return { subject: claims.sub as string, label: typeof claims.email === "string" ? claims.email.slice(0, 200) : "ChatGPT account" };
}

export class ChatGPTAuth {
  private profile: Profile = { version: 1, hostId: `urn:uuid:${randomUUID()}`, active: "", accounts: [] };
  private pending?: AbortController;
  private refresh?: Promise<string>;
  private signInFinished?: Promise<void>;
  private writes: Promise<unknown> = Promise.resolve();
  readonly fetcher: typeof fetch;
  private deps: Dependencies;
  constructor(deps: Dependencies) { this.deps = deps; this.fetcher = deps.fetcher || fetch; }
  private get file() { return path.join(this.deps.folder, "chatgpt-credentials.enc"); }
  get current() { return this.profile.accounts.find(account => account.id === this.profile.active); }
  get connecting() { return Boolean(this.pending); }
  get active() { return this.profile.active; }
  get welcome() { return this.profile.welcome === true; }
  get accounts() { return this.profile.accounts.map(({ id, label }, index) => ({ id, label: `${label} (${index + 1})` })); }
  get connected() { return Boolean(this.current?.enabled && this.current.tokens); }
  secrets() { return this.profile.accounts.flatMap(account => account.tokens ? Object.values(account.tokens).filter((s): s is string => typeof s === "string") : []); }
  async initialize() {
    try {
      const raw = await readFile(this.file, "utf8");
      const saved = JSON.parse(this.deps.decrypt(raw)) as Profile;
      if (saved.version !== 1 || !/^urn:uuid:[\da-f-]{36}$/.test(saved.hostId) || !Array.isArray(saved.accounts) || saved.accounts.length > 20 ||
        saved.accounts.some(a => !a.id || !a.clientId || !a.subject || typeof a.label !== "string")) throw new Error();
      this.profile = saved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw failure("Could not unlock the saved ChatGPT connection. Your saved connection file has been preserved.");
      await this.save(this.profile);
    }
  }
  private async save(value: Profile | ((current: Profile) => Profile)) {
    const operation = this.writes.catch(() => undefined).then(async () => {
      const profile = typeof value === "function" ? value(this.profile) : value;
      await writeProfileSettings(this.file, this.deps.encrypt(JSON.stringify(profile)));
      this.profile = profile; this.deps.changed();
    });
    this.writes = operation; await operation;
  }
  async acknowledgeWelcome() { await this.save(current => ({ ...current, welcome: false })); }
  cancelSignIn() { this.pending?.abort(); }
  async signIn(accountId?: string) {
    if (this.pending) throw failure("A ChatGPT sign-in is already open.");
    const existing = accountId ? this.profile.accounts.find(a => a.id === accountId) : undefined;
    if (accountId && !existing) throw failure("Choose a saved ChatGPT account.");
    if (!existing && this.profile.accounts.length >= 20) throw failure("Reconnect an existing ChatGPT account.");
    const controller = new AbortController(); this.pending = controller; this.deps.changed();
    let finish!: () => void;
    this.signInFinished = new Promise<void>(resolve => { finish = resolve; });
    const state = secret(), nonce = secret(), verifier = secret();
    let resolveCallback!: (value: URL) => void;
    const callback = new Promise<URL>((resolve, reject) => {
      resolveCallback = resolve;
      controller.signal.addEventListener("abort", () => reject(failure("ChatGPT sign-in was cancelled.")), { once: true });
    });
    // Attach immediately, including when opening the browser fails first.
    void callback.catch(() => undefined);
    let received = false;
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method !== "GET" || url.pathname !== "/auth/callback" || !equal(url.searchParams.get("state") || "", state) || received) {
        res.writeHead(400, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); res.end("This sign-in link is not valid."); return;
      }
      received = true;
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" });
      res.end("Return to Zebby to finish connecting ChatGPT."); resolveCallback(url);
    });
    const timeout = setTimeout(() => controller.abort(), 5 * 60_000);
    try {
      await this.save(this.profile); // Persist the host before registration.
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address();
      if (!address || typeof address === "string") throw failure("Could not start ChatGPT sign-in. Try again.");
      const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
      const params = new URLSearchParams({ client_id: existing?.clientId || "dynamic_agent_client", ext_agent_host_id: this.profile.hostId,
        response_type: "code", redirect_uri: redirect, scope: SCOPES, resource: RESOURCE, state, nonce,
        code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
      if (existing?.tokens?.idToken) params.set("id_token_hint", existing.tokens.idToken);
      if (!existing) params.set("agent_name_hint", "Zebby");
      await this.deps.openBrowser(`${AUTH}/api/accounts/authorize?${params}`);
      const returned = await callback;
      if (returned.searchParams.has("error")) throw failure("ChatGPT connection was not approved. You can connect again in Settings.");
      const clientId = returned.searchParams.get("client_id") || existing?.clientId || "";
      const code = returned.searchParams.get("code");
      if (!code || !/^[\w.-]{1,200}$/.test(clientId) || clientId === "dynamic_agent_client" || existing && clientId !== existing.clientId) throw failure("ChatGPT registration did not finish. Try again.");
      const payload = await this.token(new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code,
        code_verifier: verifier, redirect_uri: redirect, resource: RESOURCE }), controller.signal);
      const identity = await validateIdentity(String(payload.id_token || ""), clientId, nonce, this.fetcher);
      if (existing && identity.subject !== existing.subject) throw failure("Choose the same ChatGPT account, or add a new connection.");
      const id = createHash("sha256").update(`${identity.subject}:${clientId}`).digest("hex");
      const enabled = String(payload.scope || "").split(/\s+/).includes("chatgpt.tokens.use.direct");
      const registration: Registration = { id, clientId, subject: identity.subject, label: identity.label, enabled, tokens: this.tokens(payload) };
      controller.signal.throwIfAborted();
      await this.save(current => {
        controller.signal.throwIfAborted();
        return { ...current, active: id, welcome: current.welcome || !current.accounts.some(a => a.id === id && a.enabled),
          accounts: [...current.accounts.filter(a => a.id !== id), registration] };
      });
      if (!enabled) throw failure("Connected to ChatGPT. Enable permission to use your ChatGPT plan when reconnecting.");
    } finally {
      clearTimeout(timeout); server.close(); server.closeAllConnections(); this.pending = undefined; finish(); this.signInFinished = undefined; this.deps.changed();
    }
  }
  private tokens(value: Record<string, unknown>): Tokens {
    if (typeof value.access_token !== "string" || typeof value.refresh_token !== "string" || typeof value.id_token !== "string" ||
      typeof value.expires_in !== "number" || value.expires_in <= 0 || value.expires_in > 86400 || value.token_type !== "Bearer" && value.token_type !== "bearer") {
      throw failure("ChatGPT returned incomplete credentials. Sign in again.");
    }
    return { access: value.access_token, refresh: value.refresh_token, idToken: value.id_token, expiresAt: Date.now() + value.expires_in * 1000 };
  }
  private async token(body: URLSearchParams, signal?: AbortSignal) {
    const response = await this.fetcher(`${AUTH}/api/accounts/oauth/token`, { method: "POST", body, redirect: "error",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    const value = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const terminal = ["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"].includes(String(value.error));
      throw new ChatGPTPlanError(terminal ? "Your ChatGPT connection expired. Reconnect in Settings." : "Could not renew the ChatGPT connection. Try again.", terminal ? "signin" : "retry");
    }
    return value;
  }
  async access(expectedAccount: string) {
    const account = this.current;
    if (!account?.tokens || !account.enabled || account.id !== expectedAccount) throw failure("Connect the selected ChatGPT account in Settings before analyzing.");
    if (account.tokens.expiresAt > Date.now() + 60_000) return account.tokens.access;
    if (this.refresh) return this.refresh;
    this.refresh = (async () => {
      try {
        const payload = await this.token(new URLSearchParams({ grant_type: "refresh_token", client_id: account.clientId,
          refresh_token: account.tokens!.refresh, resource: RESOURCE }));
        if (payload.id_token) {
          const identity = await validateIdentity(String(payload.id_token), account.clientId, undefined, this.fetcher);
          if (identity.subject !== account.subject) throw failure("ChatGPT returned a different account. Reconnect in Settings.");
        }
        if (typeof payload.scope === "string" && !payload.scope.split(/\s+/).includes("chatgpt.tokens.use.direct")) throw failure("ChatGPT plan permission was removed. Reconnect in Settings.");
        const tokens = this.tokens({ ...payload, refresh_token: payload.refresh_token || account.tokens!.refresh, id_token: payload.id_token || account.tokens!.idToken });
        await this.save(current => ({ ...current, accounts: current.accounts.map(a => a.id === account.id ? { ...a, tokens } : a) }));
        return tokens.access;
      } catch (error) {
        if (error instanceof ChatGPTPlanError && error.recovery === "signin") await this.save(current => ({ ...current,
          accounts: current.accounts.map(a => a.id === account.id ? { ...a, tokens: undefined } : a) }));
        throw error;
      } finally { this.refresh = undefined; }
    })();
    return this.refresh;
  }
  async disconnect() {
    this.cancelSignIn();
    await this.signInFinished;
    await this.refresh?.catch(() => undefined);
    const account = this.current; let revoked = true;
    if (account?.tokens) {
      try {
        const metadata = await this.fetcher(`${AUTH}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000), redirect: "error" });
        const { revocation_endpoint: endpoint } = await metadata.json() as { revocation_endpoint: string };
        if (!metadata.ok || new URL(endpoint).origin !== AUTH) throw new Error();
        const response = await this.fetcher(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
          body: new URLSearchParams({ token: account.tokens.refresh, token_type_hint: "refresh_token", client_id: account.clientId }) });
        if (!response.ok) throw new Error();
      } catch { revoked = false; }
      await this.save(current => ({ ...current, accounts: current.accounts.map(a => a.id === account.id ? { ...a, tokens: undefined } : a) }));
    }
    return revoked;
  }
}

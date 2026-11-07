import { BrowserWindow, type WebFrameMain } from "electron";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { boardUrl } from "../lib/board-identity";
import type { BoardCandidate, BoardImage } from "../shared/boards";
import type { ExplorationAction, ExplorationControl } from "../shared/board-exploration";
import { actExplorePage, observeExplorePage, type ExplorePage } from "./board-explore-page";

export type ObservedBoardFeed = { id: string; url: string; data: unknown; sample: string };
export type BoardObservation = { page: ExplorePage; image: BoardImage; fingerprint: string; pendingRequests: number; scopeControls?: ExplorationControl[] };
export type BoardRecipeStep = { action: ExplorationAction; target?: Pick<ExplorationControl, "name" | "role" | "kind" | "href"> };
export interface ThoroughBoardReader {
  open(url: string): Promise<void>;
  observe(): Promise<BoardObservation>;
  act(action: ExplorationAction, observation: BoardObservation): Promise<BoardCandidate | undefined>;
  feeds(): ObservedBoardFeed[];
  close(): void;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pageFingerprint = (page: ExplorePage) => hash([page.url, page.candidates, page.controls, page.counters, page.scrollY, page.height]);
const sameTarget = (left: string, right: string) => {
  try { const a = boardUrl(left), b = boardUrl(right); return a.origin === b.origin && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, ""); }
  catch { return false; }
};
function sampleJSON(value: unknown, depth = 0): unknown {
  if (depth > 7) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 5).map(item => sampleJSON(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 60).map(([key, item]) => [key, sampleJSON(item, depth + 1)]));
  return value;
}

export class BoardExplorerBrowser implements ThoroughBoardReader {
  active = false;
  private source = "";
  private frame: WebFrameMain | null = null;
  private allowedTarget = "";
  private networkError = "";
  private epoch = 0;
  private pending = new Map<string, string>();
  private observedFeeds = new Map<string, ObservedBoardFeed>();
  private responses = new Map<string, string>();
  private attached = false;
  private inspectingControl = false;
  private inspectionTarget = "";
  private networkWork = new Set<Promise<void>>();
  constructor(private window: BrowserWindow, private signal: AbortSignal) {}
  private bounded<T>(operation: Promise<T>, milliseconds: number, stage: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const stop = () => { finish(); reject(this.signal.reason || new Error("The check was stopped.")); };
      const timer = setTimeout(() => { this.close(); reject(new Error(`${stage} took too long. Resume to reopen the page and continue.`)); }, milliseconds);
      const finish = () => { clearTimeout(timer); this.signal.removeEventListener("abort", stop); };
      this.signal.addEventListener("abort", stop, { once: true });
      if (this.signal.aborted) stop();
      operation.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
    });
  }
  permitsNavigation(target: string) {
    if (!this.active) return false;
    if (this.inspectingControl) { this.rememberInspectionTarget(target); return false; }
    const permitted = target === this.allowedTarget || sameTarget(target, this.source) || this.allowedTarget && sameTarget(target, this.allowedTarget);
    if (!permitted) this.networkError = "The results tried to leave the observed careers page. Open the saved link to verify its destination.";
    return Boolean(permitted);
  }
  private rememberInspectionTarget(target: string) {
    try {
      const url = boardUrl(target);
      if (!/\/(apply|application|login|signin|auth|checkout|register)(?:\/|$)/i.test(url.pathname)) this.inspectionTarget = url.href;
    } catch { /* Only a public URL emitted by the observed control can be inspected. */ }
  }
  private networkMessage = (_event: Electron.Event, method: string, params: Record<string, unknown>) => {
    const id = String(params.requestId || "");
    if (method === "Network.requestWillBeSent") {
      const request = params.request as { url?: string; method?: string } | undefined;
      if (["Fetch", "XHR"].includes(String(params.type)) && request?.url &&
          /jobs?|careers?|openings?|positions?|graphql|\/api\//i.test(request.url) && !/analytics|telemetry|client-stats|collect|pixel/i.test(request.url)) {
        try { this.pending.set(id, boardUrl(request.url).href); } catch { /* The public-address guard owns network access. */ }
      }
    }
    if (method === "Network.responseReceived") {
      const response = params.response as { url?: string; mimeType?: string; status?: number } | undefined;
      if (["Fetch", "XHR"].includes(String(params.type)) && response?.url && response.status === 200 && /json/i.test(response.mimeType || "")) {
        try { this.responses.set(id, boardUrl(response.url).href); } catch { /* Ignore non-public protocols. */ }
      }
    }
    if (method === "Network.loadingFailed") { this.pending.delete(id); this.responses.delete(id); }
    if (method === "Network.loadingFinished") {
      this.pending.delete(id);
      const url = this.responses.get(id); this.responses.delete(id);
      if (!url || Number(params.encodedDataLength) > 4_000_000 || this.observedFeeds.size >= 12 || this.networkWork.size >= 12) return;
      const epoch = this.epoch;
      const work = this.window.webContents.debugger.sendCommand("Network.getResponseBody", { requestId: id }).then(result => {
        if (epoch !== this.epoch || this.signal.aborted || result.base64Encoded || typeof result.body !== "string" || result.body.length > 4_000_000) return;
        let data: unknown; try { data = JSON.parse(result.body); } catch { return; }
        const sample = JSON.stringify(sampleJSON(data));
        if (!sample || sample.length > 30000 || !/\b(title|job_title|jobTitle|position|vacancy|requisition)\b/i.test(sample)) return;
        const key = hash([url, data]); this.observedFeeds.set(key, { id: key, url, data, sample });
      }).catch(() => undefined).finally(() => this.networkWork.delete(work));
      this.networkWork.add(work);
    }
  };
  async open(url: string) {
    this.signal.throwIfAborted(); this.active = true; this.source = boardUrl(url).href; this.allowedTarget = this.source;
    this.frame = null; this.networkError = ""; this.epoch++; this.pending.clear(); this.responses.clear(); this.observedFeeds.clear();
    let networkReady: Promise<unknown> | undefined;
    if (!this.attached) try {
      this.window.webContents.debugger.attach("1.3"); this.attached = true;
      this.window.webContents.debugger.on("message", this.networkMessage);
      // The first renderer is created by loadURL. Awaiting a debugger command
      // before that navigation can deadlock a new hidden BrowserWindow.
      networkReady = this.window.webContents.debugger.sendCommand("Network.enable", { maxTotalBufferSize: 16_000_000, maxResourceBufferSize: 4_000_000 }).catch(() => undefined);
    } catch { /* Public response capture is supplementary to rendered evidence. */ }
    await Promise.race([this.window.loadURL(this.source), delay(30000, undefined, { signal: this.signal }).then(() => { throw new Error("The careers page took too long to open. Resume the check to try again."); })]);
    if (networkReady) await Promise.race([networkReady, delay(2000, undefined, { signal: this.signal })]);
  }
  private async raw(frame = this.frame || this.window.webContents.mainFrame): Promise<ExplorePage> {
    this.signal.throwIfAborted();
    if (this.networkError) throw new Error(this.networkError);
    if (frame.isDestroyed()) throw new Error("The embedded results were replaced. Resume to read the updated page.");
    const source = new URL(this.source), fragment = new URLSearchParams(source.hash.includes("?") ? source.hash.slice(source.hash.indexOf("?") + 1) : "");
    const values = [...source.searchParams.values(), ...fragment.values()].slice(0, 30);
    const page = await this.bounded(frame.executeJavaScript(`(${observeExplorePage.toString()})(${JSON.stringify(values)})`), 15000, "Reading the page") as ExplorePage;
    boardUrl(page.url);
    if (page.candidates.length >= 2000 || page.controls.length >= 1000) throw new Error("This page has too many elements to verify in one check. Use a more specific results link.");
    if (page.blocked) throw new Error("This careers page is blocking automated reading. Your last successful check is unchanged. Try its direct job-board link instead.");
    return page;
  }
  private async parentScopeControls(): Promise<ExplorationControl[]> {
    const controls: ExplorationControl[] = [];
    for (let parent = this.frame?.parent; parent; parent = parent.parent) {
      controls.push(...(await this.raw(parent)).controls.filter(control => ["input", "select"].includes(control.kind) || control.role === "combobox" || control.role === "selected"));
    }
    return controls;
  }
  private async execute(action: ExplorationAction | { kind: "label" | "unlabel"; targetId: string; value: string }) {
    const source = new URL(this.source), fragment = new URLSearchParams(source.hash.includes("?") ? source.hash.slice(source.hash.indexOf("?") + 1) : "");
    const values = [...source.searchParams.values(), ...fragment.values()].slice(0, 30);
    return this.bounded((this.frame || this.window.webContents.mainFrame).executeJavaScript(`(${actExplorePage.toString()})(${JSON.stringify(action)},${JSON.stringify(values)})`), 15000, "Updating the results view") as Promise<boolean>;
  }
  async observe(): Promise<BoardObservation> {
    let page = await this.raw(), previous = pageFingerprint(page), stable = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      await delay(300, undefined, { signal: this.signal });
      page = await this.raw(); const signature = pageFingerprint(page);
      stable = signature === previous && !page.loading && this.pending.size === 0 ? stable + 1 : 0;
      previous = signature; if (stable >= 2) break;
    }
    await Promise.allSettled([...this.networkWork]);
    await this.execute({ kind: "label", targetId: "", value: "" });
    await this.bounded((this.frame || this.window.webContents.mainFrame).executeJavaScript("new Promise(resolve => { setTimeout(resolve, 250); requestAnimationFrame(() => requestAnimationFrame(resolve)); })"), 5000, "Preparing the page image");
    let data: string;
    try { data = (await this.bounded(this.window.webContents.capturePage(), 15000, "Capturing the page image")).resize({ width: 1280, height: 900 }).toJPEG(80).toString("base64"); }
    finally { if (!this.window.isDestroyed()) await this.execute({ kind: "unlabel", targetId: "", value: "" }); }
    if (data.length > 1_400_000) throw new Error("This page image is too large to read. Resume from a more specific results link.");
    const after = await this.raw();
    if (pageFingerprint(after) !== pageFingerprint(page)) throw new Error("The job results changed while the page was being captured. Resume to read the updated results.");
    return { page, image: { mediaType: "image/jpeg", data, width: 1280, height: 900 }, fingerprint: pageFingerprint(page), pendingRequests: Math.min(this.pending.size, 1000), scopeControls: await this.parentScopeControls() };
  }
  async act(action: ExplorationAction, observation: BoardObservation): Promise<BoardCandidate | undefined> {
    const fresh = await this.raw();
    if (pageFingerprint(fresh) !== observation.fingerprint) throw new Error("The page changed before the next step. Read its current controls again.");
    if (hash(await this.parentScopeControls()) !== hash(observation.scopeControls || [])) throw new Error("The saved filters changed before the next step. Read their current values again.");
    const control = observation.page.controls.find(item => item.id === action.targetId);
    if (action.kind === "inspect") {
      const candidate = observation.page.candidates.find(item => item.id === action.targetId);
      if (candidate) return this.inspect(candidate);
      if (control && ["button", "link", "section"].includes(control.kind)) return this.inspectControl(control, observation);
      throw new Error("The job link is no longer on this page.");
    }
    if (action.kind === "document") {
      if (!control || control.kind !== "document") throw new Error("The results document is no longer present.");
      const frames: WebFrameMain[] = [];
      const visit = (parent: WebFrameMain) => { for (const child of parent.frames) { frames.push(child); if (frames.length <= 60) visit(child); } };
      visit(this.window.webContents.mainFrame);
      const selected = frames.filter(frame => !frame.isDestroyed() && frame.url === control.href);
      if (selected.length !== 1) throw new Error("The embedded results could not be identified uniquely.");
      const parent = this.frame || this.window.webContents.mainFrame;
      await parent.executeJavaScript(`(() => { const roots=[document]; for(let i=0;i<roots.length;i++) for(const node of roots[i].querySelectorAll('*')) if(node.shadowRoot) roots.push(node.shadowRoot);
        const frame=roots.flatMap(root=>[...root.querySelectorAll('iframe')]).find(item=>item.getAttribute('data-zebby-explore')===${JSON.stringify(action.targetId)});
        if(!frame) throw new Error('The results frame changed'); frame.style.setProperty('height','650px','important'); frame.style.setProperty('max-height','none','important'); frame.scrollIntoView({block:'center',behavior:'instant'}); })()`);
      this.frame = selected[0]; return;
    }
    if (control?.href) this.allowedTarget = boardUrl(control.href).href;
    if (!await this.execute(action)) throw new Error("That reading action is no longer available. Inspect the current page again.");
    await delay(action.kind === "wait" ? 1200 : 400, undefined, { signal: this.signal });
  }
  private async inspectControl(control: ExplorationControl, observation: BoardObservation) {
    this.inspectionTarget = ""; this.inspectingControl = true;
    const frame = this.frame || this.window.webContents.mainFrame, before = frame.url;
    this.window.webContents.setWindowOpenHandler(({ url }) => { this.rememberInspectionTarget(url); return { action: "deny" }; });
    try {
      if (!await this.execute({ kind: "expand", targetId: control.id, value: "" })) throw new Error("This control cannot be used to read a job.");
      for (let attempt = 0; attempt < 10 && !this.inspectionTarget && !frame.isDestroyed() && frame.url === before; attempt++) await delay(200, undefined, { signal: this.signal });
      if (!this.inspectionTarget && !frame.isDestroyed() && frame.url !== before) this.rememberInspectionTarget(frame.url);
      if (!this.inspectionTarget || this.inspectionTarget === observation.page.url) throw new Error("This control did not expose a unique public job link. Inspect another result or its embedded document.");
      return await this.inspect({ id: control.id, url: this.inspectionTarget, title: "", text: control.context.slice(0, 600) });
    } finally {
      this.inspectingControl = false;
      if (!this.window.isDestroyed()) {
        this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        if (!this.signal.aborted && (frame.isDestroyed() || frame.url !== before)) await this.open(this.source);
      }
    }
  }
  private async inspect(candidate: BoardCandidate): Promise<BoardCandidate> {
    const url = boardUrl(candidate.url);
    if (/\/(apply|application|login|signin)(?:\/|$)/i.test(url.pathname)) throw new Error("This link opens an application form rather than a job description.");
    const detail = new BrowserWindow({ show: false, width: 1280, height: 900,
      webPreferences: { session: this.window.webContents.session, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, devTools: false } });
    detail.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    detail.webContents.on("will-redirect", (event, target) => { if (!sameTarget(target, candidate.url)) event.preventDefault(); });
    const abort = () => { if (!detail.isDestroyed()) detail.destroy(); }; this.signal.addEventListener("abort", abort, { once: true });
    try {
      await Promise.race([detail.loadURL(url.href), delay(15000, undefined, { signal: this.signal }).then(() => { throw new Error("This job description took too long to open."); })]);
      await delay(600, undefined, { signal: this.signal });
      const record = await detail.webContents.executeJavaScript(`(() => {
        const clean=value=>(value||'').replace(/\\s+/g,' ').trim();
        const title=clean(document.querySelector('h1,[itemprop="title"]')?.textContent);
        return {title,text:clean(document.querySelector('main,article')?.textContent||document.body.innerText).slice(0,600)};
      })()`) as { title: string; text: string };
      if (!record.title || /^(apply|sign in|log in|careers|jobs)$/i.test(record.title)) throw new Error("This page did not expose a verifiable job title.");
      return { ...candidate, title: record.title.slice(0, 300), text: record.text };
    } finally { this.signal.removeEventListener("abort", abort); abort(); }
  }
  feeds() { return [...this.observedFeeds.values()]; }
  close() {
    this.epoch++;
    if (this.attached && !this.window.isDestroyed()) {
      this.window.webContents.debugger.removeListener("message", this.networkMessage);
      if (this.window.webContents.debugger.isAttached()) this.window.webContents.debugger.detach();
    }
    this.attached = false; this.active = false;
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}

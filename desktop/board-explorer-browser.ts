import { BrowserWindow, type WebFrameMain } from "electron";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { boardUrl } from "../lib/board-identity";
import type { BoardCandidate, BoardImage } from "../shared/boards";
import type { ExplorationAction, ExplorationControl } from "../shared/board-exploration";
import { actExplorePage, observeExplorePage, type ExplorePage } from "./board-explore-page";

export type ObservedBoardFeed = { id: string; url: string; data: unknown; sample: string };
export type BoardObservation = { page: ExplorePage; image: BoardImage; fingerprint: string; pendingRequests: number };
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
  private networkWork = new Set<Promise<void>>();
  constructor(private window: BrowserWindow, private signal: AbortSignal) {}
  permitsNavigation(target: string) {
    if (!this.active) return false;
    const permitted = target === this.allowedTarget || sameTarget(target, this.source) || this.allowedTarget && sameTarget(target, this.allowedTarget);
    if (!permitted) this.networkError = "The results tried to leave the observed careers page. Open the saved link to verify its destination.";
    return Boolean(permitted);
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
    if (!this.attached) {
      this.window.webContents.debugger.attach("1.3"); this.attached = true;
      this.window.webContents.debugger.on("message", this.networkMessage);
      await this.window.webContents.debugger.sendCommand("Network.enable", { maxTotalBufferSize: 16_000_000, maxResourceBufferSize: 4_000_000 });
    }
    await Promise.race([this.window.loadURL(this.source), delay(30000, undefined, { signal: this.signal }).then(() => { throw new Error("The careers page took too long to open. Resume the check to try again."); })]);
  }
  private async raw(): Promise<ExplorePage> {
    this.signal.throwIfAborted();
    if (this.networkError) throw new Error(this.networkError);
    const frame = this.frame || this.window.webContents.mainFrame;
    if (frame.isDestroyed()) throw new Error("The embedded results were replaced. Resume to read the updated page.");
    const page = await frame.executeJavaScript(`(${observeExplorePage.toString()})()`) as ExplorePage;
    boardUrl(page.url);
    if (page.candidates.length >= 2000 || page.controls.length >= 1000) throw new Error("This page has too many elements to verify in one check. Use a more specific results link.");
    if (page.blocked) throw new Error("This careers page is blocking automated reading. Your last successful check is unchanged. Try its direct job-board link instead.");
    return page;
  }
  private async execute(action: ExplorationAction | { kind: "label" | "unlabel"; targetId: string; value: string }) {
    return (this.frame || this.window.webContents.mainFrame).executeJavaScript(`(${actExplorePage.toString()})(${JSON.stringify(action)})`) as Promise<boolean>;
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
    await (this.frame || this.window.webContents.mainFrame).executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    let data: string;
    try { data = (await this.window.webContents.capturePage()).resize({ width: 1280, height: 900 }).toJPEG(80).toString("base64"); }
    finally { await this.execute({ kind: "unlabel", targetId: "", value: "" }); }
    if (data.length > 1_400_000) throw new Error("This page image is too large to read. Resume from a more specific results link.");
    const after = await this.raw();
    if (pageFingerprint(after) !== pageFingerprint(page)) throw new Error("The job results changed while the page was being captured. Resume to read the updated results.");
    return { page, image: { mediaType: "image/jpeg", data, width: 1280, height: 900 }, fingerprint: pageFingerprint(page), pendingRequests: Math.min(this.pending.size, 1000) };
  }
  async act(action: ExplorationAction, observation: BoardObservation): Promise<BoardCandidate | undefined> {
    const fresh = await this.raw();
    if (pageFingerprint(fresh) !== observation.fingerprint) throw new Error("The page changed before the next step. Read its current controls again.");
    const control = observation.page.controls.find(item => item.id === action.targetId);
    if (action.kind === "inspect") {
      const candidate = observation.page.candidates.find(item => item.id === action.targetId);
      if (!candidate) throw new Error("The job link is no longer on this page.");
      return this.inspect(candidate);
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
  }
}

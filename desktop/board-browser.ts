import { BrowserWindow, session } from "electron";
import { lookup } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { isPublicAddress } from "../lib/public-address";
import { boardUrl } from "../lib/board-identity";
import { actOnBoardPage, captureBoardPage, isFigmaCareers, knownListing, type BoardPage } from "./board-page";
import { boardFeed, readBoardFeed } from "./board-feeds";
import { boardRetryDelay } from "./board-request";
import type { BoardVisualInput, BoardControl } from "../shared/boards";
import { isNetflixSearch, NetflixBoardPages } from "./netflix-board";
import { greenhouseBoard, sameGreenhouseSearch } from "./greenhouse-board";
import { isLyftCareers } from "./lyft-board";
import { BoardExplorerBrowser, type ThoroughBoardReader } from "./board-explorer-browser";

export type BoardDocument = { id: string; url: string; title: string; summary: string };
export type BoardReader = { open(url: string): Promise<void>; read(): Promise<BoardPage>; next(id: string, observed?: BoardControl): Promise<void>; close(): void;
  thorough?: ThoroughBoardReader;
  documents?(): Promise<BoardDocument[]>; selectDocument?(id: string): Promise<void>; visual?(): AsyncGenerator<BoardVisualInput> };
function sameSearch(value: string, saved: string) {
  const current = boardUrl(value), original = boardUrl(saved);
  const path = (url: URL) => url.pathname.replace(/\/page\/\d+\/?$/, "").replace(/\/$/, "");
  const keys = new Set([...original.searchParams.keys(), ...current.searchParams.keys()]);
  return current.origin === original.origin && path(current) === path(original) && current.hash === original.hash &&
    [...keys].every(key => /^(page|pagesize|offset|start|cursor)$/i.test(key) || /^utm_/i.test(key) ||
      current.searchParams.has(key) === original.searchParams.has(key) && current.searchParams.getAll(key).slice().sort().join("\0") === original.searchParams.getAll(key).slice().sort().join("\0"));
}
const pause = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
  signal.addEventListener("abort", abort, { once: true });
});

class BoardWebsiteError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null) {
    super(status === 404 || status === 410
      ? "This board link could not be found. Open it to check the address, then edit the saved link if it has changed."
      : status === 401 || status === 403
        ? "This careers website could not be opened. Open its link to check whether sign-in or a browser check is required."
        : status === 429
          ? "This careers website is limiting requests. Try again later."
          : "This careers website is temporarily unavailable. Try again later.");
  }
}

export class BoardBrowser implements BoardReader {
  readonly thorough: BoardExplorerBrowser;
  private window: BrowserWindow;
  private source = "";
  private frame: Electron.WebFrameMain | null = null;
  private embeddedSource = "";
  private previous = "";
  private navigationError = "";
  private lastPage: BoardPage | null = null;
  private netflix: NetflixBoardPages | null = null;
  private feed: BoardPage | null = null;
  private prefetched: BoardPage | null = null;
  private chosenDocument = false;
  private documentFrames = new Map<string, { frame: Electron.WebFrameMain; source: string }>();
  private screenshots = 0;
  private responses = new Map<string, { status: number; retryAfter: string | null }>();
  private abort: () => void;
  constructor(private signal: AbortSignal) {
    const isolated = session.fromPartition(`boards-${randomUUID()}`, { cache: false });
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.on("will-download", event => event.preventDefault());
    isolated.webRequest.onCompleted(details => {
      if (details.resourceType !== "mainFrame" && details.resourceType !== "subFrame") return;
      const key = Object.keys(details.responseHeaders || {}).find(name => name.toLowerCase() === "retry-after");
      this.responses.set(details.url, { status: details.statusCode, retryAfter: key ? details.responseHeaders?.[key]?.[0] || null : null });
    });
    const checked = new Map<string, boolean>();
    isolated.webRequest.onBeforeRequest((details, callback) => {
      if (signal.aborted) { callback({ cancel: true }); return; }
      if (details.url === "about:blank" && details.resourceType === "mainFrame") { callback({}); return; }
      if (/^(data:|blob:)/.test(details.url) && details.resourceType !== "mainFrame") { callback({}); return; }
      let url: URL;
      try { url = boardUrl(details.url); } catch { callback({ cancel: true }); return; }
      const cached = checked.get(url.hostname);
      if (cached !== undefined) { callback({ cancel: !cached }); return; }
      void lookup(url.hostname, { all: true }).then(addresses => {
        const publicHost = addresses.length > 0 && addresses.every(address => isPublicAddress(address.address));
        checked.set(url.hostname, publicHost); callback({ cancel: !publicHost || signal.aborted });
      }).catch(() => callback({ cancel: true }));
    });
    this.window = new BrowserWindow({ show: false, width: 1280, height: 900,
      webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false,
        webSecurity: true, backgroundThrottling: false, devTools: false } });
    this.thorough = new BoardExplorerBrowser(this.window, signal);
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("did-frame-navigate", (_event, url, status) => {
      this.responses.set(url, { status, retryAfter: this.responses.get(url)?.retryAfter || null });
    });
    const guard = (event: Electron.Event, target: string) => {
      if (this.thorough.active) { if (!this.thorough.permitsNavigation(target)) event.preventDefault(); return; }
      try {
        if (!sameSearch(target, this.source)) throw new Error();
      } catch { event.preventDefault(); this.navigationError = "The board redirected or changed its search filters. Save the direct results link and try again."; }
    };
    this.window.webContents.on("will-navigate", guard);
    this.window.webContents.on("will-redirect", (event, target, _inPlace, isMainFrame) => {
      if (isMainFrame) guard(event, target);
    });
    this.abort = () => this.close(); signal.addEventListener("abort", this.abort, { once: true });
  }
  async open(url: string) {
    this.signal.throwIfAborted();
    const target = boardUrl(url); this.source = target.href;
    this.frame = null; this.embeddedSource = "";
    this.netflix = null; this.lastPage = null; this.previous = ""; this.navigationError = "";
    this.feed = null; this.prefetched = null; this.chosenDocument = false; this.documentFrames.clear(); this.screenshots = 0;
    this.responses.clear();
    if (isNetflixSearch(target)) {
      const isolated = this.window.webContents.session;
      this.netflix = new NetflixBoardPages(target, (input, init) => isolated.fetch(input, init), this.signal);
      return;
    }
    const feed = boardFeed(this.source);
    if (isLyftCareers(target) && !feed) {
      throw new Error("Zebby could not verify the filters in this Lyft link. Use a careers link with category, location, or search filters.");
    }
    if (feed) {
      try { this.feed = await readBoardFeed(feed, (input, init) => this.window.webContents.session.fetch(input, init), this.signal); return; }
      catch {
        this.signal.throwIfAborted();
        // A fresh Lyft page can drop fragment filters and collapse every job.
        // Do not fall back to that different scope after a failed feed read.
        if (feed.kind === "lyft") throw new Error("Lyft's job list could not be verified. Try again later. The last successful check is unchanged.");
        /* Discard the entire feed before trying the rendered page. */
      }
    }
    await this.loadPage();
  }
  private async loadPage() {
    await Promise.race([this.window.loadURL(this.source), pause(30000, this.signal).then(() => { throw new Error("The board took too long to load. Try again."); })]);
  }
  private assertAvailable(page: BoardPage) {
    const response = this.responses.get(page.url);
    if (page.unavailable || response && response.status >= 400) throw new BoardWebsiteError(response && response.status >= 400 ? response.status : 503, response?.retryAfter || null);
  }
  private async snapshot(): Promise<BoardPage> {
    this.signal.throwIfAborted();
    if (this.navigationError) throw new Error(this.navigationError);
    const section = isFigmaCareers(boardUrl(this.source)) ? "job-openings" : "";
    let result: BoardPage = await this.window.webContents.executeJavaScript(`(${captureBoardPage.toString()})(${JSON.stringify(section)})`);
    if (!sameSearch(result.url, this.source)) {
      throw new Error("The board changed its search filters. Save the direct results link and try again.");
    }
    if (result.blocked) throw new Error("This board is asking for a browser check. Open its link and try again later.");
    this.assertAvailable(result);
    if (this.chosenDocument) {
      if (this.frame) {
        if (this.frame.isDestroyed() || !sameSearch(this.frame.url, this.embeddedSource)) throw new Error("The embedded results changed or disappeared. Try the check again.");
        result = await this.frame.executeJavaScript('(' + captureBoardPage.toString() + ')()') as BoardPage;
        if (!sameSearch(result.url, this.embeddedSource)) throw new Error("The embedded results changed their search filters. Try the check again.");
      }
    } else {
    const embedded = result.embeddedBoards || [];
    if (embedded.length > 1) throw new Error("This page contains multiple embedded job boards. Save a direct job board link.");
    if (embedded.length) {
      if (this.embeddedSource && !sameGreenhouseSearch(embedded[0], this.embeddedSource)) {
        throw new Error("The embedded job board changed its search filters. Try the check again.");
      }
      this.embeddedSource ||= embedded[0];
      const frames = this.window.webContents.mainFrame.frames.filter(frame =>
        !frame.isDestroyed() && sameGreenhouseSearch(frame.url, this.embeddedSource));
      if (frames.length > 1) throw new Error("The embedded job board could not be identified. Save its direct results link.");
      this.frame = frames[0] || null;
      if (!this.frame) return { ...result, candidates: [], controls: [], empty: false, expectedTotal: null, loading: true };
      result = await this.frame.executeJavaScript('(' + captureBoardPage.toString() + ')()') as BoardPage;
      if (!sameGreenhouseSearch(result.url, this.embeddedSource)) {
        throw new Error("The embedded job board changed its search filters. Try the check again.");
      }
    } else if (this.embeddedSource) {
      throw new Error("The embedded job list disappeared before the check finished. Try the check again.");
    } else if (result.embeddedBoardPending) {
      return { ...result, candidates: [], controls: [], empty: false, expectedTotal: null, loading: true };
    } else {
      this.frame = null;
    }
    }
    // Navigation and alert links cannot make an unloaded job board look ready.
    if (greenhouseBoard(new URL(result.url)) && !result.empty &&
        !result.candidates.some(candidate => knownListing(candidate.url, result.url))) result.loading = true;
    if (result.candidates.length > 1000 || result.controls.length > 100) throw new Error("This page has too many links to check completely. Save a more specific filtered link.");
    if (result.blocked) throw new Error("This board is asking for a browser check. Open its link and try again later.");
    this.assertAvailable(result);
    return result;
  }
  async read() {
    if (this.prefetched) { const page = this.prefetched; this.prefetched = null; return page; }
    return this.collect();
  }
  private async collect() {
    for (let attempt = 0; ; attempt++) {
      try { return await this.collectPage(); }
      catch (error) {
        this.signal.throwIfAborted();
        // Reload only the initial saved URL. Retrying after pagination or a
        // selected embedded document could silently reset the results scope.
        if (!(error instanceof BoardWebsiteError) || this.lastPage || this.previous || this.frame || this.chosenDocument) throw error;
        const wait = boardRetryDelay(error.status, attempt, error.retryAfter);
        if (wait === null) throw error;
        await pause(wait, this.signal); await this.loadPage();
      }
    }
  }
  private async collectPage() {
    if (this.netflix) return this.netflix.read();
    if (this.feed) return this.feed;
    const started = Date.now();
    let previous = "", stable = 0, result: BoardPage;
    while (true) {
      result = await this.snapshot();
      const signature = JSON.stringify([result.pageNumber, result.candidates.map(item => item.url)]);
      const loaded = !result.loading && (result.candidates.length > 0 || result.empty || result.visualNeeded || result.embeddedDocuments?.length) && signature !== this.previous;
      stable = loaded && signature === previous ? stable + 1 : 0;
      if (stable >= 2) break;
      if (Date.now() - started > 30000) throw new Error("The board's results did not finish loading. Try checking this board again.");
      previous = signature; await pause(500, this.signal);
    }
    const collected = new Map(result.candidates.map(candidate => [candidate.url, candidate]));
    const visualCandidateUrls = new Set(result.visualCandidateUrls);
    let visualNeeded = Boolean(result.visualNeeded);
    let bottomStable = 0, previousHeight = -1, previousCount = -1;
    for (let step = 0; step < 100; step++) {
      this.signal.throwIfAborted();
      await this.action("scroll");
      await pause(350, this.signal);
      result = await this.snapshot();
      for (const candidate of result.candidates) collected.set(candidate.url, candidate);
      for (const url of result.visualCandidateUrls || []) visualCandidateUrls.add(url);
      visualNeeded ||= Boolean(result.visualNeeded);
      if (collected.size > 10000) throw new Error("This board has too many links to check completely. Use a more specific filtered link.");
      bottomStable = result.atBottom && !result.loading && result.height === previousHeight && collected.size === previousCount ? bottomStable + 1 : 0;
      if (bottomStable >= 3) {
        this.lastPage = { ...result, visualNeeded, visualCandidateUrls: [...visualCandidateUrls],
          candidates: [...collected.values()].map((candidate, index) => ({ ...candidate, id: `l${index}` })) };
        const embeddedFeed = this.frame && boardFeed(result.url);
        // Parent query parameters can carry filters sent to the iframe. A feed
        // is safe here only when its total and every observed posting agree.
        if (embeddedFeed && !new URL(this.source).search && result.expectedTotal !== null) {
          try {
            const inventory = await readBoardFeed(embeddedFeed, (input, init) => this.window.webContents.session.fetch(input, init), this.signal);
            const urls = new Set(inventory.candidates.map(item => item.url.replace(/^https:\/\/boards\.greenhouse\.io/, "https://job-boards.greenhouse.io")));
            const observed = this.lastPage.candidates.filter(item => knownListing(item.url, result.url));
            if (inventory.expectedTotal === result.expectedTotal && observed.every(item => urls.has(item.url.split("?")[0].replace(/^https:\/\/boards\.greenhouse\.io/, "https://job-boards.greenhouse.io")))) {
              this.feed = inventory; this.lastPage = inventory;
            }
          } catch { this.signal.throwIfAborted(); }
        }
        return this.lastPage;
      }
      previousHeight = result.height; previousCount = collected.size;
    }
    throw new Error("This board kept loading more results. Use a more specific filtered link.");
  }
  async next(id: string, observed?: BoardControl) {
    if (this.netflix) { this.netflix.next(id); return; }
    if (!/^c\d+$/.test(id)) throw new Error("Invalid pagination control.");
    const before = await this.snapshot();
    const expected = observed || this.lastPage?.controls.find(control => control.id === id);
    if (!expected || !before.controls.some(control => control.id === id && !control.disabled && control.text === expected.text && control.context === expected.context)) throw new Error("The board's next-page control changed. Try the check again.");
    this.previous = JSON.stringify([before.pageNumber, before.candidates.map(item => item.url)]);
    const clicked = await this.action("click", id);
    if (!clicked) throw new Error("The next page could not be opened.");
    await pause(300, this.signal);
  }
  private action(action: Parameters<typeof actOnBoardPage>[0], id = "", visual = false) {
    return (this.frame || this.window.webContents.mainFrame).executeJavaScript(
      '(' + actOnBoardPage.toString() + ')(' + JSON.stringify(action) + ',' + JSON.stringify(id) + ',' + visual + ')');
  }
  async documents(): Promise<BoardDocument[]> {
    const page = await this.collect(); this.prefetched = page;
    if (this.netflix || this.feed || this.frame) return [];
    const documents: BoardDocument[] = [{ id: "d0", url: page.url, title: page.title, summary: page.summary }];
    this.documentFrames.set("d0", { frame: this.window.webContents.mainFrame, source: page.url });
    const walk = async (parent: Electron.WebFrameMain, snapshot: BoardPage, depth: number) => {
      if (depth > 4 && snapshot.embeddedDocuments?.length) throw new Error("This job board has too many embedded layers. Save the direct results link.");
      for (const document of snapshot.embeddedDocuments || []) {
        const frames = parent.frames.filter(frame => !frame.isDestroyed() && sameSearch(frame.url, document.url));
        if (frames.length !== 1) throw new Error("An embedded part of this page did not finish loading. Try again.");
        if (documents.length >= 12) throw new Error("This page has too many embedded documents. Save the direct results link.");
        const frame = frames[0], child = await frame.executeJavaScript('(' + captureBoardPage.toString() + ')()') as BoardPage;
        const id = 'd' + documents.length;
        documents.push({ id, url: child.url, title: child.title, summary: child.summary });
        this.documentFrames.set(id, { frame, source: child.url });
        await walk(frame, child, depth + 1);
      }
    };
    await walk(this.window.webContents.mainFrame, page, 1);
    return documents.length > 1 ? documents : [];
  }
  async selectDocument(id: string) {
    const selected = this.documentFrames.get(id);
    if (!selected || selected.frame.isDestroyed() || !sameSearch(selected.frame.url, selected.source)) throw new Error("The results document changed. Try the check again.");
    this.chosenDocument = true;
    this.frame = id === "d0" ? null : selected.frame;
    this.embeddedSource = id === "d0" ? "" : selected.source;
    if (id !== "d0") { this.prefetched = null; this.previous = ""; await this.action("reset"); }
  }
  async *visual(): AsyncGenerator<BoardVisualInput> {
    if (this.feed || this.netflix) throw new Error("This structured job feed does not need visual reading.");
    const parents: Electron.WebFrameMain[] = [];
    const chain: Electron.WebFrameMain[] = [];
    for (let frame = this.frame; frame?.parent; frame = frame.parent) chain.unshift(frame);
    try {
      // Give an embedded document its own visible scrolling viewport. This
      // preserves its live session and filters, including postMessage state.
      for (const child of chain) {
        const parent = child.parent!;
        const prepared = await parent.executeJavaScript(`((target) => {
          const roots = [document];
          for (let i = 0; i < roots.length; i++) for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
          const frame = roots.flatMap(root => [...root.querySelectorAll('iframe')]).find(node => {
            try { const url = new URL(node.src, location.href), wanted = new URL(target); return url.origin === wanted.origin && url.pathname === wanted.pathname; } catch { return false; }
          });
          if (!frame) return false;
          frame.setAttribute('data-zebby-visual-style', frame.getAttribute('style') || '');
          frame.style.setProperty('height', Math.max(300, Math.min(700, innerHeight - 100)) + 'px', 'important');
          frame.style.setProperty('max-height', 'none', 'important'); frame.style.setProperty('min-height', '0', 'important');
          frame.scrollIntoView({block:'center', inline:'nearest'}); return true;
        })(${JSON.stringify(child.url)})`);
        if (!prepared) throw new Error("The embedded results could not be made visible. Save the direct results link.");
        parents.push(parent);
      }
      await this.snapshot(); await this.action("reset"); await pause(400, this.signal);
      let last = "", unchanged = 0;
      for (let step = 0; step < 24; step++) {
        const page = await this.snapshot();
        if (page.loading) throw new Error("The board is still loading. Try the check again.");
        if (++this.screenshots > 24) throw new Error("This board needs more than 24 visual reads. Save a more specific filtered link.");
        const visible = new Set(page.viewportCandidates || []), controls = new Set(page.viewportControls || []);
        const candidates = page.candidates.filter(item => visible.has(item.id));
        if (candidates.length > 60) throw new Error("Too many job links are visible for a complete visual read. Save a more specific filtered link.");
        await this.action("label");
        await (this.frame || this.window.webContents.mainFrame).executeJavaScript(
          "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const bitmap = (await this.window.webContents.capturePage()).resize({ width: 1280, height: 900 });
        await this.action("unlabel");
        const size = bitmap.getSize(), data = bitmap.toJPEG(80).toString("base64");
        if (data.length > 1_400_000) throw new Error("The board screenshot is too large to read. Try the direct job board link.");
        this.lastPage = page;
        yield { task: "visual", pageUrl: page.url, pageTitle: page.title, summary: page.summary,
          image: { mediaType: "image/jpeg", data, width: size.width, height: size.height }, candidates,
          controls: page.controls.filter(item => controls.has(item.id)), atBottom: page.atBottom, expectedTotal: page.expectedTotal };
        // Recheck after the AI request. A changing inventory must not establish
        // a successful baseline from screenshots of two different result sets.
        const after = await this.snapshot();
        if (JSON.stringify(after.candidates.map(item => item.url)) !== JSON.stringify(page.candidates.map(item => item.url)) || after.expectedTotal !== page.expectedTotal) {
          throw new Error("The board changed during its visual read. Try the check again.");
        }
        if (page.atBottom) return;
        const position = JSON.stringify([page.scrollY, page.height, page.candidates.map(item => item.url)]);
        unchanged = position === last ? unchanged + 1 : 0; last = position;
        if (unchanged >= 2) throw new Error("The remaining job listings could not be scrolled into view. Save the direct results link.");
        await this.action("scroll", "", true); await pause(400, this.signal);
      }
      throw new Error("The visual read could not reach the end of this board. Save a more specific filtered link.");
    } finally {
      if (!this.window.isDestroyed()) {
        await this.action("unlabel").catch(() => undefined);
        for (const parent of parents.reverse()) if (!parent.isDestroyed()) await parent.executeJavaScript(`(() => {
          const roots = [document]; for (let i = 0; i < roots.length; i++) for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
          for (const root of roots) for (const frame of root.querySelectorAll('[data-zebby-visual-style]')) {
            frame.setAttribute('style', frame.getAttribute('data-zebby-visual-style')); frame.removeAttribute('data-zebby-visual-style');
          }
        })()`).catch(() => undefined);
      }
    }
  }
  close() {
    this.thorough.close();
    this.signal.removeEventListener("abort", this.abort);
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}

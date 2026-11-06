import type { BoardCandidate, BoardControl } from "../shared/boards";
import { greenhouseBoard } from "./greenhouse-board";
import { isNetflixPosition, isNetflixSearch } from "./netflix-board";

export type BoardPage = { url: string; title: string; summary: string; candidates: BoardCandidate[]; controls: BoardControl[];
  expectedTotal: number | null; pageNumber: number | null; pageCount: number | null;
  embeddedBoards?: string[]; embeddedBoardPending?: boolean;
  embeddedDocuments?: { id: string; url: string; title: string }[];
  layer?: "structured" | "dom"; complete?: boolean; visualNeeded?: boolean;
  viewportCandidates?: string[]; viewportControls?: string[];
  empty: boolean; loading: boolean; blocked: boolean; atBottom: boolean; scrollY: number; height: number };

// Serialized into an isolated webContents. Keep this function self-contained.
export function captureBoardPage(sectionId?: string): BoardPage {
  const visible = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  const clean = (text: string | null, limit: number) => (text || "").replace(/\s+/g, " ").trim().slice(0, limit);
  const root = sectionId ? document.getElementById(sectionId) : document.body;
  const roots: (Element | ShadowRoot)[] = root ? [root] : [];
  for (let index = 0; index < roots.length; index++) {
    for (const node of roots[index].querySelectorAll("*")) if (node.shadowRoot) roots.push(node.shadowRoot);
    if (roots.length > 100) throw new Error("This page has too many embedded components to read completely.");
  }
  const query = <T extends Element>(selector: string) => roots.flatMap(part => [...part.querySelectorAll<T>(selector)]);
  const parent = (element: Element): Element | null => element.parentElement || (element.getRootNode() instanceof ShadowRoot ? (element.getRootNode() as ShadowRoot).host : null);
  const inViewport = (element: Element) => {
    const rect = element.getBoundingClientRect();
    if (!visible(element) || !rect.width || !rect.height || rect.top >= innerHeight || rect.bottom <= 0 || rect.left >= innerWidth || rect.right <= 0) return false;
    for (let ancestor = parent(element); ancestor; ancestor = parent(ancestor)) {
      if (!/auto|scroll|hidden|clip/.test(getComputedStyle(ancestor).overflowY)) continue;
      const clip = ancestor.getBoundingClientRect();
      if (rect.top >= clip.bottom || rect.bottom <= clip.top || rect.left >= clip.right || rect.right <= clip.left) return false;
    }
    return true;
  };
  const text = roots.map(part => part instanceof ShadowRoot ? part.textContent || "" : (part as HTMLElement).innerText || "").join("\n");
  function departmentFor(link: HTMLAnchorElement, row: HTMLElement, title: string) {
    const explicit = link.closest("[data-department]")?.getAttribute("data-department") ||
      row.querySelector<HTMLElement>('[itemprop="occupationalCategory"], [data-testid="job-department"]')?.innerText;
    if (explicit) return clean(explicit, 200);
    const headings = 'h2,h3,h4,h5,h6,[role="heading"]';
    for (let branch: Element | null = link; branch && branch !== root && !branch.matches("main,body"); branch = parent(branch)) {
      // A heading immediately before the job list owns its links. An adjacent
      // job card or a heading inside another link belongs to a different role.
      const previous = branch.previousElementSibling;
      const heading = previous?.matches(headings) ? previous : previous?.matches("header") ? previous.querySelector(headings) : null;
      if (heading && visible(heading) && !heading.querySelector("a[href]")) {
        const label = clean(heading.textContent, 200);
        if (label && label !== title) return label;
      }
    }
    return "";
  }
  const candidates: BoardCandidate[] = [];
  const viewportCandidates: string[] = [], viewportControls: string[] = [];
  let opaque = query("canvas").some(element => visible(element) && !element.closest("nav,header,footer"));
  const urls = new Map<string, string>();
  for (const element of query<HTMLElement>("[data-zebby-board-link],[data-zebby-board-control],[data-zebby-board-scroll]")) {
    element.removeAttribute("data-zebby-board-link"); element.removeAttribute("data-zebby-board-scroll");
  }
  for (const element of query<HTMLElement>("a[href], [role=link][data-href], [role=link][data-url]")) {
    if (!visible(element)) continue;
    try {
      const url = new URL(element.getAttribute("href") || element.getAttribute("data-href") || element.getAttribute("data-url") || "", location.href);
      if (url.protocol !== "https:" || url.username || url.password || url.port) continue;
      const duplicate = urls.get(url.href);
      if (duplicate) {
        element.setAttribute("data-zebby-board-link", duplicate);
        if (inViewport(element) && !viewportCandidates.includes(duplicate)) viewportCandidates.push(duplicate);
        continue;
      }
      const title = clean(element.querySelector<HTMLElement>('h2,h3,h4,[itemprop="title"]')?.innerText || element.innerText || element.getAttribute("aria-label"), 300);
      const row = element.closest<HTMLElement>('li,tr,article,[role="listitem"]') || element.parentElement || element;
      const rowText = row.querySelectorAll("a[href]").length <= 1 ? row.innerText : element.innerText;
      const id = `l${candidates.length}`;
      urls.set(url.href, id);
      element.setAttribute("data-zebby-board-link", id);
      if (inViewport(element)) viewportCandidates.push(id);
      if (!title && !element.closest("nav,header,footer") && element.querySelector("img,svg,canvas")) opaque = true;
      candidates.push({ id, url: url.href, title, department: departmentFor(element as HTMLAnchorElement, row, title),
        text: clean(`${element.getAttribute("aria-label") || ""} ${rowText}`, 600) });
    } catch { /* Invalid links cannot be listing candidates. */ }
  }
  const controls: BoardControl[] = [];
  const controlIds = new Set<string>();
  let controlSequence = Number(document.documentElement.getAttribute("data-zebby-control-sequence")) || 0;
  for (const element of query<HTMLElement>("button, [role=button], a[href], [role=link][data-href]")) {
    if (!visible(element)) continue;
    const label = clean(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.innerText}`, 300);
    const parentText = element.parentElement?.innerText || "";
    const surroundingText = element.parentElement?.parentElement?.innerText || "";
    const context = clean(/page\s+\d+\s+(?:of|\/)\s*\d+/i.test(surroundingText) ? surroundingText : parentText, 700);
    const pagination = Boolean(element.closest('nav[aria-label*="agin"], [role=navigation], [class*="pagination"], [data-testid*="pagination"]'));
    const unlabeled = !label && element.matches("button,[role=button]") && Boolean(element.querySelector("svg,img")) && !element.closest("header,footer");
    if (!pagination && !unlabeled && !/\b(?:next|more|load)\b|^forward$|^\d+$/i.test(label) && !/page\s+\d+\s+(?:of|\/)\s*\d+/i.test(context)) continue;
    let id = element.getAttribute("data-zebby-board-control") || "";
    if (!/^c\d+$/.test(id) || controlIds.has(id)) id = `c${controlSequence++}`;
    controlIds.add(id);
    element.setAttribute("data-zebby-board-control", id);
    if (inViewport(element)) viewportControls.push(id);
    controls.push({ id, text: label, context,
      disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true" });
  }
  document.documentElement.setAttribute("data-zebby-control-sequence", String(controlSequence));
  const page = text.match(/page\s+(\d+)\s+(?:of|\/)\s*(\d+)/i);
  const total = text.match(/\b(\d[\d,]*)\s+(?:open (?:jobs?|positions?|roles?)|items|jobs found|jobs available|results found|results|jobs?)\b/i);
  const pageLinks = query<HTMLAnchorElement>('a[href]').filter(visible).map(link => {
    try { const url = new URL(link.href); return url.origin === location.origin && url.pathname === location.pathname ? Number(url.searchParams.get("page")) : 0; }
    catch { return 0; }
  }).filter(value => Number.isSafeInteger(value) && value > 0);
  const empty = /\b(no (?:open |matching |available )?(?:jobs|positions|results)|0 (?:open (?:jobs|positions|roles)|items|jobs|results))\b/i.test(text);
  // Embedded boards are separate documents, including cross-origin documents.
  // Report visible Greenhouse board frames so the browser can read their real DOM.
  const isGreenhouseEmbed = (value: string) => {
    try { const url = new URL(value, location.href);
      return url.protocol === "https:" && !url.username && !url.password && !url.port &&
        ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname) &&
        /^\/embed\/job_board\/?$/.test(url.pathname) && /^[\w-]+$/.test(url.searchParams.get("for") || "");
    } catch { return false; }
  };
  const embeddedDocuments = query<HTMLIFrameElement>("iframe[src]").filter(visible).flatMap((frame, index) => {
    try {
      const url = new URL(frame.src);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return [];
      const id = `f${index}`; frame.setAttribute("data-zebby-board-frame", id);
      return [{ id, url: url.href, title: clean(frame.title, 300) }];
    } catch { return []; }
  });
  const embeddedBoards = embeddedDocuments.map(frame => frame.url).filter(isGreenhouseEmbed);
  const embeddedBoardPending = !embeddedBoards.length && [...document.scripts].some(script =>
    isGreenhouseEmbed(script.src.replace(/\/js(?=\?|$)/, "")));
  const scrollable = query<HTMLElement>("*").filter(element => visible(element) && element.clientHeight > 100 &&
    element.scrollHeight > element.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(element).overflowY) &&
    !element.closest("nav,header,footer") && element.querySelector("a[href],[role=link],canvas"));
  for (const [index, element] of scrollable.entries()) element.setAttribute("data-zebby-board-scroll", String(index));
  const height = document.documentElement.scrollHeight + scrollable.reduce((sum, element) => sum + element.scrollHeight, 0);
  return { url: location.href, title: document.title.slice(0, 300),
    summary: (text.slice(0, 1500) + "\n" + text.slice(-2500)).slice(0, 4000), candidates, controls,
    expectedTotal: total ? Number(total[1].replace(/,/g, "")) : empty ? 0 : null,
    pageNumber: page ? Number(page[1]) : pageLinks.length ? Number(new URL(location.href).searchParams.get("page")) || 1 : null,
    pageCount: page ? Number(page[2]) : pageLinks.length ? Math.max(...pageLinks) : null,
    embeddedBoards, embeddedBoardPending, embeddedDocuments, viewportCandidates, viewportControls, layer: "dom", visualNeeded: opaque,
    empty, loading: /\bloading (?:jobs|results|opportunities)/i.test(text),
    blocked: /\b(verify (?:that )?you are human|unusual traffic|access denied|checking your browser|complete the captcha)\b/i.test(document.body?.innerText || ""),
    atBottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8 &&
      scrollable.every(element => element.scrollTop + element.clientHeight >= element.scrollHeight - 8),
    scrollY: window.scrollY + scrollable.reduce((sum, element) => sum + element.scrollTop, 0), height };
}

// The same composed-document traversal is used for scrolling and validated clicks.
export function actOnBoardPage(action: "scroll" | "reset" | "click" | "label" | "unlabel", id = "", visual = false) {
  const roots: (Document | ShadowRoot)[] = [document];
  for (let at = 0; at < roots.length; at++) for (const element of roots[at].querySelectorAll("*")) if (element.shadowRoot) roots.push(element.shadowRoot);
  const elements = (selector: string) => roots.flatMap(root => [...root.querySelectorAll<HTMLElement>(selector)]);
  if (action === "click") {
    const control = elements("[data-zebby-board-control]").find(element => element.getAttribute("data-zebby-board-control") === id);
    if (!control || control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") return false;
    control.click(); return true;
  }
  if (action === "label" || action === "unlabel") {
    document.getElementById("zebby-visual-labels")?.remove();
    if (action === "unlabel") return true;
    const overlay = document.createElement("div"); overlay.id = "zebby-visual-labels";
    overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    for (const element of elements("[data-zebby-board-link],[data-zebby-board-control]")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
      const label = document.createElement("span");
      label.textContent = [element.getAttribute("data-zebby-board-link"), element.getAttribute("data-zebby-board-control")].filter(Boolean).join(" ");
      label.style.cssText = `position:absolute;left:${Math.max(0, rect.left)}px;top:${Math.max(0, rect.top - 14)}px;background:#fff;color:#111;border:1px solid #111;font:12px monospace;padding:0 2px;line-height:14px`;
      overlay.append(label);
    }
    document.documentElement.append(overlay); return true;
  }
  const containers = elements("[data-zebby-board-scroll]");
  if (action === "reset") { window.scrollTo(0, 0); for (const element of containers) element.scrollTop = 0; return true; }
  let innerScroll = false;
  for (const element of containers) {
    const rect = element.getBoundingClientRect();
    if (visual && (rect.top < 0 || rect.bottom > innerHeight)) continue;
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 8) {
      element.scrollBy(0, Math.max(100, element.clientHeight * .75)); innerScroll = true;
    }
  }
  if (!visual || !innerScroll) window.scrollBy(0, Math.max(100, innerHeight * .75));
  return true;
}

export function isFigmaCareers(url: URL) {
  return ["www.figma.com", "figma.com"].includes(url.hostname) && /^\/careers\/?$/.test(url.pathname);
}

export function knownListing(url: string, board: string): boolean | null {
  const source = new URL(board), link = new URL(url);
  if (isNetflixSearch(source)) return isNetflixPosition(link);
  const greenhouse = greenhouseBoard(source);
  if (greenhouse) return ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(link.hostname) &&
    link.protocol === "https:" && !link.username && !link.password && !link.port &&
    link.pathname.split("/")[1] === greenhouse && /^\/[\w-]+\/jobs\/\d+\/?$/.test(link.pathname);
  if (isFigmaCareers(source) && ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(link.hostname) &&
      /^\/figma\/jobs\/\d+\/?$/.test(link.pathname)) return true;
  if (source.hostname === "slack.com") return link.hostname.endsWith(".myworkdayjobs.com") && /\/Slack\/job\//.test(link.pathname);
  if (source.hostname === "jobs.uber.com") return link.hostname === source.hostname && /\/jobs\/\d+\/?$/.test(link.pathname);
  if (["www.metacareers.com", "metacareers.com"].includes(source.hostname)) {
    return /^(www\.)?metacareers\.com$/.test(link.hostname) && /\/job_details\/\d+\/?$/.test(link.pathname);
  }
  return null;
}

export function knownNext(page: BoardPage): string | null {
  if (page.layer === "structured" && page.complete) return "";
  const source = new URL(page.url), host = source.hostname;
  if (isNetflixSearch(source)) return page.controls[0]?.id || "";
  if (greenhouseBoard(source)) {
    const next = page.controls.find(control => /\bnext page\b/i.test(control.text) && !control.disabled);
    if (!next && page.pageNumber && page.pageCount && page.pageNumber < page.pageCount) {
      throw new Error("The next page of this job board could not be found. Try the check again.");
    }
    return next?.id || "";
  }
  if (isFigmaCareers(new URL(page.url)) && !page.controls.length && !(page.pageCount && (page.pageNumber || 1) < page.pageCount)) return "";
  if (host === "slack.com") return "";
  if (host === "jobs.uber.com") {
    const next = page.controls.find(control => /next page/i.test(control.text) && !control.disabled)?.id || "";
    if (!next && page.pageNumber && page.pageCount && page.pageNumber < page.pageCount) throw new Error("The next page of Uber jobs could not be found.");
    return next;
  }
  if (["www.metacareers.com", "metacareers.com"].includes(host)) {
    if (!page.pageNumber || !page.pageCount) throw new Error("Meta's results did not finish loading. Try the check again.");
    if (page.pageNumber >= page.pageCount) return "";
    const controls = page.controls.filter(control => /page\s+\d+\s+of\s+\d+/i.test(control.context) && !control.disabled);
    const next = controls.at(-1);
    if (!next) throw new Error("The next page of Meta jobs could not be found.");
    return next.id;
  }
  return null;
}

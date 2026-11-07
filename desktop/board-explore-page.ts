import type { BoardCandidate } from "../shared/boards";
import type { ExplorationAction, ExplorationControl } from "../shared/board-exploration";

export type ExplorePage = { url: string; title: string; summary: string; candidates: BoardCandidate[]; controls: ExplorationControl[];
  viewportIds: string[]; counters: { id: string; text: string }[]; atBottom: boolean; loading: boolean; blocked: boolean;
  height: number; scrollY: number; sections: string[] };

// Executed in the isolated page. No page-provided code or selectors are evaluated.
export function observeExplorePage(desiredValues: string[] = []): ExplorePage {
  const roots: (Document | ShadowRoot)[] = [document];
  for (let at = 0; at < roots.length; at++) for (const node of roots[at].querySelectorAll("*")) {
    if (node.shadowRoot && roots.length < 100) roots.push(node.shadowRoot);
  }
  const query = <T extends Element>(selector: string) => roots.flatMap(root => [...root.querySelectorAll<T>(selector)]);
  const clean = (value: string | null | undefined, limit = 300) => (value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  const wanted = new Set(desiredValues.map(value => clean(value, 500).toLowerCase()));
  const accessibleName = (element: HTMLElement) => {
    const labelledBy = (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map(id => element.getRootNode() instanceof ShadowRoot
      ? (element.getRootNode() as ShadowRoot).getElementById(id)?.textContent : document.getElementById(id)?.textContent).filter(Boolean).join(" ");
    const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? [...element.labels || []].map(label => label.textContent).join(" ") : "";
    return clean(element.getAttribute("aria-label") || labelledBy || labels || element.getAttribute("title") || element.innerText || element.getAttribute("placeholder") || element.getAttribute("name"));
  };
  const shown = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest('[inert],[aria-hidden="true"]');
  const inView = (element: Element) => {
    if (!shown(element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (!/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) continue;
      const clip = parent.getBoundingClientRect(); if (rect.bottom <= clip.top || rect.top >= clip.bottom) return false;
    }
    return true;
  };
  let sequence = Number(document.documentElement.getAttribute("data-zebby-explore-sequence")) || 0;
  const used = new Set<string>();
  const identify = (element: Element) => {
    let id = element.getAttribute("data-zebby-explore") || "";
    if (!/^e\d+$/.test(id) || used.has(id)) id = "e" + sequence++;
    used.add(id); element.setAttribute("data-zebby-explore", id); return id;
  };
  const candidates: BoardCandidate[] = [], controls: ExplorationControl[] = [], viewportIds: string[] = [], urls = new Set<string>();
  for (const link of query<HTMLElement>('a[href],[role="link"][data-href],[role="link"][data-url]')) {
    if (!shown(link)) continue;
    try {
      const url = new URL(link.getAttribute("href") || link.getAttribute("data-href") || link.getAttribute("data-url") || "", location.href);
      if (url.protocol !== "https:" || url.username || url.password || url.port || urls.has(url.href)) continue;
      urls.add(url.href); const id = identify(link);
      let title = clean(link.querySelector<HTMLElement>('h1,h2,h3,h4,[itemprop="title"]')?.innerText || link.innerText || link.getAttribute("aria-label"));
      let row = link.closest<HTMLElement>('article,li,tr,[role="listitem"]') || link.parentElement;
      if (/^(apply(?: now)?|view (?:job|details)|learn more)$/i.test(title) && row) {
        const destinations = new Set([...row.querySelectorAll<HTMLAnchorElement>("a[href]")].map(item => item.href));
        const heading = row.querySelector<HTMLElement>('h1,h2,h3,h4,[itemprop="title"]');
        if (destinations.size === 1 && heading) title = clean(heading.innerText);
      }
      if (row && row.querySelectorAll("a[href]").length > 2) row = link;
      candidates.push({ id, url: url.href, title, text: clean(row?.innerText || link.innerText, 600) });
      if (inView(link)) viewportIds.push(id);
    } catch { /* Non-HTTPS and malformed links are not job evidence. */ }
  }
  for (const element of query<HTMLElement>('button,summary,select,input:not([type="hidden"]):not([type="password"]):not([type="file"]),[role="button"],[role="combobox"],[role="option"],[aria-selected="true"],[aria-checked="true"],[aria-pressed="true"],a[href],iframe[src]')) {
    if (!shown(element)) continue;
    const href = element instanceof HTMLAnchorElement ? element.href : element instanceof HTMLIFrameElement ? element.src : "";
    const name = accessibleName(element);
    if (element instanceof HTMLAnchorElement && !/^#/.test(element.getAttribute("href") || "") &&
        !/\b(next|more|load|previous|jobs|careers|openings)\b/i.test(name) && !element.closest('nav[aria-label*="agin"],[class*="pagination"]')) continue;
    const expanded = element.getAttribute("aria-expanded");
    const section = element.matches("summary") || expanded !== null || Boolean(element.querySelector("h2,h3,h4"));
    const kind: ExplorationControl["kind"] = element instanceof HTMLIFrameElement ? "document" : element instanceof HTMLSelectElement ? "select" :
      element instanceof HTMLInputElement ? "input" : element.getAttribute("role") === "option" ? "option" : section ? "section" :
        element instanceof HTMLAnchorElement ? "link" : "button";
    const existing = element.getAttribute("data-zebby-explore");
    const id = existing && used.has(existing) ? existing : identify(element);
    const value = element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element.value :
      element.getAttribute("aria-valuetext") || element.getAttribute("data-value") || "";
    controls.push({ id, role: ["aria-selected", "aria-checked", "aria-pressed"].some(attribute => element.getAttribute(attribute) === "true") ? "selected" : element.getAttribute("role") || element.tagName.toLowerCase(),
      name, kind, context: clean(element.parentElement?.innerText, 700), value: clean(value, 500), href: href.slice(0, 4000),
      disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true", visible: inView(element),
      expanded: expanded !== null ? expanded === "true" : element.matches("summary") ? element.parentElement?.hasAttribute("open") || false :
        section ? Boolean([...element.parentElement?.querySelectorAll("a[href]") || []].some(shown)) : null,
      options: element instanceof HTMLSelectElement ? [...element.options].sort((left, right) => Number(right.selected || wanted.has(clean(right.value, 500).toLowerCase()) || wanted.has(clean(right.label).toLowerCase())) -
        Number(left.selected || wanted.has(clean(left.value, 500).toLowerCase()) || wanted.has(clean(left.label).toLowerCase()))).slice(0, 60).map(option => ({ value: clean(option.value, 500), label: clean(option.label), selected: option.selected })) : [],
    });
  }
  for (const element of query<HTMLElement>("*")) {
    if (!shown(element) || element.clientHeight < 120 || element.scrollHeight <= element.clientHeight + 8 ||
        !/auto|scroll/.test(getComputedStyle(element).overflowY) || !element.querySelector("a[href],[role=option],canvas") || element.closest("header,footer,nav")) continue;
    const id = identify(element);
    controls.push({ id, name: clean(element.getAttribute("aria-label") || "Scrollable results"), role: "scroll", kind: "scroll", context: clean(element.innerText, 700),
      value: `${Math.round(element.scrollTop)}/${element.scrollHeight - element.clientHeight}`, href: "", disabled: false, visible: inView(element), expanded: null, options: [] });
  }
  document.documentElement.setAttribute("data-zebby-explore-sequence", String(sequence));
  const texts = roots.map(root => root instanceof Document ? root.body?.innerText || "" : root.textContent || "");
  const body = texts.join("\n"), counters: { id: string; text: string }[] = [], counts = new Set<string>();
  for (const node of query<HTMLElement>('p,h1,h2,h3,[role="status"],[aria-live],span')) {
    const text = clean(node.innerText);
    if (!shown(node) || text.length > 250 || !/\b\d[\d,]*\s+(?:of\s+\d[\d,]*\s+)?(?:open |matching |available )?(?:jobs|positions|results|openings)\b/i.test(text) || counts.has(text)) continue;
    counts.add(text); counters.push({ id: "t" + counters.length, text }); if (counters.length >= 20) break;
  }
  const scrolls = controls.filter(control => control.kind === "scroll");
  return { url: location.href, title: clean(document.title), summary: (body.slice(0, 3500) + "\n" + body.slice(-2500)).slice(0, 6000),
    candidates: candidates.slice(0, 2000), controls: controls.slice(0, 1000), viewportIds, counters,
    atBottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8 && scrolls.every(control => {
      const [current, max] = control.value.split("/").map(Number); return current >= max - 8;
    }), loading: document.readyState !== "complete" || query('[aria-busy="true"],[role="progressbar"],progress').some(shown) || /\bloading (?:jobs|results|opportunities)/i.test(body),
    blocked: /\b(verify (?:that )?you are human|unusual traffic|access denied|checking your browser|complete the captcha)\b/i.test(body),
    height: document.documentElement.scrollHeight, scrollY: window.scrollY,
    sections: controls.filter(control => control.kind === "section" && control.expanded === false).map(control => control.id) };
}

export function actExplorePage(action: ExplorationAction | { kind: "label" | "unlabel"; targetId: string; value: string }, desiredValues: string[] = []): boolean {
  const roots: (Document | ShadowRoot)[] = [document];
  for (let at = 0; at < roots.length; at++) for (const node of roots[at].querySelectorAll("*")) if (node.shadowRoot && roots.length < 100) roots.push(node.shadowRoot);
  const find = (id: string) => roots.flatMap(root => [...root.querySelectorAll<HTMLElement>("[data-zebby-explore]")]).find(item => item.getAttribute("data-zebby-explore") === id);
  const overlay = document.getElementById("zebby-explore-labels");
  if (action.kind === "unlabel") { overlay?.remove(); return true; }
  if (action.kind === "label") {
    overlay?.remove(); const layer = document.createElement("div"); layer.id = "zebby-explore-labels";
    layer.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    for (const root of roots) for (const element of root.querySelectorAll<HTMLElement>("[data-zebby-explore]")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth || getComputedStyle(element).visibility === "hidden") continue;
      const label = document.createElement("span"); label.textContent = element.getAttribute("data-zebby-explore");
      label.style.cssText = `position:absolute;left:${Math.max(0, rect.left)}px;top:${Math.max(0, rect.top)}px;background:white;color:black;border:1px solid black;font:12px monospace;padding:1px 3px`;
      layer.append(label);
    }
    document.documentElement.append(layer); return true;
  }
  if (action.kind === "wait" || action.kind === "finish") return true;
  const element = action.targetId ? find(action.targetId) : null;
  if (action.kind === "scroll") {
    if (element) element.scrollTo({ top: action.value === "top" ? 0 : element.scrollTop + element.clientHeight * .75, behavior: "instant" });
    else window.scrollTo({ top: action.value === "top" ? 0 : window.scrollY + innerHeight * .75, behavior: "instant" });
    return true;
  }
  if (!element || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
  const name = element.getAttribute("aria-label") || element.innerText || "";
  if (/\b(apply|submit|purchase|checkout|upload|sign in|log in|register|delete)\b/i.test(name) ||
      element instanceof HTMLButtonElement && element.type === "submit" && element.closest("form")) return false;
  if (action.kind === "select" && element instanceof HTMLSelectElement) {
    if (![...element.options].some(option => option.value === action.value)) return false;
    if (element.multiple) {
      const desired = new Set(desiredValues.map(value => value.trim().toLowerCase()));
      for (const option of element.options) option.selected = desired.has(option.value.trim().toLowerCase()) || desired.has(option.label.trim().toLowerCase());
    } else element.value = action.value;
    element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); return true;
  }
  if (action.kind === "fill" && element instanceof HTMLInputElement && !["password", "file", "hidden"].includes(element.type)) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, action.value);
    element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); return true;
  }
  if (action.kind === "dismiss" && !/\b(close|dismiss|reject|decline)\b|continue without/i.test(name)) return false;
  if (["expand", "next", "choose", "dismiss"].includes(action.kind)) { element.scrollIntoView({ block: "center", behavior: "instant" }); element.click(); return true; }
  return false;
}

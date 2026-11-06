import { boardJobIdentity } from "../lib/board-identity";
import { isNetflixSearch } from "./netflix-board";
import { greenhouseBoard } from "./greenhouse-board";
import { BOARD_VISION_MESSAGE, boardCreditError, validatedBoardExtraction, type BoardCandidate, type BoardControl, type BoardExtractionInput, type BoardScan } from "../shared/boards";
import { isFigmaCareers, knownListing, knownNext, type BoardPage } from "./board-page";
import type { BoardReader } from "./board-browser";

export type BoardExtractor = (input: BoardExtractionInput, signal: AbortSignal) => Promise<unknown>;

// Only narrow an unambiguous instruction to a heading the reader actually saw.
// Compound or open-ended instructions go to the model with the full inventory.
function normalizeHeading(text: string) { return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
function requestedHeading(criteria: string, candidates: Iterable<BoardCandidate>) {
  const words = normalizeHeading(criteria);
  if (/\b(?:also|or|elsewhere|outside|otherwise|except|regardless|instead)\b/.test(words)) return "";
  const command = /^(?:when [^,.;!?]+,\s*)?(?:please )?(?:only )?(?:look|search|track|check|find|monitor|watch)(?: only)?(?: (?:jobs|roles|openings)(?: (?:listed|grouped|shown))?)? (?:under|within|in) (?:the )?(.+?) (?:heading|section|department)(?: for [^.;!?]+)?[.!]?$/;
  const named = command.exec(words)?.[1]?.replace(/^["'“‘]|["'”’]$/g, "");
  if (!named) return "";
  for (const candidate of candidates) {
    if (candidate.department && normalizeHeading(candidate.department) === named) return named;
  }
  return "";
}

export async function scanBoard(options: { url: string; reader: BoardReader; extract: BoardExtractor; signal: AbortSignal;
  provider: string; model: string; instructions?: string; knownMatches?: ReadonlyMap<string, boolean>;
  canUseVision?: () => Promise<boolean>; batchSize?: number; progress(message: string, phase: "reading" | "extracting"): void }): Promise<BoardScan> {
  const { reader, signal } = options;
  const jobs = new Map<string, BoardCandidate>(), expected = new Set<string>(), pageSignatures = new Set<string>();
  const size = Math.max(1, Math.min(options.batchSize || 40, 60));
  let expectedTotal: number | null = null, page: BoardPage | null = null, pages = 0, explicitlyEmpty = false;
  async function extract<T extends BoardExtractionInput>(input: T) {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      try { return validatedBoardExtraction(await options.extract(input, signal), input); }
      catch (error) { signal.throwIfAborted(); if (boardCreditError(error)) throw error; last = error; }
    }
    throw last;
  }
  function total(value: number | null) {
    if (value === null) return;
    if (expectedTotal !== null && expectedTotal !== value) throw new Error("The board's result count changed during this check. Try again.");
    expectedTotal = value;
  }
  const add = (candidate: BoardCandidate) => jobs.set(boardJobIdentity(candidate.url).key, candidate);
  try {
    await reader.open(options.url);
    const documents = await reader.documents?.();
    if (documents?.length) {
      options.progress("Finding the job results", "extracting");
      const result = await extract({ task: "document", pageUrl: options.url, documents });
      if (!result.documentId || !reader.selectDocument) throw new Error("The job results could not be identified on this page. Save the direct job board link.");
      await reader.selectDocument(result.documentId);
    }
    while (pages < 100) {
      signal.throwIfAborted(); options.progress("Reading page " + (pages + 1), "reading");
      const previousPage = page?.pageNumber;
      page = await reader.read(); pages++;
      if (previousPage && page.pageNumber && page.pageNumber !== previousPage + 1) throw new Error("The board skipped a results page. Try the check again.");
      const signature = JSON.stringify(page.candidates.map(candidate => candidate.url).sort());
      if (pageSignatures.has(signature)) throw new Error("The board repeated a results page. Try the check again.");
      pageSignatures.add(signature); total(page.expectedTotal); explicitlyEmpty ||= page.empty;
      const source = new URL(page.url);
      const trusted = page.layer === "structured" && page.complete || isFigmaCareers(source) || isNetflixSearch(source) || Boolean(greenhouseBoard(source));
      const unknown: BoardCandidate[] = [];
      for (const candidate of page.candidates) {
        const known = knownListing(candidate.url, page.url);
        if (known || page.layer === "structured" && page.complete) expected.add(boardJobIdentity(candidate.url).key);
        if (trusted && (known || page.layer === "structured" && page.complete)) add(candidate);
        else if (known !== false) unknown.push(candidate);
      }
      let needsVisual = Boolean(page.visualNeeded), next = knownNext(page);
      for (let index = 0; index < unknown.length; index += size) {
        options.progress("Identifying listings " + Math.min(index + size, unknown.length) + " of " + unknown.length, "extracting");
        const batch = unknown.slice(index, index + size);
        if (knownListing(page.url, page.url) !== null) {
          const result = await extract({ task: "listings", pageUrl: page.url, pageTitle: page.title,
            summary: page.summary, candidates: batch, controls: [], expectedListingCount: batch.length });
          for (const candidate of batch) if (result.listingIds.includes(candidate.id)) add(candidate);
        } else {
          const result = await extract({ task: "inventory", pageUrl: page.url, pageTitle: page.title, candidates: batch });
          for (const candidate of batch) {
            if (result.decisions[candidate.id] === "listing") add(candidate);
            if (result.decisions[candidate.id] === "uncertain") needsVisual = true;
          }
        }
      }
      if (next === null) {
        if (!page.controls.length) next = "";
        else {
          options.progress("Reading navigation on page " + pages, "extracting");
          const result = await extract({ task: "navigation", pageUrl: page.url, pageTitle: page.title, summary: page.summary,
            candidates: [], controls: page.controls, expectedListingCount: 0 });
          next = result.nextControlId;
          if (!next && page.controls.some(control => !control.disabled && (!control.text.trim() || /\bnext\b|load more (?:jobs|results)|show more (?:jobs|results)/i.test(control.text)))) needsVisual = true;
        }
      }
      if (!next && (page.pageNumber && page.pageCount && page.pageNumber < page.pageCount ||
          expectedTotal !== null && jobs.size < expectedTotal || !jobs.size && !explicitlyEmpty)) needsVisual = true;
      let nextEvidence: BoardControl | undefined = page.controls.find(control => control.id === next);
      if (needsVisual) {
        if (!reader.visual) {
          if (expectedTotal !== null && jobs.size !== expectedTotal) throw new Error("Only " + jobs.size + " of " + expectedTotal + " listings could be verified. Try the check again.");
          throw new Error("The selected model could not identify every results page. Try another model in Settings.");
        }
        if (options.canUseVision && !await options.canUseVision()) throw new Error(BOARD_VISION_MESSAGE);
        const covered = new Set<string>();
        let visualNext = "", ended = false, viewports = 0;
        for await (const input of reader.visual()) {
          signal.throwIfAborted(); options.progress("Reading the page visually, view " + (++viewports), "extracting");
          const result = await extract(input);
          for (const candidate of input.candidates) covered.add(candidate.url);
          for (const listing of result.listings) {
            const candidate = input.candidates.find(item => item.id === listing.id)!;
            add({ ...candidate, title: listing.title, department: listing.department || candidate.department,
              location: listing.location || candidate.location, text: [listing.title, listing.department, listing.location].filter(Boolean).join(" · ").slice(0, 600) });
          }
          total(result.expectedTotal); explicitlyEmpty ||= result.empty;
          if (result.nextControlId) { visualNext = result.nextControlId; nextEvidence = input.controls.find(control => control.id === result.nextControlId); }
          ended = input.atBottom;
        }
        if (!ended || page.candidates.some(candidate => !covered.has(candidate.url))) {
          throw new Error("The visual read could not cover every part of this board. Save a more specific filtered link.");
        }
        next = visualNext || next;
      }
      if (jobs.size > 10000) throw new Error("This board has too many results. Save a more specific filtered link.");
      if (!next) break;
      if (pages === 100) throw new Error("This board has more than 100 pages. Save a more specific filtered link.");
      await reader.next(next, nextEvidence);
    }
    if ([...expected].some(id => !jobs.has(id))) throw new Error("The selected model did not identify every job link. Try the check again or choose another model in Settings.");
    if (expectedTotal !== null && jobs.size !== expectedTotal) throw new Error("Only " + jobs.size + " of " + expectedTotal + " listings could be verified. Try the check again.");
    if (!jobs.size && !explicitlyEmpty) throw new Error("No job links could be verified. The board did not confirm that it has no openings.");
    // Role criteria are applied only after the entire inventory is verified.
    // Page-local IDs are reassigned so every role has a unique batch identity.
    let jobIndex = 0;
    for (const [key, candidate] of jobs) jobs.set(key, { ...candidate, id: "l" + jobIndex++ });
    const criteria = options.instructions?.trim(), decisions = new Map(options.knownMatches);
    if (criteria) {
      const heading = requestedHeading(criteria, jobs.values());
      if (heading) for (const [key, job] of jobs) {
        if (!decisions.has(key) && normalizeHeading(job.department || "") !== heading) decisions.set(key, false);
      }
      const unseen = [...jobs].filter(([key]) => !decisions.has(key));
      for (let index = 0; index < unseen.length; index += size) {
        signal.throwIfAborted();
        options.progress("Checking tracking instructions for " + Math.min(index + size, unseen.length) + " of " + unseen.length + " roles", "extracting");
        const batch = unseen.slice(index, index + size);
        const result = await extract({ task: "roles", criteria, candidates: batch.map(([, candidate]) => candidate) });
        for (const [key, candidate] of batch) decisions.set(key, result.decisions[candidate.id]);
      }
    }
    signal.throwIfAborted();
    return { jobs: [...jobs].map(([key, candidate]) => ({ key, url: candidate.url, matches: criteria ? decisions.get(key) === true : true,
      title: candidate.title, department: candidate.department, location: candidate.location })),
      pages, provider: options.provider, model: options.model };
  } finally { reader.close(); }
}

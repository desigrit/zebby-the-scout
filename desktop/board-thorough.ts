import { createHash, randomUUID } from "node:crypto";
import { boardJobIdentity, boardUrl } from "../lib/board-identity";
import { isBoardActionLabel } from "../shared/board-listing-title";
import { BOARD_EXPLORER_VERSION, controlProvesScope, isContinuationControl, scopeText, type BoardExploreInput, type BoardExploreResult,
  type BoardFeedMapping, type BoardReaderSettings, type ExplorationAction } from "../shared/board-exploration";
import { validatedBoardExtraction, type BoardCandidate, type BoardExtractionInput, type BoardScan } from "../shared/boards";
import { scanBoard, type BoardExtractor } from "./boards-scan";
import type { BoardObservation, BoardRecipeStep, ObservedBoardFeed, ThoroughBoardReader } from "./board-explorer-browser";

export type BoardCheckpoint = { version: number; id: string; boardId: string; workspace: string; revision: number; baseCheckId: number; url: string;
  provider: string; model: string; account: string; instructions: string; status: "reading" | "paused" | "incomplete" | "complete";
  pass: "collect" | "audit"; calls: number; reused: number; steps: BoardRecipeStep[]; recipe: BoardRecipeStep[];
  jobs: BoardCandidate[]; verifiedPass: BoardCandidate[]; updatedAt: string; startedAt: string; message: string };
export class BoardReadLimit extends Error {}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const jobKeys = (jobs: Iterable<BoardCandidate>) => [...jobs].map(job => boardJobIdentity(job.url).key).sort();
const noFilter = /^(?:utm_.+|gh_src|lever-source|page|pagesize|page_size|offset|start|cursor|sort|sort_by|sort_order)$/i;
export function boardScope(value: string): BoardExploreInput["scope"] {
  const url = boardUrl(value), values = new Map<string, { key: string; value: string }>();
  const fragment = new URLSearchParams(url.hash.includes("?") ? url.hash.slice(url.hash.indexOf("?") + 1) : "");
  for (const [key, raw] of [...url.searchParams, ...fragment]) {
    if (noFilter.test(key)) continue;
    const value = raw;
    if (!value || value.length > 500 || key.length > 100) {
      throw new Error("This saved search contains ambiguous filters. Edit its link before checking again.");
    }
    values.set(JSON.stringify([key, value]), { key, value });
  }
  // Hash routers can encode filters as path values, including opaque IDs.
  // Require actual selected-control evidence for each value. Never infer the
  // meaning of a UUID or treat the URL itself as proof of an active filter.
  if (/^#!?\//.test(url.hash)) for (const segment of url.hash.replace(/^#!?\//, "").split("?")[0].split("/").filter(Boolean)) {
    let value: string; try { value = decodeURIComponent(segment); } catch { throw new Error("This saved search contains an invalid filter address. Edit its link before checking again."); }
    if (/^(?:jobs?|careers|search|results|job-results|openings)$/.test(value)) continue;
    if (value.length > 500) throw new Error("This saved search contains ambiguous filters. Edit its link before checking again.");
    values.set(JSON.stringify(["route", value]), { key: "route", value });
  }
  if (values.size > 30) throw new Error("This saved search has too many filters to verify.");
  return [...values.values()].map(({ key, value }, index) => ({ id: "s" + index, key, value }));
}
export function newBoardCheckpoint(input: Pick<BoardCheckpoint, "boardId" | "workspace" | "revision" | "url" | "provider" | "model" | "account" | "instructions"> & { baseCheckId?: number }): BoardCheckpoint {
  const now = new Date().toISOString();
  return { ...input, baseCheckId: input.baseCheckId || 0, version: BOARD_EXPLORER_VERSION, id: randomUUID(), status: "reading", pass: "collect", calls: 0, reused: 0,
    steps: [], recipe: [], jobs: [], verifiedPass: [], startedAt: now, updatedAt: now, message: "Starting a thorough check" };
}
function pointer(data: unknown, path: string): unknown {
  if (!path) return undefined;
  let current = data;
  for (const raw of path.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (["__proto__", "prototype", "constructor"].includes(key) || !current || typeof current !== "object" || !Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
export function mapObservedFeed(feed: ObservedBoardFeed, mapping: BoardFeedMapping): { jobs: BoardCandidate[]; complete: boolean } | null {
  if (!mapping.usable) return null;
  const rows = mapping.records ? pointer(feed.data, mapping.records) : feed.data;
  if (!Array.isArray(rows) || rows.length > 10000 || !mapping.id || !mapping.title || !mapping.url) return null;
  const ids = new Set<string>(), urls = new Set<string>(), jobs: BoardCandidate[] = [];
  for (const row of rows) {
    const id = pointer(row, mapping.id), title = pointer(row, mapping.title), link = pointer(row, mapping.url);
    if ((typeof id !== "string" && typeof id !== "number") || !String(id) || typeof title !== "string" || !title.trim() || typeof link !== "string") return null;
    let url: URL; try { url = boardUrl(link); } catch { return null; }
    const key = boardJobIdentity(url.href).key;
    if (ids.has(String(id)) || urls.has(key)) return null;
    ids.add(String(id)); urls.add(key);
    const department = pointer(row, mapping.department), location = pointer(row, mapping.location);
    jobs.push({ id: "f" + jobs.length, url: url.href, title: title.trim().slice(0, 300),
      department: typeof department === "string" ? department.slice(0, 200) : "", location: typeof location === "string" ? location.slice(0, 300) : "",
      text: [title, typeof department === "string" ? department : "", typeof location === "string" ? location : ""].filter(Boolean).join(" · ").slice(0, 600) });
  }
  const total = pointer(feed.data, mapping.total), next = pointer(feed.data, mapping.next);
  return { jobs, complete: Number.isInteger(total) && total === jobs.length && (!mapping.next || next === null || next === "" || next === false) };
}

type Options = { url: string; reader: ThoroughBoardReader; extract: BoardExtractor; signal: AbortSignal;
  provider: string; model: string; instructions?: string; knownMatches?: ReadonlyMap<string, boolean>;
  settings: BoardReaderSettings; checkpoint: BoardCheckpoint; resume?: boolean; forceFresh?: boolean;
  progress(message: string, phase: "reading" | "extracting"): void; save(checkpoint: BoardCheckpoint): Promise<void> };

export async function thoroughlyScanBoard(options: Options): Promise<BoardScan> {
  const { reader, signal, checkpoint, settings } = options, scope = boardScope(options.url);
  const started = Date.now(), initialCalls = checkpoint.calls - checkpoint.reused;
  let stepsTaken = 0, observations = 0, transientErrors = 0, feedback = "", finished = false;
  const history: string[] = [], feedMaps = new Map<string, ReturnType<typeof mapObservedFeed>>();
  const checkBudget = () => {
    signal.throwIfAborted();
    if (Date.now() - started > settings.minutes * 60000 || checkpoint.calls - checkpoint.reused - initialCalls >= settings.modelCalls || stepsTaken >= 240 || observations >= 240) {
      throw new BoardReadLimit("This check reached its reading limit. The verified jobs are saved. Resume to continue, or adjust the limits in Settings.");
    }
  };
  const persist = async (message: string) => { checkpoint.updatedAt = new Date().toISOString(); checkpoint.message = message.slice(0, 4000); await options.save(checkpoint); };
  const call = async <T extends BoardExtractionInput>(input: T) => {
    checkBudget(); checkpoint.calls++; await persist(checkpoint.message);
    return validatedBoardExtraction(await options.extract(input, signal), input);
  };
  const recordStep = (action: ExplorationAction, observation: BoardObservation): BoardRecipeStep => {
    const target = observation.page.controls.find(control => control.id === action.targetId);
    return { action, ...(target ? { target: { name: target.name, role: target.role, kind: target.kind, href: target.href } } : {}) };
  };
  const take = async (action: ExplorationAction, observation: BoardObservation) => {
    checkBudget(); stepsTaken++;
    const inspected = await reader.act(action, observation);
    const step = recordStep(action, observation); checkpoint.steps.push(step);
    if (checkpoint.steps.length > 240) checkpoint.steps.shift();
    history.push(action.kind + (step.target?.name ? ": " + step.target.name.slice(0, 120) : ""));
    if (history.length > 12) history.shift();
    return inspected;
  };
  const scroll = (observation: BoardObservation, top = false): ExplorationAction => {
    const page = observation.page;
    const nested = page.controls.find(control => control.kind === "scroll" && control.visible && (() => {
      const [position, end] = control.value.split("/").map(Number); return top || position < end - 8;
    })());
    return { kind: "scroll", targetId: nested?.id || "", value: top ? "top" : "down" };
  };
  const replay = async (recipe: BoardRecipeStep[]) => {
    for (const step of recipe.slice(0, 100)) {
      if (!["expand", "select", "choose", "fill", "dismiss", "document"].includes(step.action.kind)) continue;
      const observation = await reader.observe();
      const matches = observation.page.controls.filter(control => step.target && control.kind === step.target.kind && control.role === step.target.role &&
        scopeText(control.name) === scopeText(step.target.name) && control.href === step.target.href && !control.disabled);
      if (matches.length !== 1) break;
      if (step.action.kind === "expand" && matches[0].expanded === true) continue;
      const action = { ...step.action, targetId: matches[0].id };
      // A replay is only a navigation shortcut. Current observations and both
      // inventory passes must still verify its scope and all of its results.
      try { await take(action, observation); } catch { signal.throwIfAborted(); break; }
    }
  };
  async function runPass(pass: "collect" | "audit", recipe: BoardRecipeStep[]) {
    checkpoint.pass = pass; checkpoint.steps = []; checkpoint.status = "reading";
    const jobs = new Map<string, BoardCandidate>(), proofs = new Set<string>(), ignored = new Set<string>();
    const inspected = new Map<string, BoardCandidate>(), classified = new Set<string>(), visitedNext = new Set<string>();
    const inspectedControls = new Map<string, BoardCandidate>();
    const repeatedDecisions = new Map<string, number>();
    const settledReads = new Map<string, BoardExploreResult>();
    const controlKey = (pageUrl: string, control: BoardObservation["page"]["controls"][number]) => hash([pageUrl, control.id, control.name, control.role, control.context]);
    let expected: number | null = null, empty = false, bottom = "", stableBottom = 0, sweptAgain = false, lastUrl = "";
    let progressKey = "", stagnant = 0;
    feedback = ""; history.length = 0; transientErrors = 0;
    await reader.open(options.url); await replay(recipe);
    options.progress(pass === "audit" ? "Verifying the inventory in a fresh pass" : "Reading the board thoroughly", "reading");
    while (true) {
      checkBudget(); observations++;
      let observation: BoardObservation;
      try { observation = await reader.observe(); }
      catch (error) { signal.throwIfAborted(); if (++transientErrors > 3 || /blocking automated|browser check|destination|too many elements/i.test(String(error))) throw error; feedback = String(error).slice(0, 1500); continue; }
      const page = observation.page;
      if (lastUrl && page.url !== lastUrl) { proofs.clear(); ignored.clear(); stableBottom = 0; }
      lastUrl = page.url;
      if (page.loading || observation.pendingRequests) { await take({ kind: "wait", targetId: "", value: "" }, observation); await persist("Waiting for the job results to settle"); continue; }
      // Revalidate controls that remain in this document. A selected filter
      // can change without navigation; a stale proof cannot authorize a save.
      for (const filter of scope) {
        if ([...page.controls, ...observation.scopeControls || []].some(control => controlProvesScope(control, filter.value, scope.filter(item => item.key === filter.key).map(item => item.value)))) proofs.add(filter.id);
        else proofs.delete(filter.id);
      }
      const visible = new Set(page.viewportIds);
      const candidates = page.candidates.filter(candidate => visible.has(candidate.id)).map(candidate => inspected.get(boardJobIdentity(candidate.url).key) || candidate);
      for (const control of page.controls.filter(item => item.visible)) {
        const detail = inspectedControls.get(controlKey(page.url, control));
        if (detail && !candidates.some(candidate => candidate.url === detail.url)) candidates.push({ ...detail, id: control.id });
      }
      if (candidates.length > 60) throw new Error("Too many links are visible for a complete read. Use a more specific results link.");
      const controls = page.controls.filter(control => control.visible || ["input", "select"].includes(control.kind));
      if (controls.length > 80) throw new Error("Too many result controls are visible. Use a more specific results link.");
      const remainingSections = page.sections.filter(id => !ignored.has(id)).length;
      const bottomKey = hash([page.url, page.candidates, page.counters, page.sections]);
      stableBottom = page.atBottom && bottomKey === bottom ? stableBottom + 1 : 0; bottom = page.atBottom ? bottomKey : "";
      const input: BoardExploreInput = { task: "explore", savedUrl: options.url, pageUrl: page.url, pageTitle: page.title, summary: page.summary,
        image: observation.image, candidates, controls, scope, pass, counters: page.counters, atBottom: page.atBottom,
        loading: page.loading, pendingRequests: observation.pendingRequests,
        coverage: { verifiedCount: jobs.size, stableSweeps: stableBottom, remainingSections, scopeVerified: proofs.size === scope.length },
        history: history.slice(-12), feedback };
      options.progress(pass === "audit" ? `Verifying ${jobs.size} listings` : `Reading thoroughly, ${jobs.size} listings found`, "extracting");
      let result: BoardExploreResult;
      // Reuse only an unchanged, validated finish observation while waiting
      // for local settling. A new pass has its own cache and reads afresh.
      const readKey = hash([observation.fingerprint, observation.scopeControls, candidates, controls, scope]);
      try { result = settledReads.get(readKey) || await call(input) as BoardExploreResult; transientErrors = 0; }
      catch (error) {
        signal.throwIfAborted();
        if (++transientErrors > 3 || error instanceof BoardReadLimit || /credit|allowance|usage|quota|sign.?in|API key|authentication/i.test(String(error))) throw error;
        feedback = String(error).slice(0, 1500); await persist("Checking the page evidence again"); continue;
      }
      result.scopeEvidence.forEach(proof => proofs.add(proof.scopeId)); result.irrelevantControls.forEach(id => ignored.add(id));
      const accounted = new Set([...result.listings.map(job => job.id), ...result.excludedIds]);
      candidates.filter(candidate => accounted.has(candidate.id)).forEach(candidate => classified.add(candidate.url));
      for (const listing of proofs.size === scope.length ? result.listings : []) {
        const candidate = candidates.find(item => item.id === listing.id)!;
        const fromDetail = inspected.get(boardJobIdentity(candidate.url).key);
        const title = fromDetail?.title || (candidate.title && !isBoardActionLabel(candidate.title) ? candidate.title : listing.title);
        jobs.set(boardJobIdentity(candidate.url).key, { ...candidate, title,
          department: fromDetail?.department || listing.department || candidate.department,
          location: fromDetail?.location || listing.location || candidate.location });
      }
      if (jobs.size > 10000) throw new Error("This board is too large to verify in one check. Use a filtered results link.");
      if (result.totalEvidence.interpretation === "filtered" && proofs.size === scope.length) expected = result.totalEvidence.filteredTotal;
      empty ||= result.empty && proofs.size === scope.length;
      checkpoint.jobs = [...jobs.values()];
      await persist(result.reason || (pass === "audit" ? "Verifying all results" : "Reading all results"));
      const decisionKey = hash([observation.fingerprint, result.action, jobKeys(jobs.values()), [...proofs].sort()]);
      const repeated = (repeatedDecisions.get(decisionKey) || 0) + 1; repeatedDecisions.set(decisionKey, repeated);
      if (repeated > 4) throw new Error("The reader could not make further progress on this page. Resume to try again, or edit the board to use its direct results link. Your last successful check is unchanged.");
      const nextProgress = hash([jobKeys(jobs.values()), [...classified].sort(), [...ignored].sort(), [...proofs].sort(), expected, empty]);
      stagnant = nextProgress === progressKey ? stagnant + 1 : 0; progressKey = nextProgress;
      if (stagnant >= 8) throw new Error("The reader kept revisiting the same results without finding new evidence. Resume to try again. Your last successful check is unchanged.");
      // Discover and validate public response fields, then use the records only
      // to enrich links independently observed in the current result scope.
      for (const feed of reader.feeds().slice(0, 3)) {
        if (!feedMaps.has(feed.id)) {
          try {
            const mapping = await call({ task: "feed_map", pageUrl: page.url, responseUrl: feed.url, sample: feed.sample, observed: [...jobs.values()].slice(0, 20) }) as BoardFeedMapping;
            feedMaps.set(feed.id, mapObservedFeed(feed, mapping));
          } catch (error) {
            signal.throwIfAborted();
            if (error instanceof BoardReadLimit || /credit|allowance|quota|sign.?in|API key|authentication/i.test(String(error))) throw error;
            feedMaps.set(feed.id, null);
          }
        }
        const mapped = feedMaps.get(feed.id);
        if (!mapped) continue;
        for (const record of mapped.jobs) {
          const key = boardJobIdentity(record.url).key, observed = jobs.get(key);
          if (observed) jobs.set(key, { ...record, id: observed.id, url: observed.url, department: observed.department || record.department, location: observed.location || record.location });
        }
      }
      let action = result.action; feedback = "";
      const unaccountedControls = page.controls.filter(control => !control.disabled && control.kind !== "scroll" &&
        (isContinuationControl(control) || !ignored.has(control.id) && control.expanded !== true &&
          !inspectedControls.has(controlKey(page.url, control)) &&
          !(control.kind === "link" && classified.has(control.href)) &&
          !scope.some(filter => controlProvesScope(control, filter.value, scope.filter(item => item.key === filter.key).map(item => item.value)))));
      const unread = page.candidates.find(candidate => !classified.has(candidate.url) && !visible.has(candidate.id))?.id ||
        unaccountedControls.find(control => !control.visible)?.id;
      // Find the next observed unread element directly. This does not discard
      // the rest of the document: finish still requires global coverage, the
      // bottom of every scroller, a settled count and an independent audit.
      if (reader.reveal && unread && !result.uncertainIds.length &&
          (action.kind === "finish" || action.kind === "scroll" && action.value === "top" && !action.targetId)) {
        try { checkBudget(); stepsTaken++; await reader.reveal(unread, observation); history.push("Reading the next unread element: " + unread); feedback = "Review this unread part of the results before revisiting earlier content."; }
        catch (error) { signal.throwIfAborted(); feedback = String(error).slice(0, 1500); }
        continue;
      }
      if (action.kind === "finish") {
        const unclassified = page.candidates.some(candidate => !classified.has(candidate.url));
        const closed = page.sections.some(id => !ignored.has(id));
        if (proofs.size !== scope.length) feedback = "The saved filters are not all verified. Restore the missing filters and report their selected values.";
        else if (closed) feedback = "There are unopened sections that have not been classified as unrelated. Inspect and open the job-results sections.";
        else if (unaccountedControls.length) feedback = `These controls still need review: ${unaccountedControls.map(control => control.id + " " + control.name).join(", ").slice(0, 1000)}. Use result navigation, inspect vacancy controls, or explicitly classify unrelated controls before finishing.`;
        else if (result.uncertainIds.length) feedback = "Visible links are still uncertain. Inspect those vacancies before finishing.";
        else if (!page.atBottom || unclassified) { action = scroll(observation, page.atBottom && unclassified); feedback = "Some of the page has not been read. Continue through all result containers before finishing."; }
        else if (expected !== null && jobs.size !== expected) feedback = `Verified ${jobs.size} job IDs, but the proposed filtered total is ${expected}. Find the missing page or reassess whether that counter is company-wide. Do not guess a count.`;
        else if (!jobs.size && !empty) feedback = "No jobs were verified, and the results have not explicitly confirmed an empty search. Inspect the result controls.";
        else if (!result.complete) feedback = "The visible evidence is still ambiguous. Resolve the stated issue before finishing.";
        else if (expected === null && !sweptAgain) { action = scroll(observation, true); sweptAgain = true; feedback = "No reliable total is stated. Sweep this results page once more for missed jobs and controls."; }
        else if (stableBottom < 1) { settledReads.set(readKey, result); action = { kind: "wait", targetId: "", value: "" }; feedback = "Verify that the final result set has settled before finishing."; }
        else {
          checkpoint.jobs = [...jobs.values()]; await persist("Inventory pass verified");
          return { jobs: [...jobs.values()], recipe: checkpoint.steps.filter(step => ["expand", "select", "choose", "fill", "dismiss", "document"].includes(step.action.kind)) };
        }
        if (action.kind === "finish") { history.push(feedback.slice(0, 500)); continue; }
      }
      if (action.kind === "next" && !page.atBottom) { action = scroll(observation); feedback = "Finish reading this page before following its next-page control."; }
      if (action.kind === "next") {
        const target = page.controls.find(control => control.id === action.targetId);
        const pageKey = hash([page.url, page.candidates.map(candidate => candidate.url).sort(), page.counters, target?.name, target?.href]);
        if (visitedNext.has(pageKey)) throw new Error("The board repeated a results page. Verified jobs are saved; resume to retry its navigation.");
        visitedNext.add(pageKey); stableBottom = 0; sweptAgain = false;
      }
      if (["fill", "select", "choose"].includes(action.kind)) { proofs.clear(); jobs.clear(); classified.clear(); ignored.clear(); settledReads.clear(); expected = null; empty = false; stableBottom = 0; sweptAgain = false; }
      try {
        const detail = await take(action, observation);
        if (detail) {
          inspected.set(boardJobIdentity(detail.url).key, detail);
          const control = page.controls.find(item => item.id === action.targetId);
          if (control && !page.candidates.some(candidate => candidate.id === action.targetId)) inspectedControls.set(controlKey(page.url, control), detail);
        }
      } catch (error) { signal.throwIfAborted(); feedback = String(error).slice(0, 1500); }
      await persist(result.reason || "Continuing the thorough check");
    }
  }
  try {
    let previous: BoardCandidate[] | null = options.resume && checkpoint.verifiedPass.length ? checkpoint.verifiedPass : null;
    let recipe = options.forceFresh ? [] : checkpoint.recipe.length ? checkpoint.recipe : options.resume ? checkpoint.steps : [];
    for (let pass = 0; pass < 3; pass++) {
      const result = await runPass(previous ? "audit" : "collect", recipe);
      recipe = result.recipe; checkpoint.recipe = recipe;
      if (previous && JSON.stringify(jobKeys(previous)) === JSON.stringify(jobKeys(result.jobs))) {
        options.progress("Applying tracking instructions to the verified inventory", "extracting");
        const candidates = result.jobs.map((job, index) => ({ ...job, id: "l" + index }));
        const scan = await scanBoard({ url: options.url, signal, provider: options.provider, model: options.model, instructions: options.instructions,
          knownMatches: options.knownMatches, progress: options.progress, extract: async input => call(input),
          reader: { open: async () => {}, close() {}, next: async () => { throw new Error("A verified inventory cannot paginate."); }, read: async () => ({
            url: options.url, title: "Verified board inventory", summary: "Two independently verified inventory passes", candidates, controls: [],
            expectedTotal: candidates.length, pageNumber: 1, pageCount: 1, empty: !candidates.length, loading: false, blocked: false,
            atBottom: true, scrollY: 0, height: 0, layer: "structured", complete: true,
          }) },
        });
        checkpoint.jobs = result.jobs; checkpoint.verifiedPass = result.jobs; finished = true; return scan;
      }
      previous = result.jobs; checkpoint.verifiedPass = result.jobs;
      await persist(pass ? "The inventory changed. Verifying the latest results again" : "Starting an independent completeness check");
    }
    throw new Error("The board's inventory kept changing between verification passes. Verified jobs are saved; resume to check again.");
  } catch (error) {
    checkpoint.status = signal.aborted || error instanceof BoardReadLimit ? "paused" : "incomplete";
    await persist(signal.aborted ? signal.reason instanceof BoardReadLimit ? signal.reason.message : "Check paused. Resume when ready" : error instanceof Error ? error.message : "The check could not finish");
    throw error;
  } finally {
    if (finished) await persist("Verified inventory ready to save");
    reader.close();
  }
}

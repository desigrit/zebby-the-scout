import { z } from "zod";
import { boardJobIdentity, boardUrl } from "../lib/board-identity";
import { greenhouseBoard } from "./greenhouse-board";
import type { BoardCandidate } from "../shared/boards";
import type { BoardPage } from "./board-page";

export type BoardFeed = { kind: "greenhouse" | "lever" | "ashby"; board: string; url: string; endpoint: string };
type Request = (url: string, init: RequestInit) => Promise<Response>;
const token = /^[\w-]+$/;
const leverFilters = ["location", "commitment", "team", "department"];
const tracking = (key: string) => /^utm_/i.test(key) || ["gh_src", "lever-source"].includes(key);

// An unknown query or fragment can be a saved filter. Never drop it to use a feed.
export function boardFeed(value: string): BoardFeed | null {
  const url = boardUrl(value), parts = url.pathname.split("/").filter(Boolean);
  if (url.hash) return null;
  const greenhouse = greenhouseBoard(url);
  if (greenhouse && [...url.searchParams.keys()].every(key => tracking(key) || ["for", "validityToken"].includes(key))) {
    return { kind: "greenhouse", board: greenhouse, url: url.href,
      endpoint: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(greenhouse)}/jobs?content=true` };
  }
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname) && parts.length === 1 && token.test(parts[0]) &&
      [...url.searchParams.keys()].every(key => tracking(key) || leverFilters.includes(key))) {
    const endpoint = new URL(`https://${url.hostname === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${parts[0]}`);
    endpoint.searchParams.set("mode", "json");
    for (const [key, value] of url.searchParams) if (leverFilters.includes(key)) endpoint.searchParams.append(key, value);
    return { kind: "lever", board: parts[0], url: url.href, endpoint: endpoint.href };
  }
  if (url.hostname === "jobs.ashbyhq.com" && parts.length === 1 && token.test(parts[0]) &&
      [...url.searchParams.keys()].every(tracking)) {
    return { kind: "ashby", board: parts[0], url: url.href,
      endpoint: `https://api.ashbyhq.com/posting-api/job-board/${parts[0]}` };
  }
  return null;
}

const text = z.string().trim().min(1);
const greenhouseResponse = z.object({ meta: z.object({ total: z.number().int().nonnegative().max(10000) }), jobs: z.array(z.object({
  id: z.number().int().positive().safe(), internal_job_id: z.number().nullable().optional(), title: text,
  location: z.object({ name: z.string() }).optional(), departments: z.array(z.object({ name: z.string() })).optional(),
})).max(10000) });
const leverResponse = z.array(z.object({ id: z.string().uuid(), text,
  hostedUrl: z.string().url(), categories: z.object({ location: z.string().optional(), allLocations: z.array(z.string()).optional(),
    commitment: z.string().optional(), team: z.string().optional(), department: z.string().optional() }),
  workplaceType: z.string().optional(),
})).max(100);
const ashbyResponse = z.object({ apiVersion: z.literal("1"), jobs: z.array(z.object({ title: text, jobUrl: z.string().url(),
  isListed: z.boolean(), location: z.string().optional(), secondaryLocations: z.array(z.object({ location: z.string() })).optional(),
  department: z.string().optional(), team: z.string().optional(), workplaceType: z.string().optional(),
})).max(10000) });

async function json(request: Request, url: string, signal: AbortSignal) {
  const response = await request(url, { credentials: "omit", redirect: "error", headers: { Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  if (!response.ok || !response.body) throw new Error("The job feed is temporarily unavailable.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 16_000_000) throw new Error("This job feed is too large. Use a more specific board link.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function listing(url: string, title: string, department = "", location = ""): BoardCandidate {
  return { id: "", url: boardUrl(url).href, title: title.slice(0, 300), department: department.slice(0, 200),
    location: location.slice(0, 300), text: [title, department, location].filter(Boolean).join(" · ").slice(0, 600) };
}

export async function readBoardFeed(feed: BoardFeed, request: Request, signal: AbortSignal): Promise<BoardPage> {
  let candidates: BoardCandidate[] = [];
  if (feed.kind === "greenhouse") {
    const data = greenhouseResponse.parse(await json(request, feed.endpoint, signal));
    if (data.meta.total !== data.jobs.length || new Set(data.jobs.map(job => job.id)).size !== data.meta.total) {
      throw new Error("The job feed returned an incomplete inventory.");
    }
    candidates = data.jobs.filter(job => job.internal_job_id !== null).map(job => listing(
      `https://job-boards.greenhouse.io/${feed.board}/jobs/${job.id}`, job.title,
      (job.departments || []).map(department => department.name).join(" / "), job.location?.name));
  } else if (feed.kind === "ashby") {
    const data = ashbyResponse.parse(await json(request, feed.endpoint, signal));
    candidates = data.jobs.filter(job => job.isListed).map(job => {
      const url = boardUrl(job.jobUrl), parts = url.pathname.split("/").filter(Boolean);
      if (url.hostname !== "jobs.ashbyhq.com" || parts[0] !== feed.board || parts.length !== 2 || !z.string().uuid().safeParse(parts[1]).success) {
        throw new Error("The job feed returned a listing outside the saved board.");
      }
      return listing(url.href, job.title, [job.department, job.team].filter(Boolean).join(" / "),
        [job.location, ...(job.secondaryLocations || []).map(place => place.location), job.workplaceType].filter(Boolean).join(" · "));
    });
  } else {
    const seen = new Set<string>(), saved = new URL(feed.url);
    // Require an empty final batch, even if a server returns less than our limit.
    // A repeated ID or ignored offset fails the entire feed before DOM fallback.
    for (let batch = 0; batch <= 100; batch++) {
      const url = new URL(feed.endpoint);
      url.searchParams.set("skip", String(candidates.length)); url.searchParams.set("limit", "100");
      const data = leverResponse.parse(await json(request, url.href, signal));
      if (!data.length) break;
      if (batch === 100) throw new Error("This job feed has too many results.");
      for (const job of data) {
        const link = boardUrl(job.hostedUrl), parts = link.pathname.split("/").filter(Boolean);
        if (seen.has(job.id) || link.origin !== saved.origin || parts.length !== 2 || parts[0] !== feed.board || parts[1] !== job.id) {
          throw new Error("The job feed repeated or changed a listing ID.");
        }
        for (const key of leverFilters) {
          const wanted = saved.searchParams.getAll(key), actual = job.categories[key as keyof typeof job.categories];
          const values = key === "location" ? job.categories.allLocations || [job.categories.location] : [actual];
          if (wanted.length && !wanted.some(value => values.includes(value))) throw new Error("The job feed did not preserve the saved filters.");
        }
        seen.add(job.id);
        candidates.push(listing(link.href, job.text, [job.categories.department, job.categories.team].filter(Boolean).join(" / "),
          [...(job.categories.allLocations || [job.categories.location]), job.workplaceType].filter(Boolean).join(" · ")));
      }
    }
  }
  if (new Set(candidates.map(job => boardJobIdentity(job.url).key)).size !== candidates.length) throw new Error("The job feed repeated a listing ID.");
  signal.throwIfAborted();
  return { url: feed.url, title: `${feed.board} careers`, summary: "Complete published job feed with saved filters preserved.",
    candidates: candidates.map((job, index) => ({ ...job, id: `l${index}` })), controls: [],
    expectedTotal: candidates.length, pageNumber: 1, pageCount: 1, empty: candidates.length === 0, loading: false, blocked: false,
    atBottom: true, scrollY: 0, height: 0, layer: "structured", complete: true };
}

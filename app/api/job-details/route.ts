import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  companyFromBoardName,
  detailsFromAshby,
  detailsFromGreenhouse,
  detailsFromHtml,
  detailsFromLever,
  emptyJobDetails,
  mergeJobDetails,
  type JobDetails,
} from "../../../lib/job-details";
import { jsonError } from "../../../lib/server-data";

const MAX_BYTES = 4_000_000;
const inputSchema = z.object({ url: z.string().trim().url().max(2000) });

function publicHttpsUrl(value: string, ownHost: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    host === ownHost || !host.includes(".") || !/^[a-z0-9.-]+$/.test(host) ||
    /^\d+(?:\.\d+){3}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|lan)$/.test(host)
  ) {
    throw new Error("Use a public HTTPS job listing link to fill details.");
  }
  return url;
}

async function readBounded(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error("The listing is too large to read.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("The listing is too large to read.");
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function fetchText(url: URL, signal: AbortSignal, ownHost: string, accept: string) {
  let current = url;
  for (let redirects = 0; redirects < 4; redirects++) {
    publicHttpsUrl(current.href, ownHost);
    const response = await fetch(current.href, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { Accept: accept },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The listing redirected without a destination.");
      current = publicHttpsUrl(new URL(location, current).href, ownHost);
      continue;
    }
    if (!response.ok) throw new Error("The listing could not be read.");
    return { body: await readBounded(response), contentType: response.headers.get("content-type") || "" };
  }
  throw new Error("The listing redirected too many times.");
}

type Platform = { kind: "lever" | "greenhouse" | "ashby"; endpoint: URL; board: string };

function platformFor(url: URL): Platform | null {
  const path = url.pathname.split("/").filter(Boolean);
  if ((url.hostname === "jobs.lever.co" || url.hostname === "jobs.eu.lever.co") && path.length >= 2) {
    const apiHost = url.hostname === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
    return {
      kind: "lever", board: path[0],
      endpoint: new URL(`https://${apiHost}/v0/postings/${encodeURIComponent(path[0])}/${encodeURIComponent(path[1])}`),
    };
  }
  if (url.hostname === "boards.greenhouse.io" || url.hostname === "job-boards.greenhouse.io") {
    const board = path[0] === "embed" ? url.searchParams.get("for") : path[0];
    const id = path[0] === "embed" ? url.searchParams.get("token") : path[1] === "jobs" ? path[2] : null;
    if (board && id && /^\d+$/.test(id)) {
      return {
        kind: "greenhouse", board,
        endpoint: new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}`),
      };
    }
  }
  if (url.hostname === "jobs.ashbyhq.com" && path.length >= 2) {
    return {
      kind: "ashby", board: path[0],
      endpoint: new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(path[0])}`),
    };
  }
  return null;
}

async function platformDetails(platform: Platform, url: URL, signal: AbortSignal, ownHost: string): Promise<JobDetails> {
  const response = await fetchText(platform.endpoint, signal, ownHost, "application/json");
  if (!response.contentType.toLowerCase().includes("json")) throw new Error("The job board did not return job data.");
  const data: unknown = JSON.parse(response.body);
  switch (platform.kind) {
    case "lever": return detailsFromLever(data);
    case "greenhouse": return detailsFromGreenhouse(data);
    case "ashby": return detailsFromAshby(data, url);
  }
}

async function htmlDetails(url: URL, signal: AbortSignal, ownHost: string): Promise<JobDetails> {
  const response = await fetchText(url, signal, ownHost, "text/html,application/xhtml+xml");
  if (!response.contentType.toLowerCase().includes("html")) throw new Error("The link did not return a job page.");
  return detailsFromHtml(response.body);
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to read a job listing.", 401);

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError("Enter a valid job listing link.", 400);

  let url: URL;
  const ownHost = new URL(request.url).hostname.toLowerCase();
  try {
    url = publicHttpsUrl(input.data.url, ownHost);
  } catch {
    return jsonError("Use a public HTTPS job listing link to fill details.", 400);
  }

  const platform = platformFor(url);
  const timeout = AbortSignal.timeout(12_000);
  const [platformResult, htmlResult] = await Promise.allSettled([
    platform ? platformDetails(platform, url, timeout, ownHost) : Promise.resolve(emptyJobDetails()),
    htmlDetails(url, timeout, ownHost),
  ]);
  const api = platformResult.status === "fulfilled" ? platformResult.value : emptyJobDetails();
  const html = htmlResult.status === "fulfilled" ? htmlResult.value : emptyJobDetails();
  const details = mergeJobDetails(api, html);
  if (platform && !details.company && (details.title || details.team || details.locations)) {
    details.company = companyFromBoardName(platform.board);
  }
  return Response.json({ details }, { headers: { "Cache-Control": "no-store" } });
}

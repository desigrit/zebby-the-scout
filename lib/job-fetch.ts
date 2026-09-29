import { lookup } from "node:dns/promises";
import { load } from "cheerio";
import { Agent, fetch as safeFetch } from "undici";
import { isPublicAddress } from "./public-address";
import {
  companyFromBoardName,
  detailsFromAshby,
  detailsFromGreenhouse,
  detailsFromHtml,
  detailsFromLever,
  emptyJobDetails,
  mergeJobDetails,
  type JobDetails,
} from "./job-details";

const MAX_BYTES = 4_000_000;
export function publicHttpsUrl(value: string, ownHost: string): URL {
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

async function readBounded(response: Awaited<ReturnType<typeof safeFetch>>): Promise<string> {
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
    const addresses = await lookup(current.hostname, { all: true });
    if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
      throw new Error("Use a public HTTPS job listing link to fill details.");
    }
    const chosen = addresses.find((item) => item.family === 4) || addresses[0];
    // Pin the checked address so a second DNS answer cannot reach a private endpoint.
    const agent = new Agent({
      connect: {
        autoSelectFamily: false,
        lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family),
      },
    });
    try {
      const response = await safeFetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { Accept: accept },
        dispatcher: agent,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("The listing redirected without a destination.");
        current = publicHttpsUrl(new URL(location, current).href, ownHost);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("The listing could not be read.");
      }
      return { body: await readBounded(response), contentType: response.headers.get("content-type") || "" };
    } finally {
      await agent.close();
    }
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

function plainText(html: string): string {
  const $ = load(html);
  $("script, style, nav, header, footer, aside, form, iframe, noscript").remove();
  const content = $("main").first().length ? $("main").first()
    : $("article").first().length ? $("article").first() : $("body");
  return content.text().replace(/\s+/g, " ").trim().slice(0, 40_000);
}

function descriptionText(platform: Platform, data: unknown, url: URL): string {
  if (!data || typeof data !== "object") return "";
  const row = data as Record<string, unknown>;
  if (platform.kind === "lever") {
    const lists = Array.isArray(row.lists) ? row.lists : [];
    return (String(row.descriptionPlain || plainText(String(row.description || ""))) + " " +
      lists.map((entry) => {
        const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return `${item.text || ""} ${plainText(String(item.content || ""))}`;
      }).join(" ")).trim().slice(0, 40_000);
  }
  if (platform.kind === "greenhouse") return plainText(String(row.content || ""));
  const postings = Array.isArray(row.jobPostings) ? row.jobPostings : [];
  const slug = url.pathname.split("/").filter(Boolean)[1];
  const posting = postings.find((entry) => entry && typeof entry === "object" &&
    ((entry as Record<string, unknown>).jobUrl === url.href || (entry as Record<string, unknown>).slug === slug));
  const item = posting && typeof posting === "object" ? posting as Record<string, unknown> : {};
  return plainText(String(item.descriptionHtml || item.descriptionPlain || ""));
}

export async function fetchJobPosting(value: string, ownHost = ""):
  Promise<{ details: JobDetails; text: string }> {
  const url = publicHttpsUrl(value, ownHost);
  const platform = platformFor(url);
  const timeout = AbortSignal.timeout(12_000);
  const [platformResult, htmlResult] = await Promise.allSettled([
    platform ? fetchText(platform.endpoint, timeout, ownHost, "application/json") : Promise.resolve(null),
    fetchText(url, timeout, ownHost, "text/html,application/xhtml+xml"),
  ]);
  let api = emptyJobDetails();
  let apiText = "";
  if (platform && platformResult.status === "fulfilled" && platformResult.value?.contentType.toLowerCase().includes("json")) {
    try {
      const data: unknown = JSON.parse(platformResult.value.body);
      api = platform.kind === "lever" ? detailsFromLever(data)
        : platform.kind === "greenhouse" ? detailsFromGreenhouse(data) : detailsFromAshby(data, url);
      apiText = descriptionText(platform, data, url);
    } catch { /* The HTML page can still provide details. */ }
  }
  let html = emptyJobDetails();
  let htmlText = "";
  if (htmlResult.status === "fulfilled" && htmlResult.value.contentType.toLowerCase().includes("html")) {
    html = await detailsFromHtml(htmlResult.value.body);
    htmlText = plainText(htmlResult.value.body);
  }
  if (!apiText && !htmlText && !api.company && !api.title && !api.team && !api.locations &&
      htmlResult.status === "rejected") throw htmlResult.reason;
  const details = mergeJobDetails(api, html);
  if (platform && !details.company && (details.title || details.team || details.locations)) {
    details.company = companyFromBoardName(platform.board);
  }
  return { details, text: (apiText || htmlText).slice(0, 40_000) };
}

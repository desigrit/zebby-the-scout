import { load } from "cheerio";

export type JobDetails = {
  company: string;
  title: string;
  team: string;
  locations: string;
};

type Data = Record<string, unknown>;

export function emptyJobDetails(): JobDetails {
  return { company: "", title: "", team: "", locations: "" };
}

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}

function decodeEntities(value: string) {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name: string) => {
    if (name.startsWith("#")) {
      const hex = name[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[name.toLowerCase()] || entity;
  });
}

function text(value: unknown, max = 500): string {
  return typeof value === "string"
    ? decodeEntities(value).replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function named(value: unknown): string {
  return text(typeof value === "string" ? value : record(value).name);
}

function joinedLocations(values: unknown[]): string {
  const unique = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    const location = text(value);
    if (!location || unique.has(location.toLowerCase())) continue;
    unique.add(location.toLowerCase());
    parts.push(location);
  }
  return parts.join("; ").slice(0, 500);
}

export function detailsFromDescription(value: unknown): Pick<JobDetails, "team" | "locations"> {
  if (typeof value !== "string") return { team: "", locations: "" };
  const lines = decodeEntities(value.slice(0, 200_000))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section|tr|td)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim());
  let team = "";
  let locations = "";
  for (const line of lines) {
    if (!team) {
      const match = line.match(/^(?:Team|Department|Business Unit)\s*[:\-]\s*(.{2,80})$/i);
      if (match && !/[.!?]/.test(match[1])) team = text(match[1], 160);
    }
    if (!locations) {
      const match = line.match(/^(?:Location|Locations|Office Location)\s*[:\-]\s*(.{2,200})$/i);
      if (match) locations = text(match[1], 500);
    }
    if (team && locations) break;
  }
  return { team, locations };
}

function locationNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(locationNames);
  if (typeof value === "string") return [value];
  const place = record(value);
  if (!Object.keys(place).length) return [];
  const address = record(place.address);
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
    .map(named)
    .filter(Boolean);
  const location = named(place.name) || text(place.address) || parts.join(", ");
  return location ? [location] : [];
}

export function mergeJobDetails(primary: JobDetails, fallback: JobDetails): JobDetails {
  const merged = {
    company: primary.company || fallback.company,
    title: primary.title || fallback.title,
    team: primary.team || fallback.team,
    locations: primary.locations || fallback.locations,
  };
  return separateTitleAndTeam(merged);
}

export function separateTitleAndTeam(details: JobDetails): JobDetails {
  const match = details.title.match(/^((?:(?:Senior|Sr\.?|Staff|Principal|Group|Lead|Associate|Technical|Director of|Head of|VP of|Vice President of)\s+)*(?:Product Manager|Product Management|Product Owner|Program Manager|Technical Program Manager|Growth Product Manager))(?:\s*,\s*)([^,]{2,80})$/i);
  if (!match) return details;
  const suffix = match[2].trim();
  if (/^(?:remote|hybrid|onsite|on-site|united states|usa|us|canada|uk|[a-z .]+,\s*[a-z]{2})$/i.test(suffix)) return details;
  if (details.team && details.team.toLowerCase() !== suffix.toLowerCase()) return details;
  return { ...details, title: match[1].trim(), team: details.team || suffix };
}

function isJobPosting(value: Data) {
  const kinds = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  return kinds.some((kind) => typeof kind === "string" && /(?:^|\/)JobPosting$/i.test(kind));
}

function collectJobPostings(value: unknown, found: Data[], depth = 0) {
  if (depth > 5 || found.length >= 20) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJobPostings(item, found, depth + 1);
    return;
  }
  const item = record(value);
  if (!Object.keys(item).length) return;
  if (isJobPosting(item)) found.push(item);
  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    if (item[key]) collectJobPostings(item[key], found, depth + 1);
  }
}

export function detailsFromStructuredData(value: unknown): JobDetails {
  const postings: Data[] = [];
  collectJobPostings(value, postings);
  const posting = postings[0];
  if (!posting) return emptyJobDetails();
  const remote = text(posting.jobLocationType).toLowerCase().includes("telecommute");
  const locationParts = locationNames(posting.jobLocation);
  const fromDescription = detailsFromDescription(posting.description);
  if (remote) {
    const required = locationNames(posting.applicantLocationRequirements).join(", ");
    locationParts.push(required ? `Remote (${required})` : "Remote");
  }
  return {
    company: named(posting.hiringOrganization).slice(0, 120),
    title: (text(posting.title) || text(posting.name)).slice(0, 160),
    team: (named(posting.employmentUnit) || named(posting.department) || named(posting.team) || fromDescription.team).slice(0, 160),
    locations: joinedLocations(locationParts) || fromDescription.locations,
  };
}

export function detailsFromLever(value: unknown): JobDetails {
  const posting = record(value);
  const categories = record(posting.categories);
  const fromDescription = detailsFromDescription(posting.descriptionPlain || posting.description);
  const locations = Array.isArray(categories.allLocations) && categories.allLocations.length
    ? categories.allLocations
    : [categories.location];
  if (text(posting.workplaceType).toLowerCase() === "remote") locations.push("Remote");
  return {
    company: "",
    title: text(posting.text, 160),
    team: (text(categories.team) || text(categories.department) || fromDescription.team).slice(0, 160),
    locations: joinedLocations(locations) || fromDescription.locations,
  };
}

export function detailsFromGreenhouse(value: unknown): JobDetails {
  const posting = record(value);
  const fromDescription = detailsFromDescription(posting.content);
  const metadata = Array.isArray(posting.metadata) ? posting.metadata.map(record) : [];
  const teamField = metadata.find((field) => /^(team|department)$/i.test(text(field.name)));
  const departments = Array.isArray(posting.departments) ? posting.departments.map(named) : [];
  const offices = Array.isArray(posting.offices)
    ? posting.offices.map((office) => text(record(office).location) || named(office))
    : [];
  const locations = offices.filter(Boolean).length > 1 ? offices : [named(posting.location)];
  return {
    company: text(posting.company_name, 120),
    title: text(posting.title, 160),
    team: (text(teamField?.value) || departments[0] || fromDescription.team).slice(0, 160),
    locations: joinedLocations(locations) || fromDescription.locations,
  };
}

export function detailsFromAshby(value: unknown, listingUrl: URL): JobDetails {
  const board = record(value);
  const jobs = Array.isArray(board.jobs) ? board.jobs.map(record) : [];
  const targetPath = listingUrl.pathname.replace(/\/(apply)?\/?$/i, "").toLowerCase();
  const posting = jobs.find((job) => {
    const jobUrl = text(job.jobUrl);
    if (!jobUrl) return false;
    try {
      return new URL(jobUrl).pathname.replace(/\/$/, "").toLowerCase() === targetPath;
    } catch {
      return false;
    }
  });
  if (!posting) return emptyJobDetails();
  const fromDescription = detailsFromDescription(posting.descriptionPlain || posting.descriptionHtml);
  const secondary = Array.isArray(posting.secondaryLocations)
    ? posting.secondaryLocations.map((item) => text(record(item).location))
    : [];
  const locations = [posting.location, ...secondary];
  if (posting.isRemote === true && !locations.some((item) => /remote/i.test(text(item)))) {
    locations.push("Remote");
  }
  return {
    company: "",
    title: text(posting.title, 160),
    team: (text(posting.team) || text(posting.department) || fromDescription.team).slice(0, 160),
    locations: joinedLocations(locations) || fromDescription.locations,
  };
}

export function companyFromBoardName(name: string) {
  return decodeEntities(name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, 120);
}

export async function detailsFromHtml(html: string): Promise<JobDetails> {
  const $ = load(html);
  const meta = new Map<string, string>();
  $("meta").each((_, element) => {
    const tag = $(element);
    const key = (tag.attr("property") || tag.attr("name") || tag.attr("itemprop") || "").toLowerCase();
    const value = tag.attr("content");
    if (key && value && !meta.has(key)) meta.set(key, value);
  });
  const pageTitle = $("title").first().text();
  const scripts = $('script[type="application/ld+json"]').toArray()
    .slice(0, 20)
    .map((element) => $(element).html() || "")
    .filter((script) => script.length <= 200_000);

  let structured = emptyJobDetails();
  for (const script of scripts) {
    try {
      const parsed = detailsFromStructuredData(JSON.parse(script));
      if (Object.values(parsed).filter(Boolean).length > Object.values(structured).filter(Boolean).length) {
        structured = parsed;
      }
    } catch {
      // A malformed JSON-LD block does not prevent other metadata from being used.
    }
  }
  const pick = (...keys: string[]) => keys.map((key) => meta.get(key)).find(Boolean) || "";
  const siteName = text(pick("job:company", "company", "og:site_name", "application-name"), 120);
  const genericSites = /^(greenhouse|lever|ashby|linkedin|indeed|workday)$/i;
  const pageHeading = text(pick("job:title", "og:title", "twitter:title") || pageTitle, 160);
  const genericHeading = /^(?:jobs?|careers?|open (?:roles|positions|jobs)|job openings|join our team|page not found)(?:\s*(?:[|:\-]|at)\s*.*)?$/i;
  const fromDescription = detailsFromDescription(html);
  const fallback: JobDetails = {
    company: genericSites.test(siteName) ? "" : siteName,
    title: genericHeading.test(pageHeading) ? "" : pageHeading,
    team: text(pick("job:team", "team", "job:department", "department"), 160) || fromDescription.team,
    locations: text(pick("job:location", "job_location", "location"), 500) || fromDescription.locations,
  };
  return mergeJobDetails(structured, fallback);
}

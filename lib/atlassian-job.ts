import type { CheerioAPI } from "cheerio";

/** Read Atlassian's visible career content without depending on generated CSS classes. */
export function atlassianJobContent($: CheerioAPI) {
  const canonical = $('link[rel="canonical"]').first().attr("href") ||
    $('meta[property="og:url"]').first().attr("content") || "";
  try {
    const url = new URL(canonical);
    if (!/^(?:www\.)?atlassian\.com$/i.test(url.hostname) ||
        !/^\/company\/careers\/details\/\d+\/?$/.test(url.pathname)) return null;
  } catch { return null; }

  const main = $("main").first();
  const heading = main.find("h1").first();
  const title = heading.text().trim();
  if (!title) return null;
  // The paragraph beside the heading is category | city, country | city, country.
  // Keep commas within locations and never search description paragraphs for it.
  const sibling = heading.next();
  const subheading = sibling.is("p") ? sibling : sibling.find("p").first();
  const [department = "", ...locations] = subheading.text().replace(/\s+/g, " ").trim().split(/\s*\|\s*/);
  // The page repeats this ID for overview, responsibilities, pay and benefits.
  // Reading just the first block drops the actual role; reading main adds CTAs.
  const descriptionHtml = main.find("[id='body-content']").toArray()
    .map((element) => $(element).html() || "").join("\n");
  return {
    title,
    department,
    locations: locations.map((location) => location.replace(/^remote\s*,\s*remote$/i, "Remote")),
    descriptionHtml,
  };
}

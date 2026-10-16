import assert from "node:assert/strict";
import test from "node:test";
import {
  detailsFromAshby,
  detailsFromDescription,
  detailsFromGreenhouse,
  detailsFromHtml,
  detailsFromLever,
  detailsFromStructuredData,
  mergeJobDetails,
} from "../lib/job-details.ts";
import { descriptionFromHtml, descriptionText, formattedJobText } from "../lib/job-fetch.ts";
import { parseLocations, serializeLocations } from "../lib/locations.ts";

test("structured JobPosting keeps employer, team, and multiple locations", () => {
  const details = detailsFromStructuredData({
    "@graph": [{
      "@type": "JobPosting",
      title: "Senior Product Manager",
      hiringOrganization: { name: "Acme" },
      employmentUnit: { name: "Growth" },
      jobLocation: [
        { address: { addressLocality: "New York", addressRegion: "NY" } },
        { address: { addressLocality: "San Francisco", addressRegion: "CA" } },
      ],
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { name: "United States" },
    }],
  });
  assert.deepEqual(details, {
    company: "Acme",
    title: "Senior Product Manager",
    team: "Growth",
    locations: "New York, NY; San Francisco, CA; Remote (United States)",
  });
});

test("HTML job pages read JSON-LD and metadata in Node.js", async () => {
  const details = await detailsFromHtml(`
    <html><head><title>Careers</title>
      <meta property="og:site_name" content="Northstar">
      <script type="application/ld+json">{
        "@type":"JobPosting","title":"Product Manager",
        "hiringOrganization":{"name":"Northstar"},
        "employmentUnit":{"name":"Growth"},
        "jobLocation":{"address":{"addressLocality":"Seattle","addressRegion":"WA"}}
      }</script></head><body></body></html>`);
  assert.deepEqual(details, {
    company: "Northstar", title: "Product Manager", team: "Growth", locations: "Seattle, WA",
  });
});

test("description fallback reads explicit team and location labels", () => {
  const details = detailsFromDescription("<p>Team: Product Growth</p><p>Locations: New York; Remote</p>");
  assert.deepEqual(details, { team: "Product Growth", locations: "New York; Remote" });
  assert.deepEqual(detailsFromDescription("<h2>About the Team</h2><p>Work from anywhere.</p>"), {
    team: "", locations: "",
  });
});

test("structured JobPosting can use labelled description details", () => {
  const details = detailsFromStructuredData({
    "@type": "JobPosting",
    title: "Product Manager",
    description: "Department: Core Product\nLocation: Berlin, Germany",
  });
  assert.equal(details.team, "Core Product");
  assert.equal(details.locations, "Berlin, Germany");
});

test("Lever preserves all posted locations and the team", () => {
  const details = detailsFromLever({
    text: "Product Manager",
    categories: { team: "Design & Product", location: "New York", allLocations: ["New York", "Remote"] },
    workplaceType: "remote",
  });
  assert.equal(details.title, "Product Manager");
  assert.equal(details.team, "Design & Product");
  assert.equal(details.locations, "New York; Remote");
});

test("Greenhouse reads the public company and a department custom field", () => {
  const details = detailsFromGreenhouse({
    title: "Group Product Manager",
    company_name: "Northstar",
    location: { name: "London" },
    metadata: [{ name: "Department", value: "Platform" }],
  });
  assert.deepEqual(details, {
    company: "Northstar", title: "Group Product Manager", team: "Platform", locations: "London",
  });
});

test("Anthropic's Greenhouse billing role separates the title, team, and advertised cities", async () => {
  // Public metadata from /anthropic/jobs/5434361008. The description is a short
  // synthetic fixture rather than a copy of the full third-party job posting.
  const details = detailsFromGreenhouse({
    title: "Product Manager, Billing",
    company_name: "Anthropic",
    departments: [{ name: "Product Management, Support, & Operations" }],
    location: { name: "San Francisco, CA | New York City, NY" },
    offices: [{ name: "San Francisco, CA", location: "San Francisco, California, United States" }],
    metadata: [{ name: "Location Type", value: "On-Site" }],
    content: "<p>Location-based hybrid policy: Work from an office part of the week.</p>",
  });
  const expected = {
    company: "Anthropic", title: "Product Manager", team: "Billing",
    locations: "San Francisco, CA; New York City, NY",
  };
  assert.deepEqual(details, expected);

  const html = await detailsFromHtml(`<title>Job Application for Product Manager, Billing at Anthropic</title>
    <div class="job__title"><h1>Product Manager, Billing</h1>
      <div class="job__location"><svg></svg><div>San Francisco, CA | New York City, NY</div></div>
    </div><p>Location-based hybrid policy: Work from an office part of the week.</p>`);
  assert.deepEqual(html, { ...expected, company: "" });
  assert.deepEqual(mergeJobDetails(details, html), expected);
  assert.deepEqual(parseLocations(details.locations), ["San Francisco, CA", "New York City, NY"]);
});

test("Greenhouse distinguishes a specific team from a broad department", () => {
  assert.equal(detailsFromGreenhouse({
    title: "Senior Product Manager, Billing",
    metadata: [{ name: "Department", value: "Product Management" }],
  }).team, "Billing");
  const explicitTeam = detailsFromGreenhouse({
    title: "Product Manager, Billing",
    metadata: [{ name: "Department", value: "Product Management" }, { name: "Team", value: "Monetization" }],
  });
  assert.equal(explicitTeam.team, "Monetization");
  assert.equal(explicitTeam.title, "Product Manager, Billing");
  assert.equal(detailsFromGreenhouse({
    title: "Product Manager",
    departments: [{ name: "Product Management" }],
    content: "<p>Team: Billing</p>",
  }).team, "Billing");
  assert.equal(detailsFromGreenhouse({
    title: "Product Manager",
    departments: [{ name: "Product Management" }],
  }).team, "Product Management");
});

test("Greenhouse keeps advertised locations ahead of office metadata, with offices as fallback", () => {
  const offices = [{ name: "San Francisco, CA" }, { name: "New York City, NY" }];
  assert.equal(detailsFromGreenhouse({ location: { name: "Remote (United States)" }, offices }).locations,
    "Remote (United States)");
  assert.equal(detailsFromGreenhouse({ offices }).locations, "San Francisco, CA; New York City, NY");
});

test("a geographic or workplace title suffix does not replace a Greenhouse department", () => {
  for (const suffix of ["San Francisco", "Remote", "Hybrid"]) {
    const details = detailsFromGreenhouse({
      title: `Product Manager, ${suffix}`,
      departments: [{ name: "Product Management" }],
      location: { name: "San Francisco, CA | New York City, NY" },
    });
    assert.equal(details.title, `Product Manager, ${suffix}`);
    assert.equal(details.team, "Product Management");
  }
});

test("location separators produce separate chips without splitting city and region commas", () => {
  const value = "San Francisco, CA | New York City, NY; san francisco, ca\nLondon, United Kingdom | Remote";
  const expected = ["San Francisco, CA", "New York City, NY", "London, United Kingdom", "Remote"];
  assert.deepEqual(parseLocations(value), expected);
  assert.equal(serializeLocations([value]), expected.join("; "));
  assert.equal(detailsFromStructuredData({
    "@type": "JobPosting", jobLocation: "San Francisco, CA &#124; New York City, NY",
  }).locations, "San Francisco, CA; New York City, NY");
});

test("hyphenated policy text is not mistaken for a location or team label", () => {
  assert.deepEqual(detailsFromDescription("Location-based hybrid policy: Office attendance is required.\nTeam-based collaboration"),
    { team: "", locations: "" });
  assert.deepEqual(detailsFromDescription("Team - Billing\nLocation - San Francisco, CA | New York City, NY"),
    { team: "Billing", locations: "San Francisco, CA; New York City, NY" });
});

test("Ashby selects the pasted job rather than another opening on the board", () => {
  const details = detailsFromAshby({ jobs: [
    { jobUrl: "https://jobs.ashbyhq.com/acme/other", title: "Designer", location: "Boston" },
    {
      jobUrl: "https://jobs.ashbyhq.com/acme/pm",
      title: "Product Manager",
      department: "Product",
      team: "Core",
      location: "New York",
      secondaryLocations: [{ location: "San Francisco" }],
    },
  ] }, new URL("https://jobs.ashbyhq.com/acme/pm?source=referral"));
  assert.deepEqual(details, {
    company: "", title: "Product Manager", team: "Core", locations: "New York; San Francisco",
  });
});

test("a combined PM title becomes a title and team", () => {
  assert.deepEqual(mergeJobDetails({ company: "Acme", title: "Product Manager, Central Products", team: "", locations: "" },
    { company: "", title: "", team: "", locations: "" }),
  { company: "Acme", title: "Product Manager", team: "Central Products", locations: "" });
  assert.equal(mergeJobDetails({ company: "", title: "Product Manager, Remote", team: "", locations: "" },
    { company: "", title: "", team: "", locations: "" }).title, "Product Manager, Remote");
});

test("job descriptions keep headings, bullets, and paragraph breaks", () => {
  const text = formattedJobText("<h2>What you will do</h2><ul><li>Own the roadmap</li><li>Work with design</li></ul><p>Apply today.</p>");
  assert.match(text, /What you will do\n\n• Own the roadmap\n• Work with design/);
  assert.match(text, /Work with design\n\nApply today\./);
  const structured = descriptionFromHtml(`<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting", description: "<h2>Role</h2><p>Work with customers and engineering to deliver valuable products.</p><ul><li>Lead discovery</li><li>Set direction</li></ul>",
  })}</script></head><body><main>Generic shell content that is long enough to be mistaken for the full job post.</main></body></html>`);
  assert.match(structured, /• Lead discovery\n• Set direction/);
});

test("Ashby description comes from the selected job in its public board API", () => {
  const text = descriptionText({ kind: "ashby", board: "acme", endpoint: new URL("https://api.ashbyhq.com/") }, {
    jobs: [
      { jobUrl: "https://jobs.ashbyhq.com/acme/other", descriptionHtml: "<p>Wrong role</p>" },
      { jobUrl: "https://jobs.ashbyhq.com/acme/pm", descriptionHtml: "<ul><li>Build products</li></ul>" },
    ],
  }, new URL("https://jobs.ashbyhq.com/acme/pm?source=referral"));
  assert.equal(text, "• Build products");
});

test("Lever prefers formatted HTML when a plain description is also available", () => {
  const text = descriptionText({ kind: "lever", board: "acme", endpoint: new URL("https://api.lever.co/") }, {
    descriptionPlain: "Build products",
    description: "<ul><li>Build products</li><li>Lead the team</li></ul>",
  }, new URL("https://jobs.lever.co/acme/pm"));
  assert.match(text, /• Build products\n• Lead the team/);
});

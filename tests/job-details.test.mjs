import assert from "node:assert/strict";
import test from "node:test";
import {
  detailsFromAshby,
  detailsFromDescription,
  detailsFromGreenhouse,
  detailsFromLever,
  detailsFromStructuredData,
} from "../lib/job-details.ts";

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

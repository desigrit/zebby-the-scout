import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { scanBoard } from "../desktop/boards-scan.ts";

const criteria = "Only track Product Manager, Sr. Product Manager, Senior Product Manager, Staff Product Manager and Principal Product Manager roles.";
const source = "https://careers.twitch.com/en/careers";
const output = path.resolve("qa-output/twitch-reader");
const isRequestedRole = title => /^(?:(?:Sr\.|Senior|Staff|Principal) )?Product Manager(?:\b|,)/i.test(title || "");
const html = body => new Response("<!doctype html><html><head><title>Embedded jobs</title></head><body>" + body + "</body></html>",
  { headers: { "content-type": "text/html; charset=utf-8" } });

async function fixtures() {
  const parent = "https://careers.twitch.com/qa-boards";
  const embed = "https://job-boards.greenhouse.io/embed/job_board?for=zebby-test&department=product";
  const inventory = [
    ...["San Francisco", "Seattle", "Irvine"].map(city => "Senior Product Manager, Commerce " + city),
    ...["San Francisco", "Los Angeles", "Seattle", "New York"].map(city => "Sr. Product Manager, Premium Content Experience " + city),
    "Product Engineering Manager", "Product Operations Manager",
  ];
  const create = async () => {
    const controller = new AbortController(), reader = new BoardBrowser(controller.signal);
    await reader.window.webContents.session.protocol.handle("https", request => {
      const url = new URL(request.url);
      if (url.href === parent) return html('<p>0 jobs in the navigation example</p><a href="https://careers.twitch.com/">Careers</a>' +
        '<iframe style="display:none" src="https://job-boards.greenhouse.io/embed/job_board?for=hidden"></iframe>' +
        '<iframe src="https://www.twitch.tv/qa-ad"></iframe>' +
        '<script src="https://boards.greenhouse.io/embed/job_board/js?for=zebby-test"></script>');
      if (url.pathname.endsWith("/js")) return new Response('setTimeout(() => { const frame = document.createElement("iframe"); frame.id="jobs"; frame.src=' +
        JSON.stringify(embed) + '; frame.style="width:100%;height:260px"; document.body.append(frame); }, 800);',
        { headers: { "content-type": "application/javascript" } });
      if (url.searchParams.get("for") === "zebby-test") {
        const second = url.searchParams.get("page") === "2", begin = second ? 4 : 0, end = second ? inventory.length : 4;
        return html("<p>9 jobs</p><h2>Community Growth</h2><ul>" + inventory.slice(begin, end).map((title, index) =>
          '<li style="padding:60px 0"><a href="https://job-boards.greenhouse.io/zebby-test/jobs/' + (begin + index + 1) + '">' + title + "</a></li>").join("") +
          "</ul>" + (second ? '<button aria-label="Next page" disabled>Next page</button>' :
            '<a aria-label="Next page" href="' + embed + '&page=2">Next page</a>'));
      }
      return html('<a href="https://job-boards.greenhouse.io/hidden/jobs/999">Unrelated role</a>');
    });
    return { reader, controller };
  };
  const first = await create();
  let pages = 0;
  const originalRead = first.reader.read.bind(first.reader);
  first.reader.read = async () => { const page = await originalRead(); pages++; return page; };
  const originalOpen = first.reader.open.bind(first.reader);
  first.reader.open = async url => {
    await originalOpen(url);
    const pending = await first.reader.snapshot();
    assert.equal(pending.loading, true, "A pending embedded board must not settle on navigation links");
    assert.equal(pending.empty, false, "Parent-page empty text cannot confirm an empty embedded board");
  };
  const result = await scanBoard({ url: parent, ...first, signal: first.controller.signal, provider: "coverage-test", model: "fixture-oracle",
    instructions: criteria, progress() {},
    extract: async input => {
      assert.equal(pages, 2); assert.equal(input.task, "roles"); assert.equal(input.criteria, criteria);
      assert.equal(input.candidates.length, 9);
      assert.ok(input.candidates.every(job => job.department === "Community Growth"));
      return { decisions: Object.fromEntries(input.candidates.map(job => [job.id, isRequestedRole(job.title)])) };
    } });
  assert.equal(result.jobs.length, 9); assert.equal(result.jobs.filter(job => job.matches).length, 7);
  assert.ok(result.jobs.every(job => job.key.startsWith("greenhouse:zebby-test:")));
  const missing = await create();
  try {
    await missing.reader.open(parent); await missing.reader.read();
    await missing.reader.window.webContents.executeJavaScript("document.getElementById('jobs').remove()");
    await assert.rejects(missing.reader.read(), /disappeared/);
  } finally { missing.reader.close(); }
  console.log(JSON.stringify({ check: "embedded fixtures", pages: result.pages, jobs: 9, matches: 7, status: "passed" }));
}

async function live() {
  const controller = new AbortController(), reader = new BoardBrowser(controller.signal), pages = [];
  const read = reader.read.bind(reader);
  reader.read = async () => {
    const page = await read(), url = new URL(page.url); url.searchParams.delete("validityToken");
    pages.push({ ...page, url: url.href });
    return page;
  };
  // This oracle checks reader coverage independently of AI quality or paid providers.
  // The production scanner still applies the selected model to these same role inputs.
  const scan = await scanBoard({ url: source, reader, instructions: criteria, signal: controller.signal,
    provider: "coverage-test", model: "observed-titles", progress() {},
    extract: async input => {
      assert.equal(input.task, "roles", "Greenhouse navigation and posting IDs should not need AI");
      assert.equal(input.criteria, criteria);
      return { decisions: Object.fromEntries(input.candidates.map(job => [job.id, isRequestedRole(job.title)])) };
    } });
  const matches = scan.jobs.filter(job => job.matches);
  assert.ok(scan.jobs.length > 0); assert.equal(scan.jobs.length, pages.at(-1).expectedTotal);
  const titles = new Map(pages.flatMap(page => page.candidates.map(job => [job.url, job.title])));
  const evidence = { source, criteria, pages: scan.pages, total: scan.jobs.length,
    matches: matches.map(job => ({ ...job, title: titles.get(job.url) })) };
  await writeFile(path.join(output, "coverage.json"), JSON.stringify(evidence, null, 2));
  await writeFile(path.join(output, "pages.json"), JSON.stringify(pages, null, 2));
  console.log(JSON.stringify({ check: "live Twitch", ...evidence, status: "passed" }));
}

async function run() {
  const timeout = setTimeout(() => { console.error("Embedded board checks exceeded their time limit"); app.exit(1); }, 180000);
  timeout.unref();
  await mkdir(path.join(output, "profile"), { recursive: true });
  app.setPath("userData", path.join(output, "profile"));
  app.on("window-all-closed", () => {});
  await app.whenReady();
  await fixtures();
  await live();
  clearTimeout(timeout);
  app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { _electron as electron } from "playwright-core";

const root = await mkdtemp(path.join(tmpdir(), "pm-tracker-ui-test-"));
const userData = path.join(root, "profile");
const dbPath = path.join(root, "cloud", "applications.sqlite");
const output = path.resolve("outputs/desktop-qa");
let app;
try {
  await mkdir(userData, { recursive: true });
  await mkdir(output, { recursive: true });
  const bundle = path.join(root, "store.mjs");
  await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
    bundle: true, platform: "node", format: "esm", target: "node22" });
  const { DesktopStore } = await import(pathToFileURL(bundle).href);
  const store = new DesktopStore(userData);
  await store.create(dbPath);
  await store.savePlan({
    listingUrl: "https://example.org/jobs/senior-product-manager", company: "Northstar Labs",
    title: "Senior Product Manager", team: "Growth", locations: "Seattle, WA; Remote",
    description: "Lead discovery and product strategy for a growth platform. Partner with design, engineering, and analytics teams to define a roadmap, prioritize experiments, improve activation, and communicate outcomes to executive stakeholders. The role calls for customer research, data analysis, cross-functional leadership, and crisp product narratives.",
    keywords: ["Product strategy", "Customer discovery", "Roadmap prioritization", "Experimentation", "Activation", "Data analysis", "Stakeholder alignment", "Cross-functional leadership"],
    themes: ["Translate customer signals into focused product bets", "Lead experiments from hypothesis through learning", "Align partners on priorities and tradeoffs", "Use data to improve activation and adoption", "Communicate a clear product narrative"],
    overview: "Product leader experienced in shaping growth strategy through customer insight and data. Brings clear prioritization, strong cross-functional partnership, and a disciplined approach to experimentation. Connects product outcomes to business goals and communicates tradeoffs with clarity.",
  });
  store.close();
  await writeFile(path.join(userData, "settings.json"), JSON.stringify({ databasePath: dbPath }));
  const executablePath = process.platform === "win32"
    ? path.resolve("node_modules/electron/dist/electron.exe")
    : path.resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  app = await electron.launch({ executablePath, args: [path.resolve(".")],
    cwd: path.resolve("."), env: { ...process.env, PM_TRACKER_TEST_USER_DATA: userData } });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 880 });
  await page.getByRole("heading", { name: "Plan", exact: true }).waitFor();
  await page.getByText("Northstar Labs").first().waitFor();
  await page.screenshot({ path: path.join(output, "plan.png") });
  await page.getByRole("heading", { name: "Resume direction" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "plan-analysis.png") });
  await app.evaluate(() => {
    const originalFetch = globalThis.fetch;
    globalThis.__analysisCalls = [];
    globalThis.fetch = async (url, options) => {
      if (url === "https://api.openai.com/v1/responses") {
        globalThis.__analysisCalls.push(JSON.parse(options.body));
        return Response.json({ output: [{ type: "message", content: [{ type: "output_text",
          text: JSON.stringify({ keywords: ["Discovery", "Strategy", "Roadmap", "Experimentation", "Activation", "Analytics"],
            themes: ["Lead discovery", "Shape strategy", "Prioritize roadmap", "Run experiments", "Measure outcomes"],
            overview: "An ideal candidate connects product strategy to customer evidence and measurable outcomes." }) }] }] });
      }
      return originalFetch(url, options);
    };
  });
  await page.locator(".topbar-settings").click();
  await page.locator('input[type="password"]').fill("sk-test-only");
  await page.getByRole("button", { name: "Save API key" }).click();
  await page.getByText("API key saved on this computer.").waitFor();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Analyze again" }).click();
  await page.getByText("Analysis saved. You can edit any part of it.").waitFor();
  const calls = await app.evaluate(() => globalThis.__analysisCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gpt-6-sol");
  assert.equal(calls[0].store, false);
  await page.getByRole("button", { name: "Applications" }).click();
  await page.getByRole("heading", { name: "Applications", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "applications.png") });
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  await page.locator("#listing-url").fill("https://example.org/jobs/qa-pm");
  await page.getByPlaceholder("Company name").fill("QA Company");
  await page.getByPlaceholder("Senior Product Manager").fill("Product Manager");
  await page.getByPlaceholder("0 to 100").fill("85");
  await page.locator("#new-resume").setInputFiles({ name: "Resume.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nTest resume") });
  await page.getByRole("button", { name: "Save application" }).click();
  await page.getByText("Application added.").waitFor();
  await page.getByText("QA Company").waitFor();
  await page.screenshot({ path: path.join(output, "applications-filled.png") });
  await page.locator(".topbar-settings").click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "settings.png") });
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByPlaceholder("https://...").fill("https://example.org/jobs/new-role");
  await page.getByPlaceholder("Company name").fill("Second Company");
  await page.getByPlaceholder("Product Manager").fill("Group Product Manager");
  await page.getByPlaceholder("Read the listing or paste the full job description here.")
    .fill("This role leads product strategy, customer discovery, and delivery with engineering and design partners.");
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.getByText("Plan saved.").waitFor();
  await page.getByText("Second Company").first().waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(`Desktop UI smoke test passed. Screenshots: ${output}`);
} finally {
  await app?.close();
  if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
  await rm(root, { recursive: true, force: true });
}

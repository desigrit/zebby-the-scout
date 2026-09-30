import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

function simplePdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

try {
  await mkdir(userData, { recursive: true });
  await mkdir(output, { recursive: true });
  const bundle = path.join(root, "store.mjs");
  await build({ entryPoints: [path.resolve("desktop/store.ts")], outfile: bundle,
    bundle: true, platform: "node", format: "esm", target: "node22" });
  const { DesktopStore } = await import(pathToFileURL(bundle).href);
  const store = new DesktopStore(userData);
  await store.create(dbPath);
  const planResume = await store.addResume("Planning CV.pdf", "application/pdf",
    simplePdf("Product strategy and customer research with cross-functional roadmap delivery"));
  await store.savePlan({
    listingUrl: "https://example.org/jobs/senior-product-manager", company: "Northstar Labs",
    title: "Senior Product Manager", team: "Growth", locations: "Seattle, WA; Remote",
    description: "Lead discovery and product strategy for a growth platform. Partner with design, engineering, and analytics teams to define a roadmap, prioritize experiments, improve activation, and communicate outcomes to executive stakeholders. The role calls for customer research, data analysis, cross-functional leadership, and crisp product narratives.",
    currentOverview: "I help teams find customer needs and build useful products with clear priorities.",
    resumeId: planResume.id,
    keywords: ["Product strategy", "Customer discovery", "Roadmap prioritization", "Experimentation", "Activation", "Data analysis", "Stakeholder alignment", "Cross-functional leadership"],
    themes: ["Translate customer signals into focused product bets", "Lead experiments from hypothesis through learning", "Align partners on priorities and tradeoffs", "Use data to improve activation and adoption", "Communicate a clear product narrative"],
    overview: "Product leader experienced in shaping growth strategy through customer insight and data. Brings clear prioritization, strong cross-functional partnership, and a disciplined approach to experimentation. Connects product outcomes to business goals and communicates tradeoffs with clarity.",
  });
  store.close();
  await writeFile(path.join(userData, "settings.json"), JSON.stringify({ databasePath: dbPath, analysisProvider: "openai" }));
  const executablePath = process.platform === "win32"
    ? path.resolve("node_modules/electron/dist/electron.exe")
    : path.resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  app = await electron.launch({ executablePath, args: [path.resolve(".")],
    cwd: path.resolve("."), env: { ...process.env, PM_TRACKER_TEST_USER_DATA: userData } });
  const page = await app.firstWindow();
  const nav = page.getByRole("navigation", { name: "Workspace" });
  if (process.platform === "win32") assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()), null);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 880 });
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
  await page.getByText("Northstar Labs").first().waitFor();
  await page.screenshot({ path: path.join(output, "plan.png") });
  await app.evaluate(({ shell }) => {
    globalThis.__externalLinks = [];
    shell.openExternal = async (url) => { globalThis.__externalLinks.push(url); };
  });
  await page.getByRole("link", { name: "Open listing" }).click();
  await page.waitForTimeout(100);
  assert.deepEqual(await app.evaluate(() => globalThis.__externalLinks),
    ["https://example.org/jobs/senior-product-manager"]);
  await page.getByRole("heading", { name: "Resume direction" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "plan-analysis.png") });
  await app.evaluate(() => {
    const originalFetch = globalThis.fetch;
    globalThis.__analysisCalls = [];
    globalThis.fetch = async (url, options) => {
      if (url === "https://api.openai.com/v1/responses") {
        const body = JSON.parse(options.body);
        globalThis.__analysisCalls.push(body);
        if (body.text.format.name === "application_match") {
          return Response.json({ output: [{ type: "message", content: [{ type: "output_text",
            text: JSON.stringify({ score: 78, explanation: "Strong product strategy evidence, with a gap in activation metrics." }) }] }] });
        }
        return Response.json({ output: [{ type: "message", content: [{ type: "output_text",
          text: JSON.stringify({ keywords: ["Discovery", "Strategy", "Roadmap", "Experimentation", "Activation", "Analytics"],
            themes: ["Lead discovery", "Shape strategy", "Prioritize roadmap", "Run experiments", "Measure outcomes"],
            score: 83,
            overview: "I help teams find customer needs and build useful products with clear priorities.",
            overviewRationale: "The current overview already highlights customer needs and clear priorities, which match this role's discovery and roadmap work." }) }] }] });
      }
      return originalFetch(url, options);
    };
  });
  await nav.getByRole("button", { name: "Settings" }).click();
  await page.locator('input[type="password"]').fill("sk-test-only");
  await page.getByRole("button", { name: "Save API key" }).click();
  await page.getByText("API key saved on this computer.").waitFor();
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Refresh analysis" }).click();
  await page.getByText("Analysis saved. You can edit any part of it.").waitFor();
  const calls = await app.evaluate(() => globalThis.__analysisCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gpt-6-sol");
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].input[0].content[0].type, "input_file");
  assert.match(calls[0].input[0].content[1].text, /I help teams find customer needs/);
  await page.getByText("83%").waitFor();
  await page.getByText("No wording changes").waitFor();
  const unchangedRationale = page.getByText("The current overview already highlights customer needs", { exact: false });
  await unchangedRationale.waitFor();
  await unchangedRationale.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "plan-analyzed.png") });
  await nav.getByRole("button", { name: "Applications" }).click();
  await page.getByRole("main", { name: "Applications", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "applications.png") });
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  await page.screenshot({ path: path.join(output, "application-form.png") });
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (url === "/api/job-posting") return Response.json({
        details: { company: "Northstar Labs", title: "Senior Product Manager", team: "Growth", locations: "Seattle, WA; Bellevue, WA" },
        text: "Original offline job listing. Lead customer discovery, product strategy, roadmap planning, activation experiments, stakeholder communication, and cross-functional product delivery with design and engineering partners.",
      });
      return originalFetch(url, options);
    };
  });
  await page.locator("#listing-url").fill("https://example.org/jobs/senior-product-manager");
  await page.getByText("Saved a copy of the listing text for offline reference.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Remove Bellevue, WA" }).waitFor();
  await page.getByRole("button", { name: "Remove Bellevue, WA" }).click();
  await page.getByRole("button", { name: "Add location", exact: true }).click();
  await page.getByRole("textbox", { name: "New location" }).fill("Redmond, WA");
  await page.getByRole("textbox", { name: "New location" }).press("Enter");
  await page.locator("textarea.application-description").fill("");
  await page.evaluate(() => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/html", "<h2>Responsibilities</h2><ul><li>Lead discovery and product strategy with customers and partners</li><li>Prioritize roadmap work using evidence and outcomes</li></ul><p>Partner with design and engineering on activation experiments.</p>");
    clipboard.setData("text/plain", "Responsibilities Lead discovery and product strategy with customers and partners Prioritize roadmap work using evidence and outcomes Partner with design and engineering on activation experiments.");
    const area = document.querySelector("textarea.application-description");
    area.focus();
    area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  assert.match(await page.locator("textarea.application-description").inputValue(), /• Lead discovery.*\n• Prioritize roadmap/s);
  await page.getByPlaceholder("Company name").fill("QA Company");
  await page.getByPlaceholder("Senior Product Manager").fill("Product Manager");
  await page.locator("#new-resume").setInputFiles({ name: "Resume.pdf", mimeType: "application/pdf",
    buffer: simplePdf("Product strategy and customer discovery with roadmap and activation experiments") });
  await page.getByRole("button", { name: "Save application" }).click();
  await page.getByRole("table").getByText("78%").waitFor();
  await page.getByRole("table").getByText("QA Company", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Show all 2 locations" }).click();
  await page.locator(".location-expanded").getByText("Redmond, WA", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Hide extra locations" }).click();
  await page.getByRole("combobox", { name: "Filter by company" }).selectOption("QA Company");
  assert.match(await page.getByRole("combobox", { name: "Filter by company" }).textContent(), /QA Company \(1\)/);
  assert.match(await page.getByRole("combobox", { name: "Filter by status" }).textContent(), /Applied \(1\)/);
  await page.getByRole("combobox", { name: "Filter by company" }).selectOption("");
  await page.getByRole("button", { name: "Notes for Product Manager at QA Company" }).click();
  const notesArea = page.getByRole("dialog", { name: "Application notes" }).getByRole("textbox", { name: "Notes" });
  const capturedNotes = await notesArea.inputValue();
  assert.match(capturedNotes, /Original offline job listing/);
  await notesArea.fill(`${capturedNotes}\n\nPre-screen: discuss team scope.\nPerson: Hiring manager`);
  await page.getByRole("button", { name: "Save notes" }).click();
  await page.getByText("Notes saved.").waitFor();
  await page.getByRole("button", { name: "Notes for Product Manager at QA Company" }).click();
  assert.match(await page.getByRole("dialog", { name: "Application notes" }).getByRole("textbox", { name: "Notes" }).inputValue(), /Hiring manager/);
  await page.getByRole("dialog", { name: "Application notes" }).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete Product Manager at QA Company" }).click();
  await page.getByRole("dialog", { name: "Delete application?" }).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("table").getByText("QA Company", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  await page.locator("#listing-url").fill("https://example.org/jobs/senior-product-manager?utm_source=mail");
  await page.getByText("This listing is already saved.").waitFor();
  await page.getByRole("button", { name: "Close form" }).click();
  await page.getByRole("button", { name: "Notes for Product Manager at QA Company" }).click();
  assert.match(await notesArea.inputValue(), /Original offline job listing/);
  const dialogBounds = await page.getByRole("dialog", { name: "Application notes" }).boundingBox();
  assert.ok(dialogBounds && Math.abs(dialogBounds.x + dialogBounds.width / 2 - 640) < 20);
  await page.screenshot({ path: path.join(output, "listing-notes.png") });
  await page.getByRole("dialog", { name: "Application notes" }).getByRole("button", { name: "Cancel" }).click();
  assert.equal((await app.evaluate(() => globalThis.__analysisCalls)).length, 2);
  assert.equal((await app.evaluate(() => globalThis.__analysisCalls))[1].input[0].content[0].type, "input_file");
  await page.screenshot({ path: path.join(output, "applications-filled.png") });
  await app.evaluate(() => {
    const originalFetch = globalThis.fetch;
    globalThis.__ollamaCalls = [];
    globalThis.fetch = async (url, options) => {
      if (url === "http://localhost:11434/api/tags") return Response.json({ models: [
        { name: "qwen3:8b" }, { name: "qwen3.8:27b" },
      ] });
      if (url === "http://localhost:11434/api/chat") {
        const body = JSON.parse(options.body);
        globalThis.__ollamaCalls.push(body);
        const match = !body.format.required.includes("keywords");
        return Response.json({ done: true, message: { content: JSON.stringify(match
          ? { score: 81, explanation: "Relevant product work, with one missing metric." }
          : { keywords: ["Discovery", "Strategy", "Roadmap", "Experimentation", "Activation", "Analytics"],
            themes: ["Lead discovery", "Shape strategy", "Prioritize roadmap", "Run experiments", "Measure outcomes"],
            score: 86, overview: "I lead product strategy with customer evidence and clear priorities.",
            overviewRationale: "Light revision: I brought customer evidence and product strategy forward to reflect the role's discovery focus." }) } });
      }
      return originalFetch(url, options);
    };
  });
  await nav.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Provider" }).selectOption("ollama");
  await page.waitForFunction(() => document.querySelector('select')?.value === "ollama");
  assert.equal(await page.getByRole("combobox", { name: "Provider" }).inputValue(), "ollama");
  await page.getByRole("combobox", { name: "Model" }).getByRole("option", { name: "qwen3.8:27b" }).waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Refresh models" }).click();
  await page.getByText("2 installed models found.", { exact: false }).waitFor();
  await page.getByRole("combobox", { name: "Model" }).selectOption("qwen3.8:27b");
  assert.equal(await page.getByRole("combobox", { name: "Model" }).inputValue(), "qwen3.8:27b");
  await page.getByRole("button", { name: "Save Ollama settings" }).click();
  await page.getByText("Ollama server and model saved on this computer.").waitFor();
  await page.screenshot({ path: path.join(output, "settings.png") });
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Refresh analysis" }).click();
  await page.getByText("Analysis saved. You can edit any part of it.").waitFor();
  await page.getByText("What changed").waitFor();
  const changedRationale = page.getByText("Light revision: I brought customer evidence", { exact: false });
  await changedRationale.waitFor();
  await changedRationale.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "plan-revised.png") });
  await nav.getByRole("button", { name: "Applications" }).click();
  await page.getByRole("button", { name: "Refresh match for Product Manager at QA Company" }).click();
  await page.getByRole("table").getByText("81%").waitFor();
  const ollamaCalls = await app.evaluate(() => globalThis.__ollamaCalls);
  assert.equal(ollamaCalls.length, 2);
  assert.equal(ollamaCalls[0].model, "qwen3.8:27b");
  assert.equal(ollamaCalls[1].model, "qwen3.8:27b");
  assert.match(ollamaCalls[0].messages[1].content, /I help teams find customer needs/);
  assert.match(ollamaCalls[0].messages[1].content, /Product strategy and customer research/);
  assert.match(ollamaCalls[1].messages[1].content, /Product strategy and customer discovery/);
  await nav.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Dark" }).check();
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.waitForFunction(() => !document.querySelector('.settings-actions button')?.disabled);
  await page.waitForFunction(() => {
    const button = document.querySelector('.settings-actions .button-secondary');
    return button && getComputedStyle(button).backgroundColor === "rgb(41, 55, 45)";
  });
  const darkButton = await page.getByRole("button", { name: "Open database" }).evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  assert.equal(darkButton.background, "rgb(41, 55, 45)");
  await page.screenshot({ path: path.join(output, "settings-dark.png") });
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(output, "plan-dark.png") });
  await nav.getByRole("button", { name: "Applications" }).click();
  await page.getByRole("main", { name: "Applications", exact: true }).waitFor();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(output, "applications-dark.png") });
  await nav.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Light" }).check();
  await page.locator('html[data-theme="light"]').waitFor();
  await page.getByRole("switch", { name: "Capture diagnostic logs" }).check();
  await page.getByText("Diagnostic logging is on.").waitFor();
  const savedSettings = JSON.parse(await readFile(path.join(userData, "settings.json"), "utf8"));
  assert.equal(savedSettings.appearance, "light");
  assert.equal(savedSettings.captureLogs, true);
  assert.match(await readFile(path.join(userData, "Logs", "tracker.log"), "utf8"), /Diagnostic logging enabled/);
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByPlaceholder("https://...").fill("https://example.org/jobs/new-role");
  await page.getByPlaceholder("Company name").fill("Second Company");
  await page.getByPlaceholder("Product Manager").fill("Group Product Manager");
  await page.getByPlaceholder("Read the listing or paste the full job description here.")
    .fill("This role leads product strategy, customer discovery, and delivery with engineering and design partners.");
  await page.getByPlaceholder("Paste the overview from your current CV here.")
    .fill("I work with teams to build products that help customers.");
  await page.locator('.plan-upload input[type="file"]').setInputFiles({ name: "Second CV.pdf", mimeType: "application/pdf",
    buffer: simplePdf("Product strategy and customer discovery") });
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.getByText("Plan saved.").waitFor();
  await page.getByText("Second Company").first().waitFor();
  assert.equal(await page.getByRole("combobox", { name: "Resume for this role" }).locator("option:checked").textContent(), "Second CV.pdf");
  assert.equal(errors.length, 0, errors.join("\n"));
  await app.close();
  app = await electron.launch({ executablePath, args: [path.resolve(".")],
    cwd: path.resolve("."), env: { ...process.env, PM_TRACKER_TEST_USER_DATA: path.join(root, "fresh-profile") } });
  const freshPage = await app.firstWindow();
  await freshPage.getByRole("main", { name: "Plan", exact: true }).waitFor();
  assert.equal((await app.evaluate(({ app }) => app.getPath("userData"))).endsWith("fresh-profile"), true);
  await freshPage.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Applications", exact: true }).click();
  await freshPage.getByRole("button", { name: "Add application", exact: true }).click();
  await freshPage.getByRole("button", { name: "Save application" }).click();
  await freshPage.getByText("Application added.").waitFor();
  await freshPage.getByText("Untitled role").waitFor();
  await freshPage.getByText("Not scored").last().waitFor();
  assert.ok((await readFile(path.join(root, "fresh-profile", "PM Applications.sqlite"))).length > 0);
  console.log(`Desktop UI smoke test passed. Screenshots: ${output}`);
} finally {
  await app?.close();
  if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory");
  await rm(root, { recursive: true, force: true });
}

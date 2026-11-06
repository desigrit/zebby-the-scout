import assert from "node:assert/strict";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { _electron } from "playwright-core";
import sharp from "sharp";

const output = path.resolve("qa-output/boards-recovery"), profile = path.join(output, "profile");
const cloud = path.join(profile, "Synced applications");
const applications = path.join(cloud, "Product Management Applications.sqlite");
await mkdir(cloud, { recursive: true });
const bundle = path.join(output, "fixtures.mjs");
await build({ stdin: { contents: "export * from './desktop/store'; export * from './desktop/boards-store';",
  resolveDir: process.cwd() }, outfile: bundle, bundle: true, platform: "node", format: "esm", target: "node22" });
const { DesktopStore, BoardsStore, boardsCompanionPath } = await import(pathToFileURL(bundle).href);
const applicationsStore = new DesktopStore(profile); await applicationsStore.create(applications); applicationsStore.close();
const fixture = new BoardsStore(profile); await fixture.openCompanion(applications);
const [id] = await fixture.add([{ company: "Example Product", url: "https://example.org/careers", instructions: "Senior Product Manager roles only." }]);
const baseline = { jobs: [{ key: "one", url: "https://example.org/careers/one", matches: true }], pages: 1, provider: "fixture", model: "" };
await fixture.complete(id, 1, fixture.generation, baseline);
await fixture.complete(id, 1, fixture.generation, { ...baseline, jobs: [...baseline.jobs,
  { key: "two", url: "https://example.org/careers/two", matches: true }] });
const expected = fixture.get(id); await fixture.close();
const companion = boardsCompanionPath(applications), moved = companion + ".moved";
await writeFile(path.join(profile, "settings.json"), JSON.stringify({ databasePath: applications,
  analysisProvider: "ollama", ollamaUrl: "http://localhost:11434", ollamaModel: "fixture", appearance: "light" }));
const env = { ...process.env, PM_TRACKER_TEST_USER_DATA: profile, PM_TRACKER_TEST_HIDE_WINDOW: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const checks = [], captures = [];
try {
  app = await _electron.launch({ executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
    args: [process.cwd(), "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding", "--disable-gpu"],
    cwd: process.cwd(), env });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setOpacity(0); win.setSkipTaskbar(true); win.setFocusable(false); win.showInactive();
  });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav.getByRole("button", { name: "Boards", exact: true }).click();
  await page.getByText("1 new listing.", { exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(() => window.desktop.boardsState())).boards[0], expected);
  const appBytes = await readFile(applications), boardBytes = await readFile(companion);
  async function capture(name, width = 1550, height = 850, theme = "light") {
    await app.evaluate(({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(Math.max(790, size[0]), size[1]);
      win.webContents.setZoomFactor(size[0] < 790 ? 790 / size[0] : 1);
    }, [width, height]);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.evaluate(async () => { await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
    await page.locator(".boards-file-recovery").scrollIntoViewIfNeeded();
    const metrics = await page.locator(".boards-file-recovery").evaluate(element => {
      const style = getComputedStyle(element), heading = getComputedStyle(element.querySelector("h2"));
      const actions = [...element.querySelectorAll(".settings-action")].map(button => {
        const r = button.getBoundingClientRect(); return { label: button.textContent, width: r.width, height: r.height };
      });
      return { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, dpr: window.devicePixelRatio, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, headingSize: heading.fontSize, marginTop: style.marginTop, actions };
    });
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, name + " wraps paths");
    for (const action of metrics.actions) {
      assert.ok(Math.round(action.height) >= 36 && Math.round(action.width) >= 96,
        name + " preserves action targets at fractional zoom: " + JSON.stringify(action));
    }
    assert.equal(await page.locator(".desktop-workspace").evaluate(element => element.scrollWidth > element.clientWidth), false);
    const png = path.join(output, name + ".png");
    const image = Buffer.from(await app.evaluate(async ({ BrowserWindow }) => {
      const capture = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      return capture.toPNG().toString("base64");
    }), "base64");
    const dimensions = await sharp(image).metadata();
    assert.ok(Math.abs(dimensions.width - metrics.viewportWidth * metrics.dpr) <= 2, "Capture includes the full scaled window width");
    assert.ok(Math.abs(dimensions.height - metrics.viewportHeight * metrics.dpr) <= 2, "Capture includes the full scaled window height");
    await writeFile(png, image);
    captures.push({ name, width, height, theme, metrics });
  }
  await rename(companion, moved);
  await page.evaluate(() => window.desktop.retryBoardsSave());
  const recovery = page.getByRole("region", { name: "Couldn't find your Boards file." });
  await recovery.waitFor();
  assert.equal(await page.locator(".boards-error").count(), 0, "The missing-file message is not duplicated as an error banner");
  await capture("boards-missing-windows-light");
  await capture("boards-missing-windows-dark-narrow", 790, 620, "dark");
  await recovery.getByRole("button", { name: "Retry", exact: true }).focus();
  await page.keyboard.press("Enter");
  await recovery.getByRole("status").filter({ hasText: "The file is still missing." }).waitFor();
  assert.equal(await recovery.getByRole("button", { name: "Create new Boards file" }).isEnabled(), true);
  await rename(moved, companion);
  await recovery.getByRole("button", { name: "Retry", exact: true }).click();
  await recovery.waitFor({ state: "hidden" });
  assert.deepEqual((await page.evaluate(() => window.desktop.boardsState())).boards[0], expected);
  await page.waitForFunction(() => document.activeElement?.classList.contains("boards-title"));
  checks.push("Retry preserves history and unread counts, and restores keyboard focus");
  await rename(companion, moved);
  await page.evaluate(() => window.desktop.retryBoardsSave());
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await recovery.waitFor();
  await capture("boards-settings-missing-windows-light", 1550, 850, "light");
  await capture("boards-settings-missing-windows-dark-narrow", 600, 760, "dark");
  await recovery.getByRole("button", { name: "Create new Boards file" }).click();
  await recovery.waitFor({ state: "hidden" });
  const created = await page.evaluate(() => window.desktop.boardsState());
  assert.deepEqual(created.boards, []); assert.equal(created.filePath, companion);
  assert.equal(created.fileMissing, false); assert.equal(created.dirty, false); assert.equal(created.error, "");
  assert.ok((await stat(created.savedCopyPath)).isFile());
  assert.deepEqual(await readFile(moved), boardBytes); assert.deepEqual(await readFile(applications), appBytes);
  await page.getByText(created.savedCopyPath, { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.classList.contains("boards-database"));
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, created.savedCopyPath);
  await page.getByRole("button", { name: "Import Boards history" }).click();
  await page.waitForFunction(() => window.desktop.boardsState().then(state => state.boards.length === 1));
  assert.deepEqual((await page.evaluate(() => window.desktop.boardsState())).boards[0], expected);
  checks.push("Creation preserves Applications and moved history; the saved copy imports every board field and unread count");
  const rejected = await page.evaluate(() => window.desktop.createBoardsFile().then(() => "", error => error.message));
  assert.match(rejected, /Retry opening/); assert.deepEqual((await page.evaluate(() => window.desktop.boardsState())).boards[0], expected);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "report.json"), JSON.stringify({ checks, captures }, null, 2));
  console.log(JSON.stringify({ checks, captures }, null, 2));
  if (process.env.ZEBBY_RECOVERY_IMAGE_LOGS === "1") {
    for (const capture of captures) {
      const bytes = await sharp(path.join(output, capture.name + ".png")).resize({ width: 1100, withoutEnlargement: true }).png().toBuffer();
      console.log("ZEBBY_RECOVERY_IMAGE:" + capture.name + ":" + bytes.toString("base64"));
    }
  }
} finally { await app?.close(); }

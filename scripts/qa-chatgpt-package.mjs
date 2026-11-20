import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { _electron } from "playwright-core";
import { AnalysisJobs, jobDigest } from "../desktop/chatgpt/analysis-jobs.ts";
const manifest = JSON.parse(await readFile("package.json", "utf8"));

assert.equal(process.env.GITHUB_ACTIONS, "true", "Run packaged ChatGPT checks on an isolated GitHub runner.");

const output = path.resolve("qa-output/chatgpt"), profile = path.resolve("work/chatgpt-package-profile");
await mkdir(output, { recursive: true }); await mkdir(profile, { recursive: true });
const jobRequest = { version: 1, workspace: "package-test", target: "package-test", revision: "1", account: "fixture",
  model: "selected-model", thinking: "high", name: "application_match", instructions: "Return a score.", input: { jobDescription: "Product role" },
  schema: { type: "object", additionalProperties: false, properties: { score: { type: "integer" } }, required: ["score"] } };
const jobs = new AnalysisJobs(path.join(profile, "analysis-jobs")); await jobs.initialize();
const saved = await jobs.run(jobRequest, new AbortController().signal, async execution => {
  await execution.started(); await execution.usage({ usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140, cachedInputTokens: 60, reasoningTokens: 20 } });
  return { score: 82 };
});
await jobs.applied(saved);
const archivedRequest = { ...jobRequest, revision: "archived" }, archivedId = jobDigest(archivedRequest);
const archivedResult = await jobs.run(archivedRequest, new AbortController().signal, async () => ({ score: 75 }));
await jobs.applied(archivedResult);
const archivedFolder = path.join(profile, "analysis-jobs", archivedId), archivedStateFile = path.join(archivedFolder, "state.json");
const archivedState = JSON.parse(await readFile(archivedStateFile, "utf8"));
archivedState.createdAt = "2020-01-01T00:00:00Z"; archivedState.updatedAt = "2020-01-01T00:00:00Z";
const archivedContent = JSON.stringify(archivedState);
await writeFile(archivedStateFile, archivedContent);
let app;
try {
  const mac = process.platform === "darwin";
  const executablePath = path.resolve(mac ? "desktop-packages/mac-arm64/Zebby.app/Contents/MacOS/Zebby" : "desktop-packages/win-unpacked/Zebby.exe");
  app = await _electron.launch({ executablePath,
    args: ["--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding", "--disable-gpu"],
    env: { ...process.env, PM_TRACKER_TEST_USER_DATA: profile, PM_TRACKER_TEST_HIDE_WINDOW: "1" } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.desktop));
  const state = await page.evaluate(() => window.desktop.state());
  assert.equal(state.privateBuild, undefined); assert.equal(state.updates.currentVersion, manifest.version);
  assert.equal(state.chatgpt.connected, false); assert.equal(state.chatgpt.available, true);
  assert.ok(!state.chatgpt.jobs.some(job => job.id === archivedId));
  assert.equal(await readFile(archivedStateFile, "utf8"), archivedContent);
  assert.deepEqual(JSON.parse(await readFile(path.join(archivedFolder, "attempts", archivedState.attempt, "result.json"), "utf8")), { score: 75 });
  assert.equal(state.filePath, ""); assert.equal(state.updates.available, null);
  const identity = await app.evaluate(({ app, safeStorage }) => ({ name: app.getName(), profile: app.getPath("userData"), secureStorage: safeStorage.isEncryptionAvailable(), packaged: app.isPackaged }));
  assert.equal(identity.name, "Zebby"); assert.equal(path.resolve(identity.profile), profile);
  assert.equal(identity.secureStorage, true); assert.equal(identity.packaged, true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(await page.getByLabel("Analyze with", { exact: true }).locator('option[value="chatgpt"]').innerText(), "ChatGPT plan");
  await page.getByLabel("Analyze with", { exact: true }).selectOption("chatgpt");
  await page.getByRole("button", { name: "Continue with ChatGPT", exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).analysisProvider, "chatgpt");
  const jobId = jobDigest(jobRequest);
  assert.equal(state.chatgpt.jobs.find(job => job.id === jobId).attempts[0].usage.totalTokens, 140);
  // Exercise the real native bridge while recording the requested folder instead of launching Explorer.
  await app.evaluate(({ shell }) => { globalThis.openedJobFolders = []; shell.openPath = async folder => { globalThis.openedJobFolders.push(folder); return ""; }; });
  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await page.getByRole("button", { name: "Run details for Application match", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".chatgpt-run-details")?.disabled === false);
  assert.deepEqual(await app.evaluate(() => globalThis.openedJobFolders), [path.join(profile, "analysis-jobs", jobId)]);
  await page.evaluate(id => window.desktop.openChatGPTJobs(id), archivedId);
  assert.equal(await app.evaluate(() => globalThis.openedJobFolders.at(-1)), archivedFolder);
  const unsafeFolder = await page.evaluate(() => window.desktop.openChatGPTJobs("../outside").then(() => "", error => error.message));
  assert.match(unsafeFolder, /not found/);
  assert.equal(await page.evaluate(() => "retainChatGPTJob" in window.desktop || "exportChatGPTJob" in window.desktop || "clearChatGPTJobs" in window.desktop), false);
  const signInError = await page.evaluate(() => window.desktop.connectChatGPT("missing-account").then(() => "", error => error.message));
  assert.match(signInError, /saved ChatGPT account/i); assert.doesNotMatch(signInError, /ChatGPTPlanError/);
  const checked = await page.evaluate(() => window.desktop.checkForUpdates());
  assert.equal(checked.checking, false);
  assert.equal(checked.available, null);
  assert.equal(checked.error, "");
  assert.ok(checked.checkedAt);
  await page.getByRole("button", { name: "Check for updates", exact: true }).click();
  await page.getByText("Up to date", { exact: true }).waitFor();
  await writeFile(path.join(output, "package-verification.json"), JSON.stringify({ name: identity.name, platform: process.platform, packaged: true, version: state.updates.currentVersion, isolatedProfile: true, secureStorage: true, chatGPTProvider: true, publicUpdater: true, jobUsage: true, runDetailsFolder: true, archivedHistoryPreserved: true, sevenDayHistory: true }, null, 2));
  console.log("Packaged public app verified: identity, isolated profile, secure storage, native IPC and platform update behavior.");
} finally { await app?.close(); }

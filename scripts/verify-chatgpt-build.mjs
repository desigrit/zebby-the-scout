import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const main = await readFile("desktop-dist/main.cjs", "utf8");
const preload = await readFile("desktop-dist/preload.cjs", "utf8");
const assets = "desktop-dist/renderer/assets";
const renderer = (await Promise.all((await readdir(assets)).filter(file => file.endsWith(".js"))
  .map(file => readFile(path.join(assets, file), "utf8")))).join("\n");
assert.match(main, /agent_name_hint.*, "Zebby"/);
assert.match(main, /chatgpt-credentials\.enc/);
assert.match(main, /desigrit\/zebby-the-scout/);
for (const channel of ["connect", "cancel-connect", "disconnect", "models", "configure", "test", "usage", "welcome", "jobs"]) {
  assert.ok(main.includes(`chatgpt:${channel}`), `Missing main handler: ${channel}`);
  assert.ok(preload.includes(`chatgpt:${channel}`), `Missing preload bridge: ${channel}`);
}
for (const text of ["Continue with ChatGPT", "ChatGPT plan", "Run details", "Saved result reused"]) assert.ok(renderer.includes(text), text);
for (const bundle of [main, preload, renderer]) {
  for (const text of ["__ZEBBY_PRIVATE__", "private:chatgpt-", "zebby-private/releases", "ChatGPT plan (Private)", "Private updates use your GitHub CLI"]) {
    assert.equal(bundle.includes(text), false, `Private boundary leaked into public: ${text}`);
  }
}
console.log("Public bundles include ChatGPT and retain public release identity.");

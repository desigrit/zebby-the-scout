import { spawn } from "node:child_process";
import path from "node:path";

// Run the packaged Electron binary as Node, never as the desktop app. This
// verifies that its ASAR worker and bundled native libraries work together.
const executable = process.platform === "darwin"
  ? path.resolve("desktop-packages/mac-arm64/Zebby.app/Contents/MacOS/Zebby")
  : path.resolve("desktop-packages/win-unpacked/Zebby.exe");
const child = spawn(executable, ["--experimental-strip-types", "scripts/qa-local-engine.mjs", process.argv[2] || "smollm2-360m", "--packaged"],
  { windowsHide: true, stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });

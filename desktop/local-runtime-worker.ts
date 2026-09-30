import { spawn } from "node:child_process";

// This helper never opens an Electron window. It releases the native engine if
// the parent app closes or crashes, including while a model is loading.
const parentPid = Number(process.argv[2]);
const executable = process.argv[3];
if (!Number.isInteger(parentPid) || parentPid < 1 || !executable) process.exit(1);
const child = spawn(executable, process.argv.slice(4), {
  windowsHide: true, stdio: "ignore", env: process.env,
});
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  child.kill();
  setTimeout(() => { child.kill("SIGKILL"); process.exit(0); }, 2500).unref();
}
child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(code || 0));
process.on("SIGTERM", close);
process.on("SIGINT", close);
process.stdin.on("data", close);
process.stdin.on("end", close);
process.stdin.resume();
setInterval(() => {
  try { process.kill(parentPid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") close(); }
}, 1000).unref();

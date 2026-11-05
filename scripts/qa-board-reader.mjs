import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import electron from "electron";

// Opt-in live coverage check. No model calls, credentials, or personal databases.
// The test extractor accepts observed, site-specific vacancy links so this check
// measures loading and pagination independently from model quality.
const root = path.resolve("qa-output/boards-reader");
const model = process.env.ZEBBY_QA_BOARD_MODEL || "";
const instructions = process.env.ZEBBY_QA_BOARD_INSTRUCTIONS || "";
if (instructions && !model) throw new Error("Choose a local model to check tracking instructions.");
await mkdir(path.join(root, "profile"), { recursive: true });
const urls = process.argv.slice(2).length ? process.argv.slice(2) : [
  "https://slack.com/careers/dept/product",
  "https://jobs.uber.com/en/jobs/?team=Product&countries=United+States",
  "https://www.metacareers.com/jobsearch/?offices[0]=Menlo%20Park%2C%20CA&roles[0]=Full%20time%20employment&q=Product%20Manager",
];
const outfile = path.join(root, "reader.cjs");
await build({ stdin: { resolveDir: process.cwd(), contents: `
  import { app } from 'electron';
  import { writeFile } from 'node:fs/promises';
  import { BoardBrowser } from './desktop/board-browser';
  import { scanBoard } from './desktop/boards-scan';
  import { isFigmaCareers } from './desktop/board-page';
  import { isNetflixSearch } from './desktop/netflix-board';
  import { verifySavedNetflixBoard } from './scripts/qa-netflix-board.mjs';
  import { analyzeWithOllama } from './desktop/ollama';
  import { boardModelContract } from './shared/boards';
  app.setPath('userData', ${JSON.stringify(path.join(root, "profile"))});
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
  let failed = false;
  for (const [index, url] of ${JSON.stringify(urls)}.entries()) {
    let reader;
    try {
      const model = ${JSON.stringify(model)};
      if (!model && isNetflixSearch(new URL(url))) { await verifySavedNetflixBoard(url, ${JSON.stringify(root)}); continue; }
      const controller = new AbortController();
      reader = new BoardBrowser(controller.signal);
      const originalRead = reader.read.bind(reader);
      const figmaCheck = !model && isFigmaCareers(new URL(url));
      const productUrls = new Set(), observedRoles = new Map();
      reader.read = async () => { const page = await originalRead();
        if (figmaCheck) for (const job of page.candidates) {
          if (job.department && new URL(job.url).pathname.startsWith('/figma/jobs/')) observedRoles.set(job.url, job);
          if (job.department?.trim().toLowerCase() === 'product' && /product manager/i.test(job.title)) productUrls.add(job.url);
        }
        await writeFile(${JSON.stringify(root)} + '/page-' + index + '.json', JSON.stringify(page, null, 2));
        return page;
      };
      const scan = await scanBoard({ url, reader, instructions: figmaCheck ? "Look under the Product heading for product manager roles." : ${JSON.stringify(instructions)}, signal: controller.signal, provider: model ? 'ollama' : 'coverage-test', model: model || 'observed-ids', batchSize: model ? 12 : 40,
        extract: async input => model ? analyzeWithOllama({ baseUrl: 'http://localhost:11434', model,
          ...boardModelContract(input), content: JSON.stringify(input), thinkingLevel: 'off', signal: controller.signal })
          : input.task === 'roles' ? { decisions: Object.fromEntries(input.candidates.map(job => {
            if (job.department?.trim().toLowerCase() !== 'product') throw new Error('A candidate outside Product reached the role classifier.');
            return [job.id, /product manager/i.test(job.title)];
          })) } : ({ listingIds: input.candidates.map(candidate => candidate.id), nextControlId: '' }),
        progress: (message, phase) => { if (phase === 'reading') console.log(new URL(url).hostname + ': ' + message); } });
      const matches = scan.jobs.filter(job => job.matches);
      if (figmaCheck && (!productUrls.size || matches.length !== productUrls.size || matches.some(job => !productUrls.has(job.url)))) {
        throw new Error('The live Product heading and the matched Product Manager links differ.');
      }
      if (figmaCheck) {
        const rows = [...observedRoles.values()];
        const selected = [...rows.filter(job => productUrls.has(job.url)).slice(0, 3),
          ...rows.filter(job => !productUrls.has(job.url) && job.department.trim().toLowerCase() !== 'product').slice(0, 2)];
        if (!selected.some(job => !productUrls.has(job.url))) throw new Error('No contrasting department for provider verification.');
        const candidates = selected.map((job, i) => ({ ...job, id: 'l' + i }));
        const sample = { input: { task: 'roles', criteria: 'Look under the Product heading for product manager roles.', candidates },
          expected: Object.fromEntries(candidates.map(job => [job.id, productUrls.has(job.url)])) };
        await writeFile(${JSON.stringify(root)} + '/figma-sample.json', JSON.stringify(sample));
      }
      await writeFile(${JSON.stringify(root)} + '/matches-' + index + '.json', JSON.stringify(matches, null, 2));
      console.log(JSON.stringify({ host: new URL(url).hostname, pages: scan.pages, jobs: scan.jobs.length, matches: matches.length, model: model || 'coverage-test', status: 'complete' }));
    } catch (error) { failed = true; console.error(new URL(url).hostname + ': ' + error.message); }
    finally { reader?.close(); }
  }
  app.exit(failed ? 1 : 0);
  }).catch(error => { console.error(error); app.exit(1); });
` }, outfile, bundle: true, platform: "node", format: "cjs", target: "node24", external: ["electron", "node:*"] });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [outfile], { env, stdio: "inherit", windowsHide: true });
process.exitCode = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => resolve(code || 0)); });

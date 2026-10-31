import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import electron from "electron";

const output = path.resolve("qa-output/tailored-resume");
await mkdir(output, { recursive: true });
await build({ stdin: { resolveDir: process.cwd(), sourcefile: "tailored-files-qa.ts", loader: "ts", contents: `
import { app } from "electron";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { printResumePdf } from "./desktop/resume-pdf";
import { resumeDocx, resumeHtml, readResumeBlocks } from "./desktop/tailored-resume";
import { getDocumentProxy } from "unpdf";
const output=process.env.ZEBBY_RESUME_QA_OUTPUT!;
app.setPath("userData", path.join(output,"profile"));
app.on("window-all-closed",()=>{});
const blocks=[{id:0,text:"Alex Morgan",style:"name",editable:false},
{id:1,text:"alex@example.com | Seattle, WA | linkedin.com/in/alexmorgan",style:"contact",editable:false},
{id:2,text:"Professional summary",style:"heading",editable:false},
{id:3,text:"Product manager who turns customer research into focused product decisions. Experienced in discovery, cross-functional delivery and measuring customer outcomes.",style:"paragraph",editable:true},
{id:4,text:"Experience",style:"heading",editable:false},
{id:5,text:"Senior Product Manager | Fieldwork | 2022 - Present",style:"paragraph",editable:false},
...["Partnered with design and engineering on customer research, improving activation by 18%.",
"Led discovery interviews and translated findings into a roadmap that balanced customer needs with technical constraints.",
"Built a weekly measurement practice so the team could compare outcomes and adjust priorities.",
"Improved handoffs between customer-facing teams and engineering through clearer problem statements and shared measures."].map((text,i)=>({id:6+i,text,style:"bullet",editable:true})),
{id:10,text:"Product Manager | Orbit | 2019 - 2022",style:"paragraph",editable:false},
{id:11,text:"Worked with analysts and designers to improve the onboarding journey and prioritize customer feedback.",style:"bullet",editable:true},
{id:12,text:"Skills",style:"heading",editable:false},
{id:13,text:"Customer discovery, product strategy, prioritization, experimentation, SQL, cross-functional leadership",style:"paragraph",editable:true},
{id:14,text:"Education",style:"heading",editable:false},
{id:15,text:"B.S. Computer Science | Example University | 2015 - 2019",style:"paragraph",editable:false}];
app.whenReady().then(async()=>{
 try {
  const html=resumeHtml(blocks as any);
  const pdf=await printResumePdf(html,new AbortController().signal);
  const docx=await resumeDocx(blocks as any);
  const parsed=await readResumeBlocks("Tailored.pdf",pdf);
  for(const source of blocks) assert.ok(parsed.some(block=>block.text===source.text),"Paragraph preserved: "+source.id);
  const text=parsed.map(b=>b.text).join(" ");
  for(const expected of ["Alex Morgan","alex@example.com","18%","2019 - 2022","Example University"]) assert.ok(text.includes(expected),expected);
  assert.ok(Buffer.from(pdf).subarray(0,5).toString()==="%PDF-");
  const document=await getDocumentProxy(new Uint8Array(pdf));assert.equal(document.numPages,1);await document.loadingTask.destroy();
  await writeFile(path.join(output,"Alex Morgan - 123456 - tailored.pdf"),pdf);
  await writeFile(path.join(output,"Alex Morgan - 123456 - tailored.docx"),docx);
  await writeFile(path.join(output,"resume.html"),html);
  const controller=new AbortController();controller.abort();
  await assert.rejects(printResumePdf(html,controller.signal),e=>e.name==="AbortError");
  await writeFile(path.join(output,"report.json"),JSON.stringify({passed:true,pdfBytes:pdf.length,docxBytes:docx.length,protectedContentPresent:true,cancellation:true}));
  app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
` }, outfile: path.join(output, "runner.cjs"), bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron"] });
const childEnv = { ...process.env, ZEBBY_RESUME_QA_OUTPUT: output };
delete childEnv.ELECTRON_RUN_AS_NODE;
await promisify(execFile)(electron, [path.join(output, "runner.cjs"), "--disable-gpu"], {
  env: childEnv, windowsHide: true, timeout: 90000,
});
const report = JSON.parse(await readFile(path.join(output, "report.json"), "utf8"));
assert.equal(report.passed, true);
console.log("Word/PDF generation, source content, and cancellation checks passed.");

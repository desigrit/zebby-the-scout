import assert from "node:assert/strict";
import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BoardBrowser } from "../desktop/board-browser.ts";
import { scanBoard } from "../desktop/boards-scan.ts";

const output = path.resolve("qa-output/board-layers"), reports = [];
const html = (title, body) => new Response('<!doctype html><html><head><title>' + title + '</title></head><body style="margin:20px;font:18px system-ui">' + body + '</body></html>', { headers: { "content-type": "text/html; charset=utf-8" } });
async function browser(handler) {
  const controller = new AbortController(), reader = new BoardBrowser(controller.signal);
  await reader.window.webContents.session.protocol.handle("https", handler);
  return { reader, signal: controller.signal };
}

async function visualFixture() {
  const root = "https://example.org/careers?team=Product", frame = "https://www.iana.org/results?team=Product", inner = "https://example.org/list?team=Product";
  const fixture = await browser(request => {
    const url = new URL(request.url);
    if (url.pathname === "/careers") return html("Careers", '<a href="https://example.org/about">About us</a><iframe style="display:block;width:1100px;height:260px" src="' + frame + '"></iframe>');
    if (url.pathname === "/results") return html("Embedded container", '<iframe style="width:100%;height:220px" src="' + inner + '"></iframe>');
    return html("Product openings", `<p>2 open jobs</p><div id="jobs"></div><script>
      const root = document.querySelector('#jobs').attachShadow({mode:'open'});
      root.innerHTML = '<h2>Product</h2><div id="list"></div><button style="width:80px;height:40px"><svg width="30" height="25"><path d="M2 12h20m-7-7 7 7-7 7" stroke="black" fill="none"/></svg></button>';
      function add(number, title) { const link=document.createElement('a'); link.href='https://example.org/vacancy/'+number;
        link.style='display:block;margin:20px 0'; const canvas=document.createElement('canvas'); canvas.width=620;canvas.height=90;
        const paint=canvas.getContext('2d');paint.fillStyle='#fff';paint.fillRect(0,0,620,90);paint.fillStyle='#222';paint.font='22px sans-serif';paint.fillText(title,10,35);paint.font='16px sans-serif';paint.fillText('Seattle, WA',10,65);
        link.append(canvas);root.querySelector('#list').append(link); }
      add(1,'Senior Product Manager');root.querySelector('button').onclick=event=>{add(2,'Product Engineering Manager');event.currentTarget.remove();};
    </script>`);
  });
  const tasks = [], images = [];
  const scan = await scanBoard({ ...fixture, url: root, provider: "fixture", model: "observed-link-oracle", instructions: "Senior Product Manager only", progress() {},
    extract: async input => {
      tasks.push(input.task);
      if (input.task === "document") {
        assert.equal(input.documents.length, 3); return { documentId: input.documents.find(item => item.title === "Product openings").id };
      }
      if (input.task === "inventory") return { decisions: Object.fromEntries(input.candidates.map(item => [item.id, "uncertain"])) };
      if (input.task === "navigation") return { listingIds: [], nextControlId: "" };
      if (input.task === "visual") {
        assert.ok(input.candidates.length); assert.equal(input.image.mediaType, "image/jpeg");
        const number = images.length; images.push(input.image.data);
        await writeFile(path.join(output, 'visual-' + number + '.jpg'), Buffer.from(input.image.data, 'base64'));
        if (number === 0) await writeFile(path.join(output, 'visual-sample.json'), JSON.stringify({ input,
          expected: { listingIds: input.candidates.map(item => item.id), nextControlId: input.controls.find(item => !item.disabled)?.id || '' } }));
        return { listings: input.candidates.map(item => ({ id: item.id, title: item.url.endsWith('/1') ? 'Senior Product Manager' : 'Product Engineering Manager', department: 'Product', location: 'Seattle, WA' })),
          nextControlId: input.controls.find(item => !item.disabled)?.id || '', expectedTotal: 2, empty: false, complete: true };
      }
      assert.equal(input.task, "roles"); assert.equal(input.candidates.length, 2); assert.ok(images.length >= 2);
      return { decisions: Object.fromEntries(input.candidates.map(item => [item.id, item.title === 'Senior Product Manager'])) };
    },
  });
  assert.equal(scan.jobs.length, 2); assert.equal(scan.jobs.filter(job => job.matches).length, 1); assert.equal(scan.pages, 2);
  assert.equal(tasks[0], "document"); assert.equal(tasks.at(-1), "roles");
  reports.push({ name: "nested frames, open shadow DOM, canvas titles and unlabeled next", pages: scan.pages, checked: 2, matches: 1, visualReads: images.length });
}

async function scrollingFixture() {
  const fixture = await browser(() => html("Scrollable jobs", `<p>8 open jobs</p><div id="host"></div><script>
    const root=document.querySelector('#host').attachShadow({mode:'open'});
    root.innerHTML='<h2>Product</h2><div id="scroller" style="height:220px;overflow:auto"></div>';
    const list=root.querySelector('#scroller');let index=0;
    function more(){for(let n=0;n<2&&index<8;n++){index++;const row=document.createElement('article');row.innerHTML='<a href="https://example.org/jobs/'+index+'">Product Manager '+index+'</a>';row.style='padding:55px 0';list.append(row);}}
    more();list.onscroll=()=>{if(list.scrollTop+list.clientHeight>=list.scrollHeight-8)setTimeout(more,100);};
  </script>`));
  try {
    await fixture.reader.open("https://example.org/careers"); const page = await fixture.reader.read();
    assert.equal(page.candidates.length, 8); assert.equal(page.atBottom, true); assert.equal(page.expectedTotal, 8);
    assert.ok(page.candidates.every(job => job.department === "Product"));
    reports.push({ name: "lazy jobs inside a shadow scroll container", checked: 8 });
  } finally { fixture.reader.close(); }
}

async function feedFailureFixture() {
  let feedRequests = 0;
  const fixture = await browser(request => {
    const url = new URL(request.url);
    if (url.hostname === "boards-api.greenhouse.io") { feedRequests++; return Response.json({ error: "Temporarily unavailable" }, { status: 503 }); }
    return html("Published jobs", '<p>1 open job</p><h2>Product</h2><a href="https://job-boards.greenhouse.io/zebby-test/jobs/1">Product Manager</a>');
  });
  try {
    await fixture.reader.open("https://job-boards.greenhouse.io/zebby-test"); const page = await fixture.reader.read();
    assert.equal(feedRequests, 3); assert.equal(page.layer, "dom"); assert.equal(page.candidates.length, 1);
    reports.push({ name: "unavailable feed falls back to rendered results", checked: 1 });
  } finally { fixture.reader.close(); }
}

async function run() {
  const timeout = setTimeout(() => { console.error("Layered reader checks timed out"); app.exit(1); }, 240000); timeout.unref();
  await mkdir(path.join(output, "profile"), { recursive: true }); app.setPath("userData", path.join(output, "profile"));
  app.on("window-all-closed", () => {}); await app.whenReady();
  await scrollingFixture(); await feedFailureFixture(); await visualFixture();
  await writeFile(path.join(output, "report.json"), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ status: "passed", reports })); clearTimeout(timeout); app.exit(0);
}
void run().catch(error => { console.error(error); app.exit(1); });

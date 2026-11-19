import { BrowserWindow } from "electron";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { readResumeFonts, resumeFontDirectory } from "./resume-fonts.ts";

export async function printResumePdf(html: string, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  const window = new BrowserWindow({ show: false, width: 816, height: 1056,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  const close = () => { if (!window.isDestroyed()) window.destroy(); };
  signal.addEventListener("abort", close, { once: true });
  const timer = setTimeout(close, 30_000);
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    signal.throwIfAborted();
    const pdf = await window.webContents.printToPDF({ pageSize: "Letter", preferCSSPageSize: true, printBackground: true });
    signal.throwIfAborted();
    return new Uint8Array(pdf);
  } catch (error) {
    signal.throwIfAborted();
    throw new Error("The PDF could not be created. Try again.", { cause: error });
  } finally { clearTimeout(timer); signal.removeEventListener("abort", close); close(); }
}

export async function printWordResumePdf(data: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  const [script, fonts] = await Promise.all([
    readFile(path.resolve(resumeFontDirectory, "..", "..", "resume-docx-renderer.js"), "utf8"),
    readResumeFonts(),
  ]);
  const nonce = randomBytes(18).toString("base64");
  const faces = fonts.map(font => `@font-face { font-family: 'Calibri'; font-weight: ${font.style.includes("Bold") ? 700 : 400}; font-style: ${font.style.includes("Italic") ? "italic" : "normal"};
    src: local('Calibri${font.style === "Regular" ? "" : " " + font.style.replace("BoldItalic", "Bold Italic")}'), url(data:font/ttf;base64,${Buffer.from(font.data).toString("base64")}) }`).join("\n");
  const window = new BrowserWindow({ show: false, width: 816, height: 1056,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `resume-${randomBytes(12).toString("hex")}` } });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "file://*/*"] }, (_details, callback) => callback({ cancel: true }));
  const close = () => { if (!window.isDestroyed()) window.destroy(); };
  signal.addEventListener("abort", close, { once: true });
  const timer = setTimeout(close, 45_000);
  try {
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:">
      <style>${faces}</style><body><script nonce="${nonce}">${script.replace(/<\/script/gi, "<\\/script")}</script></body>`;
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    signal.throwIfAborted();
    await window.webContents.executeJavaScript(`window.renderResumeDocument(${JSON.stringify(Buffer.from(data).toString("base64"))})`);
    signal.throwIfAborted();
    const pdf = await window.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
    signal.throwIfAborted();
    return new Uint8Array(pdf);
  } catch (error) {
    signal.throwIfAborted();
    throw new Error("The Word reference could not be exported to PDF. Try its PDF version.", { cause: error });
  } finally { clearTimeout(timer); signal.removeEventListener("abort", close); close(); }
}

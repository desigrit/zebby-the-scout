import { BrowserWindow } from "electron";

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

import { renderAsync } from "docx-preview";

declare global {
  interface Window { renderResumeDocument: (base64: string) => Promise<void> }
}

window.renderResumeDocument = async (base64: string) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  await renderAsync(bytes, document.body, undefined, {
    inWrapper: true, hideWrapperOnPrint: true, ignoreWidth: false, ignoreHeight: false,
    ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false,
    renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
    renderAltChunks: false, useBase64URL: true,
  });
  await document.fonts.ready;
  await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
  const section = document.querySelector<HTMLElement>("section.docx");
  if (!section) throw new Error("The Word reference could not be rendered.");
  const computed = getComputedStyle(section), style = document.createElement("style");
  style.textContent = `@page { size: ${computed.width} ${computed.minHeight}; margin: 0 }
    html, body { margin: 0; padding: 0 } .docx-wrapper { background: none; padding: 0 }
    section.docx { margin: 0; box-shadow: none; break-after: page }
    section.docx:last-child { break-after: auto }`;
  document.head.append(style);
};

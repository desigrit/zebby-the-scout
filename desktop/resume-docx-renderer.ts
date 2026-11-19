import { parseAsync, renderDocument } from "docx-preview";

declare global {
  interface Window { renderResumeDocument: (base64: string) => Promise<void> }
}

window.renderResumeDocument = async (base64: string) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const options = {
    keepOrigin: true,
    inWrapper: true, hideWrapperOnPrint: true, ignoreWidth: false, ignoreHeight: false,
    ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false,
    renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
    renderAltChunks: false, useBase64URL: true,
  };
  const parsed = await parseAsync(bytes, options);
  // docx-preview reads framePr but only implements drop caps. Preserve native
  // page-anchored text frames too, including a Word copy made from a PDF.
  type Node = { type: string; cssStyle?: Record<string, string>; sectionProps?: { type?: string }; children?: Node[]; break?: string };
  const part = parsed.documentPart as {
    _xmlDocument: Document;
    body: { children: Node[] };
  };
  const retainDefaultBorderColor = (node: Node) => {
    for (const [property, value] of Object.entries(node.cssStyle || {})) {
      if (property.startsWith("border") && / null$/.test(value)) node.cssStyle![property] = value.replace(/ null$/, " currentColor");
    }
    node.children?.forEach(retainDefaultBorderColor);
  };
  part.body.children.forEach(retainDefaultBorderColor);
  const body = part._xmlDocument.getElementsByTagNameNS("*", "body")[0];
  const source = [...body.children].filter(node => node.localName === "p");
  const paragraphs = part.body.children.filter(node => node.type === "paragraph");
  for (const paragraph of paragraphs) {
    // The preview library groups same-size sections onto one page unless a
    // run explicitly requests a page break. Honor Word's next-page sections.
    if (paragraph.sectionProps && paragraph.sectionProps.type !== "continuous") {
      (paragraph.children ??= []).push({ type: "run", children: [{ type: "break", break: "page" }] });
    }
  }
  source.forEach((node, index) => {
    const frame = node.getElementsByTagNameNS("*", "framePr")[0];
    if (!frame || !paragraphs[index]) return;
    const attr = (name: string) => frame.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", name);
    if (attr("hAnchor") !== "page" || attr("vAnchor") !== "page") return;
    const [x, y, width] = ["x", "y", "w"].map(key => Number(attr(key)) / 20);
    if (![x, y, width].every(Number.isFinite) || width <= 0) return;
    Object.assign(paragraphs[index].cssStyle ??= {}, {
      position: "absolute", left: `${x}pt`, top: `${y}pt`, width: `${width}pt`, margin: "0",
    });
  });
  await renderDocument(parsed, document.body, undefined, options);
  await document.fonts.ready;
  await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
  const section = document.querySelector<HTMLElement>("section.docx");
  if (!section) throw new Error("The Word reference could not be rendered.");
  const computed = getComputedStyle(section), style = document.createElement("style");
  style.textContent = `@page { size: ${computed.width} ${computed.minHeight}; margin: 0 }
    html, body { margin: 0; padding: 0 } .docx-wrapper { background: none; padding: 0 }
    section.docx { position: relative; margin: 0; box-shadow: none; break-after: page }
    section.docx:last-child { break-after: auto }`;
  document.head.append(style);
};

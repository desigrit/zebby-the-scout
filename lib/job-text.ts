import { decodeHTMLStrict } from "entities";
import { parseDocument } from "htmlparser2";

const MAX_ENCODING_LAYERS = 4;
const descriptionMarkup = /(?:^|\n)[\t ]*<\/?(?:html|body|main|article|section|div|p|h[1-6]|ul|ol|li|br|table|thead|tbody|tr|td|th|blockquote|pre|span|strong|em|b|i|u|a|code)\b[^<>]*>/i;
const excludedElements = new Set(["head", "title", "script", "style", "nav", "header", "footer", "aside", "form", "iframe", "noscript", "template"]);
const paragraphElements = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "section", "article", "blockquote", "pre", "table"]);
type HtmlNode = ReturnType<typeof parseDocument>["children"][number];

/** Decode only terminated entities, so URL parameters such as &copy= stay intact. */
export function decodeJobEntities(value: string): string {
  let text = value;
  for (let layer = 0; layer < MAX_ENCODING_LAYERS; layer++) {
    const decoded = decodeHTMLStrict(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function cleanHtmlText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function textFromHtml(html: string, depth = 0): string {
  // This parser never creates browser elements or fetches resources from the listing.
  const document = parseDocument(html, { withStartIndices: true, withEndIndices: true });
  function read(node: HtmlNode, literal = false): string {
    if (node.type === "text") {
      if (literal) return node.data;
      const raw = html.slice(node.startIndex ?? 0, (node.endIndex ?? -1) + 1);
      const decoded = decodeJobEntities(node.data);
      // Clipboard HTML can wrap another escaped HTML document. Unwrap that text
      // only when the source was escaped, and preserve examples inside code/pre.
      if (depth < MAX_ENCODING_LAYERS && raw !== node.data && descriptionMarkup.test(decoded)) {
        return textFromHtml(decoded, depth + 1);
      }
      return decoded;
    }
    if (!("name" in node) || !("children" in node) || excludedElements.has(node.name)) return "";
    if (node.name === "br") return "\n";
    const content = node.children.map((child) => read(child, literal || node.name === "code" || node.name === "pre")).join("");
    if (node.name === "li") return `• ${content.trim()}\n`;
    if (node.name === "div" || node.name === "tr") return `${content}\n`;
    if (node.name === "td" || node.name === "th") return `${content}\t`;
    return paragraphElements.has(node.name) ? `${content}\n\n` : content;
  }
  const nodes = document.children;
  const firstElement = nodes.findIndex((node) => "name" in node);
  let lastElement = nodes.length - 1;
  while (lastElement >= 0 && !("name" in nodes[lastElement])) lastElement--;
  if (firstElement < 0) return cleanHtmlText(nodes.map((node) => read(node)).join(""));
  const prefix = nodes.slice(0, firstElement).map((node) => read(node)).join("");
  const suffix = nodes.slice(lastElement + 1).map((node) => read(node)).join("");
  const content = nodes.slice(firstElement, lastElement + 1).map((node) => read(node)).join("");
  // Notes can surround an archived HTML listing. Keep that freeform text's
  // indentation and blank lines instead of applying HTML whitespace cleanup.
  const trailingBreak = suffix.trim() && !/^\s*\n/.test(suffix) && /\n$/.test(content) ? "\n\n" : "";
  return (prefix.trim() ? prefix : "") + cleanHtmlText(content) + trailingBreak + (suffix.trim() ? suffix : "");
}

/** Shared by extraction, clipboard paste, and reading older saved listings. */
export function normalizeJobText(value: string, html = false): string {
  // Parse raw HTML before decoding its text, so &lt;T&gt; remains visible text.
  if (html || descriptionMarkup.test(value)) return textFromHtml(value);
  let source = value;
  for (let layer = 0; layer < MAX_ENCODING_LAYERS; layer++) {
    const decoded = decodeHTMLStrict(source);
    if (decoded === source) break;
    source = decoded;
    if (descriptionMarkup.test(source)) return textFromHtml(source);
  }
  // Plain text keeps its spacing, Unicode, and literal angle brackets.
  return source;
}

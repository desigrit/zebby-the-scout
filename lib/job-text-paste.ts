import type { ClipboardEvent } from "react";

function textFromHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style, nav, footer, header").forEach((node) => node.remove());
  document.querySelectorAll("li").forEach((node) => node.prepend("• "));
  document.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, ul, ol, section, article, div").forEach((node) =>
    node.append(node.matches("li, div") ? "\n" : "\n\n"));
  return (document.body.textContent || "").replace(/\r/g, "").split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function pasteJobDescription(event: ClipboardEvent<HTMLTextAreaElement>, onChange: (value: string) => void) {
  const html = event.clipboardData.getData("text/html");
  if (!html) return;
  const formatted = textFromHtml(html);
  const plain = event.clipboardData.getData("text/plain");
  const htmlHasList = /<li[\s>]/i.test(html);
  if (!formatted || formatted.length < Math.max(40, plain.trim().length * 0.7) ||
      (!htmlHasList && plain.trim().length >= formatted.length * 0.8)) return;
  event.preventDefault();
  const area = event.currentTarget;
  const next = area.value.slice(0, area.selectionStart) + formatted + area.value.slice(area.selectionEnd);
  onChange(next.slice(0, area.maxLength > 0 ? area.maxLength : undefined));
}

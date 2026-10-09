import type { ClipboardEvent } from "react";
import { normalizeJobText } from "./job-text.ts";

function comparableText(text: string): string {
  return text.replace(/^[\t ]*(?:[•\u2023\u25e6\u2043\u2219\u25aa\u25cf]|[-*]|\d+[.)])\s+/gm, "").replace(/\s+/g, "");
}

const listMarker = /^[\t ]*(?:[•\u2023\u25e6\u2043\u2219\u25aa\u25cf]|[-*]|\d+[.)])\s+/m;

export function jobDescriptionFromClipboard(plain: string, html: string): string {
  const text = normalizeJobText(plain);
  if (!html) return text;
  const formatted = normalizeJobText(html, true);
  if (!plain) return formatted;
  // Add list formatting only if the HTML contains the same content as plain text.
  // A truncated HTML clipboard must never discard part of a clean text paste.
  return listMarker.test(formatted) && !listMarker.test(text) && comparableText(formatted) === comparableText(text)
    ? formatted : text;
}

export function replaceJobTextSelection(value: string, start: number, end: number, text: string, maxLength: number) {
  const available = maxLength > 0 ? Math.max(0, maxLength - (value.length - (end - start))) : text.length;
  let inserted = text.slice(0, available);
  if (/[\ud800-\udbff]$/.test(inserted)) inserted = inserted.slice(0, -1);
  return { value: value.slice(0, start) + inserted + value.slice(end), caret: start + inserted.length };
}

export function pasteJobDescription(event: ClipboardEvent<HTMLTextAreaElement>, onChange: (value: string) => void) {
  const plain = event.clipboardData.getData("text/plain");
  const html = event.clipboardData.getData("text/html");
  const formatted = jobDescriptionFromClipboard(plain, html);
  if (formatted === plain) return;
  event.preventDefault();
  const area = event.currentTarget;
  const next = replaceJobTextSelection(area.value, area.selectionStart, area.selectionEnd, formatted, area.maxLength);
  onChange(next.value);
  requestAnimationFrame(() => {
    if (area.isConnected && area.value === next.value) area.setSelectionRange(next.caret, next.caret);
  });
}

import assert from "node:assert/strict";
import test from "node:test";
import { escapeText } from "entities";
import { normalizeJobText } from "../lib/job-text.ts";
import { jobDescriptionFromClipboard, pasteJobDescription, replaceJobTextSelection } from "../lib/job-text-paste.ts";
import { descriptionFromHtml, descriptionText, formattedJobText } from "../lib/job-fetch.ts";
import { detailsFromDescription } from "../lib/job-details.ts";

// A short synthetic listing with the same encoding structure as the reported
// Greenhouse response. Do not store a third party's complete listing in fixtures.
const html = '<div class="content-intro"><p>We’re building Design↔code tools.</p></div><h2>What you’ll do</h2><ul><li>Develop SDKs &amp; REST APIs</li><li>Work with engineers&nbsp;and designers</li></ul><p>You&#39;ll lead discovery.</p>';
const escapedListing = escapeText(html);
const readableListing = "We’re building Design↔code tools.\n\nWhat you’ll do\n\n• Develop SDKs & REST APIs\n• Work with engineers and designers\n\nYou'll lead discovery.";

test("Greenhouse escaped HTML retains headings, bullets, Unicode, and nested entities", () => {
  assert.equal(formattedJobText(escapedListing), readableListing);
  assert.equal(descriptionText({ kind: "greenhouse" }, { content: escapedListing }, new URL("https://example.org/job")), readableListing);
  assert.equal(formattedJobText(escapeText(escapedListing)), readableListing);
  assert.equal(formattedJobText(readableListing), readableListing);
});

test("an escaped JSON-LD description is formatted instead of showing markup", () => {
  const page = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", description: escapedListing })}</script><main>Generic page shell</main>`;
  assert.equal(descriptionFromHtml(page), readableListing);
  assert.deepEqual(detailsFromDescription(escapeText("<p>Team: Developer Platform</p><p>Locations: New York; San Francisco</p>")), {
    team: "Developer Platform", locations: "New York; San Francisco",
  });
  assert.deepEqual(detailsFromDescription(escapeText("<ul><li>Team: Developer Platform</li><li>Locations: New York; San Francisco</li></ul>")), {
    team: "Developer Platform", locations: "New York; San Francisco",
  });
});

test("plain-text and wrapped HTML clipboard contents use the same decoding", () => {
  assert.equal(jobDescriptionFromClipboard(escapedListing, ""), readableListing);
  const wrapped = `<html><head><meta charset="utf-8"><title>Clipboard</title></head><body><span>${escapeText(escapedListing)}</span></body></html>`;
  assert.equal(jobDescriptionFromClipboard(escapedListing, wrapped), readableListing);
  assert.equal(jobDescriptionFromClipboard("", wrapped), readableListing);
});

test("clean copied lists gain bullets without dropping or adding content", () => {
  const plain = "Responsibilities\nOwn SDKs & REST APIs\nLead discovery";
  const rich = "<h3>Responsibilities</h3><ul><li>Own SDKs &amp; REST APIs</li><li>Lead discovery</li></ul>";
  assert.equal(jobDescriptionFromClipboard(plain, rich), "Responsibilities\n\n• Own SDKs & REST APIs\n• Lead discovery");
  assert.equal(jobDescriptionFromClipboard("Short item", "<ul><li>Short item</li></ul>"), "• Short item");
  const numbered = "Responsibilities\n1. Own SDKs & REST APIs\n2. Lead discovery";
  assert.equal(jobDescriptionFromClipboard(numbered, rich), numbered);
  const spaced = "  Keep this spacing.\n\n    These are my notes.\n";
  assert.equal(jobDescriptionFromClipboard(spaced, `<span>${spaced}</span>`), spaced);
});

test("incomplete or different HTML never replaces the complete clean text paste", () => {
  const plain = "Role\nLead discovery\nOwn the roadmap\nWork with design";
  assert.equal(jobDescriptionFromClipboard(plain, "<h3>Role</h3><ul><li>Lead discovery</li></ul>"), plain);
  assert.equal(jobDescriptionFromClipboard(plain, "<p>A different role</p>"), plain);
  assert.equal(jobDescriptionFromClipboard(plain, "<script>ignored()</script>"), plain);
});

test("valid Unicode, technical text, URLs, and freeform spacing stay intact", () => {
  const plain = "  Notes:\n    Keep C++, TypeScript<T>, and 0 < x < 10.\n\n‘Résumé’ → 東京 🦓\nhttps://example.org/?team=R%26D&copy=2&notebook=3\nUse <p> tags for paragraphs.\n";
  assert.equal(normalizeJobText(plain), plain);
  assert.equal(jobDescriptionFromClipboard(plain, ""), plain);
  assert.equal(normalizeJobText("&lsquo;Résumé&rsquo; &rarr; &#x1F993; &amp;amp; R&amp;D"), "‘Résumé’ → 🦓 & R&D");
  assert.equal(normalizeJobText("<p>Use <code>&lt;p&gt;paragraph&lt;/p&gt; &amp;amp;</code> and &lt;T&gt;.</p>"), "Use <p>paragraph</p> &amp; and <T>.");
  const prefix = "  Recruiter: René\n    Ask about the SDK.\n\n\nJob listing\n";
  const suffix = "\n\n  Interview notes:\n    Bring examples.\n";
  assert.equal(normalizeJobText(prefix + escapedListing + suffix), prefix + readableListing + suffix);
});

test("HTML extraction ignores executable elements, comments, and page chrome", () => {
  const markup = '<main><h2>Role</h2><p>Build useful tools.</p><script>throw new Error("should not run")</script><style>body{display:none}</style><!-- internal --><iframe src="https://example.org/"></iframe><img src="https://example.org/image.png"><form>Application controls</form><footer>Footer links</footer><template>Hidden content</template></main>';
  assert.equal(normalizeJobText(markup), "Role\n\nBuild useful tools.");
  assert.equal(normalizeJobText(escapeText(markup)), "Role\n\nBuild useful tools.");
});

test("limited paste preserves existing text after the selection and whole Unicode characters", () => {
  assert.deepEqual(replaceJobTextSelection("before after", 7, 7, "1234567890", 15), { value: "before 123after", caret: 10 });
  assert.deepEqual(replaceJobTextSelection("before OLD after", 7, 10, "NEW", 16), { value: "before NEW after", caret: 10 });
  assert.deepEqual(replaceJobTextSelection("ABCDEF", 3, 3, "🦓", 7), { value: "ABCDEF", caret: 3 });
  assert.deepEqual(replaceJobTextSelection("AB", 1, 1, "🦓", 4), { value: "A🦓B", caret: 3 });
});

test("clean text uses the native paste and encoded text is intercepted even without HTML", (t) => {
  let prevented = false;
  let saved;
  const area = { value: "Notes: ", selectionStart: 7, selectionEnd: 7, maxLength: 200_000, isConnected: true,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  const eventFor = (plain) => ({ clipboardData: { getData(type) { return type === "text/plain" ? plain : ""; } },
    currentTarget: area, preventDefault() { prevented = true; } });
  const frames = [];
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  t.after(() => {
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else delete globalThis.requestAnimationFrame;
  });
  pasteJobDescription(eventFor("Clean ‘résumé’ text"), (value) => { saved = value; });
  assert.equal(prevented, false);
  assert.equal(saved, undefined);
  pasteJobDescription(eventFor(escapedListing), (value) => { saved = value; area.value = value; });
  assert.equal(prevented, true);
  assert.equal(saved, `Notes: ${readableListing}`);
  frames.forEach((frame) => frame());
  assert.equal(area.selectionStart, saved.length);
  assert.equal(area.selectionEnd, saved.length);
});

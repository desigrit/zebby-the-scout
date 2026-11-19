// Assign revised words to their source runs. Matching words retain emphasis;
// insertions inherit the nearest run without flattening the paragraph's style.
export function mapEditedTokens(original: string, revised: string): { text: string; source: number }[] {
  const tokens = (value: string) => [...value.matchAll(/\s+|[\p{L}\p{N}_]+|[^\s]/gu)]
    .map(match => ({ text: match[0], offset: match.index }));
  const a = tokens(original), b = tokens(revised);
  if (a.length * b.length > 4_000_000) throw new Error("This resume paragraph is too long to tailor safely.");
  const width = b.length + 1, scores = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    scores[i * width + j] = a[i].text === b[j].text ? 1 + scores[(i + 1) * width + j + 1]
      : Math.max(scores[(i + 1) * width + j], scores[i * width + j + 1]);
  }
  const matches = new Map<number, number>();
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].text === b[j].text) { matches.set(j++, i++); }
    else if (scores[(i + 1) * width + j] >= scores[i * width + j + 1]) i++;
    else j++;
  }
  let last = 0;
  return b.map((token, index) => {
    const match = matches.get(index);
    if (match !== undefined) last = match;
    else if (!index) last = matches.values().next().value ?? 0;
    return { text: token.text, source: a[last]?.offset ?? 0 };
  });
}

export const xmlEscape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

export const compactText = (text: string) => text.replace(/[\u0000\r]/g, "").replace(/\s+/g, " ").trim();

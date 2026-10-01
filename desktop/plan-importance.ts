export type PlanRecommendation = { text: string; importance: number };

export function parsePlanRecommendations(value: unknown, min: number, max: number, maxLength: number): PlanRecommendation[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error("The job priorities were incomplete. Try analyzing again.");
  }
  const items = value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("The job priorities were incomplete. Try analyzing again.");
    const { text, importance } = entry as Record<string, unknown>;
    if (typeof text !== "string" || !text.trim() || text.trim().length > maxLength ||
        typeof importance !== "number" || !Number.isInteger(importance) || importance < 0 || importance > 100) {
      throw new Error("The job priorities were incomplete. Try analyzing again.");
    }
    return { text: text.trim().replace(/\u2014/g, "-"), importance };
  });
  return items.sort((a, b) => b.importance - a.importance);
}

// Existing analyses have text but no priorities. Changed text and changed jobs
// receive no inferred score; only an analysis can attach a new importance.
export function importanceForTerms(previous: string[], scores: unknown, terms: string[]): Array<number | null> {
  const values = Array.isArray(scores) ? scores : [];
  const byText = new Map(previous.map((text, index) => {
    const score: unknown = values[index];
    return [text.trim(), typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 100 ? score : null];
  }));
  return terms.map((text) => byText.get(text.trim()) ?? null);
}

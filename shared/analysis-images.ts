import { boardExtractionInput } from "./boards.ts";

// Both token counting and execution use this exact split. Image bytes must never
// also be serialized into the text prompt or fetched from a model-supplied URL.
export function boardVisualParts(input: unknown) {
  if (!input || typeof input !== "object" || !("task" in input) || input.task !== "visual") return null;
  const parsed = boardExtractionInput.parse(input);
  if (parsed.task !== "visual") return null;
  const { image, ...evidence } = parsed;
  return { text: JSON.stringify(evidence), image };
}

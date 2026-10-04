import { z } from "zod";
import type { AnalysisKind } from "../shared/online-models.ts";
export const analysisInput = z.object({ resumeText: z.string().min(30).max(120000), jobDescription: z.string().min(80).max(80000),
  company: z.string().max(300).default(""), title: z.string().max(500).default(""),
  currentCvOverview: z.string().max(12000).default(""), url: z.string().max(2000).default(""),
  team: z.string().max(1000).default(""), locations: z.string().max(4000).default("") }).strict();
const recommendation = z.object({ text: z.string().min(1).max(1000), importance: z.number().int().min(0).max(100) }).strict();
const match = z.object({ score: z.number().int().min(0).max(100), explanation: z.string().min(1).max(8000) }).strict();
const plan = match.extend({ keywords: z.array(recommendation.extend({ text: z.string().min(1).max(200) })).min(6).max(20),
  themes: z.array(recommendation).min(5).max(6), overview: z.string().min(1).max(16000), overviewRationale: z.string().min(1).max(8000) });
export function validateInput(value: unknown, kind: AnalysisKind) {
  const input = analysisInput.parse(value);
  if (kind === "plan" && !input.currentCvOverview.trim()) throw new Error("Add your current CV overview.");
  return input;
}
export function validateResult(value: unknown, kind: AnalysisKind) {
  const result = (kind === "plan" ? plan : match).parse(value);
  // Sanitize all model strings before they appear in product surfaces.
  return JSON.parse(JSON.stringify(result).replace(/\u2014/g, "-")) as Record<string, unknown>;
}

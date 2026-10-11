export type AnalysisStage = "preparing" | "waiting" | "thinking" | "generating" | "saving";
export type GenerationStage = Extract<AnalysisStage, "thinking" | "generating">;
export type ReportAnalysisProgress = (stage: AnalysisStage) => void;
export type AnalysisProgress = { requestId: string; stage: AnalysisStage };

export const ANALYSIS_STAGES: Record<AnalysisStage, { order: number; label: string }> = {
  preparing: { order: 0, label: "Preparing analysis" },
  waiting: { order: 1, label: "Waiting for model" },
  thinking: { order: 2, label: "Thinking" },
  generating: { order: 3, label: "Generating results" },
  saving: { order: 4, label: "Saving results" },
};

import { useEffect, useState } from "react";
import { ANALYSIS_STAGES, type AnalysisStage } from "../../shared/analysis-progress";

export default function PlanAnalysisProgress({ stage, startedAt, task = "analysis" }: { stage: AnalysisStage; startedAt: number; task?: "analysis" | "resume" }) {
  const label = (value: AnalysisStage) => task === "resume" ? ({ preparing: "Reading your resume", waiting: "Tailoring your resume",
    thinking: "Thinking", generating: "Writing tailored resume", saving: "Saving your tailored resume" })[value] : ANALYSIS_STAGES[value].label;
  const [frame, setFrame] = useState<{ current: AnalysisStage; previous: AnalysisStage | null }>({ current: stage, previous: null });
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((performance.now() - startedAt) / 1000)));
  if (frame.current !== stage) setFrame({ current: stage, previous: frame.current });

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  useEffect(() => {
    // Retire the outgoing label even when Reduce Motion suppresses animation.
    const timer = window.setTimeout(() => setFrame((current) => ({ ...current, previous: null })), 280);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className="plan-analysis-progress" data-stage={stage}>
    <span className="visually-hidden" role="status" aria-label={task === "resume" ? "Creating tailored resume" : "Analyzing role"} aria-live="polite" aria-atomic="true">
      {label(stage)}
    </span>
    <span className="plan-progress-time" aria-hidden="true" title="Time elapsed">{elapsed}</span>
    <span className="plan-progress-separator" aria-hidden="true">·</span>
    <span className="plan-progress-roller" aria-hidden="true">
      {frame.previous && <span key={`out-${frame.current}`} className="plan-progress-label is-leaving">
        {label(frame.previous)}
      </span>}
      <span key={frame.current} className={`plan-progress-label${frame.previous ? " is-entering" : ""}`}>
        {label(frame.current)}
      </span>
    </span>
  </div>;
}

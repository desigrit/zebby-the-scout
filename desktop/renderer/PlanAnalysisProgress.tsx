import { useEffect, useState } from "react";
import { ANALYSIS_STAGES, type AnalysisStage } from "../../shared/analysis-progress";

export default function PlanAnalysisProgress({ stage, startedAt }: { stage: AnalysisStage; startedAt: number }) {
  const [frame, setFrame] = useState<{ current: AnalysisStage; previous: AnalysisStage | null }>({ current: stage, previous: null });
  const [seconds, setSeconds] = useState(0);
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
    <span className="visually-hidden" role="status" aria-label="Analyzing role" aria-live="polite" aria-atomic="true">
      {ANALYSIS_STAGES[stage].label}
    </span>
    <span className="plan-progress-roller" aria-hidden="true">
      {frame.previous && <span key={`out-${frame.current}`} className="plan-progress-label is-leaving">
        {ANALYSIS_STAGES[frame.previous].label}
      </span>}
      <span key={frame.current} className={`plan-progress-label${frame.previous ? " is-entering" : ""}`}>
        {ANALYSIS_STAGES[frame.current].label}
      </span>
    </span>
    <span className="plan-progress-time" aria-hidden="true" title="Time elapsed">{elapsed}</span>
  </div>;
}

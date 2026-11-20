import { useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { ChatGPTJobSummary, ChatGPTModel, ChatGPTTokenUsage } from "../../shared/chatgpt-plan";
import { summarizeChatGPTUsage } from "../../shared/chatgpt-usage";
import { thinkingLabel } from "../../shared/thinking";

const jobLabel = (name: string) => name === "connection_test" ? "Connection test" : name === "connection_image_test" ? "Image connection test"
  : name === "board_check_all" ? "Check all boards" : name.startsWith("board_") ? "Boards analysis" : name === "resume_plan" ? "Plan analysis" : name === "tailored_resume" ? "Tailored resume" : "Application match";
const statusLabel: Record<string, string> = { queued: "Waiting", running: "Analyzing", ready: "Ready to save", applied: "Completed", completed: "Completed",
  interrupted: "Interrupted", cancelled: "Cancelled", failed: "Needs attention" };
const number = (value?: number) => value === undefined ? "Not reported" : value.toLocaleString();

function TokenBreakdown({ usage }: { usage: ChatGPTTokenUsage }) {
  return <dl className="chatgpt-token-breakdown">
    <div><dt>Input</dt><dd>{number(usage.inputTokens)}</dd></div>
    <div><dt>Output</dt><dd>{number(usage.outputTokens)}</dd></div>
    <div><dt>Cached <span>of input</span></dt><dd>{number(usage.cachedInputTokens)}</dd></div>
    <div><dt>Reasoning <span>of output</span></dt><dd>{number(usage.reasoningTokens)}</dd></div>
    {usage.cacheWriteInputTokens !== undefined && usage.cacheWriteInputTokens > 0 &&
      <div><dt>Cache writes <span>of input</span></dt><dd>{number(usage.cacheWriteInputTokens)}</dd></div>}
  </dl>;
}

export default function ChatGPTUsage({ jobs, models, working, viewJob }: {
  jobs: ChatGPTJobSummary[]; models: ChatGPTModel[]; working: boolean;
  viewJob: (id?: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(() => new Set());
  const modelLabel = (id?: string) => models.find(model => model.id === id)?.name || id || "Model unavailable";
  return <div className="chatgpt-history">
    {jobs.length ? <ul className="chatgpt-job-list" aria-label="Analysis usage">
      {(showAll ? jobs : jobs.slice(0, 5)).map(job => {
        const totals = summarizeChatGPTUsage(job.attempts);
        const attempts = job.attempts || [];
        const lastAttempt = attempts.at(-1);
        const batch = job.name === "board_check_all";
        const reuseCount = job.reuseCount || 0;
        const usageLabel = totals.usage ? `${number(totals.usage.totalTokens)} tokens${totals.missing ? " reported" : ""}`
          : ["queued", "running"].includes(job.state) ? "In progress"
          : batch && !totals.missing ? "0 tokens"
          : (attempts.length || reuseCount) && totals.notRequested === attempts.length ? "No model request" : "Usage unavailable";
        const status = batch && job.state === "running" ? "Checking" : ["applied", "completed"].includes(job.state) ? "" : statusLabel[job.state] || job.state;
        const activityAt = job.updatedAt || job.createdAt;
        const expanded = expandedJobs.has(job.id), detailId = `chatgpt-job-${job.id}`;
        return <li key={job.id}>
          <button type="button" className="chatgpt-job-toggle" aria-expanded={expanded} aria-controls={detailId}
            onClick={() => setExpandedJobs(current => {
              const next = new Set(current); if (next.has(job.id)) next.delete(job.id); else next.add(job.id); return next;
            })}>
            <span className="chatgpt-job-info"><strong>{jobLabel(job.name)}</strong>
              <span className="chatgpt-job-model"><time dateTime={activityAt}>{new Date(activityAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
                {batch && job.boardCount !== undefined && ` · ${number(job.boardCount)} ${job.boardCount === 1 ? "board" : "boards"}`}
                {` · ${modelLabel(lastAttempt?.model || job.model)}`}{job.thinking ? ` · ${thinkingLabel(job.thinking)} thinking` : ""}</span>
              {(status || reuseCount > 0) && <span className="chatgpt-job-meta">{status && <span>{status}</span>}
                {reuseCount > 0 && <span className="chatgpt-reused">Saved result reused</span>}</span>}
            </span>
            <span className="chatgpt-job-total">{usageLabel}<ChevronDown size={14} aria-hidden="true" /></span>
          </button>
          <button type="button" className="settings-link chatgpt-run-details" disabled={working}
            aria-label={`Run details for ${jobLabel(job.name)}`} onClick={() => viewJob(job.id)}>Run details <ArrowUpRight size={15} aria-hidden="true" /></button>
          <div className="chatgpt-job-detail" id={detailId} hidden={!expanded}>
              {totals.usage && <TokenBreakdown usage={totals.usage} />}
              {!totals.usage && <p className="settings-help">{usageLabel === "0 tokens" || (usageLabel === "No model request" && reuseCount > 0) ? "No new model request."
                : usageLabel === "No model request" ? "This attempt stopped before requesting analysis."
                : usageLabel === "In progress" ? "Token usage will appear when OpenAI reports it."
                : "No token measurements were saved for this analysis."}</p>}
              {totals.usage && totals.missing > 0 && <p className="settings-help">Usage is unavailable for {totals.missing} {totals.missing === 1 ? "attempt" : "attempts"}. The reported total is incomplete.</p>}
              <p className="settings-help">{reuseCount > 0 ? `Saved result reused ${reuseCount === 1 ? "once" : `${number(reuseCount)} times`}. Reuse makes no new model request.`
                : "No saved result reuse recorded."}</p>
              {job.error && <p className="chatgpt-job-error">{job.error}</p>}
              {attempts.length > 1 && <ol className="chatgpt-attempts" aria-label={batch ? "Board check requests" : "Analysis attempts"}>{attempts.map((attempt, index) => <li key={attempt.id}>
                <div className="chatgpt-attempt-heading"><span>{batch ? "Request" : "Attempt"} {index + 1} · {statusLabel[attempt.state] || attempt.state}</span>
                  <span>{attempt.usage ? `${number(attempt.usage.totalTokens)} tokens` : attempt.requestStarted === false ? "No model request" : "Usage unavailable"}</span></div>
                {attempt.usage && <TokenBreakdown usage={attempt.usage} />}
              </li>)}</ol>}
          </div>
        </li>;
      })}
    </ul> : <p className="chatgpt-history-empty">No analysis jobs in the last 7 days.</p>}
    {jobs.length > 5 && <button type="button" className="settings-link chatgpt-show-jobs" onClick={() => setShowAll(value => !value)}>
      {showAll ? "Show recent jobs" : `Show ${jobs.length} recent jobs`}</button>}
    <div className="chatgpt-history-footer">
      <div className="settings-links">
        <button type="button" className="settings-link" disabled={working} onClick={() => viewJob()}>Open jobs folder <ArrowUpRight size={15} aria-hidden="true" /></button>
      </div>
    </div>
  </div>;
}

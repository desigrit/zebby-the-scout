import { useAnalysisFlow } from "./AnalysisFlow";
import { ErrorBanner } from "./WorkspaceFeedback";

export default function AnalysisErrorBanner({ message, retry, busy }: { message: string; retry: () => void; busy?: boolean }) {
  const { state, openSettings } = useAnalysisFlow();
  const ownKey = state.analysisProvider === "openai" || state.analysisProvider === "anthropic";
  const keyFailure = ownKey && /API key|key's workspace/i.test(message);
  const billingFailure = ownKey && /API (?:credit|balance)|spending limit|Billing in your API account/i.test(message);
  const modelFailure = /another model|smaller model|thinking (?:configuration|level)|cannot fit|context|memory/i.test(message);
  const billingUrl = state.analysisProvider === "anthropic" ? "https://platform.claude.com/settings/billing" : "https://platform.openai.com/settings/organization/billing/overview";
  return <ErrorBanner message={message} retry={retry} busy={busy} recovery={/report this issue to Zebby/.test(message)
    ? <a className="text-action" href="https://github.com/desigrit/zebby-the-scout/issues/new" target="_blank" rel="noreferrer">Report an issue</a> : billingFailure
    ? <a className="text-action" href={billingUrl} target="_blank" rel="noreferrer">Open billing</a>
    : keyFailure || modelFailure ? <button className="text-action" type="button" onClick={openSettings}>{keyFailure ? "Change key" : "Choose model"}</button> : undefined} />;
}

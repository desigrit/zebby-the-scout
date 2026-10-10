import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import type { DesktopState } from "../bridge";
import { LOCAL_MODELS } from "../local-model-catalog";
import { CREDIT_MODELS, ONLINE_MODELS, type AnalysisProvider } from "../../shared/online-models";
import { localThinkingCapability, onlineThinkingCapability, selectedThinking, thinkingKey, type ThinkingCapability } from "../../shared/thinking";
import SettingsAction from "./SettingsAction";

export type ChangeAnalysisState = (state: DesktopState) => void | Promise<void>;
type OnlineProvider = "openai" | "anthropic" | "credits";
export function OnlineModelSelect({ state, onState, provider, disabled = false, onBusy }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: OnlineProvider; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  const value = provider === "credits" ? state.credits.model : provider === "openai" ? state.openaiModel : state.anthropicModel;
  const models = provider === "credits" ? CREDIT_MODELS : ONLINE_MODELS.filter((model) => model.provider === provider);
  return <div className="analysis-model-control"><label className="field"><span>Model</span><select value={value} disabled={disabled || working}
    onChange={async (event) => { setWorking(true); onBusy?.(true); setError("");
      try { await onState(await window.desktop!.setOnlineModel(provider, event.target.value)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the model. Try again."); }
      finally { setWorking(false); onBusy?.(false); } }}>
    {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
  </select></label>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
export function ThinkingSelect({ state, onState, provider, model, disabled = false, onBusy }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: AnalysisProvider; model: string; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const [remote, setRemote] = useState<ThinkingCapability | null>(null), [checking, setChecking] = useState(provider === "ollama" && Boolean(model));
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (provider !== "ollama" || !model) return;
    let active = true;
    void window.desktop!.ollamaThinkingCapability(state.ollamaUrl, model)
      .then((value) => { if (active) setRemote(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not check thinking levels."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [provider, model, state.ollamaUrl, attempt]);
  const capability = provider === "ollama" ? remote : provider === "builtin"
    ? localThinkingCapability(Boolean(LOCAL_MODELS.find((item) => item.id === model)?.supportsThinking))
    : onlineThinkingCapability(model);
  const key = thinkingKey(provider, model, state.ollamaUrl);
  const value = capability ? selectedThinking(state.thinkingLevels, key, capability) : "";
  const unsupported = capability?.known && !capability.options.length;
  const title = unsupported ? "This model does not support a separate thinking mode." : capability && !capability.known
    ? "Your server does not report thinking controls. Zebby uses the model default." : "More thinking can take longer and use more tokens.";
  return <div className="analysis-thinking-control"><div className="analysis-thinking-row"><label className="field"><span>Thinking level</span>
    <select value={value} title={title} disabled={disabled || working || checking || !capability || !model || unsupported || capability.options.length === 1}
      onChange={async (event) => { setWorking(true); onBusy?.(true); setError("");
        try { await onState(await window.desktop!.setThinkingLevel({ provider, model, level: event.target.value })); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save thinking level. Try again."); }
        finally { setWorking(false); onBusy?.(false); } }}>
      {capability?.options.length ? capability.options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)
        : <option value={value}>{checking ? "Checking levels…" : !model ? "Choose a model first" : unsupported ? "Not supported" : "Unavailable"}</option>}
    </select></label>{provider === "ollama" && error && <SettingsAction icon={RotateCw} iconOnly busy={checking} disabled={disabled || working}
      aria-label="Retry thinking levels" title="Retry thinking levels" onClick={() => { setError(""); setRemote(null); setChecking(true); setAttempt((value) => value + 1); }} />}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
export function OnlineModelControls({ state, onState, provider, disabled = false, onBusy }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: OnlineProvider; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const model = provider === "credits" ? state.credits.model : provider === "openai" ? state.openaiModel : state.anthropicModel;
  return <div className="online-model-controls"><OnlineModelSelect state={state} onState={onState} provider={provider} disabled={disabled} onBusy={onBusy} />
    <ThinkingSelect key={model} state={state} onState={onState} provider={provider} model={model} disabled={disabled} onBusy={onBusy} /></div>;
}

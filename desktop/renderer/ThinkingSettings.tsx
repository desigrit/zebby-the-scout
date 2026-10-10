import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
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
export function ThinkingSelect({ state, onState, provider, model, disabled = false, onBusy, quiet = false }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: AnalysisProvider; model: string; disabled?: boolean; onBusy?: (busy: boolean) => void; quiet?: boolean }) {
  const [remote, setRemote] = useState<ThinkingCapability | null>(null), [checking, setChecking] = useState(provider === "ollama" && Boolean(model));
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const controls = useRef<HTMLDivElement>(null), restoreFocus = useRef(false), inFlight = useRef(false);
  useLayoutEffect(() => {
    if (working || disabled || !restoreFocus.current) return;
    restoreFocus.current = false;
    controls.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], [role="switch"]')?.focus({ preventScroll: true });
  }, [working, disabled, state.thinkingLevels]);
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
  const supported = Boolean(model && capability?.known && capability.options.length > 1);
  const title = "More thinking can take longer and use more tokens.";
  async function change(level: string) {
    if (inFlight.current || disabled || !supported) return;
    inFlight.current = true; restoreFocus.current = true; setWorking(true); onBusy?.(true); setError("");
    try { await onState(await window.desktop!.setThinkingLevel({ provider, model, level })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save thinking level. Try again."); }
    finally { inFlight.current = false; setWorking(false); onBusy?.(false); }
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    if (!capability || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = capability.options.findIndex((item) => item.value === value), count = capability.options.length;
    const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 :
      (current + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + count) % count;
    void change(capability.options[next].value);
  }
  const retry = provider === "ollama" && error && <SettingsAction icon={RotateCw} iconOnly busy={checking} disabled={disabled || working}
    aria-label="Retry thinking levels" title="Retry thinking levels" onClick={() => { setError(""); setRemote(null); setChecking(true); setAttempt((value) => value + 1); }} />;
  if (!supported) return error ? <div className="analysis-thinking-error"><p className="form-error" role="alert">{error}</p>{retry}</div> : null;
  const binary = capability!.options.length === 2 && capability!.options.some((item) => item.value === "off") && capability!.options.some((item) => item.value === "on");
  const control = <div className="analysis-thinking-control" ref={controls}>
    {!quiet && <span className="thinking-control-label">Thinking</span>}
    {binary ? <div className="thinking-switch-row"><button type="button" role="switch" aria-label="Thinking" aria-checked={value === "on"}
      className="thinking-switch" title={title} disabled={disabled || working} onClick={() => void change(value === "on" ? "off" : "on")} /><span>{value === "on" ? "On" : "Off"}</span></div>
      : <div className="thinking-segments" role="radiogroup" aria-label="Thinking level" title={title}>
        {capability!.options.map((item) => <button type="button" role="radio" aria-checked={value === item.value} key={item.value}
          tabIndex={value === item.value ? 0 : -1} disabled={disabled || working} onKeyDown={navigate}
          onClick={() => void change(item.value)}>{item.label}</button>)}
      </div>}
    {error && <div className="analysis-thinking-error"><p className="form-error" role="alert">{error}</p>{retry}</div>}
  </div>;
  return quiet ? <div className="analysis-setting-row"><span className="analysis-setting-label">Thinking</span>{control}</div> : control;
}
export function OnlineModelControls({ state, onState, provider, disabled = false, onBusy }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: OnlineProvider; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const model = provider === "credits" ? state.credits.model : provider === "openai" ? state.openaiModel : state.anthropicModel;
  return <div className="online-model-controls"><OnlineModelSelect state={state} onState={onState} provider={provider} disabled={disabled} onBusy={onBusy} />
    <ThinkingSelect key={model} state={state} onState={onState} provider={provider} model={model} disabled={disabled} onBusy={onBusy} /></div>;
}

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Info } from "lucide-react";
import type { DesktopState } from "../bridge";
import { LOCAL_MODELS } from "../local-model-catalog";
import { ASTRA_MODEL, ASTRA_PACK_MESSAGE, CREDIT_MODELS, ONLINE_MODELS, type AnalysisProvider } from "../../shared/online-models";
import { localThinkingCapability, onlineThinkingCapability, selectedThinking, thinkingKey, type ThinkingCapability } from "../../shared/thinking";
import { ErrorBanner } from "./WorkspaceFeedback";

export type ChangeAnalysisState = (state: DesktopState) => void | Promise<void>;
type OnlineProvider = "openai" | "anthropic" | "credits";
export function OnlineModelSelect({ state, onState, provider, disabled = false, onBusy, onLockedModel }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: OnlineProvider; disabled?: boolean; onBusy?: (busy: boolean) => void;
  onLockedModel?: () => void }) {
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  const retryModel = useRef("");
  const value = provider === "credits" ? state.credits.model : provider === "openai" ? state.openaiModel : state.anthropicModel;
  const models = provider === "credits" ? CREDIT_MODELS : ONLINE_MODELS.filter((model) => model.provider === provider);
  const astraLocked = provider === "credits" && (!state.credits.wallet || state.credits.wallet.astraUnlocked === false);
  // Keep an already-selected Astra visible, while letting it be selected again
  // to open purchase. The placeholder never changes the saved model preference.
  const displayedValue = astraLocked && value === ASTRA_MODEL ? "locked-astra" : value;
  async function changeModel(model: string) {
    if (astraLocked && model === ASTRA_MODEL) {
      if (onLockedModel) onLockedModel(); else setError(ASTRA_PACK_MESSAGE);
      return;
    }
    retryModel.current = model; setWorking(true); onBusy?.(true); setError("");
    try { await onState(await window.desktop!.setOnlineModel(provider, model)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the model. Try again."); }
    finally { setWorking(false); onBusy?.(false); }
  }
  return <div className="analysis-model-control"><label className="field"><span>Model</span><select value={displayedValue} disabled={disabled || working}
    onChange={(event) => { const model = event.target.value; if (astraLocked && model === ASTRA_MODEL) event.currentTarget.value = displayedValue; void changeModel(model); }}>
    {displayedValue === "locked-astra" && <option value="locked-astra" hidden>GPT-6 Astra · Locked</option>}
    {models.map((model) => <option key={model.id} value={model.id}>{model.name}{astraLocked && model.id === ASTRA_MODEL ? " · Locked" : ""}</option>)}
  </select></label>{astraLocked && <p className="settings-help">{ASTRA_PACK_MESSAGE}</p>}
  <ErrorBanner message={error} retry={() => void changeModel(retryModel.current)} busy={working || disabled} /></div>;
}
export function ThinkingSelect({ state, onState, provider, model, disabled = false, onBusy, quiet = false }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: AnalysisProvider; model: string; disabled?: boolean; onBusy?: (busy: boolean) => void; quiet?: boolean }) {
  const [remote, setRemote] = useState<ThinkingCapability | null>(null), [checking, setChecking] = useState(provider === "ollama" && Boolean(model));
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const controls = useRef<HTMLDivElement>(null), restoreFocus = useRef(false), inFlight = useRef(false);
  const failedLevel = useRef<string | null>(null);
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
    failedLevel.current = level;
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
  const retry = () => {
    if (failedLevel.current !== null && supported) { void change(failedLevel.current); return; }
    setError(""); setRemote(null); setChecking(true); setAttempt((value) => value + 1);
  };
  if (!supported) return error ? <div className="analysis-thinking-error"><ErrorBanner message={error} retry={retry} busy={disabled || working || checking} /></div> : null;
  const binary = capability!.options.length === 2 && capability!.options.some((item) => item.value === "off") && capability!.options.some((item) => item.value === "on");
  const control = <div className="analysis-thinking-control" ref={controls}>
    {!quiet && <span className="thinking-control-label">{binary ? "Extended thinking" : "Thinking"}</span>}
    {binary ? <div className="thinking-switch-row"><button type="button" role="switch" aria-label="Extended thinking" aria-checked={value === "on"}
      className="thinking-switch" title={title} disabled={disabled || working} onClick={() => void change(value === "on" ? "off" : "on")} /><span>{value === "on" ? "On" : "Off"}</span></div>
      : <div className="thinking-segments" role="radiogroup" aria-label="Thinking level" title={title}>
        {capability!.options.map((item) => <button type="button" role="radio" aria-checked={value === item.value} key={item.value}
          tabIndex={value === item.value ? 0 : -1} disabled={disabled || working} onKeyDown={navigate}
          onClick={() => void change(item.value)}>{item.label}</button>)}
      </div>}
    <details className="thinking-help"><summary><Info size={12} aria-hidden="true" />About thinking</summary>
      <p>More reasoning can take longer and use more tokens. It does not guarantee a better result.</p></details>
    <ErrorBanner message={error} retry={retry} busy={disabled || working || checking} />
  </div>;
  return quiet ? <div className="analysis-setting-row"><span className="analysis-setting-label">{binary ? "Extended thinking" : "Thinking"}</span>{control}</div> : control;
}
export function OnlineModelControls({ state, onState, provider, disabled = false, onBusy }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: OnlineProvider; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const model = provider === "credits" ? state.credits.model : provider === "openai" ? state.openaiModel : state.anthropicModel;
  return <div className="online-model-controls"><OnlineModelSelect state={state} onState={onState} provider={provider} disabled={disabled} onBusy={onBusy} />
    <ThinkingSelect key={model} state={state} onState={onState} provider={provider} model={model} disabled={disabled} onBusy={onBusy} /></div>;
}

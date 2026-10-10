import { useEffect, useState } from "react";
import { Check, CreditCard, KeyRound, RotateCw, Trash2 } from "lucide-react";
import type { DesktopState } from "../bridge";
import LocalModelsSettings from "./LocalModelsSettings";
import { LOCAL_MODELS } from "../local-model-catalog";
import { ONLINE_MODELS, type AnalysisProvider } from "../../shared/online-models";
import SettingsAction from "./SettingsAction";
export function providerReady(state: DesktopState, provider = state.analysisProvider) {
  if (provider === "openai") return state.hasApiKey;
  if (provider === "anthropic") return state.hasAnthropicKey;
  if (provider === "ollama") return Boolean(state.ollamaModel.trim());
  if (provider === "credits") return state.credits.available && state.credits.signedIn;
  return Boolean(state.localModels.some((item) => item.id === state.builtInModelId && item.status === "ready" &&
    (!LOCAL_MODELS.find((model) => model.id === item.id)?.license || state.acceptedModelTerms.includes(item.id))));
}
export function OnlineModelSelect({ state, onState, provider, disabled = false }: {
  state: DesktopState; onState: (state: DesktopState) => void; provider: "openai" | "anthropic" | "credits"; disabled?: boolean }) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const value = provider === "credits" ? state.credits.model : provider === "openai" ? state.openaiModel : state.anthropicModel;
  return <><label className="field"><span>Model</span><select value={value} disabled={disabled || working}
    onChange={async (event) => { setWorking(true); setError(""); try { onState(await window.desktop!.setOnlineModel(provider, event.target.value)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the model."); } finally { setWorking(false); } }}>
    {ONLINE_MODELS.filter((model) => provider === "credits" || model.provider === provider)
      .map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
  </select></label>{error && <p className="form-error" role="alert">{error}</p>}</>;
}
export function AnalysisSettings({ state, onState, provider: suppliedProvider, openCredits }: {
  state: DesktopState; onState: (state: DesktopState) => void; provider?: AnalysisProvider; openCredits: () => void }) {
  const provider = suppliedProvider || state.analysisProvider;
  const [url, setUrl] = useState(state.ollamaUrl), [model, setModel] = useState(state.ollamaModel);
  const [models, setModels] = useState<string[]>([]), [key, setKey] = useState("");
  const [working, setWorking] = useState(false), [finding, setFinding] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    if (provider !== "ollama") return;
    let active = true;
    void window.desktop!.listOllamaModels(state.ollamaUrl).then((items) => { if (active) setModels(items); }).catch(() => undefined);
    return () => { active = false; };
  }, [provider, state.ollamaUrl]);
  async function action(operation: () => Promise<DesktopState>, message = "") {
    setWorking(true); setError(""); setNotice("");
    try { onState(await operation()); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings."); }
    finally { setWorking(false); }
  }
  const keyed = provider === "openai" || provider === "anthropic", hasKey = provider === "openai" ? state.hasApiKey : state.hasAnthropicKey;
  return <div className="analysis-configuration">
    {!suppliedProvider && <label className="field provider-field"><span>Analyze with</span><select value={provider} disabled={working}
      onChange={(event) => { setKey(""); setError(""); setNotice(""); void action(() => window.desktop!.setAnalysisProvider(event.target.value as AnalysisProvider)); }}>
      <option value="ollama">Local server</option><option value="builtin">Downloaded model</option>
      <option value="openai">OpenAI API key</option><option value="anthropic">Anthropic API key</option><option value="credits">Zebby credits</option>
    </select></label>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {provider === "ollama" && <>
      <label className="field"><span>Server URL</span><input type="url" value={url} spellCheck={false}
        onChange={(event) => { setUrl(event.target.value); setModels([]); }} placeholder="http://localhost:11434" /></label>
      <div className="ollama-model-row"><label className="field"><span>Model</span><select value={models.includes(model) ? model : "custom"}
        onChange={(event) => setModel(event.target.value === "custom" ? "" : event.target.value)}>
        {models.map((name) => <option key={name}>{name}</option>)}<option value="custom">Enter model name</option>
      </select></label><SettingsAction className="model-refresh" icon={RotateCw} iconOnly busy={finding} disabled={working} aria-label="Find models" title="Find models"
        onClick={async () => { setFinding(true); setError(""); try { const result = await window.desktop!.listOllamaModels(url); setModels(result);
          if (!result.length) setNotice("No models found on this server."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect."); }
          finally { setFinding(false); } }} /></div>
      {!models.includes(model) && <label className="field"><span>Model name</span><input value={model} spellCheck={false}
        onChange={(event) => setModel(event.target.value)} placeholder="qwen3:8b" /></label>}
      <div className="settings-actions"><SettingsAction variant="primary" icon={Check} disabled={working || finding || !model.trim()}
        onClick={() => void action(() => window.desktop!.setOllamaConfig({ url, model }), "Server settings saved.")}>Save</SettingsAction></div>
      <p className="settings-help">Job text and resume text go to your selected server.</p>
    </>}
    {provider === "builtin" && <LocalModelsSettings state={state} onState={onState} />}
    {keyed && <>
      <OnlineModelSelect state={state} onState={onState} provider={provider} disabled={working} />
      <p className={`key-status ${hasKey ? "key-ready" : ""}`}>{hasKey ? state.canSaveApiKey ? "API key saved" : "API key set for this session" : "Use your own API account"}</p>
      <label className="field key-field"><span>{hasKey ? "Replace API key" : "API key"}</span><input type="password" value={key} autoComplete="off" spellCheck={false}
        onChange={(event) => setKey(event.target.value)} placeholder={provider === "openai" ? "sk-..." : "sk-ant-..."} /></label>
      <div className="settings-actions"><SettingsAction variant="primary" icon={KeyRound} disabled={working || !key.trim()}
        onClick={() => void action(async () => { const next = await (provider === "openai" ? window.desktop!.setApiKey(key) : window.desktop!.setAnthropicKey(key)); setKey(""); return next; }, "API key saved.")}>Save key</SettingsAction>
        {hasKey && <SettingsAction variant="danger" icon={Trash2} disabled={working}
          onClick={() => void action(() => provider === "openai" ? window.desktop!.setApiKey("") : window.desktop!.setAnthropicKey(""), "API key removed.")}>Remove key</SettingsAction>}</div>
      <p className="settings-help">{provider === "openai" ? "OpenAI" : "Anthropic"} receives job and resume content. Usage is billed to your API account.</p>
      {!state.canSaveApiKey && <p className="settings-help">Secure storage is unavailable. This key lasts until Zebby closes.</p>}
    </>}
    {provider === "credits" && <>
      <p className="settings-help">{state.credits.signedIn && state.credits.wallet?.purchased ? "Choose your model in Credits below." : "Choose your model after purchasing credits."}</p>
      {!state.credits.signedIn && <div className="settings-actions"><SettingsAction variant="primary" icon={CreditCard} onClick={openCredits}
        disabled={!state.credits.available || !state.canSaveApiKey}>Buy credits</SettingsAction></div>}
    </>}
  </div>;
}

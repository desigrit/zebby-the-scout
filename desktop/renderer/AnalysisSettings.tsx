import { useEffect, useState } from "react";
import { CreditCard, RotateCw } from "lucide-react";
import type { DesktopState } from "../bridge";
import LocalModelsSettings, { LocalModelSelect } from "./LocalModelsSettings";
import { LOCAL_MODELS } from "../local-model-catalog";
import type { AnalysisProvider } from "../../shared/online-models";
import { OnlineModelSelect, ThinkingSelect, type ChangeAnalysisState } from "./ThinkingSettings";
import ApiKeyField from "./ApiKeyField";
import SettingsAction from "./SettingsAction";

export function providerReady(state: DesktopState, provider = state.analysisProvider) {
  if (provider === "openai") return state.hasApiKey;
  if (provider === "anthropic") return state.hasAnthropicKey;
  if (provider === "ollama") return Boolean(state.ollamaModel.trim());
  if (provider === "credits") return state.credits.available && state.credits.signedIn;
  return Boolean(state.localModels.some((item) => item.id === state.builtInModelId && item.status === "ready" &&
    (!LOCAL_MODELS.find((model) => model.id === item.id)?.license || state.acceptedModelTerms.includes(item.id))));
}
export function AnalysisSettings({ state, onState, provider: suppliedProvider, openCredits }: {
  state: DesktopState; onState: ChangeAnalysisState; provider?: AnalysisProvider; openCredits: () => void }) {
  const provider = suppliedProvider || state.analysisProvider;
  const [url, setUrl] = useState(state.ollamaUrl), [model, setModel] = useState(state.ollamaModel), [models, setModels] = useState<string[]>([]);
  const [working, setWorking] = useState(false), [finding, setFinding] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    if (provider !== "ollama") return;
    let active = true;
    void window.desktop!.listOllamaModels(state.ollamaUrl).then((items) => { if (active) setModels(items); }).catch(() => undefined);
    return () => { active = false; };
  }, [provider, state.ollamaUrl]);
  async function action(operation: () => Promise<DesktopState>) {
    setWorking(true); setError(""); setNotice("");
    try { const next = await operation(); setUrl(next.ollamaUrl); setModel(next.ollamaModel); await onState(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings. Try again."); }
    finally { setWorking(false); }
  }
  function saveServer(nextUrl = url, nextModel = model) {
    if (!working && (nextUrl.trim() !== state.ollamaUrl || nextModel.trim() !== state.ollamaModel))
      void action(() => window.desktop!.setOllamaConfig({ url: nextUrl, model: nextModel }));
  }
  const keyed = provider === "openai" || provider === "anthropic";
  const onlineId = provider === "credits" ? state.credits.model : provider === "openai" ? state.openaiModel : state.anthropicModel;
  const serverModelChanged = url.trim() !== state.ollamaUrl || model.trim() !== state.ollamaModel;
  return <div className={`analysis-configuration${suppliedProvider ? " analysis-configuration-focused" : ""}`}>
    <div className="analysis-primary-fields">
      {!suppliedProvider && <label className="field provider-field"><span>Analyze with</span><select value={provider} disabled={working}
        onChange={(event) => { setError(""); setNotice(""); void action(() => window.desktop!.setAnalysisProvider(event.target.value as AnalysisProvider)); }}>
        <option value="ollama">Local server</option><option value="builtin">Downloaded model</option><option value="openai">OpenAI API key</option>
        <option value="anthropic">Anthropic API key</option><option value="credits">Zebby credits</option>
      </select></label>}
      {provider === "ollama" ? <label className="field"><span>Server URL</span><input type="url" value={url} spellCheck={false} disabled={working}
        onChange={(event) => { setUrl(event.target.value); setModels([]); }} onBlur={() => saveServer()}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveServer(); } }} placeholder="http://localhost:11434" /></label>
        : provider === "builtin" ? <LocalModelSelect state={state} onState={onState} disabled={working} onBusy={setWorking} />
        : <OnlineModelSelect state={state} onState={onState} provider={provider as "openai" | "anthropic" | "credits"} disabled={working} onBusy={setWorking} />}
    </div>
    <div className={`analysis-secondary-fields${provider === "ollama" ? " analysis-secondary-server" : ""}`}>
      {provider === "ollama" && <div className="analysis-server-model"><div className="ollama-model-row"><label className="field"><span>Model</span>
        <select value={models.includes(model) ? model : "custom"} disabled={working || finding}
          onChange={(event) => { const value = ["custom", "new-custom"].includes(event.target.value) ? "" : event.target.value; setModel(value); if (value) saveServer(url, value); }}>
          {!models.includes(model) && model && <option value="custom">{model}</option>}
          {models.map((name) => <option key={name}>{name}</option>)}<option value={model && !models.includes(model) ? "new-custom" : "custom"}>Enter model name</option>
        </select></label><SettingsAction className="model-refresh" icon={RotateCw} iconOnly busy={finding} disabled={working}
          aria-label="Find models" title="Find models" onClick={async () => { setFinding(true); setError(""); setNotice("");
            try { const result = await window.desktop!.listOllamaModels(url); setModels(result); if (!result.length) setNotice("No models found on this server."); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect. Check the server URL."); }
            finally { setFinding(false); } }} /></div>
        {!models.includes(model) && <label className="field custom-model-field"><span>Model name</span><input value={model} spellCheck={false} disabled={working}
          onChange={(event) => setModel(event.target.value)} onBlur={() => saveServer()}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveServer(); } }} placeholder="qwen3:8b" /></label>}
      </div>}
      <ThinkingSelect key={`${provider}:${provider === "builtin" ? state.builtInModelId : provider === "ollama" ? `${state.ollamaUrl}:${state.ollamaModel}` : onlineId}`}
        state={state} onState={onState} provider={provider} model={provider === "builtin" ? state.builtInModelId : provider === "ollama" ? state.ollamaModel : onlineId}
        disabled={working || provider === "ollama" && serverModelChanged} onBusy={setWorking} />
    </div>
    {keyed && <ApiKeyField key={provider} state={state} onState={onState} provider={provider} disabled={working} onBusy={setWorking} />}
    {provider === "builtin" && <LocalModelsSettings state={state} onState={onState} hideSelector />}
    {provider === "credits" && <div className="settings-actions"><SettingsAction variant="primary" icon={CreditCard} onClick={openCredits}
      disabled={working || !state.canSaveApiKey}>Buy credits</SettingsAction></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {provider !== "builtin" && <p className="settings-help analysis-privacy">{provider === "ollama" ? "Job and resume text go to your server."
      : keyed ? `${provider === "openai" ? "OpenAI" : "Anthropic"} receives job and resume content. Billed to your API account.`
      : "Job and resume text go to Zebby and OpenAI. Pay only for the tokens used."}</p>}
  </div>;
}

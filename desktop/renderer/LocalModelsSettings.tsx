import { Check, ChevronDown, Cpu, Download, FolderOpen, Pause, Play, RotateCw, Square } from "lucide-react";
import { useRef, useState } from "react";
import { formatModelBytes, LOCAL_MODELS, type LocalModel, type LocalModelStatus } from "../local-model-catalog";
import type { DesktopState } from "../bridge";
import SettingsAction from "./SettingsAction";
import type { ChangeAnalysisState } from "./ThinkingSettings";

export function LocalModelSelect({ state, onState, disabled = false, onBusy }: { state: DesktopState; onState: ChangeAnalysisState;
  disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const [working, setWorking] = useState(false), [error, setError] = useState("");
  const selected = LOCAL_MODELS.find((item) => item.id === state.builtInModelId);
  return <div className="analysis-model-control"><label className="field local-model-field"><span>Local model</span>
    <div className={`local-model-picker${selected ? " has-size" : ""}`}>
      <select value={state.builtInModelId || ""} disabled={disabled || working} aria-label="Local model" aria-describedby="local-download-help"
        onChange={async (event) => { if (!event.target.value) return; setWorking(true); onBusy?.(true); setError("");
          try { await onState(await window.desktop!.selectLocalModel(event.target.value)); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Could not select the model. Try again."); }
          finally { setWorking(false); onBusy?.(false); } }}>
        <option value="" disabled>Choose a model</option>
        {[...LOCAL_MODELS].sort((a, b) => b.released.localeCompare(a.released)).map((model) => <option value={model.id} key={model.id}>
          {model.name}
        </option>)}
      </select>
      {selected && <span className="model-size-badge" aria-label={`Download size: ${formatModelBytes(selected.bytes)}`}>{formatModelBytes(selected.bytes)}</span>}
    </div></label>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}

function downloadState(status: LocalModelStatus) {
  if (status.status === "ready") return "Ready on this computer";
  if (status.status === "verifying") return "Checking download";
  if (status.status === "paused") return "Download paused";
  if (status.status === "error") return "Download needs attention";
  if (status.status === "downloading") return "Downloading";
  return "Not downloaded";
}

export default function LocalModelsSettings({ state, onState, hideSelector = false }: {
  state: DesktopState; onState: ChangeAnalysisState; hideSelector?: boolean }) {
  const [working, setWorking] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false), statusElement = useRef<HTMLDivElement>(null), modelsElement = useRef<HTMLDivElement>(null);
  const selected = LOCAL_MODELS.find((model) => model.id === state.builtInModelId);
  const statuses = state.localModels || [];
  const current = selected ? statuses.find((item) => item.id === selected.id) || {
    id: selected.id, status: "not-installed" as const, downloadedBytes: 0, error: "",
  } : null;
  const stored = statuses.filter((item) => item.status !== "not-installed" || item.downloadedBytes > 0);
  const readyCount = stored.filter((item) => item.status === "ready").length;
  const usedBytes = stored.reduce((total, status) => total + (status.status === "ready"
    ? LOCAL_MODELS.find((model) => model.id === status.id)?.bytes || 0 : status.downloadedBytes), 0);

  async function run(action: () => Promise<DesktopState>, focus?: { modelId: string; action: string; inLibrary: boolean }) {
    if (inFlight.current) return;
    inFlight.current = true; setWorking(true); setError("");
    try { await onState(await action()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The model action failed. Try again."); }
    finally {
      inFlight.current = false; setWorking(false);
      if (focus) requestAnimationFrame(() => {
        const origin = focus.inLibrary
          ? modelsElement.current?.querySelector<HTMLElement>(`[data-model-id="${focus.modelId}"]`)
          : statusElement.current;
        const target = origin?.querySelector<HTMLButtonElement>(`[data-download-action="${focus.action}"]:not(:disabled)`)
          || origin?.querySelector<HTMLButtonElement>("button:not(:disabled)");
        const fallback = focus.inLibrary
          ? modelsElement.current?.querySelector<HTMLElement>(".local-model-library > summary")
          : statusElement.current;
        (target || fallback)?.focus({ preventScroll: true });
      });
    }
  }
  function controls(model: LocalModel, status: LocalModelStatus, inLibrary = false) {
    const needsConsent = Boolean(model.license && !state.acceptedModelTerms?.includes(model.id));
    const partial = ["downloading", "paused", "verifying", "error"].includes(status.status) || status.downloadedBytes > 0;
    if (status.status === "ready" && !needsConsent) return null;
    return <div className="local-model-actions">
      {needsConsent && model.license ? <SettingsAction variant="primary" icon={Download} className="model-agreement" disabled={working}
        onClick={() => void run(() => window.desktop!.resumeModelDownload(model.id, model.license!.version))}>
        {status.status === "ready" ? "Agree and use" : "Agree and download"}</SettingsAction>
        : status.status === "downloading" || status.status === "verifying" ? <SettingsAction className="model-transfer-action" icon={Pause} iconOnly disabled={working}
          aria-label={`Pause ${model.name} download`} title="Pause download" data-download-action="toggle"
          onClick={() => void run(() => window.desktop!.pauseModelDownload(), { modelId: model.id, action: "toggle", inLibrary })} />
          : status.status === "paused" || status.status === "error" ? <SettingsAction className="model-transfer-action" icon={status.status === "error" ? RotateCw : Play} iconOnly disabled={working}
            aria-label={`${status.status === "error" ? "Retry" : "Resume"} ${model.name} download`} title={status.status === "error" ? "Retry download" : "Resume download"} data-download-action="toggle"
            onClick={() => void run(() => window.desktop!.resumeModelDownload(model.id), { modelId: model.id, action: "toggle", inLibrary })} />
            : <SettingsAction variant="primary" icon={Download} disabled={working}
              onClick={() => void run(() => window.desktop!.resumeModelDownload(model.id))}>Download model</SettingsAction>}
      {partial && status.status !== "ready" && <SettingsAction className="model-transfer-action" icon={Square} iconOnly disabled={working}
        aria-label={`Stop ${model.name} download`} title="Stop download and remove partial file" data-download-action="stop"
        onClick={() => void run(() => window.desktop!.stopModelDownload(model.id), { modelId: model.id, action: "stop", inLibrary })} />}
    </div>;
  }
  function progress(model: LocalModel, status: LocalModelStatus) {
    return ["downloading", "paused", "verifying", "error"].includes(status.status) && <progress className="model-download-progress"
      value={status.downloadedBytes} max={model.bytes} aria-label={`${model.name} download progress`} />;
  }

  return <div className="local-model-settings" ref={modelsElement}>
    {!hideSelector && <LocalModelSelect state={state} onState={onState} disabled={working} />}
    <span id="local-download-help" className="visually-hidden">Selecting a model downloads it to this computer. Some models require agreement to their terms.</span>
    {selected && current && <>
      <div className="selected-model-status" ref={statusElement} tabIndex={-1} aria-label={`${selected.name} download status`}>
        <div className="model-download-status"><span role="status">
          {current.status === "ready" ? <Check size={15} aria-hidden="true" /> : <Cpu size={15} aria-hidden="true" />}
          {selected.license && !state.acceptedModelTerms?.includes(selected.id) ? "Review model terms to continue" : downloadState(current)}
          {current.status === "downloading" && <span className="model-download-bytes">{Math.round(current.downloadedBytes / selected.bytes * 100)}%</span>}
        </span>
          {["paused", "error", "verifying"].includes(current.status) && <span className="model-download-bytes">{formatModelBytes(current.downloadedBytes)} / {formatModelBytes(selected.bytes)}</span>}
        </div>{controls(selected, current)}
      </div>
      {progress(selected, current)}
      {current.error && <p className="model-download-error" role="alert">{current.error}</p>}
      <details className="selected-model-about" key={selected.id} open={selected.license && !state.acceptedModelTerms?.includes(selected.id) || undefined}>
        <summary>{selected.license && !state.acceptedModelTerms?.includes(selected.id) ? "Model terms" : "About this model"}</summary>
        <p className="model-description">{selected.description}</p>
        <p className="model-memory">{selected.tier} · {selected.memoryHint} · Runs on your CPU</p>
        {selected.license && <div className="model-license"><p className="settings-help">{selected.license.summary}{" "}
          <a href={selected.license.url} target="_blank" rel="noreferrer">Model terms</a>
          {selected.license.policyUrl && <> · <a href={selected.license.policyUrl} target="_blank" rel="noreferrer">Use restrictions</a></>}
        </p>{!state.acceptedModelTerms?.includes(selected.id) && <p className="settings-help">Choosing {current.status === "ready" ? "Agree and use" : "Agree and download"} accepts these terms and any linked use restrictions.</p>}</div>}
      </details>
    </>}
    {error && <p className="model-download-error" role="alert">{error}</p>}
    <details className="local-model-library">
      <summary><span>Models on this computer</span><span className="model-library-summary">{readyCount} downloaded · {formatModelBytes(usedBytes)}<ChevronDown size={16} aria-hidden="true" /></span></summary>
      {stored.length ? <ul>{stored.map((status) => {
        const model = LOCAL_MODELS.find((item) => item.id === status.id);
        if (!model) return null;
        return <li key={status.id} data-model-id={model.id}><Cpu size={18} className="model-file-icon" aria-hidden="true" />
          <div className="local-model-library-info"><div className="model-file-title"><strong>{model.name}</strong>
            {model.id === selected?.id && <span className="model-selected-badge">Selected</span>}</div>
            <span>{status.status === "ready" ? "On this computer" : `${downloadState(status)} · ${formatModelBytes(status.downloadedBytes)} downloaded`}</span>
            {model.id !== selected?.id && progress(model, status)}</div>
          <div className="model-file-actions"><span className="model-size-badge">{formatModelBytes(model.bytes)}</span>
            {status.status === "ready" ? <>
              {model.id !== selected?.id && <SettingsAction className="settings-action-slim" disabled={working}
                onClick={() => void run(() => window.desktop!.selectLocalModel(model.id))}>Use model</SettingsAction>}
              <button className="settings-link model-remove-link" type="button" aria-label={`Remove ${model.name}`} disabled={working}
                onClick={() => void run(() => window.desktop!.deleteLocalModel(model.id))}>Remove</button>
            </> : model.id === selected?.id ? null : controls(model, status, true)}
          </div></li>;
      })}</ul> : <p className="settings-help model-library-empty">No models downloaded. Choose a model above to start.</p>}
      <div className="model-storage-footer"><button className="settings-link" type="button" onClick={() => {
        void window.desktop!.openModelFolder().then((message) => { if (message) setError(message); })
          .catch(() => setError("Could not open the model folder."));
      }}><FolderOpen size={15} aria-hidden="true" /> Open model folder</button>
        <details className="analysis-sharing model-storage-help"><summary>Storage and privacy</summary>
          <p>Models stay in Zebby&apos;s data folder through updates.
            {state.platform === "darwin" ? " Delete models here before removing Zebby from your Mac." : " Uninstalling Zebby removes these downloads."}</p></details>
      </div>
    </details>
  </div>;
}

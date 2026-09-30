import { Check, Download, FolderOpen, Pause, Play, RotateCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatModelBytes, LOCAL_MODELS, type LocalModel, type LocalModelStatus } from "../local-model-catalog";
import type { DesktopState } from "../bridge";

function downloadState(model: LocalModel, status: LocalModelStatus) {
  if (status.status === "ready") return "Ready for offline analysis";
  if (status.status === "verifying") return "Checking download";
  if (status.status === "paused") return "Download paused";
  if (status.status === "error") return "Download needs attention";
  if (status.status === "downloading") return `Downloading ${model.name}`;
  return "Select a model to download it to this computer.";
}

export default function LocalModelsSettings({ state, onState }: { state: DesktopState; onState: (state: DesktopState) => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const selected = LOCAL_MODELS.find((model) => model.id === state.builtInModelId);
  const statuses = state.localModels || [];
  const current = selected ? statuses.find((item) => item.id === selected.id) || {
    id: selected.id, status: "not-installed" as const, downloadedBytes: 0, error: "",
  } : null;
  const otherDownloads = statuses.filter((item) => item.id !== selected?.id &&
    (item.downloadedBytes > 0 || item.status === "ready"));

  async function run(action: () => Promise<DesktopState>) {
    setWorking(true); setError("");
    try { onState(await action()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The model action failed. Try again."); }
    finally { setWorking(false); }
  }

  function controls(model: LocalModel, status: LocalModelStatus) {
    const running = status.status === "downloading" || status.status === "verifying";
    return <div className="local-model-actions">
      {running ? <button type="button" className="button button-secondary" disabled={working}
        onClick={() => void run(() => window.desktop!.pauseModelDownload())}>
        <Pause size={15} aria-hidden="true" /> Pause</button>
      : status.status !== "ready" && <button type="button" className="button button-secondary" disabled={working}
        onClick={() => void run(() => window.desktop!.resumeModelDownload(model.id))}>
        {status.status === "error" ? <RotateCw size={15} aria-hidden="true" />
          : status.downloadedBytes ? <Play size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
        {status.status === "error" ? "Retry download" : status.downloadedBytes ? "Resume download" : "Download model"}</button>}
      {(status.status !== "not-installed" || status.downloadedBytes > 0) && <button type="button"
        className="button button-secondary model-delete" aria-label={`Delete ${model.name}`} disabled={working}
        onClick={() => void run(() => window.desktop!.deleteLocalModel(model.id))}>
        <Trash2 size={15} aria-hidden="true" /> Delete</button>}
    </div>;
  }

  return <div className="local-model-settings">
    <label className="field local-model-field"><span>Local model</span>
      <select value={state.builtInModelId || ""} disabled={working} aria-describedby="local-download-help"
        onChange={(event) => { if (event.target.value) void run(() => window.desktop!.selectLocalModel(event.target.value)); }}>
        <option value="" disabled>Choose a model to download</option>
        {LOCAL_MODELS.map((model) => <option value={model.id} key={model.id}>
          {model.name} ({model.tier}, {formatModelBytes(model.bytes)})
          {statuses.some((status) => status.id === model.id && status.status === "ready") ? ", installed" : ""}
        </option>)}
      </select>
    </label>
    <p id="local-download-help" className="settings-help">Selecting a model starts its download. Installed models are reused. Analysis runs on this computer&apos;s CPU, with no account or server setup.</p>
    {selected && current && <div className="selected-model-detail">
      <p className="model-description">{selected.description}</p>
      <p className="model-memory">Recommended: {selected.memoryHint}. Model download: {formatModelBytes(selected.bytes)}.</p>
      <div className="model-download-status">
        <span className={current.status === "ready" ? "model-ready" : ""} role="status">
          {current.status === "ready" && <Check size={16} aria-hidden="true" />}
          {downloadState(selected, current)}
        </span>
        {current.status !== "not-installed" && current.status !== "ready" &&
          <span className="model-download-bytes">{formatModelBytes(current.downloadedBytes)} / {formatModelBytes(selected.bytes)}</span>}
      </div>
      {["downloading", "paused", "verifying", "error"].includes(current.status) &&
        <progress className="model-download-progress" value={current.downloadedBytes} max={selected.bytes}
          aria-label={`${selected.name} download progress`} />}
      {current.error && <p className="model-download-error" role="alert">{current.error}</p>}
      {controls(selected, current)}
    </div>}
    {error && <p className="model-download-error" role="alert">{error}</p>}
    {otherDownloads.length > 0 && <details className="local-model-library">
      <summary>Other downloads ({otherDownloads.length})</summary>
      <ul>{otherDownloads.map((status) => {
        const model = LOCAL_MODELS.find((item) => item.id === status.id);
        if (!model) return null;
        return <li key={status.id}>
          <div className="local-model-library-info"><strong>{model.name}</strong>
            <span>{status.status === "ready" ? formatModelBytes(model.bytes) : `${formatModelBytes(status.downloadedBytes)} downloaded`} · {status.status === "ready" ? "Ready" : "Partial download"}</span></div>
          <button type="button" className="button button-secondary model-delete" aria-label={`Delete ${model.name}`} disabled={working}
            onClick={() => void run(() => window.desktop!.deleteLocalModel(model.id))}>
            <Trash2 size={15} aria-hidden="true" /> Delete</button>
        </li>;
      })}</ul>
    </details>}
    <p className="settings-help model-storage-help">Downloads stay in this computer&apos;s app data folder and are kept through updates.
      {state.platform === "darwin" ? " Delete downloaded models here before removing the app from your Mac." : " The Windows uninstaller removes these downloads."}
    </p>
    <button className="settings-link" type="button" onClick={() => {
      void window.desktop!.openModelFolder().then((message) => { if (message) setError(message); })
        .catch(() => setError("Could not open the model folder."));
    }}><FolderOpen size={15} aria-hidden="true" /> Open model folder</button>
  </div>;
}

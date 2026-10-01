import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  state: () => ipcRenderer.invoke("desktop:state"),
  chooseDatabase: (kind: "open" | "create") => ipcRenderer.invoke("desktop:choose-database", kind),
  retrySync: () => ipcRenderer.invoke("desktop:retry-sync"),
  setApiKey: (value: string) => ipcRenderer.invoke("desktop:set-api-key", value),
  setAnalysisProvider: (value: "ollama" | "openai" | "builtin") => ipcRenderer.invoke("desktop:set-analysis-provider", value),
  setOllamaConfig: (value: { url: string; model: string }) => ipcRenderer.invoke("desktop:set-ollama-config", value),
  listOllamaModels: (url: string) => ipcRenderer.invoke("desktop:list-ollama-models", url),
  selectLocalModel: (id: string) => ipcRenderer.invoke("desktop:select-local-model", id),
  pauseModelDownload: () => ipcRenderer.invoke("desktop:pause-model-download"),
  resumeModelDownload: (id: string, termsVersion?: string) => ipcRenderer.invoke("desktop:resume-model-download", id, termsVersion),
  deleteLocalModel: (id: string) => ipcRenderer.invoke("desktop:delete-local-model", id),
  openModelFolder: () => ipcRenderer.invoke("desktop:open-model-folder"),
  setAppearance: (value: "auto" | "dark" | "light") => ipcRenderer.invoke("desktop:set-appearance", value),
  setSidebarCollapsed: (value: boolean) => ipcRenderer.invoke("desktop:set-sidebar-collapsed", value),
  openLogs: () => ipcRenderer.invoke("desktop:open-logs"),
  downloadResume: (id: string) => ipcRenderer.invoke("desktop:download-resume", id),
  onDatabaseChanged: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("desktop:database-changed", listener);
    return () => ipcRenderer.removeListener("desktop:database-changed", listener);
  },
  onNavigate: (callback: (target: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, target: string) => callback(target);
    ipcRenderer.on("desktop:navigate", listener);
    return () => ipcRenderer.removeListener("desktop:navigate", listener);
  },
  onLocalModelsChanged: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("desktop:local-models-changed", listener);
    return () => ipcRenderer.removeListener("desktop:local-models-changed", listener);
  },
});

window.addEventListener("error", (event) => {
  ipcRenderer.send("desktop:renderer-error", event.error?.stack || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  ipcRenderer.send("desktop:renderer-error", reason instanceof Error ? reason.stack || reason.message : String(reason));
});

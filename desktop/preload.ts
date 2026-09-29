import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  state: () => ipcRenderer.invoke("desktop:state"),
  chooseDatabase: (kind: "open" | "create") => ipcRenderer.invoke("desktop:choose-database", kind),
  retrySync: () => ipcRenderer.invoke("desktop:retry-sync"),
  openBackups: () => ipcRenderer.invoke("desktop:open-backups"),
  setApiKey: (value: string) => ipcRenderer.invoke("desktop:set-api-key", value),
  setAppearance: (value: "auto" | "dark" | "light") => ipcRenderer.invoke("desktop:set-appearance", value),
  setLogCapture: (value: boolean) => ipcRenderer.invoke("desktop:set-log-capture", value),
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
});

window.addEventListener("error", (event) => {
  ipcRenderer.send("desktop:renderer-error", event.error?.stack || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  ipcRenderer.send("desktop:renderer-error", reason instanceof Error ? reason.stack || reason.message : String(reason));
});

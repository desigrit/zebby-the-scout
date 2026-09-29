import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  state: () => ipcRenderer.invoke("desktop:state"),
  chooseDatabase: (kind: "open" | "create") => ipcRenderer.invoke("desktop:choose-database", kind),
  retrySync: () => ipcRenderer.invoke("desktop:retry-sync"),
  openBackups: () => ipcRenderer.invoke("desktop:open-backups"),
  setApiKey: (value: string) => ipcRenderer.invoke("desktop:set-api-key", value),
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

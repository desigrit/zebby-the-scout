export type DesktopState = {
  filePath: string;
  filename: string;
  dirty: boolean;
  startupError: string;
  hasApiKey: boolean;
  canSaveApiKey: boolean;
  backupsPath: string;
  appearance: "auto" | "dark" | "light";
  captureLogs: boolean;
  logsPath: string;
  platform: string;
};

export type DesktopBridge = {
  state(): Promise<DesktopState>;
  chooseDatabase(kind: "open" | "create"): Promise<DesktopState | null>;
  retrySync(): Promise<DesktopState>;
  openBackups(): Promise<string>;
  setApiKey(value: string): Promise<DesktopState>;
  setAppearance(value: DesktopState["appearance"]): Promise<DesktopState>;
  setLogCapture(value: boolean): Promise<DesktopState>;
  openLogs(): Promise<string>;
  downloadResume(id: string): Promise<boolean>;
  onDatabaseChanged(callback: (state: DesktopState) => void): () => void;
  onNavigate(callback: (target: string) => void): () => void;
};

declare global {
  interface Window { desktop?: DesktopBridge; }
}

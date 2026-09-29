export type DesktopState = {
  filePath: string;
  filename: string;
  dirty: boolean;
  startupError: string;
  hasApiKey: boolean;
  canSaveApiKey: boolean;
  backupsPath: string;
  platform: string;
};

export type DesktopBridge = {
  state(): Promise<DesktopState>;
  chooseDatabase(kind: "open" | "create"): Promise<DesktopState | null>;
  retrySync(): Promise<DesktopState>;
  openBackups(): Promise<string>;
  setApiKey(value: string): Promise<DesktopState>;
  downloadResume(id: string): Promise<boolean>;
  onDatabaseChanged(callback: (state: DesktopState) => void): () => void;
  onNavigate(callback: (target: string) => void): () => void;
};

declare global {
  interface Window { desktop?: DesktopBridge; }
}

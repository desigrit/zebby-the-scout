import type { LocalModelStatus } from "./local-model-catalog";

export type DesktopState = {
  filePath: string;
  filename: string;
  dirty: boolean;
  startupError: string;
  hasApiKey: boolean;
  analysisProvider: "ollama" | "openai" | "builtin";
  ollamaUrl: string;
  ollamaModel: string;
  builtInModelId: string;
  localModels: LocalModelStatus[];
  modelsFolder: string;
  localEngine: { status: "idle" | "loading" | "analyzing"; modelId: string };
  totalMemory: number;
  availableMemory: number;
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
  setAnalysisProvider(value: DesktopState["analysisProvider"]): Promise<DesktopState>;
  setOllamaConfig(value: { url: string; model: string }): Promise<DesktopState>;
  listOllamaModels(url: string): Promise<string[]>;
  selectLocalModel(id: string): Promise<DesktopState>;
  pauseModelDownload(): Promise<DesktopState>;
  resumeModelDownload(id: string): Promise<DesktopState>;
  deleteLocalModel(id: string): Promise<DesktopState>;
  openModelFolder(): Promise<string>;
  setAppearance(value: DesktopState["appearance"]): Promise<DesktopState>;
  setLogCapture(value: boolean): Promise<DesktopState>;
  openLogs(): Promise<string>;
  downloadResume(id: string): Promise<boolean>;
  onDatabaseChanged(callback: (state: DesktopState) => void): () => void;
  onNavigate(callback: (target: string) => void): () => void;
  onLocalModelsChanged(callback: (state: DesktopState) => void): () => void;
};

declare global {
  interface Window { desktop?: DesktopBridge; }
}

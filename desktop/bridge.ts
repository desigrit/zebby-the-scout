import type { LocalModelStatus } from "./local-model-catalog";
import type { UpdateState } from "./release-updates";

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
  acceptedModelTerms: string[];
  localModels: LocalModelStatus[];
  modelsFolder: string;
  localEngine: { status: "idle" | "loading" | "analyzing"; modelId: string };
  totalMemory: number;
  availableMemory: number;
  canSaveApiKey: boolean;
  appearance: "auto" | "dark" | "light";
  sidebarCollapsed: boolean;
  logsPath: string;
  platform: string;
  updates: UpdateState;
};

export type DesktopBridge = {
  state(): Promise<DesktopState>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  confirmUpdateLoaded(): Promise<void>;
  onUpdatesChanged(callback: (updates: UpdateState) => void): () => void;
  chooseDatabase(kind: "open" | "create"): Promise<DesktopState | null>;
  retrySync(): Promise<DesktopState>;
  setApiKey(value: string): Promise<DesktopState>;
  setAnalysisProvider(value: DesktopState["analysisProvider"]): Promise<DesktopState>;
  setOllamaConfig(value: { url: string; model: string }): Promise<DesktopState>;
  listOllamaModels(url: string): Promise<string[]>;
  selectLocalModel(id: string): Promise<DesktopState>;
  pauseModelDownload(): Promise<DesktopState>;
  resumeModelDownload(id: string, termsVersion?: string): Promise<DesktopState>;
  deleteLocalModel(id: string): Promise<DesktopState>;
  openModelFolder(): Promise<string>;
  setAppearance(value: DesktopState["appearance"]): Promise<DesktopState>;
  setSidebarCollapsed(value: boolean): Promise<DesktopState>;
  openLogs(): Promise<void>;
  downloadResume(id: string): Promise<boolean>;
  onDatabaseChanged(callback: (state: DesktopState) => void): () => void;
  onNavigate(callback: (target: string) => void): () => void;
  onLocalModelsChanged(callback: (state: DesktopState) => void): () => void;
};

declare global {
  interface Window { desktop?: DesktopBridge; }
}

import type { LocalModelStatus } from "./local-model-catalog";
import type { UpdateState } from "./release-updates";
import type { AnalysisProvider, AnalysisSource, CreditQuote, CreditsState } from "../shared/online-models";
import type { WalletPairing } from "../shared/wallet-access";
import type { ThinkingCapability, ThinkingPreferences } from "../shared/thinking";

export type DesktopState = {
  filePath: string;
  filename: string;
  dirty: boolean;
  startupError: string;
  hasApiKey: boolean;
  apiKeyHint: string;
  anthropicKeyHint: string;
  thinkingLevels: ThinkingPreferences;
  analysisProvider: AnalysisProvider;
  hasAnthropicKey: boolean;
  openaiModel: string;
  anthropicModel: string;
  credits: CreditsState;
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
  cancelAnalysis(id: string): Promise<boolean>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  confirmUpdateLoaded(): Promise<void>;
  onUpdatesChanged(callback: (updates: UpdateState) => void): () => void;
  chooseDatabase(kind: "open" | "create"): Promise<DesktopState | null>;
  retrySync(): Promise<DesktopState>;
  setApiKey(value: string): Promise<DesktopState>;
  setAnthropicKey(value: string): Promise<DesktopState>;
  setOnlineModel(provider: "openai" | "anthropic" | "credits", model: string): Promise<DesktopState>;
  setThinkingLevel(value: { provider: AnalysisProvider; model: string; level: string }): Promise<DesktopState>;
  refreshCredits(): Promise<DesktopState>;
  refreshCreditAccess(): Promise<DesktopState>;
  saveCreditRecoveryCode(rotate?: boolean): Promise<{ saved: boolean; state: DesktopState }>;
  connectCreditWallet(kind: "restore" | "connect", code: string): Promise<{ connected: boolean; state: DesktopState }>;
  createCreditPairing(): Promise<WalletPairing>;
  cancelCreditPairing(): Promise<void>;
  removeCreditDevice(id: string): Promise<DesktopState>;
  warmCreditsService(): Promise<void>;
  startCreditCheckout(pack: string): Promise<{ id: string; mode: "test" | "live" }>;
  creditCheckoutStatus(id: string): Promise<"paid" | "pending" | "expired">;
  quoteCreditAnalysis(source: AnalysisSource): Promise<CreditQuote>;
  onCreditsChanged(callback: (state: DesktopState) => void): () => void;
  setAnalysisProvider(value: DesktopState["analysisProvider"]): Promise<DesktopState>;
  setOllamaConfig(value: { url: string; model: string }): Promise<DesktopState>;
  listOllamaModels(url: string): Promise<string[]>;
  ollamaThinkingCapability(url: string, model: string): Promise<ThinkingCapability>;
  selectLocalModel(id: string): Promise<DesktopState>;
  pauseModelDownload(): Promise<DesktopState>;
  stopModelDownload(id: string): Promise<DesktopState>;
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

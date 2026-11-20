export type ChatGPTModel = { id: string; name: string; thinking: string[]; defaultThinking: string; vision: boolean };
export type ChatGPTTokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number;
  cachedInputTokens?: number; cacheWriteInputTokens?: number; reasoningTokens?: number };
export type ChatGPTUsageReport = { usage?: ChatGPTTokenUsage; responseId?: string; model?: string };
export type ChatGPTJobAttempt = ChatGPTUsageReport & { id: string; startedAt: string; finishedAt?: string;
  state: string; requestStarted?: boolean };
export type ChatGPTJobSummary = { id: string; name: string; state: string; createdAt: string; updatedAt?: string; error: string;
  model?: string; thinking?: string; attempts?: ChatGPTJobAttempt[]; reuseCount?: number; lastReusedAt?: string };
export type ChatGPTState = {
  available: boolean; connected: boolean; connecting: boolean; account: string; activeAccount: string;
  accounts: { id: string; label: string }[]; models: ChatGPTModel[]; model: string; thinking: string;
  tested: boolean; visionTested: boolean; notice: string; error: string; paused: boolean; welcome: boolean;
  jobs: ChatGPTJobSummary[];
};
export type AnalysisReceipt = { id: string; digest: string };
export const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";
export class ChatGPTPlanError extends Error {
  readonly recovery: "signin" | "usage" | "retry" | "settings" | "invalid";
  constructor(message: string, recovery: "signin" | "usage" | "retry" | "settings" | "invalid" = "retry") {
    super(message); this.name = "ChatGPTPlanError"; this.recovery = recovery;
  }
}
export const chatGPTUsageError = (error: unknown) => error instanceof ChatGPTPlanError && error.recovery === "usage";

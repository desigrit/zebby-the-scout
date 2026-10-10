import { onlineModel, onlineThinking, type AnalysisProvider } from "./online-models.ts";

export type ThinkingOption = { value: string; label: string };
export type ThinkingCapability = { options: ThinkingOption[]; defaultValue: string; known: boolean };
export type ThinkingPreferences = Record<string, string>;
export function thinkingLabel(value: string) {
  const label = value.startsWith("level:") ? value.slice(6) : value;
  return label === "xhigh" ? "Extra high" : label === "max" ? "Maximum" : label === "default" ? "Model default"
    : label.charAt(0).toUpperCase() + label.slice(1);
}
export function thinkingKey(provider: AnalysisProvider, model: string, serverUrl = "") {
  return JSON.stringify(provider === "ollama" ? [provider, serverUrl, model] : [provider, model]);
}
export function onlineThinkingCapability(model: string): ThinkingCapability {
  const capability = onlineThinking(onlineModel(model));
  return { options: capability.values.map((value) => ({ value, label: thinkingLabel(value) })), defaultValue: capability.defaultValue, known: true };
}
export function localThinkingCapability(supportsThinking: boolean): ThinkingCapability {
  return supportsThinking ? { options: [{ value: "off", label: "Off" }, { value: "on", label: "On" }], defaultValue: "off", known: true }
    : { options: [], defaultValue: "off", known: true };
}
export function selectedThinking(preferences: ThinkingPreferences | undefined, key: string, capability: ThinkingCapability) {
  const saved = preferences?.[key];
  return capability.options.some((item) => item.value === saved) ? saved! : capability.defaultValue;
}
// A fixed mask avoids revealing key length. Only the last four characters leave the main process.
export function maskedApiKey(key: string, provider: "openai" | "anthropic") {
  return key ? `${provider === "openai" ? "sk" : "sk-ant"}-••••••••${key.length >= 12 ? key.slice(-4) : ""}` : "";
}

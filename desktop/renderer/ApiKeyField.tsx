import { useLayoutEffect, useRef, useState } from "react";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import type { DesktopState } from "../bridge";
import type { ChangeAnalysisState } from "./ThinkingSettings";
import SettingsAction from "./SettingsAction";

export default function ApiKeyField({ state, onState, provider, disabled, onBusy }: {
  state: DesktopState; onState: ChangeAnalysisState; provider: "openai" | "anthropic"; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const hasKey = provider === "openai" ? state.hasApiKey : state.hasAnthropicKey;
  const hint = provider === "openai" ? state.apiKeyHint : state.anthropicKeyHint;
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(""), [working, setWorking] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null), change = useRef<HTMLButtonElement>(null), restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (working || disabled) return;
    if (editing) input.current?.focus({ preventScroll: true });
    else if (restoreFocus.current) { restoreFocus.current = false; (hasKey ? change.current : input.current)?.focus({ preventScroll: true }); }
  }, [editing, hasKey, working, disabled]);
  function cancel() { setDraft(""); setError(""); restoreFocus.current = true; setEditing(false); }
  async function save(value: string) {
    setWorking(true); onBusy(true); setError("");
    try {
      const next = await (provider === "openai" ? window.desktop!.setApiKey(value) : window.desktop!.setAnthropicKey(value));
      setDraft(""); restoreFocus.current = true; setEditing(false); await onState(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the key. Try again."); }
    finally { setWorking(false); onBusy(false); }
  }
  return <div className="analysis-key-control">
    {hasKey && !editing ? <div className="saved-api-key"><div className="saved-key-value"><span>API key</span>
      <output aria-label="Saved API key">{hint || "••••••••"}</output></div>
      <div className="saved-key-actions"><SettingsAction className="settings-action-slim" icon={Pencil} disabled={disabled || working}
        ref={change} onClick={() => { setDraft(""); setError(""); setEditing(true); }}>Change key</SettingsAction>
        <SettingsAction className="settings-action-slim" variant="danger" icon={Trash2} disabled={disabled || working}
          onClick={() => void save("")}>Remove key</SettingsAction></div></div>
      : <form className="api-key-editor" onSubmit={(event) => { event.preventDefault(); if (draft.trim() && !working) void save(draft.trim()); }}
        onKeyDown={(event) => { if (event.key === "Escape" && editing && !working) { event.preventDefault(); cancel(); } }}>
        <label className="field"><span>{hasKey ? "New API key" : "API key"}</span><input ref={input} type="password" value={draft}
          autoComplete="off" spellCheck={false} maxLength={500} disabled={disabled || working}
          onChange={(event) => setDraft(event.target.value)} placeholder={provider === "openai" ? "sk-…" : "sk-ant-…"} /></label>
        <div className="key-editor-actions"><SettingsAction className="settings-action-slim" type="submit" variant="primary" icon={KeyRound}
          busy={working} disabled={disabled || !draft.trim()}>Save key</SettingsAction>
          {hasKey && <SettingsAction className="settings-action-slim" disabled={disabled || working} onClick={cancel}>Cancel</SettingsAction>}</div>
      </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!state.canSaveApiKey && <p className="settings-help">Secure storage is unavailable. Your key stays for this session only.</p>}
  </div>;
}

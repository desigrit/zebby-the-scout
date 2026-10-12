import { useEffect, useRef, useState } from "react";
import { KeyRound, Link2 } from "lucide-react";
import type { DesktopState } from "../bridge";
import SettingsAction from "./SettingsAction";
import { ErrorBanner } from "./WorkspaceFeedback";

export default function CreditAccessForm({ kind, onState, onConnected, onCancel, onBusy }: {
  kind: "restore" | "connect"; onState: (state: DesktopState) => void;
  onConnected: () => void; onCancel: () => void; onBusy?: (busy: boolean) => void;
}) {
  const [code, setCode] = useState(""), [working, setWorking] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null), inFlight = useRef(false);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => () => onBusy?.(false), [onBusy]);
  async function submit() {
    if (inFlight.current || !code.trim()) return;
    inFlight.current = true; setWorking(true); onBusy?.(true); setError("");
    try {
      const result = await window.desktop!.connectCreditWallet(kind, code.trim());
      onState(result.state);
      if (result.connected) onConnected();
      else setError("Connection interrupted. Try again to finish.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect these credits."); }
    finally { inFlight.current = false; setWorking(false); onBusy?.(false); }
  }
  return <form className="credit-connect-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <label className="field"><span>{kind === "restore" ? "Recovery code" : "Pairing code"}</span>
      <input ref={input} type={kind === "restore" ? "password" : "text"} value={code} autoComplete="off" spellCheck={false}
        maxLength={100} required disabled={working} placeholder={kind === "restore" ? "Paste your saved recovery code" : "ABCD-EFGH"}
        onChange={(event) => setCode(event.target.value)} /></label>
    {kind === "connect" && <p className="settings-help">On your connected computer, open Settings, then Manage credits to create a pairing code.</p>}
    <ErrorBanner message={error} retry={() => void submit()} busy={working} />
    <div className="settings-actions"><SettingsAction variant="primary" type="submit" icon={kind === "restore" ? KeyRound : Link2}
      busy={working} disabled={!code.trim()}>{kind === "restore" ? "Restore credits" : "Connect"}</SettingsAction>
      <SettingsAction disabled={working} onClick={onCancel}>Cancel</SettingsAction></div>
  </form>;
}

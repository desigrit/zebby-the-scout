import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Link2, LoaderCircle, Monitor, RefreshCw, ShieldCheck, Unplug, X } from "lucide-react";
import { formatCredits, onlineModel } from "../../shared/online-models";
import { creditUsage } from "../../shared/credit-usage";
import type { WalletPairing } from "../../shared/wallet-access";
import { OnlineModelSelect } from "./AnalysisSettings";
import SettingsAction from "./SettingsAction";
import { useAnalysisFlow } from "./AnalysisFlow";

export function CreditsSettings() {
  const { state, updateState } = useAnalysisFlow();
  const credits = state.credits, wallet = credits.wallet;
  const usage = wallet ? creditUsage(wallet) : null;
  const hasCredits = credits.signedIn && Boolean(wallet && (wallet.purchased || wallet.balance || wallet.used));
  const [helpOpen, setHelpOpen] = useState(false);
  const helpDialog = useRef<HTMLDialogElement | null>(null), helpOpener = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [working, setWorking] = useState(false);
  const [editor, setEditor] = useState<"restore" | "connect" | null>(null), [code, setCode] = useState("");
  const [pairing, setPairing] = useState<WalletPairing | null>(null), [remaining, setRemaining] = useState(0), [copied, setCopied] = useState(false);
  const pairedDevices = useRef(new Set<string>());
  const opener = useRef<HTMLButtonElement | null>(null), input = useRef<HTMLInputElement | null>(null);
  const restoreFocus = useRef(false);
  const usable = state.canSaveApiKey;
  const pairingActive = Boolean(pairing) && remaining > 0;
  useEffect(() => {
    if (!credits.signedIn) return;
    let active = true;
    void window.desktop!.refreshCreditAccess().then((next) => { if (active) updateState(next); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load wallet access."); });
    return () => { active = false; };
  }, [credits.signedIn, updateState]);
  useLayoutEffect(() => {
    if (editor) input.current?.focus({ preventScroll: true });
    else if (!working && restoreFocus.current) { restoreFocus.current = false; opener.current?.focus({ preventScroll: true }); }
  }, [editor, working]);
  useEffect(() => {
    const element = helpDialog.current;
    if (!element) return;
    if (helpOpen && !element.open) element.showModal();
    else if (!helpOpen && element.open) { element.close(); helpOpener.current?.focus({ preventScroll: true }); }
  }, [helpOpen]);
  useEffect(() => {
    if (!pairing) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [pairing]);
  useEffect(() => {
    if (!pairing || !pairingActive) return;
    let active = true;
    const timer = setInterval(() => {
      void window.desktop!.refreshCreditAccess().then((next) => {
        if (!active) return;
        updateState(next);
        if (next.credits.access?.devices.some((item) => !pairedDevices.current.has(item.id))) {
          setPairing(null); setNotice("Computer connected.");
        }
      }).catch(() => { /* Refresh balance also retries access after a connection interruption. */ });
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [pairing, pairingActive, updateState]);
  async function action(operation: () => Promise<void>) {
    setWorking(true); setError(""); setNotice("");
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update wallet access."); }
    finally { setWorking(false); }
  }
  async function refreshBalance() {
    updateState(await window.desktop!.refreshCredits()); updateState(await window.desktop!.refreshCreditAccess());
  }
  function openEditor(kind: "restore" | "connect", button: HTMLButtonElement) {
    opener.current = button; setCode(""); setError(""); setNotice(""); setEditor(kind);
  }
  function closeEditor() { restoreFocus.current = true; setEditor(null); setCode(""); }
  async function saveRecovery(rotate = false) {
    const result = await window.desktop!.saveCreditRecoveryCode(rotate); updateState(result.state);
    if (result.saved) setNotice("Recovery code saved. Keep the file private.");
  }
  async function startPairing() {
    const next = await window.desktop!.refreshCreditAccess(); updateState(next);
    pairedDevices.current = new Set(next.credits.access?.devices.map((item) => item.id));
    const value = await window.desktop!.createCreditPairing(); setCopied(false);
    setRemaining(Math.max(0, Math.ceil((Date.parse(value.expiresAt) - Date.now()) / 1000))); setPairing(value);
  }
  const displayCode = pairing?.code.replace(/(.{4})(.{4})/, "$1-$2") || "";
  const roundedPercent = usage ? Math.round(usage.percentRemaining) : 0;
  const percentLabel = usage && usage.percentRemaining > 0 && roundedPercent === 0 ? "<1% left" : `${roundedPercent}% left`;
  const feedback = <>{(error || credits.error) && <p className="form-error" role="alert">{error || credits.error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}</>;
  return <section className="settings-section" aria-labelledby="credits-settings">
    <div className="settings-section-heading"><h2 id="credits-settings">Credits</h2></div>
    <div className="settings-content credit-settings-content">
      {hasCredits && wallet && usage ? <>
        <div className="credit-usage-card">
          <div className="credit-usage-heading"><strong>{formatCredits(usage.available)} credits available</strong>
            <SettingsAction className="credit-usage-refresh" icon={RefreshCw} iconOnly busy={working}
              disabled={!usable} aria-label="Refresh balance" title="Refresh balance" onClick={() => void action(refreshBalance)} /></div>
          <div className="credit-usage-summary"><span>{formatCredits(wallet.used)} used of {formatCredits(usage.total)}</span><span>{percentLabel}</span></div>
          <div className="credit-usage-track" role="progressbar" aria-label="Credits remaining" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Number(usage.percentRemaining.toFixed(2))} aria-valuetext={`${formatCredits(usage.available)} credits available, ${formatCredits(wallet.used)} used${wallet.reserved ? `, ${formatCredits(wallet.reserved)} reserved for running analysis` : ""}`}>
            <span style={{ width: `${usage.percentRemaining}%` }} /></div>
        </div>
        {credits.stale && <p className="settings-help">Saved balance. Refresh to update.</p>}
        {!!wallet.reserved && <p className="settings-help">{formatCredits(wallet.reserved)} credits reserved for running analysis.</p>}
        <OnlineModelSelect state={state} onState={updateState} provider="credits" disabled={working} />
      </> : credits.signedIn && !wallet ? <div className="credit-wallet-loading">
        {!credits.stale && !credits.error ? <span role="status"><LoaderCircle size={16} className="spin" aria-hidden="true" />Loading credits</span>
          : <p className="settings-help">Could not load your credits.</p>}
        <SettingsAction icon={RefreshCw} busy={working} disabled={!usable} onClick={() => void action(refreshBalance)}>Refresh balance</SettingsAction>
      </div> : <p className="settings-help credit-empty">No credits found. Buy a pack or restore your existing credits.</p>}
      {credits.pendingConnection && <div className="credit-connection-pending"><p className="settings-help" role="status">Connection interrupted. Refresh to finish.</p>
        {!hasCredits && !(credits.signedIn && !wallet) && <SettingsAction icon={RefreshCw} busy={working} disabled={!usable} onClick={() => void action(refreshBalance)}>Refresh balance</SettingsAction>}</div>}
      <div className="credit-settings-links">
        <div className="credit-restore-links"><button className="settings-link" type="button" disabled={!usable || working || pairingActive}
          onClick={(event) => openEditor("restore", event.currentTarget)}>Restore credits</button><span aria-hidden="true">|</span>
          <button className="settings-link" type="button" disabled={!usable || working || pairingActive}
            onClick={(event) => openEditor("connect", event.currentTarget)}>Connect this computer</button></div>
        <button ref={helpOpener} className="settings-link" type="button" disabled={working} onClick={() => setHelpOpen(true)}>Learn more</button>
      </div>
      {editor && <form className="credit-connect-form" onSubmit={(event) => { event.preventDefault(); void action(async () => {
        const result = await window.desktop!.connectCreditWallet(editor, code); updateState(result.state);
        if (result.connected) { closeEditor(); setNotice(editor === "restore" ? "Credits restored." : "Computer connected."); }
      }); }} onKeyDown={(event) => { if (event.key === "Escape" && !working) { event.preventDefault(); closeEditor(); } }}>
        <label className="field"><span>{editor === "restore" ? "Recovery code" : "Pairing code"}</span>
          <input ref={input} type={editor === "restore" ? "password" : "text"} value={code} spellCheck={false} autoComplete="off" maxLength={100}
            placeholder={editor === "restore" ? "Paste your saved recovery code" : "ABCD-EFGH"} required disabled={working} onChange={(event) => setCode(event.target.value)} /></label>
        <div className="settings-actions"><SettingsAction variant="primary" icon={editor === "restore" ? KeyRound : Link2} type="submit" busy={working} disabled={!code.trim()}>
          {editor === "restore" ? "Restore credits" : "Connect"}</SettingsAction>
          <SettingsAction disabled={working} onClick={closeEditor}>Cancel</SettingsAction></div>
      </form>}
      {!usable && <p className="form-error">Credit wallets need Windows secure storage or Mac Keychain.</p>}
      {!helpOpen && feedback}
      <dialog ref={helpDialog} className="analysis-dialog credit-help-dialog" aria-labelledby="credit-help-title"
        onCancel={(event) => { event.preventDefault(); if (!working) setHelpOpen(false); }} onClose={() => setHelpOpen(false)}>
        <header className="analysis-dialog-header"><h2 id="credit-help-title">About credits</h2>
          <SettingsAction className="analysis-dialog-close" icon={X} iconOnly disabled={working} aria-label="Close credit help" title="Close"
            onClick={() => setHelpOpen(false)} /></header>
        <div className="analysis-dialog-body">
          <section className="credit-help-topic"><h3>Restore credits</h3>
            <p>Use your saved recovery code to recover your credit balance after reinstalling Zebby or replacing a computer.</p>
            {hasCredits && <><SettingsAction icon={ShieldCheck} disabled={!usable || working} onClick={() => void action(() => saveRecovery())}>Save recovery code</SettingsAction>
              {credits.access?.hasRecoveryCode && <details className="credit-recovery-options"><summary>Replace recovery code</summary><p className="settings-help">The new code replaces the previous one. Connected computers keep access.</p>
                <SettingsAction icon={RefreshCw} disabled={!usable || working} onClick={() => void action(() => saveRecovery(true))}>Create new recovery code</SettingsAction></details>}</>}
          </section>
          <section className="credit-help-topic"><h3>Connect this computer</h3>
            <p>Enter a pairing code from Zebby on your other computer to share the same balance. Codes expire after 10 minutes and work once.</p>
            {hasCredits && <SettingsAction icon={Monitor} disabled={!usable || working || Boolean(pairing)} onClick={() => void action(startPairing)}>Connect another computer</SettingsAction>}
            {pairing && <div className="credit-pairing-panel" aria-labelledby="credit-pairing-title">
              <div className="credit-pairing-heading"><strong id="credit-pairing-title">Enter this code on your other computer</strong>
                <SettingsAction icon={X} iconOnly disabled={working} aria-label="Cancel pairing" title="Cancel pairing" onClick={() => void action(async () => {
                  await window.desktop!.cancelCreditPairing(); setPairing(null); setRemaining(0); setCopied(false);
                })} /></div>
              <p className="settings-help">Open Settings, Credits, then Connect this computer.</p>
              <div className="credit-pairing-code"><output aria-label="Pairing code">{displayCode}</output>
                <SettingsAction icon={copied ? Check : Copy} disabled={working || remaining <= 0} onClick={() => void action(async () => {
                  await navigator.clipboard.writeText(displayCode); setCopied(true);
                })}>{copied ? "Copied" : "Copy code"}</SettingsAction></div>
              <div className="credit-pairing-expiry"><span>{remaining > 0 ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Code expired. Generate a new one."}</span>
                <SettingsAction icon={RefreshCw} disabled={working} onClick={() => void action(startPairing)}>New code</SettingsAction></div>
            </div>}
            {hasCredits && <details className="credit-devices"><summary>Connected computers{credits.access ? ` (${credits.access.devices.length})` : ""}</summary>
              {credits.access ? <ul>{credits.access.devices.map((device) => <li key={device.id}><Monitor size={17} aria-hidden="true" />
                <span><strong>{device.name}</strong><small>{device.current ? "This computer" : `Last used ${new Date(device.lastSeenAt).toLocaleDateString()}`}</small></span>
                {!device.current && <SettingsAction variant="danger" icon={Unplug} disabled={working} onClick={() => void action(async () => {
                  updateState(await window.desktop!.removeCreditDevice(device.id));
                })}>Disconnect</SettingsAction>}</li>)}</ul> : <p className="settings-help">Refresh balance to load connected computers.</p>}
            </details>}
          </section>
          {!!wallet?.recent.length && <details className="credit-history"><summary>Recent usage</summary><ul>{wallet.recent.map((item) => <li key={item.id}>
            <span>{modelName(item.model)}<small>{new Date(item.createdAt).toLocaleDateString()} · {item.kind === "plan" ? "Plan analysis" : "Resume match"}</small></span><strong>{formatCredits(item.cost)} credits</strong>
          </li>)}</ul></details>}
          {helpOpen && feedback}
        </div>
      </dialog>
    </div>
  </section>;
}
function modelName(id: string) { try { return onlineModel(id).name; } catch { return "Online model"; } }

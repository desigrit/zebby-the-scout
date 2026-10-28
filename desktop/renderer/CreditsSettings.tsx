import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Link2, LoaderCircle, Monitor, RefreshCw, ShieldCheck, Unplug, X } from "lucide-react";
import { formatCredits } from "../../shared/online-models";
import { creditUsage } from "../../shared/credit-usage";
import type { WalletPairing } from "../../shared/wallet-access";
import SettingsAction from "./SettingsAction";
import { ErrorBanner } from "./WorkspaceFeedback";
import { useAnalysisFlow } from "./AnalysisFlow";
import CreditUsage from "./CreditUsage";

export function CreditsSettings() {
  const { state, updateState } = useAnalysisFlow();
  const credits = state.credits, wallet = credits.wallet;
  const usage = wallet ? creditUsage(wallet) : null;
  const hasCredits = Boolean(wallet && (wallet.purchased || wallet.balance || wallet.used));
  const [helpOpen, setHelpOpen] = useState(false);
  const helpDialog = useRef<HTMLDialogElement | null>(null), helpOpener = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [working, setWorking] = useState(false);
  const [editor, setEditor] = useState<"restore" | "connect" | null>(null), [code, setCode] = useState("");
  const [pairing, setPairing] = useState<WalletPairing | null>(null), [remaining, setRemaining] = useState(0), [copied, setCopied] = useState(false);
  const retryAction = useRef<(() => void) | null>(null);
  const pairedDevices = useRef(new Set<string>());
  const opener = useRef<HTMLButtonElement | null>(null), input = useRef<HTMLInputElement | null>(null);
  const restoreFocus = useRef(false);
  const feedbackEpoch = useRef(0);
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
    feedbackEpoch.current++;
    retryAction.current = () => void action(operation);
    setWorking(true); setError(""); setNotice("");
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update wallet access."); }
    finally { setWorking(false); }
  }
  const refreshBalance = useCallback(async (isActive: () => boolean = () => true, broadcastOnly = false) => {
    const balance = await window.desktop!.refreshCredits();
    if (!isActive()) return;
    if (!broadcastOnly) updateState(balance);
    const access = await window.desktop!.refreshCreditAccess();
    if (isActive() && !broadcastOnly) updateState(access);
  }, [updateState]);
  useEffect(() => {
    if (!helpOpen || !credits.signedIn) return;
    let active = true;
    const epoch = ++feedbackEpoch.current;
    // The main-process broadcasts are authoritative. Ignoring returned snapshots
    // here prevents a background open from replacing newer settings or wallet data.
    void refreshBalance(() => active, true).then(() => {
      if (active && epoch === feedbackEpoch.current) setError("");
    }).catch((cause) => {
      if (active && epoch === feedbackEpoch.current) {
        retryAction.current = null;
        setError(cause instanceof Error ? cause.message : "Could not refresh credits.");
      }
    });
    return () => { active = false; };
  }, [helpOpen, credits.signedIn, refreshBalance]);
  function openEditor(kind: "restore" | "connect", button: HTMLButtonElement) {
    opener.current = button; setCode(""); setError(""); setNotice(""); setEditor(kind);
  }
  function closeEditor() { restoreFocus.current = true; setEditor(null); setCode(""); }
  function closeManager() { setHelpOpen(false); setEditor(null); setCode(""); }
  async function saveRecovery(rotate = false) {
    const result = await window.desktop!.saveCreditRecoveryCode(rotate); updateState(result.state);
    if (result.saved) setNotice("Recovery code saved.");
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
  const feedback = <><ErrorBanner message={credits.pendingConnection ? "" : error || credits.error} retry={() => error && retryAction.current ? retryAction.current() : void action(refreshBalance)} busy={working} />
    {notice && <p className="notice" role="status">{notice}</p>}</>;
  const accessForm = editor && <form className="credit-connect-form" onSubmit={(event) => { event.preventDefault(); void action(async () => {
    const result = await window.desktop!.connectCreditWallet(editor, code); updateState(result.state);
    if (result.connected) { closeEditor(); setNotice(editor === "restore" ? "Credits restored." : "Computer connected."); }
  }); }} onKeyDown={(event) => { if (event.key === "Escape" && !working) { event.preventDefault(); event.stopPropagation(); closeEditor(); } }}>
    <label className="field"><span>{editor === "restore" ? "Recovery code" : "Pairing code"}</span>
      <input ref={input} type={editor === "restore" ? "password" : "text"} value={code} spellCheck={false} autoComplete="off" maxLength={100}
        placeholder={editor === "restore" ? "Paste your recovery code" : "ABCD-EFGH"} required disabled={working} onChange={(event) => setCode(event.target.value)} /></label>
    <div className="settings-actions"><SettingsAction variant="primary" type="submit" busy={working} disabled={!code.trim()}>
      {editor === "restore" ? "Restore credits" : "Connect"}</SettingsAction>
      <SettingsAction disabled={working} onClick={closeEditor}>Cancel</SettingsAction></div>
  </form>;
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
        {credits.stale && <p className="settings-help">Last updated {new Date(wallet.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>}
        {!!wallet.reserved && <p className="settings-help">{formatCredits(wallet.reserved)} credits reserved for running analysis.</p>}
      </> : credits.pendingConnection ? null : credits.signedIn && !wallet ? <div className="credit-wallet-loading">
        {!credits.stale && !credits.error ? <span role="status"><LoaderCircle size={16} className="spin" aria-hidden="true" />Loading credits</span>
          : <p className="settings-help">Could not load your credits.</p>}
        <SettingsAction icon={RefreshCw} busy={working} disabled={!usable} onClick={() => void action(refreshBalance)}>Refresh balance</SettingsAction>
      </div> : <p className="settings-help credit-empty">No credits found. Buy a pack or restore your existing credits.</p>}
      {credits.pendingConnection && <div className="credit-connection-pending"><p className="settings-help" role="status">Connection interrupted.</p>
        <SettingsAction icon={RefreshCw} busy={working} disabled={!usable} onClick={() => void action(refreshBalance)}>Retry connection</SettingsAction></div>}
      <div className="credit-settings-links">
        <button ref={helpOpener} className="settings-link" type="button" aria-haspopup="dialog" disabled={working} onClick={() => setHelpOpen(true)}>Manage credits</button>
      </div>
      {!usable && <p className="form-error">Credit wallets need Windows secure storage or Mac Keychain.</p>}
      {!helpOpen && feedback}
      <dialog ref={helpDialog} className="analysis-dialog credit-help-dialog credit-manager-dialog" aria-labelledby="credit-help-title"
        onCancel={(event) => { event.preventDefault(); if (!working) closeManager(); }} onClose={() => setHelpOpen(false)}>
        <header className="analysis-dialog-header"><h2 id="credit-help-title">Credits and devices</h2>
          <SettingsAction className="credit-manager-refresh" icon={RefreshCw} iconOnly busy={working} disabled={!usable}
            aria-label="Refresh credits and devices" title="Refresh" onClick={() => void action(refreshBalance)} />
          <SettingsAction className="analysis-dialog-close" icon={X} iconOnly disabled={working} aria-label="Close credits and devices" title="Close"
            onClick={closeManager} /></header>
        <div className="analysis-dialog-body credit-manager-layout">
          <section className="credit-manager-access" aria-labelledby="credit-manage-title"><h3 id="credit-manage-title">Manage credits</h3>
            {usage && <div className="credit-manager-balance"><strong>{formatCredits(usage.available)}<span> credits available</span></strong>
              <div className="credit-usage-track" aria-hidden="true"><span style={{ width: `${usage.percentRemaining}%` }} /></div>
              <span>{percentLabel}{wallet?.reserved ? ` · ${formatCredits(wallet.reserved)} reserved` : ""}</span></div>}
            {hasCredits && <div className="credit-manager-task"><h4>Recovery code</h4>
              <p>Keep your credits when you reinstall or switch computers.</p>
              <SettingsAction icon={ShieldCheck} disabled={!usable || working} onClick={() => void action(() => saveRecovery())}>Save recovery code</SettingsAction>
              {credits.access?.hasRecoveryCode && <button type="button" className="settings-link credit-replace-code" disabled={!usable || working}
                onClick={() => void action(() => saveRecovery(true))}>Replace code</button>}
            </div>}
            {hasCredits && <div className="credit-manager-task"><h4>Use credits on another computer</h4>
              <p>Share this balance with a one-time pairing code.</p>
              <SettingsAction icon={Monitor} disabled={!usable || working || pairingActive} onClick={() => void action(startPairing)}>Connect another computer</SettingsAction>
            {pairing && <div className="credit-pairing-panel" role="group" aria-label="Pairing instructions">
              <div className="credit-pairing-heading"><strong id="credit-pairing-title">Pairing code</strong>
                <SettingsAction icon={X} iconOnly disabled={working} aria-label="Cancel pairing" title="Cancel pairing" onClick={() => void action(async () => {
                  await window.desktop!.cancelCreditPairing(); setPairing(null); setRemaining(0); setCopied(false);
                })} /></div>
              <p className="settings-help">On your other computer: Manage credits, then Connect this computer.</p>
              <div className="credit-pairing-code"><output aria-label="Pairing code">{displayCode}</output>
                <SettingsAction icon={copied ? Check : Copy} disabled={working || remaining <= 0} onClick={() => void action(async () => {
                  await navigator.clipboard.writeText(displayCode); setCopied(true);
                })}>{copied ? "Copied" : "Copy code"}</SettingsAction></div>
              <div className="credit-pairing-expiry"><span>{remaining > 0 ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Code expired"}</span>
                <SettingsAction icon={RefreshCw} disabled={working} onClick={() => void action(startPairing)}>New code</SettingsAction></div>
            </div>}
            </div>}
            <div className="credit-manager-task"><h4>{hasCredits ? "Restore or connect a wallet" : "Already have credits?"}</h4>
              <p>Restore with a saved recovery code, or enter a pairing code from your other computer.</p>
              <div className="credit-access-actions"><SettingsAction icon={KeyRound} aria-expanded={editor === "restore"} disabled={!usable || working || pairingActive}
                onClick={(event) => openEditor("restore", event.currentTarget)}>Restore credits</SettingsAction>
                <SettingsAction icon={Link2} aria-expanded={editor === "connect"} disabled={!usable || working || pairingActive}
                  onClick={(event) => openEditor("connect", event.currentTarget)}>Connect this computer</SettingsAction></div>
              {accessForm}
            </div>
            {helpOpen && feedback}
          </section>
          <div className="credit-manager-activity">
            <section className="credit-devices" aria-labelledby="credit-devices-title"><div className="credit-manager-section-title"><h3 id="credit-devices-title">Connected computers</h3>
              {credits.access && <span>{credits.access.devices.length}</span>}</div>
              {credits.access ? <ul>{credits.access.devices.map((device) => <li key={device.id}><Monitor size={17} aria-hidden="true" />
                <span><strong>{device.name}</strong><small>{device.current ? "This computer" : `Last used ${new Date(device.lastSeenAt).toLocaleDateString()}`}</small></span>
                {!device.current && <SettingsAction className="credit-device-disconnect" variant="danger" icon={Unplug} iconOnly title={`Disconnect ${device.name}`} aria-label={`Disconnect ${device.name}`} disabled={working} onClick={() => void action(async () => {
                  updateState(await window.desktop!.removeCreditDevice(device.id));
                })} />}</li>)}</ul> : <p className="settings-help">{credits.signedIn ? "Refresh to load connected computers." : "No computers connected."}</p>}
            </section>
            <CreditUsage wallet={wallet} />
          </div>
        </div>
      </dialog>
    </div>
  </section>;
}

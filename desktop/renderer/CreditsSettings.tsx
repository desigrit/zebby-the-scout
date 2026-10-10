import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Link2, LoaderCircle, Monitor, RefreshCw, ShieldCheck, X } from "lucide-react";
import { formatCredits, onlineModel } from "../../shared/online-models";
import type { WalletPairing } from "../../shared/wallet-access";
import { OnlineModelSelect } from "./AnalysisSettings";
import { useAnalysisFlow } from "./AnalysisFlow";

export function CreditsSettings() {
  const { state, updateState, openCredits } = useAnalysisFlow();
  const credits = state.credits;
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [working, setWorking] = useState(false);
  const [editor, setEditor] = useState<"restore" | "connect" | null>(null), [code, setCode] = useState("");
  const [pairing, setPairing] = useState<WalletPairing | null>(null), [remaining, setRemaining] = useState(0), [copied, setCopied] = useState(false);
  const pairedDevices = useRef(new Set<string>());
  const opener = useRef<HTMLButtonElement | null>(null), input = useRef<HTMLInputElement | null>(null);
  const restoreFocus = useRef(false);
  const usable = credits.available && state.canSaveApiKey;
  const pairingActive = remaining > 0;
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
  return <section className="settings-section" aria-labelledby="credits-settings">
    <div className="settings-section-heading"><h2 id="credits-settings">Credits</h2></div>
    <div className="settings-content credit-settings-content">
      {credits.signedIn ? <>
        <div className="credit-settings-balance">
          <div><small>Available</small><strong>{credits.wallet ? formatCredits(credits.wallet.balance - credits.wallet.reserved) : <LoaderCircle size={22} className="spin" aria-label="Loading balance" />}</strong></div>
          <div><small>Used</small><strong>{credits.wallet ? formatCredits(credits.wallet.used) : <LoaderCircle size={22} className="spin" aria-label="Loading usage" />}</strong></div>
        </div>
        {credits.stale && <p className="settings-help">{credits.wallet ? "Last saved balance. Refresh to check your credits." : "Refresh to load your credits."}</p>}
        {!!credits.wallet?.reserved && <p className="settings-help">{formatCredits(credits.wallet.reserved)} credits reserved for running analysis.</p>}
        {!!credits.wallet?.purchased && <OnlineModelSelect state={state} onState={updateState} provider="credits" disabled={working} />}
      </> : <p className="settings-help">Buy credits and choose an online model. No signup needed.</p>}
      {!credits.available && <p className="credit-unavailable">Paid credits are not connected yet. Local models and your own API keys still work.</p>}
      {credits.available && !state.canSaveApiKey && <p className="form-error">Paid credits need Windows secure storage or Mac Keychain.</p>}
      <div className="settings-actions">
        <button className="button button-primary" type="button" disabled={!usable || working} onClick={openCredits}>Buy credits</button>
        {credits.signedIn && <button className="button button-secondary" type="button" disabled={!usable || working} onClick={() => void action(async () => {
          updateState(await window.desktop!.refreshCredits()); updateState(await window.desktop!.refreshCreditAccess());
        })}><RefreshCw size={16} aria-hidden="true" />Refresh balance</button>}
      </div>
      <div className="credit-access-controls">
        {credits.signedIn && <>
          <div className="credit-access-row"><div><strong><ShieldCheck size={17} aria-hidden="true" />Recovery code</strong>
            <p>{credits.recoverySaved ? "Your recovery code is saved." : credits.access?.hasRecoveryCode ? "A recovery code is set. Keep your saved copy." : "Keep your credits if you reinstall or replace this computer."}</p></div>
            <button className="button button-secondary" type="button" disabled={!usable || working} onClick={() => void action(() => saveRecovery())}>Save recovery code</button>
          </div>
          <div className="credit-access-row"><div><strong><Monitor size={17} aria-hidden="true" />Other computers</strong><p>Use the same credit balance on Windows and Mac.</p></div>
            <button className="button button-secondary" type="button" disabled={!usable || working || Boolean(pairing)} onClick={() => void action(startPairing)}>Connect another computer</button>
          </div>
        </>}
        {pairing && <div className="credit-pairing-panel" aria-labelledby="credit-pairing-title">
          <div className="credit-pairing-heading"><strong id="credit-pairing-title">Enter this code on your other computer</strong>
            <button className="icon-button" type="button" disabled={working} aria-label="Cancel pairing" onClick={() => void action(async () => {
              await window.desktop!.cancelCreditPairing(); setPairing(null); setCopied(false);
            })}><X size={17} /></button></div>
          <p className="settings-help">Open Settings, Credits, then Connect this computer.</p>
          <div className="credit-pairing-code"><output aria-label="Pairing code">{displayCode}</output>
            <button className="button button-secondary" type="button" disabled={working || remaining <= 0} onClick={() => void action(async () => {
              await navigator.clipboard.writeText(displayCode); setCopied(true);
            })}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy code"}</button></div>
          <div className="credit-pairing-expiry"><span>{remaining > 0 ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Code expired. Generate a new one."}</span>
            <button className="text-button" type="button" disabled={working} onClick={() => void action(startPairing)}>New code</button></div>
        </div>}
        <div className="credit-restore-actions">
          <button className="text-button" type="button" disabled={!usable || working || Boolean(pairing)} onClick={(event) => openEditor("restore", event.currentTarget)}><KeyRound size={15} aria-hidden="true" />Restore credits</button>
          <button className="text-button" type="button" disabled={!usable || working || Boolean(pairing)} onClick={(event) => openEditor("connect", event.currentTarget)}><Link2 size={15} aria-hidden="true" />Connect this computer</button>
        </div>
        {editor && <form className="credit-connect-form" onSubmit={(event) => { event.preventDefault(); void action(async () => {
          const result = await window.desktop!.connectCreditWallet(editor, code); updateState(result.state);
          if (result.connected) { closeEditor(); setNotice(editor === "restore" ? "Credits restored." : "Computer connected."); }
        }); }} onKeyDown={(event) => { if (event.key === "Escape" && !working) { event.preventDefault(); closeEditor(); } }}>
          <label className="field"><span>{editor === "restore" ? "Recovery code" : "Pairing code"}</span>
            <input ref={input} type={editor === "restore" ? "password" : "text"} value={code} spellCheck={false} autoComplete="off" maxLength={100}
              placeholder={editor === "restore" ? "Paste your saved recovery code" : "ABCD-EFGH"} required disabled={working} onChange={(event) => setCode(event.target.value)} /></label>
          <div className="settings-actions"><button className="button button-primary" type="submit" disabled={working || !code.trim()}>
            {working && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{editor === "restore" ? "Restore credits" : "Connect"}</button>
            <button className="button button-secondary" type="button" disabled={working} onClick={closeEditor}>Cancel</button></div>
        </form>}
        {credits.signedIn && <>
          <details className="credit-devices"><summary>Connected computers{credits.access ? ` (${credits.access.devices.length})` : ""}</summary>
            {credits.access ? <ul>{credits.access.devices.map((device) => <li key={device.id}><Monitor size={17} aria-hidden="true" />
              <span><strong>{device.name}</strong><small>{device.current ? "This computer" : `Last used ${new Date(device.lastSeenAt).toLocaleDateString()}`}</small></span>
              {!device.current && <button className="text-button" type="button" disabled={working} onClick={() => void action(async () => {
                updateState(await window.desktop!.removeCreditDevice(device.id));
              })}>Disconnect</button>}</li>)}</ul> : <p className="settings-help">Refresh balance to load connected computers.</p>}
          </details>
          {credits.access?.hasRecoveryCode && <details className="credit-recovery-options"><summary>Recovery options</summary><p className="settings-help">A new code replaces the previous one. Connected computers keep access.</p>
            <button className="text-button" type="button" disabled={!usable || working} onClick={() => void action(() => saveRecovery(true))}>Create new recovery code</button></details>}
        </>}
      </div>
      {(error || credits.error) && <p className="form-error" role="alert">{error || credits.error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {!!credits.wallet?.recent.length && <details className="credit-history"><summary>Recent usage</summary><ul>{credits.wallet.recent.map((item) => <li key={item.id}>
        <span>{modelName(item.model)}<small>{new Date(item.createdAt).toLocaleDateString()} · {item.kind === "plan" ? "Plan analysis" : "Resume match"}</small></span><strong>{formatCredits(item.cost)} credits</strong>
      </li>)}</ul></details>}
    </div>
  </section>;
}
function modelName(id: string) { try { return onlineModel(id).name; } catch { return "Online model"; } }

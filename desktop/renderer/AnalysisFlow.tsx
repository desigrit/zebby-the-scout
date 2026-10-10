import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, Coins, Download, ExternalLink, KeyRound, LoaderCircle, RefreshCw, Server, X } from "lucide-react";
import type { DesktopState } from "../bridge";
import { CREDIT_PACKS, CREDIT_ESTIMATE_DESCRIPTION, formatCredits, onlineModel, quoteNeedsCredits, type AnalysisProvider, type AnalysisSource, type CreditQuote } from "../../shared/online-models";
import { AnalysisSettings, providerReady } from "./AnalysisSettings";
import { OnlineModelControls } from "./ThinkingSettings";
import { thinkingLabel } from "../../shared/thinking";
type Authorization = { quoteId?: string };
type Flow = { prepare: (source: AnalysisSource) => Promise<Authorization | null>; canAutoAnalyze: () => boolean;
  openCredits: () => void; state: DesktopState; updateState: (state: DesktopState) => void };
const AnalysisContext = createContext<Flow | null>(null);
export function useAnalysisFlow() { const flow = useContext(AnalysisContext); if (!flow) throw new Error("Analysis setup is unavailable."); return flow; }
type Scene = "choose" | "setup" | "buy" | "checkout" | "ready" | "quote" | null;
const methods = [
  { id: "ollama", title: "Local server", description: "Use your Ollama server and model.", icon: Server },
  { id: "builtin", title: "Download a model", description: "Run on this computer, no server needed.", icon: Download },
  { id: "openai", title: "OpenAI API key", description: "Use your own OpenAI account.", icon: KeyRound },
  { id: "anthropic", title: "Anthropic API key", description: "Use your own Anthropic account.", icon: KeyRound },
  { id: "credits", title: "Buy credits", description: "Choose an online model, no API key needed.", icon: Coins },
] as const;
function warmCreditsService() {
  // Keep plan selection instant. Checkout can retry if this background check fails.
  void window.desktop!.warmCreditsService().catch(() => undefined);
}
export function AnalysisFlowProvider({ state, onState, children }: { state: DesktopState; onState: (state: DesktopState) => void; children: ReactNode }) {
  const current = useRef(state);
  useLayoutEffect(() => { current.current = state; }, [state]);
  const [scene, setScene] = useState<Scene>(null), [method, setMethod] = useState<AnalysisProvider>("ollama");
  const [pack, setPack] = useState("regular"), [recoveryNotice, setRecoveryNotice] = useState("");
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [quote, setQuote] = useState<CreditQuote | null>(null);
  const [checkout, setCheckout] = useState<{ id: string; mode: "test" | "live" } | null>(null);
  const [checkoutExpired, setCheckoutExpired] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [setupPending, setSetupPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  const pending = useRef<{ source: AnalysisSource; resolve: (value: Authorization | null) => void } | null>(null);
  const dialogOpen = scene !== null;
  const updateState = useCallback((next: DesktopState) => { current.current = next; onState(next); }, [onState]);
  function close(value: Authorization | null = null) { pending.current?.resolve(value); pending.current = null; setHasPending(false); setScene(null); setError(""); setQuote(null); }
  const show = useCallback((next: Scene) => { if (next === "buy") warmCreditsService();
    if (!scene) opener.current = document.activeElement as HTMLElement; setError(""); setScene(next); }, [scene]);
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    if (dialogOpen && !element.open) element.showModal();
    else if (!dialogOpen && element.open) { element.close(); opener.current?.focus(); }
  }, [dialogOpen]);
  useEffect(() => { return () => { pending.current?.resolve(null); pending.current = null; }; }, []);
  useEffect(() => {
    if (!state.credits.signedIn && !state.credits.pendingConnection) return;
    const refresh = () => { void window.desktop!.refreshCredits().then(updateState).catch(() => undefined); };
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [state.credits.signedIn, state.credits.pendingConnection, updateState]);
  async function requestQuote() {
    if (!pending.current) { close(); return; }
    setScene("quote"); setQuote(null); setError(""); setWorking(true);
    try {
      const refreshed = await window.desktop!.refreshCredits(); updateState(refreshed);
      const next = await window.desktop!.quoteCreditAnalysis(pending.current.source);
      // Recovery is free even when the previous analysis consumed the last credits.
      if (!next.recovery && refreshed.credits.wallet && refreshed.credits.wallet.balance <= 0) show("buy");
      else setQuote(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not estimate credit use."); }
    finally { setWorking(false); }
  }
  async function prepare(source: AnalysisSource): Promise<Authorization | null> {
    const next = current.current;
    if (next.analysisProvider !== "credits" && providerReady(next)) return {};
    if (pending.current || scene) return null;
    opener.current = document.activeElement as HTMLElement;
    return new Promise((resolve) => {
      pending.current = { source, resolve };
      setHasPending(true);
      if (next.analysisProvider === "credits") {
        if (!next.credits.signedIn) show("buy");
        else void requestQuote();
      } else { setMethod(next.analysisProvider); show("choose"); }
    });
  }
  async function action(operation: () => Promise<void>) {
    setWorking(true); setError("");
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete this step."); }
    finally { setWorking(false); }
  }
  async function finishSetup() {
    await action(async () => {
      const next = await window.desktop!.setAnalysisProvider(method); updateState(next);
      if (!providerReady(next)) throw new Error("Finish setting up this analysis method first.");
      close({});
    });
  }
  async function purchase() {
    await action(async () => { setCheckoutExpired(false); setRecoveryNotice(""); setCheckout(await window.desktop!.startCreditCheckout(pack));
      updateState(await window.desktop!.state()); show("checkout"); });
  }
  async function checkPayment() {
    if (!checkout) return;
    const status = await window.desktop!.creditCheckoutStatus(checkout.id);
    if (status === "paid") { updateState(await window.desktop!.refreshCredits()); show("ready"); }
    else if (status === "expired") setCheckoutExpired(true);
  }
  useEffect(() => {
    if (scene !== "checkout" || !checkout || checkoutExpired) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const status = await window.desktop!.creditCheckoutStatus(checkout.id);
        if (!active) return;
        if (status === "paid") { updateState(await window.desktop!.refreshCredits()); if (active) show("ready"); return; }
        if (status === "expired") { setCheckoutExpired(true); return; }
      } catch { /* A manual retry remains available during an outage. */ }
      if (active) timer = setTimeout(() => void poll(), 5000);
    };
    timer = setTimeout(() => void poll(), 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [scene, checkout, checkoutExpired, show, updateState]);
  const remaining = state.credits.wallet ? state.credits.wallet.balance - state.credits.wallet.reserved : 0;
  const title = scene === "choose" ? "How would you like to analyze?" : scene === "setup" ? methods.find((item) => item.id === method)?.title
    : scene === "buy" ? "A little fuel for your next move"
    : scene === "checkout" ? "Finish checkout in your browser" : scene === "ready" ? "Your credits are ready" : "Review this analysis";
  const flow: Flow = { prepare, canAutoAnalyze: () => current.current.analysisProvider !== "credits" && providerReady(current.current),
    openCredits: () => { if (!pending.current) show("buy"); }, state, updateState };
  return <AnalysisContext.Provider value={flow}>{children}
    <dialog ref={dialog} className={`analysis-dialog ${scene === "buy" ? "analysis-dialog-pricing" : ""}`} aria-labelledby="analysis-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!working) close(); }} onClose={() => { if (scene) close(); }}>
      <header className="analysis-dialog-header">
        {scene !== "choose" && scene !== "ready" && scene !== "quote" && <button className="icon-button" type="button" aria-label="Back" disabled={working}
          onClick={() => show(scene === "setup" ? "choose" : scene === "checkout" ? "buy" : "choose")}><ArrowLeft size={20} /></button>}
        <img src="./icon.png" alt="" width="34" height="34" /><h2 id="analysis-dialog-title">{title}</h2>
        <button className="icon-button analysis-dialog-close" type="button" aria-label="Close" disabled={working} onClick={() => close()}><X size={20} /></button>
      </header>
      <div className="analysis-dialog-body" key={scene}>
        {error && <p className="form-error" role="alert">{error}</p>}
        {scene === "choose" && <><p className="analysis-intro">Pick a method. You can change it in Settings.</p>
          <fieldset className="analysis-methods"><legend className="visually-hidden">Analysis method</legend>
            {methods.map((item) => <label key={item.id} className={`analysis-method ${method === item.id ? "selected" : ""} ${item.id === "credits" ? "analysis-method-paid" : ""}`}>
              <input type="radio" name="analysis-method" value={item.id} checked={method === item.id}
                onChange={() => { if (item.id === "credits") warmCreditsService(); setMethod(item.id); }} />
              <item.icon size={24} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.description}</small></span>
              {method === item.id && <Check size={17} className="method-check" aria-hidden="true" />}</label>)}
          </fieldset><p className="settings-help">No signup needed for any method.</p></>}
        {scene === "setup" && <AnalysisSettings state={state} onState={updateState} provider={method} openCredits={() => show("buy")} onPendingChange={setSetupPending} />}
        {scene === "buy" && <>
          <p className="analysis-intro">Online analysis without an API key or signup. Choose your model after purchasing credits.</p>
          <fieldset className="credit-packs"><legend className="visually-hidden">Credit pack</legend>
            {CREDIT_PACKS.map((item) => <label key={item.id} className={`credit-pack ${pack === item.id ? "selected" : ""}`}>
              <input type="radio" name="credit-pack" value={item.id} checked={pack === item.id} onChange={() => setPack(item.id)} />
              <span className="credit-pack-badge">{item.id === "regular" ? "Suggested start" : ""}</span>
              <strong className="credit-pack-price">${item.dollars}</strong><span className="credit-pack-count">{item.credits.toLocaleString()} credits</span>
              <small title={CREDIT_ESTIMATE_DESCRIPTION}>About {item.analyses.toLocaleString()} analyses using GPT-6.1 Sol at High</small>
              <span className="credit-pack-selection">{pack === item.id ? <><Check size={16} />Selected</> : "Select"}</span>
            </label>)}
          </fieldset><p className="settings-help">Prices in USD. {CREDIT_ESTIMATE_DESCRIPTION}</p>
          {state.credits.signedIn && <p className="credit-account">Credits will be added to your connected wallet.</p>}
          {!state.credits.signedIn && <p className="settings-help">Already have credits? Restore or connect this computer in Settings.</p>}
          {!state.canSaveApiKey && <p className="form-error">Secure storage is unavailable. Restore access to Windows secure storage or Mac Keychain to buy credits.</p>}
        </>}
        {scene === "checkout" && <div className="credit-checkout-state">
          {checkoutExpired ? <Coins size={32} /> : <LoaderCircle size={32} className="spin" />}
          <p>{checkoutExpired ? "This checkout has expired." : "Your credits will appear after payment is confirmed."}</p>
          {checkout?.mode === "test" && <p className="credit-test-label">Test checkout. No real payment is taken.</p>}
          <button className="button button-secondary" type="button" disabled={working} onClick={() => checkoutExpired ? show("buy") : void action(checkPayment)}>
            {checkoutExpired ? "Try again" : "Check payment"}</button>
        </div>}
        {scene === "ready" && <>
          <div className="credit-ready"><Check size={26} /><strong>{formatCredits(remaining)} credits available</strong></div>
          <OnlineModelControls state={state} onState={updateState} provider="credits" disabled={working} onBusy={setWorking} />
          <p className="settings-help">You can change the model any time in Settings.</p>
          {!state.credits.recoverySaved && <div className="credit-recovery-prompt"><span><strong>Keep your credits if you reinstall</strong><small>Save a recovery code. You can also do this in Settings.</small></span>
            <button className="button button-secondary" type="button" disabled={working} onClick={() => void action(async () => {
              const result = await window.desktop!.saveCreditRecoveryCode(); updateState(result.state);
              if (result.saved) setRecoveryNotice("Recovery code saved.");
            })}>Save recovery code</button></div>}
          {recoveryNotice && <p className="notice" role="status">{recoveryNotice}</p>}
        </>}
        {scene === "quote" && <>
          {quote?.recovery ? <div className="credit-ready"><Check size={22} /><strong>{quote.pending ? "Your previous analysis is still running" : "Your previous result is ready"}</strong></div>
            : quote && <OnlineModelControls state={state} onState={async (next) => { updateState(next); await requestQuote(); }} provider="credits" disabled={working} onBusy={setWorking} />}
          {working && <p className="credit-quote-loading" role="status"><LoaderCircle size={20} className="spin" />Preparing your estimate</p>}
          {quote && <div className="credit-quote-summary"><span>{quote.recovery ? onlineModel(quote.model).name : "Maximum for this analysis"}</span><strong>{quote.recovery ? "No additional credits" : `${formatCredits(quote.maximum)} credits`}</strong>
            <small>{formatCredits(remaining)} available{quote.thinkingLevel ? ` · ${thinkingLabel(quote.thinkingLevel)} thinking` : ""}</small><p>Only actual model usage is charged. Unused reserved credits return to your balance.</p></div>}
          <p className="settings-help">Job text, resume text, and your overview go to Zebby and {onlineModel(state.credits.model).provider === "openai" ? "OpenAI" : "Anthropic"}.</p>
          {quote && quoteNeedsCredits(quote, remaining) && <p className="form-error">Add credits to cover this analysis.</p>}
          {error && <button className="button button-secondary" type="button" disabled={working} onClick={() => {
            if (!state.credits.signedIn) show("buy"); else void requestQuote();
          }}><RefreshCw size={16} />{state.credits.signedIn ? "Try again" : "Buy credits"}</button>}
        </>}
      </div>
      <footer className="analysis-dialog-footer">
        <button className="button button-secondary" type="button" disabled={working} onClick={() => close()}>{scene === "checkout" ? "Close" : "Cancel"}</button>
        {scene === "choose" && <button className="button button-primary" type="button" onClick={() => show(method === "credits" ? "buy" : "setup")}>Continue<ChevronRight size={17} /></button>}
        {scene === "setup" && <button className="button button-primary" type="button" disabled={working || setupPending || !providerReady(state, method)} onClick={() => void finishSetup()}>{hasPending ? "Continue to analysis" : "Done"}</button>}
        {scene === "buy" && <button className="button button-primary" type="button" disabled={working || !state.canSaveApiKey} onClick={() => void purchase()}>
          {working ? <LoaderCircle size={16} className="spin" /> : <ExternalLink size={16} />}Continue, ${CREDIT_PACKS.find((item) => item.id === pack)?.dollars}</button>}
        {scene === "ready" && <button className="button button-primary" type="button" disabled={working} onClick={() => void action(async () => {
          updateState(await window.desktop!.setAnalysisProvider("credits")); if (pending.current) await requestQuote(); else close(); })}>{hasPending ? "Continue to analysis" : "Done"}</button>}
        {scene === "quote" && <>{quote && quoteNeedsCredits(quote, remaining) ? <button className="button button-primary" type="button" onClick={() => show("buy")}>Add credits</button>
          : <button className="button button-primary" type="button" disabled={working || !quote || quoteNeedsCredits(quote, remaining)}
            onClick={() => { if (!quote || quote.pending || Date.parse(quote.expiresAt) <= Date.now()) { void requestQuote(); return; } close({ quoteId: quote.id }); }}>{quote?.pending ? "Check again" : quote?.recovery ? "Recover result" : "Analyze"}</button>}</>}
      </footer>
    </dialog>
  </AnalysisContext.Provider>;
}
export function SidebarCredits() {
  const { state, openCredits } = useAnalysisFlow();
  const [expanded, setExpanded] = useState(false);
  if (!state.credits.signedIn || !state.credits.wallet?.purchased) return null;
  const wallet = state.credits.wallet, remaining = (wallet?.balance || 0) - (wallet?.reserved || 0);
  const popover = state.sidebarCollapsed || state.analysisProvider !== "credits";
  return <div className="sidebar-credits">
    <button className="sidebar-credit-button" type="button" aria-label={`${formatCredits(remaining)} credits available, ${formatCredits(wallet?.used || 0)} used`}
      aria-expanded={popover ? expanded : undefined} onClick={() => popover ? setExpanded(!expanded) : openCredits()}>
      <Coins size={21} aria-hidden="true" /><span><strong>{formatCredits(remaining)} credits</strong><small>{formatCredits(wallet?.used || 0)} used{state.credits.stale ? " · Saved" : ""}</small></span>
    </button>
    {popover && expanded && <div className="sidebar-credit-popover"><button className="icon-button" type="button" aria-label="Close credits" onClick={() => setExpanded(false)}><X size={16} /></button>
      <strong>{formatCredits(remaining)} credits available</strong><small>{formatCredits(wallet?.used || 0)} used{state.credits.stale ? " · Last saved balance" : ""}</small>
      {state.analysisProvider === "credits" && <button className="button button-secondary" type="button" onClick={() => { setExpanded(false); openCredits(); }}>Buy credits</button>}</div>}
  </div>;
}

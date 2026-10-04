import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, Coins, Download, ExternalLink, KeyRound, LoaderCircle, RefreshCw, Server, X } from "lucide-react";
import type { DesktopState } from "../bridge";
import { CREDIT_PACKS, formatCredits, onlineModel, quoteNeedsCredits, type AnalysisProvider, type AnalysisSource, type CreditQuote } from "../../shared/online-models";
import { AnalysisSettings, OnlineModelSelect, providerReady } from "./AnalysisSettings";
type Authorization = { quoteId?: string };
type Flow = { prepare: (source: AnalysisSource) => Promise<Authorization | null>; canAutoAnalyze: () => boolean;
  openCredits: () => void; state: DesktopState; updateState: (state: DesktopState) => void };
const AnalysisContext = createContext<Flow | null>(null);
export function useAnalysisFlow() { const flow = useContext(AnalysisContext); if (!flow) throw new Error("Analysis setup is unavailable."); return flow; }
type Scene = "choose" | "setup" | "buy" | "account" | "checkout" | "ready" | "quote" | null;
const methods = [
  { id: "ollama", title: "Local server", description: "Use your Ollama server and model.", icon: Server },
  { id: "builtin", title: "Download a model", description: "Run on this computer, no server needed.", icon: Download },
  { id: "openai", title: "OpenAI API key", description: "Use your own OpenAI account.", icon: KeyRound },
  { id: "anthropic", title: "Anthropic API key", description: "Use your own Anthropic account.", icon: KeyRound },
  { id: "credits", title: "Buy credits", description: "Choose an online model, no API key needed.", icon: Coins },
] as const;
export function AnalysisFlowProvider({ state, onState, children }: { state: DesktopState; onState: (state: DesktopState) => void; children: ReactNode }) {
  const current = useRef(state);
  useLayoutEffect(() => { current.current = state; }, [state]);
  const [scene, setScene] = useState<Scene>(null), [method, setMethod] = useState<AnalysisProvider>("ollama");
  const [pack, setPack] = useState("regular"), [email, setEmail] = useState(""), [code, setCode] = useState(""), [codeSent, setCodeSent] = useState(false);
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [quote, setQuote] = useState<CreditQuote | null>(null);
  const [checkout, setCheckout] = useState<{ id: string; mode: "test" | "live" } | null>(null);
  const [checkoutExpired, setCheckoutExpired] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  const pending = useRef<{ source: AnalysisSource; resolve: (value: Authorization | null) => void } | null>(null);
  const dialogOpen = scene !== null;
  const updateState = useCallback((next: DesktopState) => { current.current = next; onState(next); }, [onState]);
  function close(value: Authorization | null = null) { pending.current?.resolve(value); pending.current = null; setHasPending(false); setScene(null); setError(""); setQuote(null); }
  const show = useCallback((next: Scene) => { if (!scene) opener.current = document.activeElement as HTMLElement; setError(""); setScene(next); }, [scene]);
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    if (dialogOpen && !element.open) element.showModal();
    else if (!dialogOpen && element.open) { element.close(); opener.current?.focus(); }
  }, [dialogOpen]);
  useEffect(() => { return () => { pending.current?.resolve(null); pending.current = null; }; }, []);
  useEffect(() => {
    if (!state.credits.signedIn) return;
    const refresh = () => { void window.desktop!.refreshCredits().then(updateState).catch(() => undefined); };
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [state.credits.signedIn, updateState]);
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
    if (!current.current.credits.signedIn) { setEmail(current.current.credits.email); setCode(""); setCodeSent(false); show("account"); return; }
    await action(async () => { setCheckoutExpired(false); setCheckout(await window.desktop!.startCreditCheckout(pack)); show("checkout"); });
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
    : scene === "buy" ? "A little fuel for your next move" : scene === "account" ? "Your credits, on every computer"
    : scene === "checkout" ? "Finish checkout in your browser" : scene === "ready" ? "Your credits are ready" : "Review this analysis";
  const flow: Flow = { prepare, canAutoAnalyze: () => current.current.analysisProvider !== "credits" && providerReady(current.current),
    openCredits: () => { if (!pending.current) show("buy"); }, state, updateState };
  return <AnalysisContext.Provider value={flow}>{children}
    <dialog ref={dialog} className={`analysis-dialog ${scene === "buy" ? "analysis-dialog-pricing" : ""}`} aria-labelledby="analysis-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!working) close(); }} onClose={() => { if (scene) close(); }}>
      <header className="analysis-dialog-header">
        {scene !== "choose" && scene !== "ready" && scene !== "quote" && <button className="icon-button" type="button" aria-label="Back" disabled={working}
          onClick={() => show(scene === "setup" ? "choose" : scene === "account" || scene === "checkout" ? "buy" : "choose")}><ArrowLeft size={20} /></button>}
        <img src="./icon.png" alt="" width="34" height="34" /><h2 id="analysis-dialog-title">{title}</h2>
        <button className="icon-button analysis-dialog-close" type="button" aria-label="Close" disabled={working} onClick={() => close()}><X size={20} /></button>
      </header>
      <div className="analysis-dialog-body" key={scene}>
        {error && <p className="form-error" role="alert">{error}</p>}
        {scene === "choose" && <><p className="analysis-intro">Pick a method. You can change it in Settings.</p>
          <fieldset className="analysis-methods"><legend className="visually-hidden">Analysis method</legend>
            {methods.map((item) => <label key={item.id} className={`analysis-method ${method === item.id ? "selected" : ""} ${item.id === "credits" ? "analysis-method-paid" : ""}`}>
              <input type="radio" name="analysis-method" value={item.id} checked={method === item.id} onChange={() => setMethod(item.id)} />
              <item.icon size={24} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.description}</small></span>
              {method === item.id && <Check size={17} className="method-check" aria-hidden="true" />}</label>)}
          </fieldset><p className="settings-help">An account is only needed for paid credits.</p></>}
        {scene === "setup" && <AnalysisSettings state={state} onState={updateState} provider={method} openCredits={() => show("buy")} />}
        {scene === "buy" && <>
          <p className="analysis-intro">Online analysis without an API key. You can choose your model after purchasing credits.</p>
          <fieldset className="credit-packs"><legend className="visually-hidden">Credit pack</legend>
            {CREDIT_PACKS.map((item) => <label key={item.id} className={`credit-pack ${pack === item.id ? "selected" : ""}`}>
              <input type="radio" name="credit-pack" value={item.id} checked={pack === item.id} onChange={() => setPack(item.id)} />
              <span className="credit-pack-badge">{item.id === "regular" ? "Suggested start" : ""}</span>
              <strong className="credit-pack-price">${item.dollars}</strong><span className="credit-pack-count">{item.credits.toLocaleString()} credits</span>
              <small>About {item.analyses.toLocaleString()} analyses using GPT-6 Luna</small>
              <span className="credit-pack-selection">{pack === item.id ? <><Check size={16} />Selected</> : "Select"}</span>
            </label>)}
          </fieldset><p className="settings-help">Prices in USD. Estimates assume 20,000 input and 6,000 output tokens. Job length and model choice change usage. You confirm the maximum before each analysis.</p>
          {!state.credits.available && <p className="credit-unavailable" role="status">Paid credits are not available yet. Local models and your own API keys are ready to use.</p>}
          {state.credits.signedIn && <p className="credit-account">Buying as {state.credits.email}</p>}
        </>}
        {scene === "account" && <form id="credit-account-form" onSubmit={(event) => { event.preventDefault(); void action(async () => {
          if (!codeSent) { await window.desktop!.sendCreditCode(email.trim()); setCodeSent(true); }
          else { const signedIn = await window.desktop!.verifyCreditCode(email.trim(), code.trim()); updateState(signedIn);
            if (pending.current) {
              updateState(await window.desktop!.setAnalysisProvider("credits")); await requestQuote();
            } else show("buy"); }
        }); }}>
          <p className="analysis-intro">Use an email code to keep your balance available on your other computers.</p>
          <label className="field"><span>Email</span><input type="email" autoComplete="email" autoFocus value={email} disabled={working || codeSent} required
            onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          {codeSent && <><label className="field"><span>Email code</span><input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code}
            pattern="[0-9]{6,8}" maxLength={8} required disabled={working} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /></label>
            <p className="settings-help">Check your inbox, including spam. The code expires shortly.</p>
            <button className="text-button" type="button" disabled={working} onClick={() => { setCodeSent(false); setCode(""); }}>Use another email</button></>}
          {!state.canSaveApiKey && <p className="settings-help">Secure storage is unavailable. You will need a new code when Zebby reopens.</p>}
        </form>}
        {scene === "checkout" && <div className="credit-checkout-state">
          {checkoutExpired ? <Coins size={32} /> : <LoaderCircle size={32} className="spin" />}
          <p>{checkoutExpired ? "This checkout has expired." : "Your credits will appear after payment is confirmed."}</p>
          {checkout?.mode === "test" && <p className="credit-test-label">Test checkout. No real payment is taken.</p>}
          <button className="button button-secondary" type="button" disabled={working} onClick={() => checkoutExpired ? show("buy") : void action(checkPayment)}>
            {checkoutExpired ? "Try again" : "Check payment"}</button>
        </div>}
        {scene === "ready" && <>
          <div className="credit-ready"><Check size={26} /><strong>{formatCredits(remaining)} credits available</strong></div>
          <OnlineModelSelect state={state} onState={updateState} provider="credits" />
          <p className="settings-help">You can change the model any time in Settings.</p>
        </>}
        {scene === "quote" && <>
          {quote?.recovery ? <div className="credit-ready"><Check size={22} /><strong>{quote.pending ? "Your previous analysis is still running" : "Your previous result is ready"}</strong></div>
            : quote && <OnlineModelSelect state={state} onState={(next) => { updateState(next); void requestQuote(); }} provider="credits" disabled={working} />}
          {working && <p className="credit-quote-loading" role="status"><LoaderCircle size={20} className="spin" />Preparing your estimate</p>}
          {quote && <div className="credit-quote-summary"><span>{quote.recovery ? onlineModel(quote.model).name : "Maximum for this analysis"}</span><strong>{quote.recovery ? "No additional credits" : `${formatCredits(quote.maximum)} credits`}</strong>
            <small>{formatCredits(remaining)} available</small><p>Only actual model usage is charged. Unused reserved credits return to your balance.</p></div>}
          <p className="settings-help">Job text, resume text, and your overview go to Zebby and {onlineModel(state.credits.model).provider === "openai" ? "OpenAI" : "Anthropic"}.</p>
          {quote && quoteNeedsCredits(quote, remaining) && <p className="form-error">Add credits to cover this analysis.</p>}
          {error && <button className="button button-secondary" type="button" disabled={working} onClick={() => {
            if (!state.credits.signedIn) { setCodeSent(false); setCode(""); show("account"); } else void requestQuote();
          }}><RefreshCw size={16} />{state.credits.signedIn ? "Try again" : "Sign in"}</button>}
        </>}
      </div>
      <footer className="analysis-dialog-footer">
        <button className="button button-secondary" type="button" disabled={working} onClick={() => close()}>{scene === "checkout" ? "Close" : "Cancel"}</button>
        {scene === "choose" && <button className="button button-primary" type="button" onClick={() => show(method === "credits" ? "buy" : "setup")}>Continue<ChevronRight size={17} /></button>}
        {scene === "setup" && <button className="button button-primary" type="button" disabled={working || !providerReady(state, method)} onClick={() => void finishSetup()}>{hasPending ? "Continue to analysis" : "Done"}</button>}
        {scene === "buy" && <button className="button button-primary" type="button" disabled={working || !state.credits.available} onClick={() => void purchase()}>
          {working ? <LoaderCircle size={16} className="spin" /> : <ExternalLink size={16} />}Continue, ${CREDIT_PACKS.find((item) => item.id === pack)?.dollars}</button>}
        {scene === "account" && <button className="button button-primary" type="submit" form="credit-account-form" disabled={working}>
          {working && <LoaderCircle size={16} className="spin" />}{codeSent ? "Verify code" : "Send code"}</button>}
        {scene === "ready" && <button className="button button-primary" type="button" disabled={working} onClick={() => void action(async () => {
          updateState(await window.desktop!.setAnalysisProvider("credits")); if (pending.current) await requestQuote(); else close(); })}>{hasPending ? "Continue to analysis" : "Done"}</button>}
        {scene === "quote" && <>{quote && quoteNeedsCredits(quote, remaining) ? <button className="button button-primary" type="button" onClick={() => show("buy")}>Add credits</button>
          : <button className="button button-primary" type="button" disabled={working || !quote || quoteNeedsCredits(quote, remaining)}
            onClick={() => { if (!quote || quote.pending || Date.parse(quote.expiresAt) <= Date.now()) { void requestQuote(); return; } close({ quoteId: quote.id }); }}>{quote?.pending ? "Check again" : quote?.recovery ? "Recover result" : "Analyze"}</button>}</>}
      </footer>
    </dialog>
  </AnalysisContext.Provider>;
}
export function CreditsSettings() {
  const { state, updateState, openCredits } = useAnalysisFlow();
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  const credits = state.credits;
  return <section className="settings-section" aria-labelledby="credits-settings"><div className="settings-section-heading"><h2 id="credits-settings">Credits</h2></div>
    <div className="settings-content">
      {credits.signedIn ? <>
        <div className="credit-settings-balance"><div><small>Available</small><strong>{formatCredits((credits.wallet?.balance || 0) - (credits.wallet?.reserved || 0))}</strong></div>
          <div><small>Used</small><strong>{formatCredits(credits.wallet?.used || 0)}</strong></div></div>
        <p className="credit-account">{credits.email}{credits.stale ? " · Last saved balance" : ""}</p>
        {credits.wallet && credits.wallet.reserved > 0 && <p className="settings-help">{formatCredits(credits.wallet.reserved)} credits reserved for running analysis.</p>}
        {!!credits.wallet?.purchased && <OnlineModelSelect state={state} onState={updateState} provider="credits" />}
        {!!credits.wallet?.recent.length && <details className="credit-history"><summary>Recent usage</summary><ul>
          {credits.wallet.recent.map((item) => <li key={item.id}><span>{ONLINE_NAME(item.model)}<small>{new Date(item.createdAt).toLocaleDateString()} · {item.kind === "plan" ? "Plan analysis" : "Resume match"}</small></span>
            <strong>{formatCredits(item.cost)} credits</strong></li>)}</ul></details>}
      </> : <p className="settings-help">Use online models without managing an API key. Sign in only when you buy credits.</p>}
      {(error || credits.error) && <p className="form-error" role="alert">{error || credits.error}</p>}
      <div className="settings-actions"><button className="button button-primary" type="button" onClick={openCredits}>Buy credits</button>
        {credits.signedIn && <><button className="button button-secondary" type="button" disabled={working} onClick={async () => { setWorking(true); setError("");
          try { updateState(await window.desktop!.refreshCredits()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh credits."); } finally { setWorking(false); } }}>Refresh balance</button>
          <button className="text-button" type="button" disabled={working} onClick={async () => { setWorking(true); setError(""); try { updateState(await window.desktop!.signOutCredits()); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out."); } finally { setWorking(false); } }}>Sign out</button></>}
      </div>
    </div></section>;
}
function ONLINE_NAME(id: string) { try { return onlineModel(id).name; } catch { return "Online model"; } }
export function SidebarCredits() {
  const { state, openCredits } = useAnalysisFlow();
  const [expanded, setExpanded] = useState(false);
  if (!state.credits.signedIn) return null;
  const wallet = state.credits.wallet, remaining = (wallet?.balance || 0) - (wallet?.reserved || 0);
  return <div className="sidebar-credits">
    <button className="sidebar-credit-button" type="button" aria-label={`${formatCredits(remaining)} credits available, ${formatCredits(wallet?.used || 0)} used`}
      aria-expanded={state.sidebarCollapsed ? expanded : undefined} onClick={() => state.sidebarCollapsed ? setExpanded(!expanded) : openCredits()}>
      <Coins size={21} aria-hidden="true" /><span><strong>{formatCredits(remaining)} credits</strong><small>{formatCredits(wallet?.used || 0)} used{state.credits.stale ? " · Saved" : ""}</small></span>
    </button>
    {state.sidebarCollapsed && expanded && <div className="sidebar-credit-popover"><button className="icon-button" type="button" aria-label="Close credits" onClick={() => setExpanded(false)}><X size={16} /></button>
      <strong>{formatCredits(remaining)} credits available</strong><small>{formatCredits(wallet?.used || 0)} used{state.credits.stale ? " · Last saved balance" : ""}</small>
      <button className="button button-secondary" type="button" onClick={() => { setExpanded(false); openCredits(); }}>Buy credits</button></div>}
  </div>;
}

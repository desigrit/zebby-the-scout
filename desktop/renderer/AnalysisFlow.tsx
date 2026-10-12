import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, Coins, Download, ExternalLink, KeyRound, LoaderCircle, Server, X } from "lucide-react";
import type { DesktopState } from "../bridge";
import { CREDIT_PACKS, CREDIT_ESTIMATE_MODELS, CREDIT_ESTIMATE_DESCRIPTION, estimatedAnalyses, formatCredits, onlineModel, quoteNeedsCredits, type AnalysisProvider, type AnalysisSource } from "../../shared/online-models";
import CreditAccessForm from "./CreditAccessForm";
import { ErrorBanner } from "./WorkspaceFeedback";
import { onlineThinkingCapability, selectedThinking, thinkingKey, thinkingLabel } from "../../shared/thinking";
import { creditUsage } from "../../shared/credit-usage";
import { AnalysisSettings, providerReady } from "./AnalysisSettings";
type Authorization = { quoteId?: string };
type Flow = { prepare: (source: AnalysisSource, signal: AbortSignal) => Promise<Authorization | null>; canAutoAnalyze: () => boolean;
  openCredits: () => void; openSettings: () => void; state: DesktopState; updateState: (state: DesktopState) => void };
const AnalysisContext = createContext<Flow | null>(null);
export function useAnalysisFlow() { const flow = useContext(AnalysisContext); if (!flow) throw new Error("Analysis setup is unavailable."); return flow; }
type Scene = "choose" | "setup" | "buy" | "checkout" | "ready" | "restore" | "connect" | null;
const methods = [
  { id: "credits", title: "Buy Zebby credits", description: "Simplest and fastest way to get started", icon: Coins },
  { id: "ollama", title: "Local server", description: "Use your Ollama server.", icon: Server },
  { id: "builtin", title: "Download a model", description: "Runs on this computer.", icon: Download },
  { id: "openai", title: "OpenAI API key", description: "Use your OpenAI API account.", icon: KeyRound },
  { id: "anthropic", title: "Anthropic API key", description: "Use your Anthropic API account.", icon: KeyRound },
] as const;
function warmCreditsService() {
  // Keep plan selection instant. Checkout can retry if this background check fails.
  void window.desktop!.warmCreditsService().catch(() => undefined);
}
export function AnalysisFlowProvider({ state, onState, children, onOpenSettings }: { state: DesktopState; onState: (state: DesktopState) => void; children: ReactNode; onOpenSettings: () => void }) {
  const current = useRef(state);
  useLayoutEffect(() => { current.current = state; }, [state]);
  const [scene, setScene] = useState<Scene>(null), [method, setMethod] = useState<AnalysisProvider>("credits");
  const [pack, setPack] = useState("starter"), [recoveryNotice, setRecoveryNotice] = useState("");
  const [working, setWorking] = useState(false), [error, setError] = useState("");
  const [checkout, setCheckout] = useState<{ id: string; mode: "test" | "live" } | null>(null);
  const [checkoutExpired, setCheckoutExpired] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [setupPending, setSetupPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  const retryAction = useRef<() => void>(() => undefined);
  const pending = useRef<{ resolve: (value: Authorization | null) => void } | null>(null);
  const dialogOpen = scene !== null;
  const updateState = useCallback((next: DesktopState) => { current.current = next; onState(next); }, [onState]);
  function close(value: Authorization | null = null) { pending.current?.resolve(value); pending.current = null; setHasPending(false); setScene(null); setError(""); }
  const show = useCallback((next: Scene) => { if (next === "buy") warmCreditsService();
    if (!scene) opener.current = document.activeElement as HTMLElement; setError(""); setScene(next); }, [scene]);
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    if (dialogOpen && !element.open) element.showModal();
    else if (!dialogOpen && element.open) {
      element.close();
      // The authorizing job releases its record lock after prepare resolves.
      // Restore focus after that render, when the Analyze button is enabled.
      const frame = requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); });
      return () => cancelAnimationFrame(frame);
    }
  }, [dialogOpen]);
  useEffect(() => { return () => { pending.current?.resolve(null); pending.current = null; }; }, []);
  useEffect(() => {
    if (!state.credits.signedIn && !state.credits.pendingConnection) return;
    const refresh = () => { void window.desktop!.refreshCredits().then(updateState).catch(() => undefined); };
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [state.credits.signedIn, state.credits.pendingConnection, updateState]);
  async function prepare(source: AnalysisSource, signal: AbortSignal): Promise<Authorization | null> {
    signal.throwIfAborted();
    const next = current.current;
    if (next.analysisProvider !== "credits" && providerReady(next)) return {};
    // Each ready request prepares independently, without opening a modal or
    // changing the saved model. Quotes still bind the source and spending cap.
    if (next.analysisProvider === "credits" && next.credits.signedIn) {
      const refreshed = await window.desktop!.refreshCredits();
      signal.throwIfAborted(); updateState(refreshed);
      const quote = await window.desktop!.quoteCreditAnalysis(source);
      signal.throwIfAborted();
      if (quote.pending) throw new Error("Your previous analysis is still running. Try again shortly.");
      const wallet = current.current.credits.wallet;
      if (!quoteNeedsCredits(quote, wallet ? wallet.balance - wallet.reserved : 0)) {
        if (Date.parse(quote.expiresAt) <= Date.now()) throw new Error("The analysis estimate expired. Click Analyze to try again.");
        return { quoteId: quote.id };
      }
    }
    if (pending.current || scene) return null;
    opener.current = document.activeElement as HTMLElement;
    const configured = await new Promise<Authorization | null>((resolve) => {
      const abort = () => { if (pending.current === request) close(); };
      const request = { resolve: (value: Authorization | null) => { signal.removeEventListener("abort", abort); resolve(value); } };
      pending.current = request;
      signal.addEventListener("abort", abort, { once: true });
      setHasPending(true);
      if (next.analysisProvider === "credits") {
        show("buy");
        if (next.credits.signedIn) {
          retryAction.current = () => void action(async () => { updateState(await window.desktop!.refreshCredits()); close({}); });
          setError("Add credits to continue this analysis.");
        }
      }
      else { setMethod("credits"); show("choose"); }
    });
    signal.throwIfAborted();
    return configured ? prepare(source, signal) : null;
  }
  async function action(operation: () => Promise<void>) {
    retryAction.current = () => void action(operation);
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
  const creditModel = onlineModel(state.credits.model);
  const creditThinking = selectedThinking(state.thinkingLevels, thinkingKey("credits", creditModel.id), onlineThinkingCapability(creditModel.id));
  const openSettings = () => { close(); onOpenSettings(); };
  const title = scene === "choose" ? "Choose how to analyze" : scene === "setup" ? methods.find((item) => item.id === method)?.title
    : scene === "buy" ? "A little fuel for your next move"
    : scene === "restore" ? "Restore credits" : scene === "connect" ? "Connect this computer"
    : scene === "checkout" ? "Finish checkout in your browser" : scene === "ready" ? "Your credits are ready" : "";
  const flow: Flow = { prepare, canAutoAnalyze: () => current.current.analysisProvider !== "credits" && providerReady(current.current),
    openCredits: () => { if (!pending.current) show("buy"); }, openSettings, state, updateState };
  return <AnalysisContext.Provider value={flow}>{children}
    <dialog ref={dialog} className={`analysis-dialog ${scene === "buy" ? "analysis-dialog-pricing" : ""}`} aria-labelledby="analysis-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!working) close(); }} onClose={() => { if (scene) close(); }}>
      <header className="analysis-dialog-header">
        {scene !== "choose" && scene !== "ready" && <button className="icon-button" type="button" aria-label="Back" disabled={working}
          onClick={() => show(scene === "setup" ? "choose" : ["checkout", "restore", "connect"].includes(scene || "") ? "buy" : "choose")}><ArrowLeft size={20} /></button>}
        <img src="./icon.png" alt="" width="34" height="34" /><h2 id="analysis-dialog-title">{title}</h2>
        <button className="icon-button analysis-dialog-close" type="button" aria-label="Close" disabled={working} onClick={() => close()}><X size={20} /></button>
      </header>
      <div className="analysis-dialog-body" key={scene}>
        <ErrorBanner message={error} retry={() => retryAction.current()} busy={working} />
        {scene === "choose" && <>
          <fieldset className="analysis-methods"><legend className="visually-hidden">Analysis method</legend>
            {methods.map((item) => <label key={item.id} className={`analysis-method ${method === item.id ? "selected" : ""} ${item.id === "credits" ? "analysis-method-paid" : ""}`}>
              <input type="radio" name="analysis-method" value={item.id} checked={method === item.id}
                onChange={() => { if (item.id === "credits") warmCreditsService(); setMethod(item.id); }} />
              <item.icon size={24} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.description}</small></span>
              {method === item.id && <Check size={17} className="method-check" aria-hidden="true" />}</label>)}
          </fieldset></>}
        {scene === "setup" && <AnalysisSettings state={state} onState={updateState} provider={method} openCredits={() => show("buy")} onPendingChange={setSetupPending} />}
        {scene === "buy" && <>
          <p className="analysis-intro">Choose or change your model in Settings after purchase.</p>
          <fieldset className="credit-packs"><legend className="visually-hidden">Credit pack</legend>
            {CREDIT_PACKS.map((item) => <label key={item.id} className={`credit-pack ${pack === item.id ? "selected" : ""}`}>
              <input type="radio" name="credit-pack" value={item.id} checked={pack === item.id} onChange={() => setPack(item.id)} />
              <span className="credit-pack-badge">{item.id === "starter" ? "Suggested start" : ""}</span>
              <strong className="credit-pack-price">${item.dollars}</strong><span className="credit-pack-count">{item.credits.toLocaleString()} credits</span>
              <span className="credit-pack-estimates">
                {CREDIT_ESTIMATE_MODELS.map((model) => <small key={model}><span className="credit-estimate-count">About {estimatedAnalyses(item.credits, model).toLocaleString()} analyses</span><span className="credit-estimate-model">{onlineModel(model).name} (High)</span></small>)}
              </span>
            </label>)}
          </fieldset><p className="settings-help">Prices in USD. Actual usage varies by job, model and thinking level.</p>
          <details className="credit-estimate-help"><summary>How estimates work</summary><p>{CREDIT_ESTIMATE_DESCRIPTION}</p>
            <p>Enough credits for the maximum usage are reserved when analysis starts. Actual usage is charged, and unused reserved credits return to your balance.</p></details>
          {!state.credits.signedIn && <div className="credit-recover-links"><span>Already have credits?</span>
            <button className="settings-link" type="button" onClick={() => show("restore")}>Restore credits</button>
            <button className="settings-link" type="button" onClick={() => show("connect")}>Connect this computer</button></div>}
          {!state.canSaveApiKey && <p className="form-error">Secure storage is unavailable. Restore access to Windows secure storage or Mac Keychain to buy credits.</p>}
        </>}
        {(scene === "restore" || scene === "connect") && <CreditAccessForm kind={scene} onState={updateState} onBusy={setWorking}
          onCancel={() => show("buy")} onConnected={() => show("ready")} />}
        {scene === "checkout" && <div className="credit-checkout-state">
          {checkoutExpired ? <Coins size={32} /> : <LoaderCircle size={32} className="spin" />}
          <p>{checkoutExpired ? "This checkout has expired." : "Your credits will appear after payment is confirmed."}</p>
          {checkout?.mode === "test" && <p className="credit-test-label">Test checkout. No real payment is taken.</p>}
          <button className="button button-secondary" type="button" disabled={working} onClick={() => checkoutExpired ? show("buy") : void action(checkPayment)}>
            {checkoutExpired ? "Try again" : "Check payment"}</button>
        </div>}
        {scene === "ready" && <>
          <div className="credit-ready"><Check size={26} /><strong>{formatCredits(remaining)} credits available</strong></div>
          {!state.credits.recoverySaved && <div className="credit-recovery-prompt"><span><strong>Keep access to your credits</strong><small>Save this code to restore credits after reinstalling or on another computer.</small></span>
            <button className="button button-secondary" type="button" disabled={working} onClick={() => void action(async () => {
              const result = await window.desktop!.saveCreditRecoveryCode(); updateState(result.state);
              if (result.saved) setRecoveryNotice("Recovery code saved.");
            })}>Save recovery code</button></div>}
          {hasPending && <div className="credit-ready-model"><span>Using {creditModel.name} · {thinkingLabel(creditThinking)} thinking</span>
            <button className="settings-link" type="button" disabled={working} onClick={() => { void action(async () => { updateState(await window.desktop!.setAnalysisProvider("credits")); openSettings(); }); }}>Change in Settings</button></div>}
          {recoveryNotice && <p className="notice" role="status">{recoveryNotice}</p>}
        </>}
      </div>
      <footer className="analysis-dialog-footer" hidden={scene === "restore" || scene === "connect"}>
        {scene !== "ready" && <button className="button button-secondary" type="button" disabled={working} onClick={() => close()}>{scene === "checkout" ? "Close" : "Cancel"}</button>}
        {scene === "choose" && <button className="button button-primary" type="button" onClick={() => show(method === "credits" ? "buy" : "setup")}>Continue<ChevronRight size={17} /></button>}
        {scene === "setup" && <button className="button button-primary" type="button" disabled={working || setupPending || !providerReady(state, method)} onClick={() => void finishSetup()}>{hasPending ? "Continue to analysis" : "Done"}</button>}
        {scene === "buy" && <button className="button button-primary" type="button" disabled={working || !state.canSaveApiKey} onClick={() => void purchase()}>
          {working ? <LoaderCircle size={16} className="spin" /> : <ExternalLink size={16} />}Continue to checkout · ${CREDIT_PACKS.find((item) => item.id === pack)?.dollars}</button>}
        {scene === "ready" && <button className="button button-primary" type="button" disabled={working} onClick={() => void action(async () => {
          updateState(await window.desktop!.setAnalysisProvider("credits")); close({}); })}>{hasPending ? `Analyze with ${creditModel.name}` : "Done"}</button>}
      </footer>
    </dialog>
  </AnalysisContext.Provider>;
}
export function SidebarCredits() {
  const { state, openCredits } = useAnalysisFlow();
  if (!state.credits.signedIn || !state.credits.wallet?.purchased) return null;
  const { used, total, percentRemaining } = creditUsage(state.credits.wallet);
  const percent = `${Math.round(percentRemaining).toLocaleString()}%`;
  const usage = `${formatCredits(used)} used of ${formatCredits(total)}`;
  const label = `Buy credits. ${formatCredits(used)} of ${formatCredits(total)} credits used, ${percent} remaining.${state.credits.stale ? " Last saved usage." : ""}`;
  return <div className="sidebar-credits">
    <button className="sidebar-credit-button" type="button" aria-label={label} aria-haspopup="dialog" title={label} onClick={openCredits}>
      <span className="sidebar-credit-summary" aria-hidden="true"><span className="sidebar-credit-amount">{usage}</span>
        <span className="sidebar-credit-percent"><span className="sidebar-credit-divider"> · </span>{percent}<span className="sidebar-credit-remaining"> left</span></span></span>
      <span className="sidebar-credit-track" aria-hidden="true"><span style={{ width: `${percentRemaining}%` }} /></span>
    </button>
  </div>;
}

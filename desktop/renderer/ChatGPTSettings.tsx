import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, LoaderCircle, RefreshCw } from "lucide-react";
import type { DesktopState } from "../bridge";
import SettingsAction from "./SettingsAction";
import { ErrorBanner } from "./WorkspaceFeedback";
import { thinkingLabel } from "../../shared/thinking";
import ChatGPTUsage from "./ChatGPTUsage";

export default function ChatGPTSettings({ state, onState, onBusy }: { state: DesktopState; onState: (state: DesktopState) => void | Promise<void>; onBusy: (busy: boolean) => void }) {
  const connection = state.chatgpt;
  const [working, setWorking] = useState(false), [error, setError] = useState("");
  const [usageOpen, setUsageOpen] = useState(() => {
    try { return localStorage.getItem("zebby.usageExpanded") === "true"; } catch { return false; }
  });
  function toggleUsage() {
    setUsageOpen(!usageOpen);
    try { localStorage.setItem("zebby.usageExpanded", String(!usageOpen)); } catch { /* Keep the choice for this view. */ }
  }
  const [errorSection, setErrorSection] = useState("account");
  const [busySection, setBusySection] = useState("");
  const retry = useRef<(() => void) | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const modelPicker = useRef<HTMLSelectElement>(null);
  const actionOpener = useRef<HTMLElement | null>(null);
  const mounted = useRef(true), opener = useRef<HTMLElement | null>(null), restoreFocus = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusy(false); }; }, [onBusy]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (connection?.welcome && connection.connected && !element.open) { opener.current = document.activeElement as HTMLElement; element.showModal(); }
    else if (!connection?.welcome && element.open) { element.close(); restoreFocus.current = true; }
    if (restoreFocus.current && !working) { restoreFocus.current = false; (modelPicker.current || (opener.current?.isConnected ? opener.current : null))?.focus(); }
  }, [connection?.welcome, connection?.connected, working]);
  useEffect(() => {
    if (working || !actionOpener.current) return;
    const element = actionOpener.current; actionOpener.current = null;
    if (!dialog.current?.open) (element.isConnected ? element : document.getElementById("chatgpt-usage-heading"))?.focus();
  }, [working]);
  if (!connection) return <div className="analysis-setting-row"><span className="analysis-setting-label">ChatGPT</span><p className="settings-help">Loading connection settings.</p></div>;
  async function action(operation: () => Promise<DesktopState | void>, section = "account", preserveFailure = false) {
    actionOpener.current = section === "welcome" ? null : document.activeElement as HTMLElement;
    setWorking(true); setBusySection(section); onBusy(true);
    if (!preserveFailure) { retry.current = null; setError(""); setErrorSection(section); }
    try { const next = await operation(); if (next) await onState(next); }
    catch (cause) { if (mounted.current) {
      retry.current = () => void action(operation, section); setErrorSection(section);
      setError((cause instanceof Error ? cause.message : "Could not complete this step. Try again.").replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""));
    } }
    finally { if (mounted.current) { setWorking(false); setBusySection(""); onBusy(false); } }
  }
  const chosen = connection.models.find(model => model.id === connection.model);
  const finishWelcome = () => void action(() => window.desktop!.acknowledgeChatGPTWelcome(), "welcome");
  const errorAt = (section: string) => {
    const target = error ? errorSection : connection.connected ? "connection" : "account";
    const detail = target === section ? error || connection.error : "";
    return <ErrorBanner message={detail} busy={working}
      recovery={/usage.*(?:limit|paused)|allowance/i.test(detail) ? <a className="text-action" href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage</a> : undefined}
      retry={() => retry.current ? retry.current() : void action(() => connection.connected ? window.desktop!.refreshChatGPTModels() : window.desktop!.connectChatGPT(connection.activeAccount || undefined), section)} />;
  };
  return <>
    <div className="analysis-setting-row"><span className="analysis-setting-label">Account</span><div className="chatgpt-settings">
      {connection.account && <p className="chatgpt-account">{connection.account}</p>}
      <div className="settings-actions">
        {!connection.connected && <SettingsAction busy={working || connection.connecting} disabled={!state.canSaveApiKey}
          onClick={() => void action(() => window.desktop!.connectChatGPT(connection.activeAccount || undefined))}>Continue with ChatGPT</SettingsAction>}
        {connection.connected && <><span className="server-connection-status">Connected</span>
          <button type="button" className="settings-link" disabled={working} onClick={() => void action(() => window.desktop!.disconnectChatGPT())}>Disconnect</button></>}
        {connection.connecting && <button type="button" className="settings-link" onClick={() => void window.desktop!.cancelChatGPTConnect()}>Cancel sign-in</button>}
      </div>
      {connection.connecting && <p className="settings-help" role="status">Finish connecting in your browser.</p>}
      {!state.canSaveApiKey && <p className="settings-help">Restore secure storage on this computer to connect ChatGPT.</p>}
      {errorAt("account")}
      {connection.accounts.length > 0 && <details className="chatgpt-account-options"><summary>Account options</summary>
        {connection.accounts.map(account => <button key={account.id} type="button" className="settings-link" disabled={working || connection.connecting}
          onClick={() => void action(() => window.desktop!.connectChatGPT(account.id))}>Reconnect {account.label}</button>)}
        <button type="button" className="settings-link" disabled={working || connection.connecting}
          onClick={() => void action(() => window.desktop!.connectChatGPT())}>Use another account or workspace</button>
      </details>}
    </div></div>
    {connection.connected && <>
      <div className="analysis-setting-row"><span className="analysis-setting-label">Model</span><div>
        <div className="ollama-model-row"><label className="field"><span>ChatGPT model</span>
          <select ref={modelPicker} aria-label="ChatGPT model" value={chosen ? connection.model : ""} disabled={working} onChange={event => void action(() => window.desktop!.configureChatGPT(event.target.value, ""), "model")}>
            <option value="" disabled>Choose a model</option>
            {connection.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select></label><button type="button" className="chatgpt-refresh" aria-label="Refresh ChatGPT models" title="Refresh models" disabled={working}
            aria-busy={busySection === "model" || undefined} onClick={() => void action(() => window.desktop!.refreshChatGPTModels(), "model")}><RefreshCw size={16} className={busySection === "model" ? "spin" : undefined} aria-hidden="true" /></button></div>
        {connection.model && !chosen && <p className="settings-help">Your saved model is unavailable. Refresh models or choose another.</p>}
        {errorAt("model")}
      </div></div>
      {chosen && chosen.thinking.length > 0 && <div className="analysis-setting-row"><span className="analysis-setting-label">Thinking</span>
        <div><label className="field"><span>ChatGPT thinking level</span><select aria-label="ChatGPT thinking level" value={connection.thinking} disabled={working}
          onChange={event => void action(() => window.desktop!.configureChatGPT(connection.model, event.target.value), "thinking")}>
          <option value="">Model default</option>{chosen.thinking.map(level => <option key={level} value={level}>{thinkingLabel(level)}</option>)}
        </select></label>{errorAt("thinking")}</div></div>}
      <div className="analysis-setting-row"><span className="analysis-setting-label">Connection</span><div className="chatgpt-settings">
        <button type="button" className="settings-link" disabled={working || !chosen} aria-busy={busySection === "connection" || undefined}
          onClick={() => void action(() => window.desktop!.testChatGPT(), "connection")}>{busySection === "connection" && <LoaderCircle size={14} className="spin" aria-hidden="true" />}Test connection</button>
        <p className="settings-help">Checks text and image analysis using your plan allowance.</p>
        {connection.notice && <p className="server-connection-status" role="status">{connection.notice}</p>}
        {errorAt("connection")}
      </div></div>
    </>}
    <div className="analysis-setting-row chatgpt-usage-row">
      <button className="analysis-setting-label chatgpt-usage-toggle" id="chatgpt-usage-heading" type="button"
        aria-expanded={usageOpen} aria-controls="chatgpt-usage-history" onClick={toggleUsage}>
        Usage <ChevronDown size={14} strokeWidth={1.6} aria-hidden="true" /></button>
      <div className="chatgpt-settings">
      <div className="chatgpt-usage-header">{usageOpen && <p className="settings-help">{connection.connected ? "Using your ChatGPT plan" : "Your ChatGPT plan allowance"}</p>}
        <button type="button" className="settings-link" disabled={working} onClick={() => void action(() => window.desktop!.manageChatGPTUsage(), "usage", true)}>Manage usage <ArrowUpRight size={15} aria-hidden="true" /></button></div>
      {connection.paused && <p className="settings-help" role="status">ChatGPT usage is paused. Review your allowance, then retry the original action.</p>}
      {errorAt("usage")}
      <div id="chatgpt-usage-history" hidden={!usageOpen}>
        <ChatGPTUsage jobs={connection.jobs} models={connection.models} working={working}
          viewJob={id => void action(() => window.desktop!.openChatGPTJobs(id), "jobs", true)} />
        {errorAt("jobs")}
      </div>
    </div></div>
    <dialog ref={dialog} className="analysis-dialog" aria-labelledby="chatgpt-welcome-title" onCancel={event => { event.preventDefault(); finishWelcome(); }}>
      <header className="analysis-dialog-header"><h2 id="chatgpt-welcome-title">You&apos;re using your ChatGPT plan</h2></header>
      <div className="analysis-dialog-body"><p>Eligible analyses in Zebby use your ChatGPT plan. Review this app&apos;s allowance and credit access in ChatGPT settings.</p>
        {errorAt("welcome")}</div>
      <footer className="analysis-dialog-footer"><button type="button" className="settings-link" disabled={working} onClick={() => void action(() => window.desktop!.manageChatGPTUsage(), "welcome", true)}>Manage usage <ArrowUpRight size={15} aria-hidden="true" /></button>
        <SettingsAction variant="primary" disabled={working} onClick={finishWelcome}>Got it</SettingsAction></footer>
    </dialog>
  </>;
}

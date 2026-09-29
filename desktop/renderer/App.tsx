import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, Cloud, Database, FileText, FolderOpen,
  KeyRound, LoaderCircle, Plus, RotateCw, Search, Settings2, Sparkles, Trash2 } from "lucide-react";
import ApplicationDashboard from "../../app/application-dashboard";
import type { DesktopState } from "../bridge";
import type { Plan, PlanInput } from "../store";

type Tab = "plan" | "applications" | "settings";

function emptyPlan(): PlanInput {
  return { listingUrl: "", company: "", title: "", team: "", locations: "",
    description: "", keywords: [], themes: [], overview: "" };
}

function inputFromPlan(plan: Plan): PlanInput {
  return { listingUrl: plan.listingUrl, company: plan.company, title: plan.title,
    team: plan.team, locations: plan.locations, description: plan.description,
    keywords: plan.keywords, themes: plan.themes, overview: plan.overview };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function PlanView({ hasApiKey, onOpenSettings, onDirtyChange }: {
  hasApiKey: boolean; onOpenSettings: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanInput>(emptyPlan);
  const [savedDraft, setSavedDraft] = useState<PlanInput>(emptyPlan);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const busy = reading || saving || analyzing;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    void fetch("/api/plans", { cache: "no-store" })
      .then((response) => readJson<{ plans: Plan[] }>(response))
      .then(({ plans }) => { setPlans(plans); if (plans[0]) {
        setSelectedId(plans[0].id); setDraft(inputFromPlan(plans[0])); setSavedDraft(inputFromPlan(plans[0]));
      } })
      .catch((cause) => setError(errorText(cause)))
      .finally(() => setLoading(false));
  }, []);

  const visiblePlans = useMemo(() => plans.filter((plan) =>
    `${plan.title} ${plan.company} ${plan.listingUrl}`.toLowerCase().includes(filter.toLowerCase())), [plans, filter]);

  function update<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
  }

  function choose(plan: Plan | null) {
    if (busy) return;
    if (dirty && !window.confirm("Discard unsaved changes to this plan?")) return;
    setSelectedId(plan?.id || null);
    setDraft(plan ? inputFromPlan(plan) : emptyPlan());
    setSavedDraft(plan ? inputFromPlan(plan) : emptyPlan());
    setError(""); setNotice("");
  }

  async function readListing() {
    if (!draft.listingUrl.trim()) return;
    setReading(true); setError(""); setNotice("");
    try {
      const { details, text } = await readJson<{ details: {
        company: string; title: string; team: string; locations: string;
      }; text: string }>(await fetch("/api/job-posting", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draft.listingUrl.trim() }) }));
      setDraft((current) => ({ ...current,
        company: current.company || details.company, title: current.title || details.title,
        team: current.team || details.team, locations: current.locations || details.locations,
        description: current.description || text,
      }));
      setNotice(text ? "Listing text added. Review it before analyzing." : "The site did not share the job text. Paste the description below.");
    } catch (cause) {
      setError(`${errorText(cause)} You can paste the job description below.`);
    } finally { setReading(false); }
  }

  async function save(value = draft): Promise<Plan> {
    setSaving(true); setError("");
    try {
      const response = await fetch(selectedId ? `/api/plans/${selectedId}` : "/api/plans", {
        method: selectedId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const { plan } = await readJson<{ plan: Plan }>(response);
      setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setSelectedId(plan.id); setDraft(inputFromPlan(plan)); setSavedDraft(inputFromPlan(plan));
      setNotice("Plan saved.");
      return plan;
    } finally { setSaving(false); }
  }

  async function saveClick(event: FormEvent) {
    event.preventDefault();
    try { await save(); }
    catch (cause) { setError(errorText(cause)); }
  }

  async function analyze() {
    if (!hasApiKey) { onOpenSettings(); return; }
    setAnalyzing(true); setError(""); setNotice("");
    try {
      const saved = dirty || !selectedId ? await save() : plans.find((plan) => plan.id === selectedId);
      if (!saved) throw new Error("Save this plan before analyzing it.");
      const { plan } = await readJson<{ plan: Plan }>(await fetch(`/api/plans/${saved.id}/analyze`, { method: "POST" }));
      setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setDraft(inputFromPlan(plan)); setSavedDraft(inputFromPlan(plan));
      setNotice("Analysis saved. You can edit any part of it.");
    } catch (cause) { setError(errorText(cause)); }
    finally { setAnalyzing(false); }
  }

  async function remove() {
    if (!selectedId || !window.confirm("Delete this saved plan?")) return;
    setError("");
    try {
      const response = await fetch(`/api/plans/${selectedId}`, { method: "DELETE" });
      if (!response.ok) await readJson(response);
      const remaining = plans.filter((item) => item.id !== selectedId);
      setPlans(remaining);
      const next = remaining[0] || null;
      setSelectedId(next?.id || null);
      setDraft(next ? inputFromPlan(next) : emptyPlan());
      setSavedDraft(next ? inputFromPlan(next) : emptyPlan());
      setNotice("Plan deleted.");
    } catch (cause) { setError(errorText(cause)); }
  }

  return <main className="desktop-main plan-page">
    <div className="page-heading plan-heading">
      <div><h1>Plan</h1><p>Turn each job posting into a focused resume brief.</p></div>
      <button className="button button-primary" type="button" onClick={() => choose(null)} disabled={busy}>
        <Plus size={18} aria-hidden="true" /> New plan
      </button>
    </div>
    <div className="plan-layout">
      <aside className="plan-list" aria-label="Saved plans">
        <div className="plan-list-head"><h2>Saved plans</h2><span>{plans.length}</span></div>
        <label className="search-field plan-search"><Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Search plans</span>
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search plans" />
        </label>
        {loading && <p className="rail-note">Loading plans...</p>}
        {!loading && plans.length === 0 && <div className="plan-rail-empty"><FileText size={21} aria-hidden="true" />
          <p>Your saved plans will appear here.</p></div>}
        {!loading && plans.length > 0 && visiblePlans.length === 0 && <p className="rail-note">No plans match this search.</p>}
        <div className="plan-items">{visiblePlans.map((plan) => <button key={plan.id} type="button"
          className={`plan-item ${selectedId === plan.id ? "selected" : ""}`}
          onClick={() => choose(plan)} disabled={busy} aria-current={selectedId === plan.id ? "page" : undefined}>
          <strong>{plan.title || "Untitled role"}</strong><span>{plan.company || new URL(plan.listingUrl).hostname}</span>
          <small>Edited {formatUpdated(plan.updatedAt)}{plan.keywords.length ? ` · ${plan.keywords.length} keywords` : ""}</small>
        </button>)}</div>
      </aside>

      <form className="plan-editor" onSubmit={saveClick}>
        <div className="plan-editor-head"><div><h2>{selectedId ? "Role brief" : "New role brief"}</h2>
          <p>Keep the source and your resume direction together.</p></div>
          <span className={`save-state ${dirty ? "unsaved" : ""}`}>{dirty ? "Unsaved changes" : selectedId ? "Saved" : "New"}</span>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="plan-section">
          <div className="plan-section-heading"><h3>Job posting</h3>{draft.listingUrl && <a href={draft.listingUrl} target="_blank" rel="noopener noreferrer">Open listing <ArrowUpRight size={14} aria-hidden="true" /></a>}</div>
          <label className="field"><span>Job listing link</span><div className="listing-input-row">
            <input type="url" value={draft.listingUrl} onChange={(event) => update("listingUrl", event.target.value)}
              placeholder="https://..." required maxLength={2000} />
            <button className="button button-secondary" type="button" onClick={() => void readListing()}
              disabled={!draft.listingUrl || busy}>{reading ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} Read listing</button>
          </div></label>
          <div className="plan-meta-grid">
            <label className="field"><span>Company</span><input value={draft.company} onChange={(event) => update("company", event.target.value)} placeholder="Company name" /></label>
            <label className="field"><span>Job title</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="Product Manager" /></label>
            <label className="field"><span>Team</span><input value={draft.team} onChange={(event) => update("team", event.target.value)} placeholder="If listed" /></label>
            <label className="field"><span>Location(s)</span><input value={draft.locations} onChange={(event) => update("locations", event.target.value)} placeholder="If listed" /></label>
          </div>
          <label className="field"><span>Job description</span><textarea className="description-area" value={draft.description}
            onChange={(event) => update("description", event.target.value)} placeholder="Read the listing or paste the full job description here." maxLength={80000} />
            <small>Some job sites block automatic reading. You can paste and edit the text here.</small></label>
        </div>
        <div className="plan-section analysis-section">
          <div className="plan-section-heading"><div><h3>Resume direction</h3>
            <p>Generated suggestions are editable. Check them against the posting and your experience.</p></div>
            <button className="button button-secondary analysis-button" type="button" onClick={() => void analyze()}
              disabled={busy || draft.description.trim().length < 100 || !draft.listingUrl}>
              {analyzing ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
              {analyzing ? "Analyzing..." : draft.keywords.length ? "Analyze again" : "Analyze with GPT-6 Sol"}
            </button>
          </div>
          {!hasApiKey && <p className="analysis-hint"><KeyRound size={16} aria-hidden="true" />
            Add an OpenAI API key in <button type="button" onClick={onOpenSettings}>Settings</button> to run analysis.</p>}
          <div className="analysis-grid">
            <label className="field"><span>Core ATS keywords <small>{draft.keywords.filter(Boolean).length} keywords, aim for 6-20</small></span>
              <textarea className="keywords-area" value={draft.keywords.join("\n")}
                onChange={(event) => update("keywords", event.target.value.split("\n"))}
                placeholder="One keyword or phrase per line" /></label>
            <label className="field"><span>Core resume themes <small>{draft.themes.filter(Boolean).length} themes, aim for 5-6</small></span>
              <textarea className="themes-area" value={draft.themes.join("\n")}
                onChange={(event) => update("themes", event.target.value.split("\n"))}
                placeholder="One theme per line" /></label>
          </div>
          <label className="field"><span>Ideal candidate CV overview</span>
            <textarea className="overview-area" value={draft.overview}
              onChange={(event) => update("overview", event.target.value)}
              placeholder="The ideal profile for this role will appear here. Edit it to match your actual experience before using it." /></label>
          <p className="analysis-footnote">Analysis sends the job posting text to OpenAI using your API key. API usage may be billed to your account.</p>
        </div>
        <div className="plan-actions">
          {selectedId && <button className="button-delete" type="button" onClick={() => void remove()} disabled={busy}>
            <Trash2 size={16} aria-hidden="true" /> Delete plan</button>}
          <button className="button button-primary" type="submit" disabled={busy || !draft.listingUrl}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Save plan
          </button>
        </div>
      </form>
    </div>
  </main>;
}

function SettingsView({ state, onState }: { state: DesktopState; onState: (value: DesktopState) => void }) {
  const [keyInput, setKeyInput] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function choose(kind: "open" | "create") {
    setWorking(true); setError(""); setNotice("");
    try { const result = await window.desktop!.chooseDatabase(kind);
      if (result) { onState(result); setNotice(kind === "create" ? "Database created and ready." : "Database opened."); }
    } catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function saveKey(value: string) {
    setWorking(true); setError(""); setNotice("");
    try { onState(await window.desktop!.setApiKey(value)); setKeyInput("");
      setNotice(value ? "API key saved on this computer." : "API key removed."); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function retry() {
    setWorking(true); setError("");
    try { onState(await window.desktop!.retrySync()); setNotice("Changes saved to the selected database."); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  return <main className="desktop-main settings-page">
    <div className="page-heading"><div><h1>Settings</h1><p>Choose where your data lives and connect analysis.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="settings-section" aria-labelledby="database-settings">
      <div className="settings-icon"><Database size={22} aria-hidden="true" /></div>
      <div className="settings-content"><h2 id="database-settings">Database</h2>
        <p>Applications, uploaded resumes, and plans live in one SQLite file.</p>
        <div className="database-location"><span>Current file</span><strong>{state.filename || "No database selected"}</strong>
          {state.filePath && <code title={state.filePath}>{state.filePath}</code>}</div>
        {state.dirty && <p className="sync-warning">The latest changes are still on this computer. Retry the save before switching devices.</p>}
        <div className="settings-actions"><button className="button button-secondary" type="button" onClick={() => void choose("open")} disabled={working}>
          <FolderOpen size={17} aria-hidden="true" /> Open database</button>
          <button className="button button-secondary" type="button" onClick={() => void choose("create")} disabled={working}>
          <Plus size={17} aria-hidden="true" /> Create database</button>
          {state.dirty && <button className="button button-primary" type="button" onClick={() => void retry()} disabled={working}>
            <RotateCw size={16} aria-hidden="true" /> Retry save</button>}
        </div>
      </div>
    </section>
    <section className="settings-section" aria-labelledby="sync-settings"><div className="settings-icon"><Cloud size={22} aria-hidden="true" /></div>
      <div className="settings-content"><h2 id="sync-settings">Using a cloud folder</h2>
        <p>Put the SQLite file in a synced folder such as OneDrive, Dropbox, or iCloud Drive. Choose that same file on each computer.</p>
        <ol className="sync-steps"><li>Quit the app on the first computer.</li><li>Wait for the cloud drive to finish syncing.</li>
          <li>Open the app on the other computer and confirm its cloud drive is up to date.</li></ol>
        <div className="backup-note"><strong>Weekly backups</strong><span>A copy is kept on each computer in its local backups folder.</span>
          <button type="button" onClick={() => void window.desktop!.openBackups()}>Open backups folder <ArrowUpRight size={14} aria-hidden="true" /></button></div>
      </div>
    </section>
    <section className="settings-section" aria-labelledby="ai-settings"><div className="settings-icon"><KeyRound size={22} aria-hidden="true" /></div>
      <div className="settings-content"><h2 id="ai-settings">OpenAI analysis</h2>
        <p>Plan uses GPT-6 Sol to analyze job descriptions. Your API key stays on this computer and is never added to the shared database.</p>
        <p className="key-status">{state.hasApiKey ? "API key saved on this computer" : "No API key saved"}</p>
        <label className="field key-field"><span>{state.hasApiKey ? "Replace API key" : "API key"}</span>
          <input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)}
            placeholder="sk-..." autoComplete="off" spellCheck={false} /></label>
        {!state.canSaveApiKey && <p className="settings-help">Secure storage is unavailable. The key will work until you close the app.</p>}
        <div className="settings-actions"><button className="button button-primary" type="button" disabled={working || !keyInput.trim()}
          onClick={() => void saveKey(keyInput)}><Check size={17} aria-hidden="true" /> Save API key</button>
          {state.hasApiKey && <button className="button button-secondary" type="button" disabled={working}
            onClick={() => void saveKey("")}>Remove key</button>}</div>
        <p className="settings-help">Analysis uses your OpenAI API account and may incur charges.</p>
      </div>
    </section>
  </main>;
}

function Welcome({ state, onState }: { state: DesktopState; onState: (value: DesktopState) => void }) {
  const [error, setError] = useState(state.startupError);
  const [working, setWorking] = useState(false);
  async function choose(kind: "open" | "create") {
    setWorking(true); setError("");
    try { const result = await window.desktop!.chooseDatabase(kind); if (result) onState(result); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }
  return <main className="welcome-page"><div className="welcome-graphic" aria-hidden="true"><span /><span /><span /></div>
    <div className="welcome-copy"><h1>Your search, in one place.</h1>
      <p>Plan for the roles you want, then track every application and resume you send.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="welcome-actions"><button className="button button-primary" onClick={() => void choose("create")} disabled={working}>
      <Plus size={18} aria-hidden="true" /> Create database</button>
      <button className="button button-secondary" onClick={() => void choose("open")} disabled={working}>
      <FolderOpen size={18} aria-hidden="true" /> Open existing database</button></div>
    <p className="welcome-foot">Choose a folder that syncs across your computers if you want to share one database between them.</p>
  </main>;
}

export default function App() {
  const [state, setState] = useState<DesktopState | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [dirtyPlan, setDirtyPlan] = useState(false);
  const [databaseVersion, setDatabaseVersion] = useState(0);
  const navigate = useCallback((target: Tab) => {
    if (target !== "plan" && dirtyPlan && !window.confirm("Discard unsaved changes to this plan?")) return;
    setTab(target);
  }, [dirtyPlan]);

  useEffect(() => {
    void window.desktop!.state().then(setState);
    const removeChanged = window.desktop!.onDatabaseChanged((next) => {
      setState(next); setDatabaseVersion((current) => current + 1); setTab("plan");
    });
    const removeNavigate = window.desktop!.onNavigate((target) => {
      if (target === "plan" || target === "applications" || target === "settings") navigate(target);
    });
    return () => { removeChanged(); removeNavigate(); };
  }, [navigate]);

  if (!state) return <div className="desktop-loading"><LoaderCircle className="spin" size={24} /> Opening workspace...</div>;
  return <div className={`desktop-shell ${state.platform === "darwin" ? "platform-mac" : "platform-windows"}`}>
    <header className="topbar desktop-topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
        <span>PM Application Tracker</span></div>
      {state.filePath && <nav className="desktop-tabs" aria-label="Workspace">
        <button type="button" className={tab === "plan" ? "active" : ""} onClick={() => navigate("plan")} aria-current={tab === "plan" ? "page" : undefined}>Plan</button>
        <button type="button" className={tab === "applications" ? "active" : ""} onClick={() => navigate("applications")}
          aria-current={tab === "applications" ? "page" : undefined}>Applications</button>
      </nav>}
      <button type="button" className={`topbar-settings ${tab === "settings" ? "active" : ""}`}
        onClick={() => navigate("settings")} aria-label="Settings" title="Settings">
        <Settings2 size={18} aria-hidden="true" /><span>Settings</span></button>
    </header>
    {!state.filePath ? (tab === "settings" ? <SettingsView state={state} onState={setState} /> : <Welcome state={state} onState={setState} />)
      : tab === "plan" ? <PlanView key={databaseVersion} hasApiKey={state.hasApiKey}
        onOpenSettings={() => navigate("settings")} onDirtyChange={setDirtyPlan} />
      : tab === "applications" ? <ApplicationDashboard key={databaseVersion} embedded />
      : <SettingsView state={state} onState={setState} />}
  </div>;
}

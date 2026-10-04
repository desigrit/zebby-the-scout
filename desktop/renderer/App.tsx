import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, FileText, FolderOpen,
  LoaderCircle, Monitor, Moon, Plus, RefreshCw, RotateCw, Search, Sparkles, Sun, Trash2 } from "lucide-react";
import ApplicationDashboard from "./ApplicationDashboard";
import LocationEditor from "./LocationEditor";
import { pasteJobDescription } from "../../lib/job-text-paste";
import type { DesktopState } from "../bridge";
import type { Plan, PlanInput } from "../store";
import type { Resume } from "../../lib/application-types";
import { AnalysisSettings } from "./AnalysisSettings";
import { AnalysisFlowProvider, CreditsSettings, SidebarCredits, useAnalysisFlow } from "./AnalysisFlow";
import { onlineModel } from "../../shared/online-models";
import PlanRecommendations from "./PlanRecommendations";
import NavigationButton from "./NavigationButton";
import UpdateButton from "./UpdateButton";
import { LOCAL_MODELS } from "../local-model-catalog";
import { importanceForTerms } from "../plan-importance";
import { useInteractiveScrollbars, useWorkspaceShortcuts } from "./useWorkspaceShortcuts";

type Tab = "plan" | "applications" | "settings";

function emptyPlan(currentOverview = ""): PlanInput {
  return { listingUrl: "", company: "", title: "", team: "", locations: "",
    description: "", snapshotText: "", snapshotSource: "", currentOverview,
    resumeId: "", keywords: [], themes: [], overview: "" };
}

function inputFromPlan(plan: Plan): PlanInput {
  return { listingUrl: plan.listingUrl, company: plan.company, title: plan.title,
    team: plan.team, locations: plan.locations, description: plan.description,
    snapshotText: plan.snapshotText, snapshotSource: plan.snapshotSource,
    currentOverview: plan.currentOverview, resumeId: plan.resumeId,
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

function PlanView({ analysisProvider, ollamaModel, builtInModelId, builtInReady, onDirtyChange, onAnalysisChange }: {
  analysisProvider: DesktopState["analysisProvider"]; ollamaModel: string;
  builtInModelId: string; builtInReady: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onAnalysisChange: (busy: boolean) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanInput>(() => emptyPlan());
  const [savedDraft, setSavedDraft] = useState<PlanInput>(() => emptyPlan());
  const [lastCurrentOverview, setLastCurrentOverview] = useState("");
  const [filter, setFilter] = useState("");
  const [planListExpanded, setPlanListExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const analysisFlow = useAnalysisFlow();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const builtInModel = LOCAL_MODELS.find((model) => model.id === builtInModelId);

  const listingController = useRef<AbortController | null>(null);
  const resumeInput = useRef<HTMLInputElement | null>(null);
  const analysisRequest = useRef<{ id: string; controller: AbortController } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft) || Boolean(resumeFile);
  const busy = reading || saving || analyzing;
  const selectedPlan = plans.find((plan) => plan.id === selectedId);
  const hasAnalysis = Boolean(selectedPlan && (selectedPlan.matchAnalyzedAt || selectedPlan.keywords.length));
  const jobIsCurrent = selectedPlan &&
    (["listingUrl", "company", "title", "team", "locations", "description"] as const)
      .every((key) => draft[key] === selectedPlan[key]);
  const keywordImportance = importanceForTerms(selectedPlan?.keywords || [],
    jobIsCurrent ? selectedPlan.keywordImportance : [], draft.keywords);
  const themeImportance = importanceForTerms(selectedPlan?.themes || [],
    jobIsCurrent ? selectedPlan.themeImportance : [], draft.themes);
  const matchIsCurrent = selectedPlan && !resumeFile &&
    (["listingUrl", "company", "title", "team", "locations", "description",
      "currentOverview", "resumeId"] as const).every((key) => draft[key] === selectedPlan[key]);
  const matchStrength = matchIsCurrent ? selectedPlan.matchStrength : null;
  const matchNotes = matchIsCurrent ? selectedPlan.matchNotes : "";
  const overviewRationale = matchIsCurrent && draft.overview === selectedPlan.overview
    ? selectedPlan.overviewRationale : "";
  const overviewUnchanged = draft.overview.trim().replace(/\s+/g, " ") ===
    draft.currentOverview.trim().replace(/\s+/g, " ");
  const canAnalyze = Boolean(draft.listingUrl && draft.currentOverview.trim() &&
    (draft.resumeId || resumeFile) &&
    Math.max(draft.description.trim().length, draft.snapshotText?.trim().length || 0) >= 100);
  const missing = [!draft.listingUrl && "a job link",
    Math.max(draft.description.trim().length, draft.snapshotText?.trim().length || 0) < 100 && "job text (100+ characters)",
    !draft.currentOverview.trim() && "your resume overview", !(draft.resumeId || resumeFile) && "a resume"].filter(Boolean);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => { onAnalysisChange(analyzing); return () => onAnalysisChange(false); }, [analyzing, onAnalysisChange]);
  useEffect(() => () => {
    const request = analysisRequest.current;
    if (request) { void window.desktop?.cancelAnalysis(request.id).catch(() => undefined); request.controller.abort(); }
  }, []);

  useEffect(() => {
    void Promise.all([
      fetch("/api/plans", { cache: "no-store" }).then((response) => readJson<{ plans: Plan[]; lastCurrentOverview: string }>(response)),
      fetch("/api/resumes", { cache: "no-store" }).then((response) => readJson<{ resumes: Resume[] }>(response)),
    ])
      .then(([{ plans, lastCurrentOverview }, { resumes }]) => {
        setPlans(plans); setResumes(resumes); setLastCurrentOverview(lastCurrentOverview || "");
        if (plans[0]) {
        setSelectedId(plans[0].id); setDraft(inputFromPlan(plans[0])); setSavedDraft(inputFromPlan(plans[0]));
        } else { setDraft(emptyPlan(lastCurrentOverview)); setSavedDraft(emptyPlan(lastCurrentOverview)); }
      })
      .catch((cause) => setError(errorText(cause)))
      .finally(() => setLoading(false));
  }, []);

  const visiblePlans = useMemo(() => plans.filter((plan) =>
    `${plan.title} ${plan.company} ${plan.listingUrl}`.toLowerCase().includes(filter.toLowerCase())), [plans, filter]);

  function update<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setDraft((current) => {
      if (key === "listingUrl" && value !== current.listingUrl) {
        listingController.current?.abort();
        return { ...current, listingUrl: String(value),
          description: current.description === current.snapshotText ? "" : current.description,
          snapshotText: "", snapshotSource: "" };
      }
      return { ...current, [key]: value };
    });
    setNotice("");
  }

  function choose(plan: Plan | null) {
    if (busy) return;
    if (dirty && !window.confirm("Discard unsaved changes to this plan?")) return;
    listingController.current?.abort();
    setSelectedId(plan?.id || null);
    setPlanListExpanded(false);
    setDraft(plan ? inputFromPlan(plan) : emptyPlan(lastCurrentOverview));
    setSavedDraft(plan ? inputFromPlan(plan) : emptyPlan(lastCurrentOverview));
    setResumeFile(null); if (resumeInput.current) resumeInput.current.value = "";
    setError(""); setNotice("");
  }

  const readListing = useCallback(async (url: string) => {
    if (!url.trim()) return;
    listingController.current?.abort();
    const controller = new AbortController();
    listingController.current = controller;
    setReading(true); setError(""); setNotice("");
    try {
      const { details, text } = await readJson<{ details: {
        company: string; title: string; team: string; locations: string;
      }; text: string }>(await fetch("/api/job-posting", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }), signal: controller.signal }));
      if (controller.signal.aborted) return;
      setDraft((current) => current.listingUrl.trim() === url.trim() ? ({ ...current,
        company: current.company || details.company, title: current.title || details.title,
        team: current.team || details.team, locations: current.locations || details.locations,
        description: current.description || text,
        snapshotText: current.snapshotSource === "page" && current.snapshotText ? current.snapshotText : text || current.snapshotText,
        snapshotSource: text ? "page" : current.snapshotSource,
      }) : current);
      setNotice(text ? "Listing text added to this draft." : "The site did not share the job text. Paste the description below.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(`${errorText(cause)} You can paste the job description below.`);
    } finally {
      if (listingController.current === controller) { listingController.current = null; setReading(false); }
    }
  }, []);

  useEffect(() => {
    const url = draft.listingUrl.trim();
    if (!/^https:\/\//i.test(url) || draft.snapshotText ||
        (selectedId && savedDraft.listingUrl === url)) return;
    const timer = window.setTimeout(() => void readListing(url), 650);
    return () => window.clearTimeout(timer);
  }, [draft.listingUrl, draft.snapshotText, selectedId, savedDraft.listingUrl, readListing]);

  useEffect(() => () => listingController.current?.abort(), []);

  async function save(value = draft): Promise<Plan> {
    setSaving(true); setError("");
    try {
      try {
        if (new URL(value.listingUrl).protocol !== "https:") throw new Error();
      } catch { throw new Error("Enter a public HTTPS job listing link before saving this plan."); }
      let nextValue = value;
      if (resumeFile) {
        const form = new FormData();
        form.append("file", resumeFile);
        const { resume } = await readJson<{ resume: Resume }>(await fetch("/api/resumes", {
          method: "POST", body: form,
        }));
        setResumes((current) => [resume, ...current]);
        nextValue = { ...value, resumeId: resume.id };
        setDraft(nextValue);
        setResumeFile(null);
        if (resumeInput.current) resumeInput.current.value = "";
      }
      const response = await fetch(selectedId ? `/api/plans/${selectedId}` : "/api/plans", {
        method: selectedId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextValue),
      });
      const { plan } = await readJson<{ plan: Plan }>(response);
      setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setSelectedId(plan.id); setDraft(inputFromPlan(plan)); setSavedDraft(inputFromPlan(plan));
      setLastCurrentOverview(plan.currentOverview);
      setNotice("Plan saved.");
      return plan;
    } finally { setSaving(false); }
  }

  async function saveClick(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    try { await save(); }
    catch (cause) { setError(errorText(cause)); }
  }

  async function analyze() {
    if (busy || !canAnalyze || analysisRequest.current) return;
    setError(""); setNotice("");
    const request = { id: crypto.randomUUID(), controller: new AbortController() };
    analysisRequest.current = request;
    try {
      const saved = dirty || !selectedId ? await save() : selectedPlan;
      request.controller.signal.throwIfAborted();
      if (!saved) throw new Error("Save this plan before analyzing it.");
      const authorization = await analysisFlow.prepare({ kind: "plan", id: saved.id });
      if (!authorization) return;
      request.controller.signal.throwIfAborted();
      setAnalyzing(true);
      const { plan } = await readJson<{ plan: Plan }>(await fetch(`/api/plans/${saved.id}/analyze`, {
        method: "POST", headers: { "X-Zebby-Analysis-ID": request.id, ...(authorization.quoteId ? { "X-Zebby-Credit-Quote": authorization.quoteId } : {}) }, signal: request.controller.signal }));
      request.controller.signal.throwIfAborted();
      setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setDraft(inputFromPlan(plan)); setSavedDraft(inputFromPlan(plan));
      setLastCurrentOverview(plan.currentOverview);
      setNotice("Analysis saved.");
    } catch (cause) {
      if (request.controller.signal.aborted) setNotice("Analysis cancelled.");
      else setError(errorText(cause));
    } finally { analysisRequest.current = null; setAnalyzing(false); setCancelling(false); }
  }

  async function cancelAnalysis() {
    const request = analysisRequest.current;
    if (!request || cancelling) return;
    setCancelling(true);
    try {
      if (!window.desktop || await window.desktop.cancelAnalysis(request.id)) request.controller.abort();
    } catch { setError("Could not cancel analysis. Try again."); }
    finally { setCancelling(false); }
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
      setDraft(next ? inputFromPlan(next) : emptyPlan(lastCurrentOverview));
      setSavedDraft(next ? inputFromPlan(next) : emptyPlan(lastCurrentOverview));
      setResumeFile(null); if (resumeInput.current) resumeInput.current.value = "";
      setNotice("Plan deleted.");
    } catch (cause) { setError(errorText(cause)); }
  }

  return <main className="desktop-main plan-page" aria-label="Plan">
    <div className="workspace-toolbar">
      <span className="workspace-context plan-context">{plans.length} saved {plans.length === 1 ? "plan" : "plans"}</span>
      <button className="button button-secondary plan-rail-toggle" type="button" data-command="search-toggle"
        aria-expanded={planListExpanded} aria-controls="saved-plan-list" disabled={busy}
        onClick={() => setPlanListExpanded((value) => !value)}><FileText size={16} aria-hidden="true" /> Saved plans ({plans.length})</button>
      <button className="button button-primary" type="button" data-command="new" onClick={() => choose(null)} disabled={busy}>
        <Plus size={18} aria-hidden="true" /> New plan
      </button>
    </div>
    <div className={`plan-layout${planListExpanded ? " plans-open" : ""}`}>
      <aside className="plan-list" id="saved-plan-list" aria-label="Saved plans">
        <div className="plan-list-head"><h2>Saved plans</h2><span>{plans.length}</span></div>
        <label className="search-field plan-search"><Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Search plans</span>
          <input data-command="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search plans" />
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
        <div className="plan-editor-head"><div><h2>{draft.title || "New plan"}</h2>
          {(draft.company || draft.team) && <p>{[draft.company, draft.team].filter(Boolean).join(" · ")}</p>}</div>
          <span className={`save-state ${dirty ? "unsaved" : ""}`}>{dirty ? "Unsaved changes" : selectedId ? "Saved" : "New"}</span>
        </div>
        <div className="plan-document-scroll">
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="plan-document">
        <div className="plan-inputs">
        <fieldset className="plan-section" disabled={analyzing || saving}>
          <div className="plan-section-heading"><h3>Job posting</h3>{draft.listingUrl && <a href={draft.listingUrl} target="_blank" rel="noopener noreferrer">Open listing <ArrowUpRight size={14} aria-hidden="true" /></a>}</div>
          <label className="field"><span id="plan-listing-label">Job listing link</span><div className="listing-input-row">
            <input type="url" value={draft.listingUrl} onChange={(event) => update("listingUrl", event.target.value)}
              aria-labelledby="plan-listing-label" placeholder="https://..." required maxLength={2000} />
            <button className="button button-secondary" type="button" onClick={() => void readListing(draft.listingUrl)}
              disabled={!draft.listingUrl || busy}>{reading ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} Read listing</button>
          </div></label>
          <div className="plan-meta-grid">
            <label className="field"><span>Company</span><input value={draft.company} onChange={(event) => update("company", event.target.value)} placeholder="Company name" /></label>
            <label className="field"><span>Job title</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="Product Manager" /></label>
            <label className="field"><span>Team</span><input value={draft.team} onChange={(event) => update("team", event.target.value)} placeholder="If listed" /></label>
            <LocationEditor value={draft.locations} onChange={(value) => update("locations", value)} />
          </div>
          <label className="field"><span>Job description</span><textarea className="description-area" value={draft.description}
            onChange={(event) => update("description", event.target.value)}
            onPaste={(event) => pasteJobDescription(event, (value) => update("description", value))}
            placeholder="Paste job description" maxLength={80000} /></label>
          {draft.snapshotText && <details className="snapshot-panel"><summary>Saved listing copy <span>{draft.snapshotSource === "page" ? "Captured from link" : "Saved from description"}</span></summary>
            <p>The original copy is kept when you edit the description.</p>
            <pre>{draft.snapshotText}</pre></details>}
        </fieldset>
        <div className="plan-section cv-section">
          <fieldset className="plan-fields" disabled={analyzing || saving}>
          <div className="plan-section-heading"><h3>Your CV</h3></div>
          <label className="field"><span id="current-cv-overview-label">Current resume overview</span>
            <textarea className="current-overview-area" value={draft.currentOverview}
              aria-labelledby="current-cv-overview-label" aria-describedby="current-cv-overview-help"
              onChange={(event) => update("currentOverview", event.target.value)}
              placeholder="Paste your resume overview" maxLength={20000} />
            <small id="current-cv-overview-help">Your last saved overview is filled in for new plans.</small></label>
          <label className="field"><span>Resume for this role</span>
            <select value={resumeFile ? "" : draft.resumeId}
              onChange={(event) => { setResumeFile(null); if (resumeInput.current) resumeInput.current.value = "";
                update("resumeId", event.target.value); }}>
              <option value="">Choose a saved resume</option>
              {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.filename}</option>)}
            </select></label>
          <label className="field plan-upload"><span>Or upload a new resume</span>
            <input ref={resumeInput} type="file" accept=".pdf,.docx,.doc"
              onChange={(event) => { const file = event.target.files?.[0] || null;
                setResumeFile(file); if (file) update("resumeId", ""); }} />
            <small>{resumeFile ? `${resumeFile.name}, ready to save.` : "PDF, DOCX, or DOC. Up to 10 MB."}</small></label>
          </fieldset>
          <div className="plan-analyze-actions">
            {analyzing && <span className="visually-hidden" role="status" aria-label="Analyzing role">Analysis in progress</span>}
            <button className="button button-primary analysis-button" type="button" onClick={() => void analyze()}
              disabled={busy || !canAnalyze} aria-label={analyzing ? "Analysis in progress" : "Analyze"}>
              {analyzing ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
              Analyze
            </button>
            {analyzing && <button className="button button-secondary" type="button" onClick={() => void cancelAnalysis()}
              disabled={cancelling}>Cancel</button>}
            <small>{analysisProvider === "ollama" ? (ollamaModel || "Ollama") : analysisProvider === "builtin"
              ? (builtInModel?.name || "Local model") : onlineModel(analysisProvider === "credits" ? analysisFlow.state.credits.model
                : analysisProvider === "anthropic" ? analysisFlow.state.anthropicModel : analysisFlow.state.openaiModel).name}</small>
          </div>
          {analysisProvider === "builtin" && builtInReady && builtInModel?.basic && <p className="analysis-hint">
            Compact mode uses basic keyword coverage and limited overview suggestions.</p>}
          {!canAnalyze && <p className="analysis-requirements">Add {missing.join(", ")} to analyze.</p>}
        </div>
        </div>
        <fieldset className="plan-section analysis-section" disabled={analyzing || saving}>
          <div className="plan-section-heading"><h3>Resume direction</h3></div>
          <div className="match-result" aria-busy={analyzing}><span>Resume match</span>
            <div className="match-result-value">
              <strong>{matchStrength === null ? "Not analyzed" : `${matchStrength}%`}</strong>
              {matchStrength !== null && <span className="score-track" aria-hidden="true"><span style={{ width: `${matchStrength}%` }} /></span>}
              {hasAnalysis && <button className="match-refresh" type="button" aria-label="Refresh analysis" title="Refresh analysis"
                onClick={() => void analyze()} disabled={busy || !canAnalyze}><RefreshCw size={16} aria-hidden="true" /></button>}
            </div>
            {!analyzing && matchStrength !== null && <details className="match-why">
              <summary>Why</summary>
              <p>{matchNotes || "Refresh analysis to add an explanation for this saved score."}</p>
            </details>}
          </div>
          <p className="job-importance-hint">Estimated job importance. Each rating is independent.</p>
          <div className="analysis-grid">
            <PlanRecommendations kind="keywords" values={draft.keywords} importance={keywordImportance} busy={busy}
              onChange={(value) => update("keywords", value)} />
            <PlanRecommendations kind="themes" values={draft.themes} importance={themeImportance} busy={busy}
              onChange={(value) => update("themes", value)} />
          </div>
          <label className="field"><span>Suggested resume overview</span>
            <textarea className="overview-area" value={draft.overview}
              onChange={(event) => update("overview", event.target.value)}
              placeholder="Your tailored overview will appear here." /></label>
          {overviewRationale && <div className="overview-rationale">
            <strong>{overviewUnchanged ? "No wording changes" : "What changed"}</strong>
            <p>{overviewRationale}</p>
          </div>}
          <details className="analysis-sharing"><summary>Analysis details</summary><p>{analysisProvider === "builtin"
            ? `Your posting, overview, and resume stay on this computer. Analysis uses ${builtInModel?.name || "the selected local model"}.`
            : analysisProvider === "ollama"
            ? `Job text, your overview, and extracted resume text are sent to ${ollamaModel || "your selected model"} on your Ollama server.`
            : analysisProvider === "credits" ? "Job text, your overview, and resume text are sent to Zebby and your selected online provider. You confirm credit use before analysis."
            : `Job text, your overview, and ${analysisProvider === "openai" ? "the selected resume" : "resume text"} are sent to ${analysisProvider === "openai" ? "OpenAI" : "Anthropic"}. Usage is billed to your API account.`}</p>
            <p>Importance reflects job priorities, not resume coverage or a measured ATS score.</p></details>
        </fieldset>
        </div>
        </div>
        <div className="plan-actions">
          {selectedId && <button className="button-delete" type="button" onClick={() => void remove()} disabled={busy}>
            <Trash2 size={16} aria-hidden="true" /> Delete plan</button>}
          <button className="button button-primary" type="submit" data-command="save" disabled={busy || !draft.listingUrl}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Save plan
          </button>
        </div>
      </form>
    </div>
  </main>;
}

function SettingsView({ state, onState, onUpdate, onCheckUpdates, updateWorking }: { state: DesktopState; onState: (value: DesktopState) => void;
  onUpdate: () => void; onCheckUpdates: () => Promise<void>; updateWorking: boolean }) {
  const { openCredits } = useAnalysisFlow();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function choose(kind: "open" | "create") {
    setWorking(true); setError(""); setNotice("");
    try { const result = await window.desktop!.chooseDatabase(kind);
      if (result) { onState(result); setNotice(kind === "create" ? "New database created." : "Database opened."); }
    } catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function retry() {
    setWorking(true); setError("");
    try { onState(await window.desktop!.retrySync()); setNotice("Changes saved to the selected database."); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function changeAppearance(value: DesktopState["appearance"]) {
    setWorking(true); setError(""); setNotice("");
    onState({ ...state, appearance: value });
    try { onState(await window.desktop!.setAppearance(value)); }
    catch (cause) { onState(state); setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function openLogs() {
    setWorking(true); setError(""); setNotice("");
    try { await window.desktop!.openLogs(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function checkUpdates() {
    try { await onCheckUpdates(); }
    catch (cause) { setError(errorText(cause)); }
  }

  return <main className="desktop-main settings-page" aria-label="Settings">
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="settings-section" aria-labelledby="database-settings">
      <div className="settings-section-heading"><h2 id="database-settings">Database</h2></div>
      <div className="settings-content">
        <div className="database-location"><span>Current file</span><strong>{state.filename || "No database selected"}</strong>
          {state.filePath && <code title={state.filePath}>{state.filePath}</code>}</div>
        {state.dirty && <p className="sync-warning">The latest changes are still on this computer. Retry the save before switching devices.</p>}
        <div className="settings-actions"><button className="button button-secondary" type="button" onClick={() => void choose("open")} disabled={working}>
          <FolderOpen size={17} aria-hidden="true" /> Open database</button>
          <button className="button button-secondary" type="button" data-command="new" onClick={() => void choose("create")} disabled={working}>
          <Plus size={17} aria-hidden="true" /> Create new database</button>
          {state.dirty && <button className="button button-primary" type="button" onClick={() => void retry()} disabled={working}>
            <RotateCw size={16} aria-hidden="true" /> Retry save</button>}
        </div>
        <p className="settings-help">Quit Zebby and wait for file sync before switching computers.</p>
      </div>
    </section>
    <section className="settings-section" aria-labelledby="ai-settings">
      <div className="settings-section-heading"><h2 id="ai-settings">Analysis</h2></div>
      <div className="settings-content"><AnalysisSettings state={state} onState={onState} openCredits={openCredits} /></div>
    </section>
    <CreditsSettings />
    <section className="settings-section" aria-labelledby="appearance-settings">
      <div className="settings-section-heading"><h2 id="appearance-settings">Appearance</h2></div>
      <div className="settings-content"><div className="appearance-options" role="radiogroup" aria-label="Appearance">
        {([ ["auto", "System", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon] ] as const).map(([value, label, Icon]) =>
          <label key={value} className={`appearance-option ${state.appearance === value ? "selected" : ""}`}>
            <input type="radio" name="appearance" value={value} checked={state.appearance === value}
              onChange={() => void changeAppearance(value)} disabled={working} />
            <Icon size={17} aria-hidden="true" /><span>{label}</span>
          </label>)}</div>
      </div>
    </section>
    <section className="settings-section" aria-labelledby="logs-settings">
      <div className="settings-section-heading"><h2 id="logs-settings">Logs</h2></div>
      <div className="settings-content">
        <div className="settings-links">
          <button className="settings-link" type="button" onClick={() => void openLogs()} disabled={working}>
            Open logs folder <ArrowUpRight size={15} aria-hidden="true" /></button>
          <a className="settings-link" href="https://github.com/desigrit/zebby-the-scout/issues/new" target="_blank" rel="noopener noreferrer">
            Report an issue <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
    <section className="settings-section" aria-labelledby="updates-settings">
      <div className="settings-section-heading"><h2 id="updates-settings">Updates</h2><p>Zebby {state.updates.currentVersion}</p></div>
      <div className="settings-content">
        <div className="settings-actions">
          <button className="button button-secondary" type="button" onClick={() => void checkUpdates()}
            disabled={state.updates.checking || !["idle", "error"].includes(state.updates.download.phase)}>
            {state.updates.checking && <LoaderCircle className="spin" size={16} aria-hidden="true" />} Check for updates</button>
          <UpdateButton updates={state.updates} working={updateWorking} onClick={onUpdate} />
        </div>
        <p className="settings-help" role="status">{state.updates.checking ? "Checking GitHub for a new release."
          : state.updates.available ? `Version ${state.updates.available.version} is available.`
          : state.updates.error ? "Update check unavailable." : state.updates.checkedAt ? "You have the latest version." : "Checks GitHub when Zebby opens."}</p>
        {state.updates.available && <a className="settings-link" href={state.updates.available.releaseUrl} target="_blank" rel="noopener noreferrer">
          Release notes <ArrowUpRight size={15} aria-hidden="true" /></a>}
        {(state.updates.error || state.updates.download.error) && <p className="form-error" role="alert">{state.updates.download.error || state.updates.error}</p>}
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
  return <main className="welcome-page"><img className="welcome-graphic" src="./icon.png" alt="" />
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
  useWorkspaceShortcuts();
  useInteractiveScrollbars();
  const [state, setState] = useState<DesktopState | null>(null);
  const appearance = state?.appearance;
  const [tab, setTab] = useState<Tab>("plan");
  const [dirtyPlan, setDirtyPlan] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [databaseVersion, setDatabaseVersion] = useState(0);
  const [sidebarSaving, setSidebarSaving] = useState(false);
  const [shellError, setShellError] = useState("");
  const [updateWorking, setUpdateWorking] = useState(false);
  const loaded = state !== null;
  useEffect(() => {
    if (loaded) void window.desktop!.confirmUpdateLoaded().catch(() => { /* Main process records cleanup errors. */ });
  }, [loaded]);
  const navigate = useCallback((target: Tab) => {
    if (analysisRunning) return false;
    if (target !== "plan" && dirtyPlan && !window.confirm("Discard unsaved changes to this plan?")) return false;
    setTab(target);
    return true;
  }, [dirtyPlan, analysisRunning]);

  async function toggleSidebar() {
    if (!state || sidebarSaving) return;
    const collapsed = !state.sidebarCollapsed;
    setShellError(""); setSidebarSaving(true);
    setState((current) => current ? { ...current, sidebarCollapsed: collapsed } : current);
    try { await window.desktop!.setSidebarCollapsed(collapsed); }
    catch {
      setState((current) => current ? { ...current, sidebarCollapsed: !collapsed } : current);
      setShellError("Could not save the navigation preference. Try again.");
    } finally { setSidebarSaving(false); }
  }

  async function applyUpdate() {
    if (!state || updateWorking) return;
    const restart = state.updates.download.phase === "ready";
    if (restart && document.querySelector('[role="dialog"], .desktop-dashboard .editor')) {
      setShellError("Finish editing the open form or dialog before updating."); return;
    }
    if (restart && dirtyPlan && !window.confirm("Restart to update and discard unsaved changes to this plan?")) return;
    setUpdateWorking(true); setShellError("");
    try {
      if (restart) await window.desktop!.installUpdate();
      else { const updates = await window.desktop!.downloadUpdate(); setState((current) => current ? { ...current, updates } : current); }
    } catch (cause) { setShellError(errorText(cause)); }
    finally { setUpdateWorking(false); }
  }

  async function checkUpdates() {
    const updates = await window.desktop!.checkForUpdates();
    setState((current) => current ? { ...current, updates } : current);
  }

  useEffect(() => {
    void window.desktop!.state().then(setState);
    const removeChanged = window.desktop!.onDatabaseChanged((next) => {
      setState(next); setDatabaseVersion((current) => current + 1); setTab("plan");
    });
    const removeNavigate = window.desktop!.onNavigate((target) => {
      if (target === "plan" || target === "applications" || target === "settings") navigate(target);
    });
    const removeModelsChanged = window.desktop!.onLocalModelsChanged((next) => {
      setState((current) => current ? { ...current, builtInModelId: next.builtInModelId,
        localModels: next.localModels, acceptedModelTerms: next.acceptedModelTerms,
        modelsFolder: next.modelsFolder, localEngine: next.localEngine,
        totalMemory: next.totalMemory, availableMemory: next.availableMemory } : next);
    });
    const removeCreditsChanged = window.desktop!.onCreditsChanged((next) => {
      setState((current) => current ? { ...current, credits: next.credits } : next);
    });
    const removeUpdatesChanged = window.desktop!.onUpdatesChanged((updates) => {
      setState((current) => current ? { ...current, updates } : current);
    });
    return () => { removeChanged(); removeNavigate(); removeModelsChanged(); removeUpdatesChanged(); removeCreditsChanged(); };
  }, [navigate]);

  useEffect(() => {
    if (!appearance) return;
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => { document.documentElement.dataset.theme = appearance === "auto"
      ? (system.matches ? "dark" : "light") : appearance; };
    update();
    system.addEventListener("change", update);
    return () => system.removeEventListener("change", update);
  }, [appearance]);

  if (!state) return <div className="desktop-loading"><LoaderCircle className="spin" size={24} /> Opening workspace...</div>;
  return <AnalysisFlowProvider state={state} onState={setState}><div className={`desktop-shell ${state.platform === "darwin" ? "platform-mac" : "platform-windows"}${state.sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
    <header className="desktop-titlebar" aria-label="Window title bar">
      <div className="titlebar-sidebar" aria-hidden="true" />
      <div className="titlebar-caption">Zebby</div>
    </header>
    <aside className="desktop-sidebar" inert={updateWorking && state.updates.download.phase === "ready" || state.updates.download.phase === "installing"}>
      <div className="sidebar-brand"><button className="sidebar-toggle" type="button" onClick={() => void toggleSidebar()}
        disabled={sidebarSaving} aria-expanded={!state.sidebarCollapsed} aria-controls="desktop-navigation"
        aria-label={state.sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        title={state.sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>
        <img className="brand-mark" src="./icon.png" alt="" /></button></div>
      <nav id="desktop-navigation" className="sidebar-nav" aria-label="Workspace">
        <NavigationButton kind="plan" label="Plan" selected={tab === "plan"} collapsed={state.sidebarCollapsed} onActivate={() => navigate("plan")} disabled={analysisRunning} />
        <NavigationButton kind="applications" label="Applications" selected={tab === "applications"} collapsed={state.sidebarCollapsed} onActivate={() => navigate("applications")} disabled={analysisRunning} />
        <NavigationButton kind="settings" label="Settings" selected={tab === "settings"} collapsed={state.sidebarCollapsed} onActivate={() => navigate("settings")} disabled={analysisRunning} />
      </nav>
      {(state.updates.available || state.credits.signedIn || state.filePath && !state.sidebarCollapsed) && <div className="sidebar-footer">
        <SidebarCredits />
        <UpdateButton updates={state.updates} collapsed={state.sidebarCollapsed} working={updateWorking} onClick={() => void applyUpdate()} />
        {state.filePath && !state.sidebarCollapsed && <div className="sidebar-database" title={state.filePath}>
        <span>Current database</span><strong>{state.filename}</strong>
        {state.dirty && <small>Save pending</small>}
        </div>}
      </div>}
    </aside>
    <div className="desktop-workspace" inert={updateWorking && state.updates.download.phase === "ready" || state.updates.download.phase === "installing"}>
      {shellError && <div className="workspace-warning" role="alert">{shellError}</div>}
      {state.startupError && <div className="workspace-warning" role="alert">
        <span>The previous database is unavailable. This workspace is stored locally.</span>
        <button type="button" onClick={() => navigate("settings")}>Open Settings</button>
      </div>}
      {!state.filePath ? (tab === "settings" ? <SettingsView state={state} onState={setState} onUpdate={() => void applyUpdate()} onCheckUpdates={checkUpdates} updateWorking={updateWorking} /> : <Welcome state={state} onState={setState} />)
      : tab === "plan" ? <PlanView key={databaseVersion}
        analysisProvider={state.analysisProvider} ollamaModel={state.ollamaModel}
        builtInModelId={state.builtInModelId} builtInReady={Boolean(state.localModels?.some((model) =>
          model.id === state.builtInModelId && model.status === "ready") &&
          (!LOCAL_MODELS.find((model) => model.id === state.builtInModelId)?.license ||
            state.acceptedModelTerms?.includes(state.builtInModelId)))}
        onDirtyChange={setDirtyPlan} onAnalysisChange={setAnalysisRunning} />
      : tab === "applications" ? <ApplicationDashboard key={databaseVersion} />
      : <SettingsView state={state} onState={setState} onUpdate={() => void applyUpdate()} onCheckUpdates={checkUpdates} updateWorking={updateWorking} />}</div>
  </div></AnalysisFlowProvider>;
}

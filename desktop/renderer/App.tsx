import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, Check, ClipboardList, FileText, FolderOpen,
  KeyRound, LoaderCircle, Monitor, Moon, Plus, RefreshCw, RotateCw, Search, Settings2, Sparkles, Sun, Trash2 } from "lucide-react";
import ApplicationDashboard from "../../app/application-dashboard";
import LocationEditor from "../../app/location-editor";
import MatchProgressRing from "../../app/match-progress-ring";
import { pasteJobDescription } from "../../lib/job-text-paste";
import type { DesktopState } from "../bridge";
import type { Plan, PlanInput } from "../store";
import type { Resume } from "../../lib/application-types";
import LocalModelsSettings from "./LocalModelsSettings";
import PlanRecommendations from "./PlanRecommendations";
import { LOCAL_MODELS } from "../local-model-catalog";
import { importanceForTerms } from "../plan-importance";

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

function PlanView({ analysisProvider, ollamaModel, hasApiKey, builtInModelId, builtInReady, onOpenSettings, onDirtyChange }: {
  analysisProvider: DesktopState["analysisProvider"]; ollamaModel: string;
  builtInModelId: string; builtInReady: boolean;
  hasApiKey: boolean; onOpenSettings: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanInput>(() => emptyPlan());
  const [savedDraft, setSavedDraft] = useState<PlanInput>(() => emptyPlan());
  const [lastCurrentOverview, setLastCurrentOverview] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const builtInModel = LOCAL_MODELS.find((model) => model.id === builtInModelId);

  const listingController = useRef<AbortController | null>(null);
  const resumeInput = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

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
      setNotice(text ? "Listing copy captured for offline reference. Review it before analyzing." : "The site did not share the job text. Paste the description below.");
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
    try { await save(); }
    catch (cause) { setError(errorText(cause)); }
  }

  async function analyze() {
    if (analysisProvider === "openai" && !hasApiKey || analysisProvider === "ollama" && !ollamaModel ||
        analysisProvider === "builtin" && !builtInReady) {
      onOpenSettings(); return;
    }
    setAnalyzing(true); setError(""); setNotice("");
    try {
      const saved = dirty || !selectedId ? await save() : selectedPlan;
      if (!saved) throw new Error("Save this plan before analyzing it.");
      const { plan } = await readJson<{ plan: Plan }>(await fetch(`/api/plans/${saved.id}/analyze`, { method: "POST" }));
      setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setDraft(inputFromPlan(plan)); setSavedDraft(inputFromPlan(plan));
      setLastCurrentOverview(plan.currentOverview);
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
      setDraft(next ? inputFromPlan(next) : emptyPlan(lastCurrentOverview));
      setSavedDraft(next ? inputFromPlan(next) : emptyPlan(lastCurrentOverview));
      setResumeFile(null); if (resumeInput.current) resumeInput.current.value = "";
      setNotice("Plan deleted.");
    } catch (cause) { setError(errorText(cause)); }
  }

  return <main className="desktop-main plan-page" aria-label="Plan">
    <div className="workspace-toolbar">
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
            placeholder="Read the listing or paste the full job description here." maxLength={80000} />
            <small>Some job sites block automatic reading. You can paste and edit the text here.</small></label>
          {draft.snapshotText && <details className="snapshot-panel"><summary>Saved listing copy <span>{draft.snapshotSource === "page" ? "Captured from link" : "Saved from description"}</span></summary>
            <p>This original text stays in the database when you edit the description above.</p>
            <pre>{draft.snapshotText}</pre></details>}
        </div>
        <div className="plan-section cv-section">
          <div className="plan-section-heading"><div><h3>Your CV</h3>
            <p>Use your own overview and the resume you plan to send for this role.</p></div></div>
          <label className="field"><span id="current-cv-overview-label">Current CV Overview</span>
            <textarea className="current-overview-area" value={draft.currentOverview}
              aria-labelledby="current-cv-overview-label" aria-describedby="current-cv-overview-help"
              onChange={(event) => update("currentOverview", event.target.value)}
              placeholder="Paste the overview from your current CV here." maxLength={20000} />
            <small id="current-cv-overview-help">Your last saved overview is filled in for new plans. Edit it for each role.</small></label>
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
            <small>{resumeFile ? `${resumeFile.name} will be saved in this database with the plan.`
              : "PDF, DOCX, or DOC, up to 10 MB. You can reuse this file for applications."}</small></label>
          <div className="plan-analyze-actions">
            <button className="button button-primary analysis-button" type="button" onClick={() => void analyze()}
              disabled={busy || !canAnalyze} aria-label={analyzing ? "Analysis in progress" : "Analyze"}>
              {analyzing ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
              Analyze
            </button>
            <small>{analysisProvider === "ollama" ? (ollamaModel || "Ollama") : analysisProvider === "builtin"
              ? (builtInModel?.name || "Local model") : "GPT-6 Sol"}</small>
          </div>
          {analysisProvider === "openai" && !hasApiKey && <p className="analysis-hint"><KeyRound size={16} aria-hidden="true" />
            Add an OpenAI API key in <button type="button" onClick={onOpenSettings}>Settings</button> to run analysis.</p>}
          {analysisProvider === "ollama" && !ollamaModel && <p className="analysis-hint"><KeyRound size={16} aria-hidden="true" />
            Choose an Ollama model in <button type="button" onClick={onOpenSettings}>Settings</button> to run analysis.</p>}
          {analysisProvider === "builtin" && !builtInReady && <p className="analysis-hint"><FolderOpen size={16} aria-hidden="true" />
            Download a local model in <button type="button" onClick={onOpenSettings}>Settings</button> to run analysis.</p>}
          {analysisProvider === "builtin" && builtInReady && builtInModel?.basic && <p className="analysis-hint">
            Compact mode uses basic keyword coverage and limited overview suggestions.</p>}
          {!canAnalyze && <p className="analysis-requirements">Add a job description of at least 100 characters, your current CV overview, and a resume to analyze this role.</p>}
        </div>
        <div className="plan-section analysis-section">
          <div className="plan-section-heading"><div><h3>Resume direction</h3>
            <p>Generated suggestions are editable. Check them against the posting and your experience.</p></div></div>
          <div className="match-result" aria-busy={analyzing}><span>Resume match</span>
            {analyzing ? <MatchProgressRing label="Analyzing role" /> : <div className="match-result-value">
              <strong>{matchStrength === null ? "Not analyzed" : `${matchStrength}%`}</strong>
              {matchStrength !== null && <span className="score-track" aria-hidden="true"><span style={{ width: `${matchStrength}%` }} /></span>}
              {hasAnalysis && <button className="match-refresh" type="button" aria-label="Refresh analysis" title="Refresh analysis"
                onClick={() => void analyze()} disabled={busy || !canAnalyze}><RefreshCw size={16} aria-hidden="true" /></button>}
            </div>}
            <small>Estimated fit based on the selected resume and job posting.</small>
            {!analyzing && matchStrength !== null && <details className="match-why">
              <summary>Why</summary>
              <p>{matchNotes || "Refresh analysis to add an explanation for this saved score."}</p>
            </details>}
          </div>
          <p className="job-importance-hint">Percentages estimate importance to the job. Higher values mark bigger priorities for your CV.</p>
          <div className="analysis-grid">
            <PlanRecommendations kind="keywords" values={draft.keywords} importance={keywordImportance} busy={busy}
              onChange={(value) => update("keywords", value)} />
            <PlanRecommendations kind="themes" values={draft.themes} importance={themeImportance} busy={busy}
              onChange={(value) => update("themes", value)} />
          </div>
          <label className="field"><span>Ideal candidate CV overview</span>
            <textarea className="overview-area" value={draft.overview}
              onChange={(event) => update("overview", event.target.value)}
              placeholder="Your current overview, tailored to this role, will appear here." /></label>
          {overviewRationale && <div className="overview-rationale">
            <strong>{overviewUnchanged ? "No wording changes" : "What changed"}</strong>
            <p>{overviewRationale}</p>
          </div>}
          <p className="analysis-footnote">{analysisProvider === "builtin"
            ? `Analysis runs on this computer with ${builtInModel?.name || "the selected local model"}. Your posting, overview, and resume stay local.`
            : analysisProvider === "ollama"
            ? `Analysis sends the job posting, CV overview, and extracted resume text to ${ollamaModel || "your selected model"} on your configured Ollama server.`
            : "Analysis sends the job posting, CV overview, and selected resume to OpenAI using your API key. API usage may be billed to your account."}</p>
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
  const [ollamaUrl, setOllamaUrl] = useState(state.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(state.ollamaModel);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [findingModels, setFindingModels] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (state.analysisProvider !== "ollama" || ollamaUrl !== state.ollamaUrl) return;
    let active = true;
    void window.desktop!.listOllamaModels(state.ollamaUrl)
      .then((models) => { if (active) setInstalledModels(models); })
      .catch(() => { if (active) setInstalledModels([]); });
    return () => { active = false; };
  }, [state.analysisProvider, state.ollamaUrl, ollamaUrl]);

  async function changeProvider(value: DesktopState["analysisProvider"]) {
    setWorking(true); setError(""); setNotice("");
    try { onState(await window.desktop!.setAnalysisProvider(value)); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function findModels() {
    setFindingModels(true); setError(""); setNotice("");
    try {
      const models = await window.desktop!.listOllamaModels(ollamaUrl);
      setInstalledModels(models);
      if (!models.length) setNotice("Ollama is running, but no models are installed.");
      else setNotice(`${models.length} installed ${models.length === 1 ? "model" : "models"} found. Choose one from the dropdown.`);
    } catch (cause) { setInstalledModels([]); setError(errorText(cause)); }
    finally { setFindingModels(false); }
  }

  async function saveOllama() {
    setWorking(true); setError(""); setNotice("");
    try { onState(await window.desktop!.setOllamaConfig({ url: ollamaUrl, model: ollamaModel }));
      setNotice("Ollama server and model saved on this computer."); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  }

  async function choose(kind: "open" | "create") {
    setWorking(true); setError(""); setNotice("");
    try { const result = await window.desktop!.chooseDatabase(kind);
      if (result) { onState(result); setNotice(kind === "create" ? "New database created." : "Database opened."); }
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

  return <main className="desktop-main settings-page" aria-label="Settings">
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="settings-section" aria-labelledby="database-settings">
      <div className="settings-section-heading"><h2 id="database-settings">Database</h2>
        <p>Plans, applications, and resumes</p></div>
      <div className="settings-content">
        <div className="database-location"><span>Current file</span><strong>{state.filename || "No database selected"}</strong>
          {state.filePath && <code title={state.filePath}>{state.filePath}</code>}</div>
        {state.dirty && <p className="sync-warning">The latest changes are still on this computer. Retry the save before switching devices.</p>}
        <div className="settings-actions"><button className="button button-secondary" type="button" onClick={() => void choose("open")} disabled={working}>
          <FolderOpen size={17} aria-hidden="true" /> Open database</button>
          <button className="button button-secondary" type="button" onClick={() => void choose("create")} disabled={working}>
          <Plus size={17} aria-hidden="true" /> Create new database</button>
          {state.dirty && <button className="button button-primary" type="button" onClick={() => void retry()} disabled={working}>
            <RotateCw size={16} aria-hidden="true" /> Retry save</button>}
        </div>
        <p className="settings-help">Open an existing file or create an empty database.</p>
      </div>
    </section>
    <section className="settings-section" aria-labelledby="ai-settings">
      <div className="settings-section-heading"><h2 id="ai-settings">Analysis</h2>
        <p>For Plan and resume match</p></div>
      <div className="settings-content">
        <label className="field provider-field"><span>Provider</span>
          <select value={state.analysisProvider} disabled={working}
            onChange={(event) => void changeProvider(event.target.value as DesktopState["analysisProvider"])}>
            <option value="ollama">Ollama, local model</option>
            <option value="openai">OpenAI, GPT-6 Sol</option>
            <option value="builtin">Built-in local, downloadable models</option>
          </select></label>
        {state.analysisProvider === "ollama" ? <>
          <label className="field"><span>Server URL</span><input type="url" value={ollamaUrl}
            onChange={(event) => { setOllamaUrl(event.target.value); setInstalledModels([]); }}
            placeholder="http://localhost:11434" spellCheck={false} /></label>
          <div className="ollama-model-row"><label className="field"><span>Model</span>
            <select aria-label="Model" value={installedModels.includes(ollamaModel) ? ollamaModel : "custom"}
              onChange={(event) => setOllamaModel(event.target.value === "custom" ? "" : event.target.value)}>
              {installedModels.map((model) => <option key={model} value={model}>{model}</option>)}
              <option value="custom">Enter another model name</option>
            </select></label>
            <button className="button button-secondary" type="button" onClick={() => void findModels()} disabled={working || findingModels}>
              <RotateCw size={16} aria-hidden="true" /> {findingModels ? "Finding..." : "Refresh models"}</button></div>
          {!installedModels.includes(ollamaModel) && <label className="field custom-model-field"><span>Model name</span>
            <input value={ollamaModel} onChange={(event) => setOllamaModel(event.target.value)}
              placeholder="qwen3:8b" spellCheck={false} /></label>}
          <div className="settings-actions"><button className="button button-primary" type="button"
            onClick={() => void saveOllama()} disabled={working || findingModels || !ollamaModel.trim()}>
            <Check size={17} aria-hidden="true" /> Save Ollama settings</button></div>
          <p className="settings-help">Choose an installed model, then save. Plan analysis sends job text, your overview, and extracted resume text to that Ollama server.</p>
        </> : state.analysisProvider === "builtin" ? <LocalModelsSettings state={state} onState={onState} /> : <>
        <p className="key-status">{state.hasApiKey ? "API key saved on this computer" : "No API key saved"}</p>
        <label className="field key-field"><span>{state.hasApiKey ? "Replace API key" : "API key"}</span>
          <input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)}
            placeholder="sk-..." autoComplete="off" spellCheck={false} /></label>
        {!state.canSaveApiKey && <p className="settings-help">Secure storage is unavailable. The key will work until you close the app.</p>}
        <div className="settings-actions"><button className="button button-primary" type="button" disabled={working || !keyInput.trim()}
          onClick={() => void saveKey(keyInput)}><Check size={17} aria-hidden="true" /> Save API key</button>
          {state.hasApiKey && <button className="button button-secondary" type="button" disabled={working}
            onClick={() => void saveKey("")}>Remove key</button>}</div>
        <p className="settings-help">The key stays on this computer. Analysis sends job text, your CV overview, and the selected resume to OpenAI. GPT-6 Sol usage may incur API charges.</p>
        </>}
      </div>
    </section>
    <section className="settings-section" aria-labelledby="appearance-settings">
      <div className="settings-section-heading"><h2 id="appearance-settings">Appearance</h2>
        <p>Choose how the app looks</p></div>
      <div className="settings-content"><div className="appearance-options" role="radiogroup" aria-label="Appearance">
        {([ ["auto", "Auto", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon] ] as const).map(([value, label, Icon]) =>
          <label key={value} className={`appearance-option ${state.appearance === value ? "selected" : ""}`}>
            <input type="radio" name="appearance" value={value} checked={state.appearance === value}
              onChange={() => void changeAppearance(value)} disabled={working} />
            <Icon size={17} aria-hidden="true" /><span>{label}</span>
          </label>)}</div>
        <p className="settings-help">Auto follows your system setting.</p>
      </div>
    </section>
    <section className="settings-section" aria-labelledby="logs-settings">
      <div className="settings-section-heading"><h2 id="logs-settings">Logs</h2>
        <p>For troubleshooting</p></div>
      <div className="settings-content">
        <p className="settings-help">Errors are saved automatically on this computer.</p>
        <div className="settings-links">
          <button className="settings-link" type="button" onClick={() => void openLogs()} disabled={working}>
            Open logs folder <ArrowUpRight size={15} aria-hidden="true" /></button>
          <a className="settings-link" href="https://github.com/desigrit/zebby-the-scout/issues/new" target="_blank" rel="noopener noreferrer">
            Report an issue <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
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
  const [state, setState] = useState<DesktopState | null>(null);
  const appearance = state?.appearance;
  const [tab, setTab] = useState<Tab>("plan");
  const [dirtyPlan, setDirtyPlan] = useState(false);
  const [databaseVersion, setDatabaseVersion] = useState(0);
  const [sidebarSaving, setSidebarSaving] = useState(false);
  const [shellError, setShellError] = useState("");
  const navigate = useCallback((target: Tab) => {
    if (target !== "plan" && dirtyPlan && !window.confirm("Discard unsaved changes to this plan?")) return;
    setTab(target);
  }, [dirtyPlan]);

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
    return () => { removeChanged(); removeNavigate(); removeModelsChanged(); };
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
  return <div className={`desktop-shell ${state.platform === "darwin" ? "platform-mac" : "platform-windows"}${state.sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
    <header className="desktop-titlebar" aria-label="Window title bar">
      <div className="titlebar-sidebar" aria-hidden="true" />
      <div className="titlebar-caption">Zebby</div>
    </header>
    <aside className="desktop-sidebar">
      <div className="sidebar-brand"><button className="sidebar-toggle" type="button" onClick={() => void toggleSidebar()}
        disabled={sidebarSaving} aria-expanded={!state.sidebarCollapsed} aria-controls="desktop-navigation"
        aria-label={state.sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        title={state.sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>
        <img className="brand-mark" src="./icon.png" alt="" /></button></div>
      <nav id="desktop-navigation" className="sidebar-nav" aria-label="Workspace">
        <button type="button" className={tab === "plan" ? "active" : ""} onClick={() => navigate("plan")}
          aria-label="Plan" title={state.sidebarCollapsed ? "Plan" : undefined}
          aria-current={tab === "plan" ? "page" : undefined}><ClipboardList size={19} aria-hidden="true" /><span className="nav-label">Plan</span></button>
        <button type="button" className={tab === "applications" ? "active" : ""} onClick={() => navigate("applications")}
          aria-label="Applications" title={state.sidebarCollapsed ? "Applications" : undefined}
          aria-current={tab === "applications" ? "page" : undefined}><BriefcaseBusiness size={19} aria-hidden="true" /><span className="nav-label">Applications</span></button>
        <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => navigate("settings")}
          aria-label="Settings" title={state.sidebarCollapsed ? "Settings" : undefined}
          aria-current={tab === "settings" ? "page" : undefined}><Settings2 size={19} aria-hidden="true" /><span className="nav-label">Settings</span></button>
      </nav>
      {state.filePath && !state.sidebarCollapsed && <div className="sidebar-database" title={state.filePath}>
        <span>Current database</span><strong>{state.filename}</strong>
        {state.dirty && <small>Save pending</small>}
      </div>}
    </aside>
    <div className="desktop-workspace">
      {shellError && <div className="workspace-warning" role="alert">{shellError}</div>}
      {state.startupError && <div className="workspace-warning" role="alert">
        <span>The previous database is unavailable. This workspace is stored locally.</span>
        <button type="button" onClick={() => navigate("settings")}>Open Settings</button>
      </div>}
      {!state.filePath ? (tab === "settings" ? <SettingsView state={state} onState={setState} /> : <Welcome state={state} onState={setState} />)
      : tab === "plan" ? <PlanView key={databaseVersion} hasApiKey={state.hasApiKey}
        analysisProvider={state.analysisProvider} ollamaModel={state.ollamaModel}
        builtInModelId={state.builtInModelId} builtInReady={Boolean(state.localModels?.some((model) =>
          model.id === state.builtInModelId && model.status === "ready") &&
          (!LOCAL_MODELS.find((model) => model.id === state.builtInModelId)?.license ||
            state.acceptedModelTerms?.includes(state.builtInModelId)))}
        onOpenSettings={() => navigate("settings")} onDirtyChange={setDirtyPlan} />
      : tab === "applications" ? <ApplicationDashboard key={databaseVersion} embedded />
      : <SettingsView state={state} onState={setState} />}</div>
  </div>;
}

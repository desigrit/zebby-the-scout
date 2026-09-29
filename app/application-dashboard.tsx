"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  FileText,
  Globe,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationInput,
  type ApplicationStatus,
  type Resume,
} from "../lib/application-types";
import type { JobDetails } from "../lib/job-details";

type FormState = Omit<ApplicationInput, "matchStrength"> & { matchStrength: string };
type BrowserTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
type BrowserModelContext = {
  registerTool: (tool: BrowserTool, options: { signal: AbortSignal }) => void | Promise<void>;
};

function assertNoArguments(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
    throw new Error("This tool does not accept input.");
  }
}

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function emptyForm(): FormState {
  return {
    company: "",
    title: "",
    team: "",
    locations: "",
    listingUrl: "",
    jobDescription: "",
    snapshotText: "",
    snapshotSource: "",
    appliedDate: localToday(),
    matchStrength: "",
    resumeId: "",
    status: "Applied",
  };
}

function formatDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value + "T12:00:00"));
}

function applicationInput(item: Application, status = item.status): ApplicationInput {
  return {
    company: item.company,
    title: item.title,
    team: item.team,
    locations: item.locations,
    listingUrl: item.listingUrl,
    jobDescription: item.jobDescription,
    snapshotText: item.snapshotText,
    snapshotSource: item.snapshotSource,
    appliedDate: item.appliedDate,
    matchStrength: item.matchStrength,
    resumeId: item.resumeId,
    status,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function matchTone(score: number) {
  if (score >= 75) return "strong";
  if (score >= 50) return "moderate";
  return "low";
}

export default function ApplicationDashboard({ embedded = false }: { embedded?: boolean }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [viewingSnapshot, setViewingSnapshot] = useState<Application | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const listingInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lookupControllerRef = useRef<AbortController | null>(null);
  const lastLookupUrlRef = useRef("");
  const lastAutofillRef = useRef<Partial<JobDetails>>({});
  const appliedDateTouchedRef = useRef(false);
  const snapshotDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = snapshotDialogRef.current;
    if (!dialog) return;
    if (viewingSnapshot && !dialog.open) dialog.showModal();
    if (!viewingSnapshot && dialog.open) dialog.close();
  }, [viewingSnapshot]);

  const revealForm = useCallback(() => {
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      listingInputRef.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const openNewForm = useCallback(() => {
    lastTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setEditingId(null);
    setForm(emptyForm());
    lookupControllerRef.current?.abort();
    lastLookupUrlRef.current = "";
    lastAutofillRef.current = {};
    appliedDateTouchedRef.current = false;
    setLookupMessage("");
    setLookingUp(false);
    setResumeFile(null);
    setActionError("");
    setFormOpen(true);
    revealForm();
  }, [revealForm]);

  useLayoutEffect(() => {
    if (formOpen || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    const target = lastTriggerRef.current;
    if (target?.isConnected && target !== document.body) target.focus();
    else addButtonRef.current?.focus();
  }, [formOpen, applications]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [applicationData, resumeData] = await Promise.all([
        fetch("/api/applications", { cache: "no-store" }).then((response) =>
          readJson<{ applications: Application[] }>(response),
        ),
        fetch("/api/resumes", { cache: "no-store" }).then((response) =>
          readJson<{ resumes: Resume[] }>(response),
        ),
      ]);
      setApplications(applicationData.applications);
      setResumes(resumeData.resumes);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: BrowserModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.all([
        Promise.resolve(context.registerTool({
          name: "list_pm_applications",
          title: "List PM applications",
          description: "Read the saved PM applications, including their status and match score.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input) => {
            assertNoArguments(input);
            return applications.map((item) => ({
              id: item.id,
              company: item.company,
              title: item.title,
              team: item.team,
              locations: item.locations,
              listingUrl: item.listingUrl,
              appliedDate: item.appliedDate,
              matchStrength: item.matchStrength,
              resumeName: item.resumeName,
              status: item.status,
            }));
          },
        }, { signal: lifecycle.signal })),
        Promise.resolve(context.registerTool({
          name: "start_pm_application_entry",
          title: "Start an application entry",
          description: "Open the application form so the user can record a role and choose or upload a resume.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async (input) => {
            assertNoArguments(input);
            openNewForm();
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            return { formOpen: true };
          },
        }, { signal: lifecycle.signal })),
      ]).catch((error) => console.warn("Browser tools could not be registered", error));
    } catch (error) {
      console.warn("Browser tools could not be registered", error);
    }
    return () => lifecycle.abort();
  }, [applications, openNewForm]);

  const stats = useMemo(() => {
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const total = applications.length;
    return {
      total,
      thisWeek: applications.filter(
        (item) => Boolean(item.appliedDate) && new Date(item.appliedDate + "T12:00:00") >= weekStart,
      ).length,
      inConversation: applications.filter(
        (item) => item.status === "Heard back" || item.status === "Interview scheduled",
      ).length,
      interviews: applications.filter((item) => item.status === "Interview scheduled").length,
      averageMatch: (() => {
        const scored = applications.filter((item) => item.matchStrength !== null);
        return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.matchStrength!, 0) / scored.length) : null;
      })(),
    };
  }, [applications]);

  const visibleApplications = useMemo(() => {
    const term = query.trim().toLowerCase();
    return applications.filter((item) => {
      const matchesStatus = statusFilter === "All statuses" || item.status === statusFilter;
      const matchesQuery =
        !term ||
        [item.company, item.title, item.team, item.locations, item.resumeName].some((value) =>
          value.toLowerCase().includes(term),
        );
      return matchesStatus && matchesQuery;
    });
  }, [applications, query, statusFilter]);

  function restoreFocus() {
    shouldRestoreFocusRef.current = true;
  }

  const lookupJobDetails = useCallback(async (url: string, force = false) => {
    const listingUrl = url.trim();
    if (!force && lastLookupUrlRef.current === listingUrl) return;
    lastLookupUrlRef.current = listingUrl;
    lookupControllerRef.current?.abort();
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    setLookingUp(true);
    setLookupMessage("Reading the job listing...");
    try {
      const response = await fetch(embedded ? "/api/job-posting" : "/api/job-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: listingUrl }),
        signal: controller.signal,
      });
      const { details, text: capturedText } = await readJson<{ details: JobDetails; text?: string }>(response);
      const text = capturedText || "";
      if (controller.signal.aborted) return;
      setForm((current) => {
        if (current.listingUrl.trim() !== listingUrl) return current;
        const next = { ...current };
        for (const key of ["company", "title", "team", "locations"] as const) {
          if (details[key] && (force || !current[key].trim())) {
            next[key] = details[key];
            lastAutofillRef.current[key] = details[key];
          }
        }
        if (text) {
          next.snapshotText = text;
          next.snapshotSource = "page";
          if (!current.jobDescription.trim()) next.jobDescription = text;
        }
        return next;
      });
      const fields = [
        details.company && "company", details.title && "job title",
        details.team && "team", details.locations && "locations",
      ].filter(Boolean);
      setLookupMessage(!embedded
        ? fields.length ? `Found ${fields.join(", ")}. Check the details before saving.` : "No listing details were available. Fill the fields manually."
        : text
        ? `Saved a copy of the listing text for offline reference.${fields.length ? ` Found ${fields.join(", ")}.` : ""}`
        : fields.length ? `Found ${fields.join(", ")}, but no job text. Paste it below to keep a copy.`
          : "The site did not share listing details. Paste the description below to keep a copy.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setLookupMessage(error instanceof Error ? error.message : "Could not read this listing. Fill the fields manually.");
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setLookingUp(false);
      }
    }
  }, [embedded]);

  useEffect(() => {
    if (!formOpen || editingId || !/^https:\/\//i.test(form.listingUrl.trim())) return;
    const timer = window.setTimeout(() => void lookupJobDetails(form.listingUrl), 600);
    return () => window.clearTimeout(timer);
  }, [formOpen, editingId, form.listingUrl, lookupJobDetails]);

  function updateListingUrl(value: string) {
    lookupControllerRef.current?.abort();
    lastLookupUrlRef.current = "";
    const previousAutofill = lastAutofillRef.current;
    lastAutofillRef.current = {};
    setLookingUp(false);
    setLookupMessage("");
    setForm((current) => {
      const next = {
        ...current,
        listingUrl: value,
        snapshotText: "",
        snapshotSource: "" as const,
        jobDescription: current.jobDescription === current.snapshotText ? "" : current.jobDescription,
        appliedDate: !editingId && !appliedDateTouchedRef.current ? localToday() : current.appliedDate,
      };
      for (const key of ["company", "title", "team", "locations"] as const) {
        if (previousAutofill[key] && current[key] === previousAutofill[key]) {
          next[key] = "";
        }
      }
      return next;
    });
  }

  function openEditForm(item: Application) {
    lastTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setEditingId(item.id);
    setForm({ ...applicationInput(item), matchStrength: item.matchStrength === null ? "" : String(item.matchStrength) });
    lookupControllerRef.current?.abort();
    lastLookupUrlRef.current = "";
    lastAutofillRef.current = {};
    appliedDateTouchedRef.current = true;
    setLookupMessage("");
    setLookingUp(false);
    setResumeFile(null);
    setActionError("");
    setFormOpen(true);
    revealForm();
  }

  function closeForm() {
    if (saving) return;
    lookupControllerRef.current?.abort();
    setFormOpen(false);
    setEditingId(null);
    setResumeFile(null);
    setActionError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    restoreFocus();
  }

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const matchStrength = form.matchStrength.trim() === "" ? null : Number(form.matchStrength);
    if (matchStrength !== null && (!Number.isInteger(matchStrength) || matchStrength < 0 || matchStrength > 100)) {
      setActionError("Enter a match score from 0 to 100.");
      return;
    }

    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      let resumeId = form.resumeId;
      if (resumeFile) {
        const upload = new FormData();
        upload.append("file", resumeFile);
        const uploaded = await readJson<{ resume: Resume }>(
          await fetch("/api/resumes", { method: "POST", body: upload }),
        );
        resumeId = uploaded.resume.id;
        setResumes((current) => [uploaded.resume, ...current]);
        setForm((current) => ({ ...current, resumeId }));
        setResumeFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }

      const payload: ApplicationInput = {
        company: form.company.trim(),
        title: form.title.trim(),
        team: form.team.trim(),
        locations: form.locations.trim(),
        listingUrl: form.listingUrl.trim(),
        jobDescription: form.jobDescription.trim(),
        snapshotText: form.snapshotText.trim(),
        snapshotSource: form.snapshotSource,
        appliedDate: form.appliedDate,
        matchStrength,
        resumeId,
        status: form.status,
      };
      const response = await fetch(
        editingId ? "/api/applications/" + encodeURIComponent(editingId) : "/api/applications",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const saved = await readJson<{ application: Application }>(response);
      setApplications((current) =>
        [saved.application, ...current.filter((item) => item.id !== saved.application.id)].sort(
          (a, b) =>
            b.appliedDate.localeCompare(a.appliedDate) ||
            b.createdAt.localeCompare(a.createdAt),
        ),
      );
      setFormOpen(false);
      lookupControllerRef.current?.abort();
      setEditingId(null);
      setNotice(editingId ? "Application updated." : "Application added.");
      restoreFocus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Application could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: Application, status: ApplicationStatus) {
    setSavingStatusId(item.id);
    setActionError("");
    try {
      const response = await fetch("/api/applications/" + encodeURIComponent(item.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applicationInput(item, status)),
      });
      const saved = await readJson<{ application: Application }>(response);
      setApplications((current) =>
        current.map((existing) => (existing.id === item.id ? saved.application : existing)),
      );
      setNotice("Status updated.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Status could not be updated.");
    } finally {
      setSavingStatusId(null);
    }
  }

  async function analyzeMatch(item: Application) {
    setAnalyzingId(item.id);
    setActionError(""); setNotice("");
    try {
      const { application } = await readJson<{ application: Application }>(
        await fetch(`/api/applications/${encodeURIComponent(item.id)}/analyze`, { method: "POST" }),
      );
      setApplications((current) => current.map((existing) => existing.id === item.id ? application : existing));
      setNotice(`Match analysis saved for ${application.title || application.company || "this application"}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Match analysis could not be completed.");
    } finally { setAnalyzingId(null); }
  }

  async function deleteApplication(item: Application) {
    setDeletingId(item.id);
    setActionError("");
    try {
      const response = await fetch("/api/applications/" + encodeURIComponent(item.id), {
        method: "DELETE",
      });
      if (!response.ok) await readJson(response);
      setApplications((current) => current.filter((existing) => existing.id !== item.id));
      setConfirmingDeleteId(null);
      setNotice("Application deleted.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Application could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={embedded ? "desktop-dashboard" : "site-shell"}>
      {!embedded && <header className="topbar">
        <div className="brand" aria-label="PM Application Tracker">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>PM Application Tracker</span>
        </div>
        <div className="account-note">
          <Globe size={15} aria-hidden="true" />
          <span>Open workspace</span>
        </div>
      </header>}

      <main className="main-content">
        <div className="page-heading">
          <div>
            <h1>Applications</h1>
            <p>Track each role, resume, and hiring update in one place.</p>
          </div>
          <button ref={addButtonRef} className="button button-primary" type="button" onClick={openNewForm}>
            <Plus size={18} aria-hidden="true" />
            Add application
          </button>
        </div>

        <section className="stats-band" aria-label="Application statistics">
          <div className="stat-item"><span>Applications</span><strong>{stats.total}</strong></div>
          <div className="stat-item"><span>This week</span><strong>{stats.thisWeek}</strong></div>
          <div className="stat-item"><span>In conversation</span><strong>{stats.inConversation}</strong></div>
          <div className="stat-item"><span>Interviews</span><strong>{stats.interviews}</strong></div>
          <div className="stat-item"><span>Average match</span><strong>{stats.averageMatch === null ? "No score" : `${stats.averageMatch}%`}</strong></div>
        </section>

        {formOpen && (
          <section className="editor" ref={formRef} aria-labelledby="form-title">
            <div className="editor-head">
              <div>
                <h2 id="form-title">{editingId ? "Edit application" : "Add an application"}</h2>
                <p>Leave any detail blank. Start with a link if you have one.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close form" onClick={closeForm}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={saveApplication}>
              <div className="form-grid">
                <div className="field field-wide listing-field">
                  <label htmlFor="listing-url">Job listing link</label>
                  <div className="listing-input-row">
                    <input
                      id="listing-url"
                      ref={listingInputRef}
                      type="url"
                      value={form.listingUrl}
                      onChange={(event) => updateListingUrl(event.target.value)}
                      placeholder="https://..."
                      maxLength={2000}
                      aria-describedby="listing-help"
                    />
                    <button className="button button-secondary" type="button" onClick={() => void lookupJobDetails(form.listingUrl, true)} disabled={!form.listingUrl.trim() || lookingUp}>
                      {lookingUp ? "Reading..." : "Fill from link"}
                    </button>
                  </div>
                  <small id="listing-help">{embedded
                    ? "A public link can fill available details and save a text copy for offline use. You can leave it blank."
                    : "A public link can fill available details. You can leave it blank."}</small>
                  {lookupMessage && <p className="lookup-message" role="status">{lookupMessage}</p>}
                </div>
                <label className="field">
                  <span>Company</span>
                  <input value={form.company} onChange={(event) => updateField("company", event.target.value)} placeholder="Company name" maxLength={120} />
                </label>
                <label className="field">
                  <span>Job title</span>
                  <input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Senior Product Manager" maxLength={160} />
                </label>
                <label className="field">
                  <span>Team</span>
                  <input value={form.team} onChange={(event) => updateField("team", event.target.value)} placeholder="Product Growth" maxLength={160} />
                </label>
                <label className="field">
                  <span>Location(s)</span>
                  <input value={form.locations} onChange={(event) => updateField("locations", event.target.value)} placeholder="New York, NY; Remote" maxLength={500} />
                </label>
                <label className="field">
                  <span>Date applied</span>
                  <input type="date" value={form.appliedDate} onChange={(event) => { appliedDateTouchedRef.current = true; updateField("appliedDate", event.target.value); }} />
                  <small>Set to today. Change it if you applied on another date.</small>
                </label>
                <label className="field">
                  <span>Match strength</span>
                  <span className="input-suffix">
                    <input type="number" min="0" max="100" step="1" value={form.matchStrength} onChange={(event) => updateField("matchStrength", event.target.value)} placeholder="Score later" />
                    <span>%</span>
                  </span>
                  <small>Leave blank to analyze it after saving.</small>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => updateField("status", event.target.value as ApplicationStatus)}>
                    {APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <div className="field resume-field">
                  <label htmlFor="saved-resume">Resume used</label>
                  <select id="saved-resume" value={form.resumeId} onChange={(event) => updateField("resumeId", event.target.value)} disabled={resumes.length === 0}>
                    <option value="">No resume selected</option>
                    {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.filename}</option>)}
                  </select>
                  <button className="upload-control" type="button" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={17} aria-hidden="true" />
                    <span>{resumeFile ? resumeFile.name : "Upload a new resume"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    id="new-resume"
                    className="visually-hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
                  />
                  <small>Optional. PDF, DOCX, or DOC, up to 10 MB. A new upload is saved for later use.</small>
                </div>
                <label className="field field-wide">
                  <span>Job description</span>
                  <textarea className="application-description" value={form.jobDescription}
                    onChange={(event) => updateField("jobDescription", event.target.value)}
                    placeholder="Paste the posting here if you want to analyze your resume match later. A saved Plan for the same link can supply it too."
                    maxLength={80000} />
                  <small>{embedded
                    ? "Used for resume match analysis with your selected provider. If a site blocks access, paste its text here to save a copy."
                    : "Used for resume match analysis. If a site blocks access, paste its description here."}</small>
                </label>
                {form.snapshotText && <details className="snapshot-panel field-wide"><summary>Saved listing copy <span>{form.snapshotSource === "page" ? "Captured from link" : "Saved from description"}</span></summary>
                  <p>This copy stays in the database when you edit the job description.</p><pre>{form.snapshotText}</pre></details>}
                {editingId && applications.find((item) => item.id === editingId)?.matchNotes &&
                  <div className="field-wide match-explanation"><strong>Match analysis</strong>
                    <p>{applications.find((item) => item.id === editingId)?.matchNotes}</p></div>}
              </div>
              {actionError && <p className="form-error" role="alert">{actionError}</p>}
              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={saving}>
                  <Check size={17} aria-hidden="true" />
                  {saving ? "Saving..." : editingId ? "Save changes" : "Save application"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="applications-section" aria-labelledby="applications-title">
          <div className="section-toolbar">
            <div>
              <h2 id="applications-title">Your roles</h2>
              <p>{loading ? "Loading applications..." : applications.length + (applications.length === 1 ? " application" : " applications")}</p>
            </div>
            <div className="filters">
              <label className="search-field">
                <Search size={17} aria-hidden="true" />
                <span className="visually-hidden">Search applications</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles or companies" />
              </label>
              <label className="filter-field">
                <span className="visually-hidden">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option>All statuses</option>
                  {APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
            </div>
          </div>

          {notice && <p className="notice" role="status">{notice}</p>}
          {!formOpen && actionError && <p className="form-error" role="alert">{actionError}</p>}
          {loadError && (
            <div className="state-panel" role="alert">
              <p>{loadError}</p>
              <button className="button button-secondary" type="button" onClick={() => void loadData()}>Try again</button>
            </div>
          )}
          {!loadError && loading && <div className="state-panel"><p>Loading your applications...</p></div>}
          {!loadError && !loading && applications.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon"><BriefcaseBusiness size={28} aria-hidden="true" /></span>
              <h3>No applications yet</h3>
              <p>Add your first role to start tracking progress and match strength.</p>
              <button className="button button-primary" type="button" onClick={openNewForm}>
                <Plus size={17} aria-hidden="true" /> Add first application
              </button>
            </div>
          )}
          {!loadError && !loading && applications.length > 0 && visibleApplications.length === 0 && (
            <div className="state-panel"><p>No applications match your search or filter.</p></div>
          )}
          {!loadError && !loading && visibleApplications.length > 0 && (
            <div className="table-wrap">
              <table className="applications-table">
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    <th scope="col">Applied</th>
                    <th scope="col">Match</th>
                    <th scope="col">Resume</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleApplications.map((item) => (
                    <tr key={item.id}>
                      <td className="role-cell">
                        <strong>{item.title || "Untitled role"}</strong>
                        <span>{item.company || "Company not set"}</span>
                        {item.team && <span className="role-context">Team: {item.team}</span>}
                        {item.locations && <span className="role-context">Location(s): {item.locations}</span>}
                        {item.listingUrl && <a href={item.listingUrl} target="_blank" rel="noopener noreferrer">
                          View listing <ArrowUpRight size={13} aria-hidden="true" />
                        </a>}
                        {item.snapshotText && <button className="snapshot-link" type="button" onClick={() => setViewingSnapshot(item)}>
                          <FileText size={13} aria-hidden="true" /> Saved copy</button>}
                      </td>
                      <td><span className="mobile-label">Applied</span>{formatDate(item.appliedDate)}</td>
                      <td>
                        <span className="mobile-label">Match</span>
                        {item.matchStrength === null ? <span className="cell-empty">Not scored</span> :
                          <span className={"match-score " + matchTone(item.matchStrength)} title={item.matchNotes || undefined}>
                            <strong>{item.matchStrength}%</strong>
                            <span className="score-track"><span style={{ width: item.matchStrength + "%" }} /></span>
                          </span>}
                        {embedded && item.resumeId && <button className="match-action" type="button"
                          disabled={analyzingId !== null} onClick={() => void analyzeMatch(item)}>
                          <Sparkles size={13} aria-hidden="true" />
                          {analyzingId === item.id ? "Analyzing..." : item.matchAnalyzedAt ? "Analyze again" : "Analyze match"}
                        </button>}
                        {embedded && !item.resumeId && <small className="match-help">Add a resume to analyze</small>}
                      </td>
                      <td>
                        <span className="mobile-label">Resume</span>
                        {item.resumeId ? <a className="resume-link" href={"/api/resumes/" + encodeURIComponent(item.resumeId)}
                          onClick={window.desktop ? (event) => {
                            event.preventDefault();
                            void window.desktop?.downloadResume(item.resumeId).catch((error) =>
                              setActionError(error instanceof Error ? error.message : "Resume could not be saved."));
                          } : undefined}>
                          <FileText size={16} aria-hidden="true" />
                          <span>{item.resumeName}</span>
                        </a> : <span className="cell-empty">Not added</span>}
                      </td>
                      <td>
                        <span className="mobile-label">Status</span>
                        <select
                          className="status-select"
                          data-status={item.status}
                          aria-label={"Status for " + (item.title || "untitled role") + " at " + (item.company || "unknown company")}
                          value={item.status}
                          disabled={savingStatusId === item.id}
                          onChange={(event) => void updateStatus(item, event.target.value as ApplicationStatus)}
                        >
                          {APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="actions-cell">
                        {confirmingDeleteId === item.id ? (
                          <span className="delete-confirm">
                            <span>Delete this role?</span>
                            <button type="button" onClick={() => void deleteApplication(item)} disabled={deletingId === item.id}>Delete</button>
                            <button type="button" onClick={() => setConfirmingDeleteId(null)} disabled={deletingId === item.id}>Cancel</button>
                          </span>
                        ) : (
                          <span className="row-actions">
                            <button type="button" aria-label={"Edit " + item.title + " at " + item.company} onClick={() => openEditForm(item)}><Pencil size={17} aria-hidden="true" /></button>
                            <button type="button" aria-label={"Delete " + item.title + " at " + item.company} onClick={() => setConfirmingDeleteId(item.id)}><Trash2 size={17} aria-hidden="true" /></button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <dialog ref={snapshotDialogRef} className="snapshot-dialog" aria-labelledby="snapshot-title"
        onClose={() => setViewingSnapshot(null)} onCancel={() => setViewingSnapshot(null)}>
        {viewingSnapshot && <>
          <div className="snapshot-dialog-head"><div><h2 id="snapshot-title">Saved listing copy</h2>
            <p>{viewingSnapshot.title || "Untitled role"}{viewingSnapshot.company ? ` at ${viewingSnapshot.company}` : ""}</p></div>
            <button className="icon-button" type="button" aria-label="Close saved copy" onClick={() => setViewingSnapshot(null)}>
              <X size={19} aria-hidden="true" /></button></div>
          <div className="snapshot-dialog-meta">{viewingSnapshot.snapshotSource === "page" ? "Captured from listing" : "Saved from description"}
            {viewingSnapshot.snapshotCapturedAt && ` · ${formatDate(viewingSnapshot.snapshotCapturedAt.slice(0, 10))}`}</div>
          <pre>{viewingSnapshot.snapshotText}</pre>
        </>}
      </dialog>
    </div>
  );
}

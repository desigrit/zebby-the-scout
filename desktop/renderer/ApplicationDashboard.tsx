import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  FileText,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  APPLICATION_STATUSES,
  MAX_APPLICATION_NOTES_CHARS,
  type Application,
  type ApplicationInput,
  type ApplicationStatus,
  type Resume,
} from "../../lib/application-types";
import type { JobDetails } from "../../lib/job-details";
import type { Plan } from "../store";
import { parseLocations } from "../../lib/locations";
import { normalizedListingUrl } from "../../lib/listing-url";
import { pasteJobDescription } from "../../lib/job-text-paste";
import LocationEditor from "./LocationEditor";
import ResumePicker from "./ResumePicker";
import AnalysisErrorBanner from "./AnalysisErrorBanner";
import { ErrorBanner, useSavedFeedback } from "./WorkspaceFeedback";
import { useAnalysisFlow } from "./AnalysisFlow";
import { useBackgroundAnalysis } from "./BackgroundAnalysis";
import { jobRunning } from "./analysis-jobs";
import { applicationActivity } from "../../lib/application-activity";
import ApplicationActivity from "./ApplicationActivity";
import MatchProgressRing from "./MatchProgressRing";
import OfferCelebration from "./OfferCelebration";

type FormState = Omit<ApplicationInput, "matchStrength"> & { matchStrength: string };
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
    notes: "",
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
    notes: item.notes,
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

function LocationSummary({ value, expanded, disclosureId, onToggle }: {
  value: string; expanded: boolean; disclosureId: string; onToggle: () => void;
}) {
  const places = parseLocations(value);
  if (!places.length) return null;
  if (places.length === 1) return <span className="role-context" title={places[0]}>
    <span className="location-prefix">Location: </span><span className="location-caption">{places[0]}</span></span>;
  return <span className="role-context location-summary">
    <span className="location-prefix">Location: </span><span className="location-caption">Multiple</span>
    <button className="location-toggle" type="button" aria-expanded={expanded} aria-controls={disclosureId}
      aria-label={expanded ? "Hide extra locations" : `Show all ${places.length} locations`}
      title={expanded ? "Hide extra locations" : `Show all ${places.length} locations`}
      onClick={onToggle}>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
  </span>;
}

export default function ApplicationDashboard({ initialSelection }: { initialSelection?: { id: string; notice: string } | null }) {
  const analysisFlow = useAnalysisFlow();
  const savedFeedback = useSavedFeedback();
  const retryAction = useRef<() => void>(() => undefined);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [savedPlans, setSavedPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState(initialSelection?.notice || "");
  const [offerCelebration, setOfferCelebration] = useState(0);
  const finishOfferCelebration = useCallback(() => setOfferCelebration(0), []);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const { jobs, snapshot: analysisJobs } = useBackgroundAnalysis();
  const analyzingIds = new Set(analysisJobs.filter((job) => job.kind === "match" && jobRunning(job)).map((job) => job.id));
  const cancellingIds = new Set(analysisJobs.filter((job) => job.kind === "match" && (job.cancelling || job.stage === "saving")).map((job) => job.id));
  // Fresh database results already include these jobs. Keep the transfer notice
  // instead of replaying unrelated messages from earlier visits to Applications.
  const handledResults = useRef(new Set<string>(initialSelection
    ? analysisJobs.filter((job) => job.kind === "match" && !jobRunning(job)).map((job) => job.requestId) : []));
  const [selectedId, setSelectedId] = useState<string | null>(initialSelection?.id || null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const inspectorId = useId();
  const [compact, setCompact] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expandedLocationIds, setExpandedLocationIds] = useState<Set<string>>(() => new Set());
  const layoutRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<Application | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [viewingNotes, setViewingNotes] = useState<Application | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const listingInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const lookupControllerRef = useRef<AbortController | null>(null);
  const lastLookupUrlRef = useRef("");
  const lastAutofillRef = useRef<Partial<JobDetails>>({});
  const appliedDateTouchedRef = useRef(false);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const notesDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (loading) return;
    let active = true;
    const receive = () => { if (!active) return;
    for (const job of jobs.snapshot()) {
      if (job.kind !== "match" || jobRunning(job) || handledResults.current.has(job.requestId)) continue;
      handledResults.current.add(job.requestId);
      const application = job.result?.application;
      if (application) setApplications((current) => current.map((item) => item.id === application.id &&
        item.updatedAt <= application.updatedAt ? application : item));
      setNotice("");
      if (job.status === "succeeded") savedFeedback();
      if (job.error) retryAction.current = () => {
        setActionError("");
        void jobs.start({ kind: "match", id: job.id }, { prepare: (signal) => analysisFlow.prepare({ kind: "match", id: job.id }, signal) });
      };
      setActionError(job.error ? job.automatic ? `Application saved, but match analysis needs attention: ${job.error}` : job.error : "");
    } };
    const unsubscribe = jobs.subscribe(receive);
    queueMicrotask(receive);
    return () => { active = false; unsubscribe(); };
  }, [jobs, loading, savedFeedback, analysisFlow]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (confirmingDelete && dialog && !dialog.open) dialog.showModal();
    if (!confirmingDelete && dialog?.open) dialog.close();
  }, [confirmingDelete]);

  useEffect(() => {
    const dialog = notesDialogRef.current;
    if (viewingNotes && dialog && !dialog.open) dialog.showModal();
    if (!viewingNotes && dialog?.open) dialog.close();
  }, [viewingNotes]);

  const revealForm = useCallback(() => {
    window.setTimeout(() => {
      const form = formRef.current, workspace = form?.closest<HTMLElement>(".desktop-workspace");
      if (form && workspace) workspace.scrollTo({
        top: workspace.scrollTop + form.getBoundingClientRect().top - workspace.getBoundingClientRect().top - 20,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
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
      const [applicationData, resumeData, planData] = await Promise.all([
        fetch("/api/applications", { cache: "no-store" }).then((response) =>
          readJson<{ applications: Application[] }>(response),
        ),
        fetch("/api/resumes", { cache: "no-store" }).then((response) =>
          readJson<{ resumes: Resume[] }>(response),
        ),
        fetch("/api/plans", { cache: "no-store" }).then((response) =>
          readJson<{ plans: Plan[] }>(response)).catch(() => ({ plans: [] })),
      ]);
      setApplications(applicationData.applications);
      setResumes(resumeData.resumes);
      setSavedPlans(planData.plans);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useLayoutEffect(() => {
    const element = layoutRef.current;
    if (!element) return;
    const resize = () => setCompact(element.clientWidth < 940);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, formOpen, applications.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (loading || !initialSelection) return;
    const row = layoutRef.current?.querySelector<HTMLButtonElement>(".application-row.selected .application-row-select");
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  }, [loading, initialSelection]);

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
        (item) => item.status === "Heard back" || item.status === "Interview scheduled" || item.status === "Offer received",
      ).length,
      interviews: applications.filter((item) => item.status === "Interview scheduled").length,
      averageMatch: (() => {
        const scored = applications.filter((item) => item.matchStrength !== null);
        return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.matchStrength!, 0) / scored.length) : null;
      })(),
    };
  }, [applications]);

  const activity = useMemo(() => applicationActivity(applications, localToday()), [applications]);

  const visibleApplications = useMemo(() => {
    const term = query.trim().toLowerCase();
    return applications.filter((item) => {
      const matchesStatus = statusFilter === "All statuses" || item.status === statusFilter;
      const matchesCompany = !companyFilter || item.company.toLowerCase() === companyFilter.toLowerCase();
      const matchesQuery =
        !term ||
        [item.company, item.title, item.team, item.locations, item.resumeName].some((value) =>
          value.toLowerCase().includes(term),
        );
      return matchesStatus && matchesCompany && matchesQuery;
    });
  }, [applications, query, companyFilter, statusFilter]);
  const selected = visibleApplications.find((item) => item.id === selectedId) || visibleApplications[0] || null;

  const companyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of applications) if (item.company.trim()) {
      const existing = [...counts.keys()].find((name) => name.toLowerCase() === item.company.trim().toLowerCase());
      const name = existing || item.company.trim();
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [applications]);

  const statusCounts = useMemo(() => {
    const scope = applications.filter((item) => !companyFilter || item.company.toLowerCase() === companyFilter.toLowerCase());
    return Object.fromEntries(APPLICATION_STATUSES.map((status) =>
      [status, scope.filter((item) => item.status === status).length])) as Record<ApplicationStatus, number>;
  }, [applications, companyFilter]);

  const duplicateApplication = useMemo(() => {
    if (!form.listingUrl.trim()) return null;
    const normalized = normalizedListingUrl(form.listingUrl);
    return applications.find((item) => item.id !== editingId && item.listingUrl &&
      normalizedListingUrl(item.listingUrl) === normalized) || null;
  }, [applications, editingId, form.listingUrl]);

  const matchingPlan = useMemo(() => form.listingUrl.trim() ? savedPlans.find((plan) =>
    plan.description.trim() && normalizedListingUrl(plan.listingUrl) === normalizedListingUrl(form.listingUrl)) : undefined,
  [savedPlans, form.listingUrl]);

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
      const response = await fetch("/api/job-posting", {
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
      setLookupMessage(text ? "Details added" : "Could not get the job description. Paste it below.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setLookupMessage(error instanceof Error ? error.message : "Could not read this listing. Fill the fields manually.");
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setLookingUp(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!formOpen || editingId || !/^https:\/\//i.test(form.listingUrl.trim())) return;
    const timer = window.setTimeout(() => void lookupJobDetails(form.listingUrl), 600);
    return () => window.clearTimeout(timer);
  }, [formOpen, editingId, form.listingUrl, lookupJobDetails]);

  useEffect(() => {
    if (lookupMessage !== "Details added") return;
    const timer = window.setTimeout(() => setLookupMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [lookupMessage]);

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
    if (jobRunning(jobs.get({ kind: "match", id: item.id }))) return;
    jobs.dismiss({ kind: "match", id: item.id });
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
    restoreFocus();
  }

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveApplication(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    retryAction.current = () => void saveApplication();
    if (editingId && jobRunning(jobs.get({ kind: "match", id: editingId }))) return;
    if (editingId) jobs.dismiss({ kind: "match", id: editingId });
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
          }

      const payload: ApplicationInput = {
        company: form.company.trim(),
        title: form.title.trim(),
        team: form.team.trim(),
        locations: form.locations.trim(),
        listingUrl: form.listingUrl.trim(),
        jobDescription: form.jobDescription.trim(),
        notes: form.notes,
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
      setSelectedId(saved.application.id);
      lookupControllerRef.current?.abort();
      setEditingId(null);
      if (saved.application.status === "Offer received" && applications.find((item) => item.id === editingId)?.status !== "Offer received") {
        setOfferCelebration((current) => current + 1);
        setNotice("Offer received. Congratulations!");
      } else { setNotice(""); savedFeedback(); }
      restoreFocus();
      if (saved.application.resumeId && saved.application.jobDescription.trim().length >= 80 && saved.application.matchStrength === null) {
        void analyzeMatch(saved.application, true);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Application could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: Application, status: ApplicationStatus) {
    if (jobRunning(jobs.get({ kind: "match", id: item.id })) || item.status === status) return;
    jobs.dismiss({ kind: "match", id: item.id });
    retryAction.current = () => void updateStatus(item, status);
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
      if (saved.application.status === "Offer received" && item.status !== "Offer received") {
        setOfferCelebration((current) => current + 1);
        setNotice("Offer received. Congratulations!");
      } else { setNotice(""); savedFeedback(); }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Status could not be updated.");
    } finally {
      setSavingStatusId(null);
    }
  }

  async function analyzeMatch(item: Application, automatic = false) {
    if (automatic && !analysisFlow.canAutoAnalyze()) return;
    setActionError("");
    if (!automatic) setNotice("");
    void jobs.start({ kind: "match", id: item.id }, { automatic,
      prepare: (signal) => automatic ? Promise.resolve({}) : analysisFlow.prepare({ kind: "match", id: item.id }, signal) });
  }

  async function cancelMatch(item: Application) {
    retryAction.current = () => void cancelMatch(item);
    setActionError("");
    try { await jobs.cancel({ kind: "match", id: item.id }); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not cancel analysis. Try again."); }
  }

  function openNotes(item: Application) {
    if (jobRunning(jobs.get({ kind: "match", id: item.id }))) return;
    jobs.dismiss({ kind: "match", id: item.id });
    setViewingNotes(item);
    setNotesDraft(item.notes || "");
    setNotesError("");
  }

  async function saveNotes() {
    if (!viewingNotes || jobRunning(jobs.get({ kind: "match", id: viewingNotes.id }))) return;
    setSavingNotes(true);
    setNotesError("");
    try {
      const { application } = await readJson<{ application: Application }>(await fetch(
        `/api/applications/${encodeURIComponent(viewingNotes.id)}/notes`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notesDraft }),
        }));
      setApplications((current) => current.map((item) => item.id === application.id ? application : item));
      setViewingNotes(null);
      setNotice(""); savedFeedback();
    } catch (error) { setNotesError(error instanceof Error ? error.message : "Notes could not be saved."); }
    finally { setSavingNotes(false); }
  }

  async function deleteApplication(item: Application) {
    if (jobRunning(jobs.get({ kind: "match", id: item.id }))) return;
    setDeletingId(item.id);
    setDeleteError("");
    try {
      const response = await fetch("/api/applications/" + encodeURIComponent(item.id), {
        method: "DELETE",
      });
      if (!response.ok) await readJson(response);
      jobs.dismiss({ kind: "match", id: item.id });
      setApplications((current) => current.filter((existing) => existing.id !== item.id));
      setConfirmingDelete(null);
      setNotice("Application deleted.");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Application could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  function matchControl(item: Application) {
    const running = analyzingIds.has(item.id);
    return <div className="match-control" aria-busy={running}>
      {running ? <><MatchProgressRing />
        <button className="match-refresh" type="button" onClick={() => void cancelMatch(item)}
          disabled={cancellingIds.has(item.id)} title="Cancel analysis"
          aria-label={`Cancel match analysis for ${item.title || "untitled role"} at ${item.company || "unknown company"}`}><X size={15} aria-hidden="true" /></button></>
      : <>{item.matchStrength === null ? <span className="cell-empty">Not analyzed</span> :
        <span className={"match-score " + matchTone(item.matchStrength)}>
          <strong>{item.matchStrength}%</strong><span className="score-track" aria-hidden="true"><span style={{ width: `${item.matchStrength}%` }} /></span></span>}
        {item.resumeId && item.jobDescription.trim().length >= 80 && <button className="match-refresh" type="button"
          disabled={formOpen && editingId === item.id}
          aria-label={`${item.matchStrength === null ? "Analyze" : "Refresh"} match for ${item.title || "untitled role"} at ${item.company || "unknown company"}`}
          title={item.matchStrength === null ? "Analyze match" : "Refresh match"} onClick={() => void analyzeMatch(item)}><RefreshCw size={14} aria-hidden="true" /></button>}</>}
    </div>;
  }

  function statusControl(item: Application) {
    return <select className="status-select" data-status={item.status}
      title={item.status}
      aria-label={`Status for ${item.title || "untitled role"} at ${item.company || "unknown company"}`}
      value={item.status} disabled={savingStatusId === item.id || analyzingIds.has(item.id)}
      onChange={(event) => void updateStatus(item, event.target.value as ApplicationStatus)}>
      {APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
    </select>;
  }

  async function downloadResume(item: Application) {
    retryAction.current = () => void downloadResume(item);
    setActionError("");
    try { await window.desktop!.downloadResume(item.resumeId); }
    catch { setActionError("Could not save the resume. Try again."); }
  }

  function resumeLink(item: Application) {
    return item.resumeId ? <a className="resume-link" title={`Save a copy of ${item.resumeName}`}
      aria-label={`Save a copy of ${item.resumeName}`} href={`/api/resumes/${encodeURIComponent(item.resumeId)}`}
      onClick={window.desktop ? (event) => { event.preventDefault(); void downloadResume(item); } : undefined}>
      <FileText size={16} aria-hidden="true" /><span>{item.resumeName}</span></a> : <span className="cell-empty">No resume selected</span>;
  }

  function rowActions(item: Application) {
    return <span className="row-actions">
      <button type="button" aria-label={`Notes for ${item.title} at ${item.company}`} title="Notes" disabled={analyzingIds.has(item.id)}
        onClick={() => openNotes(item)}><NotebookPen size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={`Edit ${item.title} at ${item.company}`} title="Edit" disabled={analyzingIds.has(item.id)}
        onClick={() => openEditForm(item)}><Pencil size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={`Delete ${item.title} at ${item.company}`} title="Delete" disabled={analyzingIds.has(item.id)}
        onClick={() => { setDeleteError(""); setConfirmingDelete(item); }}><Trash2 size={17} aria-hidden="true" /></button>
    </span>;
  }

  function inspector(item: Application) {
    return <>
      <div className="inspector-heading"><div><h3>{item.title || "Untitled role"}</h3><p>{item.company || "Company not set"}</p></div>
        <div className="inspector-actions">
        <button className="icon-button" type="button" aria-label={`Edit ${item.title} at ${item.company}`} title="Edit"
          disabled={analyzingIds.has(item.id)} onClick={() => openEditForm(item)}><Pencil size={17} aria-hidden="true" /></button>
        <button className="icon-button" type="button" aria-label="Close details" title="Close details"
          onClick={() => {
            setInspectorOpen(false);
            setDetailsOpen(false);
            layoutRef.current?.querySelector<HTMLButtonElement>(".application-row.selected .application-row-select")?.focus({ preventScroll: true });
          }}><X size={17} aria-hidden="true" /></button></div></div>
      <dl className="inspector-facts">
        <div><dt>Status</dt><dd>{statusControl(item)}</dd></div>
        <div><dt>Applied</dt><dd>{formatDate(item.appliedDate)}</dd></div>
        <div><dt>Match</dt><dd>{matchControl(item)}</dd></div>
      </dl>
      {item.matchStrength === null && (!item.resumeId || item.jobDescription.trim().length < 80) && <div className="match-help">
        {!item.resumeId && <button type="button" className="text-action" onClick={() => { openEditForm(item); requestAnimationFrame(() => formRef.current?.querySelector<HTMLSelectElement>(".resume-field select")?.focus()); }}>Add resume</button>}
        {item.jobDescription.trim().length < 80 && <button type="button" className="text-action" onClick={() => { openEditForm(item); requestAnimationFrame(() => descriptionInput.current?.focus()); }}>Add job description</button>}
      </div>}
      {item.matchStrength !== null && <details className="inspector-why" key={item.id}><summary>Why this score</summary>
        {item.matchNotes ? <p>{item.matchNotes}</p> : <p>Analyze again to add an explanation. <button className="text-action" type="button" disabled={analyzingIds.has(item.id) || !item.resumeId || item.jobDescription.trim().length < 80} onClick={() => void analyzeMatch(item)}>Add explanation</button></p>}</details>}
      {item.team && <section className="inspector-section"><h4>Team</h4><p>{item.team}</p></section>}
      {item.locations && <section className="inspector-section"><h4>Locations</h4>
        <div className="inspector-locations">{parseLocations(item.locations).map((place) => <span key={place}>{place}</span>)}</div></section>}
      <section className="inspector-section"><h4>Resume</h4>{resumeLink(item)}</section>
      <section className="inspector-section"><div className="inspector-section-head"><h4>Notes</h4>
        <button className="icon-button" type="button" aria-label={`Notes for ${item.title} at ${item.company}`} title="Edit notes"
          disabled={analyzingIds.has(item.id)} onClick={() => openNotes(item)}><NotebookPen size={17} aria-hidden="true" /></button></div>
        {item.notes ? <pre className="inspector-notes">{item.notes}</pre> : <p className="cell-empty">No notes yet</p>}</section>
      <div className="inspector-footer">{item.listingUrl && <a className="listing-link" href={item.listingUrl} target="_blank" rel="noopener noreferrer">
        View listing <ArrowUpRight size={13} aria-hidden="true" /></a>}
        <button className="icon-button" type="button" aria-label={`Delete ${item.title} at ${item.company}`} title="Delete"
          disabled={analyzingIds.has(item.id)} onClick={() => setConfirmingDelete(item)}><Trash2 size={17} aria-hidden="true" /></button></div>
    </>;
  }

  return (
    <div className={`desktop-dashboard${formOpen ? " form-open" : ""}`}>
      {offerCelebration > 0 && <OfferCelebration key={offerCelebration} onComplete={finishOfferCelebration} />}
      <main className="main-content" aria-label="Applications">
        <div className="workspace-toolbar">
          <button ref={addButtonRef} className="button button-primary" type="button" data-command="new" onClick={openNewForm}>
            <Plus size={18} aria-hidden="true" />
            Add application
          </button>
        </div>

        {applications.length > 0 && <div className="application-overview">
          <ApplicationActivity days={activity} />
          <section className="stats-band" aria-label="Application statistics">
          <div className="stat-item"><span>Applications</span><strong>{stats.total}</strong></div>
          <div className="stat-item"><span>This week</span><strong>{stats.thisWeek}</strong></div>
          <div className="stat-item"><span>In conversation</span><strong>{stats.inConversation}</strong></div>
          <div className="stat-item"><span>Interviews</span><strong>{stats.interviews}</strong></div>
          <div className="stat-item"><span>Average match</span><strong>{stats.averageMatch === null ? "No score" : `${stats.averageMatch}%`}</strong></div>
          </section>
        </div>}

        {formOpen && (
          <section className="editor" ref={formRef} aria-labelledby="form-title">
            <div className="editor-head">
              <div>
                <h2 id="form-title">{editingId ? "Edit application" : "Add an application"}</h2>
                <p>All fields optional</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close form" onClick={closeForm}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={saveApplication}>
              <fieldset className="form-grid" disabled={saving || Boolean(editingId && analyzingIds.has(editingId))}>
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
                    />
                    <button className="button button-secondary" type="button" onClick={() => void lookupJobDetails(form.listingUrl, true)} disabled={!form.listingUrl.trim() || lookingUp}>
                      {lookingUp ? "Reading..." : "Fill from link"}
                    </button>
                  </div>
                  {lookupMessage === "Details added" && <p className="lookup-message" role="status">Details added</p>}
                  {duplicateApplication && <div className="duplicate-warning" role="status">
                    <strong>Already added</strong>
                    <span>{duplicateApplication.title || "Untitled role"}{duplicateApplication.company ? ` at ${duplicateApplication.company}` : ""}</span>
                    <button type="button" onClick={() => openEditForm(duplicateApplication)}>Open application</button>
                  </div>}
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
                <LocationEditor value={form.locations} onChange={(value) => updateField("locations", value)} />
                <label className="field">
                  <span>Date applied</span>
                  <input type="date" value={form.appliedDate} onChange={(event) => { appliedDateTouchedRef.current = true; updateField("appliedDate", event.target.value); }} />
                </label>
                <label className="field">
                  <span>Match strength</span>
                  <span className="input-suffix">
                    <input aria-label="Match strength" type="number" min="0" max="100" step="1" value={form.matchStrength} onChange={(event) => updateField("matchStrength", event.target.value)} placeholder="Score later" />
                    <span>%</span>
                  </span>
                  <small>{analysisFlow.state.analysisProvider === "credits" ? "Analyze the match after saving, or enter a score." : analysisFlow.canAutoAnalyze() ? "Calculated after saving when a resume and job description are included." : "Set up analysis in Settings, or enter a score."}</small>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => updateField("status", event.target.value as ApplicationStatus)}>
                    {APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <ResumePicker resumes={resumes} value={form.resumeId} file={resumeFile} disabled={saving}
                  onSelect={(value) => updateField("resumeId", value)} onFile={setResumeFile} />
                <label className="field field-wide">
                  <span>Job description</span>
                  <textarea ref={descriptionInput} className="application-description" value={form.jobDescription}
                    onChange={(event) => updateField("jobDescription", event.target.value)}
                    onPaste={(event) => pasteJobDescription(event, (value) => updateField("jobDescription", value))}
                    placeholder="Paste job description"
                    maxLength={80000} />
                  {matchingPlan && !form.jobDescription.trim() && <button type="button" className="text-action"
                    onClick={() => updateField("jobDescription", matchingPlan.description)}>Use description from saved plan</button>}
                  {lookupMessage && lookupMessage !== "Details added" && !form.jobDescription.trim() && <span className="listing-feedback" role="status">{lookupMessage}
                    <button type="button" className="text-action" onClick={() => descriptionInput.current?.focus()}>Paste description</button></span>}
                </label>
                {editingId && applications.find((item) => item.id === editingId)?.matchNotes &&
                  <div className="field-wide match-explanation"><strong>Match analysis</strong>
                    <p>{applications.find((item) => item.id === editingId)?.matchNotes}</p></div>}
              </fieldset>
              <ErrorBanner message={actionError} retry={() => retryAction.current()} busy={saving || Boolean(deletingId)} />
              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
                <button className="button button-primary" type="submit" data-command="save" disabled={saving}>
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
              <h2 id="applications-title" className="visually-hidden">Your roles</h2>
              {(loading || query.trim() || companyFilter || statusFilter !== "All statuses") && <p>{loading ? "Loading applications..." : `${visibleApplications.length} of ${applications.length} applications`}</p>}
            </div>
            <div className="filters">
              <label className="search-field">
                <Search size={17} aria-hidden="true" />
                <span className="visually-hidden">Search applications</span>
                <input data-command="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles or companies" />
              </label>
              <label className="filter-field">
                <span className="visually-hidden">Filter by company</span>
                <select aria-label="Filter by company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
                  <option value="">All companies</option>
                  {companyCounts.map(([company, count]) => <option key={company} value={company}>{company} ({count})</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span className="visually-hidden">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="All statuses">All statuses</option>
                  {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{status} ({statusCounts[status]})</option>)}
                </select>
              </label>
            </div>
          </div>

          {notice && <p className="notice" role="status">{notice}</p>}
          {!formOpen && <AnalysisErrorBanner message={actionError} retry={() => retryAction.current()} busy={saving || Boolean(deletingId)} />}
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
            <div className="state-panel"><p>No matching applications</p><button className="button button-secondary" type="button" onClick={() => { setQuery(""); setCompanyFilter(""); setStatusFilter("All statuses"); }}>Clear filters</button></div>
          )}
          {!loadError && !loading && visibleApplications.length > 0 && (
            <div className={`applications-layout ${compact ? "compact" : "wide"} ${!inspectorOpen ? "inspector-closed" : ""}`} ref={layoutRef}>
              <div className="application-list" aria-label="Applications">
                {visibleApplications.map((item) => <article key={item.id}
                  className={`application-row ${selected?.id === item.id ? "selected" : ""}`}>
                  <div className="application-row-summary">
                    <div className="application-row-main">
                    <button className="application-row-select" type="button"
                      title={`${item.title || "Untitled role"} · ${item.company || "Company not set"}`}
                      aria-label={`View details for ${item.title || "untitled role"} at ${item.company || "unknown company"}`}
                      aria-expanded={selected?.id === item.id && (compact ? detailsOpen : inspectorOpen && !formOpen)}
                      aria-controls={selected?.id === item.id && (compact ? detailsOpen : inspectorOpen && !formOpen)
                        ? compact ? `application-details-${item.id}` : inspectorId : undefined}
                      onClick={() => {
                        setSelectedId(item.id);
                        if (compact) setDetailsOpen(selected?.id !== item.id || !detailsOpen);
                        else setInspectorOpen(true);
                      }}>
                      <span className="role-heading"><strong>{item.title || "Untitled role"}</strong>
                        <span className="role-company">{item.company || "Company not set"}</span>
                        {compact && <ChevronDown className="role-detail-chevron" size={15} aria-hidden="true" />}</span>
                    </button>
                    <div className="application-row-meta role-cell">
                      <LocationSummary value={item.locations} expanded={expandedLocationIds.has(item.id)}
                        disclosureId={`application-locations-${item.id}`} onToggle={() => setExpandedLocationIds((current) => {
                          const next = new Set(current);
                          if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                          return next;
                        })} />
                      {item.listingUrl && <a className="listing-link" href={item.listingUrl} target="_blank" rel="noopener noreferrer"
                        aria-label="View listing" title="View listing">
                        <span className="listing-label">View listing</span><ArrowUpRight size={13} aria-hidden="true" /></a>}
                    </div>
                    </div>
                    <div className="application-row-metrics">
                      <time className="application-applied-date" dateTime={item.appliedDate || undefined} title="Date applied">
                        <span className="visually-hidden">Applied </span>{formatDate(item.appliedDate)}
                      </time>
                      {matchControl(item)}
                    </div>
                    {statusControl(item)}
                    {rowActions(item)}</div>
                  {parseLocations(item.locations).length > 1 && <div className="application-row-locations role-cell"
                    id={`application-locations-${item.id}`} hidden={!expandedLocationIds.has(item.id)}>
                    <span className="location-expanded">{parseLocations(item.locations).map((place) =>
                      <span className="location-place" key={place}>{place}</span>)}</span>
                  </div>}
                  {compact && selected?.id === item.id && detailsOpen && <div className="application-inline-details" id={`application-details-${item.id}`}>
                    {inspector(item)}</div>}
                </article>)}
              </div>
              {!compact && selected && !formOpen && inspectorOpen && <aside className="application-inspector" id={inspectorId} aria-label="Selected role details" key={selected.id}>
                {inspector(selected)}</aside>}
            </div>
          )}
        </section>
      </main>
      <dialog ref={notesDialogRef} className="snapshot-dialog notes-dialog" aria-labelledby="notes-title"
        onClose={() => setViewingNotes(null)} onCancel={(event) => { if (savingNotes) event.preventDefault(); else setViewingNotes(null); }}>
        {viewingNotes && <>
          <div className="snapshot-dialog-head"><div><h2 id="notes-title">Notes</h2>
            <p>{viewingNotes.title || "Untitled role"}{viewingNotes.company ? ` at ${viewingNotes.company}` : ""}</p></div>
            <button className="icon-button" type="button" aria-label="Close notes" disabled={savingNotes} onClick={() => setViewingNotes(null)}><X size={19} /></button></div>
          <label className="notes-editor"><span className="visually-hidden">Notes</span>
            <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} maxLength={MAX_APPLICATION_NOTES_CHARS}
              onPaste={(event) => pasteJobDescription(event, setNotesDraft)}
              disabled={savingNotes} placeholder="Questions, contacts, interview details..." /></label>
          <ErrorBanner message={notesError} retry={() => void saveNotes()} busy={savingNotes} />
          <div className="dialog-actions"><button className="button button-secondary" type="button" disabled={savingNotes} onClick={() => setViewingNotes(null)}>Cancel</button>
            <button className="button button-primary" type="button" disabled={savingNotes} onClick={() => void saveNotes()}>{savingNotes ? "Saving..." : "Save notes"}</button></div>
        </>}
      </dialog>
      <dialog ref={deleteDialogRef} className="snapshot-dialog confirm-dialog" aria-labelledby="delete-title"
        onClose={() => setConfirmingDelete(null)} onCancel={(event) => { if (deletingId) event.preventDefault(); else setConfirmingDelete(null); }}>
        {confirmingDelete && <>
          <div className="snapshot-dialog-head"><div><h2 id="delete-title">Delete application?</h2>
            <p>{confirmingDelete.title || "Untitled role"}{confirmingDelete.company ? ` at ${confirmingDelete.company}` : ""}</p></div></div>
          <p className="confirm-copy">Delete this application and its notes?</p>
          <ErrorBanner message={deleteError} retry={() => void deleteApplication(confirmingDelete)} busy={Boolean(deletingId)} />
          <div className="dialog-actions"><button className="button button-secondary" type="button" disabled={Boolean(deletingId)} onClick={() => setConfirmingDelete(null)}>Cancel</button>
            <button className="button button-danger" type="button" disabled={Boolean(deletingId)} onClick={() => void deleteApplication(confirmingDelete)}>{deletingId ? "Deleting..." : "Delete application"}</button></div>
        </>}
      </dialog>
    </div>
  );
}

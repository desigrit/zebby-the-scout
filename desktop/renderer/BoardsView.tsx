import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, FolderOpen, LoaderCircle, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useAnalysisFlow } from "./AnalysisFlow";
import { BOARDS_MISSING_FILE, BOARD_CREDIT_MESSAGE, type Board, type BoardsState, type BoardListings, type BoardRunPreview } from "../../shared/boards";
import { defaultBoardReaderSettings } from "../../shared/board-exploration";
import { boardListingTitle } from "../../shared/board-listing-title";
import SettingsAction from "./SettingsAction";
import { ErrorBanner } from "./WorkspaceFeedback";

const initial: BoardsState = { filePath: "", filename: "", dirty: false, error: "", boards: [], progress: [] };
const message = (error: unknown) => (error instanceof Error ? error.message : "This action could not be completed. Try again.")
  .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

function useBoards() {
  const [state, setState] = useState<BoardsState>(initial), [error, setError] = useState(""), [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true, received = false;
    const remove = window.desktop!.onBoardsChanged(next => { received = true; if (active) { setState(next); setLoaded(true); } });
    void window.desktop!.boardsState().then(next => { if (active && !received) setState(next); }).catch(error => { if (active) setError(message(error)); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; remove(); };
  }, []);
  async function act(action: () => Promise<unknown>) {
    if (inFlight.current) return false;
    inFlight.current = true; setError(""); setWorking(true);
    try { await action(); return true; }
    catch (error) { setError(message(error)); return false; }
    finally { inFlight.current = false; setWorking(false); }
  }
  return { state, error, working, loaded, act };
}

function useRecoveryFocus(state: BoardsState) {
  const focusRef = useRef<HTMLDivElement>(null), wasMissing = useRef(false);
  useEffect(() => {
    if (wasMissing.current && !state.fileMissing && state.filePath) focusRef.current?.focus({ preventScroll: true });
    wasMissing.current = Boolean(state.fileMissing);
  }, [state.fileMissing, state.filePath]);
  return focusRef;
}

function BoardsFileRecovery({ controls, compact = false, onCreated }: {
  controls: ReturnType<typeof useBoards>; compact?: boolean; onCreated?: () => void;
}) {
  const { state, working, error, act } = controls, heading = useId();
  const [pending, setPending] = useState<"retry" | "create" | "save" | null>(null);
  const [retryHint, setRetryHint] = useState("");
  const location = state.expectedPath || state.filePath;
  const separator = Math.max(location?.lastIndexOf("/") ?? -1, location?.lastIndexOf("\\") ?? -1);
  const filename = location?.slice(separator + 1) || "Boards file", folder = location?.slice(0, separator);
  const busy = working || state.progress.length > 0;
  async function run(kind: "retry" | "create" | "save") {
    setPending(kind); setRetryHint("");
    try {
      await act(async () => {
        const next = await (kind === "retry" ? window.desktop!.retryBoardsSave()
          : kind === "create" ? window.desktop!.createBoardsFile() : window.desktop!.saveBoardsRecovery());
        if (kind === "retry" && next?.fileMissing) {
          setRetryHint("The file is still missing. Check its name and folder, or wait for syncing to finish, then retry.");
        }
        if (kind === "create" && next?.filePath && !next.fileMissing && !next.boards.length) onCreated?.();
      });
    } finally { setPending(null); }
  }
  return <section className={"boards-file-recovery" + (compact ? " boards-file-recovery-compact" : "")} aria-labelledby={heading}>
    <h2 id={heading}>{BOARDS_MISSING_FILE}</h2>
    <p>Move or copy the file back to the folder below, using the exact filename shown, then select Retry.</p>
    <div className="database-location boards-file-location">
      <span>Boards file</span><strong>{filename}</strong>
      <span className="boards-folder-label">Same folder as Applications</span><code title={folder}>{folder}</code>
    </div>
    <p className="boards-recovery-help">{state.dirty
      ? "Your latest changes are saved on this computer. Save a copy of your history before creating a new file."
      : state.canRecover
        ? "Creating a new file starts an empty board list and keeps a copy of your previous history in this folder."
        : "Create a new Boards file to start with an empty board list."}</p>
    <div className="settings-actions">
      <SettingsAction variant="primary" icon={RefreshCw} busy={pending === "retry"} disabled={busy}
        onClick={() => void run("retry")}>Retry</SettingsAction>
      <SettingsAction icon={Plus} busy={pending === "create"} disabled={busy || state.dirty}
        onClick={() => void run("create")}>Create new Boards file</SettingsAction>
    </div>
    {(state.canRecover || state.dirty) && <button type="button" className="settings-link boards-recovery-link" disabled={busy}
      aria-busy={pending === "save" || undefined} onClick={() => void run("save")}>
      {pending === "save" && <LoaderCircle size={14} className="spin" aria-hidden="true" />}Save a copy of your history</button>}
    {retryHint && <p className="boards-retry-hint" role="status">{retryHint}</p>}
    <ErrorBanner variant="inline" message={error === BOARDS_MISSING_FILE ? "" : error} />
  </section>;
}

function BoardsSavedCopy({ path }: { path?: string }) {
  return path ? <div className="boards-saved-copy" role="status">
    <p>A copy of your previous Boards history is saved here:</p><code>{path}</code>
    <p>Use Import Boards history in Settings to bring it back.</p>
  </div> : null;
}

export function BoardsDatabaseSettings({ onReady }: { onReady?: () => void }) {
  const controls = useBoards(), { state, working, error, act } = controls;
  useLayoutEffect(() => { if (controls.loaded) onReady?.(); }, [controls.loaded, onReady]);
  const recoveryFocus = useRecoveryFocus(state);
  const location = state.filePath || state.expectedPath;
  const busy = working || state.progress.length > 0;
  const hasActions = Boolean(state.filePath && !state.boards.length && !state.dirty || state.error || state.dirty || state.canRecover);
  return <div className="boards-database" ref={recoveryFocus} tabIndex={-1}>
    {state.fileMissing ? <BoardsFileRecovery controls={controls} compact /> : <>
      <div className="database-location"><span>Boards file</span><strong>{state.filename || "Boards file unavailable"}</strong>
        {location && <code title={location}>{location}</code>}</div>
      <ErrorBanner variant="inline" message={error || state.error} />
      {state.dirty && <p className="sync-warning" role="status">Boards changes are waiting to reach the selected file.</p>}
      {hasActions && <div className="settings-actions">
        {state.filePath && !state.boards.length && !state.dirty && <SettingsAction icon={FolderOpen} disabled={busy}
          onClick={() => void act(() => window.desktop!.importBoardsHistory())}>Import Boards history</SettingsAction>}
        {(state.error || state.dirty) && <SettingsAction icon={RefreshCw} busy={working} disabled={busy}
          onClick={() => void act(() => window.desktop!.retryBoardsSave())}>Retry</SettingsAction>}
        {(state.dirty || state.canRecover) && <SettingsAction icon={FolderOpen} disabled={busy}
          onClick={() => void act(() => window.desktop!.saveBoardsRecovery())}>Save recovery copy</SettingsAction>}
      </div>}
      <BoardsSavedCopy path={state.savedCopyPath} />
    </>}
    <section className="board-reader-settings" aria-label="Board checks">
      <label className="board-reader-toggle"><input type="checkbox" checked={(state.readerSettings || defaultBoardReaderSettings).automaticThorough}
        disabled={busy} onChange={event => void act(() => window.desktop!.configureBoardReader({ ...(state.readerSettings || defaultBoardReaderSettings), automaticThorough: event.target.checked }))} />
        <span>Automatically try a thorough check</span></label>
      <p className="settings-help">If a page is difficult to read, Zebby uses your selected model to navigate its results and verify them again. This uses additional model allowance or credits.</p>
      <details><summary>Reading limits</summary><div className="board-reader-limits">
        <label>Time per attempt<select value={(state.readerSettings || defaultBoardReaderSettings).minutes} disabled={busy}
          onChange={event => void act(() => window.desktop!.configureBoardReader({ ...(state.readerSettings || defaultBoardReaderSettings), minutes: Number(event.target.value) }))}>
          {[5, 10, 15, 30].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
        <label>Model requests per attempt<select value={(state.readerSettings || defaultBoardReaderSettings).modelCalls} disabled={busy}
          onChange={event => void act(() => window.desktop!.configureBoardReader({ ...(state.readerSettings || defaultBoardReaderSettings), modelCalls: Number(event.target.value) }))}>
          {[20, 40, 60, 120].map(value => <option key={value} value={value}>{value} requests</option>)}</select></label>
      </div><p className="settings-help">Checks pause at either limit. Resume uses the same limits for the next attempt and verifies the current page. Saved analysis results are reused when the inputs still match.</p></details>
    </section>
  </div>;
}

function companyFromUrl(value: string) {
  const url = new URL(value), host = url.hostname.replace(/^(www\.|jobs\.|careers\.)/, "");
  if (host === "metacareers.com") return "Meta";
  const name = /greenhouse|lever\.co|ashbyhq/.test(host) ? url.pathname.split("/").filter(Boolean)[0] || host : host.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function BoardTooltipButton({ content, children, className, label, above = false, disabled = false, busy = false, onClick }: {
  content: string; children: ReactNode; className: string; label?: string; above?: boolean; disabled?: boolean; busy?: boolean; onClick?(): void;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), tooltip = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null), focused = useRef(false);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0 });
  const visible = open && !disabled;
  function clearClose() { if (closeTimer.current) clearTimeout(closeTimer.current); }
  function show() { clearClose(); setOpen(true); }
  function leave() { clearClose(); closeTimer.current = setTimeout(() => { if (!focused.current) setOpen(false); }, 120); }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useLayoutEffect(() => {
    if (!visible || !trigger.current || !tooltip.current) return;
    const place = () => {
      if (!trigger.current || !tooltip.current) return;
      const anchor = trigger.current.getBoundingClientRect(), tip = tooltip.current.getBoundingClientRect();
      if (anchor.bottom <= 0 || anchor.top >= window.innerHeight) { setOpen(false); return; }
      const preferTop = above && anchor.top - tip.height - 8 >= 16;
      const next = { left: Math.max(16, Math.min(above ? anchor.left + (anchor.width - tip.width) / 2 : anchor.left, window.innerWidth - tip.width - 16)),
        top: preferTop ? anchor.top - tip.height - 8 : anchor.bottom + 8 + tip.height <= window.innerHeight - 16 ? anchor.bottom + 8 : Math.max(16, anchor.top - tip.height - 8) };
      setPosition(previous => previous.left === next.left && previous.top === next.top ? previous : next);
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [visible, content, above]);
  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setOpen(false);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); dismiss(); } };
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !tooltip.current?.contains(event.target as Node)) dismiss(); };
    window.addEventListener("keydown", escape, true); window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("pointerdown", outside); };
  }, [visible]);
  return <>
    <button ref={trigger} type="button" className={className} aria-label={label} disabled={disabled} aria-busy={busy || undefined}
      aria-describedby={visible ? id : undefined} onPointerEnter={show} onPointerLeave={leave}
      onClick={() => { if (onClick) { setOpen(false); onClick(); } else show(); }}
      onFocus={() => { focused.current = true; show(); }} onBlur={() => { focused.current = false; leave(); }}>{children}</button>
    {visible && createPortal(<div ref={tooltip} id={id} role="tooltip" className={"board-error-tooltip" + (above ? " board-action-tooltip" : "")} style={position}
      onPointerEnter={clearClose} onPointerLeave={leave}>{content}</div>, document.body)}
  </>;
}

function BoardCheckStatus({ error }: { error: string }) {
  return <BoardTooltipButton content={error} className="board-check-status">Check incomplete</BoardTooltipButton>;
}

function BoardResults({ board, onClose }: { board: Board; onClose(): void }) {
  const [requestedOffset, setOffset] = useState(0), [retry, setRetry] = useState(0);
  const offset = Math.min(requestedOffset, Math.floor(Math.max(0, board.newCount - 1) / 50) * 50);
  const [loaded, setLoaded] = useState<{ key: string; result?: BoardListings; error?: string } | null>(null);
  const requestKey = JSON.stringify([board.id, board.lastCheckId, board.newCount, offset, retry]);
  const result = loaded?.key === requestKey ? loaded.result : null, error = loaded?.key === requestKey ? loaded.error : "";
  const focus = useRef<HTMLElement>(null);
  useEffect(() => { focus.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    void window.desktop!.boardListings(board.id, board.lastCheckId, "new", offset)
      .then(value => { if (active) setLoaded({ key: requestKey, result: value }); })
      .catch(error => { if (active) setLoaded({ key: requestKey, error: message(error) }); });
    return () => { active = false; };
  }, [board.id, board.lastCheckId, board.newCount, offset, retry, requestKey]);
  return <section id={"board-results-" + board.id} className="board-listings" aria-label={board.company + " new listings"} ref={focus} tabIndex={-1}>
    <button type="button" className="board-icon-action board-listings-close" onClick={onClose} aria-label="Close listings"><X size={17} aria-hidden="true" /></button>
    {error ? <div className="board-listings-feedback"><p role="alert">{error}</p>
      <button type="button" className="boards-text-action" onClick={() => setRetry(value => value + 1)}>Retry</button></div>
      : !result ? <p className="board-listings-feedback" role="status"><LoaderCircle size={14} className="spin" aria-hidden="true" />Loading listings</p>
      : <>
        {result.listings.length ? <ul className="board-listing-items">{result.listings.map(listing => <li key={listing.key}>
          <div><a href={listing.url} target="_blank" rel="noopener noreferrer">{boardListingTitle(listing.title, listing.url) || listing.url}</a>
            {(listing.department || listing.location) && <p>{[listing.department, listing.location].filter(Boolean).join(" · ")}</p>}</div>
          {!listing.current && <span className="board-listing-status">No longer listed</span>}
        </li>)}</ul> : <p className="board-listings-feedback" role="status">No new listings to review.</p>}
        {result.total > 50 && <div className="board-listings-pagination"><span role="status">{offset + 1}-{Math.min(offset + result.listings.length, result.total)} of {result.total}</span>
          <div><button type="button" className="button button-secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</button>
            <button type="button" className="button button-secondary" disabled={offset + 50 >= result.total} onClick={() => setOffset(value => value + 50)}>Next</button></div></div>}
      </>}
  </section>;
}

function BoardPartialResults({ board, onClose }: { board: Board; onClose(): void }) {
  const [preview, setPreview] = useState<BoardRunPreview | null>(null), [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const focus = useRef<HTMLElement>(null);
  useEffect(() => { focus.current?.focus(); let active = true;
    void window.desktop!.boardRunPreview(board.id).then(value => { if (active) { if (value) setPreview(value); else setError("This check no longer has partial results. Close this view to see its current status."); } }).catch(error => { if (active) setError(message(error)); });
    return () => { active = false; };
  }, [board.id]);
  return <section className="board-listings board-partial-listings" aria-label={board.company + " partial results"} ref={focus} tabIndex={-1}>
    <button type="button" className="board-icon-action board-listings-close" onClick={onClose} aria-label="Close partial results"><X size={17} aria-hidden="true" /></button>
    <p className="board-partial-help">Found so far. {board.instructions ? "Tracking instructions will be applied after the full inventory is verified. " : ""}Your last successful check is unchanged.</p>
    {error ? <p role="alert">{error}</p> : !preview ? <p role="status">Loading partial results</p> : <>
      <ul className="board-listing-items">{preview.listings.slice(offset, offset + 50).map(listing => <li key={listing.url}><div>
        <a href={listing.url} target="_blank" rel="noopener noreferrer">{boardListingTitle(listing.title || "", listing.url) || listing.url}</a>
        {(listing.department || listing.location) && <p>{[listing.department, listing.location].filter(Boolean).join(" · ")}</p>}
      </div></li>)}</ul>
      {preview.listings.length > 50 && <div className="board-listings-pagination"><span>{offset + 1}-{Math.min(offset + 50, preview.listings.length)} of {preview.listings.length}</span><div>
        <button type="button" className="boards-text-action" disabled={!offset} onClick={() => setOffset(value => value - 50)}>Previous</button>
        <button type="button" className="boards-text-action" disabled={offset + 50 >= preview.listings.length} onClick={() => setOffset(value => value + 50)}>Next</button>
      </div></div>}
    </>}
  </section>;
}

export default function BoardsView({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const controls = useBoards(), { state, error, working, act } = controls;
  const recoveryFocus = useRecoveryFocus(state);
  const [adding, setAdding] = useState(false), [editing, setEditing] = useState<Board | null>(null);
  const [links, setLinks] = useState(""), [company, setCompany] = useState("");
  const [instructions, setInstructions] = useState("");
  const [partial, setPartial] = useState<{ id: string; workspace: string } | null>(null);
  const [inspection, setInspecting] = useState<{ id: string; filePath: string } | null>(null);
  const inspecting = inspection?.filePath === state.filePath && state.boards.some(board => board.id === inspection.id && board.lastCheckedAt && board.newCount > 0) ? inspection : null;
  const inspectionButton = useRef<HTMLButtonElement | null>(null);
  const [reviewing, setReviewing] = useState<{ id: string; phase: "saving" | "done" } | null>(null);
  const reviewBusy = useRef(false), reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reviewTimer.current) clearTimeout(reviewTimer.current); }, []);
  function inspect(board: Board, button: HTMLButtonElement) {
    setPartial(null); inspectionButton.current = button; setInspecting({ id: board.id, filePath: state.filePath });
  }
  function closeInspection() {
    setInspecting(null);
    const target = inspectionButton.current?.isConnected ? inspectionButton.current : document.getElementById("board-check-" + inspecting?.id);
    target?.focus({ preventScroll: true });
  }
  async function markReviewed(board: Board) {
    if (reviewBusy.current) return;
    reviewBusy.current = true; setReviewing({ id: board.id, phase: "saving" });
    if (!await act(() => window.desktop!.markBoardReviewed(board.id, board.lastCheckId))) {
      reviewBusy.current = false; setReviewing(null); return;
    }
    if (inspecting?.id === board.id) setInspecting(null);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { reviewBusy.current = false; setReviewing(null); }
    else {
      setReviewing({ id: board.id, phase: "done" });
      reviewTimer.current = setTimeout(() => { reviewBusy.current = false; setReviewing(null); }, 180);
    }
    requestAnimationFrame(() => document.getElementById("board-check-" + board.id)?.focus({ preventScroll: true }));
  }
  const analysis = useAnalysisFlow();
  const dirty = editing ? links !== editing.url || company !== editing.company || instructions !== (editing.instructions || "")
    : adding && Boolean(links || company || instructions);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  function reset() { setAdding(false); setEditing(null); setLinks(""); setCompany(""); setInstructions(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const success = await act(async () => {
      const urls = links.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      if (!urls.length) throw new Error("Paste at least one board link.");
      if (editing && urls.length !== 1) throw new Error("Use one link when editing a board.");
      const inputs = urls.map(url => ({ url, company: company.trim() || companyFromUrl(url), instructions: instructions.trim() }));
      if (editing) await window.desktop!.updateBoard(editing.id, inputs[0]);
      else await window.desktop!.addBoards(inputs);
    });
    if (success) reset();
  }
  function canReplaceDraft() { return !dirty || window.confirm("Discard unsaved changes to this board?"); }
  function beginAdd() { if (canReplaceDraft()) { reset(); setAdding(true); } }
  function edit(board: Board) {
    if (editing?.id === board.id || !canReplaceDraft()) return;
    setEditing(board); setCompany(board.company); setLinks(board.url); setInstructions(board.instructions || ""); setAdding(false);
  }
  return <main className="desktop-main boards-page" aria-label="Boards">
    <div className="boards-toolbar"><div className="boards-title" ref={recoveryFocus} tabIndex={-1}><h1>Boards</h1><span className="boards-beta">BETA</span></div>
      {state.filePath && !state.fileMissing && <div className="boards-toolbar-actions">
        <button type="button" className="button button-secondary" disabled={working || state.dirty || !state.boards.length || state.progress.length > 0}
          onClick={() => void act(() => window.desktop!.checkBoards())}><RefreshCw size={16} aria-hidden="true" />Check all</button>
        <button type="button" className="button button-primary" data-command="new" disabled={working || state.dirty}
          onClick={beginAdd}><Plus size={17} aria-hidden="true" />Add boards</button>
      </div>}
    </div>
    {!state.fileMissing && (error || state.error) && <p className="boards-error" role="alert">{error || state.error}</p>}
    {!state.fileMissing && state.dirty && <div className="boards-save-pending" role="status"><span>Boards changes are waiting to reach your database file.</span>
      <button type="button" className="boards-text-action" disabled={working} onClick={() => void act(() => window.desktop!.retryBoardsSave())}>Retry save</button>
      <button type="button" className="boards-text-action" disabled={working || state.progress.length > 0} onClick={() => void act(() => window.desktop!.saveBoardsRecovery())}>Save recovery copy</button></div>}
    {state.fileMissing ? <BoardsFileRecovery controls={controls} onCreated={reset} />
    : !state.filePath ? <div className="boards-setup">{state.error && <>
      {state.expectedPath && <p>{state.expectedPath}</p>}
      <button type="button" className="button button-secondary" disabled={working}
        onClick={() => void act(() => window.desktop!.retryBoardsSave())}>Retry</button>
      {state.canRecover && <button type="button" className="boards-text-action" disabled={working}
        onClick={() => void act(() => window.desktop!.saveBoardsRecovery())}>Save recovery copy</button>}</>}</div>
    : <>
      <BoardsSavedCopy path={state.savedCopyPath} />
      {(adding || editing) && <form className="boards-editor" onSubmit={event => void save(event)} aria-label={editing ? "Edit board" : "Add boards"}>
        <label><span>{editing ? "Board link" : "Board links"}</span><textarea autoFocus rows={editing ? 2 : 3} value={links} required maxLength={100000}
          placeholder="Paste links here, one per line" onChange={event => setLinks(event.target.value)} disabled={working} /></label>
        <label className="boards-company-field"><span>Company name <small>(optional)</small></span><input value={company} maxLength={120}
          placeholder="Use the website name" onChange={event => setCompany(event.target.value)} disabled={working} /></label>
        <label><span>Tracking instructions <small>(optional)</small></span>
          <textarea rows={2} value={instructions} maxLength={2000} disabled={working}
            placeholder="Only track Senior or Principal Product Manager roles."
            aria-describedby="board-instructions-help" onChange={event => setInstructions(event.target.value)} /></label>
        <p id="board-instructions-help" className="board-field-help">{!editing && links.trim().split(/\r?\n/).filter(Boolean).length > 1
          ? "These instructions apply to each link above. Leave blank to track all openings."
          : "Describe the titles, seniority, or team headings to look for. Leave blank to track all openings."}</p>
        {editing && (links.trim() !== editing.url || instructions.trim() !== (editing.instructions || "")) &&
          <p className="settings-help">Changing the link or instructions starts a new baseline on the next check.</p>}
        {!editing && <p className="settings-help">The first check saves your starting point. Later checks look for new listings.
          {analysis.state.analysisProvider === "credits" && " Each AI batch uses your selected model and available Zebby credits."}</p>}
        <div className="boards-editor-actions"><button type="submit" className="button button-primary" disabled={working || state.dirty}>
          {working && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{editing ? "Save board" : "Add and check"}</button>
          <button type="button" className="button button-secondary" disabled={working} onClick={reset}>Cancel</button>
          {editing && <button type="button" className="boards-text-action" disabled={working || dirty || state.dirty || state.progress.some(item => item.boardId === editing.id)}
            onClick={() => void act(async () => { await window.desktop!.checkBoards([editing.id], { thorough: true }); reset(); })}>Thorough recheck</button>}</div>
      </form>}
      {!state.boards.length && !adding ? <div className="boards-empty"><h2>Your next opportunity starts here</h2>
        <p>Save the company career pages you check regularly.</p>
        <button type="button" className="button button-primary" onClick={() => setAdding(true)} disabled={state.dirty}><Plus size={17} aria-hidden="true" />Add your first boards</button></div>
      : state.boards.length > 0 && <div className="boards-list" aria-label="Saved boards">
        <div className="boards-columns" aria-hidden="true"><span>Company and board link</span><span>Last checked on</span><span>Updates</span><span /></div>
        {state.boards.map(board => {
          const progress = state.progress.find(item => item.boardId === board.id);
          const run = state.runs?.find(item => item.boardId === board.id);
          const showPartial = !progress && partial?.id === board.id && partial.workspace === state.filePath && Boolean(run?.found);
          const partialLink = !progress && run?.found ? <button type="button" className="boards-text-action board-partial-link" aria-expanded={showPartial}
            onClick={() => { setInspecting(null); setPartial(showPartial ? null : { id: board.id, workspace: state.filePath }); }}>{run.found} found so far</button> : null;
          const review = reviewing?.id === board.id ? reviewing.phase : null;
          const checkProgress = progress && <span className="board-progress" role={board.lastCheckedAt ? undefined : "status"} title={progress.message}>
            <LoaderCircle size={13} className="spin" aria-hidden="true" />{board.lastCheckedAt || /thorough|verif|found/i.test(progress.message) ? progress.message : "Indexing"}</span>;
          return <article key={board.id} className="board-row" aria-label={board.company}>
            <div className="board-identity"><div className="board-heading"><strong title={board.company}>{board.company}</strong>
              {board.instructions?.trim() && <span className="board-instructions-indicator">Custom instructions</span>}</div>
              <a href={board.url} target="_blank" rel="noopener noreferrer" title={board.url}>{board.url}</a></div>
            <div className="board-date"><span className="board-mobile-label">Last checked on</span>{board.lastCheckedAt
              ? <time dateTime={board.lastCheckedAt} title={new Date(board.lastCheckedAt).toLocaleString()}>{new Date(board.lastCheckedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
              : <span>Never checked</span>}</div>
            <div className="board-result">
              {board.lastCheckedAt ?
                <div className="board-update-summary" role="status">
                  <div className="board-update-heading">
                  {board.newCount > 0
                    ? <button type="button" className="boards-text-action board-discoveries" aria-expanded={inspecting?.id === board.id}
                        aria-controls={inspecting?.id === board.id ? "board-results-" + board.id : undefined}
                        onClick={event => inspecting?.id === board.id ? closeInspection() : inspect(board, event.currentTarget)}>{board.newCount} new {board.newCount === 1 ? "listing" : "listings"}</button>
                    : (!board.error || progress) && <span className="board-no-updates">No new listings</span>}
                  {(board.newCount > 0 || review) && <BoardTooltipButton content="Mark as reviewed" label="Mark as reviewed" above
                    className={"board-icon-action board-review-action" + (review === "done" ? " is-reviewed" : "")}
                    disabled={working || state.dirty || Boolean(reviewing)} busy={review === "saving"} onClick={() => void markReviewed(board)}>
                    {review === "saving" ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  </BoardTooltipButton>}
                  {board.error && !progress && <BoardCheckStatus error={board.error} />}
                  </div>
                  {checkProgress || partialLink || <span className="board-match-total">{board.totalCount} {board.totalCount === 1 ? "listing" : "listings"} checked</span>}
                </div>
                : checkProgress || <div className="board-update-summary"><span role="status">{board.error ? <BoardCheckStatus error={board.error} /> : <span className="board-no-updates">{run?.canResume ? "Check paused" : "Not indexed"}</span>}</span>{partialLink}</div>}
            </div>
            <div className="board-actions">{progress ? <button id={"board-check-" + board.id} type="button" className="button button-secondary" disabled={progress.phase === "saving"}
              onClick={() => void act(() => window.desktop!.cancelBoardCheck(board.id))}>Stop check</button>
              : <button id={"board-check-" + board.id} type="button" className="button button-secondary" disabled={working || state.dirty} onClick={() => { setPartial(null); void act(() => window.desktop!.checkBoards([board.id], run?.canResume ? { resume: true } : undefined)); }}>
                <RefreshCw size={15} aria-hidden="true" />{run?.canResume ? "Resume check" : board.error ? "Retry" : "Check for updates"}</button>}
              {analysis.state.analysisProvider === "credits" && board.error.startsWith(BOARD_CREDIT_MESSAGE) && !progress &&
                <button type="button" className="boards-text-action" onClick={() => analysis.openCredits()}>Top up</button>}
              <button type="button" className="board-icon-action" aria-label={`Edit ${board.company} board`} title="Edit board" disabled={working || Boolean(progress) || state.dirty} onClick={() => edit(board)}><Pencil size={15} aria-hidden="true" /></button>
              <button type="button" className="board-icon-action" aria-label={`Remove ${board.company} board`} title="Remove board" disabled={working || Boolean(progress) || state.dirty} onClick={() => void act(() => window.desktop!.removeBoard(board.id))}><X size={17} aria-hidden="true" /></button>
            </div>
            {inspecting?.id === board.id && <BoardResults key={board.id + ":" + board.lastCheckId}
              board={board} onClose={closeInspection} />}
            {showPartial && <BoardPartialResults key={board.id + ":" + run?.updatedAt} board={board} onClose={() => { setPartial(null); document.getElementById("board-check-" + board.id)?.focus(); }} />}
          </article>;
        })}
      </div>}
    </>}
  </main>;
}

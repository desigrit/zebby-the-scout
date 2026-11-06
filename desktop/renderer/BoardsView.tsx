import { useEffect, useId, useRef, useState } from "react";
import { Check, FolderOpen, LoaderCircle, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useAnalysisFlow } from "./AnalysisFlow";
import { BOARDS_MISSING_FILE, BOARD_CREDIT_MESSAGE, type Board, type BoardsState, type BoardListings, type BoardListingFilter } from "../../shared/boards";
import SettingsAction from "./SettingsAction";
import { ErrorBanner } from "./WorkspaceFeedback";

const initial: BoardsState = { filePath: "", filename: "", dirty: false, error: "", boards: [], progress: [] };
const message = (error: unknown) => (error instanceof Error ? error.message : "This action could not be completed. Try again.")
  .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

function useBoards() {
  const [state, setState] = useState<BoardsState>(initial), [error, setError] = useState(""), [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true, received = false;
    const remove = window.desktop!.onBoardsChanged(next => { received = true; if (active) setState(next); });
    void window.desktop!.boardsState().then(next => { if (active && !received) setState(next); }).catch(error => { if (active) setError(message(error)); });
    return () => { active = false; remove(); };
  }, []);
  async function act(action: () => Promise<unknown>) {
    if (inFlight.current) return false;
    inFlight.current = true; setError(""); setWorking(true);
    try { await action(); return true; }
    catch (error) { setError(message(error)); return false; }
    finally { inFlight.current = false; setWorking(false); }
  }
  return { state, error, working, act };
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

export function BoardsDatabaseSettings() {
  const controls = useBoards(), { state, working, error, act } = controls;
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
  </div>;
}

function companyFromUrl(value: string) {
  const url = new URL(value), host = url.hostname.replace(/^(www\.|jobs\.|careers\.)/, "");
  if (host === "metacareers.com") return "Meta";
  const name = /greenhouse|lever\.co|ashbyhq/.test(host) ? url.pathname.split("/").filter(Boolean)[0] || host : host.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function BoardResults({ board, initialFilter, onClose }: { board: Board; initialFilter: BoardListingFilter; onClose(): void }) {
  const [filter, setFilter] = useState(initialFilter), [offset, setOffset] = useState(0), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<BoardListings | null>(null), [error, setError] = useState("");
  const heading = useId(), focus = useRef<HTMLHeadingElement>(null);
  useEffect(() => { focus.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    let active = true; setResult(null); setError("");
    void window.desktop!.boardListings(board.id, board.lastCheckId, filter, offset)
      .then(value => { if (active) setResult(value); }).catch(error => { if (active) setError(message(error)); });
    return () => { active = false; };
  }, [board.id, board.lastCheckId, board.newCount, filter, offset, retry]);
  function choose(value: BoardListingFilter) { setFilter(value); setOffset(0); }
  return <section id={"board-results-" + board.id} className="board-listings" aria-labelledby={heading}>
    <div className="board-listings-heading"><div><h2 id={heading} ref={focus} tabIndex={-1}>{board.company} listings</h2>
      <p>From the last successful check. Opening a listing does not mark it reviewed.</p></div>
      <button type="button" className="board-icon-action" onClick={onClose} aria-label="Close listings"><X size={17} aria-hidden="true" /></button></div>
    <div className="board-listing-filters" aria-label="Show listings">
      {([['matches', 'Matches'], ['new', 'New'], ['all', 'All checked']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={filter === value} onClick={() => choose(value)}>{label}</button>)}
    </div>
    {error ? <div className="board-listings-feedback"><p role="alert">{error}</p>
      <button type="button" className="boards-text-action" onClick={() => setRetry(value => value + 1)}>Retry</button></div>
      : !result ? <p className="board-listings-feedback" role="status"><LoaderCircle size={14} className="spin" aria-hidden="true" />Loading listings</p>
      : <>
        {result.listings.length ? <ul className="board-listing-items">{result.listings.map(listing => <li key={listing.key}>
          <div><a href={listing.url} target="_blank" rel="noopener noreferrer">{listing.title || listing.url}</a>
            {(listing.department || listing.location) && <p>{[listing.department, listing.location].filter(Boolean).join(" · ")}</p>}</div>
          <span className="board-listing-status">{!listing.current ? "No longer listed" : listing.unread ? "New" : listing.matches ? "Matches" : "Outside your instructions"}</span>
        </li>)}</ul> : <p className="board-listings-feedback" role="status">{filter === "new" ? "No new listings to review."
          : filter === "matches" ? "No listings matched your instructions at the last check. Choose All checked to see what was read."
          : "This board had no openings at the last check."}</p>}
        {result.total > 0 && <div className="board-listings-pagination"><span role="status">{offset + 1}-{Math.min(offset + result.listings.length, result.total)} of {result.total}</span>
          {result.total > 50 && <div><button type="button" className="button button-secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</button>
            <button type="button" className="button button-secondary" disabled={offset + 50 >= result.total} onClick={() => setOffset(value => value + 50)}>Next</button></div>}</div>}
      </>}
  </section>;
}

export default function BoardsView({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const controls = useBoards(), { state, error, working, act } = controls;
  const recoveryFocus = useRecoveryFocus(state);
  const [adding, setAdding] = useState(false), [editing, setEditing] = useState<Board | null>(null);
  const [links, setLinks] = useState(""), [company, setCompany] = useState("");
  const [instructions, setInstructions] = useState("");
  const [inspecting, setInspecting] = useState<{ id: string; filter: BoardListingFilter } | null>(null);
  const inspectionButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setInspecting(null); }, [state.filePath]);
  function inspect(board: Board, filter: BoardListingFilter, button: HTMLButtonElement) {
    inspectionButton.current = button; setInspecting({ id: board.id, filter });
  }
  function closeInspection() { setInspecting(null); inspectionButton.current?.focus({ preventScroll: true }); }
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
          <button type="button" className="button button-secondary" disabled={working} onClick={reset}>Cancel</button></div>
      </form>}
      {!state.boards.length && !adding ? <div className="boards-empty"><h2>Your next opportunity starts here</h2>
        <p>Save the company career pages you check regularly.</p>
        <button type="button" className="button button-primary" onClick={() => setAdding(true)} disabled={state.dirty}><Plus size={17} aria-hidden="true" />Add your first boards</button></div>
      : state.boards.length > 0 && <div className="boards-list" aria-label="Saved boards">
        <div className="boards-columns" aria-hidden="true"><span>Company and board link</span><span>Last checked on</span><span>Updates</span><span /></div>
        {state.boards.map(board => {
          const progress = state.progress.find(item => item.boardId === board.id);
          return <article key={board.id} className="board-row" aria-label={board.company}>
            <div className="board-identity"><strong>{board.company}</strong><a href={board.url} target="_blank" rel="noopener noreferrer" title={board.url}>{board.url}</a>
              {board.instructions && <span className="board-instructions" title={board.instructions}>{board.instructions}</span>}</div>
            <div className="board-date"><span className="board-mobile-label">Last checked on</span>{board.lastCheckedAt
              ? <time dateTime={board.lastCheckedAt} title={new Date(board.lastCheckedAt).toLocaleString()}>{new Date(board.lastCheckedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
              : <span>Never checked</span>}</div>
            <div className="board-result">
              {board.lastCheckedAt ? <>
                <div className="board-update-summary" role="status">
                  {board.newCount > 0
                    ? <button type="button" className="boards-text-action board-discoveries" aria-expanded={inspecting?.id === board.id}
                        aria-controls={inspecting?.id === board.id ? "board-results-" + board.id : undefined}
                        onClick={event => inspect(board, "new", event.currentTarget)}>{board.newCount} new {board.newCount === 1 ? "listing" : "listings"}</button>
                    : <span className="board-no-updates">{board.error && !progress ? "Check incomplete" : "No new listings"}</span>}
                  <span className="board-match-total">{board.checkedCount ?? board.totalCount} listings checked · {board.totalCount} {board.instructions ? "match your instructions" : "tracked"}</span>
                </div>
                <button type="button" className="boards-text-action board-view-listings" aria-expanded={inspecting?.id === board.id}
                  aria-controls={inspecting?.id === board.id ? "board-results-" + board.id : undefined}
                  onClick={event => inspecting?.id === board.id ? closeInspection() : inspect(board, board.instructions ? "matches" : "all", event.currentTarget)}>
                  {inspecting?.id === board.id ? "Close listings" : board.instructions ? "View matches" : "View listings"}</button>
                {board.newCount > 0 && <button type="button" className="boards-text-action" disabled={working || state.dirty} onClick={() => void act(() => window.desktop!.markBoardReviewed(board.id, board.lastCheckId))}>
                  <Check size={14} aria-hidden="true" />Mark as reviewed</button>}
              </> : !progress && <span className="board-no-updates">{board.error ? "Check incomplete" : "Not indexed"}</span>}
              {progress && <span className="board-progress" role="status" title={progress.message}>
                <LoaderCircle size={13} className="spin" aria-hidden="true" />{board.lastCheckedAt ? progress.message : "Indexing"}</span>}
            </div>
            <div className="board-actions">{progress ? <button type="button" className="button button-secondary" disabled={progress.phase === "saving"}
              onClick={() => void act(() => window.desktop!.cancelBoardCheck(board.id))}>Cancel check</button>
              : <button type="button" className="button button-secondary" disabled={working || state.dirty} onClick={() => void act(() => window.desktop!.checkBoards([board.id]))}>
                <RefreshCw size={15} aria-hidden="true" />{board.error ? "Retry" : "Check for updates"}</button>}
              {analysis.state.analysisProvider === "credits" && board.error.startsWith(BOARD_CREDIT_MESSAGE) && !progress &&
                <button type="button" className="boards-text-action" onClick={() => analysis.openCredits()}>Top up</button>}
              <button type="button" className="board-icon-action" aria-label={`Edit ${board.company} board`} title="Edit board" disabled={working || Boolean(progress) || state.dirty} onClick={() => edit(board)}><Pencil size={15} aria-hidden="true" /></button>
              <button type="button" className="board-icon-action" aria-label={`Remove ${board.company} board`} title="Remove board" disabled={working || Boolean(progress) || state.dirty} onClick={() => void act(() => window.desktop!.removeBoard(board.id))}><X size={17} aria-hidden="true" /></button>
            </div>
            {board.error && !progress && <p className="board-check-error" role="alert">{board.error}</p>}
            {inspecting?.id === board.id && <BoardResults key={board.id + ":" + inspecting.filter + ":" + board.lastCheckId}
              board={board} initialFilter={inspecting.filter} onClose={closeInspection} />}
          </article>;
        })}
      </div>}
    </>}
  </main>;
}

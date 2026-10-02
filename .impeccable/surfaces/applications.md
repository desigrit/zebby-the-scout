# Applications surface

## Surface strategy

TASK: Add optional application details, scan hiring progress, select a role, and inspect or edit its full record.

FREQUENCY: Several entries and status checks a day across resume versions and companies.

INFORMATION: Attached daily activity and compact totals; search/company/status filters; role, company, locations, date, match, status, resume, Notes, captured listing, and score explanation.

STATES: Loading/error/empty/filtered list; selected role; wide inspector or compact inline details; active match analysis with Cancel; full optional form; duplicate warning; confirmation dialogs.

SUCCESS: A role and its actions remain reachable by mouse and keyboard at normal and short logical heights. Selection connects list context to details.

CONSTRAINTS: Preserve every optional form field, listing extraction, resume upload/reuse, locations, duplicates, saving, all records, and schema 10. Keep zebra, native shell, navigation motion, and provider inference.

## Direction contract

MODE: Operate.

THESIS: Keep the search's activity visible while a compact selectable ledger connects each role to its full details.

OWN-WORLD: Ember warm neutral canvas, rust actions, ochre activity bars, quiet selection wash, native fonts, and fine separators. The unchanged circular zebra remains the shared identity.

WORLD: The approved Ember Search Ledger replaces Graphite in both themes. Hiring stages and application match tracks retain their semantic roles and readable text values.

STORY: Add a role, review imported details, save, filter the ledger, select a record, and change status or inspect evidence and Notes.

FIRST VIEWPORT: The native title region reads Zebby. Add application sits at the toolbar's right. Daily bars and compact totals share a paper panel above search and native filters. A dense role list sits beside a persistent inspector when its content width is at least 940px. Smaller layouts expand details inline.

SIGNATURE INTERACTION: Selecting a role gives its details a stable place beside the list; compact layouts use a disclosure in the selected row. The full listing-first New Application form stays in the workspace.

FORM: The user's selected Ember Applications code concept. Preserve the attached overview and inspector composition, and use the approved inline adaptation when space requires it. The launch window remains 1550 by 850 device-independent pixels, capped to the work area.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Role access and form

The list and 300px inspector scroll independently at normal heights, separated by an 18px gap. The role selector has keyboard focus and selected/expanded state. Match includes a percentage, short track, and refresh action; status remains a native tinted select with a visible 2px focus outline. The inspector contains status, date, score/Why, team, locations, resume, and Notes as available.

At logical heights of 620px or less, the overview compacts and the workspace can scroll. The role region has a 280px minimum and height min(480px, 70vh), so high scaling cannot collapse the list. The companion 200% capture demonstrates the focused role and expanded details. The complete application form is excluded from this fallback.

New Application keeps listing extraction, company, title, team, individual locations, applied date, manual score, status, saved resume or upload, and job text. Every field is optional. Date starts at today and status at Applied; the date can be cleared. Duplicate handling offers the existing record, and blank saves remain supported. Sticky form actions retain 44px targets. Notes keeps the saved listing text and editable user notes.

While match analysis runs, affected source controls and conflicting row actions are disabled. Genuine early Cancel aborts the selected inference provider and preserves the prior result. Cancellation during commit or after completion is declined so delivery and persisted data agree. No full-model inference path or stored record was changed by the redesign.

## Shared navigation and data

The unchanged 46px circular zebra sits in a 54px accessible navigation toggle. The title region is 44px and reads only Zebby. Windows navigation spans it with 8px top padding; the image starts at y=12px. Mac navigation starts below it with 4px top padding; the image starts at y=52px. Native Windows controls and Mac traffic lights remain native. Expanded navigation is 210px, 176px at the 850px window breakpoint, and 72px at extreme logical widths of 650px or less. Explicitly collapsed navigation remains 96px. Database details appear only when expanded; Settings retains them in both states.

The toggle has action labels, expanded state, tooltips, and Enter or Space activation. Its local preference rolls back with an error if saving fails; toggling preserves drafts and destination. Destinations have 48px targets and 24px icons. Accepted activation navigates immediately and plays the existing offline Lottie animation for about 417ms. Reduced motion stays still; player failure retains the static icon. Completion, hiding, or a reduced-motion change restores the rest state. Desktop controls use the arrow cursor and text fields use the text cursor.

Windows scroll containers reserve a stable 12px gutter. The resting 2px thumb widens to 8px on hover, focus, or scrolling. Mac keeps native system scrollers. Physical macOS behavior has not been manually reviewed.

Version 1.6.0 keeps schema 10 and the existing SQLite and legacy migration behavior. Applications, plans, Notes, resumes, scores, and previous backups remain intact. Native database dialogs await pending writes and reject switching while changes are unsaved. Cloud-file changes are detected before saving; quit and wait for sync before moving between computers. See [the guide](../../docs/guide.md).

Available updates remain at the sidebar's bottom in either navigation state. Update download and verification, restart guards, and installer behavior retain their existing contracts. App-local New, Save, Search, and native text Undo have no visible shortcut list or added zoom controls.

## Finish evidence

Current captures include light (internal record: `work/ember-implementation/round-2/captures/applications-light.png`), dark (internal record: `work/ember-implementation/round-2/captures/applications-dark.png`), 200% initial view (internal record: `work/ember-implementation/round-2/captures/applications-zoom-2.png`), and 200% reached details (internal record: `work/ember-implementation/round-2/captures/applications-zoom-2-scrolled.png`). The public Applications screenshot uses the light capture and embeds its synthetic native origin.

The pinned choices recorded here, from internal direction `work/ember-implementation/direction.md`, select Ember Applications and Settings and Rosewood's Plan composition in Ember colors. These are code concept references, not pixel reproduction requirements.

The full finish review (internal record: `work/ember-implementation/finish-review.md`) found two regressions. The finish verdict (internal record: `work/ember-implementation/finish-verdict.md`) marks both resolved and returns ship for that correction batch. It does not claim a new whole-surface audit. Final documentation and screenshot origins are recorded for this handoff.

Supplied final evidence reports 72 tests, lint, typecheck, build, complete headless regressions, ten native interaction checks, and 37 native captures passing. These were not rerun by the documenter. Native screenshots use synthetic applications, plans, and a dummy resume in an isolated hidden Windows Electron process. Provider outputs and clipboard are mocked; no real profile, credentials, models, or database were used. Both platform renderer simulations were checked, but physical macOS review and native installer validation remain outside this local evidence. CI handles installer gates separately.

The [UX health report](../../docs/ux-health-v1.6.0.md) records the resolved short-height role access and late cancellation findings, deliberately unchanged F01/F03 behavior, and the remaining low-severity observations. No numerical score or trend is claimed. One detector pass compared against the old system; no second detector, doctor, or context run was performed.

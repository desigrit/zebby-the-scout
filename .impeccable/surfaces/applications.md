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

## 1.6.1 action contract

Blank space across an application row activates the existing native role selector, selecting the role and opening its details in the wide inspector. Listing links, location disclosures, match, status, Notes, Edit, and Delete remain independent controls above that hit area. Keyboard focus remains visible within the row.

The visible X, named Close details, closes the inspector, preserves selection, gives its released width to the list, and returns focus to the selected role selector. Clicking that role or another reopens details; the focused selector also supports native keyboard activation. Compact layouts retain their inline disclosure and toggle behavior.

## 1.6.2 metrics contract

Date applied comes first, then match percentage and its existing track and controls, side by side on one centered line with a 24px gap. Headings keep their full measure, and closing the inspector preserves centering. Expanded locations receive full width with metrics below when space permits; compact inline details span the row. Extreme narrow containers give the intact date/match group its own centered line.

The user subsequently rejected this 1.6.2 layout because the visible metrics did not appear centered, the date/match spacing was too small, and Notes, Edit and Delete did not share the line. The 1.6.3 footer contract superseded it; the current 1.6.4 row contract supersedes both layouts.

## 1.6.3 footer contract

The visible applied date comes first, followed by the existing match percentage, track and controls. The pair uses its actual content width and a generous 64px gap, centered in a shared footer with equal side columns. View listing sits at the left; Notes, Edit and Delete align at the right on that same horizontal line. Role and company retain the full top-line width, and closing or reopening the inspector preserves the arrangement.

Expanded locations stay above the footer and compact inline details below it. The reviewed wide, compact and 200% scaling states retain the centered pair and 64px gap. At extreme container widths below 440px, View listing moves to its own line and the date/match gap reduces to 32px while metrics and actions remain alongside one another. This fallback centers the pair within its metrics column rather than across the entire row; it is present in source but was not separately visually certified by the current capture set.

This correction preserves Ember light and dark appearance, native fonts, the flat ledger, zebra identity, independent row controls, analysis behavior and schema 10.

The user subsequently rejected this 1.6.3 layout because location and View listing needed to share the line below title/company, date and match needed a common vertical center beside that block, and the five groups needed more balanced separation. The current 1.6.4 row contract supersedes this footer arrangement.

## 1.6.4 row contract

THESIS: Scan five distributed groups on one common vertical center: a two-line job details block, applied date, match, status, and Notes, Edit and Delete. Available gaps are balanced between the groups.

OWN-WORLD: Preserve Ember light and dark, native platform fonts, the flat ruled ledger, quiet selection wash, circular zebra, native controls, arrow cursor and platform scrollers. This correction introduces no new palette, durable token or visual world.

STORY: Read title and company on the first line, then location and View listing together beneath them. Scan date, match, status and row actions beside that block. Blank row space selects the role; each independent control keeps its existing action.

FIRST VIEWPORT: Activity, totals, filters and the wide inspector keep their established order. The leading job block uses approximately 26% of the row; the other four groups take their required widths with balanced remaining gaps. At the default wide split view, the date/match separation exceeds the rejected 64px footer gap. Title and company stay on one line with native full hover text; opened compact details show the full wrapping identity.

FORM: At ledger widths of 800px or less, the redundant Location prefix and match track disappear, while numeric score and analysis, refresh and Cancel controls remain. The native status select narrows from 156px to 138px. At 640px or less, View listing uses its existing external-link icon with a full accessible name and tooltip. Expanded locations and compact details span the row below the summary, preserving the common control center. Compact details begin with the full wrapping role title and company; Close returns focus to the role selector and Enter reopens it. Optional and blank records remain supported. Version 1.6.4 retains schema 10.

## Role access and form

The list and 300px inspector scroll independently at normal heights, separated by an 18px gap. The role selector has keyboard focus and selected/expanded state. Match includes a percentage, short track, and refresh action; status remains a native tinted select with a visible 2px focus outline. The inspector contains status, date, score/Why, team, locations, resume, and Notes as available.

At logical heights of 620px or less, the overview compacts and the workspace can scroll. The role region has a 280px minimum and height min(480px, 70vh), so high scaling cannot collapse the list. The companion 200% capture demonstrates the focused role and expanded details. The complete application form is excluded from this fallback.

New Application keeps listing extraction, company, title, team, individual locations, applied date, manual score, status, saved resume or upload, and job text. Every field is optional. Date starts at today and status at Applied; the date can be cleared. Duplicate handling offers the existing record, and blank saves remain supported. Sticky form actions retain 44px targets. Notes keeps the saved listing text and editable user notes.

While match analysis runs, affected source controls and conflicting row actions are disabled. Genuine early Cancel aborts the selected inference provider and preserves the prior result. Cancellation during commit or after completion is declined so delivery and persisted data agree. No full-model inference path or stored record was changed by the redesign.

## Shared navigation and data

The unchanged 46px circular zebra sits in a 54px accessible navigation toggle. The title region is 44px and reads only Zebby. The image has equal top and left insets within the rail: 26px when expanded, 25px when explicitly collapsed, and 13px in the automatic 72px rail at logical widths of 650px or less. Sidebar top padding is 22px, 21px, and 9px respectively. Windows navigation spans the title region. Mac navigation begins below it, placing the expanded image at y=70px and the explicitly collapsed image at y=69px. Native Windows controls and Mac traffic lights remain native. Expanded navigation is 210px, 176px at the 850px window breakpoint, and 72px at extreme logical widths of 650px or less. Explicitly collapsed navigation remains 96px, including at extreme widths. Database details appear only when expanded; Settings retains them in both states.

The toggle has action labels, expanded state, tooltips, and Enter or Space activation. Its local preference rolls back with an error if saving fails; toggling preserves drafts and destination. Shell width, title-region width, rail padding, and icon positions transition together over 280ms with cubic-bezier(.16, 1, .3, 1). Labels fade out over 100ms and fade in over 180ms after a 60ms delay. Destinations have 48px targets and 24px icons. Accepted activation navigates immediately and plays a brief offline Lottie animation for about 417ms. Plan uses a magnifier with a star and a small sprinkle, with a flutter that returns to the same static geometry. Reduced motion removes sidebar transitions and keeps icons still; player failure retains the static icon. Completion, hiding, or a reduced-motion change restores the rest state. Desktop controls use the arrow cursor and text fields use the text cursor.

Windows scroll containers reserve a stable 12px gutter. The resting 2px thumb widens to 8px on hover, focus, or scrolling. Mac keeps native system scrollers. Physical macOS behavior has not been manually reviewed.

Version 1.6.4 keeps schema 10 and the existing SQLite and legacy migration behavior. Applications, plans, Notes, resumes, scores, and previous backups remain intact. Native database dialogs await pending writes and reject switching while changes are unsaved. Cloud-file changes are detected before saving; quit and wait for sync before moving between computers. See [the guide](../../docs/guide.md).

Available updates remain at the sidebar's bottom in either navigation state. Update download and verification, restart guards, and installer behavior retain their existing contracts. App-local New, Save, Search, and native text Undo have no visible shortcut list or added zoom controls.

## Finish evidence

### 1.6.0 implementation

The 1.6.0 captures include light (internal record: `work/ember-implementation/round-2/captures/applications-light.png`), dark (internal record: `work/ember-implementation/round-2/captures/applications-dark.png`), 200% initial view (internal record: `work/ember-implementation/round-2/captures/applications-zoom-2.png`), and 200% reached details (internal record: `work/ember-implementation/round-2/captures/applications-zoom-2-scrolled.png`). The public Applications screenshot for that release used the light capture and embedded its synthetic native origin.

The pinned choices recorded here, from internal direction `work/ember-implementation/direction.md`, select Ember Applications and Settings and Rosewood's Plan composition in Ember colors. These are code concept references, not pixel reproduction requirements.

The full finish review (internal record: `work/ember-implementation/finish-review.md`) found two regressions. The finish verdict (internal record: `work/ember-implementation/finish-verdict.md`) marks both resolved and returns ship for that correction batch. It does not claim a new whole-surface audit. Final documentation and screenshot origins are recorded for this handoff.

Supplied final evidence reports 72 tests, lint, typecheck, build, complete headless regressions, ten native interaction checks, and 37 native captures passing. These were not rerun by the documenter. Native screenshots use synthetic applications, plans, and a dummy resume in an isolated hidden Windows Electron process. Provider outputs and clipboard are mocked; no real profile, credentials, models, or database were used. Both platform renderer simulations were checked, but physical macOS review and native installer validation remain outside this local evidence. CI handles installer gates separately.

The [UX health report](../../docs/ux-health-v1.6.0.md) records the resolved short-height role access and late cancellation findings, deliberately unchanged F01/F03 behavior, and the remaining low-severity observations. No numerical score or trend is claimed. One detector pass compared against the old system; no second detector, doctor, or context run was performed.

### 1.6.1 control refinement

The narrow control review, recorded internally in work/row-controls/finish-review.md, returned ship with no material fixes for whole-row selection, inspector close/reopen/focus, and individual recommendation copy with their immediate regression boundaries. It does not certify the whole app or assign a fresh health score.

The 1.6.1 Applications screenshot used work/row-controls/round-1/captures/applications-light.png, a 1550 by 850 native Windows Electron frame with synthetic data. Its exact source origin was embedded in docs/screenshots/applications.png; that documentation handoff verified pixel identity with the source and read back the origin.

Supplied 1.6.1 evidence reports passing typecheck, lint, build, and complete headless renderer checks. The native hidden Windows run reports 11 interaction checks and no errors, covering three blank row regions, released list width, focus return, same/other role reopening, Enter activation, independent Notes, busy disabling, and current single-item copy. The review inspected ten valid native frames and four current Mac renderer simulation frames. The superseded high-scaling Plan frame is replaced by work/row-controls/high-scaling-recapture/captures/plan-zoom-2-results.png.

Providers and clipboard are mocked, and the captures use synthetic data. These checks were not rerun by the documenter. Mac renderer simulations were captured on Windows; physical macOS font, scroller, and native-window behavior remain unverified. Installer CI on the release tag is a separate release gate. Version 1.6.1 preserves schema 10. No context, detector, or doctor was rerun for this control or documentation handoff.
### 1.6.2 centered metrics

The scoped finish review, recorded internally in work/centered-row-metrics/finish-review.md, returned ship with no material fixes for centered date/match metrics and immediate layout/control regressions.

Supplied evidence reports passing build, typecheck, lint and complete headless renderer checks, twelve native interaction checks, ten native captures and zero errors. The sole layout scan has no findings. The reviewer inspected twelve valid frames, including two Mac renderer simulations made on Windows. These checks were not rerun by the documenter. Physical Mac rendering remains outside local evidence; installer CI is a separate release gate. Version 1.6.2 preserves schema 10.

The 1.6.2 public screenshot used work/centered-row-metrics/round-1/captures/applications-light.png, an isolated hidden native Windows Electron capture of synthetic data from Zebby 1.6.2, 1550 by 850. Its origin was embedded in docs/screenshots/applications.png; that handoff verified decoded pixel identity, origin readback and provenance. Providers and clipboard were mocked; no real user profile, database, resume, key or model was used.
### 1.6.3 footer alignment

The fresh independent finish review, recorded internally in work/row-metrics-alignment/finish-review.md, returned ship with no material fixes for the corrected visible date/match centering, wider spacing, shared action line and immediate layout/control regressions. It inspected twelve valid current frames after the user rejected the preceding 1.6.2 result. This review does not certify the whole app or assign a new health score.

Supplied evidence reports passing build, typecheck, lint and complete headless Windows and Mac renderer checks. The hidden native Windows run records twelve checks, ten captures and zero errors; the scoped layout scan reports zero findings. Geometry checks measure visible date text and match bounds, their centering and separation, alignment of all three action buttons, listing/location clearance and horizontal overflow across pane changes, expanded locations, compact rows, busy analysis and 200% scaling. These checks were not rerun by the documenter.

The 1.6.3 public screenshot used work/row-metrics-alignment/round-1/captures/applications-light.png, an isolated hidden native Windows Electron capture of synthetic records from Zebby 1.6.3, 1550 by 850. Its exact source origin was embedded in docs/screenshots/applications.png; that handoff verified decoded pixel identity, origin readback and provenance. Providers and clipboard were mocked; no real database, profile, resume, credential or model was used.

The two Mac renderer simulations for that handoff were 1.6.3 frames made on Windows, despite their historical qa-output/renderer-1.5.0 directory name. Physical Mac font, scroller and native-window behavior remain outside local evidence; physical Mac and packaged installer checks are separate release CI gates. Version 1.6.3 preserves schema 10. Context, doctor and detectors were not rerun for this documentation handoff.

### 1.6.4 two-line job details

The scoped finish review, recorded internally in work/two-line-application-ledger/finish-review.md, found two material issues: compact details lacked visible full role/company identity, and a cascade specificity override retained the redundant Location prefix beside Multiple. The fresh finish verdict, work/two-line-application-ledger/finish-verdict.md, marks both resolved and returns ship after reopening all thirteen authoritative current frames. Its coverage is the row topology, these two fixes and immediate regressions; whole-app certification and a new health score remain outside this review.

Supplied final evidence reports passing build, typecheck, lint and complete headless Windows and Mac renderer suites. The hidden native Windows run records thirteen interaction checks, eleven captures and zero errors. The final scoped layout scan reports zero findings. Geometry checks cover the common vertical centers, all four equal group gaps, location/listing below the heading, wide date/match separation greater than the rejected 64px, no horizontal overflow, full-width expanded locations and readable compact Multiple. Interaction checks cover full compact identity, Close, focus return and Enter reopening, alongside existing blank-row selection, independent controls, optional saves, cancellation and individual item copy. These gates were not rerun by the documenter.

The current public screenshot uses work/two-line-application-ledger/round-2/captures/applications-light.png, the final isolated hidden native Windows Electron capture of synthetic records from Zebby 1.6.4, 1550 by 850. Its exact source origin is embedded in docs/screenshots/applications.png; this documentation handoff verifies dimensions and decoded pixel identity with the installed Node sharp library, reads back the origin and scans screenshot provenance. Both public screenshot rasters retain provenance.

The two current Mac renderer simulations were generated from 1.6.4 source on Windows; qa-output/renderer-1.5.0 is their historical fixture directory. Physical Mac font, scroller and native-window behavior and packaged installer checks remain separate release CI gates. Version 1.6.4 preserves schema 10. Providers and clipboard are mocked, and no real database, profile, resume, key or model was read or changed. Context, doctor and detectors were not rerun for this documentation handoff.

### 1.6.6 sidebar and repeated locations

In Plan and Applications, Enter commits a nonblank location and returns highlighted focus to Add location. Enter then opens the next input. Blank Enter leaves the input active; Escape or Cancel returns focus to Add location. Composition input is ignored for commitment. Both focus changes prevent scrolling. Application form reveal scrolls only the desktop workspace and uses instant scrolling under reduced motion.

The scoped finish review, recorded internally in work/sidebar-and-location-polish/finish-review.md, returned ship with no material fixes for equal zebra spacing, coordinated sidebar transitions, Plan's magnifier flutter, repeated location entry, and immediate form/focus regressions. It inspected eleven fresh native Windows captures and three renderer simulations. Its scope does not certify whole-app quality, physical Mac behavior, or listing extraction internals.

Supplied final evidence from [GitHub run 37146855199](https://github.com/desigrit/zebby-the-scout/actions/runs/37146855199), source commit b16d0ca9882640e4a12a6cceb661949c811c436d, reports 72 tests, typecheck, lint, build, complete headless checks, sixteen hidden native Windows interaction checks, and 45 native captures passing with errors[]. The fresh capture manifest is work/sidebar-and-location-polish/remote-review/work/desktop-visual-review/manifest.json. These checks were not rerun by the documenter. Providers and clipboard are mocked, and records/resumes are synthetic.

Mac renderer simulations under work/sidebar-and-location-polish/remote-review/qa-output/renderer-1.5.0 were captured on GitHub Windows. Physical Mac font, scroller, and native-window behavior remain unverified. Packaged installer validation is a separate release CI gate. Version 1.6.6 preserves schema 10 and provider inference. No context, detector, doctor, app, or browser was run during this documentation handoff.

The public screenshot docs/screenshots/applications.png now uses the exact native Windows frame work/sidebar-and-location-polish/remote-review/work/desktop-visual-review/captures/applications-light.png. Its source path, GitHub run, and source commit are embedded in the PNG and read back. The documentation proof verifies decoded pixel identity after provenance embedding and scans both public screenshots for missing origins. Local round-1 and round-2 frames precede the form scroll fix and are superseded for this handoff.

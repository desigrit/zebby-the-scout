# Plan

## Surface strategy

TASK: Prepare truthful resume priorities for a posting, understand the resume match, and save an editable plan.

FREQUENCY: Several roles a day, with repeated switching between saved plans and resume versions.

INFORMATION: Job posting, Current CV Overview, selected resume, job importance, resume match and Why, suggested overview, and its separate saved wording rationale.

STATES: New or saved plan; saved or unsaved edits; missing prerequisites; active analysis with Cancel; prior or fresh results; Unrated terms; save and provider errors.

SUCCESS: The user can compare sources, edit recommendations, copy current list text, and save a plan without losing access to the primary actions.

CONSTRAINTS: Keep all data, provider paths, native controls, zebra, navigation motion, and schema 10. User-pinned F01 draft/discard and F03 setup-navigation discard behavior stay unchanged. No autosave, draft recovery, shortcut list, or zoom control is added.

## Direction contract

MODE: Operate.

THESIS: A role document pairs the posting with Your CV, then turns supported experience into editable priorities and a saved result.

OWN-WORLD: Ember warm neutrals, rust actions, fine rules, quiet selection washes, native system fonts, and the unchanged zebra. Flat document surfaces keep the work readable in light and dark appearance.

STORY: Start with the last saved overview, read or paste a posting, choose or upload a resume, Analyze, inspect Why, edit the lists and suggested overview, then Save plan.

FIRST VIEWPORT: A saved-plan rail sits beside the role identity. Job posting and Your CV share columns when the editor is wide enough. Analyze follows Your CV. Save stays outside the scrolling document. At window widths of 1000px or less, Saved plans opens a compact rail.

FORM: The user's selected Rosewood Plan composition in Ember colors, from the approved code study. Keep side-by-side plain editable lists with independent importance and copy actions. Stack only when logical space requires it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 1.6.1 action contract

Each ATS keyword and core resume theme has its own Copy button immediately before Remove, in separate 26px action columns with 30px targets. Copy uses only that item's current text, including edits, without its importance percentage or any other list item. The two copy actions in section headers are removed. Importance, text editing, Add/Remove, and the paired keyword/theme composition retain their existing behavior.

Successful copy shows a check icon for 1.8 seconds and announces the copied item through an accessible status. Empty items and items in busy analysis cannot be copied. Clipboard failure retains the text-selection recovery message and allows another attempt. Recommendation fields retain their transparent resting surface and existing hover/focus treatments.

## Shared navigation

The unchanged 46px circular zebra sits in a 54px accessible navigation toggle. The title region is 44px and reads only Zebby. The image has equal top and left insets within the rail: 26px when expanded, 25px when explicitly collapsed, and 13px in the automatic 72px rail at logical widths of 650px or less. Sidebar top padding is 22px, 21px, and 9px respectively. Windows navigation spans the title region. Mac navigation begins below it, placing the expanded image at y=70px and the explicitly collapsed image at y=69px. Native Windows controls and Mac traffic lights remain native. Expanded navigation is 210px, 176px at the 850px window breakpoint, and 72px at extreme logical widths of 650px or less. Explicitly collapsed navigation remains 96px, including at extreme widths. Database details appear only when expanded; Settings retains them in both states.

The toggle has action labels, expanded state, tooltips, and Enter or Space activation. Its local preference rolls back with an error if saving fails; toggling preserves drafts and destination. Shell width, title-region width, rail padding, and icon positions transition together over 280ms with cubic-bezier(.16, 1, .3, 1). Labels fade out over 100ms and fade in over 180ms after a 60ms delay. Destinations have 48px targets and 24px icons. Accepted activation navigates immediately and plays a brief offline Lottie animation for about 417ms. Plan uses a magnifier with a star and a small sprinkle, with a flutter that returns to the same static geometry. Reduced motion removes sidebar transitions and keeps icons still; player failure retains the static icon. Completion, hiding, or a reduced-motion change restores the rest state. Desktop controls use the arrow cursor and text fields use the text cursor.

Windows scroll containers reserve a stable 12px gutter. The resting 2px thumb widens to 8px on hover, focus, or scrolling. Mac keeps native system scrollers. Physical macOS behavior has not been manually reviewed.

## Analysis, importance, and match

- Analyze remains below Your CV for new and previously analyzed plans. A quiet provider/model caption and minimal missing-input or provider hints explain readiness. The saved match retains its refresh action.
- During analysis, the current source controls and conflicting actions are temporarily disabled. Cancel reaches Ollama, OpenAI, or the CPU worker before persistence and preserves previous analysis. A committing or completed request rejects cancellation; bounded recent terminal IDs prevent a completed request from being falsely cancelled or replayed.
- Resume match is a directional estimate using the selected resume and posting. Why is a native disclosure with the saved evidence and gaps. Legacy scores retain their values and request a refresh when no explanation exists.
- Core ATS keywords are single-line inputs; Core resume themes are multiline fields. Rows are transparent at rest and use fine separators. Hover adds a quiet wash; focus adds the field fill and rust border/ring. Each row reserves a 48px independent importance column, a 26px Copy column, and a 26px Remove column, in that order after the editable text.
- Keywords and themes stay side by side where possible. Each item's Copy action uses its current edited text, exposes a copied status, and sits immediately before Remove. Add/Remove remain available. A new row receives focus. Small editor widths can stack the columns.
- Importance estimates how much the job calls for each requirement, independently of resume support and overall match. Ratings range from 0 to 100, do not sum to 100, and are guidance rather than ATS or recruiter measurements.
- Older analyses retain text with Unrated importance. Edited or added terms remain Unrated until refreshed. Job changes clear importance; CV-only changes retain unchanged job importance. Job or CV source changes clear the prior match and its explanation, and stale analysis persistence is rejected.
- Suggested resume overview remains editable. What changed or No wording changes presents its separate saved rationale as read-only text. Analysis details expands provider and importance context on demand.

The overview rationale and paragraphs inside Analysis details use the full available document width. This user-requested footer exception removes only their 72ch caps.

## Overview and persistence

New drafts start with the selected database's last saved Current CV Overview. Saving a plan or analysis updates that default. Existing plans retain their own overview. The default travels with the shared SQLite file.

Version 1.6.1 keeps schema 10, application and plan records, Notes, resumes, importance arrays, match explanations, and overview preferences. Existing older-file backup and migration behavior remains intact. There are no new weekly backups or pruning. Install version 1.4.1 or newer on both computers before sharing a schema 10 file.

Only SmolLM2 uses the compact heuristic profile. LFM2.5, Gemma, Qwen, OpenAI, Anthropic, Zebby credits, and configured Ollama retain complete source inputs and full instructions with no automatic provider fallback. Provider settings, model downloads, appearance, and navigation expansion remain local to each computer. Existing Zebby artifact migration and update behavior are described in [the guide](../../docs/guide.md).

## Finish evidence

### 1.6.0 implementation

The 1.6.0 captures include light sources (internal record: `work/ember-implementation/round-2/captures/plan-light-top.png`), light recommendations (internal record: `work/ember-implementation/round-2/captures/plan-light-results.png`), and dark recommendations (internal record: `work/ember-implementation/round-2/captures/plan-dark-results.png`). The public Plan screenshot for that release used the light recommendations capture and embedded its synthetic native origin.

The pinned choices recorded here, from internal direction `work/ember-implementation/direction.md`, select Ember Applications and Settings and Rosewood's Plan composition in Ember colors. These are code concept references, not pixel reproduction requirements.

The full finish review (internal record: `work/ember-implementation/finish-review.md`) found two regressions. The finish verdict (internal record: `work/ember-implementation/finish-verdict.md`) marks both resolved and returns ship for that correction batch. It does not claim a new whole-surface audit. Final documentation and screenshot origins are recorded for this handoff.

Supplied final evidence reports 72 tests, lint, typecheck, build, complete headless regressions, ten native interaction checks, and 37 native captures passing. These were not rerun by the documenter. Native screenshots use synthetic applications, plans, and a dummy resume in an isolated hidden Windows Electron process. Provider outputs and clipboard are mocked; no real profile, credentials, models, or database were used. Both platform renderer simulations were checked, but physical macOS review and native installer validation remain outside this local evidence. CI handles installer gates separately.

The [UX health report](../../docs/ux-health-v1.6.0.md) records the resolved short-height role access and late cancellation findings, deliberately unchanged F01/F03 behavior, and the remaining low-severity observations. No numerical score or trend is claimed. One detector pass compared against the old system; no second detector, doctor, or context run was performed.

### 1.6.1 control refinement

The narrow control review, recorded internally in work/row-controls/finish-review.md, returned ship with no material fixes for whole-row selection, inspector close/reopen/focus, and individual recommendation copy with their immediate regression boundaries. It does not certify the whole app or assign a fresh health score.

The published Plan screenshot now uses work/row-controls/round-1/captures/plan-light-results.png, a 1550 by 850 native Windows Electron frame with synthetic data. Its exact source origin is embedded in docs/screenshots/plan.png; the documentation handoff verifies pixel identity with the source and reads back that origin.

Supplied 1.6.1 evidence reports passing typecheck, lint, build, and complete headless renderer checks. The native hidden Windows run reports 11 interaction checks and no errors, including current single-item copy and busy disabling. Headless Windows and Mac renderer simulations additionally check edited keyword/theme text, empty-item disabling, copied feedback, clipboard failure/retry, and Copy before Remove. The review inspected ten valid native frames and four current Mac renderer simulation frames. The superseded high-scaling Plan frame is replaced by work/row-controls/high-scaling-recapture/captures/plan-zoom-2-results.png.

Providers and clipboard are mocked, and the captures use synthetic data. These checks were not rerun by the documenter. Mac renderer simulations were captured on Windows; physical macOS font, scroller, and native-window behavior remain unverified. Installer CI on the release tag is a separate release gate. Version 1.6.1 preserves schema 10. No context, detector, or doctor was rerun for this control or documentation handoff.

### 1.6.6 sidebar and repeated locations

In Plan and Applications, Enter commits a nonblank location and returns highlighted focus to Add location. Enter then opens the next input. Blank Enter leaves the input active; Escape or Cancel returns focus to Add location. Composition input is ignored for commitment. Both focus changes prevent scrolling. Application form reveal scrolls only the desktop workspace and uses instant scrolling under reduced motion.

The scoped finish review, recorded internally in work/sidebar-and-location-polish/finish-review.md, returned ship with no material fixes for equal zebra spacing, coordinated sidebar transitions, Plan's magnifier flutter, repeated location entry, and immediate form/focus regressions. It inspected eleven fresh native Windows captures and three renderer simulations. Its scope does not certify whole-app quality, physical Mac behavior, or listing extraction internals.

Supplied final evidence from [GitHub run 37146855199](https://github.com/desigrit/zebby-the-scout/actions/runs/37146855199), source commit b16d0ca9882640e4a12a6cceb661949c811c436d, reports 72 tests, typecheck, lint, build, complete headless checks, sixteen hidden native Windows interaction checks, and 45 native captures passing with errors[]. The fresh capture manifest is work/sidebar-and-location-polish/remote-review/work/desktop-visual-review/manifest.json. These checks were not rerun by the documenter. Providers and clipboard are mocked, and records/resumes are synthetic.

Mac renderer simulations under work/sidebar-and-location-polish/remote-review/qa-output/renderer-1.5.0 were captured on GitHub Windows. Physical Mac font, scroller, and native-window behavior remain unverified. Packaged installer validation is a separate release CI gate. Version 1.6.6 preserves schema 10 and provider inference. No context, detector, doctor, app, or browser was run during this documentation handoff.

The public screenshot docs/screenshots/plan.png now uses the exact native Windows frame work/sidebar-and-location-polish/remote-review/work/desktop-visual-review/captures/plan-light-results.png. Its source path, GitHub run, and source commit are embedded in the PNG and read back. The documentation proof verifies decoded pixel identity after provenance embedding and scans both public screenshots for missing origins. Local round-1 and round-2 frames precede the form scroll fix and are superseded for this handoff.

### 1.6.7 score disclosure and screenshot refresh

The scoped finish review, recorded internally in work/score-disclosure-and-screenshots/finish-review.md, returned ship with no material fixes after inspecting ten valid current frames. Supplied lint, typecheck, build, and full headless renderer checks passed. The hidden native Windows manifest records 18 checks, 48 captures, and no errors. These gates were not rerun by the documenter.

The [six public screenshots](../../docs/screenshots/README.md) use exact capture pixels from a UI working tree identical to commit 6dcb4fe30c8a671d7b19b5d19ab7db3484b0a39f, with embedded source origins. Data and resumes are synthetic, and providers and clipboard are mocked. Physical Mac visual review is not claimed. Version 1.6.7 preserves schema 10. No context, detector, or doctor was rerun during this documentation handoff.

### 2026-10-04 analysis methods and credits

Analyze remains below Your CV, and Save stays outside document scrolling. Initial method setup offers Local server, Download a model, OpenAI API key, Anthropic API key, and Buy credits through the shared native modal. A ready local or personal-key method can proceed directly. Paid analysis always opens its maximum quote, or recovery of the already paid result with No additional credits. Changing the paid model requests a fresh quote; an expired quote is refreshed before analysis can begin.

The flow returns to the saved Plan analysis without changing its source fields, editable recommendations, separate Why and wording rationale, cancellation, or stale-result protection. No fallback substitutes a different provider. Full local model inputs, including Qwen, retain their existing path.

See [Analysis and credits](analysis-credits.md) for the approved flow and finish evidence. The supplied final run passed 91 Node tests, with lint, TypeScript, and both builds passing. The independent source and test review cleared paid recovery, partial refund duplication, and stale account wallet responses. No current Plan screenshot or native interaction run was made. Earlier capture claims remain historical; hosted paid integration and current visual rendering are unverified.

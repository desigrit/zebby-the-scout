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

## Shared navigation

The unchanged 46px circular zebra sits in a 54px accessible navigation toggle. The title region is 44px and reads only Zebby. Windows navigation spans it with 8px top padding; the image starts at y=12px. Mac navigation starts below it with 4px top padding; the image starts at y=52px. Native Windows controls and Mac traffic lights remain native. Expanded navigation is 210px, 176px at the 850px window breakpoint, and 72px at extreme logical widths of 650px or less. Explicitly collapsed navigation remains 96px. Database details appear only when expanded; Settings retains them in both states.

The toggle has action labels, expanded state, tooltips, and Enter or Space activation. Its local preference rolls back with an error if saving fails; toggling preserves drafts and destination. Destinations have 48px targets and 24px icons. Accepted activation navigates immediately and plays the existing offline Lottie animation for about 417ms. Reduced motion stays still; player failure retains the static icon. Completion, hiding, or a reduced-motion change restores the rest state. Desktop controls use the arrow cursor and text fields use the text cursor.

Windows scroll containers reserve a stable 12px gutter. The resting 2px thumb widens to 8px on hover, focus, or scrolling. Mac keeps native system scrollers. Physical macOS behavior has not been manually reviewed.

## Analysis, importance, and match

- Analyze remains below Your CV for new and previously analyzed plans. A quiet provider/model caption and minimal missing-input or provider hints explain readiness. The saved match retains its refresh action.
- During analysis, the current source controls and conflicting actions are temporarily disabled. Cancel reaches Ollama, OpenAI, or the CPU worker before persistence and preserves previous analysis. A committing or completed request rejects cancellation; bounded recent terminal IDs prevent a completed request from being falsely cancelled or replayed.
- Resume match is a directional estimate using the selected resume and posting. Why is a native disclosure with the saved evidence and gaps. Legacy scores retain their values and request a refresh when no explanation exists.
- Core ATS keywords are single-line inputs; Core resume themes are multiline fields. Rows are transparent at rest and use fine separators. Hover adds a quiet wash; focus adds the field fill and rust border/ring. Each row reserves a 48px independent importance column and a 26px Remove column.
- Keywords and themes stay side by side where possible. Each section copies its current edited values, exposes a copied status, and retains Add/Remove. A new row receives focus. Small editor widths can stack the columns.
- Importance estimates how much the job calls for each requirement, independently of resume support and overall match. Ratings range from 0 to 100, do not sum to 100, and are guidance rather than ATS or recruiter measurements.
- Older analyses retain text with Unrated importance. Edited or added terms remain Unrated until refreshed. Job changes clear importance; CV-only changes retain unchanged job importance. Job or CV source changes clear the prior match and its explanation, and stale analysis persistence is rejected.
- Suggested resume overview remains editable. What changed or No wording changes presents its separate saved rationale as read-only text. Analysis details expands provider and importance context on demand.

## Overview and persistence

New drafts start with the selected database's last saved Current CV Overview. Saving a plan or analysis updates that default. Existing plans retain their own overview. The default travels with the shared SQLite file.

Version 1.6.0 keeps schema 10, application and plan records, Notes, resumes, importance arrays, match explanations, and overview preferences. Existing older-file backup and migration behavior remains intact. There are no new weekly backups or pruning. Install version 1.4.1 or newer on both computers before sharing a schema 10 file.

Only SmolLM2 uses the compact heuristic profile. LFM2.5, Gemma, Qwen, OpenAI, and configured Ollama retain complete source inputs and full instructions with no automatic provider fallback. Provider settings, model downloads, appearance, and navigation expansion remain local to each computer. Existing Zebby artifact migration and update behavior are described in [the guide](../../docs/guide.md).

## Finish evidence

Current captures include light sources (internal record: `work/ember-implementation/round-2/captures/plan-light-top.png`), light recommendations (internal record: `work/ember-implementation/round-2/captures/plan-light-results.png`), and dark recommendations (internal record: `work/ember-implementation/round-2/captures/plan-dark-results.png`). The public Plan screenshot uses the light recommendations capture and embeds its synthetic native origin.

The pinned choices recorded here, from internal direction `work/ember-implementation/direction.md`, select Ember Applications and Settings and Rosewood's Plan composition in Ember colors. These are code concept references, not pixel reproduction requirements.

The full finish review (internal record: `work/ember-implementation/finish-review.md`) found two regressions. The finish verdict (internal record: `work/ember-implementation/finish-verdict.md`) marks both resolved and returns ship for that correction batch. It does not claim a new whole-surface audit. Final documentation and screenshot origins are recorded for this handoff.

Supplied final evidence reports 72 tests, lint, typecheck, build, complete headless regressions, ten native interaction checks, and 37 native captures passing. These were not rerun by the documenter. Native screenshots use synthetic applications, plans, and a dummy resume in an isolated hidden Windows Electron process. Provider outputs and clipboard are mocked; no real profile, credentials, models, or database were used. Both platform renderer simulations were checked, but physical macOS review and native installer validation remain outside this local evidence. CI handles installer gates separately.

The [UX health report](../../docs/ux-health-v1.6.0.md) records the resolved short-height role access and late cancellation findings, deliberately unchanged F01/F03 behavior, and the remaining low-severity observations. No numerical score or trend is claimed. One detector pass compared against the old system; no second detector, doctor, or context run was performed.

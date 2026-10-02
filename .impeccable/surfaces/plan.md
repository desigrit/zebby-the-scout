# Plan

## Direction contract

MODE: Operate.

THESIS: Turn a job posting into truthful CV priorities, then understand the saved resume match through its evidence and gaps. Each Core ATS keyword and Core resume theme retains a separate estimate of importance to the job.

OWN-WORLD: Preserve the approved Graphite Search Ledger, Zebby identity, native controls, platform fonts, and established layout. Neutral Graphite marks actions, information, focus, and selected surfaces. The unchanged circular zebra remains the navigation toggle; notices retain semantic green and amber.

STORY: Start with the last saved Current CV Overview, read or paste a posting, choose or upload a resume, and select Analyze below Your CV. Read Why beside the saved match, edit recommendations and overview, and save. Existing plans keep their own overview when selected again.

FIRST VIEWPORT: The 44px native title region reads only Zebby. A Graphite New plan action remains above the saved-plan rail and role editor. The editor proceeds from job fields to Your CV, its primary Analyze action and quiet model caption, then Resume direction. Resume match includes a native Why disclosure before the importance explanation and editable lists. Narrow windows move saved plans above the editor and stack the lists.

FORM: A scoped refinement of the approved operating ledger, retaining its widths, palette, artwork, and provider paths. The existing editable requirement and independent importance badge remain the signature. Analyze is present for every plan, including previously analyzed plans, once its required inputs are ready.

FINISH: The fresh v1.5.0 review returned ship and manager APPROVE across the complete diff and 37 current captures, with no material fixes. Its persistence, fidelity, ceiling, material_fixes, and keep sections are recorded in [the finish review](../review/navigation-updates-finish-review.md). Native installation remains unverified until release CI.

## Shared navigation

The unchanged 46px zebra sits in a 54px accessible toggle. Windows navigation spans the title region with 8px top padding and image y=12px. Mac navigation starts below the 44px native region with 4px top padding and image y=52px. Brand bottom padding is 12px. Expanded navigation is 210px, or 176px at the 850px window breakpoint; collapsed navigation stays 96px on Windows and Mac. An available-update action appears at the bottom in both states, followed by database details only when expanded. Current file details remain in Settings.

The native title region retains the established platform configuration and shows only Zebby. The toggle retains its expanded state, action labels, tooltips, Enter or Space activation, draft preservation, and destination preservation. Navigation preference saves locally and rolls back with an error on failure.

Destinations have 48px targets and 24px icons. Accepted click or keyboard activation navigates immediately and plays the destination's offline Lottie animation for about 417ms; Plan redraws clipboard rows. Reduced motion stays still, player failure keeps the static icon, and completion, hiding, or a reduced-motion change returns it to rest. Unmounting removes players and listeners. Clickable desktop controls use the arrow cursor; text fields retain the caret cursor.

Updates lives after Logs in Settings, with the installed version, manual check, available release, explicit download, progress, errors, and verified Restart to update. Restart protects open application forms, dialogs, and unsaved Plan edits, requires active analysis and settings requests to finish, saves the database, and stops the model engine. Automatic GitHub checks run on launch and focus after six hours.

## Analysis, importance, and match

- Analyze sits at the end of Your CV and starts analysis of the current plan, including a new draft or a previously analyzed plan. The selected provider or model appears as a quiet caption. Required inputs and provider readiness govern availability; analysis shows a busy spinner and prevents conflicting actions.
- The existing refresh icon remains beside a saved match result. Busy analysis replaces the score display with a progress ring and hides Why.
- Resume match is a directional estimate using the selected resume and posting. Why is a native collapsible disclosure with keyboard focus, containing the stored strongest evidence and main missing or weakly demonstrated requirements. It is separate from job importance and the generated overview's wording rationale.
- New analysis saves a nonempty explanation with the score. Legacy scores keep their values without invented notes and display: Refresh analysis to add an explanation for this saved score.
- Each keyword or theme has editable text, a read-only percentage or Unrated badge, and Remove. Add keyword and Add theme focus the new row. Keywords use single-line inputs; themes use multi-line fields.
- Importance estimates how strongly the job calls for a requirement, independently of resume support or match strength. Values range from 0 to 100, do not sum to 100, and are not recruiter or ATS measurements. New lists are ordered by importance and describe targets to support with truthful evidence.
- Older analyses retain text with Unrated importance. New or changed terms remain Unrated until refresh. Changing job fields clears job importance; unchanged terms retain their ratings when the job is unchanged.
- Changing the job or CV source clears the score and its explanation. CV-only changes retain unchanged job importance. The renderer hides stale values immediately, and guarded persistence rejects an analysis result if the saved plan changed while it ran.

## Overview and persistence

New drafts start with the selected database's last saved Current CV Overview. Saving a plan or analysis updates that default; existing plans keep their own stored overview. The default travels with the selected SQLite file after cloud sync.

Version 1.5.0 keeps schema 10 introduced in 1.4.0, with plans.match_notes, the importance arrays, and workspace_preferences.last_current_overview. This release adds no schema change. An older selected file receives a complete original before-v10 backup before migration. Existing application, plan, resume, Notes, importance, and overview data are preserved. The v9-to-v10 step does not repeat older migrations. Prior backups remain, without recurring weekly backups or pruning. Install version 1.4.1 or newer on both computers before sharing a schema 10 file.

Known legacy profiles and model downloads migrate into Zebby folders while keeping encrypted settings, accepted terms, and selected external cloud database paths. Internal database pointers are rewritten; original profile records and logs remain as recovery copies. Windows models use `%LOCALAPPDATA%\Zebby\Models`; Mac models use `~/Library/Application Support/Zebby/Models`. The internal package and installer identity stay unchanged. See [the guide](../../docs/guide.md) for the complete artifact migration and update workflow.

Only SmolLM2 retains the compact heuristic profile. LFM2.5, Gemma, Qwen, OpenAI, and configured Ollama receive complete inputs and full instructions, with no automatic fallback. The generated overview adapts current wording only where resume evidence supports it. Its own rationale explains wording changes or why the overview stayed unchanged.

## Finish evidence

Current Plan evidence includes [Windows light](../review/navigation-updates-1.5.0/plan-windows-light.png), [Why dark](../review/navigation-updates-1.5.0/plan-analysis-dark.png), [Mac collapsed dark simulation](../review/navigation-updates-1.5.0/plan-mac-collapsed-dark.png), and [navigation click motion](../review/navigation-updates-1.5.0/navigation-click-motion.png). The earlier match explanation and model-path review remains recorded in [the 1.4.0 finish review](../review/settings-plan-finish-review.md).

The [37-file manifest](../review/navigation-updates-1.5.0/capture-manifest.txt) includes the three README copies. The reviewer inspected the complete diff and every current capture, and independently passed 68 tests, typecheck, quiet lint, and diff checks. Four contact sheets summarize the same captures: [1](../review/navigation-updates-1.5.0/contact-1.png), [2](../review/navigation-updates-1.5.0/contact-2.png), [3](../review/navigation-updates-1.5.0/contact-3.png), and [4](../review/navigation-updates-1.5.0/contact-4.png). Parent validation covers immediate navigation, distinct click motion, reduced motion, update states, and canceled restarts that preserve unsaved edits.

All captures use synthetic state and the compiled renderer in headless Chromium on Windows. Mac filenames simulate the Mac renderer branch on Windows; they do not verify macOS fonts, chrome, or installation. No visible app or browser and no real settings, database, resumes, or installed models were used for documentation. Native NSIS replacement, DMG staging/replacement/reopening/rollback, Keychain upgrade behavior, and live provider inference remain unverified locally; native installation is a release CI gate. No detector ran.

Source grounding includes desktop/renderer/App.tsx, desktop/renderer/LocationEditor.tsx, desktop/renderer/base.css, desktop/renderer/desktop.css, desktop/renderer/NavigationButton.tsx, desktop/renderer/navigation-animations.ts, desktop/renderer/UpdateButton.tsx, desktop/release-updates.ts, desktop/self-update.ts, desktop/app-identity.ts, desktop/local-model-storage.ts, desktop/main.ts, desktop/bridge.ts, desktop/preload.ts, and the public guide and 1.5.0 release notes. The obsolete web-header preview has been removed from the design sidecar.

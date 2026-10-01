# Plan

## Direction contract

MODE: Operate.

THESIS: Turn a job posting into truthful CV priorities, then understand the saved resume match through its evidence and gaps. Each Core ATS keyword and Core resume theme retains a separate estimate of importance to the job.

OWN-WORLD: Preserve the approved Graphite Search Ledger, Zebby identity, native controls, platform fonts, and established layout. Neutral Graphite marks actions, information, focus, and selected surfaces. The unchanged circular zebra remains the navigation toggle; notices retain semantic green and amber.

STORY: Start with the last saved Current CV Overview, read or paste a posting, choose or upload a resume, and select Analyze below Your CV. Read Why beside the saved match, edit recommendations and overview, and save. Existing plans keep their own overview when selected again.

FIRST VIEWPORT: The 44px native title region reads only Zebby. A Graphite New plan action remains above the saved-plan rail and role editor. The editor proceeds from job fields to Your CV, its primary Analyze action and quiet model caption, then Resume direction. Resume match includes a native Why disclosure before the importance explanation and editable lists. Narrow windows move saved plans above the editor and stack the lists.

FORM: A scoped refinement of the approved operating ledger, retaining its widths, palette, artwork, and provider paths. The existing editable requirement and independent importance badge remain the signature. Analyze is present for every plan, including previously analyzed plans, once its required inputs are ready.

FINISH: The fresh v1.4.0 review returned ship across 34 supplied captures and scoped source, with no material fixes. Its persistence, fidelity, ceiling, material_fixes, and keep sections are present in [the finish review](../review/settings-plan-finish-review.md). This verdict covers source and the supplied renderer captures, recorded before the release build.

## Shared navigation

The unchanged 46px zebra sits in a 54px accessible toggle. The shared rail uses 12px top padding and 20px below the brand. Expanded navigation is 210px, or 176px at the 850px window breakpoint; collapsed navigation stays 96px on Windows and Mac. Only expanded navigation shows the current database footer. The collapsed rail contains destination icons without a database footer; current file details remain in Settings.

The native title region retains the established platform configuration and shows only Zebby. The toggle retains its expanded state, action labels, tooltips, Enter or Space activation, draft preservation, and destination preservation. Navigation preference saves locally and rolls back with an error on failure.

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

Version 1.4.0 uses schema 10, adding plans.match_notes to the existing importance arrays and workspace_preferences.last_current_overview. An older selected file receives a complete original before-v10 backup before migration. Existing application, plan, resume, Notes, importance, and overview data are preserved. The v9-to-v10 step does not repeat older migrations. Prior backups remain, without recurring weekly backups or pruning. Install version 1.4.0 on both computers before sharing the upgraded file.

Only SmolLM2 retains the compact heuristic profile. LFM2.5, Gemma, Qwen, OpenAI, and configured Ollama receive complete inputs and full instructions, with no automatic fallback. The generated overview adapts current wording only where resume evidence supports it. Its own rationale explains wording changes or why the overview stayed unchanged.

## Finish evidence

The [34-file manifest](../review/settings-plan-1.4.0/capture-manifest.txt) includes these 13 Plan and README captures:

- [Windows light](../review/settings-plan-1.4.0/plan-windows-light.png)
- [Windows dark](../review/settings-plan-1.4.0/plan-windows-dark.png)
- [Why light](../review/settings-plan-1.4.0/plan-analysis-light.png)
- [Why dark](../review/settings-plan-1.4.0/plan-analysis-dark.png)
- [CV actions light](../review/settings-plan-1.4.0/plan-cv-actions-light.png)
- [CV actions dark](../review/settings-plan-1.4.0/plan-cv-actions-dark.png)
- [Windows compact](../review/settings-plan-1.4.0/plan-windows-compact.png)
- [Windows narrow](../review/settings-plan-1.4.0/plan-windows-narrow.png)
- [Mac branch light simulation](../review/settings-plan-1.4.0/plan-mac-light.png)
- [Mac branch compact dark simulation](../review/settings-plan-1.4.0/plan-mac-compact-dark.png)
- [Windows collapsed light](../review/settings-plan-1.4.0/plan-windows-collapsed-light.png)
- [Mac branch collapsed dark simulation](../review/settings-plan-1.4.0/plan-mac-collapsed-dark.png)
- [README Plan](../review/settings-plan-1.4.0/readme-plan.png)

Wide Plan uses 1550 by 850, Windows compact 1050 by 900, and narrow and Mac compact 790 by 850 viewports; full-page images extend below the viewport. Why and CV images crop their respective sections. This documenter inspected CV actions light, Why dark, and Mac collapsed dark. Parent and reviewer opened and validated all 34 captures, produced headlessly in Windows Chromium with synthetic state. Mac captures exercise the Mac renderer branch on Windows.

Scoped source includes desktop/renderer/App.tsx, desktop/renderer/desktop.css, desktop/main.ts, desktop/bridge.ts, desktop/preload.ts, desktop/store.ts, desktop/diagnostic-log.ts, desktop/analysis-contracts.ts, desktop/basic-local-analysis.ts, package.json, and docs/guide.md. The fresh reviewer independently passed 58 tests, typecheck, lint with zero errors, and diff checks. Lint recorded three established image warnings plus one ignored exploratory-file warning. Parent supplied successful desktop build and headless renderer QA; reviewer inspected that evidence and QA source without rerunning the renderer.

No detector ran for this desktop task. No app, browser, real database, resumes, settings, or installed models were opened for documentation. Native installer upgrades, actual macOS fonts and chrome, Keychain upgrade behavior, and live provider inference remain unverified. Packaged inference and release CI are assessed separately from this documentation review. The review does not certify accuracy.

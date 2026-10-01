# Plan

## Direction contract

MODE: Operate.

THESIS: Read a job posting, prioritize truthful CV evidence, and retain a separate resume-to-role match estimate. Each Core ATS keyword and Core resume theme displays its independent estimated importance to the job beside editable text.

OWN-WORLD: Preserve the Search Ledger layout, native controls, and platform fonts. Use the approved full circular sunglasses zebra, coral actions, cyan importance and focus accents, cream surfaces, and charcoal sidebar. Saved and unsaved notices retain semantic green and amber.

STORY: Start a role brief with the last saved Current CV Overview, read or paste a posting, select a saved resume or upload one, and analyze with the chosen provider. Edit keywords, themes, and the tailored overview, then save the plan. Existing role briefs retain their own overview when selected again.

FIRST VIEWPORT: The left Plan, Applications, and Settings navigation remains in place. A coral New plan action sits above saved plans beside the role editor. The editor begins with job posting fields, then Your CV and Resume direction. A separate Resume match summary precedes the importance explanation and two editable recommendation lists. As the window narrows, saved plans move above the editor and the two lists stack.

FORM: An approved expansion of the existing operating ledger, without a replacement layout or new concept seed. The signature interaction is an editable requirement with a separate, read-only importance badge that becomes Unrated when its text or job source changes. The native launch width is 1550 device-independent pixels, 300 wider than the previous 1250 width; height remains 850. Both are capped to the primary display work area.

FINISH: The fresh v1.2.0 full renderer review returned ship, with no material fixes, after refreshed captures settled their theme transitions. Its persistence, fidelity, ceiling, material_fixes, and keep sections are present in [the finish review](../review/zebra-finish-review.md). The craft ceiling was reached within the captured renderer scope. The approved token system is recorded in DESIGN.md and .impeccable/design.json.

## Importance and match behavior

- Every keyword and theme has editable text, a separate read-only percentage or Unrated badge, and a Remove control. Add keyword and Add theme focus the new editable row. Keywords use single-line inputs; themes use multi-line fields.
- Importance is an integer estimate from 0 to 100 of how much the job calls for that requirement. Higher values mark stronger CV priorities. It is derived from the posting, independently of the selected resume's support or coverage. The values do not sum to 100 and are not recruiter ratings or measurements from an ATS.
- Recommendations identify the terms, experience, and outcomes an ideal candidate's CV should demonstrate. They are targets to support with truthful evidence, not claims that the user already has that experience. Newly generated lists are ordered by importance.
- Resume match remains a separate directional fit estimate using evidence in the selected resume and job. Its number does not determine the importance badges.
- Older analyses keep their existing text with Unrated importance. New or changed terms stay Unrated until analysis refreshes them. Unchanged text retains its prior rating when the job is unchanged. Changing the listing link, company, title, team, locations, or job description clears all job-importance ratings.
- Changing Current CV Overview or the selected/uploaded resume clears the match score while retaining unchanged job-importance ratings. Refresh analysis supplies new estimates. Relevant disabled controls prevent edits during analysis.
- Labels and tooltips identify each read-only badge as importance to the job. The nearby explanation and Unrated text keep its meaning visible without relying on color.

## Overview and data persistence

New drafts start with the selected database's last saved Current CV Overview. Saving a plan or its analysis updates the default. Existing plans keep the overview stored with that plan; creating a new draft does not replace older plans' overviews. The saved default travels with the selected SQLite file when cloud sync completes.

Schema v9 adds keyword_importance_json and theme_importance_json beside the existing text arrays and workspace_preferences.last_current_overview for the default. Migration seeds that preference from the most recently updated saved plan when one exists and takes a full source-file backup with a before-v9 name. The v8-to-v9 step does not repeat the earlier Notes migration. Existing application, plan, and resume tables are preserved.

Analysis routing and model-download controls retain their existing paths. Only SmolLM2 uses the compact heuristic importance and match profile. LFM2.5, Gemma, Qwen, OpenAI, and configured Ollama receive complete inputs and full instructions, without an automatic fallback. The generated overview adapts the user's current wording to the role only where resume evidence supports it.

## Finish evidence

The fresh reviewer validated these eight current Plan captures:

- [Windows light](../review/plan-windows-light.png)
- [Windows dark](../review/plan-windows-dark.png)
- [Analysis light](../review/plan-analysis-light.png)
- [Analysis dark](../review/plan-analysis-dark.png)
- [Windows compact](../review/plan-windows-compact.png)
- [Windows narrow](../review/plan-windows-narrow.png)
- [Mac branch light simulation](../review/plan-mac-light.png)
- [Mac branch compact dark simulation](../review/plan-mac-compact-dark.png)

Wide Plan captures use a 1550 by 850 viewport and show the full page. Windows compact uses 1050 by 900; narrow and Mac compact use 790 by 850. All were rendered in headless Chromium on Windows with synthetic data and the current compiled renderer. The Mac captures exercise that platform branch on Windows, not native macOS rendering. The capture helper waits for finite transitions and fonts. The documenter directly inspected Windows light, both analysis crops, and the Mac compact dark simulation, with the fresh report covering the complete matrix.

Source checks cover desktop/renderer/PlanRecommendations.tsx, desktop/renderer/App.tsx, desktop/renderer/desktop.css, app/globals.css, desktop/analysis-contracts.ts, desktop/plan-importance.ts, desktop/store.ts, desktop/main.ts, and scripts/build-desktop.mjs. Legacy and invalidated ratings, overview reuse, and migration behavior are supported by source and supplied QA assertions; they were not each captured as separate visual states.

The parent reports 52 automated tests, typecheck, lint, desktop production build, and headless UI actions and overflow checks passing. Hidden synthetic CPU Plan, match, authentication, and shutdown checks passed for SmolLM2, LFM2.5, and Gemma. They establish those exercised paths, not inference accuracy. No detector ran for this desktop task. No desktop app, visible browser, real settings, database, resumes, or installed models were opened for review or documentation. Native chrome, native macOS fonts, installer lifecycle, and inference accuracy are outside the renderer verdict; native release builds remain a separate gate.

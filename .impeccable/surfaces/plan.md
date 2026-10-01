# Plan

## Direction contract

MODE: Operate.

THESIS: Read a job posting, prioritize truthful CV evidence, and retain a separate resume-to-role match estimate. Each Core ATS keyword and Core resume theme displays its independent estimated importance to the job beside editable text.

OWN-WORLD: Preserve the Search Ledger layout, native controls, and platform fonts. Use Zebby and the approved Graphite palette for neutral actions, information, focus, and selected surfaces in light and dark appearance. The full circular sunglasses zebra remains unchanged and toggles labeled or icons only navigation. Saved and unsaved notices retain semantic green and amber.

STORY: Start a role brief with the last saved Current CV Overview, read or paste a posting, select a saved resume or upload one, and analyze with the chosen provider. Edit keywords, themes, and the tailored overview, then save the plan. Existing role briefs retain their own overview when selected again.

FIRST VIEWPORT: The shared 44px native title region reads only Zebby above the left Plan, Applications, and Settings navigation. The sidebar has no wordmark. A Graphite New plan action sits above saved plans beside the role editor. The editor begins with job posting fields, then Your CV and Resume direction. A separate Resume match summary precedes the importance explanation and two editable recommendation lists. As the window narrows, saved plans move above the editor and the two lists stack.

FORM: An approved expansion of the existing operating ledger, without a replacement layout or new concept seed. The signature interaction is an editable requirement with a separate, read-only importance badge that becomes Unrated when its text or job source changes. The native launch width is 1550 device-independent pixels, 300 wider than the previous 1250 width; height remains 850. Both are capped to the primary display work area.

FINISH: The fresh v1.3.0 full renderer review returned ship across all 32 supplied captures and scoped source, with no material fixes. Its persistence, fidelity, ceiling, material_fixes, and keep sections are present in [the finish review](../review/zebby-finish-review.md). The craft ceiling was reached within the captured renderer scope. DESIGN.md and .impeccable/design.json record the exact approved Graphite tokens and shared native shell.

## Shared navigation

The unchanged zebra is a 54px button with a 46px image. Expanded navigation is 210px, or 176px at the 850px window breakpoint; icons only navigation is 96px on Windows and Mac. The native title region blends with the top of the sidebar, and macOS traffic lights retain their reserved space. The title shows only Zebby.

The toggle exposes its expanded state and Expand navigation or Collapse navigation action label, supports Enter and Space, and leaves the current Plan draft and destination intact. Navigation labels and tooltips remain accessible in either state. The preference is saved on each computer; failure restores the previous state and shows an error. The collapsed footer opens Database settings.

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

The fresh reviewer validated these 11 current Plan captures as part of the full 32-capture matrix:

- [Windows light](../review/plan-windows-light.png)
- [Windows dark](../review/plan-windows-dark.png)
- [Analysis light](../review/plan-analysis-light.png)
- [Analysis dark](../review/plan-analysis-dark.png)
- [Windows compact](../review/plan-windows-compact.png)
- [Windows narrow](../review/plan-windows-narrow.png)
- [Mac branch light simulation](../review/plan-mac-light.png)
- [Mac branch compact dark simulation](../review/plan-mac-compact-dark.png)
- [Windows collapsed light](../review/plan-windows-collapsed-light.png)
- [Mac branch collapsed dark simulation](../review/plan-mac-collapsed-dark.png)
- [README Plan crop](../review/readme-plan.png)

Wide Plan captures begin at a 1550 by 850 viewport; full-page images extend below it. Windows compact uses 1050 by 900, and narrow and Mac compact use 790 by 850. Analysis images crop the analysis section. All were rendered in invisible headless Chromium on Windows with synthetic data and the current compiled renderer. The Mac captures exercise that platform branch on Windows, not native macOS rendering. The capture helper waits for finite transitions and fonts. This documenter directly inspected Windows light and the Mac collapsed dark simulation; the independent report covers the complete matrix.

Current shell and palette evidence comes from app/globals.css, desktop/renderer/desktop.css, desktop/renderer/App.tsx, desktop/main.ts, desktop/bridge.ts, desktop/window-appearance.ts, desktop/app-identity.ts, and package.json. Existing importance, invalidation, overview reuse, provider routing, and schema v9 behavior remain unchanged. Version 1.3.0 performs no data migration.

The independent reviewer passed 56 tests, typecheck, lint with zero errors and three existing image warnings, and diff whitespace checks. The reviewer inspected supplied renderer/build evidence and QA source rather than rerunning the build or renderer. Parent headless QA confirms toggle keyboard activation, draft preservation, preference success and failure, and the database footer action. These are supplied verification results, not additional runtime checks by this documenter.

No detector ran for this desktop task. No desktop app, visible browser, real database, resumes, local settings, or installed models were opened for documentation. Native installer upgrades, native chrome, actual macOS fonts and controls, and a Keychain decryption roundtrip remain untested; release CI is a later gate. The renderer verdict does not certify inference accuracy.

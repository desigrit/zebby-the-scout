> Publication note: This is the original October 2, 2026 comparison, preserved as an archive. After reviewing it, I selected Ember colors, Ember Applications and Settings, and Rosewood Plan, while retaining the existing New Application form and side-by-side keyword/theme sections. The original shortlist, unapproved status and proposed findings below describe the study before that choice. [Read the selection decisions](https://github.com/desigrit/zebby-the-scout#choosing-a-design-direction).

Method: dual-agent (A: /root/zebby_ux_assessment_a · B: /root/zebby_ux_assessment_b)

# Zebby UX review and nine design directions

October 2, 2026 · Zebby 1.5.0 · revision 6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f

Analysis and proposals only. The app and real database were not changed. These concepts are not approved product changes.

## Overall impression

Zebby has a clear three-part structure, a recognizable zebra, and useful job-search features. The biggest opportunity is a continuous role workflow: capture the posting, choose the exact resume, review the evidence, then save with confidence.

## Design specificity

Partly authored for the product. Listing capture, saved job briefs, resume versions, and match explanations belong to this workflow. The first viewport still gives generic forms and statistics more prominence than the next useful action. Keep the small navigation and make the role, resume, evidence, and completion state the center of the interface.

## Design health

**22/40: Acceptable, with significant improvements needed.** Qualitative Nielsen heuristic judgments, 0-4. All ten apply; not a measured usability or model-quality benchmark.

| Heuristic | Score | Main issue |
|---|---:|---|
| System status | 2/4 | Save state and feedback can be far from the action. |
| Real-world language | 3/4 | Jobs and resumes are familiar; analysis setup is technical. |
| Control and freedom | 2/4 | Several routes can lose unsaved edits. |
| Consistency | 2/4 | Resume selection, autofill, and save behavior differ. |
| Error prevention | 2/4 | Competing resume sources can attach the wrong file. |
| Recognition | 2/4 | Full role identity and match evidence can be hidden. |
| Efficiency | 2/4 | Long forms and missing common task shortcuts. |
| Minimal design | 3/4 | Calm structure, with excessive form and card depth. |
| Error recovery | 2/4 | Some failures are generic, distant, or suppressed. |
| Help | 2/4 | First analysis and switching computers need short task guidance. |

## What is working

- Three clear destinations, a working zebra collapse control, native title-bar controls, and brief icon motion that respects reduced motion.
- Editable analysis, a keyboard-operable Plan Why disclosure, a separate overview wording rationale, and a retained current overview.
- Optional application fields, today as the default, duplicate detection, inline status, and genuine Confirm/Cancel dialogs. Notes kept keyboard focus inside the dialog and returned it after Escape in the tested wide window.

## The first five changes

### 1. [P1] Preserve drafts through interruptions

**Why:** Setup, tab changes, replacement, close, and late request responses can discard or overwrite text.

**Proposed change:** Recover drafts across destinations. Return to the same role after setup. Version in-flight submissions so a response cannot replace newer edits.

Findings F01, F02, F03, F30. Impeccable: harden.

### 2. [P1] Make one resume the effective selection

**Why:** Applications can show a saved resume and a pending upload together. The pending upload wins even after a later dropdown selection.

**Proposed change:** Make the choices mutually exclusive, as Plan already does. Show the exact filename/version that will be attached and scored.

Findings F14. Impeccable: harden.

### 3. [P1] Use the available editor width and retain reading density

**Why:** At 851 px, Plan has 127 px metadata fields. Laptop application cards more than double the page length. Long text is trapped in 68-72 px fields.

**Proposed change:** Adapt using the editor width, switch the plan chooser earlier, correct the textarea sizing rules, and use compact intermediate record rows.

Findings F05, F06, F15. Impeccable: adapt, layout.

### 4. [P1] Keep actions and feedback in view

**Why:** Analyze and Save are several screens from the start, even before results. Distant notices make success and failure easy to miss.

**Proposed change:** Use a contextual save bar, compact optional details, and feedback near the initiating action. Keep Your CV and Analyze together.

Findings F07, F08, F16, F31. Impeccable: layout, distill.

### 5. [P1] Make the first analysis straightforward

**Why:** Someone without a GPU, server, or API key starts with unfamiliar provider setup. Missing requirements and failed discovery need clearer recovery.

**Proposed change:** Lead with On this computer, OpenAI API, or Ollama server. Show readiness, download size, and memory guidance before commitment. Recommend a model only after product testing.

Findings F10, F22, F23, F24, F25. Impeccable: onboard, clarify.

## Rendered evidence

Native Windows Electron captures from a separate sample database.

[Plan at 851 px](evidence/plan-width-851.png)

[Applications at laptop width](evidence/applications-width-1260.png)

[Two simultaneous resume choices](evidence/14-resume-reselect.png)

[Plan at 200% content zoom](evidence/plan-zoom-2.png)

No root horizontal overflow was confirmed. The narrow-window issues are editor compression and excessive vertical depth.

## Full proposed change list

P1: significant difficulty or likely support problem. P2: a usable workaround exists. P3: refinement. No P0 was established.

### Shared

#### F01 [P1] Drafts can be lost on close, navigation, replacement, or Notes dismissal.

Recover drafts across tabs and close. Use Save / Discard / Keep editing for explicit replacement.

**Evidence:** Source-established risk; real data was not used to reproduce loss. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L631). Independent review references: G1, P1, A2; B05.

#### F02 [P1] Saving or analysis can replace edits made while the request is running.

Version each submitted draft and preserve later edits, or temporarily protect the submitted inputs.

**Evidence:** Busy state observed; overwrite consequence traced in source. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L204). Independent review references: P2; B06.

#### F04 [P2] New, Save, Search, and content zoom have no clear task shortcuts or discoverable zoom control.

Add platform-appropriate shortcuts, focus the new editor, and verify native text-editing behavior on Mac.

**Evidence:** Source review. Programmatic zoom worked; native Mac shortcuts were not tested. [../main.ts](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/main.ts#L503). Independent review references: G2; B25.

#### F28 [P2] Scrolling is visually noisy and sometimes nested in the same direction.

Use one main scroll region with a thin indicator that expands on hover/focus. Keep inner indicators quiet, but retain keyboard access, continuation cues, and OS always-visible preferences.

**Evidence:** Native Plan/sidebar/text areas observed. Do not globally hide scrollbars or apply web styling claims to native Mac controls. [desktop.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/desktop.css#L53). Independent review references: P3, P5; B03, B09.

#### F29 [P1] Status selects override the solid keyboard focus outline with a weak shadow.

Restore a contrasting focus outline in light and dark table/card layouts and verify it on a focused native control.

**Evidence:** Source-color calculation: about 1.32:1 light, 1.61:1 dark. Focused rendering remains to be verified. [base.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/base.css#L295). Independent review references: B07.

#### F31 [P2] Technical errors and top-of-page notices can be distant from the failed action.

Place cause plus one recovery action beside the trigger, and keep raw details in logs. Retain saved-application versus failed-analysis distinction.

**Evidence:** Error branches source reviewed; synthetic 503 screenshot does not establish exact alert bounds. [../main.ts](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/main.ts#L184). Independent review references: P4, S3; B21.

#### F33 [P2] Removing location/recommendation rows has no deliberate focus destination.

Use stable item identities; return focus to the next item or Add action. Keep additions/removals reversible where useful.

**Evidence:** Source-established. Adding a recommendation already focuses its new input. [PlanRecommendations.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/PlanRecommendations.tsx#L26). Independent review references: B24.

#### F34 [P2] Long analysis needs a clear, restrained waiting state.

Keep one spinner with an accessible progress label, matching the user preference. Put feedback near the action. Offer Cancel only when the backend really supports cancellation.

**Evidence:** Simulated busy state. Real latency and cancellation were not tested. Avoid duplicate Calculating/Analyzing labels. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L331). Independent review references: B32, user preference.

#### F35 [P3] Important reading text is often 10-12 px; small row actions are crowded.

Use about 14 px for results and explanations, smaller type for metadata, and more generous focus/hit areas where space permits. Preserve desktop density.

**Evidence:** Source and geometry observed. Do not impose mobile 44 pt targets on all desktop controls. [base.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/base.css#L137). Independent review references: Minor A; B28.

#### F36 [P3] Empty role metadata produces weak action labels; notes presence uses a tiny dot.

Use Untitled role / Unknown company consistently, include Has notes in the accessible state, and name the role in Plan deletion.

**Evidence:** Source-established; not an assistive-technology session. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L834). Independent review references: A11; B29.

#### F40 [P3] Long combined locations can be silently cut at the storage limit.

Prevent an addition that exceeds the limit or show a clear limit message while retaining complete names.

**Evidence:** Source-established extreme input edge case, not exercised. [../../lib/locations.ts](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/lib/locations.ts#L11). Independent review references: B33.

#### F41 [P3] Some size/color/radius values have drifted from the documented system.

Reconcile tokens and documentation after a direction is selected. Keep semantic status colors and intentional small component shapes.

**Evidence:** Detector advisories corroborate documentation drift, not 147 user-facing bugs. [desktop.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/desktop.css#L1). Independent review references: Detector, 147 advisories.

### Plan

#### F03 [P1] Following analysis setup from an unsaved Plan leads to a discard decision.

Keep the Plan during setup and return to the same role, resume, and position.

**Evidence:** Source-established flow; setup controls observed. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L217). Independent review references: P1; B05.

#### F05 [P1] The three-column layout survives until the editor is too narrow.

Use container width, move the saved-plan chooser earlier, and stack link and metadata controls before compression.

**Evidence:** Observed at 851/850 px: metadata fields change from 127 to 272 px. [desktop.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/desktop.css#L52). Independent review references: P3; B02.

#### F06 [P1] Generic CSS defeats intended textarea minimum heights.

Make field-specific sizes win. Give descriptions and overviews useful reading height plus an expanded editor. Reduce surrounding form depth.

**Evidence:** Observed Plan fields 72 px; Application description 68 px. Specificity traced in source. [base.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/base.css#L171). Independent review references: P5, A10; B03.

#### F07 [P1] Analyze and Save are below the first viewport even on a new Plan.

Bring Your CV higher; keep Analyze beside it and Save/save state in a persistent context bar.

**Evidence:** 1550×880 fixture: Analyze y=1271, Save y=2549; document 2720 px tall. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L330). Independent review references: P4; B01.

#### F08 [P2] Saved-plan search scrolls away; narrow rail adds another scrolling region.

Pin library search, retain the full searchable collection, and use a compact single-axis chooser at small widths.

**Evidence:** Observed 13 saved plans. Off-screen rail cards are intentional scrolling, not root overflow. [desktop.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/desktop.css#L53). Independent review references: P3; B09.

#### F09 [P2] Ellipsized saved titles and a generic Role brief heading weaken role identity.

Use the selected title and company in the editor, with full text available on focus or in details.

**Evidence:** Observed long-title fixture. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L278). Independent review references: P6; B12.

#### F10 [P2] Disabled Analyze describes every prerequisite instead of only what is missing.

Show the actual missing item. Distinguish saving from analysis requirements; consider a pasted-only draft as a separate product choice.

**Evidence:** Source validation and new-Plan helper reviewed. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L91). Independent review references: P7; B13.

#### F11 [P2] Switching a listing can retain the previous role metadata.

Track fetched versus manually edited values. Preview or explain replacement when moving to another posting.

**Evidence:** Source-established. Old metadata remains while automatic fill only populates blanks. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L115). Independent review references: P8; B23.

#### F12 [P2] All keywords and themes are immediately editable, adding many fields and controls.

Start with a readable result summary and an Edit action. Preserve editable items, importance percentages, and truthful wording.

**Evidence:** 12-keyword/6-theme fixture has 38 recommendation controls. Upper set reaches 54. [PlanRecommendations.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/PlanRecommendations.tsx#L21). Independent review references: B08.

#### F13 [P2] Job importance, resume match, and ideal overview labels can imply the wrong meaning.

Use a suggested overview label. Explain independent job-importance estimates, separate them from resume match, and avoid implying hiring probability or an actual ATS-system result.

**Evidence:** Current result labels and help text reviewed. Labels remain proposals for the user to choose. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L359). Independent review references: P9; B15, B16.

#### F32 [P2] Renderer field limits do not match validation, leading to a generic rejection.

Align lengths with validation and mark the specific field with its permitted length.

**Evidence:** Source-established; extreme-length entries were not executed. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L294). Independent review references: B22.

### Applications

#### F14 [P1] A pending upload overrides a later saved-resume dropdown selection.

Clear the alternate input on each choice and show one effective resume. Reuse the working Plan contract.

**Evidence:** Displayed conflict observed in isolated window. Save precedence traced, conflicting form not saved. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L436). Independent review references: A1; B04.

#### F15 [P1] The card breakpoint creates an excessive density change.

Use compact two-line records between table and small-window layouts; place secondary detail behind an expander or inspector.

**Evidence:** 36 records: 5431 px at 1550 width, 12737 px at 1260 width, about 2.35 times as long. [base.css](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/base.css#L319). Independent review references: A4; B10.

#### F16 [P2] Every optional field lies on the path to Save.

Make link-first capture concise, put optional fields under Add details, and keep Save/Cancel visible. Preserve completely optional data.

**Evidence:** Save application starts at y=1003 in an 880 px-high fixture window. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L704). Independent review references: A3; B01.

#### F17 [P2] Match rationale is a hover title on a non-focusable score.

Provide a keyboard-operable Why disclosure or detail view beside the score, distinct from refresh.

**Evidence:** Source-established accessibility limitation. Native tooltip painting was not verified. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L796). Independent review references: A5; B11.

#### F18 [P2] Truncated resume names conceal the version, and the click opens Save copy rather than the file.

Show meaningful filename/version identity, expose full text by focus/details, and label the actual file action.

**Evidence:** Source and wide records observed; native picker not exercised. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L809). Independent review references: A6; B12.

#### F19 [P2] Filtered counts still show the total; an empty result has no reset.

Show N of total, add Clear filters, and define whether dropdown counts include the text query.

**Evidence:** Company-filter and no-results fixtures observed. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L264). Independent review references: A7; B26.

#### F20 [P2] Manual Fill from link can overwrite corrected metadata without preview.

Preserve manual edits or show the proposed replacements before applying them.

**Evidence:** Source-established. Automatic and manual fill use different replacement rules. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L328). Independent review references: A8; B23.

#### F21 [P2] Scoring help promises a match for a resume, but usable posting text is also needed.

Show scoring readiness separately from saving. Explain which description will be used and why optional scoring did not finish.

**Evidence:** Source checks require posting text; provider calls were simulated. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L660). Independent review references: B14.

#### F38 [P3] Summary match lacks a denominator and This week can count future dates.

Show average of N scored roles, clarify manual versus analyzed scores where useful, and bound the intended date range.

**Evidence:** Source-established statistics edge cases. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L245). Independent review references: B30.

#### F39 [P3] Lookup says Saved a copy before the application has been saved.

Say Listing text added to this draft; Save to keep it.

**Evidence:** Source-established copy timing; separate from the real offline-copy persistence feature. [ApplicationDashboard.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/ApplicationDashboard.tsx#L345). Independent review references: A9; B27.

### Settings

#### F22 [P1] Provider setup starts with technical terms rather than a path to first analysis.

Use an ordinary Analysis source selector: On this computer, OpenAI API, Ollama server. Show model size, memory guidance, quality tradeoff, and readiness before selection.

**Evidence:** Observed uninstalled/download/license states. No model-quality benchmark. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L511). Independent review references: S1; B17.

#### F23 [P2] Empty lists can represent a load failure, not an empty collection.

Distinguish No saved plans, No models installed, and Could not connect. Give a direct Retry next to the failed section.

**Evidence:** Initial provider/library error branches traced in source. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L409). Independent review references: S2; B20.

#### F24 [P2] Selecting a model can immediately commit to a multi-gigabyte download.

Make download size and consequence visible before selection. An explicit Download and use step is a product decision; keep Pause, Resume, Retry, and license acceptance.

**Evidence:** Approved current behavior reviewed in source; real download not performed. [LocalModelsSettings.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/LocalModelsSettings.tsx#L66). Independent review references: S5; B18.

#### F25 [P2] The data destination is too far from the analysis action.

Keep a quiet source/model label beside Analyze or automatic scoring, with concise expandable data-use detail. An Ollama server may be remote.

**Evidence:** Provider-specific disclosure and configured-server behavior reviewed in source. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L380). Independent review references: B19.

#### F26 [P2] Storage, model, and setup copy repeats procedures but gives limited pre-selection suitability.

Keep necessary size/license information; collapse advanced storage/server detail and tighten repeated instructions.

**Evidence:** Local-model fixtures and catalog reviewed. Recommendations need measured product evidence. [LocalModelsSettings.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/LocalModelsSettings.tsx#L56). Independent review references: S5; B17.

#### F27 [P2] Database help repeats Open/Create but misses the switching-computers task.

Use one line: Quit Zebby and wait for file sync before switching computers. Keep current path, Open, and Create new.

**Evidence:** Existing session authorization and database workflow. Real database untouched. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L494). Independent review references: S4.

#### F30 [P2] Some values apply immediately while URL, model name, and key require Save.

Use section-local forms, Enter to submit, a clear dirty state, and nearby saved feedback. Retain immediate appearance preview.

**Evidence:** Source review; settings loss paths not reproduced on real profile. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L511). Independent review references: S3; B31.

#### F37 [P3] Missing API key looks like success, and session-only storage still says Save.

Use neutral setup-needed styling. Say Use for this session when secure persistent storage is unavailable.

**Evidence:** Missing-key fixture and secure-storage branches reviewed. [App.tsx](https://github.com/desigrit/zebby-the-scout/blob/6c52d838c1daae9b8d3c96f5fcb4247995e6bc0f/desktop/renderer/App.tsx#L538). Independent review references: Minor A; B27.

## Copy to tighten

These alternatives are proposals. Keep necessary requirements, data destination, consent, and recovery details.

| Current | Proposed | Reason |
|---|---|---|
| Role brief | Selected role title + company | Establishes the item being edited. |
| Current CV Overview | Current resume overview | Sentence case and consistent terminology. |
| Ideal candidate CV overview | Suggested resume overview | Tailors the real applicant rather than implying a fictional ideal. |
| Generic Analyze prerequisites | Choose a resume to analyze this role | Show only missing requirements; example applies when the resume is the missing item. |
| Built-in local model / Ollama local model | On this computer / Ollama server | Names how analysis runs. Keep technical model names in the model selector. |
| Repeated ATS/theme count instructions | 12 keywords / 6 themes | Counts help orientation without asking the user to meet an arbitrary quota. |
| Importance helper paragraphs | Estimated job importance. Each rating is independent. | Keep expanded detail explaining that these are not match or measured ATS scores. |
| Saved a copy | Listing text added to this draft | Describes actual persistence timing. |
| 36 applications after filtering | 12 of 36 applications | Reflects the visible result. |
| Database procedure paragraph | Quit Zebby and wait for file sync before switching computers. | One useful task instruction. |
| Long posting placeholder | Paste job description | Let the field and adjacent controls explain the basic action. |
| Logs explanation and redundant settings help | Open logs folder · Report an issue | Keep the already approved always-on error logging. |
| Analyze again / duplicated loading text | Refresh icon / one spinner | Retain user-approved refresh and spinner conventions. |
| Auto | System | Clearer appearance terminology. |

## Persona red flags

### Frequent applicant

Capture several roles, attach the right version, update status, and find the next item.

The competing resume choices, long optional form, abrupt card density, and missing New/Save/Search shortcuts slow repetitive work.

### First-time CPU-only user

Paste a posting and obtain a first useful analysis.

The initial Ollama setup, unfamiliar provider choices, generic missing requirements, and setup detour can interrupt or lose the draft.

### Keyboard or magnification user

Find a role, read its match evidence, edit, and save.

Applications Why is hidden in a non-focusable tooltip; full filenames are truncated; status focus is weak by source calculation; at 200% the chooser/statistics consume much of the first view.

## Cognitive load

- First analysis has high qualitative setup load: the user must understand the provider, choose a model, know readiness, keep a draft, and locate Analyze. This is where a short guided task can help.
- Routine application entry has moderate load: all optional fields appear at once, and two resume inputs can disagree. Compact capture plus one effective resume reduces decisions.
- Reading generated results has unnecessary edit load: the fixture exposes 38 controls before the rest of the form. Review first, then edit, preserves capability with a calmer default.
- The 13-plan collection needs search and full identity, not an arbitrary smaller limit. The five statistics are information rather than five equivalent action choices.

## Emotional journey

Entry is approachable. The low point is leaving a partially completed Plan for setup or scrolling through long forms without a visible next action. The strongest moment is a clear match with useful Why evidence. End the task with a nearby saved state and an obvious next role, rather than a distant notice.

## Nine directions

Three warm, three crisp, and three balanced concepts. All keep a neutral reading canvas and use color for actions, selection, activity, and semantic states. Palettes and layout patterns can be combined after selection.

| Direction | Family | Accent | Pattern | Best for | Tradeoff |
|---|---|---|---|---|---|
| Ember | Warm | #A64A34 | A focused list with a persistent role inspector. | Staying focused on one role while browsing the rest. | The inspector uses some horizontal space. |
| Honey | Warm | #825C08 | An agenda grouped by date, with a guided Plan flow. | Applying to several roles every day. | Planning is split into steps rather than one long view. |
| Rosewood | Warm | #91465F | Company collections and a clean, document-like Plan. | Managing several roles at the same company. | Company groups add another level to scan. |
| Beacon | Crisp | #2555BF | A precise table, compact controls, and a role detail drawer. | Fast comparison and keyboard-heavy use. | A table needs an adaptive list at smaller widths. |
| Tide | Crisp | #0D746D | Status tabs for tracking, focused pages for preparing a CV. | Knowing what needs attention at each stage. | Switching Plan views hides some context. |
| Orchard | Crisp | #2E704C | A hiring-stage board with a compact preparation worklist. | Tracking conversations and interviews. | A board shows fewer records and relies on details for dates and resumes. |
| Olive | Balanced | #626F37 | A quiet ledger with details expanding inside each record. | A familiar tracker with less visual noise. | Expanded records push the next rows down. |
| Amethyst | Balanced | #74519D | A compact worklist beside an inspector with tabbed results. | Editing one resume while referencing several saved plans. | Result tabs make some generated content one click away. |
| Signal | Balanced | #AD4C39 | A compact toolbar, clear records, and an adaptive Plan workbench. | A warmer evolution of Zebby with little relearning. | Less visually adventurous than the board or guided flow. |

My shortlist: Signal for a warmer familiar workflow, Ember for focused role inspection, Beacon for dense comparison. The shortlist is a recommendation, not a selected direction.

[Interactive comparison](index.html) · [Gallery image](nine-directions.png)

## Real patterns to borrow

- [WinUI scrolling](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/scroll-controls): Use a narrow indicator that expands for interaction; avoid obscuring controls.

- [Apple scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views): Keep continuation apparent, use platform scrolling conventions, and avoid competing scroll views in the same direction.

- [Things Slim Mode](https://culturedcode.com/things/support/articles/3238254/): A quiet collapsible sidebar and focused work area.

- [Things Quick Entry](https://culturedcode.com/things/support/articles/2249437/): A fast capture path with optional context instead of a large mandatory form.

- [Linear Peek](https://linear.app/docs/peek): Inspect a record without losing place in the collection.

- [Linear filters](https://linear.app/docs/filters): Keep filtering clear and purposeful.

- [Linear board layout](https://linear.app/docs/board-layout): Use a board as an optional stage-focused pattern, with an honest density tradeoff.

- [Raycast Action Panel](https://manual.raycast.com/action-panel): Make secondary actions and keyboard access discoverable.

- [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): Reference for the source-calculated status focus concern.

- [Electron menu roles](https://www.electronjs.org/docs/latest/tutorial/menus): Reference for future native editing/zoom verification.

Scrollbars should be quiet rather than universally hidden. Follow WinUI’s narrow-to-interactive pattern on Windows, preserve Mac conventions, and respect OS accessibility preferences. Keep keyboard focus and continuation cues.

## Coverage and limits

- **Real Windows app:** Installed Plan and Settings inspected; no real records changed. The occluded installed Applications image was excluded.

- **Isolated Windows Electron:** 55 captured visual states with 36 sample applications, 13 plans, and sample resume files. Link capture, edit, filters, locations, Notes, Delete, duplicate handling, and provider controls covered.

- **Sizes and zoom:** 1550, 1260/1250, 900, 851/850, and 790 px widths; expanded and collapsed navigation; 125%, 150%, and 200% content zoom. Content zoom is not Windows OS scaling.

- **Busy and provider states:** Analysis and download/paused/ready/error/license states were simulated. No GPU use, provider billing, real download, or model-quality conclusions.

- **Keyboard and accessibility:** Notes Tab containment and Escape return observed at the wide size; source semantics reviewed. No NVDA/VoiceOver session or full 320 px reflow certification.

- **macOS:** Source inspection and a labeled concept preview only. Native Mac title bar, editing, scrolling, shortcuts, VoiceOver, and update installation need a Mac pass.

- **Unverified edges:** Native file pickers, model deletion, real update installation, actual minimum-height zoomed dialogs, Windows OS scaling, extreme localization, and cloud recovery were not exercised.

## Run notes

- Stable slug: desktop-renderer-app-tsx. No matching ignore list was present. A completed before B findings entered synthesis; neither reviewer read the other.
- Product detector attempted exactly once: 147 quality advisories, 73 font-size, 59 color, 15 radius, in base.css and desktop.css. It returned exit 0 despite records; JSON was used as evidence. No live detector overlay was created.
- Advisories are mainly token/documentation drift. Intentional semantic colors, dark overrides, compact geometry, and unused web sign-in selectors are not confirmed desktop defects. The manual reviews found the more consequential issues.
- Native Windows screenshots and DOM measurements were the fallback visual evidence. Invalid/cropped captures were corrected or excluded. Corrected model screenshots were used visually; stale supplemental control arrays were excluded from model geometry claims.
- No temporary web server was started. Review-launched native windows and headless capture browsers closed. Review helpers and fixture evidence remain in the ignored work folder as the audit archive.
- Tracked product source was unchanged at the pre-report check. The real database, resumes, settings, and installed models were not modified. Only sample profiles and separate proposal artifacts were written.
- The standalone preview had one separate detector attempt and two visual rounds. Functional small-text and iframe border/shadow findings were corrected. No JavaScript errors in captured preview checks; the three compact shortlist views fit the page width. These checks do not approve a production implementation.
- The concepts use eight sample plan choices; native product inspection used 13 saved plans. All study rasters had provenance before the report handoff. Native evidence copies carry their own synthetic Windows capture origin. Concept palettes and layouts are unapproved proposals, so product design documents were not changed.
- Impeccable remains at the installed version for this session. Its update was explicitly deferred by the user. This is the first archived score for the target: 22/40, with no trend yet.
- The independent finish reviewer scored all four named standalone-study corrections resolved, with disposition ship at that fix-list scope. The Mac footer capture was replaced after settled rendering. No production, native Mac, or whole-product approval follows. Concept-seed corroboration and a separate quality-card image were not supplied.

## Public review archive

The synthesized findings and sample-data captures are included in this folder.

## Next decision

Which direction would you like to use, or combine? No product implementation begins until a direction is chosen.

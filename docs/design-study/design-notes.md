---
artifact: proposal-comparison
status: unapproved
selectedDirection: null
date: 2026-10-02
---

> Publication note: This is the original October 2, 2026 comparison, preserved as an archive. After reviewing it, I selected Ember colors, Ember Applications and Settings, and Rosewood Plan, while retaining the existing New Application form and side-by-side keyword/theme sections. The original shortlist, unapproved status and proposed findings below describe the study before that choice. [Read the selection decisions](https://github.com/desigrit/zebby-the-scout#choosing-a-design-direction).

# Zebby proposal design notes

## Overview

This is an **unapproved comparison artifact** for Zebby 1.5.0, revision `6c52d838`. No direction, palette/layout combination, visual comp, or corroborated concept seed is approved. The nine alternatives answer the requested mix of warm, crisp, and balanced directions. The gallery's default Signal preview and Signal/Ember/Beacon shortlist are recommendations, not a selection.

Keep the existing full zebra, Zebby-only title, zebra collapse control, Plan/Applications/Settings destinations, desktop arrow cursor, and optional application data. The incumbent Graphite system remains the product baseline. PRODUCT.md, DESIGN.md, the Impeccable sidecar, product source, and user data are outside this documentation handoff.

[Open the comparison](index.html), [read the UX review](UX-review.md), [inspect the finish scope](review-status.md), or [read extracted tokens](proposal-tokens.json). These notes describe the actual HTML study, rather than prescribing production tokens.

## Colors

Each direction has its own neutral canvas and sidebar. Accent identifies actions, selection, links, and focus. Secondary colors distinguish activity in light appearance. Green, amber, and red retain separate semantic roles.

| Direction | Family | Light accent | Light activity | Dark accent |
|---|---|---|---|---|
| Ember | Warm | #A64A34 | #B17732 | #F0AC91 |
| Honey | Warm | #825C08 | #B98B26 | #EAC473 |
| Rosewood | Warm | #91465F | #BB7758 | #EAB2C6 |
| Beacon | Crisp | #2555BF | #B68816 | #A5BCFF |
| Tide | Crisp | #0D746D | #C15B42 | #8CD4C8 |
| Orchard | Crisp | #2E704C | #7754A4 | #A1D0A5 |
| Olive | Balanced | #626F37 | #A87430 | #C2CD8E |
| Amethyst | Balanced | #74519D | #B47750 | #CEB3EC |
| Signal | Balanced | #AD4C39 | #187889 | #F0B2A0 |

`study.js` supplies all nine maps. `preview.js:41` maps them to CSS colors. In dark appearance, secondary uses the same dark accent, so the separate light activity hue is absent. Dark wash mixes dark paper with dark accent at 12%; line and hover mix dark paper with white at 16% and 3.5%. Light hover mixes white with sidebar at 55%. The preview rounds each RGB channel with `Math.round`; the JSON preserves that exact calculation.

The JSON combines shared colors with each direction's light/dark overrides to resolve all 21 color tokens per mode. It includes the actual canvas, sidebar, paper, ink, muted, line, hover, button ink, and semantic colors. No new tonal ramps or production palette rules are invented.

## Typography

The preview uses `"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`. Effective values account for the later overrides in `preview.css`: body (14px, 1.45 line height), role titles (14px, weight 650), compact board/worklist titles (13px), selected Plan title (19px, weight 650, 1.25 line height), section titles (15px), and Plan section titles (14px).

Buttons are 12px; form labels are 12px and field values 13px. Result explanations and themes are 13px, with 1.6 line height for reading text. Metadata remains 11px. Match values, dates, statistics, and importance values use tabular numerals. Longer explanations use observed 65-72 character limits. This is a compact comparison, with no new display font. Native readability and magnification still need verification.

## Layout

All directions share a 44px title region, a collapsible sidebar, a bounded workspace, and a persistent study disclosure. The preview rail is 158px expanded and 72px collapsed; its zebra toggle/image are 50px/43px. These are proposal measurements. The existing product documents specify 210px/96px navigation and a 54px/46px toggle/image, which remain unchanged.

| Direction | Applications | Plan | Settings | Best use and tradeoff |
|---|---|---|---|---|
| Ember | Focused list and persistent inspector | Split CV/results, collapsed posting | Section rows | Focus on one role while browsing. Inspector takes horizontal space. |
| Honey | Agenda grouped by applied date | Numbered Job, Your CV, Results steps | Disclosures | Daily applications. Planning requires moving between steps. |
| Rosewood | Collapsible company collections | Document panel with posting/CV above results | Section rows | Several roles at one company. Groups add a scan level. |
| Beacon | Comparison table and details drawer | Split CV/results, collapsed posting | Section rows | Fast comparison and frequent keyboard use. Table adapts to rows at smaller widths. |
| Tide | Hiring-stage tabs and records | Focused Job, Your CV, Results pages | Disclosures | Attention by stage. Changing Plan pages hides context. |
| Orchard | Four hiring-stage board columns | Preparation worklist with review snapshot | Categories | Conversations and interviews. Board density is lower; details expose resume and additional context. |
| Olive | Ledger with details expanded in place | Job, CV, Resume direction accordion | Section rows | Familiar, quiet tracking. Expanded records push following rows down. |
| Amethyst | Compact worklist and tabbed inspector | Overview/Keywords/Themes result tabs | Categories | Resume editing alongside saved plans. Some results are one click away. |
| Signal | Records with inline team/resume context | Adaptive Plan workbench | Section rows | Warmer familiar workflow. Less adventurous than board or guided flow. |

The composition keys come from `study.js`; `preview.js` renders Applications (line 56), Plan (line 77), and Settings (line 89). Ember and Beacon's split Plan and Signal's workbench currently share the same markup. They remain different alternatives through their palette and Applications composition. No unsupported Plan distinction is implied.

Workspace width is capped at 1480px with 24px side insets. Common gaps are 7px for controls, 8px for filters, 12px for paired fields/board columns, and 18-20px for Plan layout. These are observed recurring values, not an approved spacing scale.

At 1200px, rails and gaps narrow. At 1000px, CV/results stack, tables become wrapped rows, and the persistent inspector/review snapshot hide. At 820px, navigation becomes icons only, the Plan rail yields to the Saved plans drawer, settings stack, and the board scrolls horizontally. The study disclosure grows from 24px to 32px below 650px. These CSS breakpoints are not native window requirements.

Quiet scroll indicators retain overflow rather than removing scrolling. The study reveals a 7px WebKit thumb, or standard thin scrollbar, on hover or focus within. It does not widen the thumb on interaction or verify operating-system visibility preferences. A native implementation needs keyboard reachability, visible continuation, and respect for always-visible scrollbar preferences on each platform.

## Elevation & Depth

Resting surfaces use paper/canvas tones and fine borders. Shadows appear on a drawer (`-8px 0 35px rgba(20,20,20,.14)`), confirmation (`0 12px 40px rgba(20,20,20,.2)`), or toast (`0 6px 22px rgba(25,25,25,.16)`). The confirmation scrim is `rgba(24,28,29,.3)`. These observed treatments are not a replacement for the incumbent editor elevation rule.

## Shapes

Chips use 5px corners, segments/terms 6px, fields/buttons 7px, board cards/toasts 8px, navigation/settings rows 9px, disclosures 10px, and larger surfaces 12px. The existing zebra image remains circular. Exact source selectors and measurements are recorded in the JSON.

## Components

Primary buttons use accent with mode-specific button ink; secondary controls use paper and a fine border. Buttons have a 34px minimum height and 7px/13px padding; standard icon controls are 32px with 17px icons. Fields are 35px high. Posting and overview textareas have 164px and 116px minimum heights. These are comparison measurements, with desktop target sizes still to verify after selection.

Status pairs labels with semantic color: Applied is neutral, Heard back amber, Interview scheduled green, and Rejected red. Match retains a number alongside the green track; the samples do not implement score-dependent colors. Job importance stays distinct from resume match. All scores, explanations, keywords, themes, resumes, and provider/model labels are illustrative.

Common keyboard focus uses a 2px accent outline with a 3px offset; chart focus uses a 2px offset. Reduced motion disables the 340ms navigation scale pulse, 120ms background transition, and one-second spinner animation. The preview uses a scale pulse rather than the existing offline Lottie icons. Forced-colors rules add selected-state outlines and automatic scroll colors. Search inputs override the common outline, and editable keyword/theme spans are outside that selector, so these rules do not establish a complete accessibility pass.

A persistent strip discloses sample data, simulated analysis/downloads, and no disk saving. Notes, status, locations, and application deletion can change in-memory samples. Add/Edit application does not commit a record; Save plan resets the demo edit state; New plan shows a route. General fields and result edits are not a complete persistence workflow. Reloading restores the sample. File/database actions, listing capture, key/server setup, provider responses, downloads, and updates are demonstrations. System appearance currently resolves to the light demo state.

The HTML title-bar controls and macOS traffic lights are decorative proposals. Native window controls remain a product commitment.

## Do's and Don'ts

- **Do** compare the palette and composition together, or explicitly choose a combination before implementation.
- **Do** retain the existing identity, optional data, keyboard focus, and platform conventions.
- **Do** use the extracted JSON as source evidence for this study; any approved production system needs a later native verification and documentation pass.
- **Don't** treat the default preview, shortlist, finish verdict, or these files as direction approval.
- **Don't** treat sample results or simulated controls as tested persistence, provider behavior, or model quality.

The archived finish disposition is **ship for the four named comparison corrections**: selected Plan identity, disclosure/feedback, Orchard results navigation, and report links. It does not approve a production implementation or the whole product.

The original comparison has 38 captures: 27 default page captures, six compact light/dark captures for Ember/Beacon/Signal, four state/platform captures, and one gallery. Additional proofs bring the recorded raster inventory to 49, with zero missing provenance records. All nine default light page compositions are represented; compact, dark, and Mac coverage is sampled. Native auditing used 13 sample plans and 36 applications; standalone concepts use eight choices and 36 samples.

After selection, native Windows/Mac editing, scrolling, keyboard shortcuts, window controls, and accessibility need verification, alongside real providers, downloads, updates, file pickers, persistence, operating-system scaling, and recovery. No assistive-technology or native Mac test is claimed here.

The current-system F41 drift remains a proposed future cleanup: 147 detector advisories comprise 73 font-size, 59 color, and 15 radius records. They are not 147 confirmed product defects. Reconcile actual approved tokens and documentation later while retaining semantic colors and intentional compact/dark variations. Existing PRODUCT.md, DESIGN.md, and `.impeccable/design.json` are preserved. The user deferred updating Impeccable.

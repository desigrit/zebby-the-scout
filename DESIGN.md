---
name: PM Application Tracker
description: A calm personal ledger for tracking product management applications.
colors:
  accent: "#b84239"
  accent-hover: "#96332c"
  accent-wash: "#ffeee9"
  forest: "#24242c"
  focus: "#087b98"
  canvas: "#f7f5f1"
  paper: "#fffdf8"
  ink: "#262222"
  ink-soft: "#665f60"
  ink-faint: "#766d70"
  line: "#e6dddb"
  line-strong: "#cfc2c0"
  cyan: "#176d82"
  cyan-wash: "#e9f3f5"
  field: "#fff"
  surface-hover: "#f1efeb"
  surface-selected: "#ffeee9"
  focus-ring: "rgba(8,123,152,.16)"
  button-ink: "#fffdf8"
  selection-bg: "#bfe5ef"
  selection-ink: "#173643"
  dark-accent: "#fa887d"
  dark-accent-hover: "#ffaaa1"
  dark-accent-wash: "#402d32"
  dark-forest: "#16181e"
  dark-focus: "#58bad1"
  dark-canvas: "#191b22"
  dark-paper: "#232731"
  dark-ink: "#f6f1e8"
  dark-ink-soft: "#c7c1bb"
  dark-ink-faint: "#aaa6ab"
  dark-line: "#3b3d47"
  dark-line-strong: "#5c5d68"
  dark-cyan: "#64c7da"
  dark-cyan-wash: "#273841"
  dark-field: "#2a2f39"
  dark-surface-hover: "#2f343e"
  dark-surface-selected: "#402d32"
  dark-focus-ring: "rgba(88,186,209,.2)"
  dark-button-ink: "#241f23"
  dark-selection-bg: "#315d70"
  dark-selection-ink: "#fffdf8"
typography:
  display:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontSize: "clamp(42px, 4.4vw, 64px)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 700
  metric:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
    fontSize: "28px"
    fontWeight: 660
    lineHeight: 1.1
    letterSpacing: "-0.03em"
rounded:
  compact: "6px"
  badge: "5px"
  field: "7px"
  button: "8px"
  panel: "12px"
spacing:
  tight: "9px"
  field-gap: "18px"
  content: "24px"
  panel: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  input-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
  panel-editor:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "clamp(22px, 3vw, 36px)"
  navigation-sidebar:
    backgroundColor: "{colors.forest}"
    textColor: "#f8f7ef"
    padding: "30px 13px 20px"
  button-primary-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-button-ink}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-secondary-dark:
    backgroundColor: "{colors.dark-field}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  recommendation-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
  job-importance:
    backgroundColor: "{colors.cyan-wash}"
    textColor: "{colors.cyan}"
    rounded: "{rounded.badge}"
    padding: "5px 2px"
  job-importance-dark:
    backgroundColor: "{colors.dark-cyan-wash}"
    textColor: "{colors.dark-cyan}"
    rounded: "{rounded.badge}"
    padding: "5px 2px"
  job-importance-unrated:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.badge}"
    padding: "5px 2px"
---

# Design System: PM Application Tracker

## Overview

**Creative North Star: "The Search Ledger"**

The app should feel like a dependable working ledger for a busy job search. Cream paper and fine neutral rules keep rows readable, while a charcoal sidebar gives the workspace a clear identity. The approved detailed sunglasses zebra supplies the circular brand mark. Coral points to the next useful action, and cyan identifies information and focus.

The interface stays compact enough for several entries a day. The existing serif and platform sans-serif hierarchy, native controls, and left navigation remain the working grammar. The full striped zebra, cyan lenses, and yellow mane provide expression inside the icon; the surrounding workspace keeps application data and editable role priorities easy to scan.

**Key Characteristics:**

- Cream paper surfaces on a muted canvas, with a charcoal sidebar.
- The full circular zebra as the recognizable app identity.
- Coral actions and cyan information and focus accents.
- Strong hierarchy through typography and spacing, with light borders between data.
- Compact native controls with visible focus treatment.
- A table on wide screens that becomes readable record cards on narrow screens.

## Colors

The palette extends the Search Ledger with coral actions, cyan information, cream surfaces, and charcoal structure. Unprefixed frontmatter colors are the exact light values from `app/globals.css`; `dark-` entries are the exact overrides from `desktop/renderer/desktop.css`. Selection entries record the corresponding global text-selection rules. The existing `forest` property name is retained for compatibility and now means charcoal.

### Primary

- **Coral** (`accent`): the main action fill.
- **Coral Hover** (`accent-hover`): the action hover and existing model-agreement fill.
- **Coral Wash** (`accent-wash`, `surface-selected`): restrained accent surfaces and selected plans.
- **Button Ink** (`button-ink`): readable primary-action text in each appearance, independent of the paper color.

### Secondary

- **Information Cyan** (`cyan`): job-importance percentages, activity bars, resume links, and informational actions.
- **Cyan Wash** (`cyan-wash`): importance badges, resume-match summary, and selected appearance options.
- **Focus Cyan** (`focus`, `focus-ring`): keyboard outlines, field borders, and translucent field focus rings.
- **Selection** (`selection-bg`, `selection-ink`): text selection, distinct from selected-plan surfaces.

### Neutral

- **Charcoal** (`forest`): the sidebar.
- **Cream Canvas** (`canvas`): the light workspace background; its dark counterpart is charcoal.
- **Paper** (`paper`): panels, table, statistic band, and secondary button fill.
- **Ink** (`ink`): main reading text.
- **Soft Ink** (`ink-soft`): secondary text and table details.
- **Faint Ink** (`ink-faint`): small labels on mobile records.
- **Fine Rule** (`line`): separators between statistics and applications.
- **Strong Rule** (`line-strong`): input borders and the editor outline.
- **Field** (`field`): editable controls, white in light appearance and charcoal in dark appearance.
- **Hover Surface** (`surface-hover`): neutral feedback on rows and secondary controls.

**The Color Roles Rule.** Use coral for deliberate actions and cyan for information and focus. Keep semantic green notices and hiring stages, amber warnings, and match-strength colors in their existing roles, with readable text and values.

## Typography

**Display Font:** Georgia, with Times New Roman and serif fallbacks.

**Body Font:** Segoe UI Variable on Windows and the system font on macOS, with Segoe UI, Helvetica Neue, Arial, and sans-serif fallbacks.

**Character:** Sans-serif labels and data stay compact and easy to scan across Windows and Mac. Plan and Applications rely on the sidebar for their page identity, with a slim action toolbar instead of a repeated page heading. Serif display type remains available for Settings and setup.

### Hierarchy

- **Display:** Settings and setup can use the `display` token; Plan and Applications omit repeated page titles.
- **Headline:** editor and section headings use the `headline` token; the roles heading is slightly smaller in the current page.
- **Metric:** application totals use the `metric` token with tabular numerals for stable alignment.
- **Body:** explanatory copy uses the `body` token. Table details are smaller to fit more records in view.
- **Label:** field labels and key data labels use the `label` token with stronger weight.

**The One Serif Rule.** Reserve expressive serif type for Settings and setup headings; application data stays sans-serif.

## Layout

The desktop shell has a 210px left sidebar with Plan, Applications, and Settings. The workspace content is capped at 1440px. Applications flows from a compact add action to a shared panel containing a 30-day activity chart and five-column statistics band, then search, filters, and records. The chart uses quiet daily bars with date and count tooltips, and arrow keys move between days. The editor starts with the listing URL and its autofill action. Company, title, team, locations, applied date, and match strength follow in paired fields.

When the Applications content pane is 940px or narrower, rows become two-column record cards with visible field labels and actions. This uses available pane width, including the space taken by the sidebar. At 850px window width, the sidebar narrows to 176px, the Plan rail moves above its editor, and the statistics band changes to three columns. At 650px, the heading, filters, and form stack; the statistics band uses two columns. Preserve these content-driven changes when adding fields.

The native launch window defaults to 1550 by 850 device-independent pixels, 300 wider than the previous 1250 width. Both dimensions are capped by the primary display work area. Core keyword and theme columns stack when the Plan editor container is 610px or narrower; their editable text, importance badge, and remove control stay together.

The common rhythm uses tight control gaps, medium field gaps, and generous panel padding. Let separators and whitespace group information before adding new containers.

## Elevation & Depth

The workspace is mostly flat. Contrast between the muted canvas and paper surfaces, plus fine rules, establishes structure. The open editor alone receives a soft ambient shadow (`0 12px 35px rgba(22, 50, 38, .07)`) to make the active work area clear. Input focus uses a cyan ring (`0 0 0 3px var(--focus-ring)`), with the appearance-specific color in the frontmatter. Keyboard outlines use `focus`.

**The Active Editor Rule.** Apply the ambient shadow to the open editor only; resting data surfaces remain flat.

## Shapes

Corners are gently rounded: compact controls use the `compact` and `field` radii, buttons use the `button` radius, and larger surfaces use the `panel` radius. Fine borders define panels and rows. The brand mark is the approved detailed zebra in a coral circle, including the full striped head, sunglasses, cyan lenses, and yellow mane. Keep the clear circular silhouette and recognizable detail. The sidebar renders the mark at 46px; the shared header uses 42px.

`public/brand-icon.png` is the shipping source for the app and installer. Its PNG metadata carries the exact image-generation prompt. `scripts/build-desktop.mjs` preserves the source text provenance when resizing it to `build/desktop-icon.png` and copying `desktop-dist/renderer/icon.png`. The former tile SVGs are retired.

## Components

### Buttons

- **Primary:** coral fill, appearance-specific button ink, medium weight, and a 44px minimum target height. Hover deepens the fill in light appearance and brightens it in dark appearance; pressing moves it down by 1px.
- **Secondary:** paper fill in light appearance, field fill in dark appearance, ink text, and a strong rule border. Hover uses the neutral hover surface and clearer ink-faint border.
- **Focus and motion:** keyboard focus uses the shared 3px outline. The 180ms color and transform transitions stop when reduced motion is requested.

### Navigation

The left sidebar holds the circular zebra, product name, Plan, Applications, Settings, and the current database name. The active destination has a distinct muted charcoal and coral surface with a coral icon; keyboard focus is cyan. Windows has no native menu bar; macOS keeps only the native app menu. Settings is an uncluttered four-section page for Database, OpenAI key, Appearance, and Logs.

### Cards and containers

The statistic band, application list, empty state, and editor sit on paper. The band and table use rules between items. Only the editor has a shadow.

### Inputs and fields

Inputs use the appearance-specific field fill, strong rule borders, and the `field` radius. The cyan focus border and ring work with the global keyboard outline. Field labels sit above controls. The resume upload button uses a dashed green border to distinguish file selection from data entry.

### Job importance

Core ATS keywords use editable single-line fields; Core resume themes use editable multi-line fields. Each row reserves a separate 52px column for a read-only percentage badge and a 26px column for Remove. Badges use cyan on cyan wash, a 5px corner radius, and tabular numerals. Unrated values use quieter canvas and ink-faint colors. Add keyword and Add theme are cyan text actions, and a new row receives focus. Labels, tooltips, and the nearby explanation identify the percentage as estimated importance to the job; resume match remains a separate value.

### Application records

The desktop list is a fixed-layout table with clearly separated columns. A compact company label follows the role title on the same baseline when space allows. Multiple locations use a chevron disclosure and separate labels when expanded. Match strength combines a percentage, short progress track, and refresh icon; a single progress ring replaces these while analysis runs. Green indicates stronger matches, while warmer tones indicate lower matches. Saved listing text lives in the editable Notes dialog, accessible from the row actions. Status is a native select styled as a compact tinted control, with each status retaining its own color. On narrow screens, table headers hide and each record carries its own labels and actions.

## Do's and Don'ts

### Do:

- **Do** use the sidebar to identify Plan and Applications, keeping the workspace and its data compact.
- **Do** keep controls legible and preserve 44px targets for mobile row actions and status changes.
- **Do** pair match-track color with a numeric percentage, and pair status tint with readable text.
- **Do** show visible keyboard focus and respect reduced-motion preferences.

### Don't:

- **Don't** add shadows to every row or metric; the editor is the elevated surface.
- **Don't** rely on color alone to communicate match strength or status.
- **Don't** compress application records into an unreadable mobile table; use labeled record cards.

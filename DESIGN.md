---
name: Zebby
description: A calm personal ledger for tracking product management applications.
colors:
  accent: "#30343c"
  accent-hover: "#171b22"
  accent-wash: "#e6e9ef"
  forest: "#e9ebef"
  focus: "#49566a"
  canvas: "#f4f5f7"
  paper: "#fff"
  ink: "#23252a"
  ink-soft: "#616670"
  ink-faint: "#626a77"
  line: "#dce0e5"
  line-strong: "#858d9a"
  cyan: "#4b5566"
  cyan-wash: "#e9edf3"
  field: "#fff"
  surface-hover: "#eceff3"
  surface-selected: "#d7dce3"
  focus-ring: "rgba(73,86,106,.18)"
  button-ink: "#fff"
  selection-bg: "#d0d7e3"
  selection-ink: "#23252a"
  dark-accent: "#e5e8ef"
  dark-accent-hover: "#fff"
  dark-accent-wash: "#343943"
  dark-forest: "#16181d"
  dark-focus: "#c2c9d8"
  dark-canvas: "#1d1f24"
  dark-paper: "#272a30"
  dark-ink: "#f0f1f4"
  dark-ink-soft: "#b1b5bf"
  dark-ink-faint: "#adb5c4"
  dark-line: "#444953"
  dark-line-strong: "#747e8d"
  dark-cyan: "#c2c9d8"
  dark-cyan-wash: "#323740"
  dark-field: "#2d3038"
  dark-surface-hover: "#30343c"
  dark-surface-selected: "#343943"
  dark-focus-ring: "rgba(194,201,216,.2)"
  dark-button-ink: "#24272e"
  dark-selection-bg: "#454f61"
  dark-selection-ink: "#f0f1f4"
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
  brand: "50%"
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
    textColor: "{colors.ink}"
    padding: "8px 13px 20px"
    width: "210px"
  navigation-sidebar-dark:
    backgroundColor: "{colors.dark-forest}"
    textColor: "{colors.dark-ink}"
    padding: "8px 13px 20px"
    width: "210px"
  navigation-sidebar-collapsed:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.ink}"
    padding: "8px 13px 20px"
    width: "96px"
  navigation-sidebar-brand:
    padding: "0 13px 12px"
  navigation-sidebar-mac:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.ink}"
    padding: "4px 13px 20px"
    width: "210px"
  navigation-icon:
    size: "24px"
  window-title-region:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-soft}"
    height: "44px"
  window-title-region-dark:
    backgroundColor: "{colors.dark-canvas}"
    textColor: "{colors.dark-ink-soft}"
    height: "44px"
  navigation-zebra-toggle:
    rounded: "{rounded.brand}"
    padding: "4px"
    size: "54px"
  navigation-zebra-image:
    rounded: "{rounded.brand}"
    size: "46px"
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

# Design System: Zebby

## Overview

**Creative North Star: "The Search Ledger"**

Zebby should feel like a dependable working ledger for a busy job search. Graphite uses cool neutral paper, fine rules, and clear ink to keep rows readable in light and dark appearance. Neutral actions, informational accents, focus, and selected surfaces let the application data carry the emphasis. The approved detailed sunglasses zebra supplies the circular brand mark.

The interface stays compact enough for several entries a day. The existing serif and platform sans-serif hierarchy, native controls, and left navigation remain the working grammar. The full striped zebra, cyan lenses, and yellow mane provide expression inside the icon; the surrounding workspace keeps application data and editable role priorities easy to scan.

**Key Characteristics:**

- Cool neutral paper surfaces on a muted Graphite canvas, with an appearance-specific sidebar.
- The full circular zebra as the recognizable app identity.
- Neutral Graphite actions, information, focus, and selected surfaces.
- Strong hierarchy through typography and spacing, with light borders between data.
- Compact native controls, a 44px native title region, and visible focus treatment.
- A zebra button that switches between labeled and icons only navigation.
- A table on wide screens that becomes readable record cards on narrow screens.

## Colors

Graphite extends the Search Ledger with neutral actions, information, focus, and selected surfaces. Unprefixed frontmatter colors are the exact light values from `desktop/renderer/base.css`; `dark-` entries are the exact overrides from `desktop/renderer/desktop.css`. Selection entries record the corresponding text-selection rules. Existing `forest`, `cyan`, and `cyan-wash` property names remain for compatibility; they now describe the sidebar and neutral information roles.

### Primary

- **Graphite Action** (`accent`): a deep neutral action fill in light appearance and a pale silver fill in dark appearance.
- **Graphite Action Hover** (`accent-hover`): the action hover and existing model-agreement fill.
- **Graphite Action Wash** (`accent-wash`): restrained action-related surfaces.
- **Button Ink** (`button-ink`): readable primary-action text in each appearance, independent of the paper color.

### Neutral

- **Graphite Sidebar** (`forest`): the sidebar and its matching segment in the shared native title region.
- **Graphite Canvas** (`canvas`): the workspace and remaining title-region background.
- **Paper** (`paper`): panels, table, statistic band, and secondary button fill.
- **Ink** (`ink`): main reading text and sidebar labels.
- **Soft Ink** (`ink-soft`): secondary text, inactive navigation, and the Zebby title caption.
- **Faint Ink** (`ink-faint`): small labels on mobile records.
- **Fine Rule** (`line`): separators between statistics, applications, and the sidebar database footer.
- **Strong Rule** (`line-strong`): input borders and the editor outline.
- **Field** (`field`): editable controls.
- **Hover Surface** (`surface-hover`): neutral feedback on rows and secondary controls.
- **Selected Surface** (`surface-selected`): selected plans, active navigation, and zebra-toggle hover.
- **Graphite Information** (`cyan`): job-importance percentages, activity bars, resume links, and informational actions.
- **Graphite Information Wash** (`cyan-wash`): importance badges, resume-match summary, and selected appearance options.
- **Graphite Focus** (`focus`, `focus-ring`): keyboard outlines, field borders, and translucent field focus rings.
- **Text Selection** (`selection-bg`, `selection-ink`): selected text, distinct from selected-plan surfaces.

**The Color Roles Rule.** Use neutral Graphite for deliberate actions, information, focus, and selected surfaces. Keep semantic green notices and hiring stages, amber warnings, red errors and destructive actions, and match-strength colors in their existing roles, with readable text and values.

## Typography

**Display Font:** Georgia, with Times New Roman and serif fallbacks.

**Body Font:** Segoe UI Variable on Windows and the system font on macOS, with Segoe UI, Helvetica Neue, Arial, and sans-serif fallbacks.

**Character:** Sans-serif labels and data stay compact and easy to scan across Windows and Mac. Plan, Applications, and Settings rely on the sidebar for their page identity. Plan and Applications retain slim action toolbars; Settings starts with its section headings. Serif display type remains available for setup.

### Hierarchy

- **Display:** setup can use the `display` token; Plan, Applications, and Settings omit repeated page titles.
- **Headline:** editor and section headings use the `headline` token; the roles heading is slightly smaller in the current page.
- **Metric:** application totals use the `metric` token with tabular numerals for stable alignment.
- **Body:** explanatory copy uses the `body` token. Table details are smaller to fit more records in view.
- **Label:** field labels and key data labels use the `label` token with stronger weight.

**The One Serif Rule.** Reserve expressive serif type for setup headings; application data stays sans-serif.

## Layout

The desktop shell has a shared 44px native title region above Plan, Applications, and Settings. Windows navigation spans both shell rows and reaches the top of the window; Mac navigation starts below the native title region. Its sidebar segment blends into the rail. The sidebar is 210px wide when expanded and 96px wide when collapsed on both platforms. The workspace content is capped at 1440px. Applications flows from a compact add action to a shared panel containing a 30-day activity chart and five-column statistics band, then search, filters, and records. The chart uses quiet daily bars with date and count tooltips, and arrow keys move between days. The editor starts with the listing URL and its autofill action. Company, title, team, locations, applied date, and match strength follow in paired fields.

When the Applications content pane is 940px or narrower, rows become two-column record cards with visible field labels and actions. This uses available pane width, including the space taken by the sidebar. At 850px window width, the expanded sidebar narrows to 176px while the collapsed sidebar stays 96px, the Plan rail moves above its editor, and the statistics band changes to three columns. At 650px, the heading, filters, and form stack; the statistics band uses two columns. Preserve these content-driven changes when adding fields.

The native launch window defaults to 1550 by 850 device-independent pixels, 300 wider than the previous 1250 width. Both dimensions are capped by the primary display work area. Core keyword and theme columns stack when the Plan editor container is 610px or narrower; their editable text, importance badge, and remove control stay together.

The common rhythm uses tight control gaps, medium field gaps, and generous panel padding. The navigation-sidebar, navigation-sidebar-mac, and navigation-sidebar-brand frontmatter tokens place the zebra and menu higher in each platform's rail. The image starts at y=12px on Windows and y=52px on Mac. The shared footer is pushed to the bottom: available updates appear in either navigation state, followed by database details only when expanded. Let separators and whitespace group information before adding new containers.

## Elevation & Depth

The workspace is mostly flat. Contrast between the muted canvas and paper surfaces, plus fine rules, establishes structure. The open editor alone receives a soft ambient shadow (`0 12px 35px rgba(22, 50, 38, .07)`) to make the active work area clear. Input focus uses a Graphite ring (`0 0 0 3px var(--focus-ring)`), with the appearance-specific color in the frontmatter. Keyboard outlines use `focus`.

**The Active Editor Rule.** Apply the ambient shadow to the open editor only; resting data surfaces remain flat.

## Shapes

Corners are gently rounded: compact controls use the `compact` and `field` radii, buttons use the `button` radius, and larger surfaces use the `panel` radius. Fine borders define panels and rows. The brand mark is the approved detailed zebra in a coral circle, including the full striped head, sunglasses, cyan lenses, and yellow mane. Keep the clear circular silhouette and recognizable detail. The sidebar places the 46px mark inside a 54px circular navigation-toggle button. The native title region shows only Zebby.

`public/brand-icon.png` is the shipping source for the app and installer. Its PNG metadata carries the exact image-generation prompt. `scripts/build-desktop.mjs` preserves the source text provenance when resizing it to `build/desktop-icon.png` and copying `desktop-dist/renderer/icon.png`. The former tile SVGs are retired.

## Components

### Buttons

- **Primary:** Graphite fill, appearance-specific button ink, medium weight, and a 44px minimum target height. Hover deepens the fill in light appearance and brightens it in dark appearance; pressing moves it down by 1px.
- **Secondary:** paper fill in light appearance, field fill in dark appearance, ink text, and a strong rule border. Hover uses the neutral hover surface and clearer ink-faint border.
- **Focus and motion:** keyboard focus uses the shared 3px outline. The 180ms color and transform transitions stop when reduced motion is requested.
- **Desktop cursor:** buttons, links, disclosures, selects, labels, and choice controls use the native arrow; editable text fields use the caret cursor.

### Navigation

The shared native title region is 44px high and shows only Zebby. Windows uses native overlay controls; macOS uses native traffic lights at x=18, y=16. The Windows sidebar spans the title region with 8px top padding; the Mac sidebar starts below it with 4px top padding. Brand bottom padding is 12px. The sidebar segment uses the same `forest` fill as the rail, and the remaining title region uses `canvas`. Keep the title free of database filenames and do not add HTML window controls.

The circular zebra is a 54px semantic button containing the unchanged 46px image. It switches the left sidebar between icons plus labels and icons only, without a sidebar wordmark. Expanded navigation is 210px wide, or 176px at the 850px window breakpoint; collapsed navigation is 96px on both platforms. Active destinations use `surface-selected`, readable ink, and the neutral `accent` icon. Hover uses `surface-hover`; the zebra button uses `surface-selected` on hover and a 2px `focus` outline with a 3px offset.

Each destination has a 48px minimum target and a 24px icon. Accepted click or keyboard activation navigates immediately, then plays a brief offline Lottie animation: Plan redraws clipboard rows, Applications lifts the briefcase flap, and Settings moves its two sliders. Each composition runs 25 frames at 60fps (about 417ms), with a still frame at rest. Reduced motion stays still; load errors expose the static icon. Completion, document hiding, and a change to reduced motion return the player to rest; unmounting destroys the player and removes its listeners.

The toggle exposes `aria-expanded`, `aria-controls`, and Expand navigation or Collapse navigation action labels and tooltips. Enter and Space activate the semantic button. Each destination retains its accessible name and current-page state; icons only destinations have tooltips. An available-update action sits at the bottom in either state, with an icon, accessible phase label, and tooltip when collapsed. Expanded navigation adds the current database name and save-pending state beneath it. Collapsed navigation omits the database details and divider. Current file details remain available in Settings.

The navigation preference is saved on each computer. A failed save restores the previous layout and displays an error. Toggling preserves the current draft and destination. Windows has no native menu bar; macOS keeps only the native app menu. Settings starts directly with five sections: Database, Analysis, Appearance, Logs, and Updates. Section headings provide its hierarchy without a repeated page heading or introductory subheading.

### Cards and containers

The statistic band, application list, empty state, and editor sit on paper. The band and table use rules between items. Only the editor has a shadow.

### Inputs and fields

Inputs use the appearance-specific field fill, strong rule borders, and the `field` radius. The Graphite focus border and ring work with the global keyboard outline. Field labels sit above controls. The resume upload button uses a dashed green border to distinguish file selection from data entry.

### Job importance

Core ATS keywords use editable single-line fields; Core resume themes use editable multi-line fields. Each row reserves a separate 52px column for a read-only percentage badge and a 26px column for Remove. Badges use neutral Graphite information ink on its wash, a 5px corner radius, and tabular numerals. Unrated values use quieter canvas and ink-faint colors. Add keyword and Add theme are Graphite information text actions, and a new row receives focus. Labels, tooltips, and the nearby explanation identify the percentage as estimated importance to the job; resume match remains a separate value.

### Plan analysis

The primary Analyze button sits at the end of Your CV for both new and previously analyzed plans, with a quiet provider or model caption. Busy analysis replaces its icon with a spinner and uses a progress ring in the match summary. The existing refresh action remains beside a saved score. A native Why disclosure sits within the match summary, below its estimate caption, using a fine divider and keyboard focus. Its body describes the score's resume evidence and gaps; the overview wording rationale has its own place below the generated overview.

### Settings links

Database keeps its native Open and Create new database actions and one concise helper line. Logs uses brief automatic-error copy followed by underlined Open logs folder and Report an issue actions with external-arrow icons. These actions use Graphite information and shared keyboard focus.

Updates follows Logs using the existing section grid, heading style, helper text, and bordered secondary buttons. Its heading caption shows the installed Zebby version. Check for updates sits beside the available update action; Release notes uses the same underlined external-link treatment. The shared update button changes from Update to a version into download percentage, Preparing update, Restart to update, Restarting, or Retry update. Busy phases use a spinner and disable the action. Status copy uses a live status region; check or download errors use the existing error surface and alert role. The collapsed sidebar action is a 48px square with the same phase-specific accessible name.

### Application records

The desktop list is a fixed-layout table with clearly separated columns. A compact company label follows the role title on the same baseline when space allows. Multiple locations use a chevron disclosure and separate labels when expanded. Match strength combines a percentage, short progress track, and refresh icon; a single progress ring replaces these while analysis runs. Green indicates stronger matches, while warmer tones indicate lower matches. Saved listing text lives in the editable Notes dialog, accessible from the row actions. Status is a native select styled as a compact tinted control, with each status retaining its own color. On narrow screens, table headers hide and each record carries its own labels and actions.

## Do's and Don'ts

### Do:

- **Do** use the sidebar to identify Plan, Applications, and Settings, keeping the workspace and its data compact.
- **Do** keep controls legible and preserve 44px targets for mobile row actions and status changes.
- **Do** pair match-track color with a numeric percentage, and pair status tint with readable text.
- **Do** show visible keyboard focus and respect reduced-motion preferences.
- **Do** keep the unchanged zebra accessible as the navigation toggle and retain native platform window controls.

### Don't:

- **Don't** add shadows to every row or metric; the editor is the elevated surface.
- **Don't** rely on color alone to communicate match strength or status.
- **Don't** add a sidebar wordmark, put a database filename in the title region, or draw HTML window controls.
- **Don't** compress application records into an unreadable mobile table; use labeled record cards.

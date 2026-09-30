---
name: PM Application Tracker
description: A calm personal ledger for tracking product management applications.
colors:
  accent: "#cf5c38"
  accent-hover: "#a94324"
  accent-wash: "#fff1ea"
  forest: "#1d3831"
  focus: "#2f7c67"
  canvas: "#f5f3ed"
  paper: "#fffefa"
  ink: "#213630"
  ink-soft: "#53665f"
  ink-faint: "#708078"
  line: "#d9e0d7"
  line-strong: "#c3cfc4"
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
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  input-field:
    backgroundColor: "#fff"
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
---

# Design System: PM Application Tracker

## Overview

**Creative North Star: "The Search Ledger"**

The app should feel like a dependable working ledger for a busy job search. Warm paper and fine green rules keep rows readable, while a dark forest sidebar gives the workspace a clear identity. The terracotta action color points to the next useful step without competing with application data.

The interface is compact enough for several entries a day. One expressive serif heading gives the page character; controls, statistics, and row details use a direct sans-serif voice. The form opens within the same workspace so the list remains a useful reference while editing.

**Key Characteristics:**

- Warm paper surfaces on a muted canvas.
- Strong hierarchy through typography and spacing, with light borders between data.
- Compact native controls with visible focus treatment.
- A table on wide screens that becomes readable record cards on narrow screens.

## Colors

The palette pairs a single warm action accent with forest green structure and quiet paper neutrals. The values in the frontmatter match the CSS custom properties in `app/globals.css`.

The desktop dark appearance uses `#161d19` canvas, `#202a24` paper, `#ecf1e9` text, `#becbbf` secondary text, and `#35463b` rules. Its sidebar uses `#12231c`. State colors use muted green, amber, and terracotta surfaces so status remains readable without relying on color alone.

### Primary

- **Terracotta** (`accent`): the main action fill and most prominent call to action.
- **Deep Terracotta** (`accent-hover`): the main action's hover state.
- **Terracotta Wash** (`accent-wash`): a pale companion tint available for restrained accent surfaces.

### Secondary

- **Deep Forest** (`forest`): the sidebar.
- **Focus Green** (`focus`): focused controls and keyboard outlines.

### Neutral

- **Warm Canvas** (`canvas`): the page background that separates work surfaces.
- **Paper** (`paper`): panels, table, statistic band, and secondary button fill.
- **Forest Ink** (`ink`): main reading text.
- **Soft Ink** (`ink-soft`): secondary text and table details.
- **Faint Ink** (`ink-faint`): small labels on mobile records.
- **Fine Rule** (`line`): separators between statistics and applications.
- **Strong Rule** (`line-strong`): input borders and the editor outline.

**The One Accent Rule.** Reserve terracotta for the primary action and deliberate links. Use greens for identity, focus, and positive progress.

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

The common rhythm uses tight control gaps, medium field gaps, and generous panel padding. Let separators and whitespace group information before adding new containers.

## Elevation & Depth

The workspace is mostly flat. Contrast between the muted canvas and paper surfaces, plus fine rules, establishes structure. The open editor alone receives a soft ambient shadow (`0 12px 35px rgba(22, 50, 38, .07)`) to make the active work area clear. Input focus uses a green ring (`0 0 0 3px rgba(47, 124, 103, .14)`).

**The Active Editor Rule.** Apply the ambient shadow to the open editor only; resting data surfaces remain flat.

## Shapes

Corners are gently rounded: compact controls use the `compact` and `field` radii, buttons use the `button` radius, and larger surfaces use the `panel` radius. Fine borders define panels and rows. The small brand mark is a rotated two-column tile, echoing the ordered ledger without adding an image asset.

## Components

### Buttons

- **Primary:** terracotta fill, paper text, medium weight, and a 44px minimum target height. It darkens on hover and moves down by 1px while pressed.
- **Secondary:** paper fill, forest ink, and a strong rule border. Hover adds a pale green surface and clearer border.
- **Focus and motion:** keyboard focus uses the shared 3px outline. The 180ms color and transform transitions stop when reduced motion is requested.

### Navigation

The left sidebar holds the tile mark, product name, Plan, Applications, Settings, and the current database name. The active destination has a distinct muted green surface. Windows has no native menu bar; macOS keeps only the native app menu. Settings is an uncluttered four-section page for Database, OpenAI key, Appearance, and Logs.

### Cards and containers

The statistic band, application list, empty state, and editor sit on paper. The band and table use rules between items. Only the editor has a shadow.

### Inputs and fields

Inputs have white fill, strong rule borders, and the `field` radius. The green focus border and ring work with the global keyboard outline. Field labels sit above controls. The resume upload button uses a dashed green border to distinguish file selection from data entry.

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

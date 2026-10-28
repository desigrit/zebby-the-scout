# Android

This is the native Android extension of Zebby's incumbent Ember Search Ledger. It describes Android implementation choices; root `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` retain their desktop authority. Source is under `android/app/src/main/java/com/desigrit/zebby/ui/`.

Primary target: `android/app/src/main/java/com/desigrit/zebby/ui/App.kt`.
Related targets: `Theme.kt`, `Jobs.kt`, `Editor.kt`, `Settings.kt`, `CreditsUi.kt`, and `Components.kt` in the same directory.

## Surface strategy

TASK: Prepare a resume plan, record applications, inspect progress, and move the same SQLite database between Android and desktop with explicit sync.

FREQUENCY: Repeated short sessions across several roles, with longer editing and review sessions on tablets.

INFORMATION: Saved roles, posting and resume sources, editable recommendations, independent importance values, resume match and its explanation, hiring status, notes, activity, provider readiness, credits, and database sync state.

STATES: Empty and filtered lists; a saved or unsaved editor; source and result views; active background analysis; provider errors and cancellation; explicit cloud save/load; credit purchase, recovery, and pairing.

SUCCESS: The user can inspect and edit the current record, keep primary actions reachable, navigate while analysis finishes, and deliberately transfer the database without implying that simultaneous SQLite edits can merge.

CONSTRAINTS: One repository, desktop schema 10, original files and recovery copies preserved. Use Zebby credits, OpenAI or Anthropic keys, and reachable Ollama servers. Models running on the phone are deferred. Cloud folder sync uses Android's document provider; real OneDrive capabilities remain unverified. This build is a preview.

## Direction contract

MODE: Operate.

THESIS: Ember's role ledger becomes a native Material 3 workspace for short phone sessions and wider tablet review.

OWN-WORLD: Warm neutral canvas, rust actions, quiet selection washes, readable semantic hiring colors, fine rules, Android system type, and the approved circular sunglasses zebra. Preserve brand through Material color roles and native component behavior.

STORY: Find or create a plan, work in Job & resume, inspect Analysis, edit or copy recommendations, and save or Move to Applied. Review Applications and its selected record. Configure analysis, credits, appearance, and explicit database transfer in Settings.

FIRST VIEWPORT: Plan opens to search and saved role cards with one New plan extended FAB. Existing analyzed plans open to Analysis; source editing is under Job & resume. Applications puts the 30-day chart and filters before the list. Settings begins with Analysis and continues through Credits, Database, Appearance, and Help.

FORM: Compact windows use a three-destination navigation bar. Expanded windows use a navigation rail and a divided application list/inspector. Work surfaces remain flat; Material components supply controls, sheets, dialogs, and transient feedback. This is a code-led extension with no generated comp or new visual world.

## Implemented color roles

`Theme.kt` supplies explicit light and dark `ColorScheme` values. The table records the Android mapping, not replacement desktop tokens. Wallpaper-derived dynamic color is not enabled. Unlisted Material roles retain the library defaults.

| Android role | Light | Dark | Use |
| --- | --- | --- | --- |
| primary | `#A64A34` | `#F0AC91` | Actions, focus, importance |
| onPrimary | `#FFFFFF` | `#24201E` | Filled action content |
| primaryContainer | `#F8E8E1` | `#443830` | Selected records, thinking, packs |
| onPrimaryContainer | `#773222` | `#FFC5AD` | Selected content |
| secondary | `#71675F` | `#BDB8B2` | Secondary control color |
| secondaryContainer | `#F0ECE6` | `#35302D` | Material selection surfaces |
| onSecondaryContainer | `#302C29` | `#F2F0EC` | Content on secondary containers |
| background / surface | `#F8F6F3` | `#24201E` | Workspace and top bar |
| onBackground / onSurface | `#302C29` | `#F2F0EC` | Main text and icons |
| surfaceContainer | `#F0ECE6` | `#2D2825` | Neutral grouped content |
| surfaceContainerLow | `#F5F2EE` | `#292421` | Navigation bar and rail |
| surfaceContainerLowest | `#FFFFFF` | `#1E1B19` | Lists, footer, unselected packs |
| surfaceContainerHigh | `#ECE6DF` | `#35302D` | Higher Material surfaces |
| surfaceVariant | `#F0ECE6` | `#332D29` | Variant surfaces |
| onSurfaceVariant | `#71675F` | `#BDB8B2` | Supporting text and Applied status |
| outline | `#A49A90` | `#89817A` | Field outlines |
| outlineVariant | `#DDD7D0` | `#4F4A48` | Dividers, neutral outlines, tracks |
| tertiary | `#2D8864` | `#9DD8BC` | Interview status and strong match |
| error | `#9E3D22` | `#F5B3A6` | Errors, rejected status, destructive action |
| errorContainer | `#FFF0E9` | `#4C302A` | Error surface |
| onErrorContainer | `#862F19` | `#F5B3A6` | Error surface content |

`Components.kt` adds Heard back (`#855D1E` light / `#F0D7A7` dark) and Offer received (`#2868AA` light / `#A7CEFF` dark). The activity chart stacks those status colors rather than applying a single activity color. A match of at least 75 uses tertiary; lower matches use primary. Scores and status names remain visible beside color.

**Color Roles Rule:** Keep actions, selection, and semantic status distinct through their Material roles; show the score or stage in text.

## Typography, shapes, and depth

`ZebbyTheme` uses unmodified Material 3 `Typography()` and default Material shapes. There is no bundled display font or per-screen fixed pixel type scale. Headline small carries record identity and sheet/empty-state headings; headline medium carries pack prices; title medium carries section names, role cards, and match values. Body large is used for prominent fields and identity support; body medium for working text; body small for helpers and metadata. Label roles carry compact actions and importance. Stock `sp` sizing follows the system font setting.

`shapes.small` groups thinking choices and Not analyzed; `shapes.medium` frames role cards, errors, credit balance, and packs; `shapes.large` frames the activity panel. Buttons, segmented controls, fields, dialogs, and sheets keep their Material shapes. Work cards and the editor use tonal separation without custom resting shadows; the FAB and modal components retain Material elevation. The bottom navigation explicitly uses zero tonal elevation.

**Native Control Rule:** Use Compose Material 3 structure, typography roles, focus, selected states, and touch behavior. Desktop sidebar dimensions, titlebar geometry, and mouse conventions do not apply to Android.

## Layout and spacing

| Implemented dimension | Value | Source use |
| --- | --- | --- |
| Expanded-window threshold | `840.dp` | Rail, editor columns, application inspector |
| Plan list / Settings maximum | `840.dp` | Centered content region |
| Editor / Applications maximum | `1240.dp` | Centered wide work region |
| List side inset | `20.dp` | Plan and application lists |
| Editor / Settings / detail side inset | `24.dp` | Working documents and preferences |
| List bottom clearance | `100.dp` | Keeps records clear of the FAB |
| List gap | `8.dp` | Repeated role cards |
| Editor section gap | `24.dp` | Working sections |
| Settings section gap | `28.dp` | Preference groups |
| Shared section gap | `12.dp` | Heading and controls |
| Editor footer | `20.dp` horizontal, `12.dp` vertical | Save and Move to Applied |
| Action icon target / image | At least `48.dp` / `22.dp` | Shared icon actions |
| Main editor action minimum | `48.dp` | Save, Analyze, Move to Applied |
| Checkout minimum | `52.dp` | Continue |

The shell consumes Scaffold insets and adds IME padding. `Theme.kt` sets transparent system bars with light or dark icon appearance from the selected theme and matches the window background. Back closes the editor or selected record, with a native discard dialog when necessary.

On expanded widths, recommendations use two columns with a `24.dp` gap, source identity fields can use a `16.dp` gap, and the application list and inspector take equal flexible widths divided by a Material rule. Compact application selection opens a full detail view. Editors keep their footer outside the scrolling content. Settings and pricing content scroll, and thinking choices wrap.

## Components and interaction

- Navigation retains Plan, Applications, and Settings. The rail zebra is `40.dp`; the compact top-bar and purchase-sheet zebra are `36.dp`. `android/app/src/main/res/drawable/zebby.png` is byte-identical to approved `public/brand-icon.png` (SHA-256 `d4a9d47189d768981f7eda0243fd21ee8b1a39c54cdd8928639c68193b5e49ba`). It remains full-color and circular.
- One extended FAB creates the current kind of record and disappears inside editing or detail. Whole role cards select their record. Search is outlined; company and status filters use Material chips and menus.
- Job & resume and Analysis use a single-choice segmented control. Results retain Why this score separately from the summary's wording rationale. Recommendation text opens an edit dialog; each item has Copy then Remove, a readable importance value, and Unrated after its content changes.
- Analysis runs belong to records and continue across navigation. Active rows show a spinner. Progress pairs elapsed time with streamed stage text and Cancel. Stage changes use Compose `AnimatedContent`; source controls for the analyzed record are disabled. Transient notices use a snackbar, and failures remain with the affected work.
- Thinking is hidden for zero or one usable choice. Exactly Off/On capabilities use a Material switch in a toggleable row. Other capabilities use named wrapping choices in a selectable radio group with at least `48.dp` height. Labels include Extra high, Maximum, and Model default where supplied.
- Settings uses separated sections and native menus, outlined fields, buttons, and dialogs. Saved API keys are masked with the last four characters; Change, Remove, Done, and Cancel keep credential editing explicit. Provider credentials are local to the device.
- Credits uses a balance/usage bar, recovery and pairing actions, and a scrollable Material bottom sheet for packs. The starter pack is initially selected. Packs are a single radio group; selection uses primaryContainer plus a `2.dp` primary border, versus the neutral `1.dp` outline. Model and thinking remain in Settings. Checkout opens the external browser.
- A failed Restore credits or Connect this device request leaves the dialog and entered code intact, marks the field as an error, and places the failure next to it. Pending requests show Connecting and disable conflicting dialog actions.
- Database offers Import, Export copy, Create new, saved local workspaces, and Connect cloud folder. A connected folder exposes separate Save to cloud and Load from cloud actions and last-sync text. Helpers explain closing the other device and keeping recovery copies; they do not promise automatic sync.
- The activity canvas opens a daily-count sheet and exposes an accessible total. Offer transitions show a three-second striped celebration with a message; when Android animations are disabled, the message remains without moving particles.

**Visible State Rule:** Preserve the entered data and place busy, error, and selected feedback with the action that owns it. Native semantics and text accompany color.

## Finish evidence and limits

The documentation pass checked current Kotlin source and eight representative screenshots across the actual API 35 ARM64 emulator's phone, tablet, and dark/large-font captures. The screenshot files postdate the final fixes to system bars, thinking controls, pack radio semantics, and recovery errors. Local review evidence lists the inspected frames; public screenshot provenance is recorded in `docs/screenshots/android/README.md`. The supplied final finish-review verdict is ship, with all four material fixes resolved across 27 valid refreshed captures.

The finished native presentation matches the incumbent Ember identity, with Material navigation, type, shape, and spacing adapted for Android. This is synthetic emulator verification. Physical-device gestures, performance and background behavior, real OneDrive provider capabilities, real API inference, checkout and paid analysis remain unverified. No native design detector ran, and this document does not replace the finish review or establish stable-release certification.

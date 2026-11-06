# Boards

MODE: Operate.

## Direction contract: compact board status

THESIS: Show new matching openings with a compact, understandable board status.

OWN-WORLD: Extend Zebby's existing Ember rows, platform typography, rust actions and quiet dividers. Preserve file recovery, the sidebar and Settings.

STORY: Read the count of matching roles, inspect new discoveries, then mark them reviewed. An interrupted scan preserves the last successful results.

FIRST VIEWPORT: Keep the company, saved URL and instructions, last check date, matching count and check or retry action visible, with the new-listing link and Mark as reviewed when discoveries exist. Show error details on hover, focus or tap of Check incomplete without expanding the row.

FORM: Local extension. Use the incumbent tokens and controls, an inline list of new listings, existing 50-listing pagination, an accessible tooltip and existing focus recovery. No new identity, assets or system changes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Compact board status

Boards uses a centered BETA badge in the page heading and navigation label, with solid Ember rust and white text in both appearances. Each completed board shows one count labeled "x listings checked": roles matching its saved instructions, or all openings at its saved URL when instructions are blank. This count remains visible while a subsequent scan runs and after an interrupted scan, until a complete result replaces it.

An underlined rust "x new listings" action appears only when unread matching discoveries exist, with singular wording for one listing. Mark as reviewed sits below the summary. A completed board with no unread discoveries and no error shows No new listings. Before a successful check, the row shows Not indexed, Indexing during its first scan, or Check incomplete after a failure. Check for updates becomes Retry after a failed check; an active scan exposes Cancel check.

Check incomplete is a compact dotted-underlined text button. Hover, keyboard focus or tap opens the error in a tooltip associated through aria-describedby. The tooltip stays available while the pointer moves onto it, dismisses with Escape or an outside press, and closes after focus and pointer leave. It follows the trigger on scroll and resize, closes when the trigger leaves the viewport, and places itself above or below the trigger within a 16px viewport inset. Its paper surface, strong rule, 6px corners and 12px native text use the current appearance tokens. Long errors wrap within a maximum width of 360px and scroll within the available viewport height. Error details do not increase the board row's height, and unread discoveries remain available after a failed check.

## New listing inspection

The new-listing action toggles one inline inspection beneath its board across the full row width. The section contains only unread matching discoveries and opens with focus on its heading. Close listings returns focus to the initiating action without moving the workspace scroll position; if that action is no longer present, focus returns to the board's check action. Switching Boards files clears the visible inspection. Successful Mark as reviewed closes that board's inspection and returns focus to its check action.

Listing titles open the source page. Department and location appear beneath the title when available; an unread discovery absent from the latest completed check carries the plain text status No longer listed. Opening a listing leaves its review state unchanged. Results use 50-listing pages with a visible range and total, plus Previous and Next when needed. Opening a fresh inspection starts at the first page, and the page offset stays within the available unread results. Loading, empty and failed requests remain inside the section, and a failed request offers Retry.

The section extends Ember's flat ruled rows and native typography, with a 17px heading, 13px listing titles, 12px metadata and 11px status text. At window widths of 650px or less, each listing's status stacks below its identity and pagination wraps. The existing board layout becomes two columns at 1180px and one column at 850px. Long titles and metadata wrap within the available width.

## File recovery

The Settings sync hint follows the Boards file card directly with the standard help-text gap; omit empty action rows.

A missing Boards file uses one quiet recovery section in Boards and Settings, with the heading "Couldn't find your Boards file." Show the exact filename and its Applications folder together, followed by Retry and Create new Boards file. Use the incumbent SettingsAction controls, database-location treatment, platform type, Ember colors and wrapping paths. Keep missing-file guidance separate from invalid-file and access errors.

Retry opens a restored file and announces when it is still missing. Creation starts an empty list, first preserving cached history as a separate saved file beside Applications. Never overwrite an existing destination or discard pending changes. Show the saved copy's path and explain Import Boards history. Recovery restores keyboard focus to the Boards heading or Settings file section. Actions expose busy states and block duplicate submissions. Keep previous-history export available as a quiet link.

Verification covers restored history, an empty replacement, unchanged Applications bytes, a concurrent sync restoration, an archive failure, pending changes, workspace isolation, light and dark appearances, narrow layouts and keyboard focus. Tests use disposable files on GitHub-hosted runners.

## Finish evidence

The compact-status finish review returned **ship** for commit `a2c4ad6`, with no material fixes. The reviewer checked TYPE, MATERIAL and GROUND, the first viewport, count and discovery behavior, error disclosure, new-listing pagination and focus, and accessibility. All nine captures in `slack-evidence-a2c4/.impeccable/review/` were valid: `boards-desktop-light.png`, `boards-desktop-dark.png`, `boards-tooltip-light.png`, `boards-tooltip-dark.png`, `boards-tooltip-compact-light.png`, `boards-tooltip-compact-dark.png`, `boards-listings-compact-light.png`, `boards-listings-compact-dark.png` and `boards-error-with-new.png`. Hosted renderer checks passed in run `42281665083`.

The implemented behavior is recorded from `desktop/renderer/BoardsView.tsx`, `desktop/renderer/desktop.css` and the existing matching-listing semantics in `desktop/boards-store.ts`. This local extension preserves `DESIGN.md` and `.impeccable/design.json` and introduces no new visual assets. File recovery, Settings, the sidebar and analysis-provider behavior retain their existing contracts.

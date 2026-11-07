# Boards

MODE: Operate.

## Direction contract: compact board status

THESIS: Show new matching openings with a compact, understandable board status.

OWN-WORLD: Extend Zebby's existing Ember rows, platform typography, rust actions and quiet dividers. Preserve file recovery, the sidebar and Settings.

STORY: Read the count of matching roles, inspect new discoveries, then mark them reviewed. An active recheck replaces the count with progress on the second status line. An interrupted scan preserves the last successful results and restores their count.

FIRST VIEWPORT: Keep the company, saved URL, a light Custom instructions label when applicable, last check date, matching count or active check progress and check or retry action visible. Place the Mark as reviewed check icon beside the new-listing link when discoveries exist. Read or change the complete instructions through Edit board. Show error details on hover, focus or tap of Check incomplete without expanding the row.

FORM: Local extension. Use the incumbent tokens and controls, an inline list of new listings, existing 50-listing pagination, an accessible tooltip and existing focus recovery. No new identity, assets or system changes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Compact board status

The company name and an optional Custom instructions label share one line above the saved URL. The light label uses the existing accent wash, rust text, 10px native type, 4px corners and 4px by 6px padding. Its compact shape follows BETA without the solid fill. It has no icon, hover preview or separate action. Long company names truncate with native hover text. Full instructions appear in the existing Edit board form, so their length does not change the summary row height. Boards with blank or whitespace-only instructions have no label.

Boards uses a centered BETA badge in the page heading and navigation label, with solid Ember rust and white text in both appearances. Each completed board shows one count labeled "x listings checked" on the second status line: roles matching its saved instructions, or all openings at its saved URL when instructions are blank. During a subsequent scan, a spinner and current progress message replace that count on the same line. When progress ends, the last successful count returns, including after an interrupted scan, until a completed result replaces it.

An underlined rust "x new listings" action appears only when unread matching discoveries exist, with singular wording for one listing. A 14px check icon in a 24px control sits immediately beside it on the first status line. The control has the accessible name Mark as reviewed and opens that tooltip above it on hover or keyboard focus, with viewport-aware positioning and Escape dismissal. A completed board with no unread discoveries and no error shows No new listings. Before a successful check, the row shows Not indexed, Indexing during its first scan, or Check incomplete after a failure. Check for updates becomes Retry after a failed check; an active scan exposes Cancel check.

Mark as reviewed replaces the check icon with a saving spinner, exposes its busy state and blocks duplicate submissions while preserving the count and expanded discoveries. After a successful save, the check gently scales from full size to 75% and fades out over 180ms. Reduced motion skips this exit motion. A failed save leaves unread discoveries and expanded rows intact, restores the check icon and keeps the action retryable.

Check incomplete is a compact dotted-underlined text button. Hover, keyboard focus or tap opens the error in a tooltip associated through aria-describedby. The tooltip stays available while the pointer moves onto it, dismisses with Escape or an outside press, and closes after focus and pointer leave. It follows the trigger on scroll and resize, closes when the trigger leaves the viewport, and places itself above or below the trigger within a 16px viewport inset. Its paper surface, strong rule, 6px corners and 12px native text use the current appearance tokens. Long errors wrap within a maximum width of 360px and scroll within the available viewport height. Error details do not increase the board row's height, and unread discoveries remain available after a failed check.

## New listing inspection

The new-listing action toggles one inline inspection beneath its board across the full row width. The section contains only unread matching discoveries and starts directly with role rows, without a visible company heading or subtitle. It retains the accessible label "[company] new listings" and receives focus when opened. Close listings returns focus to the initiating action without moving the workspace scroll position; if that action is no longer present, focus returns to the board's check action. Switching Boards files clears the visible inspection. Successful Mark as reviewed closes that board's inspection and returns focus to its check action.

Listing titles open the source page. Department and location appear beneath the title when available; an unread discovery absent from the latest completed check carries the plain text status No longer listed. Opening a listing leaves its review state unchanged. Results use 50-listing pages. The range, total, Previous and Next controls appear only when there are more than 50 discoveries. Opening a fresh inspection starts at the first page, and the page offset stays within the available unread results. Loading, empty and failed requests remain inside the section, and a failed request offers Retry.

Generic action labels such as Apply are not role titles. Extraction reads each job's own card and stops before borrowing a heading from another job destination. Saved Workday URLs recover meaningful role names from their job slugs when legacy records contain an action label or no title, including job IDs with a numeric suffix such as JR365824-2. A valid saved title is retained; if no meaningful title can be recovered, the listing displays its source URL.

The section extends Ember's flat ruled rows and native typography, with 13px listing titles, 12px metadata and 11px status text. The close control stays at the upper right, with space reserved beside the first role row. At window widths of 650px or less, each listing's status stacks below its identity and pagination wraps. The existing board layout becomes two columns at 1180px and one column at 850px. Long titles and metadata wrap within the available width.

## File recovery

The Settings sync hint follows the Boards file card directly with the standard help-text gap; omit empty action rows.

A missing Boards file uses one quiet recovery section in Boards and Settings, with the heading "Couldn't find your Boards file." Show the exact filename and its Applications folder together, followed by Retry and Create new Boards file. Use the incumbent SettingsAction controls, database-location treatment, platform type, Ember colors and wrapping paths. Keep missing-file guidance separate from invalid-file and access errors.

Retry opens a restored file and announces when it is still missing. Creation starts an empty list, first preserving cached history as a separate saved file beside Applications. Never overwrite an existing destination or discard pending changes. Show the saved copy's path and explain Import Boards history. Recovery restores keyboard focus to the Boards heading or Settings file section. Actions expose busy states and block duplicate submissions. Keep previous-history export available as a quiet link.

Verification covers restored history, an empty replacement, unchanged Applications bytes, a concurrent sync restoration, an archive failure, pending changes, workspace isolation, light and dark appearances, narrow layouts and keyboard focus. Tests use disposable files on GitHub-hosted runners.

## Finish evidence

### Boards row polish

The finish review in `.impeccable/review/boards-polish-finish-review.md` returned **ship**, with no material fixes, for the shared refinement in public Zebby `2.9.4` and private Zebby `2.10.0-beta.5`. It checked TYPE, MATERIAL, GROUND, the first viewport, progress replacement, the adjacent review action and tooltip, the light instruction label, direct role rows, title recovery, saving and completion feedback, error recovery, accessibility and responsive behavior. Ember's existing tokens, native typography and flat ruled composition remain intact.

All 18 required captures listed in `.impeccable/review/boards-polish-packet.md` were inspected and valid. They are saved under `.impeccable/review/boards-polish-round1/.impeccable/review/`:

- `boards-polish-mixed-1550-light.png`
- `boards-polish-mixed-1550-dark.png`
- `boards-polish-mixed-1325-light.png`
- `boards-polish-mixed-1325-dark.png`
- `boards-polish-mixed-1050-light.png`
- `boards-polish-mixed-1050-dark.png`
- `boards-polish-mixed-790-light.png`
- `boards-polish-mixed-790-dark.png`
- `boards-listings-light.png`
- `boards-listings-dark.png`
- `boards-listings-compact-light.png`
- `boards-listings-compact-dark.png`
- `boards-polish-review-tooltip.png`
- `boards-polish-review-saving.png`
- `boards-polish-reviewed.png`
- `boards-listings-error.png`
- `boards-instructions-1325-light.png`
- `boards-instructions-1325-dark.png`

The captures cover mixed states at 1550px, 1325px, 1050px and 790px in light and dark appearances, expanded listings at wide and compact widths, review tooltip, saving, reviewed and listing-error states, and the instruction label in both appearances. The reviewer found no clipping, overlap, contrast or spacing failures.

Public hosted Windows [run 42345233304](https://github.com/desigrit/zebby-the-scout/actions/runs/42345233304) passed tests, type checking, lint, build, native layered fixtures and full renderer checks. Captures came from `4684bc9`, with the same UI code as the reviewed public and Beta branches. Renderer assertions cover progress replacement and restoration, review adjacency and tooltip placement, saving and duplicate prevention, failure preserving unread counts and expanded rows, the 180ms success animation, reduced motion, focus restoration, the legacy Apply title, empty states, pagination, equal row heights and horizontal overflow. Subsequent title recovery corrections support suffixed Workday IDs and the observed desktop job-card markup without changing layout or motion.

Final live Slack verification passed on public commit `8fe0389` in [run 42345904587](https://github.com/desigrit/zebby-the-scout/actions/runs/42345904587), reading all three exact role titles directly from the DOM, including "Senior Product Manager, Data Products" with its displayed punctuation.

The surface record is grounded in `desktop/renderer/BoardsView.tsx`, `desktop/renderer/desktop.css`, `shared/board-listing-title.ts`, `desktop/board-page.ts` and `desktop/boards-scan.ts`. No new visual assets or global system changes were introduced, so `DESIGN.md` and `.impeccable/design.json` remain unchanged. The static detector's 21 findings concern existing shell declarations outside the modified blocks; they are not adopted as new system rules or repaired in this scope. File recovery, Settings, the sidebar and analysis-provider behavior retain their existing contracts.

### Earlier compact status and instruction refinements

The compact-status finish review returned **ship** for commit `a2c4ad6`, with no material fixes. The reviewer checked TYPE, MATERIAL and GROUND, the first viewport, count and discovery behavior, error disclosure, new-listing pagination and focus, and accessibility. All nine captures in `slack-evidence-a2c4/.impeccable/review/` were valid: `boards-desktop-light.png`, `boards-desktop-dark.png`, `boards-tooltip-light.png`, `boards-tooltip-dark.png`, `boards-tooltip-compact-light.png`, `boards-tooltip-compact-dark.png`, `boards-listings-compact-light.png`, `boards-listings-compact-dark.png` and `boards-error-with-new.png`. Hosted renderer checks passed in run `42281665083`.

The implemented behavior is recorded from `desktop/renderer/BoardsView.tsx`, `desktop/renderer/desktop.css` and the existing matching-listing semantics in `desktop/boards-store.ts`. This local extension preserves `DESIGN.md` and `.impeccable/design.json` and introduces no new visual assets. File recovery, Settings, the sidebar and analysis-provider behavior retain their existing contracts.

The Custom instructions finish review returned **ship** for commit `0f1e51f9` in version `2.9.1`, with no material fixes. All seven captures in `instructions-evidence-0f1e/.impeccable/review/` were valid: `boards-instructions-1550-light.png`, `boards-instructions-1550-dark.png`, `boards-instructions-1050-light.png`, `boards-instructions-1050-dark.png`, `boards-instructions-790-light.png`, `boards-instructions-790-dark.png` and `boards-instructions-edit.png`. Rows with matching status retained equal heights with long, short or blank instructions at 1550px, 1050px and 790px in light and dark appearances.

The source and review confirm the quiet company-line indicator, its absence for blank or whitespace-only instructions, full text absent from the summary and hover, company-name ellipsis with a native title, and the existing Edit board form with Cancel preserving saved instructions. Ember colors, native typography, flat ruled rows, other controls and responsive structure remain intact. Hosted renderer, Boards and credits checks passed in GitHub run `42308484465`; renderer coverage is recorded in `scripts/qa-boards-renderer.mjs`. The static detector returned `[]`. This scoped refinement adds no visual assets or system changes and preserves the compact error disclosure and File recovery contracts above.

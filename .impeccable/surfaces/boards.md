# Boards

MODE: Operate.

## Direction contract: listing inspection

THESIS: Make a board check understandable through its actual listings and matches.

OWN-WORLD: Extend Zebby's existing Ember rows, platform typography, rust actions and quiet dividers. Preserve file recovery, the sidebar and Settings.

STORY: Read the last successful checked and matched counts, inspect the relevant listings, then mark discoveries reviewed. An interrupted scan leaves this evidence available.

FIRST VIEWPORT: Keep the company, saved instructions, last check, update count and check action visible. Expand one listing section beneath its board without opening a modal.

FORM: Local extension. Use the incumbent tokens and controls, an inline result list, accessible filter buttons and bounded pagination. No new identity or assets.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Listing inspection

Boards uses a centered BETA badge in the page heading and navigation label, with solid Ember rust and white text in both appearances. First scans show Indexing. Every completed board separates all listings checked from those matching the saved instructions, with new discoveries above and Mark as reviewed below. Boards without instructions label the matching count as tracked. Subsequent scans keep the last successful counts visible until the next complete result.

View matches opens Matches for a board with instructions; View listings opens All checked for a board without instructions. The new-listing count opens New. Only one board's inspection is open at a time, beneath that board across the full row width. The three filter buttons use readable labels, pressed state and the incumbent rust selection wash. Opening the section focuses its heading; Close listings returns focus to the initiating button without moving the workspace scroll position. Switching Boards files clears the visible inspection.

Listing titles open the source page. Department and location appear beneath the title when available, with plain text states for New, Matches, Outside your instructions and No longer listed. Opening a listing leaves its review state unchanged; Mark as reviewed remains an explicit board action. Results use 50-listing pages with a visible range and total, plus Previous and Next when needed. Changing a filter resets to the first page. Loading, empty and failed requests remain inside the section, and a failed request offers Retry.

The section extends Ember's flat ruled rows and native typography, with a 17px heading, 13px listing titles, 12px metadata and 11px status text. Filter targets are at least 36px tall. At window widths of 650px or less, each listing's status stacks below its identity and pagination wraps. The existing board layout becomes two columns at 1180px and one column at 850px. Long titles and metadata wrap within the available width.

## File recovery

The Settings sync hint follows the Boards file card directly with the standard help-text gap; omit empty action rows.

A missing Boards file uses one quiet recovery section in Boards and Settings, with the heading "Couldn't find your Boards file." Show the exact filename and its Applications folder together, followed by Retry and Create new Boards file. Use the incumbent SettingsAction controls, database-location treatment, platform type, Ember colors and wrapping paths. Keep missing-file guidance separate from invalid-file and access errors.

Retry opens a restored file and announces when it is still missing. Creation starts an empty list, first preserving cached history as a separate saved file beside Applications. Never overwrite an existing destination or discard pending changes. Show the saved copy's path and explain Import Boards history. Recovery restores keyboard focus to the Boards heading or Settings file section. Actions expose busy states and block duplicate submissions. Keep previous-history export available as a quiet link.

Verification covers restored history, an empty replacement, unchanged Applications bytes, a concurrent sync restoration, an archive failure, pending changes, workspace isolation, light and dark appearances, narrow layouts and keyboard focus. Tests use disposable files on GitHub-hosted runners.

## Finish evidence

The listing-inspection finish review returned **ship** after checking the light, dark, compact light, compact dark and error captures in `board-layers-evidence-98ea/.impeccable/review/`: `boards-listings-light.png`, `boards-listings-dark.png`, `boards-listings-compact-light.png`, `boards-listings-compact-dark.png` and `boards-listings-error.png`. The reviewer confirmed Ember fidelity, appropriate compact adaptation and no material fixes. The implemented behavior is recorded from `desktop/renderer/BoardsView.tsx` and `desktop/renderer/desktop.css`. This local extension preserves `DESIGN.md` and `.impeccable/design.json` and introduces no new visual assets.

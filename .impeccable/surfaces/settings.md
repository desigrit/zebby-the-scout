# Settings

## Surface strategy

TASK: Choose analysis, manage paid credits, the current database, and local models, select appearance, find troubleshooting actions, and update Zebby.

FREQUENCY: Occasional setup and maintenance, with simple return visits to change a provider or open a file.

INFORMATION: Current database, provider-specific controls, model readiness/terms/download, credit account and wallet, appearance, logs and issues, installed version and update state. Local storage details are available on demand.

STATES: No/open/dirty database; saved or session-only key; selected provider/model; terms agreement; download progress/pause/retry/Ready; signed-in or unavailable credits; current or saved wallet; system/light/dark appearance; update check/download/verified restart/error.

SUCCESS: The user can see the active source, solve a missing prerequisite, and reach a native control without interpreting a setup guide.

CONSTRAINTS: Keep database semantics, secure local settings, full inference, model terms, download controls, updates, native conventions, and all user data. Provider changes never silently fall back. User-pinned F03 setup-navigation discard behavior stays unchanged.

## Direction contract

MODE: Operate.

THESIS: Short section rows align each maintenance task with its native controls and reveal detail when needed.

OWN-WORLD: Ember warm neutrals, rust actions, fine separators, platform fonts, native dropdowns, and the unchanged shared zebra and titlebar. Selection remains quiet in both appearances.

STORY: Open a database or create a blank file, choose Analyze with and solve its prerequisites, manage credits when selected, pick appearance, open logs/issues, and explicitly download or restart an update.

FIRST VIEWPORT: Start with Database and Current file, Open database, Create new database, and one sync helper line. Analysis follows with Analyze with, then Credits, Appearance, Logs, and Updates. There is no repeated page heading. Narrow layouts put headings above controls.

FORM: The user's selected Ember Settings code concept, with aligned native controls and concise labels. The selected local model's terms/progress-to-Ready flow remains inline.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Database and logs

Create new database exclusively creates and selects a blank SQLite file, preserving existing files and the previous database. Pending writes are awaited; unsaved changes block switching. Canceling the native dialog preserves selection. The sync helper is one line, with a dirty-save warning and Retry save only when needed.

Version 1.6.0 keeps schema 10. Existing older-file before-v10 backups, records, Notes, resumes, and prior backups remain. There is no weekly backup generation or pruning. Both computers need version 1.4.1 or newer for a shared schema 10 file.

Logs are always on for errors, local to each computer, separate from the database, and created lazily with bounded entries, rotation, and known-key redaction. The surface exposes only Open logs folder and Report an issue. These underlined actions use rust ink, an external-arrow icon, and visible focus. No logging toggle is introduced.

## Analysis controls

Credits uses aligned recovery and computer rows below the balance and model. Save recovery code exports through a native file picker. Restore credits and Connect this computer open focused inline forms with Cancel and Escape. Pairing shows a copyable code, expiry, regeneration and explicit cancellation. Connected computers and advanced recovery options stay collapsed. Disconnect, recovery-code replacement and funded-wallet switching use native confirmation with Cancel as default. Checkout has no signup or sign-in screen. This is an extension of the incumbent Ember system.

Analyze with is a native dropdown: Local server, Downloaded model, OpenAI API key, Anthropic API key, or Zebby credits. Only the chosen method's controls appear. Missing prerequisites use short local hints. Local and personal-key methods do not require a Zebby account.

Ollama retains Server URL, installed Model selection, refresh, custom model name, and Save. OpenAI and Anthropic each expose their provider's model dropdown and secure local key saving, replacement, and removal. Keys last for the session when secure storage is unavailable. The selected provider's helper identifies where source content goes and whose API account is billed. The built-in provider retains its model dropdown, required terms, inline download progress, Pause/Resume/Retry, per-model Delete with native confirmation, and expandable storage/library detail.

Appearance uses System, Light, and Dark. System follows the operating system. These appearance, provider, accepted terms, models, and navigation preferences remain on each computer; applications, plans, resumes, and the last saved overview stay in the chosen database.

## Updates and artifact migration

Updates retains the installed version, Check for updates, live status, explicit Update, progress, verification, Restart to update, retry/error states, and Release notes. Automatic checks run on launch and window focus after six hours. The sidebar mirrors the available action in both navigation states.

Restart protects open forms/dialogs, confirms unsaved Plan edits, waits for active requests, requires database saving, pauses downloads, stops the engine, and flushes logs. Installer behavior remains a separate native CI gate. Windows replaces and reopens Zebby. Mac keeps the previous app until the replacement confirms loading and restores it on immediate reopen failure.

Known legacy profiles still migrate into Zebby while preserving settings, accepted terms, logs, working copies, default databases, models, and external cloud selections. Existing destination files take precedence and original profile records/logs remain recovery copies. The internal package and app ID remain unchanged. See [the guide](../../docs/guide.md) for locations and migration details.

## Preserved constraints

The unchanged 46px circular zebra sits in a 54px accessible navigation toggle. The title region is 44px and reads only Zebby. The image has equal top and left insets within the rail: 26px when expanded, 25px when explicitly collapsed, and 13px in the automatic 72px rail at logical widths of 650px or less. Sidebar top padding is 22px, 21px, and 9px respectively. Windows navigation spans the title region. Mac navigation begins below it, placing the expanded image at y=70px and the explicitly collapsed image at y=69px. Native Windows controls and Mac traffic lights remain native. Expanded navigation is 210px, 176px at the 850px window breakpoint, and 72px at extreme logical widths of 650px or less. Explicitly collapsed navigation remains 96px, including at extreme widths. Database details appear only when expanded; Settings retains them in both states.

The toggle has action labels, expanded state, tooltips, and Enter or Space activation. Its local preference rolls back with an error if saving fails; toggling preserves drafts and destination. Shell width, title-region width, rail padding, and icon positions transition together over 280ms with cubic-bezier(.16, 1, .3, 1). Labels fade out over 100ms and fade in over 180ms after a 60ms delay. Destinations have 48px targets and 24px icons. Accepted activation navigates immediately and plays a brief offline Lottie animation for about 417ms. Plan uses a magnifier with a star and a small sprinkle, with a flutter that returns to the same static geometry. Reduced motion removes sidebar transitions and keeps icons still; player failure retains the static icon. Completion, hiding, or a reduced-motion change restores the rest state. Desktop controls use the arrow cursor and text fields use the text cursor.

Windows scroll containers reserve a stable 12px gutter. The resting 2px thumb widens to 8px on hover, focus, or scrolling. Mac keeps native system scrollers. Physical macOS behavior has not been manually reviewed.

Full-model inference, installed Ollama models, selected databases, and local model storage remain unchanged. Terms links remain available before agreement. Native Delete confirms model removal; updates retain downloads. App-local actions and native text editing retain their existing keyboard behavior without visible shortcut lists.

## Analysis paths

| Model | Download | Analysis path |
| --- | --- | --- |
| SmolLM2 360M | 271 MB | Compact heuristic importance, keyword coverage, and limited overview suggestions |
| LFM2.5 350M | 229 MB | Complete input and full analysis instructions |
| Gemma 3 270M, Instruct QAT | 241 MB | Complete input and full analysis instructions |
| Qwen3 0.6B | 639 MB | Complete input and full analysis instructions |
| Qwen3 4B | 2.50 GB | Complete input and full analysis instructions |
| Qwen3 8B | 5.03 GB | Complete input and full analysis instructions |

OpenAI, Anthropic, Zebby credits, and configured Ollama retain their full selected-provider paths. Job importance remains independent of resume coverage and match. Match explanations describe evidence and gaps; overview rationale remains separate. This contract describes behavior, not a certification of inference quality.

## Finish evidence

Provider and appearance captures are indexed in capture evidence (internal record: `work/ember-implementation/capture-evidence.json`). They cover the three provider setups, both themes, scaled/narrow windows, and native focus. Public screenshot refresh changes only Applications and Plan; zebra assets are unchanged.

The pinned choices recorded here, from internal direction `work/ember-implementation/direction.md`, select Ember Applications and Settings and Rosewood's Plan composition in Ember colors. These are code concept references, not pixel reproduction requirements.

The full finish review (internal record: `work/ember-implementation/finish-review.md`) found two regressions. The finish verdict (internal record: `work/ember-implementation/finish-verdict.md`) marks both resolved and returns ship for that correction batch. It does not claim a new whole-surface audit. Final documentation and screenshot origins are recorded for this handoff.

Supplied final evidence reports 72 tests, lint, typecheck, build, complete headless regressions, ten native interaction checks, and 37 native captures passing. These were not rerun by the documenter. Native screenshots use synthetic applications, plans, and a dummy resume in an isolated hidden Windows Electron process. Provider outputs and clipboard are mocked; no real profile, credentials, models, or database were used. Both platform renderer simulations were checked, but physical macOS review and native installer validation remain outside this local evidence. CI handles installer gates separately.

The [UX health report](../../docs/ux-health-v1.6.0.md) records the resolved short-height role access and late cancellation findings, deliberately unchanged F01/F03 behavior, and the remaining low-severity observations. No numerical score or trend is claimed. One detector pass compared against the old system; no second detector, doctor, or context run was performed.

### 2026-10-04 analysis methods and credits

Settings now places Credits after Analysis and before Appearance. The section shows Available, Used, the signed-in email, reserved credits when present, and collapsed Recent usage. Refresh balance and Sign out are explicit actions. The native paid model dropdown appears after credits have been purchased; the pricing scene has no model dropdown. Buy credits opens the shared pack and email-code flow. Secure storage remembers the paid session on each computer; otherwise the user needs another email code when Zebby reopens.

The signed-in sidebar wallet exposes used and available amounts. Explicitly collapsed navigation presents an accessible icon button and wallet popover. Stale balance labels distinguish saved amounts after a refresh failure. Local model terms, download controls, Qwen inference, database selection, appearance, and existing update behavior are retained.

The [Analysis and credits contract](analysis-credits.md) records the full flow, packs, source evidence, and verification scope. Supplied final checks passed 91 Node tests, lint, TypeScript, and both desktop and service builds. An independent source and test review cleared all three scored fixes. No current native or browser capture was made; the historical captures above apply to their original releases. Hosted account, email, Stripe, provider, and native visual behavior remain unverified. The empty service URL leaves paid checkout unavailable.

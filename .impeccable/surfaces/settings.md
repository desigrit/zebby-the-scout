# Settings

## Surface strategy

TASK: Choose analysis, manage paid credits, the current database, and local models, select appearance, find troubleshooting actions, and update Zebby.

FREQUENCY: Occasional setup and maintenance, with simple return visits to change a provider or open a file.

INFORMATION: Current database, provider-specific controls, model readiness/terms/download, guest credit wallet, recovery code, pairing and connected computers, appearance, logs and issues, installed version and update state. Local storage details are available on demand.

STATES: No/open/dirty database; saved or session-only key; selected provider/model; terms agreement; download progress/pause/retry/Ready; credits unavailable/unconnected/pending/connected; current or saved wallet; recovery export/cancel/replacement; restore/connect editor and errors; pairing active/expired/used/cancelled; device removal; system/light/dark appearance; update check/download/verified restart/error.

SUCCESS: The user can see the active source, solve a missing prerequisite, and reach a native control without interpreting a setup guide.

CONSTRAINTS: Keep database semantics, secure local settings, full inference, model terms, download controls, updates, native conventions, and all user data. Provider changes never silently fall back. User-pinned F03 setup-navigation discard behavior stays unchanged.

## Direction contract

MODE: Operate.

THESIS: Short section rows align each maintenance task with its native controls and reveal detail when needed.

OWN-WORLD: Ember warm neutrals, rust actions, fine separators, platform fonts, native dropdowns, and the unchanged shared zebra and titlebar. Selection remains quiet in both appearances.

STORY: Open a database or create a blank file, choose Analyze with and solve its prerequisites, manage credits when selected, pick appearance, open logs/issues, and explicitly download or restart an update.

FIRST VIEWPORT: Start with Database and Current file, Open database, Create new database, and one sync helper line. Analysis follows with Analyze with, then Credits, Appearance, Logs, and Updates. There is no repeated page heading. Narrow layouts put headings above controls.

FORM: The user's selected Ember Settings code concept, with aligned native controls, a shared action family and concise labels. Provider configuration uses one column with aligned action rows. The selected local model's terms/progress-to-Ready flow remains inline.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Shared action controls

Database, conditional provider, credits, recovery/pairing, local model and update actions use SettingsAction. Text controls have a 36px minimum height, 96px minimum width, 8px corners and icon gap, 8px 13px padding, inherited platform type at 13px and weight 650, and 16px SVG icons. Icon-only Find models and Cancel pairing controls use 36px squares with accessible names and tooltips.

Primary controls use the incumbent rust action treatment for Save, Save key, Buy credits, downloads and updates. Secondary controls use paper or the dark field fill and a fine border. Destructive Settings controls use secondary geometry with rust text and an accent-wash hover; existing native confirmations still guard the operations that require them. Busy controls show a 16px spinner, expose busy state and disable activation. The shared focus outline, disabled feedback, arrow cursor and reduced-motion behavior remain inherited from Ember.

Provider configuration has one explicit grid column, with each field spanning the full row. Action rows align controls and wrap with an 8px gap when needed. Folder and external navigation, including Open model folder, Open logs folder, Report an issue and Release notes, retain the existing underlined link treatment.

## Database and logs

Create new database exclusively creates and selects a blank SQLite file, preserving existing files and the previous database. Pending writes are awaited; unsaved changes block switching. Canceling the native dialog preserves selection. The sync helper is one line, with a dirty-save warning and Retry save only when needed.

Version 1.6.0 keeps schema 10. Existing older-file before-v10 backups, records, Notes, resumes, and prior backups remain. There is no weekly backup generation or pruning. Both computers need version 1.4.1 or newer for a shared schema 10 file.

Logs are always on for errors, local to each computer, separate from the database, and created lazily with bounded entries, rotation, and known-key redaction. The surface exposes only Open logs folder and Report an issue. These underlined actions use rust ink, an external-arrow icon, and visible focus. No logging toggle is introduced.

## Analysis controls

Credits shows Available, Used, reserved credits when present, and a native model dropdown after purchase. Aligned recovery and computer rows follow the balance and model. Save recovery code exports through a native file picker. Restore credits and Connect this computer open focused inline forms with Enter to submit and Cancel or Escape to clear the code and restore opener focus. Pairing shows a copyable ten-minute single-use code, expiry, regeneration and explicit cancellation. Connected computers, Recovery options, and Recent usage stay collapsed. Disconnect, recovery-code replacement and funded-wallet switching use native confirmation with Cancel as default. The current computer cannot disconnect itself. Checkout has no signup or sign-in screen; there is no account label or Sign out action. This is an extension of the incumbent Ember system.

An interrupted wallet connection shows pending status and an enabled Refresh balance action even before it completes. Automatic mount/focus recovery and the manual action retry the retained original operation and normalized code. Conflicting new input cannot silently report success for the earlier wallet. Failures preserve the credential and any saved balance, with nearby error feedback. Guest credentials and pending original connection codes stay in OS-encrypted private settings outside the selected application SQLite database and logs; server records store hashes.

Analyze with is a native dropdown: Local server, Downloaded model, OpenAI API key, Anthropic API key, or Zebby credits. Only the chosen method's controls appear. Missing prerequisites use short local hints. Every method works without a Zebby signup or sign-in screen.

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

## Historical finish evidence, Ember and version 1.6.0

These records describe earlier releases. Current guest-wallet evidence is recorded below.

Provider and appearance captures are indexed in capture evidence (internal record: `work/ember-implementation/capture-evidence.json`). They cover the three provider setups, both themes, scaled/narrow windows, and native focus. Public screenshot refresh changes only Applications and Plan; zebra assets are unchanged.

The pinned choices recorded here, from internal direction `work/ember-implementation/direction.md`, select Ember Applications and Settings and Rosewood's Plan composition in Ember colors. These are code concept references, not pixel reproduction requirements.

The full finish review (internal record: `work/ember-implementation/finish-review.md`) found two regressions. The finish verdict (internal record: `work/ember-implementation/finish-verdict.md`) marks both resolved and returns ship for that correction batch. It does not claim a new whole-surface audit. Final documentation and screenshot origins are recorded for this handoff.

Supplied final evidence reports 72 tests, lint, typecheck, build, complete headless regressions, ten native interaction checks, and 37 native captures passing. These were not rerun by the documenter. Native screenshots use synthetic applications, plans, and a dummy resume in an isolated hidden Windows Electron process. Provider outputs and clipboard are mocked; no real profile, credentials, models, or database were used. Both platform renderer simulations were checked, but physical macOS review and native installer validation remain outside this local evidence. CI handles installer gates separately.

The [UX health report](../../docs/ux-health-v1.6.0.md) records the resolved short-height role access and late cancellation findings, deliberately unchanged F01/F03 behavior, and the remaining low-severity observations. No numerical score or trend is claimed. One detector pass compared against the old system; no second detector, doctor, or context run was performed.

### Historical analysis methods and credits, 2026-10-04

The earlier account-based integration placed Credits after Analysis and before Appearance. It showed Available, Used, the signed-in email, reserved credits when present, and collapsed Recent usage. Refresh balance and Sign out were explicit actions. The native paid model dropdown appeared after purchase; pricing had no model dropdown. Buy credits opened the shared pack and email-code flow. Secure storage remembered the paid session on each computer; without it, that release required another email code after reopening. This account UI is historical and has been replaced by the guest-wallet controls above.

That release's signed-in sidebar wallet exposed used and available amounts. Explicitly collapsed navigation presented an accessible icon button and wallet popover. Stale balance labels distinguished saved amounts after a refresh failure. Local model terms, download controls, Qwen inference, database selection, appearance, and update behavior were retained.

The earlier supplied checks passed 91 Node tests, lint, TypeScript, and both desktop and service builds. An independent source and test review cleared its three scored fixes. No new native or browser capture was made for that pass. Hosted account, email, Stripe, provider, and native visual behavior were unverified by those records.

## Guest-wallet handoff, 2026-10-10

Finished application source checked at d0c34b49c73a50040549098f501889950058a807: CreditsSettings.tsx, AnalysisFlow.tsx, desktop.css, desktop/credits-client.ts, and sampled desktop/main.ts. Service schema and wallet-access.ts, environment.example, the owner setup README, and docs/guide.md were also checked. The wallet extension uses the incumbent palette, inherited platform fonts, compact native controls, fine Settings rules, and an accent-wash pairing panel. DESIGN.md and .impeccable/design.json were compared and preserved; no new global palette, typography, shape, or motion rule is established. Existing sidecar sample drift for recommendation Copy and application row composition was reported and preserved.

The [initial remote CI](https://github.com/desigrit/zebby-the-scout/actions/runs/38035846232) passed at 669cb06. The [final remote CI](https://github.com/desigrit/zebby-the-scout/actions/runs/38036798621) passed at d0c34b4, including all 152 Node tests, TypeScript, lint, the desktop build, isolated native Windows flows, and renderer checks. Supplied local evidence includes 53 scoped credit tests and a service build at 669cb06; service source was unchanged for the d0c34b4 correction. The independent review in work/guest-wallet-finish-review.md found two issues. Its verdict in work/guest-wallet-finish-verdict.md scored both Resolved and returned disposition: ship for those two corrections only. Independent wallet-client verification passed all 16 subtests. These checks were not rerun by the documenter.

Eight current captures are under work/guest-wallet-review-final/qa-output/renderer-1.5.0/credits-*.png. They cover method choice, packs, a quote, Settings wallet/pairing, and pending error/manual retry at Windows 1550x850 light and Mac CSS 790x850 dark. The independent reviewer found all eight valid. They use a synthetic wallet, a mock native bridge, platform CSS/theme overrides, and fixture version labels. They support the scoped renderer review; they do not establish live payments, physical Mac framing, or real OS secure-storage behavior.

The owner guide now requires Supabase PostgreSQL, Stripe test keys and signed webhooks, a Node 22 or Docker HTTPS host, and owner OpenAI/Anthropic keys. Supabase email or anonymous Auth setup and SMTP are unnecessary. Only the public ZEBBY_CREDITS_SERVICE_URL is compiled into desktop builds; trusted proxy hops require a verified fixed chain. No service or real financial/provider credentials were configured, the paid URL remains empty, and checkout is disabled. The schema rerun test preserved existing wallet balances, and the extension changes neither the application SQLite schema nor ledger identity.

No local app, Electron, browser, Playwright, or desktop control was used in this handoff, and no personal profile, database, or resume was accessed. Hosted concurrency, live Stripe/webhook/provider behavior, container startup, and guest-wallet behavior on physical Mac hardware remain unverified. The [Analysis and credits contract](analysis-credits.md) carries the full current flow and historical verification context.

Zebby [2.1.0](https://github.com/desigrit/zebby-the-scout/releases/tag/v2.1.0) is published from d0c34b4. The [release workflow](https://github.com/desigrit/zebby-the-scout/actions/runs/38037269117) passed its Windows x64 and macOS ARM64 jobs and published direct Windows x64, Windows ARM64, and Apple Silicon installers. All three assets have uploaded state and GitHub SHA-256 digests; their download URLs returned HTTP 200. Mac distribution launch, packaged local-model, and self-update checks passed on the GitHub runner. Windows ARM64 packaging passed without a physical ARM64 execution claim. The service Docker dependency correction is on main, the branch specified in the owner guide; it does not change these desktop installers.

## Settings controls and activity handoff, 2026-10-10

Source 4b16d25ea255a854374d0314ac0c287b21b73a15 was compared with baseline 8b66b23 and the incumbent system, sampling SettingsAction, provider/model/credits/update controls, ApplicationActivity, application-activity.ts, base.css and desktop.css. DESIGN.md and .impeccable/design.json are preserved. Their pre-existing recommendation Copy and application-row sample drift is reported without repair. The service and owner setup guide are unchanged.

The supplied [final CI](https://github.com/desigrit/zebby-the-scout/actions/runs/38042851497) passed 154 Node tests, typecheck, lint, desktop build, isolated native Windows flows and headless renderer flows. The independent scoped review in work/settings-activity-finish-review.md returned ship with no material fixes after inspecting all 12 required captures. Provenance is in work/settings-activity-finish-packet.json: synthetic fixture data on a GitHub Windows runner, mocked providers/native bridge, and platform/theme overrides for renderer captures. Some controls are shown after scrolling; the dark pairing frame uses a fixture theme override. Physical Mac rendering, Windows ARM hardware, hosted payments and version 2.1.1 packaging remain outside this evidence. Documentation verification used source reads, with no test reruns, local app/browser control or personal data access.

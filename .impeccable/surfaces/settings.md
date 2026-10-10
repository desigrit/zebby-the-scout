# Settings

## Surface strategy

TASK: Choose analysis, manage paid credits, the current database, and local models, select appearance, find troubleshooting actions, and update Zebby.

FREQUENCY: Occasional setup and maintenance, with simple return visits to change a provider or open a file.

INFORMATION: Current database, provider-specific controls, model readiness/terms/download, guest credit wallet summary and model, appearance, logs and issues, installed version and update state. Recovery, pairing, connected computers and recent credit usage are available through Learn more. Local storage details are available on demand.

STATES: No/open/dirty database; saved or session-only key; selected provider/model; terms agreement; download progress/pause/retry/Ready; credits empty/loading/pending/funded; current or saved wallet; About credits open/closed; recovery export/cancel/replacement; restore/connect editor and errors; pairing active/expired/used/cancelled; device removal; system/light/dark appearance; update check/download/verified restart/error.

SUCCESS: The user can see the active source, solve a missing prerequisite, and reach a native control without interpreting a setup guide.

CONSTRAINTS: Keep database semantics, secure local settings, full inference, model terms, download controls, updates, native conventions, and all user data. Provider changes never silently fall back. User-pinned F03 setup-navigation discard behavior stays unchanged.

## Direction contract

MODE: Operate.

THESIS: Short section rows align each maintenance task with its native controls and reveal detail when needed.

OWN-WORLD: Ember warm neutrals, rust actions, fine separators, platform fonts, native dropdowns, and the unchanged shared zebra and titlebar. Selection remains quiet in both appearances.

STORY: Open a database or create a blank file, choose Analyze with and solve its prerequisites, manage credits when selected, pick appearance, open logs/issues, and explicitly download or restart an update.

FIRST VIEWPORT: Start with Database and Current file, Open database, Create new database, and one sync helper line. Analysis follows with Analyze with, then Credits, Appearance, Logs, and Updates. There is no repeated page heading. Narrow layouts put headings above controls.

FORM: The user selected Quiet rows for Analysis only. Analyze with, Model, Server URL or API key, and supported Thinking each occupy a separated preference row. Labels stack above controls when the Analysis panel is 560px wide or narrower. Native selectors retain model ordering and autosave, with names only in model options and download sizes in separate muted neutral badges. Capability-specific named radio segments and a binary On/Off switch reflect actual thinking choices; unsupported, unknown and single-option controls are absent. Capability errors and retry remain visible. The compact transfer has flat, borderless Pause, Resume or Retry and Stop download icons with hover/focus feedback. Stop immediately cancels the transfer and removes partial files, preserving verified completed models. There are no trash icons. Installed files retain a text Remove link with existing native confirmation and Use model in an expandable local library. Existing Database, Appearance, Logs, Updates and credit wallet behavior remain intact.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Quiet rows implementation, 2026-10-10

Approved concept: `zebby-analysis-settings-study/previews/concept-1.png`, a code-led structural reference within Ember. Selected source/model and all typed credentials retain the existing autosave and failure recovery contract. Provider recipient sentences are removed from Analysis helpers; API billing and credit usage copy remain. Downloaded model status, RAM needs, descriptions, license agreement and file controls remain available through concise progressive disclosure. Supplied compiled renderer checks cover the scoped behavior and narrow Windows/Mac CSS appearances in headless synthetic fixtures. The dated handoff below records the review and its limits.

## Shared action controls

Database, conditional provider, credits, recovery/pairing, local model and update actions use SettingsAction. Text controls have a 36px minimum height, 96px minimum width, 8px corners and icon gap, 8px 13px padding, inherited platform type at 13px and weight 650, and 16px SVG icons. Icon-only Find models and Cancel pairing controls use 36px squares with accessible names and tooltips.

Primary controls use the incumbent rust action treatment for Buy credits, downloads and updates. Secondary controls use paper or the dark field fill and a fine border. Destructive Settings controls use secondary geometry with rust text and an accent-wash hover; existing native confirmations still guard the operations that require them. Busy controls show a 16px spinner, expose busy state and disable activation. The shared focus outline, disabled feedback, arrow cursor and reduced-motion behavior remain inherited from Ember.

Analysis configuration uses separated rows with 36px fields, a 124px label column, 20px gaps and 16px 20px insets. Narrower windows use a 104px label column, 14px gaps and 14px 16px insets; Analysis panels at 560px or less stack labels above controls. Key actions retain the shared 13px/650 typography, 36px target and 16px icons, with compact 7px 10px padding and no minimum text width. Key values and actions wrap when their combined minimums exceed the available width. Pause, Resume, Retry and Stop download icons retain shared targets and focus feedback with flat, borderless styling. Helper paragraphs use the section width. Folder and external navigation retain the existing underlined link treatment.

## Database and logs

Create new database exclusively creates and selects a blank SQLite file, preserving existing files and the previous database. Pending writes are awaited; unsaved changes block switching. Canceling the native dialog preserves selection. The sync helper is one line, with a dirty-save warning and Retry save only when needed.

Version 1.6.0 keeps schema 10. Existing older-file before-v10 backups, records, Notes, resumes, and prior backups remain. There is no weekly backup generation or pruning. Both computers need version 1.4.1 or newer for a shared schema 10 file.

Logs are always on for errors, local to each computer, separate from the database, and created lazily with bounded entries, rotation, and known-key redaction. The surface exposes only Open logs folder and Report an issue. These underlined actions use rust ink, an external-arrow icon, and visible focus. No logging toggle is introduced.

## Analysis controls

Analysis shows one Buy credits action only when Analyze with is Zebby credits. It opens the shared purchase flow for an initial purchase or a top-up. Initial analysis setup retains its Buy credits method choice.

Empty Credits shows "No credits found. Buy a pack or restore your existing credits." The row below contains Restore credits | Connect this computer and Learn more. A funded wallet shows a compact summary with exact available credits, used credits out of the total, percentage remaining, a 6px track for remaining credits and an icon-only Refresh balance action. Model and thinking selection live once in Analysis. Available credits subtract reservations for running analysis and display at least zero; reservations do not count as used credits. This shows cumulative usage of purchased credits with no weekly reset or artificial expiry. Saved balances and reservations retain their concise local feedback.

Learn more opens the native About credits dialog, at most 480px wide. It explains restoration and connection; funded wallets expose Save recovery code, Replace recovery code, Connect another computer, Connected computers and Recent usage there. Save recovery code exports through a native file picker and is also offered after purchase. Pairing shows a copyable ten-minute single-use code, expiry, regeneration and explicit cancellation inside this dialog. Cancelling pairing re-enables the restore/connect links. Disconnect, recovery-code replacement and funded-wallet switching use native confirmation with Cancel as default. The current computer cannot disconnect itself.

Restore credits and Connect this computer open focused inline forms with Enter to submit and Cancel or Escape to clear the code and restore opener focus. The help dialog also restores its opener's focus on close. Pack selection and Continue remain usable before the service URL is configured, subject to secure storage; an attempted checkout reports a connection error when the service cannot be reached. Actual checkout requires the compiled ZEBBY_CREDITS_SERVICE_URL. Checkout has no signup or sign-in screen; there is no account label or Sign out action. This is an extension of the incumbent Ember system.

An interrupted wallet connection shows pending status and an enabled Refresh balance action even before it completes. Automatic mount/focus recovery and the manual action retry the retained original operation and normalized code. Conflicting new input cannot silently report success for the earlier wallet. Failures preserve the credential and any saved balance, with nearby error feedback. Guest credentials and pending original connection codes stay in OS-encrypted private settings outside the selected application SQLite database and logs; server records store hashes.

Analyze with is a native dropdown: Local server, Downloaded model, OpenAI API key, Anthropic API key, or Zebby credits. Only the chosen method's controls appear. Missing prerequisites use short local hints. Every method works without a Zebby signup or sign-in screen.

Ollama retains Server URL, installed Model selection, refresh and custom model name; fields save on blur or Enter and dropdown selections save directly. OpenAI and Anthropic show a masked saved key with Change key / Remove key. Change reveals a password editor with Cancel. API keys save on Enter or when focus leaves the editor; clicking Cancel never saves the draft. There is no Save or Undo control in Analysis settings. First-run setup waits for pending or failed edits to be resolved before continuing. Cancel and Escape clear the draft and restore focus. Failed saves preserve the original key and replacement draft; successful save/removal restores focus after busy controls re-enable. The main process returns only a masked key hint; stored full keys are never sent to the renderer. Keys last for the session when secure storage is unavailable. Provider helpers retain concise API billing or credit usage copy. Model descriptions, RAM guidance and terms appear in About this model or Model terms; required terms open for agreement. Download progress remains visible with flat Pause/Resume/Retry and Stop download icons. Stop cancels immediately and deletes partial files, preserving verified completed models. Models on this computer expands the library, with Use model and a text Remove link for installed files. Remove retains the existing native confirmation. Storage and privacy detail and Open model folder remain inside the library.

Thinking uses the selected model's capabilities. Current GPT and Claude models expose supported effort levels as named radio segments; Luna also has Off. Binary Haiku and downloaded Qwen choices use an On/Off switch. Unsupported or unknown capabilities and models with at most one usable option have no Thinking row. Ollama queries server metadata for exact choices. Query errors and Retry thinking levels remain visible even when a control is absent. Preferences persist separately by provider/model and local server. API lists sort by release newness; CPU lists use published release dates; Ollama lists use installation metadata with a numeric-name fallback. Paid models are only Sol 6.1 and Astra 6, with High as default. Changing either paid model or effort invalidates an unspent quote.

Appearance uses System, Light, and Dark. System follows the operating system. These appearance, provider, accepted terms, models, and navigation preferences remain on each computer; applications, plans, resumes, and the last saved overview stay in the chosen database.

## Updates and artifact migration

Updates retains the installed version, Check for updates, live status, explicit Update, progress, verification, Restart to update, retry/error states, and Release notes. Automatic checks run on launch and window focus after six hours. The sidebar mirrors the available action in both navigation states.

Restart protects open forms/dialogs, confirms unsaved Plan edits, waits for active requests, requires database saving, pauses downloads, stops the engine, and flushes logs. Installer behavior remains a separate native CI gate. Windows replaces and reopens Zebby. Mac keeps the previous app until the replacement confirms loading and restores it on immediate reopen failure.

Known legacy profiles still migrate into Zebby while preserving settings, accepted terms, logs, working copies, default databases, models, and external cloud selections. Existing destination files take precedence and original profile records/logs remain recovery copies. The internal package and app ID remain unchanged. See [the guide](../../docs/guide.md) for locations and migration details.

## Preserved constraints

The unchanged 46px circular zebra sits in a 54px accessible navigation toggle. The title region is 44px and reads only Zebby. The image has equal top and left insets within the rail: 26px when expanded, 25px when explicitly collapsed, and 13px in the automatic 72px rail at logical widths of 650px or less. Sidebar top padding is 22px, 21px, and 9px respectively. Windows navigation spans the title region. Mac navigation begins below it, placing the expanded image at y=70px and the explicitly collapsed image at y=69px. Native Windows controls and Mac traffic lights remain native. Expanded navigation is 210px, 176px at the 850px window breakpoint, and 72px at extreme logical widths of 650px or less. Explicitly collapsed navigation remains 96px, including at extreme widths. Database details appear only when expanded; Settings retains them in both states.

The toggle has action labels, expanded state, tooltips, and Enter or Space activation. Its local preference rolls back with an error if saving fails; toggling preserves drafts and destination. Shell width, title-region width, rail padding, and icon positions transition together over 280ms with cubic-bezier(.16, 1, .3, 1). Labels fade out over 100ms and fade in over 180ms after a 60ms delay. Destinations have 48px targets and 24px icons. Accepted activation navigates immediately and plays a brief offline Lottie animation for about 417ms. Plan uses a magnifier with a star and a small sprinkle, with a flutter that returns to the same static geometry. Reduced motion removes sidebar transitions and keeps icons still; player failure retains the static icon. Completion, hiding, or a reduced-motion change restores the rest state. Desktop controls use the arrow cursor and text fields use the text cursor.

Windows scroll containers reserve a stable 12px gutter. The resting 2px thumb widens to 8px on hover, focus, or scrolling. Mac keeps native system scrollers. Physical macOS behavior has not been manually reviewed.

Full-model inference, installed Ollama models, selected databases, and local model storage remain unchanged. Terms links remain available before agreement. The library's text Remove link opens the existing native model-removal confirmation; updates retain downloads. App-local actions and native text editing retain their existing keyboard behavior without visible shortcut lists.

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

The owner guide requires Supabase PostgreSQL, Stripe test keys and signed webhooks, a Node 22 or Docker HTTPS host, and owner OpenAI/Anthropic keys. Supabase email or anonymous Auth setup and SMTP are unnecessary. Only the public ZEBBY_CREDITS_SERVICE_URL is compiled into desktop builds; trusted proxy hops require a verified fixed chain. No service or real financial/provider credentials were configured in that handoff. The schema rerun test preserved existing wallet balances, and the extension changes neither the application SQLite schema nor ledger identity.

No local app, Electron, browser, Playwright, or desktop control was used in this handoff, and no personal profile, database, or resume was accessed. Hosted concurrency, live Stripe/webhook/provider behavior, container startup, and guest-wallet behavior on physical Mac hardware remain unverified. The [Analysis and credits contract](analysis-credits.md) carries the full current flow and historical verification context.

Zebby [2.1.0](https://github.com/desigrit/zebby-the-scout/releases/tag/v2.1.0) is published from d0c34b4. The [release workflow](https://github.com/desigrit/zebby-the-scout/actions/runs/38037269117) passed its Windows x64 and macOS ARM64 jobs and published direct Windows x64, Windows ARM64, and Apple Silicon installers. All three assets have uploaded state and GitHub SHA-256 digests; their download URLs returned HTTP 200. Mac distribution launch, packaged local-model, and self-update checks passed on the GitHub runner. Windows ARM64 packaging passed without a physical ARM64 execution claim. The service Docker dependency correction is on main, the branch specified in the owner guide; it does not change these desktop installers.

## Settings controls and activity handoff, 2026-10-10

Source 4b16d25ea255a854374d0314ac0c287b21b73a15 was compared with baseline 8b66b23 and the incumbent system, sampling SettingsAction, provider/model/credits/update controls, ApplicationActivity, application-activity.ts, base.css and desktop.css. DESIGN.md and .impeccable/design.json are preserved. Their pre-existing recommendation Copy and application-row sample drift is reported without repair. The service and owner setup guide are unchanged.

The supplied [final CI](https://github.com/desigrit/zebby-the-scout/actions/runs/38042851497) passed 154 Node tests, typecheck, lint, desktop build, isolated native Windows flows and headless renderer flows. The independent scoped review in work/settings-activity-finish-review.md returned ship with no material fixes after inspecting all 12 required captures. Provenance is in work/settings-activity-finish-packet.json: synthetic fixture data on a GitHub Windows runner, mocked providers/native bridge, and platform/theme overrides for renderer captures. Some controls are shown after scrolling; the dark pairing frame uses a fixture theme override. Physical Mac rendering, Windows ARM hardware and hosted payments remain outside that review's evidence. Packaging was pending at the review. Documentation verification used source reads, with no test reruns, local app/browser control or personal data access.

Zebby [2.1.1](https://github.com/desigrit/zebby-the-scout/releases/tag/v2.1.1) is published from 4b16d25. The [release workflow](https://github.com/desigrit/zebby-the-scout/actions/runs/38044126337) passed its Windows x64 and macOS ARM64 jobs and published direct Windows x64, Windows ARM64 and Apple Silicon installers. All three assets have uploaded state and GitHub SHA-256 digests; their download URLs returned HTTP 200. Mac distribution launch, packaged local models including long-input runs, and both platform self-update checks passed on GitHub runners. Windows ARM64 packaging passed without a physical ARM64 execution claim.

## Credits and chart streamline handoff, 2026-10-10

Source e78362edf08acaa4a64dac2dc0df424c302888b3 was compared with baseline 3d35192c0b06f08e506546e4931227898cbd31ca, sampling the credits and analysis components, chart, credit usage calculation, client errors and both stylesheets. The implementation inherits Ember's palette, platform typography, shared actions, native controls and modal behavior. DESIGN.md and .impeccable/design.json remain preserved, including pre-existing sidecar sample drift.

The supplied [final CI](https://github.com/desigrit/zebby-the-scout/actions/runs/38046698808) passed 157 Node tests, typecheck, lint, production build, full renderer flows and 18 native Windows checks. The full scoped review in work/credits-streamline-finish-review.md returned disposition: ship with no material fixes after opening all 13 required captures and corroborating source and QA. These checks were not rerun by the documenter.

Renderer captures are synthetic component and theme previews with mixed platform overrides; they do not prove physical OS appearance. Native Windows captures are separate. Live Stripe, webhooks and provider service remain unconfigured. Native Mac visual review and Windows ARM hardware remain outside this evidence. This documentation handoff used source reads, with no local GUI or personal data access.

Zebby [2.1.2](https://github.com/desigrit/zebby-the-scout/releases/tag/v2.1.2) is published from reviewed source e78362e. The [release workflow](https://github.com/desigrit/zebby-the-scout/actions/runs/38047599196) passed Windows x64/ARM64 packaging and Mac ARM64 distribution, launch, self-update and packaged local-model checks with short and long inputs. All three direct EXE/DMG download URLs returned HTTP 200, with uploaded assets and GitHub SHA-256 digests.

## Quiet rows handoff, 2026-10-10

Working source for version 2.2.2 was compared with baseline f16d2d88e1564644b24564ae7c8a6bb818528102, sampling AnalysisSettings.tsx, ThinkingSettings.tsx, LocalModelsSettings.tsx, desktop.css, local-model-downloads.ts and the Stop IPC path in bridge.ts, preload.ts and main.ts. Quiet rows extends Ember's warm palette, platform typography, native selectors, fine rules and shared focus/action behavior within Analysis. DESIGN.md's stale Analysis layout paragraph was merged with the implementation; its frontmatter and global identity are preserved. The existing .impeccable/design.json sidecar is preserved, including known sample drift for recommendation Copy and application row composition.

Supplied logs in work/quiet-rows-build.log, work/quiet-rows-types.log, work/quiet-rows-lint.log, work/quiet-rows-renderer.log and work/quiet-rows-model-tests.log report a passing production build, TypeScript, lint, full headless renderer checks and 30 model/thinking tests. These checks were not rerun by the documenter. The internal manifest .impeccable/review/quiet-rows/verification.json records the current source hashes and 12 captures. The independent reviewer found every refreshed capture valid and the hashes current.

The independent finish review, recorded internally in .impeccable/review/quiet-rows/finish-review.md, initially found F1: transfer actions from an unselected library model restored focus to the selected model. The correction restores focus to the initiating model or library summary while preserving selection. Its verdict scored F1 Resolved and returned disposition: ship for that correction. One advisory detector pass ran; incumbent findings outside this diff were preserved and no material visual issue was attributed to these changes. No second detector or context pass ran.

The evidence uses synthetic headless fixtures with Windows/Mac CSS and theme overrides. No Zebby or Electron launch, personal profile/database, real model download, inference or payment was used for this pass. Physical Windows ARM and Mac rendering remain outside this renderer evidence. Remote CI, packaged installer checks and publication for 2.2.2 are pending at this handoff. Documentation verification used source and supplied evidence reads, with no test reruns or local GUI control.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

An Electron desktop app with one user-selected SQLite file. The file can live in a cloud synced folder and is shared between the user's computers.

## Users

People applying to several product management roles a day, including laptop users who do not have a GPU, API key, or experience setting up a local model server.

## Product Purpose

Zebby helps the user plan a resume for each job posting, record each application, and see application volume, match strength, and progress through hiring stages.

## Operating Context

The user keeps job listing links and uses different resume versions. They need to plan for several postings and add applications frequently on Windows and Mac. They will quit the app and wait for cloud sync before switching computers.

## Brand Commitments

Use the approved full, detailed zebra wearing sunglasses as the main circular app and installer icon. The shipping source is `public/brand-icon.png`. Its stripes, cyan lenses, yellow mane, and coral circle remain recognizable at the small sidebar size.

The public app name is Zebby. The approved public repository identity is `desigrit/zebby-the-scout`. Use the approved Ember Search Ledger in light and dark appearance: warm neutral canvas, rust actions, activity stacked in hiring-stage colors, and quiet selection washes. Applications uses a compact role list with a persistent inspector on wide layouts and inline details on narrower layouts. Plan uses the selected Rosewood document composition in Ember colors. Settings uses aligned section rows and native controls. Preserve Plan, Applications, and Settings left navigation, platform fonts, zebra art, titlebar, and navigation motion. Semantic hiring stages, warnings, errors, destructive actions, and application match strength retain their roles.

The shared native title region shows only Zebby. Remove the sidebar wordmark. The unchanged circular zebra switches between icons only and icons plus labels, with accessible action labels and keyboard activation. The navigation preference belongs to each computer.

## Capabilities and Constraints

- Record company, job title, team, locations, listing link, date applied, match strength, resume used, and status.
- In Plan and Applications, Enter adds a nonblank location and restores highlighted keyboard focus to Add location. Enter opens the next location input. Blank Enter keeps the input open; Escape or Cancel returns focus to Add location. Composition input does not commit a location. Input and restored-button focus preserve scroll position; opening an application form scrolls only the workspace to reveal it.
- Put the listing link first and try to fill company, title, team, and locations from public job data. Start the applied date at today and keep every field editable.
- Show application statistics with a slim daily chart for the last 30 days, stacked by current Applied, Heard back, Interview scheduled and Rejected status on each application's original applied date. Changing status preserves that day's total and bar height. Undated records stay outside the chart. Pair the colors with a named legend and exact counts on hover or keyboard focus, accessible day names, Left/Right and Home/End navigation, and Escape to dismiss tooltips.
- Attach compact statistics to the chart above search, company, and status filters. Selecting a role connects it to a persistent independently scrolling inspector when the content width is at least 940px; below that, details expand inline. At logical heights of 620px or less, compact the overview and enable page scrolling with a role region at least 280px tall. Preserve the complete New Application form and all optional fields.
- Make saved records available across the user's computers.
- Store uploaded resume files so they can be reused across applications and opened on either computer.
- Score match strength from 0 to 100 percent. Plan saves a concise explanation of the resume evidence and gaps with each new score, available offline through Why. Keep this explanation separate from the generated overview's wording rationale.
- Initial statuses follow the requested stages: Applied, Heard back, Interview scheduled, and Rejected.
- Provide Plan and Applications tabs. Plan keeps multiple job briefs, editable ATS keywords, resume themes, and suggested resume overviews with separate saved wording rationales.
- Plan pairs Job posting and Your CV where space permits, with Analyze below Your CV and Save outside the document scroll area. Saved plans use a rail on wide windows and a compact toggle at widths of 1000px or less. Editable keywords and themes use side-by-side transparent rows, independent job importance values, and copy actions; extreme scaling may stack the columns.
- Show a read-only importance percentage beside each editable Core ATS keyword and Core resume theme. Importance estimates how much the job calls for that requirement and how strongly a truthful CV should prioritize it. The estimates are independent of resume support and match strength, do not sum to 100, and are not measurements from an ATS or recruiter.
- Retain editable recommendation text from older analyses with Unrated importance. New or changed terms remain Unrated until analysis refreshes them; changing job fields clears job importance. Changing the job or CV source clears the previous match score and explanation. CV-only changes retain unchanged job importance. Reject stale analysis results if the saved plan changed while analysis ran.
- Prefill new plans with the last saved Current CV Overview from the selected database. Saving a plan or its analysis updates that default; existing plans keep their own overview. The default travels with the shared database between computers.
- Analyze a job brief through a local Ollama server, a downloaded CPU model, a personal OpenAI or Anthropic API key, or Zebby credits. Initial setup offers all five methods. Every plan keeps a primary Analyze action after Your CV, with a quiet provider or model caption and a busy spinner. Temporarily disable source controls while analysis runs. Cancel aborts the selected provider before persistence and preserves previous analysis; committing and completed requests reject cancellation so saved results remain truthful. Keep the refresh action beside an existing match result. Provider settings and model downloads are local to each computer. Paid analysis requires an explicit maximum quote or offers recovery of an already paid result at no additional cost.
- Download a local model only when selected. SmolLM2 uses a compact heuristic profile for job importance, keyword coverage, and short overview suggestions; LFM2.5, Gemma 3, and Qwen receive the complete input and full analysis prompts. LFM2.5 and Gemma require agreement to their model terms before download or use, saved on each computer. OpenAI, Anthropic, Zebby credits, and installed Ollama models use their selected provider path, with no automatic fallback.
- Show download progress, pause, resume, retry, and per-model Delete with native confirmation. Keep models through updates. Windows uninstall removes model downloads; Mac users delete them in Settings before removing the app.
- Store captured application listing text in editable Notes for offline reference, retaining the original archive fields through upgrades.
- Store uploaded resumes as SQLite BLOBs in the same chosen database file as applications and plans.
- Version 1.6.0 keeps schema 10 introduced in 1.4.0, with plans.match_notes, keyword and theme importance arrays, and the saved-overview preference. This release adds no database schema change. Opening an older file saves its complete original bytes in a before-v10 backup before upgrade. Existing Notes, resumes, scores, and prior backup files are retained; the v9-to-v10 upgrade does not repeat earlier migrations. Legacy scores keep their values and ask for a refresh to add an explanation.
- Create new database creates and selects a blank file even when another database is open. Create the destination exclusively, preserving existing files and the previous database. Await pending writes and block switching while database changes remain unsaved.
- Detect outside changes to the selected cloud file before saving. There are no recurring weekly backups or backup pruning. Install version 1.4.1 or newer on both computers before sharing a schema 10 database.
- Use native file dialogs, platform fonts, and a left navigation for Windows x64, Windows ARM64, and Apple Silicon macOS. Every analysis method works without a signup or sign-in screen. Paid credits use a server-owned guest wallet and independent encrypted device credentials. Settings provides recovery-code export and restoration, temporary pairing for another computer, and connected-device removal with native confirmation. Paid access requires secure storage. Wallet credentials stay outside shared SQLite and logs. Existing valid paid sessions migrate while preserving their ledger identity.
- Start the desktop window at 1550 by 850 device-independent pixels, 300 wider than the previous 1250 width, capped to the primary display's work area. System appearance uses the native system preference for the initial window background.
- Use System, Light, and Dark appearance labels. Windows reserves a stable 12px scrollbar gutter, with a 2px resting thumb that widens to 8px on hover, focus, or scrolling. Mac retains native system scrollers.
- Support app-local New, Save, and Search plus native text editing Undo without visible shortcut lists or new zoom controls. Draft recovery, autosave, and the existing discard behavior remain unchanged by user choice (F01 and F03).
- Keep appearance and navigation expansion in local settings on each computer. If saving navigation expansion fails, restore the previous layout and show an error. Preserve drafts and the selected destination when toggling.
- Settings starts directly with Database, Analysis, Credits, Appearance, Logs, and Updates, without a page heading or introductory subheading. Database uses one concise helper line. Analysis uses the Analyze with native provider dropdown and the selected method's setup controls. Credits shows available and used credit amounts, model, recovery and pairing controls, and collapsed connected computers and recent usage. Local model storage details expand on demand. Logs saves errors automatically on each computer, with no capture preference. Bounded, rotated log files are created lazily for errors, kept outside the database, and redact API keys and wallet credentials. Open logs folder opens the local folder; Report an issue opens https://github.com/desigrit/zebby-the-scout/issues/new.
- Use one shared Settings action family for database, conditional provider, credits, recovery/pairing, local model and update controls, with primary, secondary and distinguishable destructive variants. Keep provider configuration in one column with aligned action rows, visible keyboard focus, accessible icon names, disabled feedback and busy states. Folder and external navigation retain the existing link treatment.
- Check GitHub for a compatible stable release when Zebby opens and when the window regains focus after six hours. Settings shows the installed version and a manual Check for updates action. An available update appears in Settings and at the bottom of expanded or collapsed navigation. Download starts only after the user selects Update, with progress, verification, errors, and Retry. Offer Restart to update only after checking the installer size and SHA-256 checksum.
- Protect open application forms and editing dialogs, and confirm discarding unsaved Plan edits before restart. Active analysis and settings requests must finish; database writes must save successfully. Pause model downloads, stop the model engine, and flush logs before installation. Windows silently replaces and reopens Zebby. Mac requires the app in Applications, stages a replacement bundle, retains the previous app until the new React desktop confirms it loaded, and restores the previous app on immediate reopen failure. Install 1.5.0 manually once to enable future in-app updates; native installer execution remains a release CI gate.
- Use a 44px native title region with native Windows overlay controls or native macOS traffic lights at x=18, y=16. Keep equal zebra image top and left insets within the rail: 26px expanded, 25px explicitly collapsed, and 13px in the automatic compact rail. Sidebar top padding is 22px, 21px, and 9px respectively. Windows navigation spans the title region; Mac navigation starts below it, placing the expanded image at y=70px and collapsed image at y=69px. The brand has 12px bottom padding. Expanded navigation is 210px, 176px at 850px window width, and 72px at extreme logical widths of 650px or less; explicitly collapsed navigation remains 96px on both platforms. The 54px zebra button contains the unchanged 46px image. Only expanded navigation shows the current database footer; Settings retains the current file details in both states.
- Use 24px Plan, Applications, and Settings icons within 48px navigation targets. A successful click or keyboard activation navigates immediately and plays the destination's brief offline Lottie animation (about 417ms). Plan uses a magnifier with magic sprinkles and a brief flutter. Expand and collapse use coordinated 280ms easing, with labels fading out over 100ms or in over 180ms after a 60ms delay. Reduced motion removes sidebar transitions and uses the still icon state; failed players retain the static icon. Return to rest on completion, a hidden document, or a reduced-motion change, and clean up players and listeners on unmount. Desktop clickable controls use the arrow cursor; text fields retain the caret cursor.
- Retain the internal package name pm-application-tracker and app ID com.desigrit.pmapplications. Migrate known legacy profiles into Zebby on first launch, preserving encrypted API keys, preferences, logs, working copies, default databases, model downloads, and accepted terms. Keep external cloud database pointers unchanged and rewrite pointers inside a migrated profile. Existing destinations take precedence; original profile records and logs remain as recovery copies. Windows profiles use `%APPDATA%\Zebby` and models use `%LOCALAPPDATA%\Zebby\Models`. Mac profiles and models use `~/Library/Application Support/Zebby` and its `Models` folder. Migration failures preserve previous files and do not silently select a blank workspace.

## Product Principles

- Make adding several applications in a day quick.
- Keep every recorded field visible or easy to edit.
- Make progress and match patterns clear without requiring manual calculation.
- Preserve data between sessions and devices.
- Make the cloud sync sequence clear before switching computers.

## Analysis and credits, 2026-10-10

The approved Quick choice A flow extends Ember. Initial analysis setup opens a native modal with four method tiles in two columns and a full-width Buy credits tile. Selecting a local server, downloaded model, or personal API key opens focused setup. Selecting Buy credits opens pack selection and guest checkout in the external browser, with no Zebby signup or sign-in step. The pricing scene has no model dropdown; the user chooses a model after payment is confirmed and can save a recovery code. Existing Plan and Application editors and every optional application field remain available.

| Price in USD | Credits | Illustrative analyses using GPT-6 Luna |
| --- | ---: | ---: |
| $5 | 500 | 90 |
| $20 | 3,000 | 540 |
| $50 | 8,000 | 1,450 |
| $100 | 16,000 | 2,900 |

These counts assume 20,000 input and 6,000 output tokens per analysis, with all input charged as cache writes and counts rounded down to the nearest ten. They are illustrative, not measured averages or guarantees. Cache hits, model choice, and source length change usage. The paid model dropdown offers GPT-6 Luna, GPT-6.1 Sol, GPT-6 Astra, Claude Haiku 4.5, Claude Sonnet 5.5, and Claude Opus 5.5, as defined in the current source catalog.

Before a new paid Plan or resume match analysis runs, show its maximum credit use, the available balance, and the selected provider receiving job, resume, and overview content. Reserve the approved maximum, settle actual model usage, and return unused reserved credits. Failures and cancellations release their reservations. A previously completed paid result can be recovered without another charge, including when the current balance is zero or negative. Application Save never silently starts paid match analysis; the user starts Analyze match or Refresh match explicitly.

The connected guest wallet shows available credits and total used credits in Settings; the sidebar shows them after a purchase. Available means the balance after running-analysis reservations. Collapsed navigation opens a compact wallet popover. Saved balances are labeled when refresh fails. The service owns one balance shared by explicitly connected computers. Settings provides recovery-code export and restoration, ten-minute single-use pairing, connected-computer removal, and recovery-code replacement. Native confirmations default to Cancel for disconnection, code replacement, and switching a funded computer to another wallet. There is no account label or Sign out action.

Guest device credentials and pending original connection codes stay in the OS-encrypted private profile, outside the selected application SQLite database and logs. Server storage keeps hashes of device, recovery, and pairing credentials. An interrupted connection retries its original operation and normalized code; conflicting new input cannot silently connect to the earlier wallet. Settings exposes pending status and Refresh balance even before connection completes. Existing valid paid sessions retain their ledger identity during migration. This extension adds no local database schema change or ledger reset.

The service and Stripe test-mode setup are prepared, but no payment account or hosted endpoint is connected. The desktop service URL defaults to empty, and paid checkout honestly reports that it is unavailable. Test checkout identifies that no real payment is taken. Owner setup requires Supabase PostgreSQL, Stripe test keys and signed webhooks, a Node 22 or Docker HTTPS host, and the owner's OpenAI and Anthropic API keys. Supabase email or anonymous Auth setup and SMTP are not required. Only the public ZEBBY_CREDITS_SERVICE_URL is compiled into desktop builds. Owner setup is documented in [the credits service guide](credits-service/README.md). The feature contract and dated verification limits are recorded in [Analysis and credits](.impeccable/surfaces/analysis-credits.md).

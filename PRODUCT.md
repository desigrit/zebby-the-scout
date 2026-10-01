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

The public app name is Zebby. The approved public repository identity is `desigrit/zebby-the-scout`. Extend the existing Search Ledger with the approved Graphite palette: neutral actions, information, focus, and selected surfaces in light and dark appearance. Preserve the operating layout, Plan, Applications, and Settings left navigation, platform fonts, and native controls. Semantic green notices and hiring stages, amber warnings, and red errors and destructive actions keep their existing roles.

The shared native title region shows only Zebby. Remove the sidebar wordmark. The unchanged circular zebra switches between icons only and icons plus labels, with accessible action labels and keyboard activation. The navigation preference belongs to each computer.

## Capabilities and Constraints

- Record company, job title, team, locations, listing link, date applied, match strength, resume used, and status.
- Put the listing link first and try to fill company, title, team, and locations from public job data. Start the applied date at today and keep every field editable.
- Show application statistics with a slim chart of daily application counts over the last 30 days.
- Make saved records available across the user's computers.
- Store uploaded resume files so they can be reused across applications and opened on either computer.
- Score match strength from 0 to 100 percent. Plan saves a concise explanation of the resume evidence and gaps with each new score, available offline through Why. Keep this explanation separate from the generated overview's wording rationale.
- Initial statuses follow the requested stages: Applied, Heard back, Interview scheduled, and Rejected.
- Provide Plan and Applications tabs. Plan keeps multiple job briefs, editable ATS keywords, resume themes, and ideal candidate CV overviews.
- Show a read-only importance percentage beside each editable Core ATS keyword and Core resume theme. Importance estimates how much the job calls for that requirement and how strongly a truthful CV should prioritize it. The estimates are independent of resume support and match strength, do not sum to 100, and are not measurements from an ATS or recruiter.
- Retain editable recommendation text from older analyses with Unrated importance. New or changed terms remain Unrated until analysis refreshes them; changing job fields clears job importance. Changing the job or CV source clears the previous match score and explanation. CV-only changes retain unchanged job importance. Reject stale analysis results if the saved plan changed while analysis ran.
- Prefill new plans with the last saved Current CV Overview from the selected database. Saving a plan or its analysis updates that default; existing plans keep their own overview. The default travels with the shared database between computers.
- Analyze a job brief through the selected OpenAI, Ollama, or downloadable built-in CPU model. Every plan keeps a primary Analyze action after Your CV, with a quiet provider or model caption and a busy spinner. Keep the refresh shortcut beside an existing match result. Provider settings and model downloads are local to each computer.
- Download a local model only when selected. SmolLM2 uses a compact heuristic profile for job importance, keyword coverage, and short overview suggestions; LFM2.5, Gemma 3, and Qwen receive the complete input and full analysis prompts. LFM2.5 and Gemma require agreement to their model terms before download or use, saved on each computer. OpenAI and installed Ollama models retain their full provider path, with no automatic fallback.
- Show download progress, pause, resume, retry, and per-model Delete with native confirmation. Keep models through updates. Windows uninstall removes model downloads; Mac users delete them in Settings before removing the app.
- Store captured application listing text in editable Notes for offline reference, retaining the original archive fields through upgrades.
- Store uploaded resumes as SQLite BLOBs in the same chosen database file as applications and plans.
- Version 1.4.0 uses schema 10, adding plans.match_notes to the existing keyword and theme importance arrays and saved-overview preference. Opening an older file saves its complete original bytes in a before-v10 backup before upgrade. Existing Notes, resumes, scores, and prior backup files are retained; the v9-to-v10 upgrade does not repeat earlier migrations. Legacy scores keep their values and ask for a refresh to add an explanation.
- Create new database creates and selects a blank file even when another database is open. Create the destination exclusively, preserving existing files and the previous database. Await pending writes and block switching while database changes remain unsaved.
- Detect outside changes to the selected cloud file before saving. There are no recurring weekly backups or backup pruning. Install version 1.4.0 on both computers before sharing a schema 10 database.
- Use native file dialogs, platform fonts, and a left navigation for Windows x64, Windows ARM64, and Apple Silicon macOS. No account sign-in is required.
- Start the desktop window at 1550 by 850 device-independent pixels, 300 wider than the previous 1250 width, capped to the primary display's work area. Auto appearance uses the native system preference for the initial window background.
- Keep appearance and navigation expansion in local settings on each computer. If saving navigation expansion fails, restore the previous layout and show an error. Preserve drafts and the selected destination when toggling.
- Settings starts directly with Database, Analysis, Appearance, and Logs, without a page heading or introductory subheading. Database uses one concise helper line. Logs saves errors automatically on each computer, with no capture preference. Bounded, rotated log files are created lazily for errors, kept outside the database, and redact the known API key. Open logs folder opens the local folder; Report an issue opens https://github.com/desigrit/zebby-the-scout/issues/new.
- Use a 44px native title region with native Windows overlay controls or native macOS traffic lights at x=18, y=16. Expanded navigation is 210px, or 176px at 850px window width; collapsed navigation is 96px on both platforms. The sidebar starts at 12px top padding, with 20px below the brand. The 54px zebra button contains the unchanged 46px image. Only expanded navigation shows the current database footer; collapsed navigation contains destination icons and no database footer. Settings retains the current file details.
- Retain the internal package name pm-application-tracker, app ID com.desigrit.pmapplications, and legacy userData and model-folder paths when presenting the public name.

## Product Principles

- Make adding several applications in a day quick.
- Keep every recorded field visible or easy to edit.
- Make progress and match patterns clear without requiring manual calculation.
- Preserve data between sessions and devices.
- Make the cloud sync sequence clear before switching computers.

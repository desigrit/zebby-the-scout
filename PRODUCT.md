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
- Score match strength from 0 to 100 percent.
- Initial statuses follow the requested stages: Applied, Heard back, Interview scheduled, and Rejected.
- Provide Plan and Applications tabs. Plan keeps multiple job briefs, editable ATS keywords, resume themes, and ideal candidate CV overviews.
- Show a read-only importance percentage beside each editable Core ATS keyword and Core resume theme. Importance estimates how much the job calls for that requirement and how strongly a truthful CV should prioritize it. The estimates are independent of resume support and match strength, do not sum to 100, and are not measurements from an ATS or recruiter.
- Retain editable recommendation text from older analyses with Unrated importance. New or changed terms remain Unrated until analysis refreshes them; changing job fields clears job importance. Changing the current overview or selected resume clears resume match while retaining unchanged job importance.
- Prefill new plans with the last saved Current CV Overview from the selected database. Saving a plan or its analysis updates that default; existing plans keep their own overview. The default travels with the shared database between computers.
- Analyze a saved job brief through the selected OpenAI, Ollama, or downloadable built-in CPU model. Provider settings and model downloads are local to each computer.
- Download a local model only when selected. SmolLM2 uses a compact heuristic profile for job importance, keyword coverage, and short overview suggestions; LFM2.5, Gemma 3, and Qwen receive the complete input and full analysis prompts. LFM2.5 and Gemma require agreement to their model terms before download or use, saved on each computer. OpenAI and installed Ollama models retain their full provider path, with no automatic fallback.
- Show download progress, pause, resume, retry, and per-model Delete with native confirmation. Keep models through updates. Windows uninstall removes model downloads; Mac users delete them in Settings before removing the app.
- Store captured application listing text in editable Notes for offline reference, retaining the original archive fields and taking a full backup before migration.
- Store uploaded resumes as SQLite BLOBs in the same chosen database file as applications and plans.
- Schema v9 stores keyword and theme importance beside their existing text arrays, plus the last saved overview as a workspace preference. Take a full source-file backup before migration. Opening a v8 file for this migration does not repeat the earlier Notes migration.
- Keep weekly local backups and detect outside changes to the selected cloud file before saving.
- Use native file dialogs, platform fonts, and a left navigation for Windows x64, Windows ARM64, and Apple Silicon macOS. No account sign-in is required.
- Start the desktop window at 1550 by 850 device-independent pixels, 300 wider than the previous 1250 width, capped to the primary display's work area. Auto appearance uses the native system preference for the initial window background.
- Keep appearance, navigation expansion, and optional diagnostic logging in local settings on each computer. If saving navigation expansion fails, restore the previous layout and show an error. Preserve drafts and the selected destination when toggling.
- Use a 44px native title region with native Windows overlay controls or native macOS traffic lights at x=18, y=16. Expanded navigation is 210px, or 176px at 850px window width; collapsed navigation is 96px on both platforms. The 54px zebra button contains the unchanged 46px image. The collapsed database footer opens Database settings.
- Version 1.3.0 keeps schema v9 and performs no data migration. Retain the internal package name pm-application-tracker, app ID com.desigrit.pmapplications, and legacy userData and model-folder paths when presenting the new public name.

## Product Principles

- Make adding several applications in a day quick.
- Keep every recorded field visible or easy to edit.
- Make progress and match patterns clear without requiring manual calculation.
- Preserve data between sessions and devices.
- Make the cloud sync sequence clear before switching computers.

# Zebby guide

A desktop app for planning product management applications and tracking the roles you apply for.

## Install

Download the installer for your computer from the repository's [Releases](https://github.com/desigrit/zebby-the-scout/releases) page. Release installers download directly as `.exe` or `.dmg` files, without a ZIP wrapper.

- Windows x64: `Zebby-*-win-x64.exe`
- Windows ARM64: `Zebby-*-win-arm64.exe`
- Apple Silicon macOS: `Zebby-*-mac-arm64.dmg`

Windows builds are unsigned and may show a SmartScreen prompt. Mac builds use an ad-hoc signature to verify bundle integrity, but are not signed with an Apple Developer ID or notarized by Apple. macOS requires a one-time approval after download.

### Mac first launch

Download version 1.6.5 or newer, open the DMG and drag Zebby into Applications. Try opening it, then go to **System Settings > Privacy & Security > Open Anyway** if Zebby is listed. Confirm **Open**. [Apple's instructions](https://support.apple.com/en-us/102445) describe this approval.

If Tahoe shows “Zebby is damaged” and offers no Open Anyway button, close the alert and run this in Terminal after copying the new app into Applications:

```sh
xattr -dr com.apple.quarantine "/Applications/Zebby.app"
```

Then open Zebby from Applications. This clears the download quarantine attribute only for your copy of Zebby. Use it only for the installer downloaded from [Zebby's GitHub releases](https://github.com/desigrit/zebby-the-scout/releases). Removing quarantine does not make the app Apple-notarized. No administrator password is required for a copy you own.

### Database setup

On first launch, the app creates a local SQLite database automatically, so you can use Plan and Applications immediately. **Create new database** in Settings creates an empty file and switches to it, leaving your existing database intact. Save a new file in a cloud synced folder to share it between computers, then use **Open database** on the second computer. To move a database that already contains your jobs, quit Zebby, move or copy the file in Explorer or Finder, then open it in Settings. Wait for your cloud drive to finish syncing before switching computers. Keep only one computer editing the file at a time.

Install version 1.4.1 or newer on both computers before opening a shared database that has been upgraded by this release. Older versions cannot open the upgraded file.

The app keeps a local working copy and writes complete snapshots back to the selected file after changes. It detects if that cloud file changed outside the app before it saves. Before upgrading an older database to this release, it saves a complete original copy in the local backups folder with `before-v10` in its filename. Existing Notes, captured listings, resumes, Plan text, and prior backup files are retained. Zebby does not create weekly backups. You can copy the database on disk while the app is closed.

Settings contains the current database file, Open and Create actions, an **Analyze with** provider dropdown, System/Light/Dark appearance, troubleshooting links, and Updates. Only the selected analysis method's setup controls appear. Use **Save** for local server settings or **Save key** to add or replace a personal API key; **Remove key** appears when a key is set. System appearance follows your operating system. Analysis sharing and model storage details expand when needed. Help and model terms text use the section's available width and wrap naturally as it narrows. Diagnostics are recorded automatically on this computer; there is no logging toggle. Logs include database operations, model startup and timing, cancellations, underlying error causes, and update actions. They exclude resume and job-description text and redact stored secrets. The logs folder is separate from your database. **Report an issue** opens the repository's GitHub issue page. Web links open in your default browser.

### App updates

Install version 1.5.0 manually once to enable in-app updates. Zebby checks GitHub for a new stable release when it opens, and checks again when you return to the window after six hours. Use **Check for updates** in Settings at any time. When an update is available, an **Update** button appears in Settings and at the bottom of the sidebar, including icons-only navigation.

Click **Update** to download the installer for your computer. You can keep working during the download. Zebby checks its exact size and SHA-256 checksum against the GitHub release before offering **Restart to update**. Click that button when you are ready. Finish any analysis, application form, or open editing dialog first. Unsaved Plan edits require confirmation, and unsynced database changes must save successfully before installation starts.

Windows replaces the installed app silently and reopens it. On Mac, copy Zebby into Applications before updating. The app stages the verified new bundle beside the installed app, quits, replaces it, and reopens. The previous app is kept until the new version has loaded; an immediate reopen failure restores the previous app. Database files, preferences, API keys, and models are outside the replaced app. An offline update check or failed verification leaves Zebby usable and offers another try. Mac bundles use ad-hoc signing and still require initial approval; Apple notarization is not configured.

Choose **Local server** under **Analyze with** in Settings to analyze with a model running on your computer or local network. Select an installed model from the **Model** dropdown, such as `qwen3.8:27b`, then save. If a model is missing, choose **Enter model name** or use **Find models** after installing it or changing the server URL, usually `http://localhost:11434`. Ollama must be running when you analyze. Its server and model settings are stored on each computer, while your plans and applications remain in the shared database. No OpenAI API key is needed for Ollama. The app extracts text from PDF, DOCX, or DOC locally and sends it with the job description and CV overview to the configured Ollama server. Scanned PDFs without selectable text need a text-based resume.

Choose **OpenAI API key** in Settings and select an OpenAI model. Save an API key on each computer where you use that provider. Plan analysis sends job text, your current CV overview, and the selected resume to OpenAI. Application match analysis sends job text and the selected resume. API usage may be billed to your account.

### Downloadable local models

Choose **Downloaded model** in the **Analyze with** dropdown, then choose a **Local model**. Selecting a model starts its download, with progress, Pause, Resume, and Retry controls. LFM2.5 and Gemma first show their model terms and an **Agree and download** button. A completed download is verified and reused, including after app updates. No account, API key, Ollama installation, or GPU is required. These models run on the computer's CPU. Downloads require an internet connection; analysis works offline once a model is ready.

| Model | Download | Recommended installed RAM | Analysis |
| --- | --- | --- | --- |
| SmolLM2 360M, Q4_K_M | 271 MB | 4 GB or more | Basic keyword coverage, resume themes, and short overview suggestions |
| LFM2.5 350M, Q4_K_M | 229 MB | 4 GB or more | Full analysis prompts with a small instruction model |
| Gemma 3 270M Instruct QAT, Q4_0 | 241 MB | 4 GB or more | Full analysis prompts with a small instruction model |
| Qwen3 0.6B, Q8_0 | 639 MB | 8 GB or more | Full role and resume analysis with a small model |
| Qwen3 4B, Q4_K_M | 2.50 GB | 16 GB or more | Full role and resume analysis with a medium model |
| Qwen3 8B, Q4_K_M | 5.03 GB | 24 GB or more | Full role and resume analysis with the largest built-in model |

Only SmolLM2 uses the compact profile: keywords and themes come from listing terms, match strength is the percentage of those terms found in the resume, and the model suggests a light overview edit from short source excerpts. Unsupported wording is discarded, retaining your original overview with an explanation. This score does not assess experience depth. LFM2.5, Gemma, and Qwen receive the complete role and extracted resume text with the full analysis prompts. Results depend on model capacity. Small models can miss evidence or give inconsistent scores and overview suggestions; larger models can be slow on CPU. If the request exceeds the chosen model's context or available memory, the app reports it instead of silently shortening the text or changing providers.

LFM2.5 uses the [LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/blob/657e078c94084481950a2d555a941481f715536b/LICENSE). Gemma uses the [Gemma Terms of Use](https://ai.google.dev/gemma/terms) and [Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy). Agreement is saved on each computer and checked against the bundled terms version. Full terms and notices are included with the app and copied next to the downloaded model for offline reference.

OpenAI and Ollama retain their configured model and full analysis path. Choosing a downloadable model does not replace an installed Ollama model such as `qwen3.8:27b`. Providers never fall back to one another automatically.

Models are stored in the local app data folder on each computer, outside the selected SQLite file: `%LOCALAPPDATA%\Zebby\Models` on Windows and `~/Library/Application Support/Zebby/Models` on macOS. They are excluded from database copies and backups. The installer includes only a small native inference engine, with the model weights downloaded separately. Job and resume text stays on this computer when using the built-in provider. The engine listens only on loopback, requires an app-generated secret, has no web interface or agent tools enabled, and releases its memory after a minute of inactivity.

Use the **Delete** button next to a downloaded model to remove it, with **Cancel** or **Delete model** in a native confirmation dialog. Saved plans, applications, resumes, and Ollama models are preserved. On Windows, uninstalling also removes the app's model downloads, while updating keeps them. On macOS, delete models in Settings before removing the app from your Mac; dragging an app to Trash does not run a cleanup callback. **Open model folder** opens the download location in Explorer or Finder.

## Plan

Paste a public HTTPS job listing link. The app automatically tries to fill available details and capture a readable text copy of the posting from supported job board APIs, structured job data, or visible page content. **Read listing** retries when needed. If a site blocks automatic reading, paste the description yourself. Headings, paragraphs, and bullets are retained as readable text when available. Save a separate plan for each posting. A separate **Saved listing copy** keeps the original text in the SQLite file for offline reference, even after you edit the working description. The automatic copy can include up to 80,000 characters of readable page text. It does not save the page's images, scripts, or full HTML.

Paste your **Current CV Overview** and choose a saved resume or upload the one you plan to use for this role. Both are saved with the plan in the SQLite file. New plans start with your last saved overview, which follows the selected database between computers. Opening an existing plan keeps that plan's own overview.

Choose an analysis provider in Settings, then select **Analyze** below **Your CV**. The app saves 6 to 20 ATS keywords, 5 or 6 resume themes, a 0 to 100 percent match estimate based on that resume, and a role-specific CV overview rewritten from your pasted text. Expand **Why** below the match score to read the strongest resume evidence and the main gaps behind it. The explanation is saved with the plan for offline reference. During analysis, source inputs are temporarily disabled. **Cancel** stops an active request before saving and retains your previous analysis. Once a result has committed, cancellation is declined and the saved result is delivered. Older saved scores need a refreshed analysis to add an explanation. Each keyword and theme has an estimated **importance to the job** percentage. Higher values mark bigger priorities for a strong candidate's CV. Importance comes from the job's requirements and responsibilities, independently of your resume coverage and overall match score. These estimates are guidance, not measurements from a recruiter or ATS, and do not sum to 100. Only add claims that your experience supports.

The rewrite aims to keep your writing style and use only experience supported by your CV and resume. A separate explanation below the generated overview says why its wording stayed the same or what changed. You can edit, add, or remove keywords and themes, and edit the rewritten overview. Changing a recommendation's wording leaves it **Unrated** until refreshed. Changing the job clears the importance ratings; changing only the CV overview or resume retains job importance but clears the previous match score, its explanation, and the overview explanation. Analyses from older releases that did not save importance ratings retain their text and show **Unrated** until refreshed. Use **Analyze** or the refresh icon beside the match score to run a new analysis. Check the result before using it.

Plan keeps **Job posting** and **Your CV** side by side when space permits, followed by resume direction in a scrolling document. **Save plan** stays outside that scroll area. **Why**, the wording rationale and **Analysis details** use the full document width and wrap naturally in narrow windows. The saved-plan rail becomes a **Saved plans** toggle in smaller windows. Keywords and themes remain editable in simple side-by-side lists; narrow logical widths can stack them. Each item has **Copy** immediately before **Remove**, copying only its current edited keyword or theme text, without the importance percentage or other items. These item buttons replace the two copy actions in the section headers. Editing, importance, and Add/Remove work as before. Copy is disabled for empty items and during analysis. Plans save when you choose Save or complete an analysis. Draft recovery, autosave, and the existing discard behavior are unchanged.

The circular zebra icon is shared by the desktop app, sidebar, and installers. Click it in the sidebar to smoothly switch between icons only and icons with labels. The choice is remembered on each computer. Windows scrollbars rest as thin thumbs and widen when hovered, focused, or scrolled, without shifting the content. Mac keeps system scrollers. The zebra has balanced spacing from the top and left of its sidebar, below the native traffic lights on Mac. Menu icons play a brief animation when selected, without delaying navigation. Plan uses a magnifying glass with a small sparkle flutter. Reduce Motion keeps the sidebar and icons still. Clickable controls use the standard arrow cursor; text fields keep the text cursor. Icons retain their tooltips and keyboard labels. The current database appears only in the expanded sidebar and in Settings. The workspace uses Ember light and dark palettes, with warm neutrals, rust actions, activity bars stacked by status, and quiet selection washes and a title bar that shows only Zebby and blends into the sidebar and workspace. Native Windows window controls and Mac traffic lights remain available. New windows start at 1550 pixels wide, capped by the screen's available work area.

In both Plan and Applications, choose **Add location**, type a location, and press **Enter** to add it. The highlighted **Add location** control keeps keyboard focus, so press **Enter** again to open the next input. Blank Enter keeps the input open; **Escape** or **Cancel** returns to Add location.

## What it records

- Company, job title, team, and individual locations
- Job listing link, saved listing copy, and date applied
- Match strength from 0 to 100 percent, entered manually or analyzed after saving
- The resume used for each application, when attached
- Status: Applied, Heard back, Interview scheduled, or Rejected
- Freeform notes for each application

All application details can be left blank. The date starts at today and the status starts at Applied, but you can clear the date and save without a listing, score, or resume.

The daily chart covers the last 30 days. Each bar shows applications on their original applied date, with segments for their current Applied, Heard back, Interview scheduled and Rejected statuses. Changing a status updates that day's breakdown and keeps its total unchanged. Applications without an applied date stay outside the chart. Hover or focus a bar to see its date, total, status names and exact counts. **Left** and **Right** move between days; **Home** and **End** focus the first and last day. **Escape** dismisses the tooltip.

Below the chart are total applications, applications this week, roles in conversation, interviews, and average match strength among scored applications. You can search roles, filter by company or status with counts, edit applications, change a status in place, add notes, and delete a mistaken entry after confirmation. Multiple locations appear in a compact summary with a chevron that expands individual locations.

Each row starts with title and company above location and View listing; the applied date, match percentage, status and Notes, Edit and Delete are vertically centered beside this two-line block with balanced spacing. Click empty space in a role's row to select it and open its details in the persistent inspector on wide layouts. The list and inspector scroll independently. Select the **X** (**Close details**) to close the inspector, give its width to the list, and return keyboard focus to the selected role. Clicking the same or another role reopens details. Individual row controls keep their own actions. In smaller layouts, the details expand inside the selected row through its inline disclosure. Short windows and higher scaling use page scrolling to keep roles and their controls reachable. The complete New Application form keeps every optional field.

Resumes are uploaded once and can be reused for later applications. PDF, DOCX, and DOC files up to 10 MB are supported.

When adding an application, you can paste the public HTTPS job listing link first. The app tries to fill the company, title, team, and locations from the job board or page metadata and capture the readable job text. Combined titles such as "Product Manager, Central Products" are separated into title and team when the meaning is clear. You can add or remove each location. If the link already belongs to an application, the form warns you and offers to edit the existing entry. Review and edit any imported result before saving. Open the **Notes** icon on an application to read the captured text offline and add your own information. If a listing blocks automated access, paste the description yourself and save it. Existing saved listing copies are copied into Notes during the upgrade, preserving paragraph breaks, bullets, and any existing notes. The original archive fields also stay in the database. New listing captures are added to Notes automatically; later edits to the working description do not overwrite that text.

When you save an application with a resume and no score, a ready local model or personal API-key provider can calculate match strength automatically. With Zebby credits, use **Analyze match** or **Refresh match** and confirm its maximum quote; saving does not spend credits. Analysis uses a description pasted into the application, its saved listing copy, a saved Plan with the same listing link, or the public listing page. A progress ring appears while analysis runs. The affected source controls are temporarily disabled, and **Cancel** stops an active request before saving while retaining the prior result. The score and a short explanation are saved with the application. If analysis cannot run, the application stays saved and the error explains what is needed. Use the refresh icon beside the match track to retry or refresh the result. Plan also uses a refresh icon beside its match result after analysis. If you edit the resume or description afterward, the previous AI score is cleared. Ready local and personal-key methods can calculate it again automatically; paid analysis still requires an explicit quote. Analysis sends job and resume content to the provider selected in Settings.

## Updating to Zebby

Version 1.5.0 moves app artifacts into folders named Zebby. Windows preferences, logs, working copies, and the default database use `%APPDATA%\Zebby`; models and update downloads use `%LOCALAPPDATA%\Zebby`. Mac app artifacts use `~/Library/Application Support/Zebby`. Older profiles named `pm-application-tracker` or `PM Application Tracker` are migrated on first launch. Database selections in cloud folders stay unchanged. Internal database paths are updated, encrypted keys are retained, and downloaded models are moved without downloading them again. Existing destination files take precedence. Original profile records and logs remain in the old folder as recovery copies; those old copies do not receive new changes.

The internal package name and installer app ID stay unchanged so upgrades keep the same installed app identity. Version 1.6.0 continues to use schema 10 and adds no database schema change. Version 1.4.1 or newer is required on both computers for a shared schema 10 file. On macOS, replace the previous app in Applications with Zebby, then remove the old app shortcut.

## Build from source

Use Node.js 22.13 or newer. Run `npm ci`, then `node node_modules/electron/install.js` to download the local Electron runtime. Run `npm run desktop:prepare-model-engine` to download the pinned CPU engine for your platform. Run `npm run desktop:dev` to launch the desktop app. Run `npm test`, `npx tsc --noEmit`, and `npm run lint` to check changes.

After `npm run desktop:build`, `npm run test:renderer` checks the compiled UI invisibly with synthetic data. It does not launch Electron or open a real database. It uses an installed Edge or Chrome browser, or the executable supplied through `PM_TRACKER_BROWSER`, and writes screenshots to `qa-output`.

For an actual CPU inference check without opening Electron, run `node --experimental-strip-types scripts/qa-local-engine.mjs smollm2-360m`, or use `lfm25-350m`, `gemma3-270m`, or `qwen3-06b`. This downloads the selected model into `work/local-engine-qa/Models`, uses synthetic job and resume text, checks the analysis, authenticated engine access, and shutdown, then saves a result under `work`. That folder is excluded from source control. Packaged builds prepare their platform's engine automatically and include its license and model notices. CI runs both new models from the packaged Windows x64 and Apple Silicon apps.

Gemma uses model-specific sampling and string bounds in the output grammar to reduce repetitive completions. Its complete source input and full instructions are preserved. CI retains synthetic response diagnostics if native generation fails.

The package commands are `npm run desktop:package:win:x64`, `npm run desktop:package:win:arm64`, and `npm run desktop:package:mac:arm64`. Both Windows packages are built on Windows x64; the macOS package is built on Apple Silicon. Tagging a version as `vX.Y.Z` runs all three builds and publishes the `.exe` and `.dmg` files as GitHub Release assets. GitHub Actions keeps internal build artifacts as ZIP files.

## Repository layout

- `desktop/renderer`: the React interface and styles for Plan, Applications, and Settings.
- `desktop`: the Electron shell, SQLite storage, analysis providers, model downloads, and updates.
- `lib`: shared application types, validation, job listing extraction, and formatting helpers.
- `build`: installer customization, bundled licenses, and model notices.
- `scripts` and `tests`: desktop builds and verification.
- `docs`: the user guide, release notes, and screenshots.

This repository contains the desktop app. The earlier web prototype is available in Git history. `npm run build` builds the desktop app, `npm run dev` builds and launches it, and `npm start` launches an existing build.


## Online analysis and credits

The first **Analyze** opens a setup dialog when no working method is configured. Choose a local server, download a model, use your own OpenAI or Anthropic API key, or buy Zebby credits. Existing working methods continue directly. Local models and personal keys need no Zebby account.

Settings has a normal model dropdown for each API provider. OpenAI offers GPT-6 Luna, GPT-6.1 Sol, and GPT-6 Astra. Anthropic offers Claude Haiku 4.5, Sonnet 5.5, and Opus 5.5. Models are used as selected, with no automatic fallback to a weaker model. Hosted model availability depends on the API account.

Paid credits use a guest wallet with no signup or sign-in screen. To purchase or top up, open **Settings > Analysis**, set **Analyze with** to **Zebby credits**, then choose **Buy credits**. First-use setup also offers **Buy credits**. Choose a pack, pay in your external browser, then choose your model. Stripe collects your payment details and receipt email. Credit packs show illustrative Luna analysis counts. The purchase introduction and pricing helper text use the dialog's available content width and wrap naturally in narrower windows. Before a paid analysis, choose a model and confirm the maximum credit cost. Actual reported usage is charged, and unused holds return to the wallet. Saving an application never automatically spends paid credits.

In **Settings > Credits**, an empty wallet has a short no-credit message, **Restore credits | Connect this computer** and **Learn more**. A funded wallet shows a slim bar with available credits, used credits out of the total and the percentage left, plus your model dropdown. Available credits subtract any credits reserved for a running analysis; those reservations are not counted as used. The bar shows cumulative usage of purchased credits with no weekly reset or expiry. The sidebar also shows available and used credits after a purchase.

Job and resume text go to the selected online provider, through Zebby's service for credit-funded analysis. Each computer keeps an independent encrypted wallet credential outside the shared SQLite database. Paid checkout needs working Windows secure storage or Mac Keychain. Credentials and recovery codes are redacted from app logs.

**Restore credits** reconnects an installation using your saved recovery code. It restores the credit wallet, not your applications database. **Connect this computer** accepts a temporary code from another connected computer. Both links open a form in **Settings > Credits**. If a connection is interrupted, **Refresh balance** retries the original request. Finish it before entering a different code.

Open **Settings > Credits > Learn more** for an explanation and wallet management:

- **Save recovery code** exports a private text file. It is also offered after a successful purchase. Keep it outside Zebby's app-data folder so it remains available after uninstalling. Anyone with the code can use your credits.
- **Connect another computer** displays a code that expires after ten minutes. On your other computer, choose **Settings > Credits > Connect this computer** and enter it. The code works once, and both computers share one balance. You can generate a new code or cancel pairing in this dialog.
- **Connected computers** lists the devices that can spend credits. **Disconnect** asks for confirmation and removes that device's access, preserving the wallet balance. The current computer cannot disconnect itself.
- **Replace recovery code > Create new recovery code** replaces the previous code after confirmation. Already connected computers retain access.
- **Recent usage** shows the model, date, analysis type and credits charged.

Sharing your applications SQLite file does not share wallet credentials. If you lose every connected computer and your recovery code, automatic recovery is unavailable. Connection and payment failures preserve saved wallet access so Retry or a restart can resume it. Switching a funded computer to another wallet first requires a recovery code for its current wallet and a native confirmation.

Official builds from 2.1.4 connect to Zebby's hosted credits service. The free host can need about a minute to wake after 15 minutes without requests. Zebby waits for startup before sending checkout or analysis, with a two-minute limit and cancellable analysis. Checkout and paid analysis are not replayed during this wait. Custom builds need the public `ZEBBY_CREDITS_SERVICE_URL` configured. The [credits service setup guide](../credits-service/README.md) covers Supabase, provider keys, Stripe sandbox checks, live configuration, and hosting. Email sign-in and SMTP setup are not required. Connection checks created and expired an unpaid live Checkout session; they did not take a real payment.

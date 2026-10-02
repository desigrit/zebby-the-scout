# Settings

## Direction contract

MODE: Operate.

THESIS: Choose an analysis source, manage the selected database, find troubleshooting actions, and update Zebby without extra setup knowledge.

OWN-WORLD: Preserve the approved Graphite Search Ledger, Zebby identity, native selects, platform fonts, fine rules, and existing widths. The unchanged circular zebra and menu sit higher in the platform-specific rail; short icon motion confirms an accepted destination activation.

STORY: Open an existing database or create a blank one. Select a provider and local model, accept required terms, and manage its download inline. Choose appearance and open automatic error logs or report an issue. Check for an update, choose its download, and restart after verification and saving.

FIRST VIEWPORT: The shared 44px native title region reads only Zebby. Settings starts directly with Database, followed by Analysis, Appearance, Logs, and Updates, without a page heading or introductory subheading. Database shows the current file, Open database, Create new database, and one helper line. Provider and Local model remain stacked native dropdowns. Updates follows Logs, below the first viewport when required by content height. Narrow windows stack section headings above their controls.

FORM: A scoped refinement of the approved operating ledger. Preserve the palette, artwork, shell, typography, widths, and provider behavior. The selected model's inline progress-to-Ready interaction remains the signature.

FINISH: The fresh v1.5.0 review returned ship and manager APPROVE across the complete diff and 37 current captures, with no material fixes. Its persistence, fidelity, ceiling, material_fixes, and keep sections are recorded in [the finish review](../review/navigation-updates-finish-review.md). Native installation remains unverified until release CI.

## Database and logs

- Create new database always creates and selects a blank SQLite file. Exclusive creation protects existing files and preserves the previously selected database. Pending writes are awaited; unsaved database changes block switching. Canceling the native dialog preserves the selection.
- Version 1.5.0 keeps schema 10 and adds no schema change. An older selected file receives a complete original before-v10 backup before upgrade. Existing data and backup files remain; there are no recurring weekly backups or backup pruning. Install version 1.4.1 or newer on both computers before sharing a schema 10 database.
- Logs saves errors automatically on each computer with no capture preference, switch, or verbose warning. Log files are created lazily for errors, separate from the database, with ordered writes, bounded entries, rotation, and known API key redaction.
- Open logs folder opens the local folder. Report an issue is an underlined external link to [the Zebby issue form](https://github.com/desigrit/zebby-the-scout/issues/new). Both actions retain shared keyboard focus and an external-arrow icon.

## Updates and artifact migration

Updates shows the installed version, Check for updates, a live status message, and Release notes when a compatible stable release is available. Automatic GitHub checks run on launch and window focus after six hours; the manual action bypasses that interval. An available update also appears at the bottom of expanded or collapsed navigation, with an accessible phase label and collapsed tooltip.

Download requires an explicit Update action. Its shared button reports download percentage, Preparing update, Restart to update, Restarting, or Retry update; busy phases disable the action and show a spinner. Errors use the existing alert surface. Restart becomes available after exact size and SHA-256 verification. Open application forms and editing dialogs block restart, unsaved Plan edits require confirmation, and active analysis or settings requests must finish. Database saving must succeed, model downloads pause, the model engine shuts down, and logs flush before installation. Mac keeps its previous app until the new React desktop acknowledges loading; immediate reopen failure restores it.

First launch migrates known legacy profiles into Zebby, preserving encrypted keys, preferences, accepted model terms, logs, working copies, default databases, and downloaded models. External cloud database paths stay unchanged; internal profile paths are rewritten. Existing destinations take precedence, and original profile records and logs remain as recovery copies. Windows profiles use `%APPDATA%\Zebby`, with models in `%LOCALAPPDATA%\Zebby\Models`. Mac profiles use `~/Library/Application Support/Zebby`, with models in its `Models` folder. Migration failures preserve previous files. The internal package and installer identity stay unchanged. The complete public workflow is in [the guide](../../docs/guide.md) and [1.5.0 release notes](../../docs/releases/v1.5.0.md).

## Preserved constraints

- Provider settings, accepted model terms, downloads, appearance, and navigation expansion stay local to each computer. The last saved Current CV Overview stays in the selected database.
- The unchanged 46px zebra sits in a 54px toggle. Expanded navigation is 210px, or 176px at the 850px window breakpoint; collapsed navigation is 96px on both platforms. Windows navigation spans the title region with 8px top padding and image y=12px. Mac navigation starts below the 44px native region with 4px top padding and image y=52px. Brand bottom padding is 12px. Available updates appear in both states; database details appear only when expanded. Settings retains the file details in both states.
- The toggle retains its expanded-state announcement, action labels, tooltips, and Enter or Space activation. Failed preference saves restore the previous layout and show an error; drafts and destination stay intact.
- Keep native Windows overlay controls and macOS traffic lights at x=18, y=16 in the 44px title region. Show only Zebby, without a database filename or sidebar wordmark.
- Retain pm-application-tracker and com.desigrit.pmapplications while migrating known legacy artifact folders to Zebby.
- Destination controls have 48px targets and 24px icons. An accepted click or keyboard activation navigates immediately and plays its distinct offline Lottie animation for about 417ms. Reduced motion stays still; player failures show the static icon. Completion, hiding, or a reduced-motion change returns it to rest; unmounting removes players and listeners. Clickable desktop controls use the arrow cursor; text fields use the caret cursor.
- LFM2.5 and Gemma require linked terms and inline Agree and download or Agree and use. Versioned acceptance is checked before download or inference. Terms remain underlined at rest.
- Installed and partial models retain per-model Delete on both platforms, with native confirmation and Cancel as the default. Updates keep downloads. Windows uninstall removes them; Mac users delete them in Settings before removing the app.
- Preserve the selected database and installed Ollama models. No provider silently falls back. Light, dark, and Auto retain the approved appearance tokens and native startup background.

## Analysis paths

| Model | Download | Analysis path |
| --- | --- | --- |
| SmolLM2 360M | 271 MB | Compact heuristic importance, keyword coverage, and limited overview suggestions |
| LFM2.5 350M | 229 MB | Complete input and full analysis instructions |
| Gemma 3 270M, Instruct QAT | 241 MB | Complete input and full analysis instructions |
| Qwen3 0.6B | 639 MB | Complete input and full analysis instructions |
| Qwen3 4B | 2.50 GB | Complete input and full analysis instructions |
| Qwen3 8B | 5.03 GB | Complete input and full analysis instructions |

OpenAI and configured Ollama retain their full provider paths. Job importance is independent of resume coverage and match strength. New Plan match explanations describe evidence and gaps beside the saved score; overview rationale remains separate. These paths describe implementation behavior and do not certify inference quality.

## Finish evidence

Current Settings evidence includes [Windows Ready light](../review/navigation-updates-1.5.0/settings-windows-ready.png), [Mac Ready dark simulation with Updates](../review/navigation-updates-1.5.0/updates-mac-ready-dark.png), and [Mac collapsed update simulation](../review/navigation-updates-1.5.0/updates-mac-collapsed.png). This documenter inspected the first two images. The earlier model terms and analysis-path review remains recorded in [the 1.4.0 finish review](../review/settings-plan-finish-review.md).

The [37-file manifest](../review/navigation-updates-1.5.0/capture-manifest.txt) includes the three README copies. The reviewer inspected the complete diff and every current capture, and independently passed 68 tests, typecheck, quiet lint, and diff checks. Four contact sheets summarize the same captures: [1](../review/navigation-updates-1.5.0/contact-1.png), [2](../review/navigation-updates-1.5.0/contact-2.png), [3](../review/navigation-updates-1.5.0/contact-3.png), and [4](../review/navigation-updates-1.5.0/contact-4.png). Parent validation covers immediate navigation, distinct click motion, reduced motion, update states, and canceled restarts that preserve unsaved edits.

All captures use synthetic state and the compiled renderer in headless Chromium on Windows. Mac filenames simulate the Mac renderer branch on Windows; they do not verify macOS fonts, chrome, or installation. No visible app or browser and no real settings, database, resumes, or installed models were used for documentation. Native NSIS replacement, DMG staging/replacement/reopening/rollback, Keychain upgrade behavior, and live provider inference remain unverified locally; native installation is a release CI gate. No detector ran.

Source grounding includes desktop/renderer/App.tsx, desktop/renderer/desktop.css, desktop/renderer/NavigationButton.tsx, desktop/renderer/navigation-animations.ts, desktop/renderer/UpdateButton.tsx, desktop/release-updates.ts, desktop/self-update.ts, desktop/app-identity.ts, desktop/local-model-storage.ts, desktop/main.ts, desktop/bridge.ts, desktop/preload.ts, and the public guide and 1.5.0 release notes. The pre-existing shared web-header preview in the design sidecar remains outside this scoped refinement.

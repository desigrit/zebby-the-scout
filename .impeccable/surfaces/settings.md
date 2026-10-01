# Settings

## Direction contract

MODE: Operate.

THESIS: Choose an analysis source, manage the selected database, and find troubleshooting actions without extra setup knowledge.

OWN-WORLD: Preserve the approved Graphite Search Ledger, Zebby identity, native selects, platform fonts, fine rules, and existing widths. The unchanged circular zebra and menu sit higher through the shared sidebar spacing refinement.

STORY: Open an existing database or create a blank one. Select a provider and local model, accept required terms, and manage its download inline. Choose appearance and open automatic error logs or report an issue.

FIRST VIEWPORT: The shared 44px native title region reads only Zebby. Settings starts directly with Database, followed by Analysis, Appearance, and Logs, without a page heading or introductory subheading. Database shows the current file, Open database, Create new database, and one helper line. Provider and Local model remain stacked native dropdowns. Narrow windows stack section headings above their controls.

FORM: A scoped refinement of the approved operating ledger. Preserve the palette, artwork, shell, typography, widths, and provider behavior. The selected model's inline progress-to-Ready interaction remains the signature.

FINISH: The fresh v1.4.0 review returned ship across 34 supplied captures and scoped source, with no material fixes. Its persistence, fidelity, ceiling, material_fixes, and keep sections are present in [the finish review](../review/settings-plan-finish-review.md). This verdict covers source and the supplied renderer captures, recorded before the release build.

## Database and logs

- Create new database always creates and selects a blank SQLite file. Exclusive creation protects existing files and preserves the previously selected database. Pending writes are awaited; unsaved database changes block switching. Canceling the native dialog preserves the selection.
- Version 1.4.0 uses schema 10. An older selected file receives a complete original before-v10 backup before upgrade. Existing data and backup files remain; there are no recurring weekly backups or backup pruning. Install version 1.4.0 on both computers before sharing an upgraded database.
- Logs saves errors automatically on each computer with no capture preference, switch, or verbose warning. Log files are created lazily for errors, separate from the database, with ordered writes, bounded entries, rotation, and known API key redaction.
- Open logs folder opens the local folder. Report an issue is an underlined external link to [the Zebby issue form](https://github.com/desigrit/zebby-the-scout/issues/new). Both actions retain shared keyboard focus and an external-arrow icon.

## Preserved constraints

- Provider settings, accepted model terms, downloads, appearance, and navigation expansion stay local to each computer. The last saved Current CV Overview stays in the selected database.
- The unchanged 46px zebra sits in a 54px toggle. Expanded navigation is 210px, or 176px at the 850px window breakpoint; collapsed navigation is 96px on both platforms. The shared rail uses 12px top padding and 20px below the brand. Only expanded navigation shows the current database footer. Settings retains the file details in both states.
- The toggle retains its expanded-state announcement, action labels, tooltips, and Enter or Space activation. Failed preference saves restore the previous layout and show an error; drafts and destination stay intact.
- Keep native Windows overlay controls and macOS traffic lights at x=18, y=16 in the 44px title region. Show only Zebby, without a database filename or sidebar wordmark.
- Retain pm-application-tracker, com.desigrit.pmapplications, and legacy profile and model folders.
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

Current captures are listed in [the 34-file manifest](../review/settings-plan-1.4.0/capture-manifest.txt). Settings uses 1440 by 960 wide and 790 by 850 compact viewports:

- [Windows download](../review/settings-plan-1.4.0/settings-windows-download.png)
- [Windows Ready](../review/settings-plan-1.4.0/settings-windows-ready.png)
- [Windows dark](../review/settings-plan-1.4.0/settings-windows-dark.png)
- [Windows compact](../review/settings-plan-1.4.0/settings-windows-compact.png)
- [Mac branch Ready simulation](../review/settings-plan-1.4.0/settings-mac-ready.png)
- [Mac branch compact dark simulation](../review/settings-plan-1.4.0/settings-mac-compact-dark.png)
- [LFM2.5 terms](../review/settings-plan-1.4.0/settings-lfm25-350m-terms.png)
- [LFM2.5 Ready](../review/settings-plan-1.4.0/settings-lfm25-350m-ready.png)
- [Gemma terms](../review/settings-plan-1.4.0/settings-gemma3-270m-terms.png)
- [Gemma Ready](../review/settings-plan-1.4.0/settings-gemma3-270m-ready.png)
- [Mac branch collapsed light simulation](../review/settings-plan-1.4.0/settings-mac-collapsed-light.png)
- [README Settings](../review/settings-plan-1.4.0/readme-settings.png)

This documenter inspected Windows Ready light and Mac compact dark. Parent and reviewer opened and validated all 34 captures. All use synthetic state and the compiled renderer in headless Chromium on Windows; Mac filenames exercise the Mac renderer branch on Windows.

Scoped source includes desktop/renderer/App.tsx, desktop/renderer/desktop.css, desktop/main.ts, desktop/bridge.ts, desktop/preload.ts, desktop/store.ts, desktop/diagnostic-log.ts, desktop/analysis-contracts.ts, desktop/basic-local-analysis.ts, package.json, and docs/guide.md. The fresh reviewer independently passed 58 tests, typecheck, lint with zero errors, and diff checks. Lint recorded three established image warnings plus one ignored exploratory-file warning. Parent supplied successful desktop build and headless renderer QA; reviewer inspected that evidence and QA source without rerunning the renderer.

No detector ran for this desktop task. No app, browser, real settings, database, resumes, or installed models were opened for documentation. Native installer upgrades, actual macOS fonts and chrome, Keychain upgrade behavior, and live provider inference remain unverified. Packaged inference and release CI are assessed separately from this documentation review. The review does not certify accuracy.

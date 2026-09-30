# Settings

## Direction contract

MODE: Operate.

THESIS: Choose the analysis source and install a local model without knowing about servers or command line tools. Existing OpenAI and Ollama settings retain their behavior.

OWN-WORLD: Extend the paper surfaces, forest text, native selects, fine rules, and platform fonts in DESIGN.md. Reuse Settings section spacing and button styles.

STORY: Select Built-in local, choose one of six named models, see its size and memory guidance, and watch the download finish. LFM2.5 and Gemma show linked terms and an inline Agree and download action on first use. Installed models and accepted terms are reused. Pause, resume, retry, and removal are inline actions.

FIRST VIEWPORT: Keep Database above Analysis. Put Provider and Local model in vertically stacked native dropdowns. Place the selected model's description and a slim progress bar immediately below. Installed downloads live in a collapsible management list. Appearance and Logs retain their positions.

FORM: Narrow extension of the established Settings surface. No new visual world or concept seed. Signature interaction: the selected model's inline status changes from download progress to Ready, with no modal or navigation change.

FINISH: The v1.1.1 extension is ready to ship at the final review's two-item fix-list scope. The same reviewer confirmed the terms-link affordance and agreement-button contrast issues were resolved, with no visible regressions from the correction batch. This confirmation did not repeat the initial full review. Preserve the established DESIGN.md and .impeccable/design.json for this ordinary extension. No new visual world or shipping raster assets were produced.

## Constraints

- Downloads go to the local app data folder on each computer, outside the shared database.
- LFM2.5 and Gemma require linked terms and an inline Agree and download action on first use. Versioned acceptance is saved on each computer and checked before download or inference. An installed model without accepted terms offers Agree and use.
- Installed and partial models retain per-model Delete on Windows and macOS, with native Cancel and Delete model confirmation. Cancel is the default.
- Updates keep downloaded models. Windows uninstall removes them; Mac users delete them in Settings before removing the app.
- Preserve the user's database and installed Ollama models.
- Verify the renderer headlessly. Do not open the desktop app on the user's PC.

## Finish evidence

The source check covered desktop/renderer/LocalModelsSettings.tsx, the Settings integration in desktop/renderer/App.tsx, desktop/renderer/desktop.css, and the shared palette, button, field, and focus rules in app/globals.css. The controls reuse the incumbent paper and forest variables, native dropdowns, platform font stacks, fine separators, secondary buttons, and compact Settings text. The scoped agreement action uses the existing accent-hover token, and model terms links remain underlined at rest.

Analysis has three providers: OpenAI, Ollama, and Built-in local. desktop/local-model-catalog.ts was checked for the six built-in CPU models, their tiers, descriptions, download sizes, memory guidance, and license metadata:

| Model | Download | Analysis path |
| --- | --- | --- |
| SmolLM2 360M | 271 MB | Basic |
| LFM2.5 350M | 229 MB | Full |
| Gemma 3 270M, Instruct QAT | 241 MB | Full |
| Qwen3 0.6B | 639 MB | Full |
| Qwen3 4B | 2.50 GB | Full |
| Qwen3 8B | 5.03 GB | Full |

OpenAI and configured Ollama retain full analysis. LFM2.5, Gemma, and Qwen receive the complete input and full analysis prompts; only SmolLM2 uses the basic path. The routing was checked in desktop/analysis-routing.ts. These paths describe the implementation, without assessing inference quality.

LFM2.5 shows Model terms; Gemma also shows Use restrictions. Before acceptance, the selected model displays Review model terms to continue and Agree and download. The terms stay linked in the Ready state. desktop/local-model-consent.ts and desktop/main.ts were checked for versioned acceptance in this computer's local settings and the main-process checks before download or inference. The renderer source supplies progress, Pause, Resume, Retry, Ready, and per-model Delete states.

desktop/local-model-removal.ts and the native dialog call in desktop/main.ts were checked for Cancel and Delete model, with Cancel as the default. The Mac branch tells users to delete downloaded models before removing the app.

The initial fresh full review found two material issues: insufficient terms-link affordance and light agreement-button text contrast. One scoped correction added persistent link underlines and used the existing deeper action token. The same reviewer scored both issues resolved and gave a ship disposition at that fix-list scope, with no visible regressions from the batch. Agreement text contrast is 5.92:1 in light appearance and 6.43:1 in dark appearance.

The documentation handoff inspected the final compiled renderer captures:

- [LFM2.5 terms, Windows light](../review/settings-lfm25-350m-terms.png)
- [LFM2.5 Ready, Windows light](../review/settings-lfm25-350m-ready.png)
- [Gemma terms, Mac branch dark simulation](../review/settings-gemma3-270m-terms.png)
- [Gemma Ready, Mac branch dark simulation](../review/settings-gemma3-270m-ready.png)

All captures use headless Chromium on Windows with synthetic state from scripts/qa-renderer.mjs. They are full-page captures at a 1440 by 960 viewport for Windows light and a 790 by 850 viewport for the Mac branch dark simulation. The real desktop app and the user's data were not opened. The Mac captures exercise the platform branch on Windows; native macOS font rendering and window or dialog chrome are outside the UI verdict. Installer lifecycle, native model engine execution, and actual inference quality are also outside that verdict.

The detector ran once on the changed LocalModelsSettings.tsx and App.tsx files and returned an empty findings array. There was no second detector run after the scoped CSS fixes. Detector provenance and pre-existing system documentation drift are recorded in [detector notes](../review/detector-notes.md). The documenter checked the built controls against DESIGN.md and .impeccable/design.json and preserved both files exactly; this ordinary extension does not authorize repairing that drift.

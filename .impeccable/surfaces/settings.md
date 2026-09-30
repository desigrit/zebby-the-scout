# Settings

## Direction contract

THESIS: Choose the analysis source and install a local model without knowing about servers or command line tools. Existing OpenAI and Ollama settings retain their behavior.

OWN-WORLD: Extend the paper surfaces, forest text, native selects, fine rules, and platform fonts in DESIGN.md. Reuse Settings section spacing and button styles.

STORY: Select Built-in local, choose one of four named models, see its size and memory guidance, and watch the download finish. Installed models are reused. Pause, resume, retry, and removal are inline actions.

FIRST VIEWPORT: Keep Database above Analysis. Put Provider and Local model in vertically stacked native dropdowns. Place the selected model's description and a slim progress bar immediately below. Installed downloads live in a collapsible management list. Appearance and Logs retain their positions.

FORM: Narrow extension of the established Settings surface. No new visual world or concept seed. Signature interaction: the selected model's inline status changes from download progress to Ready, with no modal or navigation change.

FINISH: Fresh finish review disposition: ship at UI scope, with no material fixes. The documentation handoff preserves the established DESIGN.md and .impeccable/design.json because this is an ordinary extension. No new visual world or shipping raster assets were produced.

## Constraints

- Downloads go to the local app data folder on each computer, outside the shared database.
- Windows uninstall removes models, while updates keep them. macOS provides a Delete button next to each model with native confirmation. There is no uninstall action in the Mac app.
- Preserve the user's database and installed Ollama models.
- Verify the renderer headlessly. Do not open the desktop app on the user's PC.

## Finish evidence

The source check covered desktop/renderer/LocalModelsSettings.tsx, the Settings integration in desktop/renderer/App.tsx, desktop/renderer/desktop.css, and the shared palette, button, field, and focus rules in app/globals.css. The controls reuse the incumbent paper and forest variables, native dropdowns, platform font stacks, fine separators, secondary buttons, and compact Settings text.

Analysis has three providers: OpenAI, Ollama, and Built-in local. The four built-in downloads are SmolLM2 360M for basic analysis and Qwen3 0.6B, 4B, and 8B for full inference. desktop/local-model-catalog.ts was checked for the names, tiers, descriptions, download sizes, and memory guidance. The renderer source supplies progress, Pause, Resume, Retry, Ready, and per-model Delete states.

desktop/local-model-removal.ts and the native dialog call in desktop/main.ts were checked for Cancel and Delete model, with Cancel as the default. The Mac branch tells users to delete downloaded models before removing the app.

The documentation handoff inspected these compiled renderer captures:

- [Windows download](../review/settings-windows-download.png)
- [Windows ready](../review/settings-windows-ready.png)
- [Windows dark](../review/settings-windows-dark.png)
- [Windows compact](../review/settings-windows-compact.png)
- [Mac ready simulation](../review/settings-mac-ready.png)
- [Mac compact dark simulation](../review/settings-mac-compact-dark.png)

All captures use headless Chromium on Windows with synthetic state. The Mac captures exercise the platform branch on Windows; native macOS font rendering and window or dialog chrome are outside the UI verdict. Installer lifecycle and native model engine execution are also outside that verdict. Detector limits and existing system documentation drift are recorded in [detector notes](../review/detector-notes.md).

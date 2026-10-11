<img src="public/brand-icon.png" width="88" alt="Zebby, a zebra wearing sunglasses" />

# Zebby

**Plan roles. Track applications. Keep your CVs straight.**

I wanted a simple place to prepare for jobs and remember which CV went where. I built Zebby for my fellow job seekers who want the same. The zebra came along for moral support.

**[Download Zebby](https://github.com/desigrit/zebby-the-scout/releases/latest)** · [Getting started](docs/guide.md#install) · [Report an issue](https://github.com/desigrit/zebby-the-scout/issues)

Windows x64 and ARM64 · Apple Silicon Mac · No signup

![Zebby Applications, showing varied daily activity, stacked application statuses and the selected role's details](docs/screenshots/applications.png?v=2.2.2)

<sub>Zebby 2.2.2 with sample applications and analysis results.</sub>

## From a listing to an application

- **Plan:** save a posting, add your CV and overview, then review ATS keywords, resume themes, a match score and suggested wording. Keep several roles in progress.
- **Applications:** track companies, roles, dates, locations, resumes, notes and statuses. Filter the list and see daily activity by status.
- **Saved listings:** keep descriptions for later, even after the posting closes. Paste a copy when a site blocks extraction.
- **Your files:** keep plans, applications and uploaded resumes together in a SQLite file you choose.

![Zebby Plan, showing individual keyword and theme importance, a resume match score and a suggested overview](docs/screenshots/plan.png?v=2.2.2)

Keyword and theme percentages estimate importance to the job. Review AI suggestions before updating your CV.

## Choose how to analyze

| Option | What you use |
| --- | --- |
| **Bring your own key** | Your OpenAI or Anthropic API key. Usage is billed to your provider account. |
| **Run a local model** | Your Ollama server, or a model downloaded in Settings. Downloaded models run on CPU and work offline once installed. |
| **Buy Zebby credits** | Optional credit packs for online analysis with GPT-6.1 Sol or GPT-6 Astra. No API key or Zebby account needed. |

<details>
<summary>Bring your own key: Settings preview</summary>

Choose your provider, model and supported thinking level. Keys stay on this computer.

![Zebby Analysis settings with OpenAI selected, a masked demo key and supported thinking levels](docs/screenshots/settings.png?v=2.2.2)

</details>

### Optional Zebby credits

Choose a pack in Settings and pay in your browser. Pick your model after purchase. Zebby shows the maximum credit cost before each analysis and charges for actual usage.

![Zebby's credit purchase dialog showing current packs and illustrative GPT-6.1 Sol High analysis counts](docs/screenshots/credits.png?v=2.2.2)

Save your recovery code to restore credits later, or connect another computer to the same wallet.

## Keep your data with you

Put your SQLite file in a cloud synced folder if you use more than one PC. **Quit Zebby and let syncing finish before switching computers.** Cloud drives cannot merge simultaneous database edits.

Downloaded-model analysis runs on your computer. Online methods send the selected job and CV content to your chosen provider. API keys, wallet access and downloaded models stay outside the shared database.

Zebby checks for updates and offers **Restart to update** when a verified download is ready. For Windows and Mac installation prompts, see the [installation notes](docs/guide.md#install).

<details>
<summary>Dark mode</summary>

![Zebby's dark Applications workspace with varied daily totals and stacked statuses](docs/screenshots/applications-dark.png?v=2.2.2)

![Zebby's dark Plan workspace with keyword and theme importance](docs/screenshots/plan-dark.png?v=2.2.2)

![Zebby's dark Settings with a masked demo API key](docs/screenshots/settings-dark.png?v=2.2.2)

![Zebby's dark credit purchase dialog](docs/screenshots/credits-dark.png?v=2.2.2)

</details>

## Under the stripes

Electron, React, TypeScript, SQLite and a native inference engine.

[User and build guide](docs/guide.md) · [Host your own credits service](credits-service/README.md) · [Ideas and bugs](https://github.com/desigrit/zebby-the-scout/issues)

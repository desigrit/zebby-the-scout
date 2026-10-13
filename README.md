<img src="public/brand-icon.png" width="88" alt="Zebby, a zebra wearing sunglasses" />

# Zebby

**Plan roles. Track applications. Keep your CVs straight.**

I wanted a simple place to prepare for jobs and remember which CV went where. I built Zebby for my fellow job seekers who want the same. The zebra came along for moral support.

**[Download Zebby](https://github.com/desigrit/zebby-the-scout/releases/latest)** · [Getting started](docs/guide.md#install) · [Report an issue](https://github.com/desigrit/zebby-the-scout/issues)

Windows x64 and ARM64 · Apple Silicon Mac · No signup

![Zebby Applications, showing varied daily activity, stacked application statuses and the selected role's details](docs/screenshots/applications.png?v=2.3.8)

<sub>Current Zebby screens with sample applications and analysis results.</sub>

## From a listing to an application

[![Zebby screens: OOBE, Plan mode, New application, Applications stats and Settings, connected by arrows.](docs/screenshots/screen-flow-overview.png)](docs/screenshots/screen-flow.png)

<sub>[Explore the full-resolution flow](docs/screenshots/screen-flow.png) · [Browse individual screens](docs/screenshots/README.md)</sub>

- **Plan:** save a posting, add your resume and current summary, then review ATS keywords, resume themes, a match score and suggested edits. **Move to Applied** carries the details and existing score into Applications, without another analysis.
- **Applications:** track companies, roles, dates, locations, resumes, notes and statuses. Filter the list, see daily activity by status, and celebrate an offer with Zebby confetti.
- **Job descriptions:** keep the extracted or pasted description, and edit it as needed. It stays available after the posting closes.
- **Your files:** keep plans, applications and uploaded resumes together in a SQLite file you choose.

![Zebby Plan, showing individual keyword and theme importance, a resume match score and suggested summary edits](docs/screenshots/plan.png?v=2.3.8)

Keyword and theme percentages estimate importance to the job. Review AI suggestions before updating your CV.

## Choose how to analyze

| Option | What you use |
| --- | --- |
| **Bring your own key** | Your OpenAI or Anthropic API key. Usage is billed to your provider account. |
| **Run a local model** | Your Ollama server, or a model downloaded in Settings. Downloaded models run on CPU and work offline once installed. |
| **Buy Zebby credits** | Optional credit packs for online analysis with GPT-6.1 Sol, GPT-6 Luna or GPT-6 Astra. No API key or Zebby account needed. |

<details>
<summary>Bring your own key: Settings preview</summary>

Choose your provider, model and supported thinking level. Keys stay on this computer.

![Zebby Analysis settings with OpenAI selected, a masked demo key and supported thinking levels](docs/screenshots/settings.png?v=2.3.8)

</details>

## Keep your data with you

Put your SQLite file in a cloud synced folder if you use more than one PC. **Quit Zebby and let syncing finish before switching computers.** Cloud drives cannot merge simultaneous database edits.

Downloaded-model analysis runs on your computer. Online methods send the selected job and CV content to your chosen provider. API keys, wallet access and downloaded models stay outside the shared database.

Zebby checks for updates and offers **Restart to update** when a verified download is ready. For Windows and Mac installation prompts, see the [installation notes](docs/guide.md#install).

<details>
<summary>Dark mode</summary>

![Zebby's dark Applications workspace with varied daily totals and stacked statuses](docs/screenshots/applications-dark.png?v=2.3.8)

![Zebby's dark Plan workspace with keyword and theme importance](docs/screenshots/plan-dark.png?v=2.3.8)

![Zebby's dark Settings with a masked demo API key](docs/screenshots/settings-dark.png?v=2.3.8)

![Zebby's dark credit purchase dialog](docs/screenshots/credits-dark.png?v=2.3.8)

</details>

## Under the stripes

Electron, React, TypeScript, SQLite and a native inference engine.

[User and build guide](docs/guide.md) · [Host your own credits service](credits-service/README.md) · [Ideas and bugs](https://github.com/desigrit/zebby-the-scout/issues)

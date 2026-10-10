<img src="public/brand-icon.png" width="92" alt="Zebby, a zebra wearing sunglasses" />

# Zebby

**Your job search sidekick. Excellent stripes. Questionable sunglasses.**

I wanted to build something useful for my fellow peers: a simple place to prepare for roles, keep track of applications, and stop wondering which resume went where. Meet Zebby. Zebby's cool, and local tracking and analysis don't require an account.

## Get Zebby

[Download for Windows or Apple Silicon Mac](https://github.com/desigrit/zebby-the-scout/releases/latest). Choose the Windows x64 or ARM64 `.exe`, or the Apple Silicon `.dmg`. No ZIP to unpack, no account to create.

These builds are unsigned. See the [installation notes](docs/guide.md#install) if your computer asks you to approve the app.

From version 1.5.0, Zebby checks for new releases. Click **Update**, keep working while it downloads, then **Restart to update**. Your database, settings, and downloaded models stay with you.

## A little scout for the whole search

- **Plan a role.** Paste a listing, attach a resume, and get ATS keywords, resume themes, a match score with an explanation, and a CV overview that keeps your writing style. Keyword and theme percentages estimate importance to the job.
- **Track the application.** Save the company, role, locations, status, resume, and notes. Details are optional. A 30-day chart shows how your search is moving.
- **Keep the receipts.** Zebby saves a readable listing copy when the site allows it, so a closed posting does not have to disappear. You can paste it yourself, too.
- **Pick your AI.** Use your own OpenAI or Anthropic key, an Ollama server, or a downloaded CPU model. The smallest options need no GPU. Zebby credits provide another online option once the payment service is connected. Review suggestions before using them, especially with smaller models.
- **Take your data with you.** Applications, plans, and resumes live in a SQLite file you choose. Put it in a cloud synced folder to share it between your PCs. Quit Zebby and let syncing finish before switching computers.

Screenshots use sample data from Zebby 1.6.7.

### Applications, without the spreadsheet shuffle

![Zebby's Applications workspace with sample roles and a collapsed score explanation in the selected role inspector](docs/screenshots/applications.png)

### A plan for the next role

![Zebby's Plan workspace with editable ATS keywords, resume themes, and a resume match score](docs/screenshots/plan.png)

### Settings, your way

![Zebby's Settings page with sample database details and Ollama analysis selected](docs/screenshots/settings.png)

<details>
<summary>See Zebby in dark mode</summary>

#### Applications

![Zebby's dark Applications workspace with sample roles and a collapsed score explanation](docs/screenshots/applications-dark.png)

#### Plan

![Zebby's dark Plan workspace with editable ATS keywords, resume themes, and a resume match score](docs/screenshots/plan-dark.png)

#### Settings

![Zebby's dark Settings page with sample database details and Ollama analysis selected](docs/screenshots/settings-dark.png)

</details>

Built-in analysis stays on your computer. Choose an Ollama server, your own OpenAI or Anthropic key, or Zebby credits for online analysis. An account is only needed for credits. Paid checkout requires a configured service and is not active in unconfigured builds. API keys and downloaded models stay on each computer, outside the shared database. Zebby detects changes to the shared file and keeps an original copy before upgrading its database format. A cloud drive cannot merge simultaneous SQLite edits.

## Peek under the stripes

Built with Electron, React, TypeScript, SQLite, and a small native inference engine. For setup, model terms, and build instructions, see the [full guide](docs/guide.md). To connect paid analysis in Stripe test mode, see the [credits service setup](credits-service/README.md). Ideas and bug reports are welcome in [Issues](https://github.com/desigrit/zebby-the-scout/issues).

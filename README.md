<img src="public/brand-icon.png" width="88" alt="Zebby, a zebra wearing sunglasses" />

# Zebby

**Plan roles. Track applications. Keep your CVs straight.**

I built Zebby while organizing my own job search: reviewing roles, deciding what my resume needed, and remembering which version went where. I wanted something my peers could use without having to set up an AI toolchain. The zebra came along for moral support.

Below are the [product decisions](#product-decisions), [how I worked with AI](#working-with-ai), and [what I'd do next](#what-id-do-next).

**[Download Zebby](https://github.com/desigrit/zebby-the-scout/releases/latest)** · [Getting started](docs/guide.md#install) · [Report an issue](https://github.com/desigrit/zebby-the-scout/issues)

[![Zebby's Plan and Applications screens, showing resume matching, ATS keywords and application tracking](docs/screenshots/zebby-collage.jpg)](docs/screenshots/zebby-collage.png)

## What's included

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
| **Buy Zebby credits** | Online analysis with GPT-6.1 Sol or GPT-6 Luna. Packs of $20 or more also unlock GPT-6 Astra. No API key or Zebby account needed. |

<details>
<summary>Bring your own key: Settings preview</summary>

Choose your provider, model and supported thinking level. Keys stay on this computer.

![Zebby Analysis settings with OpenAI selected, a masked demo key and supported thinking levels](docs/screenshots/settings.png?v=2.3.8)

</details>

## Product decisions

### Give each score a specific meaning

In one comparison, a larger local model gave my resume a 62% match and a small model gave it 90% for the same role. That was enough to question the score. It wasn't enough to establish which model was right.

I had already made **importance to the job** separate from **evidence in the resume**. An essential requirement should still appear in the keyword list when the resume doesn't demonstrate it. The match explanation has to identify supporting experience and gaps. Missing evidence should not become a claim that the person lacks the skill. The score disagreement showed how much evaluation was still needed beyond those instructions.

I also asked for a rationale when a summary rewrite returned my original text. Keeping it can be a valid result; the app should explain why. The analysis instructions prohibit inventing experience to make a rewrite fit. These are constraints on the model, not a guarantee of accuracy.

The smallest model has an explicitly narrower keyword-coverage mode. Full analyses still depend on model capability, and their scores aren't calibrated across models. [Analysis contract](desktop/analysis-contracts.ts) · [Compact-model behavior](desktop/basic-local-analysis.ts)

### Fix the credit reservation before changing the model

I hit a confusing failure myself: roughly 90% of my credits remained, but Astra couldn't start. The service required enough balance to cover a large maximum response. The purchase page's illustrative analysis count made this look like a limit on runs.

I wanted to preserve the selected model and thinking level. We changed credit quotes to count the complete input, including instructions and the response schema, and use separate output budgets for a match check and a full Plan. Actual usage is charged after a successful analysis; unused reservations are released.

There is still a tradeoff: enough credit must be available before a request starts, and a response can exhaust its output budget. Those failures now have explicit handling. A $20-or-higher purchase unlocks Astra, with that requirement visible before purchase and in Settings. [Budget and settlement tests](tests/credit-budgets.test.mjs)

### Removing signup moved complexity into recovery

I initially considered login for paid analysis, then asked whether people could buy credits without creating another account. We shipped a guest wallet with device credentials, a recovery code and temporary codes for connecting another computer.

That removes a step at checkout, but puts more responsibility on recovery. Lose every connected device and the recovery code, and automatic recovery is unavailable. A failed connection must preserve existing access, and a retry must not charge twice. Wallet credentials stay outside the applications database, so sharing that file doesn't share the ability to spend credits. [Wallet and recovery tests](tests/guest-wallets.test.mjs)

### Let people keep working while inference runs

Early analysis flows locked the window, and navigating away could stop a match calculation. I asked for a different boundary: protect the listing being analyzed while letting me work on another one.

That required analysis to outlive the page displaying it. Results remain attached to their original record, duplicate requests are prevented, and a late result cannot overwrite a changed Plan. Cancellation also has a boundary: once saving has committed, the app delivers that result.

The same reasoning led to **Move to Applied**. Changing a job's workflow state should carry its existing score and explanation forward without charging for the same work again. [Background-analysis tests](tests/background-analysis.test.mjs) · [Plan transfer](desktop/store.ts)

## Working with AI

I built Zebby with Codex, which wrote much of the implementation and test code. I brought the workflow, used the builds, and kept changing the brief when the behavior didn't hold up.

For the redesign, I asked for several interactive concepts before implementation. I took the Applications and Settings structure from one and the Plan structure from another. I kept the existing New Application form because the cleaner concept had dropped useful fields. A better-looking mockup wasn't sufficient reason to lose functionality.

The feedback became specific acceptance criteria: moving between pages must not cancel paid work; an unchanged summary needs an explanation; moving a Plan to Applied must preserve its analysis. I also challenged the initial 20,000-input-token pricing assumption and asked for a baseline from my own saved jobs and resume. The resulting estimates distinguish source text from an allowance for reasoning tokens, which the saved records didn't contain.

## What I'd do next

I'd start with a small, consented evaluation set of resumes and roles, with human judgments about evidence and gaps. I'd compare unsupported claims, missed requirements and run-to-run variation across models. The 62%/90% example is a reason to do that work, not a benchmark result.

I'd also test recovery and insufficient-credit flows with people who didn't build the app. The current tests check behavior and data preservation; they don't establish whether someone understands the next step or finds the advice useful.

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

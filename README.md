<img src="public/brand-icon.png" width="88" alt="Zebby, a zebra wearing sunglasses" />

# Zebby

**Plan roles. Track applications. Keep your CVs straight.**

I built Zebby while organizing my own job search: reviewing roles, deciding what my resume needed, and remembering which version went where. I wanted something my peers could use without a complicated AI setup. The zebra came along for moral support.

Below are the [design exploration and selection](#choosing-a-design-direction), [product decisions](#product-decisions), [how I worked with AI](#working-with-ai), [what I pushed back on](#what-i-pushed-back-on), and [what I'd do next](#what-id-do-next).

**[Download Zebby](https://github.com/desigrit/zebby-the-scout/releases/latest)** · [Getting started](docs/guide.md#install) · [Report an issue](https://github.com/desigrit/zebby-the-scout/issues)

[![Zebby's Plan and Applications screens, showing resume matching, ATS keywords and application tracking](docs/screenshots/zebby-collage.jpg)](docs/screenshots/zebby-collage.png)

## What's included

[![Zebby screens: OOBE, Plan mode, New application, Applications stats and Settings, connected by arrows.](docs/screenshots/screen-flow-overview.png)](docs/screenshots/screen-flow.png)

<sub>[Explore the full-resolution flow](docs/screenshots/screen-flow.png) · [Browse individual screens](docs/screenshots/README.md)</sub>

- **Plan:** save a posting, add your resume and current summary, then review ATS keywords, resume themes, a match score and suggested edits. **Move to Applied** carries the details and existing score into Applications, without another analysis.
- **Applications:** track companies, roles, dates, locations, resumes, notes and statuses. Filter the list, see daily activity by status, and celebrate an offer with Zebby confetti.
- **Job descriptions:** keep the extracted or pasted description, and edit it as needed. It stays available after the posting closes.
- **Your files:** keep plans, applications and uploaded resumes together in a database file you choose.

![Zebby Plan, showing individual keyword and theme importance, a resume match score and suggested summary edits](docs/screenshots/plan.png?v=2.3.8)

Keyword and theme percentages estimate importance to the job. Review AI suggestions before updating your CV.

## Choose how to analyze

| Option | What you use |
| --- | --- |
| **Bring your own key** | Your OpenAI or Anthropic API key. Usage is billed to your provider account. |
| **Run a local model** | Your Ollama server, or a model downloaded in Settings. Zebby recommends models for your hardware and uses Vulkan on Windows x64 or Metal on Apple Silicon, with CPU fallback. Windows ARM64 uses the CPU. Downloaded models work offline. |
| **Buy Zebby credits** | Online analysis with GPT-6.1 Sol or GPT-6 Luna. Packs of $20 or more also unlock GPT-6 Astra. No API key or Zebby account needed. |

<details>
<summary>Bring your own key: Settings preview</summary>

Choose your provider, model and supported thinking level. Keys stay on this computer.

![Zebby Analysis settings with OpenAI selected, a masked demo key and supported thinking levels](docs/screenshots/settings.png?v=2.3.8)

</details>

## Choosing a design direction

**[Explore the nine interactive design directions](https://desigrit.github.io/zebby-the-scout/design-study/)** to compare Plan, Applications and Settings, including light and dark appearances and different window sizes.

- **Compare different workflows as well as colors.** I asked for warm, crisp and balanced options, and the study explored layouts including a list with an inspector, a comparison table, a hiring-stage board and a guided Plan flow. Each made a different compromise: tables supported dense comparison, boards showed stages but fewer records, and a persistent inspector used more horizontal space.

- **Combine the parts that fit.** I selected **Ember's palette across all pages**, **Ember's Applications and Settings**, and **Rosewood's document-style Plan in Ember colors**. Applications kept a compact list with role details alongside it, while Plan used a document structure for preparing a resume. I did not treat a concept as an indivisible package.

- **Reject a cleaner mockup when it loses capability.** Ember's New Application concept omitted fields and features I already used. I asked to retain the existing form. For Plan, I kept the existing ATS keywords and resume themes side by side, with simple vertical lists, scores and copy controls, while removing unnecessary boxes.

- **Choose review fixes individually.** I accepted the copy changes and protection for a Plan while analysis was running, with cancellation available. I also asked to reassess the UX after the redesign instead of treating every finding in the earlier review as a requirement.

The linked study preserves the original alternatives and review, with a note explaining the later selection. Its data and model responses are simulated; it shows the decisions behind the redesign, not a measured usability improvement. The [current design specification](DESIGN.md) records the implementation that followed.

## Product decisions

### Explain what a score means

In one comparison, two local models gave the same resume a **62% and a 90% match** for the same job. That made me question the score. It did not tell me which model was right.

I separated **what the job asks for** from **what the resume supports**. An important requirement should still appear when the resume does not cover it. Missing evidence means the document needs attention, not necessarily that the person lacks the skill.

Scores are rough guides, not an employer's screening score or a prediction of getting hired. Different models have not been checked against a shared standard. [Analysis rules](desktop/analysis-contracts.ts)

### Give a smaller model a smaller job

The smallest local model, SmolLM2, offers a lighter option for modest computers. Code checks which job-related terms appear in the resume; the model can suggest a limited wording edit. This mode does not assess the depth of someone's experience.

That makes offline use more accessible, but the advice is shallower. Its keyword score does not mean the same thing as a full resume assessment, and the result needs to say so. Other models keep their full analysis. [How the smaller mode works](desktop/basic-local-analysis.ts)

### A good rewrite can leave the text alone

When my summary came back unchanged, I asked for an explanation. New wording is not automatically better wording.

The model is instructed to preserve the person's voice and avoid inventing achievements or credentials. The smaller mode also checks its suggestions and can keep the original. Those checks can reject useful edits and cannot guarantee that every claim is true. [Rewrite rules](desktop/analysis-contracts.ts)

### Fix the credit estimate before changing the model

I once had roughly **90% of my credits left**, but Astra could not start. The app was setting aside enough credits for a much longer answer than the task needed.

I wanted to keep my chosen model and thinking level. We changed the estimate to include everything sent to the model and allow different answer lengths for a quick match check and a full Plan. After a successful analysis, the app charges for actual use and releases the unused amount.

There is still a tradeoff: enough credit must be available upfront, and an answer can reach its length limit. I also chose to unlock Astra with a purchase of $20 or more and show that condition before purchase and in Settings. [Credit checks](tests/credit-budgets.test.mjs)

### Make signup optional, with a clear recovery cost

I asked whether people could buy credits without another account. Zebby uses a wallet with a recovery code and temporary codes for connecting another computer.

Checkout has fewer steps, but losing every connected device and the recovery code means automatic recovery is unavailable. Retries must not charge twice. Wallet access stays outside the shared applications file. [Recovery checks](tests/guest-wallets.test.mjs)

### Let people keep working during analysis

I wanted to work on another job while an analysis ran. Results now stay with the original job, and a late answer cannot overwrite a Plan that has changed. If saving has already finished when someone cancels, the app keeps the saved result.

I also asked for **Move to Applied** to carry the existing score and explanation forward. Moving a job between stages should not require paying for the same analysis again. [Background analysis checks](tests/background-analysis.test.mjs) · [Moving a Plan to Applications](desktop/store.ts)

## Working with AI

Codex wrote much of the code and tests. I defined the workflow, used the builds in my own job search, and turned problems into specific requests.

The [design study](#choosing-a-design-direction) records the alternatives I compared and the parts I retained. For the AI advice, I decided what each result should explain, what evidence it could use, and when leaving a summary alone was acceptable.

Software tests can show that a result reaches the right job and is charged once. Human review is still needed to judge whether the advice is accurate and useful.

## What I pushed back on

- **A cleaner design that removed useful information.** I kept fields that the New Application form still needed.
- **Pricing based on an assumed document size.** I asked for estimates based on my saved jobs and resume. The cost of the model's reasoning still needed a separate estimate.
- **An unchanged summary without an explanation.** I wanted people to understand whether their text was already suitable or something had failed.
- **Paying again when moving a Plan to Applications.** I wanted the analysis to move with the job.

## What I'd do next

I would compare advice with human reviews of resumes and roles shared with permission. I would check missed requirements, invented claims, useful edits and how much answers change across repeated runs. Some examples would be kept aside to test changes, rather than used to tune them.

I would assess keyword coverage separately from full analysis, then test whether explanations help people more than the headline percentage. That could change whether Zebby should show a score at all.

I would also watch new users recover a wallet or handle insufficient credits. Passing software tests does not show whether people understand what to do next.

## Keep your data with you

Put your database file in a cloud synced folder if you use more than one PC. **Quit Zebby and let syncing finish before switching computers.** Cloud drives cannot merge simultaneous database edits.

Downloaded-model analysis runs on your computer. Online methods send the selected job and CV content to your chosen provider. API keys, wallet access and downloaded models stay outside the shared database.

Zebby checks for updates and offers **Restart to update** when a verified download is ready. For Windows and Mac installation prompts, see the [installation notes](docs/guide.md#install).

<details>
<summary>Dark mode</summary>

![Zebby's dark Applications workspace with varied daily totals and stacked statuses](docs/screenshots/applications-dark.png?v=2.3.8)

![Zebby's dark Plan workspace with keyword and theme importance](docs/screenshots/plan-dark.png?v=2.3.8)

![Zebby's dark Settings with a masked demo API key](docs/screenshots/settings-dark.png?v=2.3.8)

![Zebby's dark credit purchase dialog](docs/screenshots/credits-dark.png?v=2.3.8)

</details>

## Android preview

A native Android companion is being developed in this repository, using Kotlin and Jetpack Compose. It includes Plan, Applications, online analysis and explicit database transfer. Models that run directly on the phone come later.

[Android setup, build and sync guide](android/README.md)

## Under the stripes

Electron, React, TypeScript, SQLite and a native inference engine.

[User and build guide](docs/guide.md) · [Host your own credits service](credits-service/README.md) · [Ideas and bugs](https://github.com/desigrit/zebby-the-scout/issues)

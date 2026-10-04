# Analysis and credits

Date: 2026-10-04

## Surface strategy

TASK: Choose a usable analysis method, complete focused setup, or purchase credits and confirm the maximum cost of a paid analysis.

FREQUENCY: Method setup is occasional. Analysis and wallet feedback recur across Plans and resume matches.

INFORMATION: Five methods, selected method prerequisites, four packs, email code, checkout state, model choice after purchase, maximum quote or free result recovery, available credits, and used credits.

STATES: Method choice; local or key setup; service unavailable; pack selected; email/code; external checkout waiting/expired/test; purchase confirmed; quote loading/expired/insufficient balance; running or completed result recovery; wallet current or saved; analysis busy/cancelled/failed/completed.

SUCCESS: The user reaches the selected provider, understands the maximum paid credit use before starting, and can recover an already paid result without a second charge.

CONSTRAINTS: Keep every Plan and Application editing field, local and Qwen inference, model terms and download controls, native controls, platform fonts, arrow cursor, the exact zebra asset, and the pinned Ember world. No Zebby login is needed for local models or personal keys. Application Save cannot silently start paid match analysis.

## Direction contract

MODE: Operate, ordinary extension of Ember.

THESIS: Make the local choice direct and paid convenience straightforward.

OWN-WORLD: Incumbent Ember warm neutral canvas, restrained terracotta actions, quiet selection washes, the unchanged zebra, native platform typography, native dropdowns and modal behavior, and arrow cursor for controls.

STORY: Choose a method, finish focused setup, use email only for paid credits, complete external checkout, choose a model after purchase, review a maximum quote or recover the paid result for free, then receive wallet feedback.

FIRST VIEWPORT: A native modal shows four method tiles in two columns and a full-width Buy credits tile. The dialog body scrolls independently with persistent header and footer actions. Narrow windows adapt the choice grid.

FORM: The approved Quick choice A concept translated into Ember and the incumbent Plan and Application editors. The separate prototype is a direction reference, not current product verification.

## Methods and purchase

Initial setup offers Local server (Ollama), Download a model, OpenAI API key, Anthropic API key, and Buy credits. Focused setup reuses the Settings controls. Personal-key model choices are limited to that provider. Native radio inputs retain method and pack selection, visible focus, and readable selection feedback. The modal restores the opener's focus on close; reduced motion removes its entrance animation.

The pricing scene shows four USD packs: $5 for 500 credits, $20 for 3,000, $50 for 8,000, and $100 for 16,000. Its illustrative GPT-6 Luna counts are 100, 600, 1,600, and 3,200 analyses, assuming 20,000 input and 6,000 output tokens each. The assumption is visible. Counts vary with job length and model choice. There is no model dropdown in pricing.

Paid users enter an email code. Secure storage remembers the session per computer; without it, sign-in lasts for the session. Checkout opens in the external browser. The waiting scene supports explicit payment checks and expired-checkout retry. Test checkout visibly says no real payment is taken. Only confirmed payment reveals the post-purchase model step.

The paid native model dropdown offers GPT-6 Luna, GPT-6.1 Sol, GPT-6 Astra, Claude Haiku 4.5, Claude Sonnet 5.5, and Claude Opus 5.5. This is the checked-in catalog, not a claim of verified hosted model access.

## Quotes, recovery, and wallet

Every new paid Plan or match analysis shows Maximum for this analysis, available credits, and the provider receiving the source content. A model change requests a new quote. Insufficient funds leads to Add credits; an expired quote is refreshed. The service reserves the accepted maximum, charges reported actual usage, and returns unused reserved credits. Failed or cancelled analyses release reservations.

A lost paid reply retains its request identity so the original result can be recovered without another charge. The scene shows No additional credits and either Check again for pending work or Recover result when ready. Recovery remains available with zero or negative balance. Main clears recovery metadata only after local persistence. The server retention window is 24 hours; encrypted local settings retain restart recovery metadata when secure storage is available.

The wallet shows available balance after reservations and total used credits. Settings also includes email, reserved usage, model selection after purchase, Refresh balance, Sign out, and collapsed Recent usage. The sidebar mirrors available and used amounts. Explicitly collapsed navigation opens a compact popover. Failed refreshes retain labeled saved balances. Replies from a former account cannot replace the current account's wallet.

Saving an application retains the existing form and data behavior. Paid match analysis requires its existing explicit action and quote; it cannot run silently after Save. Ready local and personal-key methods retain their prior automatic match path. Plan keeps Analyze below Your CV and Save outside scrolling.

## Service availability

No real service or Stripe account is connected. The desktop URL defaults to empty; checkout is disabled with an honest unavailable message. The prepared [service guide](../../credits-service/README.md) covers email accounts, the ledger, Stripe test mode, hosting, and desktop connection. Service balances are separate from the selected application SQLite database. No real payment was taken during implementation.

## Finish evidence and limits

Source evidence checked: desktop/renderer/AnalysisFlow.tsx, AnalysisSettings.tsx, App.tsx, ApplicationDashboard.tsx, and desktop.css; shared/online-models.ts; sampled desktop/credits-client.ts and desktop/main.ts; credits-service/README.md; and tests/paid-analysis.test.mjs. The incumbent DESIGN.md and .impeccable/design.json were checked and preserved. This feature does not establish a new global palette, typography scale, shape scale, or motion rule.

The final combined log, work/paid-implementation-final-tests.log, reports 91 passing Node tests and zero failures. Supplied final lint, TypeScript without incremental caching, desktop build, and service build passed. The independent reviewer separately passed all 19 paid tests and TypeScript. The scoped review in work/paid-implementation-finish-review.md returns ship for all three scored corrections: paid-response recovery, equal-sized partial refund duplication, and stale account wallet responses. These checks were not rerun by the documenter.

No app, Electron, browser, Playwright, or desktop control was used for this documentation pass, and no user profile or database was opened. No current screenshots exist for this feature. Previous public captures apply only to their historical releases. Real database concurrency, email delivery, Stripe webhook delivery, provider model access, Docker deployment, installers, physical Mac behavior, and current native visual rendering remain unverified.

One supplied static detector snapshot, work/paid-design-detect.json, was read. Its new thick side accent has been removed in current source. Existing sidebar layout transition warnings remain pinned and unchanged. Feature-specific dialog type, radius, shadow, and backdrop literals produced advisories; they were not promoted into the global system or visually certified. The detector was not rerun during documentation. Existing .impeccable/critique artifacts were preserved.

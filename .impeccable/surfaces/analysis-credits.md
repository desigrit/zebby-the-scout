# Analysis and credits

Date: 2026-10-10

## Surface strategy

TASK: Choose a usable analysis method, complete focused setup, or purchase credits and confirm the maximum cost of a paid analysis.

FREQUENCY: Method setup is occasional. Analysis and wallet feedback recur across Plans and resume matches.

INFORMATION: Five methods, selected method prerequisites, four packs, guest checkout, model choice after purchase, maximum quote or free result recovery, available and used credits, recovery-code export and restoration, computer pairing, and connected devices.

STATES: Method choice; local or key setup; service unavailable; pack selected; external checkout waiting/expired/test; purchase confirmed; recovery-save/cancel/replacement; pairing active/expired/used/cancelled; restore/connect editor and errors; quote loading/expired/insufficient balance; result recovery; wallet current or saved; analysis busy/cancelled/failed/completed.

SUCCESS: The user reaches the selected provider, understands the maximum paid credit use before starting, and can recover an already paid result without a second charge.

CONSTRAINTS: Keep every Plan and Application editing field, local and Qwen inference, model terms and download controls, native controls, platform fonts, arrow cursor, the exact zebra asset, and the pinned Ember world. No Zebby login is needed for local models or personal keys. Application Save cannot silently start paid match analysis.

## Direction contract

MODE: Operate, ordinary extension of Ember.

THESIS: Make the local choice direct and paid convenience straightforward.

OWN-WORLD: Incumbent Ember warm neutral canvas, restrained terracotta actions, quiet selection washes, the unchanged zebra, native platform typography, native dropdowns and modal behavior, and arrow cursor for controls.

STORY: Choose a method, finish focused setup, complete guest checkout in an external browser, choose a model after purchase, save a recovery code, pair another computer when needed, review a maximum quote or recover the paid result for free, then receive wallet feedback.

FIRST VIEWPORT: A native modal shows four method tiles in two columns and a full-width Buy credits tile. The dialog body scrolls independently with persistent header and footer actions. Narrow windows adapt the choice grid.

FORM: The approved Quick choice A concept translated into Ember and the incumbent Plan and Application editors. The separate prototype is a direction reference, not current product verification.

## Methods and purchase

Initial setup offers Local server (Ollama), Download a model, OpenAI API key, Anthropic API key, and Buy credits. Focused setup reuses the Settings controls. Personal-key model choices are limited to that provider. Native radio inputs retain method and pack selection, visible focus, and readable selection feedback. The modal restores the opener's focus on close; reduced motion removes its entrance animation.

The pricing scene shows four USD packs: $5 for 500 credits, $20 for 3,000, $50 for 8,000, and $100 for 16,000. Its illustrative GPT-6 Luna counts are 90, 540, 1,450, and 2,900 analyses, assuming 20,000 input and 6,000 output tokens each, including cache-write charges. The assumption is visible. Counts vary with cache hits, job length, and model choice. There is no model dropdown in pricing.

Paid credits use a guest wallet, with no email-code or signup step. Secure storage keeps an independent device credential per computer and is required before checkout. Checkout opens in the external browser. The waiting scene supports explicit payment checks and expired-checkout retry. Test checkout visibly says no real payment is taken. Only confirmed payment reveals the post-purchase model step and a quiet Save recovery code prompt.

The paid native model dropdown offers GPT-6 Luna, GPT-6.1 Sol, GPT-6 Astra, Claude Haiku 4.5, Claude Sonnet 5.5, and Claude Opus 5.5. This is the checked-in catalog, not a claim of verified hosted model access.

## Quotes, recovery, and wallet

Every new paid Plan or match analysis shows Maximum for this analysis, available credits, and the provider receiving the source content. A model change requests a new quote. Insufficient funds leads to Add credits; an expired quote is refreshed. The service reserves the accepted maximum, charges reported actual usage, and returns unused reserved credits. Failed or cancelled analyses release reservations.

A lost paid reply retains its request identity so the original result can be recovered without another charge. The scene shows No additional credits and either Check again for pending work or Recover result when ready. Recovery remains available with zero or negative balance. Main clears recovery metadata only after local persistence. The server retention window is 24 hours; encrypted local settings retain restart recovery metadata when secure storage is available.

The wallet shows available balance after reservations and total used credits. Settings includes reserved usage, model selection after purchase, Refresh balance, recovery-code export, restoration, ten-minute single-use pairing, and collapsed Connected computers, Recovery options, and Recent usage. There is no account label or Sign out action. Native confirmations protect code replacement, wallet switching and disconnection. Restoring and connecting use focused inline forms, with Enter to submit, Escape/Cancel to clear the code, and focus restored to the opener. The sidebar mirrors available and used amounts after a purchase. Failed refreshes retain labeled saved balances. Replies from a former wallet cannot replace the current wallet.

Saving an application retains the existing form and data behavior. Paid match analysis requires its existing explicit action and quote; it cannot run silently after Save. Ready local and personal-key methods retain their prior automatic match path. Plan keeps Analyze below Your CV and Save outside scrolling.

## Service availability

No real service or Stripe account is connected. The desktop URL defaults to empty; checkout is disabled with an honest unavailable message. The prepared [service guide](../../credits-service/README.md) covers the PostgreSQL ledger, guest wallet access, Stripe test mode, hosting, and desktop connection. Supabase email setup and SMTP are not needed. Service balances are separate from the selected application SQLite database. No real payment was taken during implementation.

## Finish evidence and limits

Source evidence checked: desktop/renderer/AnalysisFlow.tsx, AnalysisSettings.tsx, App.tsx, ApplicationDashboard.tsx, and desktop.css; shared/online-models.ts; sampled desktop/credits-client.ts and desktop/main.ts; credits-service/README.md; and tests/paid-analysis.test.mjs. The incumbent DESIGN.md and .impeccable/design.json were checked and preserved. This feature does not establish a new global palette, typography scale, shape scale, or motion rule.

The final combined log, work/paid-implementation-final-tests.log, reports 91 passing Node tests and zero failures. Supplied final lint, TypeScript without incremental caching, desktop build, and service build passed. The independent reviewer separately passed all 19 paid tests and TypeScript. The scoped review in work/paid-implementation-finish-review.md returns ship for all three scored corrections: paid-response recovery, equal-sized partial refund duplication, and stale account wallet responses. These checks were not rerun by the documenter.

No app, Electron, browser, Playwright, or desktop control was used for this documentation pass, and no user profile or database was opened. No current screenshots exist for this feature. Previous public captures apply only to their historical releases. Real database concurrency, email delivery, Stripe webhook delivery, provider model access, Docker deployment, installers, physical Mac behavior, and current native visual rendering remain unverified.

One supplied static detector snapshot, work/paid-design-detect.json, was read. Its new thick side accent has been removed in current source. Existing sidebar layout transition warnings remain pinned and unchanged. Feature-specific dialog type, radius, shadow, and backdrop literals produced advisories; they were not promoted into the global system or visually certified. The detector was not rerun during documentation. Existing .impeccable/critique artifacts were preserved.

## Release verification, 2026-10-09

Zebby 1.7.0 ships this prepared integration from source commit 57b91eff1a65b950a928b45ce55f53f541015a9b. The [release build](https://github.com/desigrit/zebby-the-scout/actions/runs/38027754793) passed on Windows x64 and macOS Apple Silicon, then produced Windows x64, Windows ARM64, and Mac ARM64 installers. All three direct release downloads returned HTTP 200, with uploaded state and GitHub SHA-256 digests verified.

The local suite passed 108 tests, including 22 payments tests. TypeScript, lint, desktop build, and service build passed. GitHub also passed native Windows editing/cancellation checks, compiled renderer checks on both hosts, packaged local-model checks, self-update checks, and the Mac distribution first-launch check. ARM64 Windows packaging was verified; execution on physical Windows ARM64 hardware was not tested.

The renderer checks now exercise all five first-use methods, four pricing choices without early model selection, unavailable checkout, email delivery failure and retry, synthetic payment confirmation, post-purchase model choice, credit quotes, sidebar balances, Settings, sign-out, and focus restoration. Captures were reviewed in wide light and narrow dark layouts. A dialog positioning issue was corrected with native modal centering, and geometry checks protect it.

No app or browser was launched on the user's PC, and no personal database, profile, or resume was accessed. All screen checks used synthetic data on GitHub runners. Stripe, Supabase, and a public service endpoint remain unconnected, so checkout stays disabled. Real email delivery, hosted webhooks, live provider calls, and deployed Docker behavior still require setup and verification.

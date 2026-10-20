# Analysis and credits

Date: 2026-10-20

## Surface strategy

TASK: Choose a usable analysis method, complete focused setup, or purchase credits and confirm the maximum cost of a paid analysis.

FREQUENCY: Method setup is occasional. Analysis and wallet feedback recur across Plans and resume matches.

INFORMATION: Five methods, selected method prerequisites, four packs, guest checkout, model choice after purchase, internal credit checks or free result recovery, available/used/total credits, percentage remaining in Settings and the sidebar, and restoration/connection links. Learn more explains recovery and pairing and contains wallet management and recent usage.

STATES: Method choice; local or key setup; pack selected; checkout connection error; external checkout waiting/expired/test; purchase confirmed; credits empty/loading/funded; About credits open/closed; recovery-save/cancel/replacement; pairing active/expired/used/cancelled; restore/connect editor and errors; credit preparation/expired estimate/insufficient balance; result recovery; wallet current or saved; analysis busy/cancelled/failed/completed.

SUCCESS: The user reaches the selected provider, understands the maximum paid credit use before starting, and can recover an already paid result without a second charge.

CONSTRAINTS: Keep every Plan and Application editing field, local and Qwen inference, model terms and download controls, native controls, platform fonts, arrow cursor, the exact zebra asset, and the pinned Ember world. Every method works without a Zebby signup or sign-in screen. Paid access requires secure storage. Application Save cannot silently start paid match analysis.

## Direction contract

MODE: Operate, ordinary extension of Ember.

THESIS: Keep method choice direct, with one purchase action for the selected credits method and a compact wallet summary; reveal recovery and pairing detail through Learn more.

OWN-WORLD: Incumbent Ember warm neutral canvas, restrained terracotta actions, quiet selection washes, the unchanged zebra, native platform typography, native dropdowns and modal behavior, and arrow cursor for controls.

STORY: Choose a method, finish focused setup, complete guest checkout in an external browser, choose a model after purchase, save a recovery code, pair another computer when needed, click Analyze to start with saved settings or recover the paid result for free, then receive wallet feedback.

FIRST VIEWPORT: Initial setup retains a native modal with four method tiles in two columns and a full-width Buy credits tile. Settings shows Buy credits under Analysis only when Zebby credits is selected, alongside the model and thinking controls. Empty Credits has concise no-credit text, Restore credits | Connect this computer and Learn more; funded Credits has a slim usage summary. Dialog bodies scroll independently. Analysis introductions and pricing helper text use the modal's full content width and wrap naturally in narrower windows, where the choice grid also adapts.

FORM: The approved Quick choice A concept translated into Ember and the incumbent Plan and Application editors. The separate prototype is a direction reference, not current product verification.

## Methods and purchase

Initial setup offers Local server (Ollama), Download a model, OpenAI API key, Anthropic API key, and Buy credits. Focused setup reuses the Settings controls. Personal-key model choices are limited to that provider. Native radio inputs retain method and pack selection, visible focus, and readable selection feedback. The modal restores the opener's focus on close; reduced motion removes its entrance animation.

In Settings, one Buy credits action appears under Analysis only when Analyze with is Zebby credits. It opens the same purchase flow for new purchases and top-ups. The sidebar usage bar opens the same purchase flow directly in expanded and collapsed navigation, regardless of the selected method.

The $5 pack is selected by default and carries Suggested start. The pricing scene shows four USD packs: $5 for 500 credits, $20 for 3,000, $50 for 8,000, and $100 for 16,000. Each card shows two illustrations: GPT-6.1 Sol (High) gives 5, 33, 89 and 179 analyses; GPT-6 Luna (High) gives 112, 674, 1,797 and 3,595. The examples sit in a simple vertically spaced pair below the credit amount. These use a rounded sample Plan baseline of 3,600 input tokens and 500 visible result tokens, plus an unmeasured 7,500-token thinking allowance. All input is priced as cache writes. Tooltips explain the assumptions; the concise helper explains variable usage and the required maximum quote balance. Counts are not measured provider averages or guarantees. Native radio state, accent wash and outline indicate the chosen pack without a checkmark or Select/Selected text. The pricing scene has no connected-wallet sentence or model dropdown.

Paid credits use a guest wallet, with no email-code or signup step. Secure storage keeps an independent device credential per computer and is required before checkout. Checkout opens in the external browser. The waiting scene supports explicit payment checks and expired-checkout retry. Test checkout visibly says no real payment is taken. Only confirmed payment reveals the available balance and a quiet Save recovery code prompt. This confirmation has no model or thinking controls. Recovery copy explains reinstalling and using credits on another device. Its single footer action is Done, or Continue to analysis for a pending request; the header Close action remains available. Model and thinking stay in Settings.

The paid native model dropdown offers GPT-6.1 Sol, GPT-6 Luna and GPT-6 Astra, enforced by the service catalog and quote validation. Each offers Low, Medium, High, Extra high and Maximum thinking, with High as default. Luna also offers Off, supported by the quote schema, desktop client and service. Personal-key methods retain their separate OpenAI and Anthropic catalogs. Legacy paid result recovery remains available for models removed from new purchases.

The $20, $50 and $100 cards now include “Unlocks GPT-6 Astra” and a third High-effort illustration of about 6, 17 and 35 Astra analyses respectively. The $5 card says “Sol and Luna.” These additions retain the existing selection wash, outline, typography and spacing. Existing qualifying purchases unlock Astra for the wallet; future top-ups can use any pack. A fully refunded or disputed qualifying purchase no longer provides access unless another qualifying purchase remains.

Until unlocked, the credits model selector labels Astra “GPT-6 Astra · Locked.” Selecting it opens the purchase dialog with $20 selected without changing the saved model or thinking level. This also works when Astra was already the saved model. Closing the dialog restores focus to the selector. The restriction does not apply to personal OpenAI keys.

## Quotes, recovery, and wallet

Analyze starts immediately using saved model and thinking settings, with no review dialog. Each funded Plan or match request independently refreshes the wallet and prepares its quote internally. The quote binds both settings and source data and includes reasoning in its maximum output budget. Analysis cannot override effort in the request body. Insufficient funds opens Buy credits with a short explanation. Preparation errors stay inline with the listing, and an expired estimate asks the user to retry. The service reserves the maximum, charges reported actual usage and returns unused reserved credits. Cancel during preparation releases the listing immediately and prevents late quotes from starting a paid request. Failed or cancelled analyses release reservations.

Quotes now use OpenAI's input-token count for the complete request, including instructions and the response schema, plus a task-specific output ceiling that includes reasoning. Model, effort and source content remain unchanged. A count failure stops preparation without a heuristic fallback or a reservation. An incomplete response at the output ceiling is rejected and the wallet reservation released. Insufficient-credit copy gives the required and available credit amounts rather than implying an analysis-count cap.

A lost paid reply retains its request identity so the original result can be recovered without another charge. Clicking Analyze recovers a completed result directly. An unfinished prior run reports inline that it is still running and can be retried, without starting another paid run. Recovery remains available with zero or negative balance. Main clears recovery metadata only after local persistence. The server retention window is 24 hours; encrypted local settings retain restart recovery metadata when secure storage is available.

Empty Credits shows "No credits found. Buy a pack or restore your existing credits." The row below contains Restore credits | Connect this computer and Learn more. A funded wallet shows exact available credits, used credits out of the total, percentage remaining, a slim 6px track for remaining credits and an icon-only Refresh balance action. The paid model and thinking dropdowns live in Analysis. Available credits subtract reservations and display at least zero; reservations do not count as used credits. This shows cumulative usage of purchased credits, with no weekly reset or artificial expiry. Failed refreshes retain labeled saved balances.

Learn more opens the native About credits dialog, at most 480px wide, explaining restoration and single-use ten-minute pairing. Funded wallets expose Save recovery code, Replace recovery code, Connect another computer, Connected computers and Recent usage inside this dialog. The recovery export is also offered after purchase. Pairing supports copying, expiry, regeneration and explicit cancellation; cancelling re-enables the restore/connect links. Native confirmations default to Cancel for code replacement, switching a funded wallet and disconnection. Switching a funded computer requires a saved recovery code for its current wallet. The current computer cannot disconnect itself.

Restore credits and Connect this computer retain focused inline forms, with Enter to submit, Escape/Cancel to clear the code and focus restored to the opener. The help dialog restores its opener's focus on close. The sidebar shows used of total and the percentage left, rounded to a whole number, above a slim remaining-credit bar after a purchase. Collapsed and narrow navigation shows only the percentage and bar. The bar uses the same accent fill and grey line token as Settings. Both forms open Buy credits directly, including when a different analysis method is selected. Reservations reduce available credits but are not counted as used. Tooltip and accessible name include full credit amounts, label the percentage as remaining, and identify saved usage when stale. There is no account label or Sign out action. Replies from a former wallet cannot replace the current wallet.

Wallet credentials and pending original connection codes stay in the OS-encrypted private profile, separate from the selected application SQLite database and redacted from logs. A pending attempt is bound to its original operation and normalized code hash before linking. A conflicting operation or code preserves the earlier credential and cannot report the new request successful until its own code is processed. Mount/focus recovery and Refresh balance retry the retained original request. Settings exposes pending status, manual Refresh balance, and interruption feedback even before access is connected. The server stores only credential/code hashes. Existing valid paid sessions can migrate to guest access without resetting ledger identity or balances; no application SQLite schema change is introduced.

Saving an application retains the existing form and data behavior. Paid match analysis starts only from its explicit Analyze or refresh action, with an internal quote check; it cannot run silently after Save. Ready local and personal-key methods retain their prior automatic match path. Plan keeps Analyze below Your CV and Save outside scrolling.

## Service availability

The purchase flow keeps pack selection and Continue usable before the service is configured, subject to secure storage. Connection failures appear locally. Published builds connect to zebby-credits.onrender.com through the public build variable; custom builds default to no endpoint. Render Free, Stripe live webhooks and Supabase guest wallets are connected. OpenAI access was verified with synthetic structured requests; Claude model listing was verified without funded inference. An unpaid live Checkout was verified and expired; a completed customer payment and receipt remain unverified. The [service guide](../../credits-service/README.md) covers configuration and the additive thinking migration. Supabase Auth and SMTP are not needed. Service balances are separate from application SQLite. No real payment was taken during implementation.

## Historical verification, 2026-10-04

These records describe the earlier account-based integration. They are retained as historical evidence; the current guest-wallet handoff is recorded below.

Source evidence checked: desktop/renderer/AnalysisFlow.tsx, AnalysisSettings.tsx, App.tsx, ApplicationDashboard.tsx, and desktop.css; shared/online-models.ts; sampled desktop/credits-client.ts and desktop/main.ts; credits-service/README.md; and tests/paid-analysis.test.mjs. The incumbent DESIGN.md and .impeccable/design.json were checked and preserved. This feature does not establish a new global palette, typography scale, shape scale, or motion rule.

The final combined log, work/paid-implementation-final-tests.log, reports 91 passing Node tests and zero failures. Supplied final lint, TypeScript without incremental caching, desktop build, and service build passed. The independent reviewer separately passed all 19 paid tests and TypeScript. The scoped review in work/paid-implementation-finish-review.md returns ship for all three scored corrections: paid-response recovery, equal-sized partial refund duplication, and stale account wallet responses. These checks were not rerun by the documenter.

No app, Electron, browser, Playwright, or desktop control was used for that documentation pass, and no user profile or database was opened. No new screenshots existed for that pass. Its earlier public captures applied only to their original releases. Real database concurrency, email delivery, Stripe webhook delivery, provider model access, Docker deployment, installers, physical Mac behavior, and then-current native visual rendering were unverified by those records.

One supplied static detector snapshot, work/paid-design-detect.json, was read. Its new thick side accent has been removed in current source. Existing sidebar layout transition warnings remain pinned and unchanged. Feature-specific dialog type, radius, shadow, and backdrop literals produced advisories; they were not promoted into the global system or visually certified. The detector was not rerun during documentation. Existing .impeccable/critique artifacts were preserved.

## Historical release verification, 2026-10-09

Zebby 1.7.0 shipped the earlier account-based integration from source commit 57b91eff1a65b950a928b45ce55f53f541015a9b. The [release build](https://github.com/desigrit/zebby-the-scout/actions/runs/38027754793) passed on Windows x64 and macOS Apple Silicon, then produced Windows x64, Windows ARM64, and Mac ARM64 installers. All three direct release downloads returned HTTP 200, with uploaded state and GitHub SHA-256 digests verified. This release record does not describe the current guest-wallet source.

The local suite passed 108 tests, including 22 payments tests. TypeScript, lint, desktop build, and service build passed. GitHub also passed native Windows editing/cancellation checks, compiled renderer checks on both hosts, packaged local-model checks, self-update checks, and the Mac distribution first-launch check. ARM64 Windows packaging was verified; execution on physical Windows ARM64 hardware was not tested.

For that release, renderer checks exercised all five first-use methods, four pricing choices without early model selection, email delivery failure and retry, synthetic payment confirmation, post-purchase model choice, credit quotes, sidebar balances, Settings, sign-out, and focus restoration. Captures were reviewed in wide light and narrow dark layouts. A dialog positioning issue was corrected with native modal centering and protected by geometry checks. Email-code and sign-out scenes are historical and have been replaced by the guest flow above.

No app or browser was launched on the user's PC, and no personal database, profile, or resume was accessed. All screen checks used synthetic data on GitHub runners. Stripe, Supabase, and a public service endpoint were unconnected. Real email delivery, hosted webhooks, live provider calls, and deployed Docker behavior were unverified by that release's evidence.

## Guest-wallet handoff, 2026-10-10

Finished application source checked at d0c34b49c73a50040549098f501889950058a807: desktop/renderer/CreditsSettings.tsx, AnalysisFlow.tsx, and desktop.css; desktop/credits-client.ts; sampled desktop/main.ts; shared/wallet-access.ts and online-models.ts; credits-service/README.md, environment.example, schema.sql, and wallet-access.ts; and docs/guide.md. The owner guide was checked against the service's actual configuration and the user guide's automatic match paragraph was scoped to ready local and personal-key methods.

The current rows use the incumbent Ember palette, inherited platform fonts, compact native buttons/fields, fine separators, and a quiet accent-wash pairing panel. DESIGN.md and .impeccable/design.json were compared and preserved. Feature-specific dialog sizes, shadows, and entrance animation remain local; this extension creates no global palette, typography, shape, or motion rule. Pre-existing sidecar samples for recommendation Copy and application row composition lag the current DESIGN.md/source and were reported without repair. No detector, context reload, or doctor was run in this documenter pass, and existing critique artifacts were preserved.

The [initial remote CI](https://github.com/desigrit/zebby-the-scout/actions/runs/38035846232) passed at 669cb06. The [final remote CI](https://github.com/desigrit/zebby-the-scout/actions/runs/38036798621) passed at d0c34b4 with all 152 Node tests, TypeScript, lint, the desktop build, isolated native Windows flows, and renderer checks. Supplied local checks passed all 53 scoped credit tests and the service build at 669cb06; service source was unchanged for the d0c34b4 correction. The repeat-schema test preserved existing wallet balances. These checks were not rerun by the documenter.

The independent report in work/guest-wallet-finish-review.md found two material issues: connection intent could accept an earlier wallet for new input, and unsigned pending access lacked manual retry. The verdict in work/guest-wallet-finish-verdict.md scored both Resolved and returned disposition: ship for those two corrections only. Independent wallet-client verification passed all 16 subtests. This verdict does not certify every surface or interactive state.

All eight current captures are under work/guest-wallet-review-final/qa-output/renderer-1.5.0/credits-*.png: method choice, packs in both layouts, wallet Settings, pairing, a quote, and pending error/manual retry in both layouts. The independent reviewer found all eight valid. Windows light uses 1550x850; Mac CSS dark uses 790x850. The captures use a synthetic wallet, mock native bridge, platform CSS/theme overrides, and fixture version labels. They are current renderer evidence, with no live payment or physical Mac claim.

No local app, Electron, browser, Playwright, or desktop control was used in this handoff, and no personal profile, database, or resume was accessed. No service or real financial/provider credentials were configured. Hosted multi-connection concurrency, real Stripe/webhook/provider calls, container startup, real OS secure storage, and guest-wallet behavior on physical Mac hardware were unverified by that handoff.

Zebby [2.1.0](https://github.com/desigrit/zebby-the-scout/releases/tag/v2.1.0) is published from d0c34b4. The [release workflow](https://github.com/desigrit/zebby-the-scout/actions/runs/38037269117) passed its Windows x64 and macOS ARM64 jobs and published direct Windows x64, Windows ARM64, and Apple Silicon installers. All three assets have uploaded state and GitHub SHA-256 digests; their download URLs returned HTTP 200. Mac distribution launch, packaged local-model, and self-update checks passed on the GitHub runner. Windows ARM64 packaging passed without a physical ARM64 execution claim. The service Docker dependency correction is on main, the branch specified in the owner guide; it does not change these desktop installers.

## Credits and chart streamline verification, 2026-10-10

The full scoped finish review at e78362edf08acaa4a64dac2dc0df424c302888b3 against baseline 3d35192c0b06f08e506546e4931227898cbd31ca returned disposition: ship with no material fixes. All 13 required captures were opened and valid, and source and QA corroborated the implementation. Supplied [CI 38046698808](https://github.com/desigrit/zebby-the-scout/actions/runs/38046698808) passed 157 Node tests, typecheck, lint, production build, full renderer flows and 18 native Windows checks. These gates were not rerun by the documenter.

Synthetic renderer captures are component and theme previews with mixed platform overrides. Actual native Windows evidence is separate; physical Mac rendering, live Stripe/webhooks/provider service and Windows ARM hardware remain unverified. The [Settings handoff](settings.md#credits-and-chart-streamline-handoff-2026-10-10) records packaging status and the preserved incumbent system. No local GUI or personal data was accessed during documentation.

## Counted budgets and Astra access verification, 2026-10-20

Implemented in the isolated `codex/credit-reservations` worktree. All 89 focused credit, thinking, wallet and service tests passed, including isolated PGlite entitlement, reservation, refund and repeat-migration checks. TypeScript, affected-file lint, desktop and service builds, and the headless renderer checks passed. Synthetic captures were reviewed in wide Windows light and narrow Mac dark themes, including the already-selected locked Astra state. The renderer checks cover selecting locked Astra, the $20 purchase selection, preserving the current model, and restoring keyboard focus.

No native app, personal database, real payment or provider analysis was used. The migration, hosted deployment and updated desktop release are pending; these checks do not establish live service readiness. The [service guide](../../credits-service/README.md) records rollout steps. Existing design-sidecar drift and the unset build path were left unchanged.

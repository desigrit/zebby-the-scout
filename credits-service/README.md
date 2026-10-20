# Zebby credits service

Official Zebby builds connect to `https://zebby-credits.onrender.com`. Credits support GPT-6.1 Sol, GPT-6 Luna and GPT-6 Astra. Users can also bring their own OpenAI or Anthropic API key, use an Ollama server, or download a local model. Those methods do not need this service. Custom builds set the public `ZEBBY_CREDITS_SERVICE_URL` when building the desktop app. Wallet access requires OS secure storage.

A $20, $50 or $100 purchase unlocks Astra for that wallet. Existing paid purchases qualify, and access travels with wallet restoration and device pairing. Spending credits does not remove access; users can subsequently top up with any pack. Fully refunded and disputed purchases do not qualify. The $5 pack supports Sol and Luna without an Astra unlock. Personal API keys have no pack restriction.

## Counted budgets update

Before deploying this update, run [20261020_counted_budgets.sql](migrations/20261020_counted_budgets.sql) in Supabase SQL Editor. It adds token-count/output-limit fields to quotes and derives Astra access from purchases. It preserves wallets, balances, ledger entries and saved results. Repeating it is safe. Then deploy the service and build the desktop app. Existing clients also receive the new server reservation policy, but require an app update for the new pricing labels and clearer balance errors.

No Stripe product, environment-variable or API-key replacement is required. The OpenAI service key must permit `POST /v1/responses/input_tokens` as well as response creation. Confirm this endpoint is allowed if the key is restricted.

Quotes use OpenAI's [input token count endpoint](https://developers.openai.com/api/docs/guides/token-counting) with the same model, instructions, complete source, thinking configuration and JSON schema as generation. If counting fails, no quote or hold is created; Zebby asks the user to retry rather than guessing. Text and responses are never included in diagnostic logs.

Credit generation uses the output ceiling stored with the quote. These limits include both reasoning and the visible result:

| Thinking | Resume match | Full Plan |
| --- | ---: | ---: |
| Off (Luna) | 1,024 | 4,096 |
| Low | 3,072 | 6,144 |
| Medium | 6,144 | 8,192 |
| High | 8,192 | 12,288 |
| Extra high | 16,384 | 24,576 |
| Maximum | 32,768 | 49,152 |

Model and thinking selections are preserved. The limits do not shrink to fit a wallet's remaining balance, and source text is not truncated. They are initial task budgets, not a guarantee every request will finish. Incomplete or invalid results are not saved or charged to the wallet; their holds are released, with no automatic paid retry. Provider costs from unsuccessful requests can still apply. See OpenAI's [reasoning-token guidance](https://developers.openai.com/api/docs/guides/reasoning).

Only provider-reported actual usage is settled after a valid result. Input reservations allow for cache-write pricing and long-context rates. Unused holds are released. There is no per-pack analysis-count limit: the numbers on pricing cards are usage illustrations.

Every analysis method works without a Zebby signup or sign-in screen. The first credit purchase silently creates a guest wallet. Each computer keeps its own encrypted access credential, and the service owns the shared balance. Opening a SQLite database on another computer does not connect its credit wallet.

## What changed for guest credits

You still need Stripe, Supabase PostgreSQL, an HTTPS service host, and your provider API keys. **Supabase email sign-in, email templates, anonymous Auth sign-ins, and an SMTP sender are no longer needed.** The credits service manages guest wallet access directly.

If you already ran an earlier schema, run the complete updated [schema.sql](schema.sql) again. It adds device, recovery, and pairing tables without clearing wallets, purchases, usage, or application databases. Deploy the new service and build the matching desktop release. Existing encrypted email-based sessions can migrate to a guest device credential while keeping the same ledger identity and balance.

For the 2.2.0 update, run [20261010_analysis_thinking.sql](migrations/20261010_analysis_thinking.sql) in Supabase SQL Editor **before deploying the service**. It adds only the quote's thinking-level column and is safe to run again. Wallets, balances, purchases, saved results and application databases are preserved. No new environment variables or Stripe changes are required for this update.

For Luna support, then run [20261010_credit_luna.sql](migrations/20261010_credit_luna.sql) **before deploying the updated service and desktop app**. It permits Luna's Off thinking option without changing existing quotes, wallets or balances, and is safe to run again. Fresh installations can use the complete schema instead. Luna uses the existing OpenAI service key; no Stripe or environment changes are needed. Confirm that the key's project can access Luna before inviting users.

## What you need

- A Supabase project for PostgreSQL.
- A Stripe account, starting in a test sandbox.
- A Node 22 host or a Docker web service with HTTPS. Render is a straightforward starting point; the included Dockerfile can also run on Azure Container Apps.
- A funded OpenAI API account with access to the three credit models. Keep its key on the service host. Personal Anthropic keys are billed to each user's account and do not require a funded service account.

Do not paste secrets into chat, GitHub, the SQLite database, or desktop build variables. The only desktop build variable is the public service URL.

## 1. Create the ledger

1. Sign in to [Supabase](https://supabase.com/dashboard) and choose **New project**.
2. Choose an organization, name the project `zebby-credits`, set a database password, and choose a nearby region.
3. Open **SQL Editor**, then **New query**. Paste the complete contents of [schema.sql](schema.sql) and select **Run**.
4. In the project's API settings, copy the project URL and the **legacy service_role key** into the service host's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not use the anon or publishable key here.
5. Skip Supabase Authentication setup. Guest wallets do not create Supabase Auth users or send sign-in emails.

The schema enables RLS, removes ordinary client access, and permits ledger and wallet access operations only through service-role functions. It stores purchases, usage, holds, connected computer names, hashes of access/recovery/pairing credentials, and derived analysis results. It does not store submitted resume files or job text. Derived results, which can include CV wording, are cleared after 24 hours by the cleanup job while the service is running. Expired pairing codes are removed; wallets and recovery records are retained. Purchase and ledger records remain for accounting.

## 2. Create Stripe test credentials

1. Create an account at [Stripe](https://dashboard.stripe.com/register).
2. Open a **test sandbox**. Keep live mode off during setup.
3. Open **Developers / Workbench → API keys** and create a restricted key for your own integration. Give **Checkout Sessions** Write access and **Charges and Refunds** Read access, leaving other resources at None. Add the key, beginning `rk_test_`, to `STRIPE_SECRET_KEY` on the service host. A standard `sk_test_` key also works. A publishable `pk_` key cannot be used by this service.
4. Do not create product prices manually. The server creates Checkout line items from the four authoritative packs below.
5. After the service URL is assigned, open **Developers / Workbench → Webhooks**, then **Add destination**.
6. Use `https://YOUR-SERVICE/v1/stripe/webhook` and select:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`

7. Copy that destination's signing secret, beginning `whsec_`, into `STRIPE_WEBHOOK_SECRET` on the service host.

Checkout success URLs never grant credits. Only a matching signed, paid Stripe event can do that. Refunds revoke credits proportionally; refunds after spending can leave a negative balance. Disputed payments prevent further analysis until the dispute is resolved.

Checkout uses guest payments and collects the buyer's email and payment details in Stripe. Configure payment receipts in Stripe if you want receipt emails. A payment email or shared card does not connect separate Zebby wallets. [Stripe's guest checkout documentation](https://docs.stripe.com/payments/checkout/guest-customers) explains how these payments appear in the dashboard.

## 3. Host the service

For Render:

1. Open the [Render dashboard](https://dashboard.render.com/) and choose **New → Web Service**.
2. Connect `desigrit/zebby-the-scout` and select the `main` branch.
3. Choose **Docker** as the language, leave **Root Directory** empty, and set **Dockerfile Path** to `credits-service/Dockerfile`.
4. Leave the Docker command empty. The Dockerfile supplies the start command. Set the health check path to `/health`.
5. Add the environment variables listed in [environment.example](environment.example). Under **Environment → Edit → More options → Import from .env**, paste the private file and choose **Add variables**. Remove duplicate rows before saving. Use Environment Variables, rather than Secret Files. Use an HTTPS origin without a path for `ZEBBY_PUBLIC_SERVICE_URL`.
6. Render assigns an `onrender.com` hostname. Set `ZEBBY_PUBLIC_SERVICE_URL` to that HTTPS origin. Now create the Stripe webhook destination from step 2 and add its real `STRIPE_WEBHOOK_SECRET`. If the first deployment started before these values were ready, finish the environment settings and select **Manual Deploy → Deploy latest commit**.
7. Add real provider keys to `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. In OpenAI's project API Keys page, use a restricted key with **List models: Read** and **Responses (/v1/responses): Write**. Leave other capabilities at None. In Claude Console, create an ordinary API key scoped to the intended workspace, rather than an Admin API key. A provider without a key remains unavailable. Both accounts need their own API funding, including during Stripe sandbox tests.
8. Keep `ZEBBY_ALLOW_LIVE_PAYMENTS=false`. Connect the Stripe webhook from step 2 and deploy again after setting its secret.
9. Visit `https://YOUR-SERVICE/health`. It should return `{"ok":true,"mode":"test"}`.

Render Free sleeps after 15 minutes without requests and normally needs about a minute to wake. From 2.1.6, selecting **Buy credits** starts a background check of the public `/health` endpoint while the pack dialog opens immediately. Checkout shares that check if startup is still running. Opening or cancelling the pack dialog does not create a wallet or checkout. Zebby also checks readiness before its first credit request and after idle time, allowing up to two minutes for startup. It retries health checks only; checkout and paid analysis are not replayed. Analysis cancellation stops that request's wait and preserves saved wallet access. There is no periodic keepalive. A sleeping service can also delay webhook processing. An always-on tier removes this wake-up delay. See [Render Free](https://render.com/docs/free) and [Render's Docker guide](https://render.com/docs/docker).

The same container can run on another host. Build from the repository root:

```sh
docker build -f credits-service/Dockerfile -t zebby-credits .
docker run --env-file .env.credits -p 8080:8080 zebby-credits
```

Copy `credits-service/environment.example` into an untracked `.env.credits` file for your own local container. HTTP port 8080 must sit behind HTTPS on a public host. Native builds use `npm run credits:build` followed by `npm run credits:start` with the same environment variables supplied by the host.

Run one service instance initially. In-memory abuse limits are per instance. Guest creation and connection are limited to eight attempts per address in 15 minutes, with an additional ten-wallet hourly limit. Add a shared rate limiter before running multiple instances. The Supabase transactional ledger remains authoritative across instances.

`ZEBBY_TRUST_PROXY_HOPS` defaults to `0`, which ignores forwarded headers. Behind a proxy this can make users share a connection limit. Before inviting users, confirm the fixed proxy chain with your host and set the number of trusted hops (`1` to `4`), counted from the service socket. For example, a single trusted reverse proxy uses `1`. The service selects the address from the right of `X-Forwarded-For`; malformed or incomplete chains fall back to the socket address. Do not guess a host's hop count or enable it when clients can reach the container through a shorter path. This follows the bounded-hop approach described in [Express's proxy guidance](https://expressjs.com/en/guide/behind-proxies/). Render's exact chain must be checked for the deployed service.

Configure hosting logs without request-body or Authorization-header capture. No wallet token, recovery code, or pairing code belongs in a URL, analytics event, or log.

## 4. Connect desktop builds

1. In GitHub, open the repository **Settings → Secrets and variables → Actions → Variables**.
2. Add the repository variable `ZEBBY_CREDITS_SERVICE_URL` with your public HTTPS service origin.
3. Build a new Windows or Mac release using the existing workflow. The public URL is compiled into the Electron main process. Service keys are never part of the installer.
4. For a local build in PowerShell:

   ```powershell
   $env:ZEBBY_CREDITS_SERVICE_URL = 'https://YOUR-SERVICE'
   npm run desktop:build
   ```

5. For payment tests, use a Stripe sandbox, matching test credentials and a separate Supabase project. Use a separate empty application database and disposable resumes. Open **Settings > Analysis**, set **Analyze with** to **Zebby credits**, then choose **Buy credits**, select a pack, and finish Stripe Checkout in your external browser. The same action supports top-ups. First-use setup also retains its purchase choice. There is no Zebby email-code or signup step.
6. In a Stripe test sandbox, use card `4242 4242 4242 4242`, a future expiry, and any valid CVC. No real card charge is made. See [Stripe's testing guide](https://docs.stripe.com/testing).
7. Wait for webhook confirmation. Zebby should show a slim summary with available, used and total credits and percentage remaining, then allow model selection. Choose **Save recovery code** after purchase or in **Settings > Credits > Learn more**, and keep the text file somewhere private, outside the app's data folder. Analyze one Plan and one resume match, and verify used and remaining credits. Reservations reduce availability without counting as used; usage is cumulative, with no weekly reset.
8. On the first computer, open **Settings > Credits > Learn more > Connect another computer**. On the second, choose **Settings > Credits > Connect this computer** and enter the temporary code. Both should show the same balance and used credits. Pairing connects credits only, so each computer still selects its application database separately.
9. Test **Settings > Credits > Restore credits** with the saved recovery code on a fresh disposable profile. In **Settings > Credits > Learn more > Connected computers**, disconnect that device and verify it cannot spend. Test Cancel in the native recovery-save and disconnect dialogs and an expired/used pairing code. In **Learn more > Replace recovery code > Create new recovery code**, verify the new code invalidates the old code and leaves connected devices active. Review **Learn more > Recent usage** for the model, date, analysis type and credit charges.
10. Test analysis cancellation, insufficient funds, a duplicate webhook delivery, a refund, and network interruption during checkout, pairing and analysis. Confirm a lost connection reply can recover after restarting, and check Stripe deliveries and the Supabase ledger for each result.

The checked-in Node tests use an isolated PostgreSQL engine and mocked network requests. Remote renderer checks use a synthetic wallet and mock native dialogs. Hosted connection checks can create and expire an unpaid Checkout session without entering card details or granting credits. Never use real card details for payment tests in live mode. A completed customer payment and receipt delivery are not proven by an unpaid session. See [Stripe's testing guide](https://docs.stripe.com/testing).

## Packs and estimates

| Price | Credits | Sol (High) | Luna (High) | Astra (High) |
| --- | ---: | ---: | ---: | ---: |
| $5 | 500 | About 5 | About 112 | Requires an earlier qualifying purchase |
| $20 | 3,000 | About 33 | About 674 | About 6 |
| $50 | 8,000 | About 89 | About 1,797 | About 17 |
| $100 | 16,000 | About 179 | About 3,595 | About 35 |

Analyze starts directly after Zebby prepares an internal quote. If funds are insufficient, the app shows the credits needed to start and the available balance. The service reserves the quote, charges for actual reported token usage, including thinking, and returns unused credits to the wallet. Cancelled, failed and invalid analyses release their reservations.

If a reply is lost after settlement, Zebby retains the original request ID and can recover the result without another charge. Recovery metadata, without resume or job text, is saved in encrypted local settings when secure storage is available. Main clears it only after the result is saved to SQLite. A pending result can be recovered after restarting on that computer within the server's 24-hour result retention window. Changing wallets rejects obsolete replies and prevents an older wallet's reply from replacing the current one.

The illustrations use a rounded sample Plan baseline of 3,600 input tokens and 500 visible result tokens, plus an estimated 7,500-token thinking allowance. The sample's historical reasoning usage was not recorded. The example uses 8,000 output tokens, with all input charged as cache writes. At Zebby's configured rates, this example costs 89 credits using GPT-6.1 Sol, 4.45 using GPT-6 Luna, or 445 using GPT-6 Astra. Counts divide pack credits by the corresponding example cost and round down. They are estimates, not measured averages or guarantees. High does not imply a fixed token count or equal usage between models. Cache hits, job length, reasoning effort and model choice change usage. A remaining balance below the next maximum quote requires a top-up, even if it could cover the estimated final cost. The catalog is in [online-models.ts](../shared/online-models.ts).

Thinking levels are Low, Medium, High, Extra high and Maximum, with High selected by default. Luna also supports Off; Sol and Astra do not. Quotes bind model, thinking level, counted input and output ceiling; changing those requires a new quote. The task budgets are listed above. High and above allow eight minutes for the provider response, with cancellation available.

Provider retention and data-sharing settings must match the privacy terms you publish for users. Online analysis sends job and CV content to the selected provider; API keys and payment credentials stay on the service host.

## Before switching to live payments

Verify that your provider accounts can access every offered model. No provider failure is routed to a cheaper model. Update rates and the price version when costs change; in-flight stale quotes are rejected.

Configure your business details and payouts in Stripe, publish your purchase/refund and privacy terms, and confirm the applicable tax handling. The initial Checkout integration charges the pack amount only; it does not add automatic tax or tax-inclusive accounting. Test first with a small audience and measure actual usage and overhead.

Then replace the Stripe test key and webhook secret with their live equivalents and explicitly set `ZEBBY_ALLOW_LIVE_PAYMENTS=true`. A restricted live key begins `rk_live_`; a standard live secret key begins `sk_live_`. Both must match the selected payment mode. Create a live webhook destination with the same five events listed above. Use a separate Supabase project or audit the ledger before enabling live payments so test balances cannot become live spendable credits. The service rejects events whose test/live mode differs from its configuration.

## Verification commands

```sh
npm run test:credits
npm test
npx tsc --noEmit
npm run desktop:build
npm run credits:build
```

The credit tests exercise the actual SQL functions in in-memory PostgreSQL. They do not prove real multi-connection concurrency, Stripe webhook delivery, provider model access, or native window layout. Those are the hosted test-mode checks above. Do not run renderer or Electron checks while someone is using the PC.

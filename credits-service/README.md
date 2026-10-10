# Zebby credits service

The desktop UX is implemented. This service is prepared for Stripe test mode, but no payment account or hosted endpoint has been connected. Paid checkout stays unavailable in desktop builds without `ZEBBY_CREDITS_SERVICE_URL`.

Local models, Ollama, and personal OpenAI or Anthropic keys do not require a Zebby account. Paid users enter an email code once per computer. The service owns their balance; the desktop SQLite file cannot grant credits.

## What you need

- A Supabase project for passwordless email sign-in and PostgreSQL.
- A Stripe account, starting in a test sandbox.
- A Node 22 host or a Docker web service with HTTPS. Render is a straightforward starting point; the included Dockerfile can also run on Azure Container Apps.
- Your own OpenAI and Anthropic API accounts for the models you offer through credits. Keep those keys on the service host.
- An email sender for Supabase before inviting other users. Supabase's default sender is restricted and is suitable for initial owner testing only.

Do not paste secrets into chat, GitHub, the SQLite database, or desktop build variables. The only desktop build variable is the public service URL.

## 1. Create the account and ledger

1. Sign in to [Supabase](https://supabase.com/dashboard) and choose **New project**.
2. Choose an organization, name the project `zebby-credits`, set a database password, and choose a nearby region.
3. Open **SQL Editor**, then **New query**. Paste the complete contents of [schema.sql](schema.sql) and select **Run**.
4. Open **Authentication**, then **Sign In / Providers**, then **Email**. Enable email sign-in and email confirmation.
5. In **Authentication**, open **Email Templates**, then **Magic Link**. Use a code in the email body:

   ```html
   <h2>Your Zebby sign-in code</h2>
   <p>{{ .Token }}</p>
   <p>Enter this code in Zebby. If you did not request it, ignore this email.</p>
   ```

6. In the project's API settings, copy the project URL and the **legacy service_role key** into the service host's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not use the anon or publishable key here.
7. Before inviting peers, configure **Authentication → Email → SMTP Settings** with your sender and a verified sending domain. The default sender restricts recipients and rate limits emails. [Supabase's passwordless email guide](https://supabase.com/docs/guides/auth/auth-email-passwordless) explains the code template and delivery configuration.

The schema enables RLS, removes ordinary client access, and permits ledger operations only through service-role functions. It stores purchases, usage, holds, and derived analysis results. It does not store submitted resume files or job text. Derived results, which can include CV wording, are cleared after 24 hours by the cleanup job while the service is running. Purchase and ledger records remain for accounting.

## 2. Create Stripe test credentials

1. Create an account at [Stripe](https://dashboard.stripe.com/register).
2. Open a **test sandbox**. Keep live mode off during setup.
3. Open **Developers / Workbench → API keys**. Add the test secret key, beginning `sk_test_`, to `STRIPE_SECRET_KEY` on the service host.
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

## 3. Host the service

For Render:

1. Open the [Render dashboard](https://dashboard.render.com/) and choose **New → Web Service**.
2. Connect `desigrit/zebby-the-scout`, using the branch containing this implementation.
3. Choose **Docker** as the language, leave **Root Directory** empty, and set **Dockerfile Path** to `credits-service/Dockerfile`.
4. Leave the Docker command empty. The Dockerfile supplies the start command. Set the health check path to `/health`.
5. Add the environment variables listed in [environment.example](environment.example). Use an HTTPS origin without a path for `ZEBBY_PUBLIC_SERVICE_URL`.
6. Render assigns an `onrender.com` hostname. If it is not available before the first deploy, use a temporary HTTPS value for `ZEBBY_PUBLIC_SERVICE_URL`, then replace it with the assigned hostname and redeploy before testing Checkout.
7. Add real provider keys to `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. A provider without a key remains unavailable. Test payments do not make provider inference free; analysis uses your provider API balance.
8. Keep `ZEBBY_ALLOW_LIVE_PAYMENTS=false`. Connect the Stripe webhook from step 2 and deploy again after setting its secret.
9. Visit `https://YOUR-SERVICE/health`. It should return `{"ok":true,"mode":"test"}`.

Choose an always-on service before offering paid analysis. Sleeping hosts can delay webhooks and credit refresh. [Render's Docker guide](https://render.com/docs/docker) describes the Dockerfile and service configuration.

The same container can run on another host. Build from the repository root:

```sh
docker build -f credits-service/Dockerfile -t zebby-credits .
docker run --env-file .env.credits -p 8080:8080 zebby-credits
```

Copy `credits-service/environment.example` into an untracked `.env.credits` file for your own local container. HTTP port 8080 must sit behind HTTPS on a public host. Native builds use `npm run credits:build` followed by `npm run credits:start` with the same environment variables supplied by the host.

Run one service instance initially. In-memory abuse limits are per instance. Add a shared rate limiter and verify your proxy's client IP handling before scaling across instances. The Supabase transactional ledger remains authoritative across instances. Configure hosting logs without request-body or Authorization-header capture.

## 4. Connect desktop builds

1. In GitHub, open the repository **Settings → Secrets and variables → Actions → Variables**.
2. Add the repository variable `ZEBBY_CREDITS_SERVICE_URL` with your public HTTPS service origin.
3. Build a new Windows or Mac release using the existing workflow. The public URL is compiled into the Electron main process. Service keys are never part of the installer.
4. For a local build in PowerShell:

   ```powershell
   $env:ZEBBY_CREDITS_SERVICE_URL = 'https://YOUR-SERVICE'
   npm run desktop:build
   ```

5. Test with a separate empty database and disposable resumes. Choose **Buy credits**, enter your email code, choose a pack, and finish Stripe Checkout in your external browser.
6. In a Stripe test sandbox, use card `4242 4242 4242 4242`, a future expiry, and any valid CVC. No real card charge is made. See [Stripe's testing guide](https://docs.stripe.com/testing).
7. Wait for webhook confirmation. Zebby should show the purchased credits, then allow model selection. Analyze one Plan and one resume match, verify used and remaining credits, and sign in on a second computer with the same email.
8. Test cancellation, insufficient funds, a duplicate webhook delivery, a refund, an expired email code, and a network interruption. Check Stripe deliveries and the Supabase ledger for each result.

No real app, browser, database, email, or Stripe checkout was opened during implementation verification. The checked-in Node tests use an isolated PostgreSQL engine and mocked network requests. Real hosted integration and native visual testing still need the configured accounts and a time when the desktop can be used.

## Packs and estimates

| Price | Credits | About this many analyses using GPT-6 Luna |
| --- | ---: | ---: |
| $5 | 500 | 90 |
| $20 | 3,000 | 540 |
| $50 | 8,000 | 1,450 |
| $100 | 16,000 | 2,900 |

One credit represents $0.001 of underlying provider usage. Fractional credits are retained internally as integer nanodollars. Per-analysis quotes reserve a conservative maximum from the submitted text and output limit, including OpenAI cache writes and long-context rates. Settlement charges actual reported input, cached input, cache writes, and output usage, including billed reasoning tokens; unused holds return to the wallet. Cancelled, failed, and invalid analyses release their holds. Provider costs incurred on those failures are absorbed by Zebby.

If a reply is lost after settlement, Zebby retains the original request ID and can recover the result without another charge. Recovery metadata, without resume or job text, is saved in encrypted local settings when secure storage is available. Main clears it only after the result is saved to SQLite. A pending result can be recovered after restarting on that computer within the server's 24-hour result retention window. Changing accounts rejects obsolete replies and prevents an older account's wallet from replacing the current one.

Counts assume 20,000 input tokens and 6,000 output tokens, with all input charged as cache writes. This costs 5.5 credits with Luna at the rates checked on October 9, 2026. Counts are rounded down to the nearest ten analyses. They are illustrative, not measured average counts or guarantees. Cache hits, different job lengths, and model choice change usage. The catalog is in [online-models.ts](../shared/online-models.ts). Sources: [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [OpenAI Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [OpenAI Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), and [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).

| Price | Maximum provider budget | Stripe assumption | Operating reserve assumption | Retained under these assumptions |
| --- | ---: | ---: | ---: | ---: |
| $5 | $0.50 | $0.45 | $0.25 | $3.80, 76.0% |
| $20 | $3.00 | $0.88 | $1.00 | $15.12, 75.6% |
| $50 | $8.00 | $1.75 | $2.50 | $37.75, 75.5% |
| $100 | $16.00 | $3.20 | $5.00 | $75.80, 75.8% |

These use US domestic card fees of 2.9% plus $0.30 and a provisional 5% operating reserve. They do not guarantee 75% net profit. Confirm your Stripe fees, email and hosting bills, failed-analysis costs, taxes, refunds, and support costs before setting final live prices. [Stripe pricing](https://stripe.com/pricing) lists payment fees.

## Before switching to live payments

Verify that your provider accounts can access every offered model. No provider failure is routed to a cheaper model. Update rates and the price version when costs change; in-flight stale quotes are rejected.

Configure your business details and payouts in Stripe, publish your purchase/refund and privacy terms, and confirm the applicable tax handling. The initial Checkout integration charges the pack amount only; it does not add automatic tax or tax-inclusive accounting. Test first with a small audience and measure actual usage and overhead.

Then replace the Stripe test key and webhook secret with their live equivalents and explicitly set `ZEBBY_ALLOW_LIVE_PAYMENTS=true`. Use a separate Supabase project or reset test accounts through an audited admin process so test balances cannot become live spendable credits. The service rejects events whose test/live mode differs from its configuration.

## Verification commands

```sh
npm run test:credits
npm test
npx tsc --noEmit
npm run desktop:build
npm run credits:build
```

The credit tests exercise the actual SQL functions in in-memory PostgreSQL. They do not prove real multi-connection concurrency, SMTP delivery, Stripe webhook delivery, provider model access, or native window layout. Those are the hosted test-mode checks above. Do not run renderer or Electron checks while someone is using the PC.

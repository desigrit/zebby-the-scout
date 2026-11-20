# ChatGPT plan analysis

Connect your ChatGPT account to use its available models across Plan, application matching, tailored resumes and Boards. Zebby uses OpenAI's documented [ChatGPT plan connection](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). No API key or separate automation is needed.

## Connect

1. Choose **ChatGPT plan** under **Settings > Analysis > Analyze with**.
2. Select **Continue with ChatGPT** and complete authorization in your browser.
3. Select a model returned for your account and its thinking level, when offered.
4. Run **Test connection** to check structured analysis and image inputs. This makes two small model requests.
5. Use **Manage usage** to manage this app's allowance in ChatGPT.

To use only your included allowance, turn off **Allow other apps to use credits after reaching your usage limit** in ChatGPT. That setting applies to all connected apps. Account eligibility, model availability and allowance are determined by ChatGPT.

Your selected method applies across Zebby. A ChatGPT limit pauses new requests and offers **Manage usage** and retry. Zebby keeps the last successful result and does not switch automatically to an API key, a different model or Zebby credits.

## Usage and recovery

**Usage** shows each analysis's model, thinking level and reported tokens. Expand a row for input, output, cached input and reasoning tokens, plus individual attempts. Cached input is part of input, and reasoning is part of output. They are not added twice. Missing measurements appear as **Usage unavailable** or an incomplete total. ChatGPT's allowance and credit balance are available through **Manage usage**.

Completed results are reusable when the workspace, source, account, model, thinking level and instructions still match. Reuse shows **Saved result reused**, creates no new model request and adds no tokens. The app validates cached results before applying them and prevents duplicate saves. A changed source starts a new analysis. An interrupted Boards scan keeps its last successful history.

**Run details** opens the job's folder. **Open jobs folder** opens the parent folder. Usage shows activity from the last seven days; older files remain on disk and completed results remain reusable. There is no automatic history cleanup.

Each job folder contains an immutable `request.json`, readable `instructions.md`, `schema.json`, relevant source files under `input`, per-attempt validated results, usage and recovery state. Resume and job content, and board screenshots when needed, stay in these local files until you remove them. Editing a file does not automatically import a result.

If saving is waiting on your database file, choose **Retry save** in Settings before requesting more analysis. Retry the original analysis action to recover an interrupted result.

## Accounts and privacy

Plan, matching and resume analysis send the required resume and job content directly to OpenAI. Boards sends relevant excerpts, tracking instructions, and screenshots from its isolated browser when necessary. Reading a complete structured board without instructions can finish without a model request. [Privacy details](privacy.md)

Credentials are encrypted by operating-system secure storage in this installation's local profile. They are never included in shared databases, diagnostic logs or job folders. Browser sign-in uses PKCE, state and nonce checks, and a verified identity token. Token rotation is serialized. Disconnect cancels work, requests revocation and removes local tokens. If revocation cannot be confirmed, Settings directs you to verify access in ChatGPT.

**Account options** lets you reconnect an existing registration or connect another account or workspace. Each registration keeps its own identity. Model choices come from that account. Requests use the selected model, strict validated output, streaming and `store: false`.

## Moving from Zebby - Beta

Finish saving and close Beta. Open the same Applications file in public Zebby; its matching Boards companion opens with it. Public keeps its existing app profile and updater. Connect ChatGPT and choose your model in public Settings. Beta's credentials, model preference and local job history remain with Beta.

Public Windows and Apple Silicon builds include the connection. Direct installations update through **Settings > Updates**. Store installations receive their approved updates through Microsoft Store. No GitHub sign-in is required for public updates.

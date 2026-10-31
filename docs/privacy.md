# Zebby privacy

Last updated: October 31, 2026

Zebby is a job application tracker from Desigrit Labs. This page explains what stays on your computer and what is sent when you use connected features.

## Your applications and resumes

Zebby stores your plans, applications, job descriptions, notes, resume files, and saved analysis in the SQLite database you choose. It does not automatically upload that database to a Zebby account.

If you put the database in OneDrive or another synced folder, that service handles synchronization under its own terms. Zebby also keeps local working and recovery copies to protect database saves. Databases and recovery files outside the app's data folder remain on disk when you uninstall Zebby. You control those files.

## Analysis choices

| Method | Where analysis content goes |
| --- | --- |
| Downloaded model | The model runs on your computer. Job and resume content is not sent to an online model provider. Downloading a model contacts its hosting service. |
| Local server | Job text, your summary, and extracted resume text go to the server URL you enter. A server on another computer receives that content. |
| Your OpenAI API key | Job text, your summary, and the selected resume file go directly to OpenAI. Your OpenAI account is billed. |
| Your Anthropic API key | Job text, your summary, and extracted resume text go directly to Anthropic. Your Anthropic account is billed. |
| Zebby credits | Job text, your summary, and extracted resume text pass through Zebby's credits service to the selected online model provider. |

Model providers process requests under their own terms. Retention and use for model improvement depend on the provider and the data-sharing settings of the account serving the request. With your own API key, those are your account settings. With Zebby credits, those are the service operator's account settings. OpenAI requests set `store: false`; this does not override separate provider retention or data-sharing settings.

## Credits, payments, and connected computers

Zebby credits uses a wallet without requiring a Zebby signup. The service stores wallet balances, purchases, credit usage, model and thinking selections for paid analyses, request identifiers, device names, connection times, and hashed device, recovery, and pairing credentials. These records support purchases, access recovery, connected computers, and usage history.

Stripe processes checkout and payment details. Zebby's database stores transaction references, pack amounts, and payment status, not full card numbers. Stripe may collect billing and contact details during checkout. The credits service uses Render for hosting and Supabase for its database.

The credits service processes job and resume text for the requested analysis. Raw input text is not saved as a separate database record. Generated analysis can contain information from your resume and is retained so an interrupted response can be recovered without another charge. Results become eligible for automatic cleanup after 24 hours and are cleared when the service next runs cleanup. Request hashes and financial, device, and usage records remain for wallet operation, payment reconciliation, and abuse prevention.

## Keys, logs, and network requests

Saved API keys and wallet credentials use the operating system's protected storage. If protected storage is unavailable, personal API keys can be kept for the current session; paid credits require protected storage.

Error logs are stored locally with size and rotation limits. They can contain technical details and file paths. Known secrets are redacted. Zebby does not automatically upload these local logs.

Importing a listing contacts the job website and, where available, its public recruiting-platform API. Downloading models contacts the model host. Microsoft Store handles updates for the Store edition; other editions check GitHub for updates. Network services receive ordinary connection information such as your IP address. The credits service uses network information to limit abusive requests, and its hosting and payment providers may retain their own operational records.

## Your controls

You can choose a local analysis method, remove saved API keys, delete downloaded models, manage connected computers, and edit or delete your application records. Deleting a local application or plan does not erase an earlier provider request or payment record. To remove a database completely, also manage any recovery copies and copies kept by your sync or backup service.

For questions or a request concerning service-held information, [contact the developer](https://github.com/desigrit/zebby-the-scout/issues) to arrange a private data request. Payment, security, and legal obligations may require some records to be retained.

## Service policies

- [OpenAI privacy](https://openai.com/policies/privacy-policy/)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
- [Anthropic privacy](https://www.anthropic.com/legal/privacy)
- [Anthropic API retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
- [Stripe privacy](https://stripe.com/privacy)
- [Supabase privacy](https://supabase.com/privacy)
- [Render privacy](https://render.com/privacy)
- [Hugging Face privacy](https://huggingface.co/privacy)
- [Microsoft privacy](https://privacy.microsoft.com/privacystatement)

Updates to this page will be published here with a revised date.

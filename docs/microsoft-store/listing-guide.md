# Microsoft Store listing

Use `listing-en-US.json` for the English (United States) listing. The external handoff folder contains individual text fields, screenshots, artwork, privacy text, and certification notes.

## Listing choices

| Field | Selection |
| --- | --- |
| Product name | Zebby, after reserving that name in Partner Center |
| Category | Productivity |
| Base price | Free |
| Trial | None |
| Purchases | Optional Zebby credits through Stripe checkout |
| Personal information | Yes. Resumes, job-search records, and optional online analysis require a privacy policy. |
| Website | https://github.com/desigrit/zebby-the-scout |
| Support | https://github.com/desigrit/zebby-the-scout/issues |
| Privacy | https://github.com/desigrit/zebby-the-scout/blob/main/docs/privacy.md |
| What's new | Leave blank for the first Store submission. An update version is supplied separately. |
| Language | English (United States) |

The public Sunno listing identifies **Desigrit Labs** as its publisher. Confirm that the new Zebby reservation belongs to the intended Partner Center account. Package identity must come from Zebby's Product identity page, not the Sunno product or its public publisher name.

## Purchases

The app is free. Its current optional packs are $5 for 500 credits, $20 for 3,000, $50 for 8,000, and $100 for 16,000. These are one-time USD purchases through the existing Stripe checkout. Packs of $20 or more unlock GPT-6 Astra for the wallet. GPT-6.1 Sol and GPT-6 Luna are available with every pack. Credits cover actual model usage; analysis counts vary with the task, model, and thinking level.

Personal OpenAI and Anthropic keys use the user's provider account. Ollama and downloaded models do not require Zebby credits. No Store consumable products or subscriptions are needed for the existing external checkout implementation.

## Age-rating questionnaire

Complete the current IARC questionnaire in Partner Center. Use the functionality below to answer it; IARC assigns the regional ratings.

| Topic | Answer supported by this app |
| --- | --- |
| Product type | Non-game productivity app |
| Violence, sexual content, profanity, drugs, gambling, horror | None supplied by the app |
| Purchases of digital goods | Yes, optional credits |
| Randomized paid items | No |
| Advertising | No |
| User-to-user communication or public content sharing | No. Notes, resumes, and job descriptions are private workspace content. |
| Location sharing | No. Job locations are text fields, not device location. |
| Unrestricted web browsing | No embedded general-purpose browser. Listing links, checkout, support, and provider pages open externally. |
| Account requirement | No Zebby signup. Personal-key and server options use the user's chosen services. |
| Generated content | AI analysis of a user-provided job and resume, including match explanations, keywords, and summary edits |

## Artwork and screenshots

Upload the eight PNGs in `Screenshots` in numeric order. Each is 3100 by 1920 pixels. Captions are in `captions-en-US.txt`. Use `Zebby-Store-icon-300.png` as the 300 by 300 app tile icon. The 3840 by 2160 hero is optional and contains only the approved zebra art on the Ember background.

The capture script is `scripts/create-store-listing-assets.mjs`. It uses the compiled renderer, an isolated in-memory data bridge, and a headless browser. It never opens the desktop app, a user database, or a payment session. To regenerate after a renderer build:

```powershell
node --experimental-strip-types scripts/create-store-listing-assets.mjs 'D:\Code\Applications\Microsoft Store listing'
```

## Before submission

Publish `docs/privacy.md` and verify its public URL, or paste the policy text into Partner Center's privacy field where offered. The current source does not establish the live provider accounts' data-sharing switches. The privacy text describes account-dependent retention and model-improvement use without promising that provider training is disabled. Confirm that this matches the live OpenAI and Anthropic service accounts before submission. Keep the private contact route and service-record retention process operational for requests received through support.

Use the reviewer instructions and review files in `Listing metadata` for certification. No private API keys, wallet recovery codes, or customer databases belong in Store assets.

## Microsoft references

- [Listing fields and text limits](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)
- [Screenshot and artwork requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images)
- [Privacy and support fields](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/support-info)
- [Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)

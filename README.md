# PM Application Tracker

A private browser app for tracking product management applications on Windows and Mac.

## What it records

- Company, job title, team, and location(s)
- Job listing link and date applied
- Match strength from 0 to 100 percent
- The uploaded resume used for each application
- Status: Applied, Heard back, Interview scheduled, or Rejected

The dashboard shows total applications, applications this week, roles in conversation, interviews, and average match strength. You can search roles, filter by status, edit applications, change a status in place, and delete a mistaken entry.

Resumes are uploaded once and can be reused for later applications. PDF, DOCX, and DOC files up to 10 MB are supported.

When adding an application, paste the public HTTPS job listing link first. The app tries to fill the company, title, team, and locations from the job board or page metadata. It starts the applied date at the current local date. Review and edit any result before saving. Listings that block automated access can still be entered manually.

## Data and access

Applications are stored in Cloudflare D1. Resume files are stored in Cloudflare R2. Records and downloads are limited to the signed-in owner of each record. When published, the Site defaults to private access.

## Local development

Use Node.js 22.13 or newer. Run `npm ci`, then `npm run db:generate` after schema changes. Set the logical D1 and R2 bindings in `.openai/hosting.json`. Build once with `npm run build`, apply pending local migrations as described below, then start `npm run dev`.

For a new local database, apply both migration files in order. Run this command for the first migration:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_acoustic_triton.sql
```

Then run it again with `drizzle/0001_rapid_eternals.sql` as the file path. For an existing local database created before Team and Locations were added, apply only that second migration.

Open the local sign-in route shown by the development server. The portable preview uses a local test identity. Local database and file storage remain on that computer; the published app uses hosted storage.

## Publishing

The `.openai/hosting.json` file identifies the private Site and its logical storage bindings. Publish through the Sites workflow so source, build output, and database migrations stay together.

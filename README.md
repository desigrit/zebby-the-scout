# PM Application Tracker

A browser app for tracking product management applications on Windows and Mac.

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

The production app is intended for `applications424760.raunakoberoi.com`. Anyone who opens that address can view and change every application, download every saved resume, and upload files. There is no sign-in. The site requests that search engines do not index it, but this does not control access.

Applications and resume metadata use Azure Database for PostgreSQL. Resume files use a private Azure Blob Storage container, served through the app's download route. The app returns 404 on other production hostnames.

For recovery, configure the PostgreSQL server's automatic backups with 35 days of retention and Blob soft delete with 35 days of retention. PostgreSQL's daily snapshots and point-in-time restore cover accidental application deletion more thoroughly than a weekly database copy. See [Azure deployment](docs/AZURE_DEPLOY.md).

## Local development

Use Node.js 22.13 or newer. Run `npm ci`, copy `.env.example` to `.env.local`, and set the real PostgreSQL and Azure Storage connection values. Run `npm run db:migrate` and `npm run dev`. The development server accepts `localhost` and `127.0.0.1`.

After changing `db/schema.ts`, run `npm run db:generate` and commit the new migration. Run `npm run build` and `npm test` before deployment.

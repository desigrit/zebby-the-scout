# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

An Electron desktop app with one user-selected SQLite file. The file can live in a cloud synced folder and is shared between the user's computers.

## Users

One person applying to several product management roles a day. This personal-use assumption is open to revision.

## Product Purpose

Plan a resume for each job posting, record each application, and see application volume, match strength, and progress through hiring stages.

## Operating Context

The user keeps job listing links and uses different resume versions. They need to plan for several postings and add applications frequently on Windows and Mac. They will quit the app and wait for cloud sync before switching computers.

## Capabilities and Constraints

- Record company, job title, team, locations, listing link, date applied, match strength, resume used, and status.
- Put the listing link first and try to fill company, title, team, and locations from public job data. Start the applied date at today and keep every field editable.
- Show application statistics.
- Make saved records available across the user's computers.
- Store uploaded resume files so they can be reused across applications and opened on either computer.
- Score match strength from 0 to 100 percent.
- Initial statuses follow the requested stages: Applied, Heard back, Interview scheduled, and Rejected.
- Provide Plan and Applications tabs. Plan keeps multiple job briefs, editable ATS keywords, resume themes, and ideal candidate CV overviews.
- Analyze a saved job brief with GPT-6 Sol through the OpenAI API. The user enters an API key in Settings on each computer.
- Store uploaded resumes as SQLite BLOBs in the same chosen database file as applications and plans.
- Keep weekly local backups and detect outside changes to the selected cloud file before saving.
- Use native file dialogs, platform fonts, and a left navigation for Windows x64, Windows ARM64, and Apple Silicon macOS. No account sign-in is required.
- Keep appearance and optional diagnostic logging in local settings on each computer.

## Product Principles

- Make adding several applications in a day quick.
- Keep every recorded field visible or easy to edit.
- Make progress and match patterns clear without requiring manual calculation.
- Preserve data between sessions and devices.
- Make the cloud sync sequence clear before switching computers.

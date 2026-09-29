# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

An Azure-hosted web app with a durable database, available on Windows and Mac through a browser.

## Users

One person applying to several product management roles a day. This personal-use assumption is open to revision.

## Product Purpose

Record each application and make it easy to see application volume, match strength, and progress through hiring stages.

## Operating Context

The user keeps job listing links and uses different resume versions. They need to add applications frequently and check their progress on both Windows and Mac.

## Capabilities and Constraints

- Record company, job title, team, locations, listing link, date applied, match strength, resume used, and status.
- Put the listing link first and try to fill company, title, team, and locations from public job data. Start the applied date at today and keep every field editable.
- Show application statistics.
- Make saved records available across the user's computers.
- Store uploaded resume files so they can be reused across applications and opened on either computer.
- Score match strength from 0 to 100 percent.
- Initial statuses follow the requested stages: Applied, Heard back, Interview scheduled, and Rejected.
- Anyone who visits the chosen public subdomain can view and change records, upload resumes, and download them. The app has no sign-in.
- Keep PostgreSQL point-in-time backups and Blob soft delete available for recovery.

## Product Principles

- Make adding several applications in a day quick.
- Keep every recorded field visible or easy to edit.
- Make progress and match patterns clear without requiring manual calculation.
- Preserve data between sessions and devices.

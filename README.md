# PM Application Tracker

A desktop app for planning product management applications and tracking the roles you apply for.

## Install

Download the package for your computer from the repository's **Actions > Desktop packages** run:

- Windows x64: `PM-Application-Tracker-*-win-x64.exe`
- Windows ARM64: `PM-Application-Tracker-*-win-arm64.exe`
- Apple Silicon macOS: `PM-Application-Tracker-*-mac-arm64.dmg`

These are unsigned personal builds. Windows SmartScreen or macOS Gatekeeper may ask you to confirm that you trust the app. On macOS, use System Settings > Privacy & Security to allow it after the first launch if needed.

On first launch, choose **Create database** or **Open existing database**. Put the `.sqlite` file in a cloud synced folder if you want the same data on both computers. In Settings, choose that file on each computer. Quit the app on one computer, wait for its cloud drive to finish syncing, then open the app on the other computer. Keep only one computer editing the file at a time.

The app keeps a local working copy and writes complete snapshots back to the selected file after changes. It detects if that cloud file changed outside the app before it saves. A backup copy is kept in the local backups folder at least once a week. Settings has a button to open that folder.

## Plan

Paste a public HTTPS job listing link and use **Read listing** to fill available details and job text. If a site blocks automatic reading, paste the description yourself. Save a separate plan for each posting.

Add an OpenAI API key in Settings, then choose **Analyze with GPT-6 Sol**. The app sends the saved job description to the OpenAI API and saves 6 to 20 ATS keywords, 5 or 6 resume themes, and an ideal candidate CV overview in the same SQLite file. All three outputs are editable. The overview describes an ideal profile, so check it against your real experience before using it. OpenAI API usage may be billed to your account. The API key is stored on the current computer, separate from the shared database.

## What it records

- Company, job title, team, and location(s)
- Job listing link and date applied
- Match strength from 0 to 100 percent
- The uploaded resume used for each application
- Status: Applied, Heard back, Interview scheduled, or Rejected

The dashboard shows total applications, applications this week, roles in conversation, interviews, and average match strength. You can search roles, filter by status, edit applications, change a status in place, and delete a mistaken entry.

Resumes are uploaded once and can be reused for later applications. PDF, DOCX, and DOC files up to 10 MB are supported.

When adding an application, paste the public HTTPS job listing link first. The app tries to fill the company, title, team, and locations from the job board or page metadata. It starts the applied date at the current local date. Review and edit any result before saving. Listings that block automated access can still be entered manually.

## Build from source

Use Node.js 22.13 or newer. Run `npm ci`, then `node node_modules/electron/install.js` to download the local Electron runtime. Run `npm run desktop:dev` to launch the desktop app. Run `npm test`, `npx tsc --noEmit`, and `npm run lint` to check changes.

The package commands are `npm run desktop:package:win:x64`, `npm run desktop:package:win:arm64`, and `npm run desktop:package:mac:arm64`. Windows packages are built on Windows; the macOS package is built on Apple Silicon. The GitHub Actions workflow runs all three builds and uploads the installers as artifacts. The earlier Azure web implementation remains in the repository but is not needed for the desktop app.

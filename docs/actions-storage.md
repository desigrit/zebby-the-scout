# Actions artifact retention

Published installers and update files stay in GitHub Releases. Maintenance never deletes releases, tags, source files, run logs or dependency caches.

After a build completes, and daily as a fallback, the maintenance workflow removes superseded artifacts from known build families. It keeps the latest completed output, the latest successful output for each platform, every open pull request's evidence, and active or unknown workflow outputs. New artifact families are preserved until explicitly added to the policy.

Zebby installer artifacts last one day, diagnostic evidence at most three days, and Store submissions three days. Spice Route and Shambu package artifacts last seven days. Download the permanent installers from Releases.

Released Store submissions are copied to a versioned ZIP on the matching existing release before cleanup. The archive is verified against the build and release checksums. An archive failure stops that cleanup run.

Run `node scripts/prune-actions-storage.mjs` to preview the repository's cleanup. Add `--apply` to remove only the superseded artifacts. Both commands require `GITHUB_REPOSITORY` and an authenticated GitHub CLI. Review the workflow summary for the amount removed.

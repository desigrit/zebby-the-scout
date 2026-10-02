# Zebby 1.6.0 UX health

The independent post-redesign review assessed the approved desktop Operate direction: Ember Applications and Settings, and Rosewood's Plan document composition in Ember colors. It found two material regressions, both resolved in one correction batch. The final disposition is ship for those two fixes. That verdict is not a new whole-surface audit or an inference quality certification.

## Resolved findings

| Finding | Initial severity | Final evidence |
| --- | --- | --- |
| Applications role access at short logical heights and 200% scaling | High | The overview compacts and page scrolling retains a role region with a 280px minimum. The 200% capture reports a 296 CSS px list client height; the companion frame shows a keyboard-focused role with expanded details. Normal-height list and inspector scrolling remain independent. |
| Cancel after a result has persisted | Medium | Committing/completed requests reject cancellation and bounded terminal IDs reject replay. A delayed-response native check confirms that Cancel leaves the already-saved score, pending response, visible result, and saved notice in agreement. Genuine early cancellation still aborts provider work and preserves previous analysis. |

## Remaining observations

| Observation | Severity | Scope |
| --- | --- | --- |
| Draft/discard behavior (F01) and setup-navigation discard behavior (F03) can lose unsaved work | Medium | Deliberately unchanged at the user's direction. These are existing scope decisions, not Ember regressions. No draft recovery, autosave, or additional discard guard was added. |
| Small metadata and icon-only row actions can slow first use | Low | Native labels, tooltips, focus, and the persistent inspector provide context. The residual concern remains. |
| Long plans require scrolling between sources and recommendations | Low | Save stays outside document scrolling and lists remain editable/copyable. The residual distance remains. |

## Evidence and limits

The final supplied evidence includes 72 tests, lint, typecheck, build, complete headless regressions, ten native interaction checks, and 37 settled native capture frames with no errors. Reviewers inspected all indexed frames at original resolution. These suite results are supplied implementation evidence; the documenter did not rerun them.

Native captures came from an isolated hidden Windows Electron process using synthetic 36 applications, 13 plans, and a dummy resume. Provider outputs and clipboard were mocked. No real profile, database, API credentials, model downloads, or user clipboard was used. Windows native interactions and both platform renderer simulations were checked. Physical macOS fonts, chrome, scrollbar behavior, and native installer execution remain outside this local evidence. CI handles installer build/test gates separately.

The review found the approved palette, compact ledger/inspector, paired Plan document, simple recommendation rows, complete optional form, native shell, zebra, and navigation motion coherent. The review reported light primary contrast of 5.75:1 and readable muted text in the sampled themes. A separate QUALITY BAR card was not supplied. No prior numerical score was read, no new score is assigned, and no trend is claimed.

One detector pass produced 154 advisory comparisons with the old documented system, without warning/error findings. The approved-system documenter replaced stale Graphite tokens using shipped source values. No second detector, doctor, or context rerun was performed.

The refreshed [Applications screenshot](screenshots/applications.png) and [Plan screenshot](screenshots/plan.png) are copies of the valid native synthetic light captures, with their origins embedded by Impeccable. They are test screenshots, not generated artwork. Existing zebra assets remain unchanged.

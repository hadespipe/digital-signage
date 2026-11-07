# Implementation decisions — 2026-11-07

Recorded from the subagent execution ledger before temporary review artifacts
are removed. These decisions are reversible implementation choices, not new
requirements imposed on the user.

| Order | Decision and reason | Cost or limitation |
| --- | --- | --- |
| 1 | Use the approved plan's managed worktree and `codex/digital-signage-implementation` branch without another worktree question. | Integration into `main` is a separate step; the original checkout is preserved. |
| 2 | Initial login validates exact Origin without a pre-login CSRF token; authenticated writes require Origin plus the session CSRF token. | A session cannot supply its token before it exists; credentials alone never authorize writes. Tests cover both boundaries. |
| 3 | Do not add original filenames to the approved image contract. Initially display generated IDs; later simplify cards to image positions and remove raw IDs. | Original names are not preserved/displayed; adding them later requires metadata/UI work. |
| 4 | Keep Docker tests out of ordinary server verification; initial consideration of skipping when Docker is absent was superseded by decision 6. Hardware remains an explicit acceptance gate. | Mac tests cannot establish Linux or physical TV compatibility. |
| 5 | If metadata rename succeeds but subsequent directory sync fails, keep the published state rather than roll it back. Return a safe error and refresh authoritative state in the admin. | An error can accompany an already committed mutation; investigate the persistent filesystem before retrying blindly. Pre-publication rollback remains tested. |
| 6 | Put opt-in container tests under `tests/container/` rather than the planned `tests/server/` path. Missing Docker fails explicitly with BLOCKED and never counts as success. | Different test path; `bun run test:container` remains the documented entry point. Linux compatibility remains unverified until run. |
| 7 | Defer the scoped final review's nonblocking Preview-link CSS selector issue; it does not affect navigation, authentication, slideshow or settings recovery. | Default link contrast remains a cosmetic/accessibility follow-up. Correcting the selector is a small future change. |

No Critical/Important review findings remain after the single consolidated final
fix wave. Linux/native dependencies/memory sizing, old Chromium and physical LG
acceptance were neither waived nor represented as passing before device access.
Later device access verified the actual engine and the specific installation,
persistence, slideshow and simulated-outage checks in `verification.md`; remaining
manual/platform gates are still explicit. No hosting was
provisioned, no app-store release was made and no automatic Developer Mode
renewal was introduced.

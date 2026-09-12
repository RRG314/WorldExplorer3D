# Publication boundaries and verification

This research package is intended for the separate GitHub branch `steven/research-embodied-society` in WorldExplorer3D. Its first public commit is a sanitized root snapshot. Private ancestor commits are not pushed. Existing `stable`, `main`, tags, releases, repository visibility and live hosting are not changed.

The snapshot retains the working application as the research environment dependency. It omits local Firebase project targeting/configuration and deployment workflows. Research-only verification and secret scanning remain. The local research server supplies its own disabled account configuration. This package is for local research and inspection, not direct deployment as the production app.

`prepare-publication.py` builds a candidate tree using a separate Git index and existing objects, without creating a second application checkout, copying large assets, changing the current index or pushing anything. It preserves already-public baseline documentation, admits explicitly reviewed new system/research documents, replaces personal machine paths in those documents, and supplies a research-first public README. Its output manifest lists exclusions and provenance. Git identity for public snapshot creation must use the project name and GitHub noreply identity rather than a personal email.

Before push, scan the candidate commit with Gitleaks, review personal-path/email and private-file checks, verify documentation links and run the bounded research checks against the candidate source. Push only the exact candidate commit to the new research ref. No force push, release event or merge is part of initial publication. Re-read remote `stable` and `main` identities afterward and check research CI.

A first-party release-event webhook was observed; it is not triggered by a branch push. Existing GitHub Pages configuration deploys from stable, and its workflow is omitted here. This inspection is not a universal claim about every external service, but the publication does not change the refs or issue the events used by the inspected deployment paths.

Local preparation verification: 59 existing research tests passed; seven new recordkeeping tests passed; the five-run inventory and deterministic summary validated. No additional live provider call, browser, emulator or deployment was performed for packaging. Final candidate scan and remote CI outcomes are reported with the publication result, not preemptively labeled passing here.

The public source remains under the existing source-available license. Names and copyright notices already provided for public attribution remain; private account identifiers, keys, emails, raw logs and unrelated user media are not intended publication content. Automated scans are supplemented by explicit scope review; no scan is an absolute guarantee.

Subsequent public updates must be fast-forward commits parented only to the already reviewed public research history. Never push the private development HEAD to the public ref, and never force-replace the public branch to hide a failed check. The first remote research suite passed; the original secret-scan action failed on a nonexistent root-parent revision. It was replaced with checksum-pinned Gitleaks scanning complete HEAD history, preserving that failed run as evidence.

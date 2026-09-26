# Release work entry point

Work in `/Users/stevenreid/Developer/WorldExplorer3D-release-integration` on
`steven/post-5.2-release-integration`. Keep ordinary Chrome open; run heavy
verification remotely. Follow AGENTS.md resource and credential rules.

## 5.3 preparation — September 25, 2026

PR #87 is merged into stable. The integration branch retains its detailed history
and incorporates stable ancestry. The v5.3.0 GitHub release is a draft:
**World Explorer 3D 5.3 — Further into the World**. Do not publish it or claim the
frontend deployed. Public documentation is in RELEASE_NOTES_5.3.0.md, ROADMAP.md,
CHANGELOG.md and docs/RELEASE_INTEGRATION_STATUS.md. The comparison against both
published and live 5.2 baselines is docs/RELEASE_COMPARISON_5.3.md.

Production remains5.2.0+db62593ba377.6342cddaba06fc68.production. Last verified
staging is5.3.0+56fcf94d400b.e1ad84e8534bf3fc.staging. Later candidate source fixes
two module URL identities; do not confuse it with that deployed staging artifact.
Production mutateSharedExpedition is now ACTIVE version4 (2026-09-26T02:01Z).
All11 declared composite indexes and12 field overrides match ready production
indexes. Existing environment parameters were preserved; temporary env removed.

PR source/component/inventory/sensitivity and secret scans passed. Final ship
visuals and smoke passed36209521137; research and two-player backend checks passed
36207818083 and36207910233; destination gallery passed36207329569; wayfinder
passed36208510386. All25 room views and camera modes were reviewed. Latest stable
artifact checks run36210611726 and runtime run36210599010 are pending readback.
Stable squash secret scan flagged the already-reviewed browser actor property,
not a credential; a scoped historical fingerprint and inline explanation repair
that false positive without disabling secret detection.

No physical-phone responsiveness acceptance or production artifact finalization
is claimed. Utility-equipment art remains simpler than licensed furnishings.
Do not repeat completed unchanged tests without a failure or a relevant change.
Evidence: output/release-integration/release-preparation and
output/release-integration/ship-systems-redesign. Temporary AppCheck registration,
GitHub test credential and private file were removed after the visual runs.

The user's “other branch” was interpreted as the integration branch; an optional
question about main was unanswered. Main has not been modified.

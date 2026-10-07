# Release status

Updated October 7, 2026. The 5.5.0 update is being prepared for release.
The production frontend remains on 5.4 until a verified promotion is recorded here.

The owner has authorized the GitHub update, versioned release, public project
page and production deployment. Authorization is recorded separately from
verification: it does not turn missing device checks or failed performance
measurements into passing results.

The public overview is [5.5 release notes](../RELEASE_NOTES_5.5.0.md).
[Known limitations](../KNOWN_ISSUES.md) describe the remaining product work.
Exact build identities and acceptance evidence belong in
[release source of truth](RELEASE_SOURCE_OF_TRUTH.md) and the internal evidence
ledger, rather than the public release body.

## Remaining acceptance

The current package and hosted preview are `4dd2e37c`, with the same 615 delivered
file hashes as the owner-tested `135e3895` preview. Source checks pass 2,109 tests;
world preflight passes 29 checks. All three current backend gates pass, including
14 general backend stages and the complete two-client shared research voyage.

All 80 production Functions now contain the tested backend source, verified by
downloading the actual deployed archives. All 11 existing parameters are preserved.
Firestore accepts the tested ocean-presence values; Storage rules are unchanged.
Live protocol probes pass for voyage authority, save retry and legacy compatibility,
receipt ownership and isolation. All temporary fixtures and accounts were removed
and checked absent. Both provider-cache expiration policies are ACTIVE as of
22:06 UTC. The exact live frontend is retained through November 6, independently
verified against its Hosting version and both manifests. The public frontend
remains on 5.4.

The full frozen 91-gate candidate matrix is running. The current 4dd2 save upgrade,
fallback write and candidate return pass, retaining existing records and unrelated
pending account data. Public weather/marine rights, deployed-source identity and
packaged UI attribution are reviewed; no paid data subscription is required.
Sustained movement on this game payload still has visible pauses; its retention
run was interrupted when disk space became critically low. The original failed
matrix and resource measurements are preserved. No performance threshold was
relaxed or building coverage removed.

The owner reports that the 135 preview works on Android. This is smoke feedback,
not measured thermal/memory, iOS, uncoached-player or ordinary hosted acceptance.
Those remaining checks are kept explicit. Owner-authorized cleanup preserved
source history, compact evidence, production and the reviewed rollback artifact.

The research vessel still uses its existing custom model. The licensed vessel,
broader wildlife and ocean activities, spearfishing, and unrestricted continuous
world travel are not included in 5.5. These are explicit scope limits, not
features certified by the release checks.

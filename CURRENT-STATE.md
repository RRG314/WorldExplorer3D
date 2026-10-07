# Current development and release state

Updated October 7, 2026. **5.5.0 is a release candidate; production promotion is pending.**
The owner has authorized GitHub, Pages, a versioned release and production deployment.
The draft release acknowledges the remaining product limitations. Failed or missing
verification has not been represented as acceptance.

## Working checkout

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`,
branch `steven/visual-quality`. Do not edit the older Documents/Developer checkouts.
Preserve existing location work, player data, retained artifacts and Git history.
On this observed 8 GiB Apple M1 Mac, run heavy verification sequentially and close
only owned browsers and servers. Ordinary user Chrome must remain open.

## Build identities

| Surface | Current identity |
| --- | --- |
| Production | `5.4.0+1532bdfbb5c1.319d215f60318297.production` |
| Hosted preview | `5.5.0+4dd2e37c69a9.e85c0302553a7fda.staging` |
| Local immutable candidate | `5.5.0+4dd2e37c69a9.e85c0302553a7fda.staging` |
| Candidate source | `4dd2e37c69a9ccd0a946d3bf2af984faaaadb5a5` |

The candidate has 615 verified files. Its asset manifest SHA256 is
`c46fe0700a1f804fafd19531896587a217134a48f18691015dcb095d21d442e0`.
The compatible `37a12d11` rollback, production, earlier hosted preview and recent
`1033`/`316` diagnostic packages remain retained. Forty-seven obsolete clean
staging packages were removed at the owner's request after their source was
verified in pushed Git ancestry; their manifests and test reports remain.
The local 4dd2 candidate records the corrected marine verifier; all 615 delivered
file hashes exactly match the owner-tested 135 preview. The 135 package is retained.
A documentation-only commit does not change this packaged runtime identity.

## Completed verification and repairs

The full source chain passes **2,109 tests**, dependency/source/ownership/type
checks, inventory and sensitivity checks. GitHub PR and secret scanning pass.
The targeted dependency audits report no known vulnerabilities.

The first complete candidate matrix on the previous `1033fb88` package finished
61 passes and 30 failures. Twenty-one later checks stopped before gameplay when
a disposable staging test credential expired. Those results are preserved under
`output/release-evidence/history/candidate-1033-20261007`; they are not passes for
this candidate. The private wrapper now renews and cleans up its staging identities.

Real geometry queries identified three Monaco junctions removed by tunnel
excavation. Full surface-carriageway roof constraints now participate in the
existing graph/grade solver. The source Monaco check reports zero junction gaps
and zero discontinuities across 1,216 sampled joins. Real keyboard tunnel
approach, bore and exit pass six checks. Terrain and retaining edges still need
visual polish; functional passage is not final art acceptance.

On the retained previous package, corrected marine research (eight cases),
habitat (seven cases), real Earth/ship/lift/exit and prescribed Moon movement/pause
checks pass. Screenshots were inspected. A prescribed Monaco source run recorded
external Overpass and imagery CORS failures; it is retained as failed evidence.
The public Pages layout passes desktop and phone-width overflow/image checks.

The aircraft client now permits gateway startup within a 20-second envelope;
the IPv4 upstream has one absolute nine-second deadline through connection and
body delivery. Focused provider tests pass. Staging `getAircraftStates` version 6
is ACTIVE. Production now has aircraft version 5, place lookup version 1 and
environmental data version 1 ACTIVE. All 11 existing deployment parameters are
preserved. A downloaded-source audit then found the other 77 Functions still
used older packages. All 77 are now updated, and all 80 deployed source archives
match the 36 tracked backend code/configuration files. The protected endpoints reject
missing App Check with 401, and a live bounded aircraft query returned 200 in
1,005 ms. The public frontend remains on 5.4. Firestore now admits the tested ocean
presence values; Storage rules are unchanged. Actual production protocol tests
pass for marine authority, condition-save retry/legacy compatibility, discovery
receipts and account isolation. All three temporary accounts and owned fixture
documents were removed and their absence verified. Two deployment IAM lookup
errors were reconciled against live ACTIVE versions and matching permissions;
no permission change or whole-rollout retry was needed.

The current preview was deployed after its packaged-world preflight passed all
29 checks with no browser errors or failed local resources. Hosted manifests
confirm the preview identity above and unchanged production. The rollback
verifier now streams large Git blobs and awaits the visible Start control.
Large-asset corruption regression and all 160 reviewed file pairs pass.

## Remaining release work

Actual preview-server checks found older save-state code and rejection of the
current preview origin, despite that hostname already being authorized for sign-in.
A staging-only source/configuration alignment is prepared; production origin checks
pass. Complete that alignment and an ordinary hosted journey before calling the
preview representative of the tested backend.

Live providers passed on the identical `316` game payload. Seven sustained
movement windows completed: five fail the hitch limits, with worst observed
walking/drive frames of 583.2/366.6 ms. The cleanup sequence was stopped after six
reported reload cycles when disk availability fell to 541 MiB; remaining cleanup
and mobile checks are incomplete. Obsolete private heap captures and inactive
test-browser data were then removed at the owner's request, recovering about
3.8 GiB; pruning old staging packages recovered additional space. Compact
diagnostic reports and analysis scripts were preserved. No threshold was relaxed.

The packaged save upgrade → fallback write → candidate return journey
passed on the current 4dd2 package, retaining 64 seeded items, existing and new records, equipment controls
and unrelated pending account data. No browser errors or failed local requests
were recorded.
The current 4dd2 backend matrix passes all three gates: the general backend
suite (14 stages), place authority, and shared marine. The latter passes all
12 two-client journey cases and three rules cases. Two verifier races were
corrected: temporary network backpressure and waiting for the server's stopped
pose before recording a study. Runtime ownership rules are unchanged.
The owner reports the current preview works on Android. This is a smoke check,
not measured device/thermal or iOS acceptance. The full frozen 91-gate candidate
run is in progress. The current save roundtrip and public weather/marine rights,
deployed-source and packaged-attribution review pass. Ordinary hosted, named
physical-device and uncoached-player acceptance remain unverified. The old resource baseline covers 25,529 Baltimore
buildings; restored coverage retains 49,023. No coverage was removed or resource
threshold silently changed to turn that mismatch into a pass.

PR [96](https://github.com/RRG314/WorldExplorer3D/pull/96) and release `v5.5.0` are
drafts. Stable, public Pages and production have not been promoted. The updated
preview is available at `https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app`.
The supporting production provider rollout is complete; frontend promotion is pending.

The licensed replacement research vessel, broader ocean wildlife/activities,
spearfishing and worldwide streaming are **not implemented by this release**.
Earth remains bounded and location based. See [known issues](KNOWN_ISSUES.md),
[release preparation](docs/release-review/2026-10-07/RELEASE-PREPARATION.md), and
[release identities](docs/RELEASE_SOURCE_OF_TRUTH.md). Earlier investigations remain
in Git history, their dated evidence folders and `progress.md`.

Private cloud configuration and credentials remain outside the repository under
`~/Library/Application Support/WorldExplorer3D/verification-private`. Never print
raw configuration or credential files, and never attach them to release material.

Four provider-cache field policies were applied without changing the 11 existing
composite indexes or 19 unrelated field policies. Both expiration policies are ACTIVE as of 22:06 UTC. Only generated provider
caches are affected. The exact live 5.4 frontend was independently matched by
Hosting version and both manifest bytes; its preserved `release-54-1532` channel
now expires November 6 at 22:26:58 UTC. This exact-live copy is separate from the
reviewed save-compatible 37a fallback.

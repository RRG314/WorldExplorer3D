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
| Existing hosted preview | `5.4.0+86fdc6e3e6a2.febba16c0a5e3daa.staging` |
| Local immutable candidate | `5.5.0+316ba33d0d7f.e85c0302553a7fda.staging` |
| Candidate runtime source | `316ba33d0d7f6e75c4054fe7bcf92682c8b33d29` |

The candidate has 615 verified files. Its asset manifest SHA256 is
`c46fe0700a1f804fafd19531896587a217134a48f18691015dcb095d21d442e0`.
Earlier candidates and the compatible `37a12d11` rollback artifact remain retained.
A documentation-only commit does not change this packaged runtime identity.

## Completed verification and repairs

The full source chain passes **2,108 tests**, dependency/source/ownership/type
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
is ACTIVE with the existing deployment parameters verified unchanged. No
production Function was changed.

## Remaining release work

Current-package live-provider and sustained performance checks are in progress.
The complete current candidate and backend matrices, save/fallback/write/return,
ordinary hosted journey, named physical devices and uncoached player acceptance
still need current evidence. The old resource baseline covers 25,529 Baltimore
buildings; restored coverage retains 49,023. No coverage was removed or resource
threshold silently changed to turn that mismatch into a pass.

PR [96](https://github.com/RRG314/WorldExplorer3D/pull/96) and release `v5.5.0` are
drafts. Stable, public Pages and production have not been promoted. Production
still needs its coordinated place/environment provider rollout.

The licensed replacement research vessel, broader ocean wildlife/activities,
spearfishing and worldwide streaming are **not implemented by this release**.
Earth remains bounded and location based. See [known issues](KNOWN_ISSUES.md),
[release preparation](docs/release-review/2026-10-07/RELEASE-PREPARATION.md), and
[release identities](docs/RELEASE_SOURCE_OF_TRUTH.md). Earlier investigations remain
in Git history, their dated evidence folders and `progress.md`.

Private cloud configuration and credentials remain outside the repository under
`~/Library/Application Support/WorldExplorer3D/verification-private`. Never print
raw configuration or credential files, and never attach them to release material.

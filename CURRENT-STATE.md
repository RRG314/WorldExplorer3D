# Current release state

Updated September 28, 2026.

## Workspace and authority

Worktree: `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`.
Branch: `steven/architecture-evaluation`.

The owner authorized production deployment and GitHub updates on September 28,
superseding earlier local-only instructions. Keep ordinary Chrome open. Run
heavy local work sequentially and preserve source, history and private data.
Never print raw cloud configuration, credentials or private audit snapshots.

## Production

The live frontend is `5.3.0+2839df5d6bbe.114f3c83341f2200.production`, source
`2839df5d6bbed9f8dfa4b89e379ba2e026cab438`. Its tested staging counterpart is
`5.3.0+2839df5d6bbe.7492cbb92de5e631.staging`. Production promotion changed only
the three generated Firebase configuration assets. The previous live frontend
is preserved in Firebase channel `rollback-bbe65022`.

The action-cooldown backend fix is deployed to `commitUrbanImpacts`; its runtime
configuration and IAM bindings are unchanged. No rules or index changes were
needed. Live file integrity, unauthenticated endpoint rejection, sign-in panels,
public-room browsing and the Chicago weekly-city label were verified.

## Evidence and limits

The runtime candidate passed 56 functional/source/package/browser gates and
all 13 isolated backend stages. A fresh two-client weekly-room check loaded both
worlds, verified shared membership and visible presence, and had its screenshots
inspected. It was an isolated-service test, not a signed-in production session.

The formal performance gate remains failed: dense-city ground FPS, transient
heap and aircraft activation exceeded their limits. Repeated-session renderer
footprints remain high. No thresholds or failed receipts were changed. Physical
phone responsiveness remains unverified. See
[release status](docs/RELEASE_INTEGRATION_STATUS.md) for current results.

The ignored `output/release-deploy-20260928/` directory contains deployment
receipts, a fresh weekly-room test and live integrity checks. Earlier gate
receipts belong to the exact runtime commit, not subsequent documentation
commits. Do not rerun passed checks without changed code or a new concern.

## Architecture scope

Terrain allocation, indexed water sampling, road/terrain overlap, bounded
building compilation, pavement-worker retention and spotlight shader variants
were improved without reducing mapped-world coverage. Browser-first runtime
behavior is preserved. The portable-core and action-system studies contain
prototypes, not a replacement renderer, deployed action gateway, authoritative
movement server or complete PvP mode.

Dated investigation documents and older progress entries are historical leads.
Use hosted manifests, Git and current receipts to establish the actual state.

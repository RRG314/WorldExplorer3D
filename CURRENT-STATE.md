# Current local verification state

Worktree: `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`
Branch: `steven/architecture-evaluation`. This work remains local; do not push or deploy automatically. Keep ordinary Chrome open. Run heavyweight checks sequentially and preserve source/history.

## Production identity verified September 27, 2026 UTC

The public build manifest at `https://worldexplorer3d.io/build-manifest.json` reports
`5.3.0+bbe6502228e3.8044052b36c00b4a.production`, clean source commit
`bbe6502228e369fe2a15dc6a177f5d83948584c3`. Earlier notes describing production as 5.2 are historical and no longer current.

## Local scope

The measured refactor changes location-selection boundaries, service lifecycle, frontage/profile/decal calculations, renderer diagnostics and Earth presentation cleanup. Later local changes add shared layered character animation, equipment presentation, presence wrap/frame fixes and a server action cooldown repair.

The new action resolver and receipt ledger are contained R&D components. They do not establish a deployed action gateway, server movement, PvP, durable shared pickups or a complete new multiplayer game mode. They must not be presented as shipping capability. Details: `docs/action-game-rnd/ACCEPTANCE_MATRIX.md`.

## Current verification

Focused verification passed: current component suite without skips, portable-boundary types, backend admission/capacity/privacy and urban/civic authority, built public-room discovery and two-player vehicle handoff, packaged Moon controls/pause, Moon/Mars/Space/Ocean entry, equipment use, ship research, shared expeditions, chat and short transport reconnect. Screenshots exposed a planetary ground/star hitbox mismatch; it was fixed and visually rechecked in candidate `b7d62ba1`.

Read-only production checks confirmed public room queries (unfiltered and city-filtered), three READY directory indexes and ACTIVE join/vehicle/impact Functions. No production data was modified. Production's old server cooldown implementation remains unchanged until an authorized backend release.

The full release gate is still pending. Use the machine-written evidence in `output/release-evidence/current/` and the final `verify:release-ready` result; do not substitute this note, test counts or focused diagnostics for a completed matrix. The current regression reports are under `output/verification/refactor-release/` and each named verification directory.

No new authoritative PvP capability or automatic deployment is approved by these results. The R&D program and physical-phone acceptance remain separately incomplete.

## Loading investigation — September 27

See `docs/architecture-evaluation/LOADING_AUDIT.md` for measured loading bottlenecks, local repairs, rejected experiments and the implemented staged road publication. The staged-loading runtime was `8b5c0161`: a same-night Baltimore comparison entered in 56.339 s versus 64.382 s, with all 555 road regions complete around 72.35 s. Background refinement has a temporary frame-rate cost; completed-world driving/flight were in the previous build's range. Local loading improvements do not close the full release gate. Production was not changed.


## Memory follow-up — September 27

The previous user-tested runtime `5e88a56b` (candidate `5.3.0+5e88a56b9f21.caccc30c0e584177.staging`) shares vegetation geometry, packs traversal adjacency and releases old-world indexes/closures/support references. Two actual Baltimore load/exit cycles retained full road coverage and passed Backpack re-entry; a WeakRef confirmed collection of the first world's road. Main Menu heap fell from 162.29 MiB to 41.58/43.20 MiB. Settled heap/backing storage fell about 34/59 MiB on the first visit. The unprofiled loading comparison remained approximately 55 seconds; no substantial additional load-speed gain is claimed. See `docs/architecture-evaluation/MEMORY_AND_LOADING.md` for scope, measurements and remaining costs. Production and GitHub are unchanged.


## Whole-process memory — September 27–28

Latest local runtime: `8910f7d5`, candidate `5.3.0+8910f7d5ee2b.31be0230ce176c9a.staging`. Terrain sampling/clipping avoids transient objects, lossless building compaction saves 61.70 MiB per CPU/logical GPU geometry copy, and pavement overview allocates only useful cells and releases finished inputs. No world coverage or visual-detail settings were reduced.

The reported ~3.8 GiB renderer footprint reproduced on physical M1. Sparse-overview road-ready measurements reduced renderer footprint approximately 240 MiB and active worker heap from 352 to 167 MiB. Final completed-background measurement: 3,119 MiB primary renderer, 4,311 MiB browser-owned sum; the native ownership gap remains unresolved. First-play loading remains 55–60 seconds. Full overview completion was observed after about 208 seconds from probe start, with worker shutdown. See `docs/architecture-evaluation/RESOURCE_BUDGET.md` for budget calculations, exact evidence scopes and harness failures. Do not represent these results as a complete performance fix or production certification. GitHub and production remain unchanged.

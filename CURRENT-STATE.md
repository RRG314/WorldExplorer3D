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

See `docs/architecture-evaluation/LOADING_AUDIT.md` for measured loading bottlenecks, local repairs, rejected experiments and remaining publication architecture work. Local loading improvements do not close the full release gate. Production was not changed.

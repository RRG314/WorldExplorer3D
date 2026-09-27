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

- Current component suite: passed all executed checks, no skipped cases. The first attempt lacked backend dependencies in this worktree; matching existing dependencies were linked and the complete run passed.
- Strict portable-boundary type check: passed.
- Emulator admission HTTP, transactional admission/capacity, Firestore rules and shared urban/civic backend: passed.
- Source-browser public directory join, both mapped worlds, shared artifact and vehicle claim/renewal/release/handoff reached completion. The final harness assertion still expected a private room; corrected to match the public scenario. A built-candidate run is still required before this gate can be marked passed.
- Earlier character lab screenshots were inspected. Physical-phone acceptance for the new changes remains unverified.

Check actual new execution reports before updating this file. Test counts are coverage inventory, not a production-readiness score. No final production readiness or new deployment is claimed here.

# Current local verification state

Updated September 28, 2026. Older measurements remain in the linked audit documents; they are not current release receipts.

## Workspace and release authority

Worktree: `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`.
Branch: `steven/architecture-evaluation`. Work remains local: do not push or deploy automatically. Keep ordinary Chrome open, run heavyweight checks sequentially, and preserve source/history.

The current saved candidate is identified by `.local-candidates/latest` and its `build-manifest.json`. The preview server may still serve an older candidate; verify its manifest before handing it back. Never infer the served version from a browser query parameter.

Release authority is the generated evidence under `output/release-evidence/current/`, matched to the current commit, workspace fingerprint and artifact. A component count, older successful scope, or diagnostic overlay does not establish production readiness. Run `npm run verify:release-ready` only after the complete candidate and backend scopes have current evidence.

## Production

Read-only identity check on September 27, 2026 UTC: `https://worldexplorer3d.io/build-manifest.json` reported `5.3.0+bbe6502228e3.8044052b36c00b4a.production`, source commit `bbe6502228e369fe2a15dc6a177f5d83948584c3`. Local performance work has not changed GitHub or production.

## Consolidated loading and memory work

Implemented scalar ground interpolation, exact numeric height caching, indexed mapped-water sampling, overlapped planar road compilation behind a terrain readiness barrier, pre-sized building compilation buffers, and frontage calculations that avoid unnecessary projection and cache-key allocation. Published geometry, road coverage and quality settings are preserved.

On the physical M1, dense-city first play improved from 59.25 seconds in the earlier comparison to 49.99/49.36 seconds, then 48.71 seconds with bounded building buffers. The last full performance attempt on `16434f84` entered in 46.425 seconds. These are individual runs, not a cross-device percentile. Mobile emulation entered in 20.703 seconds at about 60 FPS; physical-phone performance remains unverified.

The bounded-buffer measurement preserved 25,507 buildings, 18,759 roads, 49 terrain tiles and all 4,358 overview cells. Road-ready primary-renderer footprint fell from 3,912 to 3,277 MiB in the matched milestones. Completed-world footprint was about 2,894 MiB. Repeated entry still produced approximately 3.8–4.0 GiB renderer footprints before diagnostic GC. Retained post-exit heap was about 46 MiB; that is not a whole-process memory measurement or proof that all native overhead is resolved.

The first 45 candidate gates passed on `16434f84`. Performance then failed on ground-level FPS and accumulated shader programs, while loading, natural active heap, teardown, retention, coverage, transfer, storage and browser-error checks passed. The initial credential-expiry interruption was diagnosed; its successful gate receipts were reused rather than rerun.

## Rendering follow-up

Nearby light counts created many material variants. The fixed spotlight pool uses intensity to turn unused slots off and skips their fragment-light calculation. A packaged-runtime diagnostic reduced shader growth from roughly 154–158 programs to 61 across walking, driving and sustained flight. The source fixture showed identical pixels for zero, one, three and eight illuminated lights. Headlight placement now updates the car transform before sampling it.

Static-transform, hidden-character and conditional roof-noise experiments did not establish a consistent frame-rate gain and were not included. Performance limits have not been lowered. The lighting repair requires its own built-candidate acceptance evidence; earlier `16434f84` receipts do not certify the changed runtime.

## Scope boundaries and evidence

The action resolver and receipt ledger are contained R&D components, not a deployed action gateway, server movement, PvP, durable shared pickups or a complete new multiplayer mode. See `docs/action-game-rnd/ACCEPTANCE_MATRIX.md`.

See `docs/architecture-evaluation/RESOURCE_BUDGET.md` for measurements and memory accounting, `docs/architecture-evaluation/LOADING_AUDIT.md` for the loading architecture, and the ignored `progress.md` for active process IDs and continuation details. Keep diagnostic, component, packaged-browser, emulator and live-service evidence distinct.

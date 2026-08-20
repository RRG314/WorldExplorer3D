# World Explorer 3D — current verification and release map

Status: legacy suite quarantined on 2026-08-19. This file intentionally does
not preserve the old command inventory.

The authoritative design is
`docs/VERIFICATION_STRATEGY_2026-08-19.md`. Current commands are:

| Command | Current responsibility |
| --- | --- |
| `npm run verify:source` | current HTML/resource/module graph, single module identities, debug default and operational script reachability |
| `npm run verify:world` | public landing → visible selector → complete live Baltimore world, real input, ownership, UI layout and exact transport continuity; no screenshots on failure |
| `npm run verify:jfx-player-surface` | exact Jones Falls Expressway player/deck/terrain ordering and mapped join continuity in the assembled game |
| `npm run verify:assembled-locations` | full assembled-game release matrix at Baltimore/JFX, Golden Gate, London, Monaco, Manhattan and rural Iowa; terrain, roads, structures, buildings, traffic, NPCs and the primary renderer must coexist |
| `npm run verify:environments` | Moon, Mars, space and ocean environment ownership with one visible primary renderer |
| `npm run verify:live-gps` | Live GPS tracking, behind-actor camera and walking-to-vehicle speed transition against the built artifact |
| `npm run verify:firestore-rules` | emulator-backed account, inventory, trade, multiplayer, admin and legacy-user authorization contract |
| `npm run verify:multiplayer` | two authenticated clients, private-room presence and shared-artifact convergence |
| `npm run build:hosting -- --firebase-env production` | create the immutable deployable artifact |
| `npm run verify:hosting` | verify artifact manifest, hashes and source parity |
| `npm run verify:artifact-runtime` | run the complete-world journey against `dist` |
| `npm run release:verify` | source check, production artifact build/parity, reachability and artifact runtime |

Focused feature tests are not pre-authorized. A new one is written only for a
current requirement and a reproduced failure, after identifying the one
authoritative owner. It must fail before the implementation fix and pass after.

No automated run writes release screenshots by default. After every automated
check passes on a clean immutable artifact, set
`WE3D_CAPTURE_RELEASE_EVIDENCE=1` for an explicit evidence run. Final images
must be complete player frames and still require the user's human approval.

The original approved aerial Baltimore harbor/skyline hero is restored byte for
byte. Current transport verification does not rely on that marketing image: it
captures complete player frames from the normal application entry point.

Current release blockers are reported honestly by
`verify:assembled-locations`. Exact structure joins and engineered grades must
both pass at all six representative locations. As of 2026-08-20 the shared
tunnel profile mutation is removed and Monaco graph seams are closed, but a
set of short Monaco structure-connected approaches still has infeasible grade
profiles. Production promotion remains blocked until that matrix, clean
commit/artifact identity, App Check/CSP deployment hardening, privileged
preview checks and hands-on device acceptance all pass.

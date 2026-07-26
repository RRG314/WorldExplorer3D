# World Explorer 3D 4.1 Recovery Ledger

## Purpose

This ledger prevents prototype work from being merged or copied as an
unreviewed batch. The checkpoint commits are the exact file manifests. The
tables below assign every path family in those commits a disposition.

Disposition values:

- **preserve** — retain as a product, data, license, or release contract;
- **reimplement** — retain the requirement, but implement it through the 4.1
  owner defined in the recovery plan;
- **evidence** — use tests, measurements, or design findings as input only;
- **delete** — do not move the prototype implementation into recovery;
- **decision-required** — complete a source, dependency, data, or product
  decision before implementation.

## Recoverable checkpoints

| Prototype | Commit | Release status |
|---|---|---|
| 4.1 integration prototype | `163f168bb6a6bcd7164eca7610174a6a6cf691db` | Never merge wholesale |
| Experimental core rewrite | `23fc8c6b33f22d3ae06cefbc97a07a6f90820698` | Read-only evidence; never copy |

External recovery bundle:

`WorldExplorer3D-4.1-prototypes-20260725.bundle`

The verified bundle contains complete history for both checkpoint branches.

## Integration prototype classification

The exact manifest is
`1e44e3bee8d5c56a7f9531be65d8573178362e38..163f168`.

| Path family | Disposition | 4.1 owner or action |
|---|---|---|
| `ATTRIBUTION.md`, `DATA_*`, `THIRD_PARTY_NOTICES.md`, asset attribution | preserve | Source/license ledger; reconcile only after approved source decisions |
| `ROADMAP.md`, `KNOWN_ISSUES.md` | evidence | Reconcile against the clean recovery plan; do not copy prototype status claims |
| `docs/RELEASE_4_1_RECOVERY_PLAN.md` | preserve | Governing recovery plan |
| `app/index.html`, `bootstrap.js`, `app-entry.js`, module manifest | reimplement | Phase 1 application kernel and local dependency boot |
| `camera/clearance.js` | evidence | Preserve stateful-clearance requirements; implement under Phase 5 traveler/camera owner |
| `earth-origin.js`, `earth-streaming.js` | delete | Continuous-world runtime removed; branch history is reference only |
| `engine.js`, `scene-bootstrap.js`, `quality.js` | reimplement | `WorldScene`, frame scheduler, quality budget adapters |
| `engine/shadow-manager.js` | evidence | Preserve measured shadow requirements; reimplement under `WorldScene` |
| `building-facade-materials.js`, facade/foundation/material prototype modules | evidence | Preserve UV/material/foundation findings; reimplement after canonical building semantics |
| `ground.js`, `terrain.js`, `terrain/**` | reimplement | Phase 3 `WorldSurfaceQuery`; no file-level cherry-pick |
| `road-render.js`, structure profiles/semantics | evidence | Preserve topology/profile fixtures; canonical compiler owns the replacement |
| `world/load-*`, `world/streaming-*`, `world.js` | delete | These are the duplicated owners Phase 2 replaces |
| `world/transport-compiler.js`, `tile-lifecycle.js` | delete | Unused continuous-world prototype code removed |
| `world/spatial-occupancy.js` | evidence | Preserve exact-geometry/index requirements; current elevated-foundation result is rejected |
| `world/spatial-rebase.js` | evidence | Preserve coordinate/rebase invariants; implement through session/store/scene |
| `world/vegetation.js`, `furniture.js` | reimplement | Phase 3 occupancy and Phase 4 LOD |
| bridge, waterway, land-use, inferred-building modules | evidence | Keep fixtures and source semantics; reimplement in compiler/surface owners |
| building/terrain/world collection and LOD changes | evidence | Resource and retirement requirements move to `WorldScene` |
| walking, physics, plane, ocean, HUD changes | reimplement | Phase 5 traveler and Phase 6 product adapters |
| planetary scene ownership | evidence | Destination lifecycle regression fixture |
| Overture source and test deletions | preserve | 4.1 keeps Overture out of the live ordinary-vector path |
| `package.json`, release/runtime verification changes | evidence | Rebuild the test graph after test classification |
| focused contract tests | evidence | Keep only assertions that protect approved 4.1 contracts |
| hardware/world-matrix/browser scripts | evidence | Extract recorded journeys and visual fixtures; do not copy the monolithic harness changes |

No integration-prototype runtime file is approved for direct cherry-pick.

## Experimental rewrite classification

The exact manifest is
`1e44e3bee8d5c56a7f9531be65d8573178362e38..23fc8c6`.

| Path family | Disposition | 4.1 action |
|---|---|---|
| `app/js/rewrite/**` | evidence | Use ownership, port, immutable-record, and small reachable-graph findings only |
| rewrite bootstrap switch and global handle | delete | No permanent dual runtime or global replacement API |
| rewrite product shell and input adapters | evidence | Inventory product parity; do not copy diagnostic UI |
| rewrite Earth source/compiler/store/coordinator | evidence | Validate responsibilities when designing Phase 2 contracts |
| ETOPO/Copernicus/Terrarium sources and terrain conditioning | decision-required | No provider or conditioning code moves without datum, license, cache, failure, and visual acceptance |
| rewrite renderers/materials/camera/traveler | evidence | Preserve ownership lessons; no implementation copy |
| `functions/terrain.js`, Firebase rewrites, function dependency changes | delete | No production/backend mutation from the prototype |
| rewrite CSS | delete | Diagnostic presentation is not product parity |
| rewrite architecture/parity/source documents | evidence | Reconcile useful requirements into approved recovery ADRs one decision at a time |
| rewrite tests/audits/preview commands | evidence | Extract contract cases only after the owning phase is approved |

## Test classification

### Preserve as release outcomes

- security rules, secret scanning, user-data safety, hosting reachability,
  immutable artifact, smoke, rollback, and attribution;
- destination enter/return lifecycle;
- travel-mode journeys and mobile controls;
- OSM source-to-render reconciliation;
- cancellation, stale-generation rejection, cache ownership, retirement, and
  zero-backlog disposal;
- visual geography fixtures and hardware performance evidence.

### Replace with owner-level contracts

- duplicate location-loader geometry tests;
- source-specific renderer tests;
- tests that mutate shared context to simulate unrelated systems;
- monolithic world-matrix assertions that report success without proving the
  visible frame.

### Delete with losing implementations

- Overture ordinary-vector fallback tests;
- cache-query-version identity tests after the build owns hashing;
- duplicate geometry, lifecycle, and controller tests whose implementation no
  longer exists;
- tests that assert file layout, function names, or internal counters without
  protecting a product or architecture contract.

## Regression fixtures captured for recovery

1. Baltimore occupancy: an elevated/pass-through building foundation can
   occupy a rendered road.
2. Baltimore road-debug comparison: source geometry may exist while normal
   material presentation makes roads visually unreadable.
3. Steep urban terrain: roads can be vertically coherent at the actor while
   the composed world remains visually implausible.
4. Repeated location loading: late structure work must not publish after a
   newer world transaction commits.
5. Software-WebGL multi-canvas captures may be black or materially different;
   they are diagnostics, not production visual approval.

Fixture images and bulky generated reports remain outside the repository.
Their source scenario, coordinates, travel mode, expected invariant, and
checkpoint commit must be recreated as bounded tests in the owning phase.

The verified production identity, observed title and Baltimore journeys, and
complete parity inventory are recorded in
[RELEASE_4_1_DEPLOYED_REFERENCE.md](RELEASE_4_1_DEPLOYED_REFERENCE.md).

## Phase 0 remaining work

- [x] Preserve the integration prototype.
- [x] Preserve the experimental rewrite.
- [x] Verify an external two-branch recovery bundle.
- [x] Create a clean recovery branch from reviewed `origin/main`.
- [x] Classify both prototype path families.
- [x] Classify test outcomes.
- [x] Recreate the five recovery fixtures as small, deterministic scenario
      definitions without importing prototype runtime code.
- [x] Verify the deployed reference manifest and capture the supported product
      journeys using one browser session at a time.
- [x] Retire PR #41 as superseded.
- [x] Confirm the recovery branch is clean and publish one draft Phase 0 PR
      ([#42](https://github.com/RRG314/WorldExplorer3D/pull/42)).

Phase 1 cannot begin until the remaining boxes are complete.

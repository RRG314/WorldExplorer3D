# World Explorer 3D verification reset

Status: active reset; the legacy suite is not release evidence.

## Why the old suite was removed

The repository accumulated tests at different product stages. Some asserted
deleted UI, some encoded temporary implementation details, and some produced
isolated images by moving cameras, hiding scene owners, pausing rendering or
checking counts without proving the final frame. A green run could therefore
describe a product the player did not receive.

All pre-existing `scripts/test-*.mjs` programs and their Playwright output were
removed from the working repository and placed in the recovery quarantine at:

`/Users/stevenreid/.codex/recovery/worldexplorer3d-20260819-legacy-test-quarantine`

Nothing in that archive is trusted or restored by default. It is retained only
so useful fixtures or historical failure descriptions can be reviewed before a
new test is designed from the current requirement.

## Tests the current product actually needs

### 1. Source and deployable-artifact health

Risk protected: a build or deployment reports success while current landing or
game files are absent, stale, unreachable, or wired to multiple entry paths.

This check should verify the current entrypoints, local module/resource graph,
production debug defaults, build manifest, and artifact/source identity. It
does not judge gameplay or visual quality.

### 2. One complete-world runtime journey

Risk protected: focused systems pass separately but the final player world is
blank, partial, duplicated, obscured, or internally inconsistent.

The journey must use the public landing page, visible selector, and visible
player controls. It must keep terrain, roads, buildings, water, atmosphere,
population, transport and HUD active together. It may read published runtime
diagnostics, but may not write internal state, move the camera directly, pause
rendering, suppress layers, or substitute a diagnostic scene.

For the current blocker, the journey must fail on any exact bridge/tunnel road
join outside the stated continuity tolerance. A structure count alone is not a
pass.

### 3. The same journey against the immutable artifact

Risk protected: mutable source works locally but the bundled `dist` artifact
loads different code, assets or data. The source journey cannot substitute for
this check.

### 4. Feature contracts only when a current change needs one

A focused test is added only when all of these are true:

- there is a current user requirement;
- a specific failure mode has been reproduced;
- the authoritative system and observable contract are known;
- the test fails before the fix and passes after it;
- it does not preserve a deleted feature or implementation accident.

For bridge repair, that means a new topology/grade contract based on exact
source-node connections and disclosed elevation provenance. It must not invent
survey measurements or special-case Baltimore landmark names.

## Tests that are not needed

- snapshots of isolated meshes or hidden-layer framebuffer comparisons;
- fixed camera pictures used as proof of the complete player result;
- separate tests for obsolete UI and deleted gameplay systems;
- dozens of overlapping internal tests for the same release boundary;
- city-name exceptions presented as worldwide transport verification;
- screenshot generation during a failing run.

## Visual evidence rule

Automated verification produces no screenshots by default. After every
nonvisual requirement passes on a clean immutable artifact, an explicit release
evidence run may save full-frame images. Those images remain subject to human
review and never replace the runtime, data-provenance or physical-continuity
checks.

## Current honest status

The legacy suite and its earlier prototype imagery are quarantined. The current
source-health check, complete public-landing-to-live-world journey and dedicated
Live GPS journey exist and pass against mutable source. The complete journey
keeps the whole final scene assembled and verifies exact transport continuity,
facade-integrated entrances, pitched roofs, far NPC/traffic representations,
LOD persistence, vehicle scale, Backpack/condition/ammunition ownership,
segment-continuous actor collision, mapped recovery policy, account/admin
surfaces and protected UI layout. Production stays blocked until the same
journey passes against a clean immutable artifact and the user approves the
actual final frames on intended devices.

## Final-player vertical-surface acceptance

For a grade-separated arrival, the complete-world journey must wait for final
world publication and then remain stable for at least five seconds. It must
inspect the visible controlled actor, not a proxy vehicle or hidden structure.
The actor feet must match the movement resolver's published surface within the
movement tolerance, and the selected source feature, structure kind, vertical
order, and elevation provenance must be recorded. A mode-only share link must
not change actor position. A screenshot is saved only after those conditions
pass in the same immutable artifact.

The first accepted local sample is Jones Falls Expressway at
`39.309728,-76.621428`: feet 32.051251 m, walking surface 32.051252 m, rendered
terrain 25.918335 m, feature `osm:way:12115981`, bridge, vertical order 2. This
contract replaces the invalid practice of treating a visible deck, a nonzero
structure count, or a separately positioned vehicle as proof that the actual
player received the elevated surface.

# Local bridge, tunnel and camera checkpoint

7 September 2026 · `steven/building-exteriors-local` · **Not deployed**

## Where this work lives

Continue in `/Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70` on the
same branch. Source preview: <http://127.0.0.1:4195/app/>. The old immutable
candidate on 4194 does not contain this work. Do not switch the default
Documents checkout or treat older candidate screenshots as current evidence.

Implementation commit: `99c26b0a` — **Checkpoint shared tunnel boundaries and vehicle camera clearance**.
It preserves the bridge/tunnel work after `10731504` (building exteriors). This is a recoverable development milestone,
not permission to deploy, merge stable, or publish GitHub. The owner must test
before production. No mapped buildings were deleted to hide road conflicts.

## Implemented

- Shared floor, roof, portal and collision constraints, including below-sea-level
  tunnels and driving/walking handoff. Missing airport height no longer becomes zero.
- Bounded terrain apertures used by both terrain levels, CPU height and ray queries.
- Bridge replacement constrained by actual overlap; presentation retains approach taper.
- Inferred street names separated from source topology.
- Connected tunnel clearance compiled as a closed-volume union in a bounded worker.
  One resulting boundary supplies lining, wall collision, camera and ceiling space.
- Indexed sweeps remove the internal cap slivers found in oblique graded tunnels.
- Vehicle visual bounds prevent a shortened chase boom from entering the BMW.
  Prefer a clear roof view; temporarily use first person only if no outside view fits.
- Corrected collapsed tunnel-roof texture coordinates. Local kernel JS/WASM/license
  and explicit production worker packaging are included; nothing deploys automatically.

## Current evidence

Commands, run from the checkout above:

```sh
node --test tests/tunnel-solid-current.test.mjs tests/vehicle-camera-body-current.test.mjs tests/bridge-tunnel-consistency-current.test.mjs tests/structure-transition-presentation-current.test.mjs tests/tunnel-worker-packaging-current.test.mjs
node scripts/verification/source.mjs
node scripts/verification/bridge-tunnel-player-current.mjs
```

The focused tests pass 31 checks. They execute geometry, collision, camera
selection and browser worker bundling; they do not certify an entire release.
Source/entry graph verification passes. The worker test does not substitute
for a complete immutable hosting-artifact run.

Monaco, deliberately forced worldwide fallback provider, fresh source reload:
7 connected components; 45,444 boundary triangles; compilation measured
307–466 ms on this desktop, no reported compilation failures. This is world-load
cost, not a per-frame Boolean operation or a phone benchmark. Inspected rear
chase, wall contact, moving junction and 390px viewport images. Camera exclusion
query was false for the visible BMW, and runtime diagnostics had no errors.
Wall contact now shows an external roof view instead of the cabin. Intentional
Overpass request failures remain distinguished from unexpected errors.

Local visual evidence (ignored generated output, reproducible, not release art):
`output/playwright/monaco-solid-camera-final-chase.png`,
`monaco-solid-camera-final-wall.png`, `monaco-solid-junction-driving.png`,
`monaco-solid-mobile-driving.png`.

Fort McHenry fallback integration passed 9/9 gameplay checks on the current
solid/body-guard implementation: below-water driving, wall impact, hood and
underground overhead choice, walking, wall jump, narrow layout and return to
driving. The final near-plane-corner expansion also passed 9/9 at 15:54 UTC,
with all visible-vehicle clipping probes false. All nine pre-expansion frames
and the final driving, wall-impact and return frames were visually inspected.
**Entrance terrain bands and oversized
retaining-wall joins remain visually unacceptable**, despite traversability.
Do not reuse the earlier 8/8 historical result as current proof. The current
report is `output/playwright/bridge-tunnel-current/report.json`.

## Next work — do not silently mark these complete

1. Resolve remaining portal/headwall/retaining-wall fit against accepted terrain;
   the union fixes internal boundaries, not erroneous geographical placement.
2. Verify exact OSM as well as fallback paths, complex entry/exit intersections,
   and additional bridge transitions outside Monaco. Preserve actual buildings.
3. Assess extreme/reversing sweep inputs, bounded-worker failure behavior and
   repeated world rebuild cost. Failed components still use the prior shell
   path; a diagnostic is not proof that that fallback looks correct.
4. Run the immutable packaged candidate, including worker/WASM requests, then
   physical-phone performance and user testing. Narrow desktop layout is not
   a phone thermal/battery test.

Rejected evidence: menu-only black frames; old screenshots inside the BMW;
intermediate hotpatched-world images; the per-segment convex-hull prototype
that left numerical endcaps. Those failures led to specific regressions and
must not be counted as passes.

Research findings and citations: [Bridge and tunnel research brief](research/transport-enclosures/brief.html).

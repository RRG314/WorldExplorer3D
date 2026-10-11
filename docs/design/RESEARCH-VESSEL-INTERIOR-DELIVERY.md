# Research vessel interior delivery

October 11, 2026. Local work; production remains the released 5.5 build.

## Owner request and acceptance boundary

Replace the exposed deck workstations with a coherent ship players can walk
through. Include a galley, science and crew spaces, a real bridge connection,
and a ship map comparable in purpose to the spaceship map. Preserve submarine
custody, research progress, the working deck and swimming. The owner will test
before approving production.

## Design basis

The licensed RCRV model is Oregon State University Extension Service / Alan
Dennis, CC BY 4.0. Oregon State's [design documents](https://ceoas.oregonstate.edu/regional-class-research-vessel-ship-design)
and [principal equipment](https://ceoas.oregonstate.edu/sites/ceoas.oregonstate.edu/files/2024-07/rcrv-particulars.pdf)
distinguish working deck, wet and main labs, scientific storage, meeting space
and accommodation. We use that functional separation. The interior, stairs,
scale and gameplay placement are an authored game adaptation, not an exact
replica of Taani or a certified marine layout.

## Implemented arrangement

- Main deck: wet lab with sink and live regional-condition display; dry lab;
  galley with fixed cabinetry, sink and cooktop; mess/lounge. Central passage
  connects the stern entrance to the internal companionway.
- Three pairs of physical stair flights connect the main deck, intermediate
  landing, crew deck and bridge. No room teleport or invisible floor authority.
- Crew deck: quarters and briefing room. Bridge: helm and chart workstation.
- Working deck: submarine cradle and dive ladder retain their locations.
- Ship map: deck tabs, named stations, current position and walking route;
  native modal focus, close/Escape, phone layout and input lock while open.

The wet-lab briefing/scans/report remain owned by marine research and the
Journal. The galley consumes carried snacks/water using the same Backpack and
condition consumer as Earth. No new food, health or reward store. Mess/dry lab
open the existing Journal; briefing opens the existing Field Guide; quarters
use the existing surface-voyage checkpoint. Rooms do not invent survival meters,
crew tasks, survey evidence, currency or supplies.

## Construction and lifetime

`interior-plan.js` defines deck/station/room identity, connection graph and
licensed hull cuts. `scripts/build-research-interior-hull.mjs` reproducibly cuts
only the adapted playable volume and openings from the retained licensed source
GLB. The original exterior model and LOD are kept; derived provenance records
both hashes. Geometry and UV attributes are retained during clipping.

The exact rendered hull, sole plates, bulkheads and treads feed the ship-local
triangle index. Furniture uses bounds measured from its loaded geometry.
Published catalog models and the existing licensed ship surface library supply
furnishings/materials. Galley cabinetry, stairs and partitions are authored
architectural meshes. Every lease, texture, geometry, material, UI and pending
load is owned and released by the existing vessel/session lifecycle.

The geometry gate caught an over-budget first attempt at exact furniture
triangles. Measured furniture envelopes keep navigation near the previous hull's
triangle count. Walking queries stay local to the existing spatial grid. Routes
use a small connection graph and cached shortest-path fields; map rendering is
throttled and only runs while open. At most three nearby interior lights run.

## Evidence and remaining verification

- The full furnished mesh admits every station. All authored graph edges have
  been walked in both directions by the triangle controller in browser probes.
- Browser iteration 1 found an inherited header rule covering phone map tabs.
  Scoped map layout fixes it. Iteration 2 found a delayed modal-close notification
  retaining movement lock inside a same-task controller test; close now releases
  the lock synchronously as well as handling native Escape.
- Visual review corrected stretched UVs and a bridge camera pushed into the
  avatar. Tight rooms now use an unobstructed eye-level view with hysteresis.
- Current journey, source and packaged evidence will be entered after completion.
  Probe success is not a substitute for the full application journey or a release
  matrix. No production readiness claim is based on these probes.


### Current evidence update

The full app survey journey passed 8 cases at
`output/research-interior-20261011/full-app/browser.json`: actual interior briefing,
deploy, first-scan reload, partial recovery/redeployment, three scans, lab report,
Scanner II and a follow-up using its range, with desktop/phone ocean controls.
No page errors or local HTTP failures. Local reCAPTCHA warnings remain explicitly
outside this controlled-provider journey's attestation scope.

Focused source checks pass 21 tests. The furnished fixture's 18-case journey
passed at `journey-3`; subsequent visual review fixed a coplanar display frame and
added inner accommodation lining. `journey-4` reached all 18 journey cases but
failed final disposal: a later animation frame recreated the already-disposed
HUD. The deck controller now rejects updates/entry after disposal; a source
regression verifies that terminal state. The final fixture rerun remains required.

The prior habitat gate's environmental HTTP 503s were emitted intentionally by
`scripts/place-lookup-preview.mjs` because no local Functions origin was configured.
They were not proof of a live provider outage. Controlled gameplay gates now
install explicit weather/marine fixtures and retain separate provider acceptance.

### Final source and furnished-vessel checks

Full `verify:pr` passes **2,455 tests**, including dependency, module identity,
ownership, boundary types, runtime names, inventory and mutation sensitivity.
Receipt: `/tmp/we3d-research-interior-full-source-final.log`. The first full run
caught a furnishing test limited to Sketchfab; it now also verifies the exact two
reused Poly Haven sources and their CC0 licenses without weakening model budgets.

`output/research-interior-20261011/final-fixtures/` passes the existing **11-case**
deck regression and new **18-case** interior journey. All 55 graph connections
are traversable in both directions with furnishings loaded. The final disposal
check passes, model leases return to zero and no ship map survives. The measured
95th-percentile movement/camera query is about 0.1 ms in this controlled fixture;
this is not a whole-game frame-rate or phone performance measurement. Screenshots
were inspected, including the galley, phone map and reduced-light wet lab.

The original GLB and its license are retained. The ship map is a simplified game
arrangement, not a navigational chart. The separate bridge chart opens the actual
world map. Shipboard food must already be carried in the Backpack. Engine-room
simulation, cooking recipes and a full crew-management game are not implemented
or advertised by this delivery.

The expanded full-app journey passes **16 checks** at
`output/research-interior-20261011/full-app-rooms/browser.json`, including the
survey loop, actual Journal/Guide panels and pause, quarters save, world chart,
ship map on desktop/phone, carried provisions and surface reload followed by
walking to the helm. No page errors or local HTTP failures. This run uses
controlled environmental providers and retains local AppCheck warnings; ordinary
hosted attestation is a separate acceptance class.

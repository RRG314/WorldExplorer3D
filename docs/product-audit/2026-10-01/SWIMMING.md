# P08 swimming implementation and remaining acceptance

October 2, 2026. Development source only; production is unchanged.

Earth Walking mode now delegates immersed movement to the water controller. It uses mapped coverage, the shared dynamic surface and the accepted terrain/support height. Shallow water remains walking at a reduced pace; deeper water owns buoyancy, horizontal motion, rise/dive input and collision. Indoor, planetary, GPS and parachute ownership exclude swimming. Travel-mode and environment exits explicitly clean up; terrain refinement cannot project a swimmer onto the seabed.

The existing licensed man/woman explorer rigs have authored swim and tread cycles. Scuba tank, mask, regulator and harness presentation equips automatically for a deep dive, without a manual equipment selector or an inventory grant. The game air budget is 180 simulation seconds, with forced ascent at 20 seconds, an 18-metre gameplay descent limit, surface recovery and bank recovery only when the remembered bank can be revalidated. These are game rules, not real diving guidance. Land companions use the existing safe-travel policy rather than walking along the seabed.

Keyboard Space/Shift and visible held Rise/Dive controls drive the same movement. Recovery returns to a still-valid remembered bank within the loaded neighborhood, otherwise to the current surface. A bounded local checkpoint preserves remaining air and revalidates the same geographic origin before a surface resume; it expires after 24 hours. An older tab cannot clear another tab's newer checkpoint. Storage denial leaves movement working and is reported in the HUD. This checkpoint is separate from Journal/cloud receipts and does not persist a vessel, cargo or a multiplayer expedition.

The live Baltimore walkthrough exposed a prior terrain limitation: broad mapped water was usually excavated only 0.6 metres. Detailed water terrain now grades from the bank into a body-sized, capped gameplay bed, preserving small pools, holes through the existing footprint authority, varying river datums and any already-deeper terrain. The rendered mesh remains the contact authority. This is **simulation**, not measured bathymetry; geographic depth evidence stays independently unknown when unavailable. The HUD labels simulated depth. Underwater presentation uses the water surface's back face and a render-scoped fog/sky override that restores the weather owner's values immediately after rendering.

## Evidence

- Component coverage: immersion thresholds, automatic equipment, bounded motion/air, forced ascent, wall and shallow-support handoff, unknown coverage, GPS exclusion, checkpoint validation/expiry/denial/cross-tab cleanup, animation ownership, weather restoration and asynchronous terrain rebuild ownership.
- Prescribed game client: existing man and woman rigs and shared WebGL water shader; screenshots and state inspected in `output/verification/product-plan`.
- Controlled controller browser: forward motion, automatic scuba, air consumption, wall collision, forced ascent, bank recovery, phone-width held controls and reload at the validated surface retaining air. This is a controlled terrain scene, not a complete geographic shore outing.
- Full walking-physics browser: walk from a controlled sloping bank, wade, enter swimming without injecting a swim pose, reverse course, return to dry ground and recover normal walking height. Screenshots inspected.
- Actual Earth browser: loaded Baltimore mapped water and its rendered/contact bed, surface entry, dive, actual character/scuba, camera and transition back out of swimming. The test uses controlled placement/input at the mapped body, not a full walk from the starting street. Failed harness assumptions and the mode-cleanup regression were corrected before the successful continuation.

Full registered suite: 1,674 passing, zero failures/skips; source checks pass. Logs: `swimming-full-contracts.log` and `swimming-source.log`.

## Still required before P08 is complete

A complete ordinary shore-entry/exit journey across multiple body types, playable surface-boat/ladder entry and boarding, final fitted wetsuit/fins and animation/art review, and physical-touch/device acceptance remain. The research ship, moving deck, sub deployment, high-detail ocean ecology and full expedition progression are later delivery phases, not delivered by this controller. Do not describe P08 or the ocean overhaul as finished, or promote this source as a production release solely from the checks above.


## Standalone Ocean diver continuation

The existing Ocean scene now supports leaving a stopped submarine at 1–16 m simulated depth with at least 2 m of seabed clearance. The same licensed explorer, swimming controller, automatic scuba and resource rules run under the existing Ocean loop. The sub stays parked; the camera, actor contract, observed geographic coordinates, water patch and navigation map follow the diver. A SUB marker identifies the return point. Boarding is available within 8 m; explicit Recover returns aboard. Surface-boat transfers reject an active diver with a useful instruction. Scene teardown cancels/disposes owned avatar and UI resources.

Camera probes keep the view outside the parked hull. Clicked boarding controls release keyboard focus so movement works immediately. Phone boarding, map and dive controls have separate space; boat notices no longer obscure dive buttons. Standalone dives are session-only; they do not use the Earth checkpoint or claim persistent sub/cargo ownership. Full launch/recovery persistence remains P10.

Evidence: four focused admission/actor/location/transfer/camera component cases; the prescribed game client with actual licensed rig and shared controller in a controlled hull scene; eight actual-source Ocean browser cases for pause/air preservation, swim motion, parked sub continuity, blocked surface transfer, phone layout, boarding, Recover, deep-exit rejection and scene cleanup (some grouped in one case). The existing eleven-case Ocean entry/surface/re-dive journey also passes. Screenshots and state inspected; no page exceptions. Reports: `output/verification/ocean-plan/diver-browser.json`, `entry-browser.json` and `output/verification/product-plan/ocean-diver-client/`.

Final continuation validation: **1,678 registered component tests pass**, zero failures/skips/TODO; source verification passes. Full log: `output/verification/product-plan/ocean-diver-full-contracts.log`.

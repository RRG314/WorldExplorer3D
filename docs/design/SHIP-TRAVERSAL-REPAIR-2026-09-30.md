# Ship traversal and observation repair — September 30, 2026

Status: repaired in local source; production has not been changed.
Production identity rechecked: `5.4.0+711fe93aa54e.8d08d47f2ff10556.production`.
The affected ship source at the start of this repair matched that release.

## Reproduced failures and changes

- Clicking a deck in the lift left keyboard walking stalled. The same one-second input moved 0 m before repair and about 2.8 m afterward. Closing ship controls now releases their button focus back to walking.
- Pathfinder's 8.2 × 10.2 m collision envelope intruded into the ring corridor and completely covered the launch-bay doorway. The loaded model measured roughly 3.82 × 8 m. The pod is now stowed transversely with a matching envelope and aligned rails, leaving an entrance aisle. Launch turns it toward the exterior hatch; a cancelled launch restores the original walking pose rather than stranding the player inside the craft.
- The briefing table's long axis ran radially through the shallow room, leaving too little clearance behind the door. The furniture and collider now both turn across the room; its interaction stands in the entrance aisle.
- Ring-only guidance assumed unfurnished rooms. Guidance and crew routes now use the actual static deck colliders, with body clearance, connected walkable areas, and validated shortcuts. Openable pressure doors remain on routes; furniture does not.
- Opening a door previously removed collision before its panel cleared the player. Collision now follows the moving panel's clearance. A door cannot close onto the player or nearby crew.
- Inspection found Earth building, vegetation, roof, block, and urban-obstacle queries could still participate in ship walking. These are isolated from the ship's local coordinate space. Interior ceilings now use the actual command/habitat/engineering ceiling height, and entering/changing decks clears cached floor support.

- Packaged release verification additionally caught a CSS-loading focus race: the unopened observation dialog could briefly become focusable before its stylesheet arrived. It now uses explicit semantic hidden state on creation/close, and the Earth-boarding regression delays ship CSS to exercise that boundary.

## Observation gallery

The gallery has a live viewing screen and a Views control. Players can select any of six exterior directions or 25 ship rooms, use Previous/Next, and close with the button or Escape. Interior feeds temporarily render the selected deck and restore scene visibility without moving the player or changing the active deck. Only the selected feed updates, at five frames per second, while the viewer is open or the player is in the gallery. Renderer state and resources are restored/released on close and ship exit. The selector groups rooms by deck and fits a 390 px viewport.

## Verification scope

- The old ring test deliberately omitted furnishings, and older visual/mission scripts assigned player positions at stations. Those checks did not establish end-to-end interior traversal.
- `ship-traversal-current.mjs`: actual rendered ship, keyboard walking across room routes, keyboard door interactions, lift UI, stable floor measurements, observation camera pixels and phone-size controls. Initial scan/deck setup is explicit; route traversal changes heading but never player position.
- `ship-earth-boarding-current.mjs`: loaded Baltimore world, Travel → Board Solis Reach, held-key corridor walking, deck switch, observation close, and ship exit cleanup.
- `ship-traversal-current.test.mjs`: retained-Earth collision/floor isolation, deck ceiling heights, and furnished route detours.
- `ship-action-client.mjs`: prescribed develop-web-game action/screenshot client with explicit ship-entry readiness.

Evidence lives under `output/verification/ship-traversal`, `ship-controls`, `ship-earth-boarding`, and `ship-action-client`. Diagnostic captures and interrupted/failed harness runs are not release acceptance. Completed checks:

- Full keyboard route walk: 25 rooms (9 habitat, 8 command, 8 engineering), with lift transfers and real E-key pressure-door opening. Feet/eye height stayed constant on each flat deck; no page errors. This is an automated route walk with scripted heading, not an uncoached player study.
- Observation/controls: all 31 feeds rendered nonblank, distinct frames; 390 × 844 viewer layout fit; closing/Escape restored walking. A blocked door stopped at z=23.18, and reopening allowed z=24.44. Occupancy prevented closing onto the actor while a safe step back allowed closure. Launch cancellation restored x=4.8, z=-27.14. Exit removed the viewer. No page errors.
- Real Earth boarding: Baltimore retained 25,518 buildings and 18,758 road records. The player walked over 20 m down the ship corridor, changed to Engineering, and immediately walked another 2.7 m. Floor height settled to the real interior surface at eye Y=1.7. Observation close and ship exit passed with no page errors or missing local resources.
- Prescribed action client: both keyboard/screenshot iterations passed with temporary staging attestation. Screenshots inspected. The initial unattended reCAPTCHA failure is retained separately; it was a harness credential issue, not counted as a pass.
- `verify:source` passed. The current contract suite passed 1,584 checks with no skips. Focused ship tests additionally cover the window pressure boundary, exact doorway occupancy and jumping beside furniture.

These changes have not been pushed to GitHub or deployed. Player data and existing sandbox work were preserved. The existing `dist` release remains intact. Full immutable-candidate release checks and physical-device testing have not been performed for this change.

# Living World and Editable World Test Plan

Status: implementation plan  
Production deployment: blocked until all gates pass and the user explicitly approves  
Final handoff: one immutable local candidate URL, desktop and phone instructions, and retained test evidence

## What the final test build must contain

The final test candidate must include all of the following in one build:

- Character C: Field Navigator;
- Car D: Classic Utility Car;
- Harbor Scout boat;
- Trailblazer plane;
- Wayfinder spacecraft;
- deeper building facades and entrances;
- simulated pedestrian populations;
- simulated road traffic;
- local editable-world saves and reset-to-real-world;
- multiplayer editable rooms with permissions and revision handling;
- DeFlock and Live GPS coexistence;
- unchanged Moon, Mars, Ocean, and Space journeys.

The candidate must identify its exact commit and artifact hash in the HUD/manifest. A mutable source URL is not final acceptance evidence.

## Build gates

### Gate 0 — Protected baseline and upgraded meshes

Automated proof:

- all five selected mesh factories load without browser errors;
- the engine imports Car D and the walking runtime imports Character C;
- wheel, headlight, limb, propeller, engine-glow, and exhaust hooks remain present;
- triangle, mesh, material, transparency, and footprint budgets pass;
- movement and environment controllers are unchanged;
- Living World identity is stable across reload sequences;
- a stale derived publication cannot remain active after a world replacement;
- derived publication disposal cannot mutate `WorldSnapshot`.

Manual proof:

- walk with Character C in third person;
- drive Car D and inspect wheel rotation/headlights;
- operate the boat, plane, and spacecraft;
- confirm the five models match the previously approved designs.

### Gate A — Building depth

Automated proof:

- mapped entrances win over inferred entrances;
- inferred entrances are deterministic and labeled inferred;
- doors/storefronts/windows/glass use bounded shared batches;
- nighttime emissive windows create no per-window lights;
- facade compilation does not alter building source records or collision;
- transparent material and draw-call caps pass.

Manual locations:

- Baltimore commercial streets;
- Manhattan dense blocks;
- Monaco mixed-height/graded streets;
- suburban residential area;
- day and night at every location.

Look for readable doors, entrances, commercial ground floors, varied windows, restrained glass, roof depth, no floating details, no flicker, and no large dark or glowing slabs.

### Gate B — Pedestrians

Automated proof:

- mapped paths/sidewalks/crossings are preferred;
- inferred sidewalks are outside the drive surface and labeled inferred;
- pedestrians avoid buildings and water;
- entrances connect to the pedestrian graph;
- crossing, waiting, entry/exit, separation, pooling, and despawn pass;
- rural density can correctly be zero or very low;
- world changes dispose all pedestrian agents and graphs.

Manual proof:

- follow pedestrians through a Baltimore or Manhattan block;
- watch at least one crossing and one building entry/exit;
- verify nobody walks down the road center, through water, or through buildings;
- repeat on phone and confirm smooth camera/player controls.

### Gate C — Traffic

Automated proof:

- one-way compliance;
- valid junction turns and invalid stacked crossings rejected;
- lane provenance remains mapped or inferred;
- bridge, ramp, elevated-road, tunnel, and underpass surface parity;
- spacing, conflict reservations, player avoidance, pooling, and respawn;
- no provider request after world publication because an actor moved.

Manual proof:

- ordinary Baltimore grid traffic;
- Manhattan multi-lane traffic;
- Golden Gate Bridge traffic and player car traversal;
- Monaco ramp/tunnel traffic;
- suburban and rural density;
- verify traffic is described as simulated, not live traffic.

### Gate D — Local editable world

Automated proof:

- stable source-ID building selection;
- virtual suppression affects visibility, collision, entrances, and navigation without changing base data;
- richer structure placement, rotation, snapping, collision, undo, and redo;
- legacy blocks migrate without loss;
- primary/backup recovery and per-location isolation;
- reset restores the untouched real-world base.

Manual journey:

1. Select a mapped building.
2. Virtually remove it.
3. Build a replacement.
4. Walk and drive around the replacement.
5. Reload the page and confirm it remains.
6. Load another city and confirm the edit is absent.
7. Return and confirm it remains.
8. Reset to real world and confirm the mapped building returns.

### Gate E — Multiplayer editable room

Automated proof:

- owner, moderator, builder, player, and visitor permissions;
- backward-compatible owner/mod/member migration;
- invalid payloads and unauthorized writes rejected;
- expected-revision conflict and retry behavior;
- bounded history and revert;
- two clients converge after create/edit/remove/rejoin;
- listener failure keeps last-good state;
- other rooms and ordinary single-player worlds remain unchanged.

Manual two-device journey:

1. Create an editable room on desktop.
2. Join from phone.
3. Grant builder permission to the phone user.
4. Suppress one mapped building and place a structure.
5. Confirm both devices show the committed result.
6. Attempt an unauthorized edit as player/visitor and confirm rejection.
7. Leave and rejoin both devices.
8. Revert one change and confirm both devices converge.

### Gate F — Cross-system integration

Run the following with facades, traffic, pedestrians, and applicable edits enabled:

- DeFlock from Missions and Games and from an already-loaded Earth world;
- upright and toppled DeFlock cameras on desktop and phone;
- Live GPS start, pause, manual movement, Low Power, DeFlock coexistence, and stop;
- walking, driving, drone, plane, and boat mode changes without position reset;
- Golden Gate bridge, Monaco ramps/tunnels, Baltimore water/bridges;
- Earth to Moon, Mars, Ocean, Space, and back;
- Main Menu teardown and a second location load.

No Living World renderer, timer, listener, graph, or NPC may remain active outside its Earth publication.

### Gate G — Performance evidence

Run deterministic measurements in Manhattan, Baltimore, Monaco, suburban, rural, desktop, and mobile profiles with:

- base only;
- facade only;
- traffic only;
- pedestrians only;
- traffic plus pedestrians;
- all features plus local edits;
- all features plus room edits.

Record load time, first-play time, frame median/p95/p99, long tasks, draw calls, triangles, programs, textures, geometries, heap, active/visible/virtual NPC counts, graph size/compile time, and post-publication provider requests.

Release limits:

- zero movement-triggered provider requests;
- no recurring Living World long task above 50 ms;
- no more than 10% warm-frame p95 regression against the same location with Living World disabled;
- no more than 10% fixed-world load-time regression;
- no more than +80 MB desktop or +35 MB mobile derived heap;
- no lifecycle growth after five location/environment changes;
- NPC counts reduce before player movement, camera, or fixed-world quality degrades.

### Gate H — Final acceptance candidate

Before giving the candidate to the user:

- run the complete existing release verification;
- run every new unit, contract, security, multiplayer, browser, and performance test;
- inspect retained screenshots for every representative city, day/night, phone, editable-world, traffic, pedestrian, and upgraded-mesh scenario;
- verify the candidate is built from a clean exact commit;
- serve the immutable candidate locally;
- confirm no test browser, emulator, watcher, or obsolete preview remains running.

## User acceptance checklist

The final handoff will provide a single URL and ask the user to check these journeys in order:

1. Character C walking and facade/entrance visibility in Baltimore.
2. Car D driving with simulated traffic and pedestrians.
3. DeFlock camera upright/toppled behavior without HUD obstruction.
4. Manhattan facade density and population performance.
5. Golden Gate driving plus bridge traffic.
6. Monaco ramps and tunnels with traffic and no outside-visible tunnel regression.
7. Local suppress/build/reload/reset journey.
8. Desktop/phone editable-room synchronization and permissions.
9. Boat, plane, spacecraft, Moon, Mars, Ocean, Space, and Earth return.
10. Phone performance, touch editing, orientation, and Low Power behavior.

The user will not need to run developer commands. Test controls, expected outcomes, known limitations, and the evidence directory will accompany the URL.

# Explorer Home, Companion, Interior, and Equipment Plan

Status: implementation contract for the next World Explorer slice.

This contract folds the permanent starter dog, first-home journey, furnished
interiors, companion residence rules, and replacement equipment visuals into
one delivery sequence. The existing companion progression, property ownership,
interior navigation, inventory, projectile, damage, and save authorities remain
in charge. New assets are presentation layers beneath those authorities.

## Player promise

Every new Explorer begins with a dog. The dog is a lasting relationship rather
than a temporary encounter or inventory item: it follows on foot, boards normal
vehicles, accompanies long-distance travel, earns progression, and returns after
reloads. The Explorer may leave it safely at home and may travel with a different
owned companion. Selecting a new active companion sends the previous one to its
assigned home instead of deleting, archiving, or abandoning it.

The Explorer's first major life goal is to choose a home anywhere the property
system supports. The first owned home becomes the primary home and the starter
dog's home base. It arrives furnished with a coherent, usable interior and a pet
nook. This is the pet included with the first-home experience; the game must not
silently create a second pet when the dog already began the journey with the
Explorer.

Two durable firsts are recorded in My Explorer:

- **A Place of Our Own** — choose or purchase the first home.
- **Best Friend** — give the starter dog its first player-chosen name.

## Decisions and boundaries

| Concern | Authority | Decision |
| --- | --- | --- |
| Companion identity and progression | `discovery/companions.js` | Extend the versioned instance record. Keep current level, trust, training, and XP rules. |
| Companion persistence and activation | `discovery/profile-store.js` | Idempotently seed one starter dog for a truly new Explorer. Switching is atomic from the caller's perspective and persists residence state for the former active companion. |
| Companion world presentation | `discovery/companion-runtime.js` | Existing root owns following and curated dog loading. Vehicle or hazardous travel may hide the mesh, but the dog remains part of the journey state and never becomes an unexplained `waiting` animal. |
| Property ownership | solo housing model or connected property service | Never infer ownership from a visual building. Only an accepted local result or trusted server receipt can complete the home goal. |
| Primary home | property authority | The first accepted home becomes primary. Later primary-home changes update the default residence used by companions that do not have an explicit assignment. |
| Interior navigation and collision | `interiors/planner.js`, `scene-builder.js`, and `runtime.js` | Imported furnishings never replace entry, floors, walls, stairs, elevators, clear paths, interaction reach, or collision. |
| Interior presentation | new furnished-interior adapter | Select a deterministic residential archetype and place screened furnishings into planner-owned sockets. Failure restores the existing functional procedural interior. |
| Equipment behavior | equipment model/runtime, ballistics, reticle, inventory | Existing IDs, ammo, use modes, damage, projectile origins, and saves are unchanged. Curated models replace visuals only. |
| Parachute lifecycle | parachute model, walking physics, equipment runtime | A high-drop offer may equip the existing parachute, deployment remains a player choice, and confirmed ground contact always repacks and hides it. |
| Default road-car presentation | drive-mode authority plus curated player-car adapter | The BMW is the only normal player-car presentation. The procedural safety mesh stays hidden during local loading and appears only after a confirmed asset failure. |
| Asset loading | local manifest plus loader | No runtime Sketchfab or third-party requests. Every asset ships locally with source, license, checksum, bounds, and performance metadata. |

## Companion data contract

Companion schema version 3 adds bounded fields without removing existing data:

```text
originKind: encounter | starter-companion | legacy
isStarterCompanion: boolean
nameStatus: default | player-chosen
namedAt: timestamp or 0
residence:
  state: traveling | at-home | home-pending | care-network
  homeId: stable owned property ID or empty
  updatedAt: timestamp
```

Migration rules:

1. Normalize every old record without changing its stable instance ID, XP,
   training, name, favorite state, or acquisition time.
2. Existing user-named encounter companions are `player-chosen`; old records
   cannot earn the starter-dog naming achievement retroactively.
3. A profile with no companions receives one deterministic Trail Hound with the
   temporary name `Scout`, starter origin, and active traveling state.
4. A profile that already has companions is never disrupted during migration.
   It receives the permanent starter dog if missing, but an existing active
   selection remains active. A permanent marker prevents retries and duplicates.
5. At most one companion is active. Activating another companion writes the
   former active companion to its assigned/primary home, or `care-network` when
   no home exists. Explicit **Leave at home** uses the same rule and permits no
   active companion.
6. Renaming trims control characters and whitespace and retains the 24-character
   display bound. Only the first change of the starter's `nameStatus` from
   `default` to `player-chosen` records **Best Friend**.

The starter marker belongs to the profile as well as the companion record so a
deleted, imported, or partially migrated store cannot mint duplicates. Import
and export include the marker and the new residence fields.

## Travel contract

| Journey | Visual treatment | Persistent meaning |
| --- | --- | --- |
| Walking on Earth | Visible follower | `traveling` |
| Car or enclosed aircraft | Hidden safe occupant until vehicle rigs expose a valid seat | `traveling`, travel state `vehicle-occupant` |
| Boat | Visible at an existing safe deck target | `traveling`, travel state `aboard` |
| Teleport/city transition | Hide during transition; respawn beside Explorer after load | `traveling`, travel state `in-transit` |
| Moon/space | Hidden in protected ship or habitat; no unprotected Moon dog rendering | `traveling`, travel state `protected-quarters` |
| Drone/skydive | Hidden in the journey's safe base/vehicle during the exposed segment, then reunited automatically | `traveling`, travel state `safe-during-exposed-travel` |
| Leave at home | Not spawned | `at-home`, with an owned `homeId` |

This satisfies “travels everywhere” as a continuous relationship and journey
state without placing an animal in unsafe or visibly broken positions.

## First-home journey and receipts

The Home & Property panel presents a four-step goal instead of creating a
second property system:

1. **Explore neighborhoods** — load any supported place and inspect mapped homes.
2. **Choose your first home** — use the existing free deed for connected
   accounts, or the existing solo purchase adapter where connected ownership is
   unavailable.
3. **Move in together** — accepted ownership sets the primary home, assigns the
   starter dog, and enables the furnished residential presentation.
4. **Visit home** — route through the existing navigation and interior entry.

An accepted result produces a stable client story-event ID based on the
property receipt/home ID. Duplicate UI callbacks or reconnects must not award
twice. Connected mode treats the server property receipt and its existing
`first-property` projection as ownership truth; the client adds the personal
story event but never fabricates credits or shared leaderboard status. Solo mode
uses the local housing transaction ID. A sale does not erase the achievement.
If the assigned home is sold, the dog moves to the next primary owned home or
`care-network` until a new home is chosen.

## Functional furnished interiors

### Selected source

The first screened furnishing source is **Low Poly House Interior** by Paolo
Mercogliano on Sketchfab:

- Source: <https://sketchfab.com/3d-models/low-poly-house-interior-62b1714ef66f4e0d9f42dcd12efb3f52>
- License: CC BY 4.0
- Downloaded format: GLB, 5,892,668 bytes
- SHA-256: `72d3742042e8fd5f85242116fd2430f394aee1ba347b500736687191896a6beb`
- Coverage: kitchen, living room, two bedrooms, two bathrooms, stairs, tables,
  beds, shower, television, and household props.
- Audit: about 72,900 triangles, 37,400 source vertices, no textures or
  animations, 61 materials, and hundreds of nodes/draw calls.

The complete room coverage and readable stylized proportions fit the character
family. The raw node/material count does not meet runtime budgets, so the file
must be optimized and treated as a source kit rather than dropped unchanged into
every mapped building.

### Integration model

1. Record the original GLB and CC BY attribution in the local asset manifest.
2. Produce a deterministic optimized derivative: prune unused data, remove
   nonessential transmission, weld compatible geometry, join meshes only where
   material and room grouping permit it, deduplicate materials, and quantize
   after visual comparison. Keep the source checksum and conversion command.
3. Classify reusable groups into room kits: living, kitchen/dining, bedroom,
   bathroom, circulation, storage, and pet nook.
4. The existing accepted floor plan publishes furnishing sockets with room ID,
   wall orientation, clear radius, bounds, floor level, and allowed kit tags.
5. The adapter deterministically chooses a kit from property ID and footprint.
   It scales within authored limits; it never stretch-deforms furniture to fill
   arbitrary buildings.
6. A placement validator rejects overlaps with entry clearance, door arcs,
   walking corridors, stairs, elevator cores, exterior walls, and other occupied
   sockets. Sparse furnishings are preferable to blocked navigation.
7. Small bounded colliders and interaction anchors are authored from socket
   metadata for chairs, beds, storage, food/water bowls, and lights. Imported
   triangle meshes never become navigation collision.
8. Furniture interactions in the first release are lights, sit/rest, sleep/save,
   home storage, and the dog nook. Appliances are visibly present but are not
   advertised as interactive until their actions exist.

### Quality and performance gates

- Desktop target: no more than 35 furnishing draw calls and 80,000 displayed
  triangles for a normal two-level home.
- Mobile target: no more than 20 furnishing draw calls and 40,000 displayed
  triangles; small props are omitted by declared quality tier.
- Entry-to-first-frame may show the current procedural shell, then atomically
  reveal the furnished kit. Missing/slow/corrupt assets retain the shell and
  publish a diagnostic rather than trapping the player.
- Every supported layout must preserve a continuous entry-to-room path, usable
  stairs/elevator, exit interaction, and storage access.
- Visual review is required from entry, living area, kitchen, bedroom, bathroom,
  stairs, and both desktop and narrow mobile viewports.

## Replacement equipment and weapon visuals

The target style is adventurous, readable, and mildly cartoonish—not realistic
military simulation. Weapons remain tools of the existing sandbox rules; the
visual refresh does not increase damage, add purchasing pressure, or alter age
and safety presentation.

The preferred source family is Quaternius because it matches the installed
Explorer/NPC visual language and has unambiguous CC0 licensing:

- **Sci-Fi Gun Pack** — seven stylized sci-fi guns:
  <https://quaternius.com/packs/scifigun.html>
- **Sci-Fi Essentials Kit** — 65 glTF props including guns and field-tech props:
  <https://quaternius.com/packs/scifiessentialskit.html>

The first bounded prototype replaces only presentation for:

| Existing stable ID | Intended visual role |
| --- | --- |
| `pulse-sidearm` | Compact exploration-tech sidearm with a clear emitter. |
| `laser-gun` | Longer field-energy tool, visually distinct from the pulse sidearm. |
| `flashlight` | Rugged field light from the same material/color family. |
| `baton` | Explorer staff/multitool rather than a police baton silhouette. |

`paintball-gun`, both responder/compact sidearms, and the concussion charge keep
their current fallback until a screened model has a distinct role and correct
socket fit. The parachute remains its own flight-safety slice.

Each equipment manifest entry declares source/license/checksum, local bounds,
right-hand grip transform, optional left-hand support transform, muzzle/emitter
anchor, throw origin, first-person camera-safe offset, third-person scale, icon
view, animation profile, triangle/material budget, and fallback visual ID.
Equipment visuals attach beneath the existing equipped-item root. The existing
runtime remains the only source of use timing and category; ballistics remains
the only projectile/damage authority. Recoil is presentation driven by the
existing use event and cannot create extra shots.

Desktop and mobile acceptance requires correct hand orientation, no face/body
clipping at idle or use, distinct silhouettes in the inventory, correct muzzle
origin alignment, deterministic cleanup when swapping, and immediate procedural
fallback on blocked asset load.

## Parachute and default-car release fixes

The parachute remains permanently available in the Backpack. Leaving an
elevated building support with at least the declared safe offer clearance puts
the existing parachute in the active slot and displays a short deploy prompt; it
does not open the canopy automatically. The normal use action still validates
Earth, walking mode, descent speed, and remaining ground clearance. Ground or
roof contact ends both freefall and canopy states, resets the flight profile,
re-packs the canopy, and hides the pack even when the parachute remains selected.
A second eligible jump can offer and deploy it again without reacquisition.

The local BMW begins decoding during engine initialization. All procedural
player-car children are hidden before that request starts, so switching to
driving cannot flash the old silhouette. Successful attachment reveals the BMW
atomically. A verified decode/load failure restores the procedural car as the
playability fallback and reports that fallback in diagnostics. Urban vehicles
the Explorer deliberately enters remain separate choices and are unaffected.

## Delivery slices

1. **Foundation:** add this contract, schema migration helpers, deterministic
   starter dog bootstrap, rename support, residence state, and unit tests.
2. **Player flow:** expose Rename, Travel together, and Leave at home actions;
   record the first naming event; verify reload, switching, vehicles, remote
   travel states, and legacy saves.
3. **Home link:** project accepted solo and connected ownership into one
   idempotent personal first-home event and companion home assignment. Add the
   four-step goal and handle primary changes/sales.
4. **Interior prototype:** preserve the source/attribution evidence, optimize the
   selected Sketchfab GLB, implement the furnishing adapter and living-room/
   bedroom/pet-nook sockets for one residential archetype, then expand only
   after path and performance gates pass.
5. **Equipment prototype:** screen and locally bundle the Quaternius assets,
   implement the manifest/loader, and replace pulse-sidearm plus field light and
   staff presentation with procedural fallback.
6. **Expansion:** add remaining room archetypes and equipment mappings only from
   evidence gathered by the prototypes.
7. **Release fixes:** verify repeatable building jumps, manual deployment,
   landing cleanup, second deployment, and an immediate BMW-only drive-mode
   transition under normal local loading. Simulate asset failure separately.

Each slice ends with focused unit/contract tests, source-graph validation, real
desktop and 390x844 browser journeys, console/network inspection, diagnostics
from `render_game_to_text`, fallback simulation, `progress.md`, and a small local
commit. No push or deployment is part of this plan.

## Release acceptance

- A new profile always starts with exactly one visible Trail Hound companion.
- Reloading never duplicates or loses the dog; legacy profiles are unchanged.
- Naming the starter dog records **Best Friend** exactly once.
- The dog follows on foot, is safely represented in vehicles and hazardous
  travel, and reunites automatically after transitions.
- Switching or leaving a companion never deletes it and clearly shows its home.
- One accepted first-property receipt records **A Place of Our Own** exactly once,
  sets a primary home, and assigns the starter dog's home base.
- The first supported residence has a believable furnished living area,
  bedroom, bathroom, kitchen, stairs, storage, and pet nook with clear paths and
  working entry/exit.
- New equipment models match the Explorer family while existing inventory,
  damage, projectile, and save behavior remains byte-for-byte compatible at the
  public data contract.
- Asset failures, low-quality tier, and old saves all retain playable fallbacks.
- Landing always removes the deployed canopy and worn pack; a later eligible
  building or aircraft jump offers the same parachute again.
- Normal driving-mode entry never renders the old car before the BMW. The old
  car is permitted only as a recorded load-failure fallback.

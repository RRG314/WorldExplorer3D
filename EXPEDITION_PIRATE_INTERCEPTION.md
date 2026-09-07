# Expedition Pirate Interception

## Implemented encounter

First Light now contains one deterministic hostile interception during the
middle `long-watch` leg. It begins as an unidentified sensor contact, escalates
through confirmed hostility and defensive launch, becomes a bounded manual 3D
fight around Solis Reach, resolves through damage control, and returns the same
Expedition to its original route.

This is an encounter inside the Interstellar Expedition campaign, not another
game mode or a disconnected score activity. It occurs at most once per
Expedition and does not replace any of the existing Voyage Director events.

## Player rules

- Fly Pathfinder with the existing Space flight movement, camera, thrust, and
  brake controls.
- Fire its twin cyan energy cannons with the configured **Use Item** action
  (V by default), left mouse, gamepad X, or the phone FIRE action.
- Pirate fire is magenta and uses a different bolt shape from Pathfinder fire.
- Destroy the amber boarding craft and repel enough of the attacking formation.
- Remaining hostiles retreat when the boarder is destroyed and at least 60% of
  the bounded formation has been defeated; the player does not chase a final
  craft indefinitely.
- Leaving the combat region applies a soft course-correction warning. It is not
  an invisible lethal wall.
- If Pathfinder is disabled or the boarding lock completes, the encounter still
  reaches an explicit damage-control outcome. It does not silently reset.

Forgiving survival uses four or five hostile craft, stronger aim assist, lower
enemy accuracy and damage, and a 34-second boarding lock. Severe survival uses
six craft, reduced assist, higher accuracy and damage, and a 22-second lock.

## Encounter authority

`app/js/expedition/hostile-interception.js` owns eligibility, the one-time flag,
phase transitions, deterministic difficulty, the pre-combat checkpoint,
outcome normalization, consequences, Captain's Log entries, and continuation.
It writes to the existing authoritative Expedition record:

- Solis Reach hull, power, sensors, and propulsion condition;
- power, maintenance, and medical stores;
- crew fatigue, health, and injury status;
- the causal failure authority when damage exhausts recovery;
- Voyage Director history, encounter history, and the resumed voyage phase.

The browser-local store preserves the active checkpoint and completed outcome.
Shared rooms submit the same transition, resolution, and completion commands to
the generated server command engine. Rendering does not decide mission state.

## 3D runtime

`app/js/space/pirate-interception-runtime.js` owns only the local presentation
and immediate combat simulation. It reuses the existing Pathfinder craft,
Solis Reach exterior, Space controller, chase camera, touch controls, gamepad
input, and travel session. Ordinary Solar System labels, gravity targets,
landing prompts, and universe selection are suspended during the encounter and
restored afterward.

The hostile formation has three readable roles—interceptor, attacker, and
boarding craft—using one coherent hull family. Enemy behavior moves through
intercept, pursuit, attack run, evade, boarding approach, and retreat states.
Target selection includes bounded aim assist. Projectiles and impacts are
pooled at 52 and 14 objects respectively; each encounter uses three to six
enemies and disposes its presentation on exit. Reduced-effects accessibility
turns off combat impact flashes without changing collision or damage.

## Asset provenance

The hostile craft is Quaternius' **Insurgent** from the CC0 Ultimate Spaceships
Pack, locally bundled as
`app/assets/models/space/pirate-insurgent-raider-v1.glb`. The same source family
already supplies the Solis Reach and Pathfinder presentation, preventing a mix
of unrelated visual styles.

The optimized GLB is 710 KB, contains 8,292 triangles, uses one 512 px embedded
texture, and has a six-instance budget. The source link, file identity, license,
hash, and processing record are in `app/assets/models/ATTRIBUTION.md` and
`DATA_SOURCES.md`.

## Persistence and interruption

The contact is written before 3D combat starts. Closing or reloading during the
fight retains the pre-combat Expedition checkpoint and offers **Resume defensive
control**; it never awards a victory from presentation state. Completion writes
one encounter-history entry and the one-time event flag prevents retriggering.
The original Voyage Director continues at the following watch.

## Verification

- 29 Expedition and pirate-interception tests pass together, including the
  shared-room command path.
- The generated shared Expedition command engine rebuilds from the same source.
- A browser journey triggers the priority contact, launches the actual 3D
  runtime, fires live pooled projectiles, destroys three of five craft, reaches
  aftermath, applies hull and maintenance damage, saves one encounter record,
  and resumes the route.
- The phone journey exposes a 44 px FIRE action, fits a 390 × 844 viewport, and
  has no horizontal overflow.
- Runtime diagnostics expose phase, coordinates, enemies, AI states, target,
  health, boarding progress, projectile-pool counts, bounds, and resolved
  Expedition state. The browser run finishes without page errors or failed
  local resources.

Evidence is generated by
`scripts/verification/expedition-pirate-interception-current.mjs` under
`output/verification/expedition-pirate-interception/`.

## Intentional boundary

This pass adds one complete ship-defense encounter. It does not add a general
combat campaign, loot economy, procedurally repeated pirate battles, or a second
space-progression system. Solis Reach does not currently have authoritative
hostile-character navigation across its pressure doors and decks, so a completed
boarding lock is resolved through real security, crew injury, ship damage,
medical use, and failure state rather than a decorative or non-authoritative FPS
sequence. Adding walkable hostile boarding would require a separate interior AI,
collision, multiplayer, save, and recovery authority and is not claimed here.

No production deployment, GitHub update, or external repository mutation was
performed for this implementation.

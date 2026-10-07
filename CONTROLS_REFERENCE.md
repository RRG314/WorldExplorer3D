# Controls Reference

Updated October 7, 2026 for World Explorer 3D 5.5.

Default controls are listed below. Rebound keys and the visible contextual
prompt take precedence.

## Global Controls

- `F`: cycle character / car / plane / drone
- `H`: use a nearby mapped mechanic when one is in range
- `P`: enter or leave plane mode directly
- `G`: enter or leave boat travel when available
- `C`: cycle camera mode
- `M`: toggle large map
- `N`: next city
- `B`: toggle block build mode
- `R`: record/stop track
- `Shift+R`: road debug mode
- `Esc`: close the active Backpack/Journal/map surface, then toggle pause when no surface is open
- `F4` / `` ` `` / `~`: debug overlay
- `F8`: performance overlay

Developer overlays only respond when developer diagnostics are enabled.

## Contextual World Interaction

- `E` / Action: use the one visible nearby door, vehicle, person, or object
- `I`: open/close the character Backpack
- `J`: open/close the Journal / Field Guide
- `1`–`6`: quick-equip a carried item (`6` selects the parachute)
- `V`: use the equipped item
- With the parachute equipped, press `Space` while descending at least 3.25 m above the ground to deploy it. It repacks automatically on landing.
- `T`: take an available nearby item
- `X`: currently unassigned; it no longer opens, advances, or cancels field activities

The contextual prompt is the authority. A key does not activate a hidden or
distant target, and mobile uses the matching on-screen Action button.

## Driving Mode

- `W` / `S`: accelerate / brake and reverse
- `A` / `D`: steer left / right
- Arrow keys: complete alternate driving controls
- `Right Click + Drag` or `Middle Click + Drag`: look around; chase view recenters automatically
- `Space`: handbrake / drift trigger at speed
- `Ctrl`: boost
- `E`: exit the current vehicle when stopped safely, or use the visible context action

Handling note:

- Earth driving includes rear-biased drift behavior when `Space` is used with steering at speed.

## Walking Mode

- `W` / `S`: move forward/back
- `A` / `D`: strafe left/right
- `ArrowUp` / `ArrowDown`: alternate forward/back
- `ArrowLeft` / `ArrowRight`: turn left/right
- `E`: use the visible contextual door, vehicle, person, or object
- `Space`: jump
- `Shift`: run
- Drag on the world with the left, right, or middle mouse button: look around

Walking/navigation note:

- Walk routing currently follows the core road-and-ground traversal network on Earth scenes.
- Supported interiors initialize their doorway prompt while walking but enter
  only after deliberate keyboard/touch interaction at the published door.

## Research vessel, swimming and diving

Ocean selection starts aboard the research vessel. Use **Deck destination** to
choose a station, then walk there with the normal walking controls. The station
button becomes available when you are close enough.

- At the dive platform, use its action or press `Space` to enter the water.
- At the submarine station, use its action to deploy the submarine.
- At the wet lab, take a survey briefing or review and submit collected findings.
- **Vessel options** contains Return to helm, Shared crew and saved survey reports.
- Stop the vessel and use **Walk research deck** to explore it again.

In the ocean, `W` / `S` move forward and back, `A` / `D` turn, and
`Space` / `Shift` rise and descend. Arrow keys provide alternate movement and
turning. Stop the submarine before using the diver control. Swimming and scuba
equipment are selected automatically for the water context. Oxygen and depth
limits still apply.

**Dive controls & sound** opens additional controls and the sound toggle.
**Recover** returns you aboard the same vessel. At mapped Earth shorelines,
normal walking controls also support swimming where the loaded water is deep
enough; a vessel’s ladder is available only when its entry conditions are met.

## Solis Reach interior

Use the normal walking controls aboard the ship. `E` activates the nearby door,
station or central deck lift when its prompt is visible. The lift offers the
command, habitat and engineering decks. **Map** shows the deck layout; **Views**
opens the observation screen with exterior and interior choices. **Return to
Flight** leaves the interior. The flight destination controls provide the route
back to Earth.

## Drone Mode

- `W` / `S`: fly forward/back relative to the drone
- `A` / `D`: turn the drone
- Arrow keys: complete alternate flight controls
- `Space`: ascend
- `Shift` or `Ctrl`: descend
- `Right Click + Drag` or `Middle Click + Drag`: look around independently

## Rocket/Space Flight Mode

- `ArrowLeft` / `ArrowRight`: yaw
- `ArrowUp` / `ArrowDown`: pitch
- `Space`: thrust
- `Shift`: brake/decelerate

## Camera and Mouse

- right-click or middle-click drag: camera look in every traversal mode
- left drag on the world: camera look while walking when no weapon or build tool owns the pointer
- left click without dragging: gameplay interaction by mode
- double-left-click camera toggle: disabled

## Paint the Town

- `Ctrl`: fire paintball
- `G` / `P`: alternate paintball fire
- `1-6`: select paint color
- `T`: toggle tool (`touch` / `gun`)
- left click / tap:
  - touch tool paints touched building
  - gun tool fires toward pointer

## Build Mode

- `B`: toggle build mode
- click: place block
- `Shift+Click`: remove block

## Map Interaction

- `M`: open/close large map
- left click map: inspect item
- right click map: teleport
- map legend: includes a nearby `Enterable Buildings` scan/list for mapped, generated, and listing-backed interiors
- path overlay toggle: available in the environment menu and large map, starts off by default

## Multiplayer Actions (UI)

- `Create`: create room
- `Join`: join room by code
- `Invite Link`: copy invite URL
- `Leave`: leave current room
- `Open`: open saved room
- `Delete`: owner-only room delete

## Mobile Touch Controls

Virtual controls adapt by mode:

- driving profile with a contextual Action/Exit button
- walking profile (`WASD` movement on left pad, arrows-style look on right pad)
- drone profile (`WASD` movement on left pad, arrows-style look on right pad)
- rocket profile
- a contextual Action button for doors, vehicles, people and objects
- a compact Gear button and touch-selectable equipment slots

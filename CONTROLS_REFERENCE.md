# Controls Reference

Last reviewed: 2026-09-06 for World Explorer 3D 5.2.0.

Canonical control map for current runtime behavior.

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

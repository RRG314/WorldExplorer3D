# Controls Reference

Last reviewed: 2026-07-21

Canonical control map for current runtime behavior.

## Global Controls

- `F`: cycle Drive, Walk, and Drone modes
- `P`: enter or exit Plane mode
- `G`: enter or exit Boat mode when suitable water is available
- `E`: use the current nearby interaction, including building entry
- `C`: cycle camera mode
- `M`: toggle large map
- `N`: next city
- `B`: toggle block build mode
- `R`: record/stop track
- `Shift+R`: road debug mode
- `Esc`: close map or toggle pause
- `F4` / `` ` `` / `~`: debug overlay
- `F8`: performance overlay

## Driving Mode

- `W` / `ArrowUp`: accelerate
- `S` / `ArrowDown`: brake/reverse
- `A` / `ArrowLeft`: steer left
- `D` / `ArrowRight`: steer right
- `Space`: handbrake / drift trigger at speed
- `Ctrl`: boost
- `V`: look back
- mouse drag / controller right stick: camera look

Handling note:

- Earth driving includes rear-biased drift behavior when `Space` is used with steering at speed.

## Walking Mode

- `W` / `S` or `ArrowUp` / `ArrowDown`: move forward/back
- `A` / `D` or `ArrowLeft` / `ArrowRight`: turn left/right
- `E`: enter/exit a supported building interior when the prompt is visible
- `Space`: jump
- `Shift`: run
- `Right Click + Drag` or `Middle Click + Drag`: mouse look

Walking/navigation note:

- Walk routing currently follows the core road-and-ground traversal network on Earth scenes.
- Supported interiors only load when you deliberately interact; being near buildings does not auto-load indoor geometry.

## Drone Mode

- `W` / `S` or `ArrowUp` / `ArrowDown`: move forward/back
- `A` / `D` or `ArrowLeft` / `ArrowRight`: turn left/right
- `Space`: ascend
- `Shift` or `Ctrl`: descend
- mouse drag / controller right stick: camera look

## Plane Mode

- `W` / `ArrowUp`: nose down
- `S` / `ArrowDown`: pull up
- `A` / `ArrowLeft`: bank or ground-steer left
- `D` / `ArrowRight`: bank or ground-steer right
- `X` / `Z`: increase/reduce throttle
- `Space`: wheel brake on the ground
- `C`: cycle chase, cockpit, and overhead cameras
- mouse drag / controller right stick: camera look

## Rocket/Space Flight Mode

- `ArrowLeft` / `ArrowRight`: yaw
- `ArrowUp` / `ArrowDown`: pitch
- `Space`: thrust
- `Shift`: brake/decelerate

## Camera and Mouse

- right-click hold: camera look
- middle-click hold: camera look
- left click: gameplay interaction by mode
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

- driving profile
- walking profile (directional movement on the left pad, camera look on the right pad)
- drone profile (directional flight on the left pad, camera look on the right pad)
- plane profile (inverted pitch/bank on the left pad, camera look on the right pad)
- rocket profile

# Controls Reference

Last reviewed: 2026-02-25

This file is the canonical control map for the current codebase.

## Global Controls

- `F`: toggle Walk/Drive mode
- `6`: toggle Drone mode
- `C`: cycle camera (car) or toggle walk view (third/first/overhead)
- `M`: toggle large map
- `N`: next city
- `B`: toggle block build mode
- `R`: record/stop track
- `Shift+R`: road debug mode
- `Esc`: close map (if open), otherwise toggle pause
- `Backquote`/`~` or `F8`: debug overlay

## Driving Mode

- `W` / `ArrowUp`: accelerate
- `S` / `ArrowDown`: brake/reverse
- `A` / `ArrowLeft`: steer left
- `D` / `ArrowRight`: steer right
- `Space`: handbrake
- `Ctrl`: boost
- `Shift`: off-road mode modifier
- `V`: look back

## Walking Mode

- `ArrowUp` / `ArrowDown`: move forward/back
- `ArrowLeft` / `ArrowRight`: strafe left/right
- `A` / `D`: look left/right
- `W` / `S`: look up/down
- `Space`: jump
- `Shift`: run
- `Right Click + Drag` or `Middle Click + Drag`: mouse look

## Drone Mode

- `W` / `S`: move forward/back
- `A` / `D`: strafe left/right
- `Space`: ascend
- `Shift` or `Ctrl`: descend
- `ArrowUp` / `ArrowDown`: pitch up/down
- `ArrowLeft` / `ArrowRight`: yaw left/right
- mouse drag while look-hold is active: look around

## Rocket/Space Flight Mode

- `ArrowLeft` / `ArrowRight`: yaw
- `ArrowUp` / `ArrowDown`: pitch
- `Space`: thrust/accelerate
- `Shift`: brake/decelerate

## Camera and Mouse

- right-click hold: camera look (gameplay)
- middle-click hold: camera look (gameplay)
- left click: gameplay interaction (mode-dependent)
- right-click context menu: suppressed during gameplay where needed
- double-left-click camera toggle: disabled

## Paint the Town

- `Ctrl` (`ControlLeft` / `ControlRight`): fire paintball from center aim
- `G` or `P`: alternate paintball fire
- `1-6`: select paint color
- `T`: toggle active tool (`touch` / `gun`)
- left click / tap:
  - touch tool: paint touched building by rule
  - gun tool: fire toward pointer

Notes:

- paintballs use gravity arc (aim higher for long distance)
- paint splats auto-prune after short lifetime
- collapsed HUD shows only time and painted count

## Build Mode

- `B`: toggle build mode
- click: place block
- `Shift+Click`: remove block

## Map Interaction

- `M`: open/close large map
- left click on map: inspect property/POI
- right click on map: teleport
- minimap click: open/expand map panel behavior

## Multiplayer Panel and Room Actions

- `Create`: create room with selected visibility/name/location tag
- `Join`: join by room code
- `Invite Link`: copy room invite URL
- `Leave`: leave active room
- `Open` on saved room: join saved room by code
- `Delete` on owned room: permanently delete room

## Mobile Touch Controls

Mobile controls inject virtual key holds and change by active mode.

### Driving profile

- move pad: `W`/`S`
- look pad: `A`/`D`
- action: `Space` (brake)

### Walking profile

- move pad: `ArrowUp/Down/Left/Right`
- look pad: `W/A/S/D`
- actions: `Space` (jump), `Shift` (run)

### Drone profile

- move pad: `W/A/S/D`
- look pad: `ArrowUp/Down/Left/Right`
- actions: `Space` (ascend), `Shift` (descend)

### Rocket profile

- look/steer pad: `spaceFlight.keys.arrow*`
- actions: `spaceFlight.keys[' ']` (accelerate), `spaceFlight.keys['shift']` (decelerate)

## Notes on Control Context

- `Ctrl` is context-sensitive:
  - driving: car boost
  - Paint the Town active: paintball fire
- Walk mode movement is arrow-key based; WASD is look in walk mode.

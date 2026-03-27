# Controls Reference

Last reviewed: 2026-03-14

Canonical control map for current runtime behavior.

## Global Controls

- `F`: toggle Walk/Drive mode
- `6`: toggle Drone mode
- `C`: cycle camera mode
- `M`: toggle large map
- `N`: next city
- `B`: toggle block build mode
- `R`: record/stop track
- `Shift+R`: road debug mode
- `Esc`: close map or toggle pause
- `F4` / `` ` `` / `~`: debug overlay
- `F8`: performance overlay
- In editor mode:
  - `Capture Here`, `Current Building`, `Selected Destination`: set the staged target
  - `Preview`: show a private contribution preview in your editor session only
  - `Submit`: send a staged submission into the moderation queue
  - `My Submissions`: review your pending/approved/rejected submissions
  - `Moderation` (admin only): filter, inspect, preview, approve, or reject staged contributions
- Account moderation page:
  - `Account -> Open Moderation Panel`: open the private admin review page
  - `Open In World`: jump to the contribution location in the app
  - `Approve` / `Reject`: change moderation status without directly editing the live world

## Driving Mode

- `W` / `ArrowUp`: accelerate
- `S` / `ArrowDown`: brake/reverse
- `A` / `ArrowLeft`: steer left
- `D` / `ArrowRight`: steer right
- `Space`: handbrake / drift trigger at speed
- `Ctrl`: boost
- `Shift`: off-road modifier
- `V`: look back

Handling note:

- Earth driving includes rear-biased drift behavior when `Space` is used with steering at speed.

## Boat Mode

- `G`: enter boat mode when the water-travel prompt is visible, or exit boat mode to dock
- `W` / `ArrowUp`: throttle forward
- `S` / `ArrowDown`: reverse / slow
- `A` / `ArrowLeft`: steer left
- `D` / `ArrowRight`: steer right
- `Space`: brake / hold speed down
- `Environment -> Sea State`: cycle `Calm`, `Moderate`, `Rough`

Boat note:

- Boat mode only appears near valid larger water bodies.
- Right-clicking a valid larger water target on the minimap or large map also enters boat mode automatically.
- Near shore it preserves coastal/city context and docks you back toward a nearby shoreline exit; farther offshore it reduces unnecessary land detail more aggressively.

## Walking Mode

- `W` / `S`: move forward/back
- `A` / `D`: strafe left/right
- `ArrowLeft` / `ArrowRight`: look left/right
- `ArrowUp` / `ArrowDown`: look up/down
- `E`: enter/exit a supported building interior when the prompt is visible
- `Space`: jump
- `Shift`: run
- `Right Click + Drag` or `Middle Click + Drag`: mouse look

Walking/navigation note:

- Walk routing currently follows the core road-and-ground traversal network on Earth scenes.
- Supported interiors only load when you deliberately interact; being near buildings does not auto-load indoor geometry.

## Drone Mode

- `W` / `S`: move forward/back
- `A` / `D`: strafe left/right
- `Space`: ascend
- `Shift` or `Ctrl`: descend
- `ArrowUp` / `ArrowDown`: pitch
- `ArrowLeft` / `ArrowRight`: yaw

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
- map legend: includes an `Approved Contributions` layer toggle for publicly approved community submissions
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
- walking profile (`WASD` movement on left pad, arrows-style look on right pad)
- drone profile (`WASD` movement on left pad, arrows-style look on right pad)
- rocket profile

# User Guide

Last reviewed: 2026-03-15

Player-facing behavior across app, multiplayer, tutorial, and account systems.

## 1. Sign In and Main Routes

- App: `/app/`
- Account: `/account/`
- About: `/about/`

Sign in methods:

- Email + password
- Google

## 2. Starting a Session

1. Open `Location` tab.
2. Choose a preset city or `Custom`.
3. For custom, use globe selector (`Start Here`) to spawn from picked coordinates.
4. If the picked/geolocated point is blocked, the runtime resolves to the nearest safe road, walkable path, or ground spawn instead of trapping the player in geometry.
5. Choose game mode in `Games` tab.
6. Click `Explore`.

## 3. Globe Selector Behavior

Features:

- interactive globe click-to-pick
- coordinate and place readout
- search and manual lat/lon support
- city tabs:
  - `Nearby`: nearest known menu cities to current pick
  - `Favorites`: preset cities + your saved favorites
- saved favorites can be deleted directly in list
- top shortcut buttons for Moon and Space
- bottom buttons: `Main Menu`, `Start Here`

Notes:

- Clicking globe sets an immediate place fallback and then refines with reverse lookup.
- Saved favorites are browser-local.
- `Use My Location` and custom-coordinate launches use the same safe spawn resolver as in-game teleports and mode switches.

## 4. Tutorial Behavior

- Tutorial is enabled by default for first-time use.
- Hints progress through movement, mode switching, space, moon, build, rooms, invites.
- After completion, it is marked complete and does not auto-repeat.
- In Settings, users can:
  - disable tutorial
  - restart tutorial manually

## 5. Movement and Modes

Modes:

- Walk
- Drive
- Boat
- Drone
- Rocket/space flight

Current driving behavior includes tighter rear-biased drift when using `Space` at speed with steering input.
Walk/drone controls now use `WASD` for movement and arrow keys for directional look.
If a walk -> drive switch starts from an invalid spot (inside a building, on a rooftop, or inside blockers), the car snaps to the nearest safe road spawn instead of leaving the player stuck.
Walking currently stays on the core Earth road-and-ground traversal network while the separate footway/cycleway/rail expansion is paused for cleanup.
Earth scenes now also use OSM vegetation layers so woods, parks, tree rows, and mapped tree nodes add greenery without enabling heavy foliage everywhere.
Dense urban roads now grow procedural sidewalks automatically where the loaded road/building context supports them, so city blocks read more like pavement instead of road strips dropped into grass. Parks and mapped green areas still stay green.
When you approach a valid larger water body such as a harbor, coastline, or major lake edge, a boat-travel prompt appears. Press `G` or choose `Boat Mode` from the float menu to enter boating deliberately. You can also intentionally right-click a valid larger water target on the minimap/large map, or use a custom globe launch over open water, and the runtime will enter boat mode automatically when that target is truly boat-eligible.
Boat travel stays in the same world instead of switching to a separate minigame. Near shore it preserves surrounding skyline/coast context and docks you back onto a sensible shoreline exit. Farther offshore the runtime reduces unnecessary land detail more aggressively to keep water travel smooth, while harbors/coasts/lakes retain more nearby context than true open-ocean runs.
Supported buildings can now be entered through one shared interior system. Walk up to a supported building and press `E` to enter; press `E` or `Esc` to leave. If OSM indoor tags provide usable room/corridor data, that mapped floor is used. If not, the runtime generates a lightweight enclosed interior from the building footprint instead of teasing an unavailable load.
Indoor support remains selective and on-demand. Unsupported buildings stay exterior-only, and interiors do not load globally in the background.
The large-map legend now includes an `Enterable Buildings` section. Opening the legend triggers a nearby scan and lists cached supported buildings with distances plus whether they are mapped, generated, or tied to a listing/historic destination.
Large map access is free for all players and opens with `M`.
The `Environment -> Live Sky` option now refreshes the real astronomical sky for the current Earth location. Daylight, sunrise/sunset color, moon visibility, and stars follow the explored coordinates instead of the player’s computer timezone.
The `Environment -> Weather: Live` option now follows the actual explored Earth location as well. Current condition, temperature, cloudiness, and wind summary update from the explored coordinates, not the computer’s local weather, and the sky/fog/light response stays location-aware without adding a boxed-in local weather ceiling.
Click the same weather control to cycle through manual overrides such as `Clear`, `Cloudy`, `Overcast`, `Rain`, `Snow`, `Fog`, and `Storm`. Manual weather only overrides the presentation; the live weather baseline remains cached underneath and can be restored by cycling back to `Live`. The HUD weather meta line now explicitly tells you whether you are seeing live location weather or a manual override.

Full controls: `CONTROLS_REFERENCE.md`.

## 6. Contributor Editor

The contributor editor is intentionally separate from normal exploration.

- Open the contributor editor while exploring on Earth.
- Capture one of:
  - current location
  - current supported building
  - selected real-estate / historic destination
- Choose:
  - `Place Info`
  - `Artifact Marker`
  - `Building Note`
  - `Interior Seed`
  - `Photo Contribution`
- Add a short title and the type-specific metadata fields you want to stage.
- Press `Preview` to see the marker privately in your own session.
- Press `Submit` to send it into the pending moderation queue.

Important behavior:

- Drafts and pending submissions do not change the live world directly.
- Submission writes now go through protected backend endpoints, so being signed in is enough to submit without relying on direct browser-side database writes.
- Building-oriented edit types automatically prefer a building/destination/interior target instead of teasing an unsupported world-only edit.
- Photo contributions currently stage a reviewable photo URL, caption, and attribution; they do not upload directly into the live world.
- The moderation tab now includes status/type filters, search, a detail pane, and decision notes for admin review.
- The moderation tab only appears for admin accounts.
- Approved submissions become visible as public contribution markers in the nearby world and on the large map.

### Moderation page

- Open `Account -> Moderation` with your admin account.
- The page shows pending, approved, and rejected counts plus whether email alerts are configured.
- Each submission card tells you what was submitted, who sent it, when it arrived, and where it belongs.
- Use `Open In World` to jump to the contribution location in the app, or `Open In OpenStreetMap` for map context.
- `Approve` makes the submission visible in the public contribution layer.
- `Reject` keeps it out of the live world.

## 7. Multiplayer Rooms

### Create room

- open `Multiplayer`
- choose visibility (`Private` or `Public`)
- set optional room name/location tag
- click `Create`

### Join room

- enter 6-character room code and click `Join`
- or open invite link with query `?room=XXXXXX&invite=1`

### Saved rooms

- rooms you own/join are saved in your account
- `Open` rejoins saved room
- owner sees `Delete` to permanently remove room

### Leave room

- `Leave` stops presence and exits active room

## 8. Social and Invite Flow

- Add friend by account UID.
- Send invite to a room code.
- Invitee can open from account page or app invite flow.
- Incoming invites can be marked seen or dismissed.

## 9. Shared Room Data

Within a room, members can share:

- build blocks
- paint claims (Paint the Town)
- artifacts
- room home base

## 10. Weekly Featured Room

- Multiplayer panel includes weekly featured city room.
- Room code is deterministic for that week/city.
- Featured rooms are public.

## 11. Account Center

Account page includes:

- plan and donation status
- room quota usage
- profile name and provider info
- donation portal actions (optional support only; no core gameplay/map gating)
- receipts list
- friends and invites management
- account deletion action

## 12. Data Lifetime

Persistent until explicit delete:

- room docs
- saved rooms (`myRooms`)
- room settings
- blocks
- paint claims
- home base

TTL cleanup (`expiresAt`) for ephemeral data:

- players
- chat
- chatState
- incomingInvites
- recentPlayers
- activityFeed
- artifacts
- editor submissions

## 13. Troubleshooting

- Join/create fails: confirm sign-in and rules deployment.
- Invite join fails: verify valid room code and account auth.
- Tutorial repeats unexpectedly: check Settings tutorial toggle/restart state.
- Receipts missing: refresh account data and check function logs.
- Editor submit fails: confirm Firebase config is present and that you are signed in.
- Live weather looks stale: move a meaningful distance or wait for the refresh interval; location-aware weather is cached so the runtime does not refetch on every frame.

# User Guide

<<<<<<< HEAD
Last reviewed: 2026-03-13
=======
Last reviewed: 2026-02-28
>>>>>>> worldexplorer3d/main

Player-facing behavior across app, multiplayer, tutorial, and account systems.

## 1. Sign In and Main Routes

- App: `/app/`
- Account: `/account/`
- About: `/about/`

Sign in methods:

<<<<<<< HEAD
- Email + password
- Google

## 2. Starting a Session
=======
## 2. Multiplayer Access and Donations

- Multiplayer is available to all signed-in users.
- No payment is required to create/join rooms.
- Optional monthly donations:
  - `Supporter`: $1/month
  - `Pro`: $5/month (includes early demo access perks)

Current room creation limits:

- `Free`: 3
- `Supporter`: 3
- `Pro`: 10
- Admin tester mode: allowlist-only elevated limit
>>>>>>> worldexplorer3d/main

1. Open `Location` tab.
2. Choose a preset city or `Custom`.
3. For custom, use globe selector (`Start Here`) to spawn from picked coordinates.
4. If the picked/geolocated point is blocked, the runtime resolves to the nearest safe road, walkable path, or ground spawn instead of trapping the player in geometry.
5. Choose game mode in `Games` tab.
6. Click `Explore`.

<<<<<<< HEAD
## 3. Globe Selector Behavior
=======
- signed-in users can accept invite and join directly
- signed-out users are prompted to sign in first
>>>>>>> worldexplorer3d/main

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

<<<<<<< HEAD
Notes:
=======
- plan/donation status
- multiplayer access status
- room quota (`created / limit`)
- extras card (Pro early-access messaging)
- admin status (allowlisted accounts only)
- username update
- linked email + verification state
- account UID + auth providers
- donations portal and receipt list
- friends list and incoming invites
- close account (permanent delete with confirmation and recent-sign-in safety check)
>>>>>>> worldexplorer3d/main

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
- Drone
- Rocket/space flight

Current driving behavior includes tighter rear-biased drift when using `Space` at speed with steering input.
Walk/drone controls now use `WASD` for movement and arrow keys for directional look.
If a walk -> drive switch starts from an invalid spot (inside a building, on a rooftop, or inside blockers), the car snaps to the nearest safe road spawn instead of leaving the player stuck.
Walk navigation now uses the Earth walkable network. Roads are available with the core Earth load, and nearby footways/cycleways/rail corridors are stitched in right after the core world is ready so the new path layers do not slow the first spawn as heavily.
The visual path overlay starts off by default; you can enable it from the environment/map path toggle whenever you want to inspect those ribbons directly.
Earth scenes now also use OSM vegetation layers so woods, parks, tree rows, and mapped tree nodes add greenery without enabling heavy foliage everywhere.
Some buildings can now be entered when OSM indoor tags provide enough mapped room/corridor data. Walk up to a supported building and press `E` to load the mapped floor on demand; press `E` or `Esc` to leave.
Indoor support is selective and data-driven. Unsupported buildings stay exterior-only, and interiors do not load globally in the background.
The large-map legend now includes an `Enterable Buildings` section. Opening the legend triggers a nearby scan and lists cached supported buildings with distances when mapped indoor data exists in the current area.
Large map access is free for all players and opens with `M`.

Full controls: `CONTROLS_REFERENCE.md`.

## 6. Multiplayer Rooms

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

## 7. Social and Invite Flow

- Add friend by account UID.
- Send invite to a room code.
- Invitee can open from account page or app invite flow.
- Incoming invites can be marked seen or dismissed.

## 8. Shared Room Data

Within a room, members can share:

- build blocks
- paint claims (Paint the Town)
- artifacts
- room home base

## 9. Weekly Featured Room

- Multiplayer panel includes weekly featured city room.
- Room code is deterministic for that week/city.
- Featured rooms are public.

## 10. Account Center

Account page includes:

- plan and donation status
- room quota usage
- profile name and provider info
- donation portal actions (optional support only; no core gameplay/map gating)
- receipts list
- friends and invites management
- account deletion action

## 11. Data Lifetime

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

## 12. Troubleshooting

<<<<<<< HEAD
- Join/create fails: confirm sign-in and rules deployment.
- Invite join fails: verify valid room code and account auth.
- Tutorial repeats unexpectedly: check Settings tutorial toggle/restart state.
- Receipts missing: refresh account data and check function logs.
=======
Chat protections:

- max message length: 500
- duplicate suppression window
- client and server cooldown + burst limits
- links/contact handles blocked
- profanity masking
- report action writes report flags

## 8. Paint the Town

Key behavior:

- choose color, claim buildings by touch or paintball gun
- paintballs follow projectile arc with gravity
- paint splats auto-expire for performance
- minimal HUD collapsed by default (`Time`, `Painted`) and expandable for details

Controls:

- fire paintball: `Ctrl` (also `G` / `P`)
- choose color: `1-6`
- toggle tool: `T`
- left click/tap paints according to active tool and room rules

## 9. Camera and Input Basics

- right-click or middle-click hold: camera look
- double-left-click camera toggle: disabled

For full control mapping by mode, see `CONTROLS_REFERENCE.md`.

## 10. Mobile Behavior

Mobile controls provide virtual pads and action buttons for:

- driving
- walking
- drone
- rocket

Mobile and desktop share the same gameplay systems and multiplayer state.

## 11. Troubleshooting

- If `Create`/`Join` does nothing, hard refresh and verify current user is signed in.
- If room actions fail with permissions, confirm deployed Firestore rules and Firebase auth state.
- If saved room `Open` fails, confirm the room code exists and owner has not deleted the room.
- If invites fail, verify friend relationship exists first.
- If donation receipts are missing, refresh account data and inspect function logs.
>>>>>>> worldexplorer3d/main

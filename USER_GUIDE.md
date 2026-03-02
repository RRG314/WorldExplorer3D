# User Guide

Last reviewed: 2026-03-02

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
4. Choose game mode in `Games` tab.
5. Click `Explore`.

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
- donation portal actions
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

- Join/create fails: confirm sign-in and rules deployment.
- Invite join fails: verify valid room code and account auth.
- Tutorial repeats unexpectedly: check Settings tutorial toggle/restart state.
- Receipts missing: refresh account data and check function logs.


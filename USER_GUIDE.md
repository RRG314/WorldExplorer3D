# User Guide

Last reviewed: 2026-03-02

This guide explains current player-facing behavior across app, multiplayer, and account features.

## 1. Sign In and Navigation

Main routes:

- App: `/app/`
- Account: `/account/`
- About: `/about/`

Use `Sign In / Sign Up` to authenticate with Email/Password or Google.

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

Invite flow behavior:

- signed-in users can accept invite and join directly
- signed-out users are prompted to sign in first

## 3. Account Page Features

The account page includes:

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

## 4. Friends and Invites

1. Add friend by UID.
2. Enter room code and optional message.
3. Send invite.
4. Invitee opens join action and enters app multiplayer tab with room code prefilled.

You can remove friends and dismiss invites.

## 5. Multiplayer Rooms

### Create room

In `Multiplayer` tab:

- choose visibility (`Private` or `Public`)
- optional room name
- optional location tag
- click `Create`

### Join room

- enter 6-character code and click `Join`
- or open invite link with `?room=AB12CD`
- signed-out users can browse public rooms in view-only mode; sign-in is required to join

### Save/open/delete room

Saved room behavior:

- rooms you create or join are saved under your account (`users/{uid}/myRooms/{roomCode}`)
- use `Open` on saved room list to return to that room
- if you are owner, `Delete` permanently removes the room document
- room documents persist until owner deletion (TTL does not delete room docs)

### Leave room

- `Leave` exits active room and stops your presence heartbeat

## 6. Weekly Featured City Room

- In `Multiplayer`, use the weekly callout to join the rotating public city room.
- The featured city changes on a weekly schedule.
- The weekly room is public, and its room code is shown in the multiplayer panel.

## 7. Globe Selector (Custom Location)

Open from `Location` -> `Custom`.

Features:

- interactive Earth globe pick for lat/lon
- selected coordinates + city/place readout
- `Nearby` tab listing closest prelisted menu cities to your current pick
- `Favorites` tab listing prelisted menu cities
- `Start Here` uses the same custom-location spawn path as search/manual custom input
- Moon (top-left) and Space (top-right) shortcuts use existing launch flows

## 8. Multiplayer Room Markers on Map

- Public room markers are visible to everyone on minimap and large map.
- Signed-in users also see their owned/current room markers.
- Weekly featured public room appears as a dedicated marker.

## 9. Multiplayer Data Lifetime

Persistent until explicit delete:

- room docs
- saved room shortcuts (`myRooms`)
- room settings
- shared blocks
- paint claims
- home base state

TTL-managed cleanup:

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

## 10. Chat and Safety

Chat protections:

- max message length: 500
- duplicate suppression window
- client and server cooldown + burst limits
- links/contact handles blocked
- profanity masking
- report action writes report flags

## 11. Paint the Town

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

## 12. Camera and Input Basics

- right-click or middle-click hold: camera look
- double-left-click camera toggle: disabled

For full control mapping by mode, see `CONTROLS_REFERENCE.md`.

## 13. Mobile Behavior

Mobile controls provide virtual pads and action buttons for:

- driving
- walking
- drone
- rocket

Mobile and desktop share the same gameplay systems and multiplayer state.

## 14. Troubleshooting

- If `Create`/`Join` does nothing, hard refresh and verify current user is signed in.
- If room actions fail with permissions, confirm deployed Firestore rules and Firebase auth state.
- If saved room `Open` fails, confirm the room code exists and owner has not deleted the room.
- If invites fail, verify friend relationship exists first.
- If donation receipts are missing, refresh account data and inspect function logs.

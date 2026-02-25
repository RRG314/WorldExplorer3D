# User Guide

Last reviewed: 2026-02-25

This guide explains current player-facing behavior across app, multiplayer, and account features.

## 1. Sign In and Navigation

Main routes:

- App: `/app/`
- Account: `/account/`
- About: `/about/`

Use `Sign In / Sign Up` to authenticate with Email/Password or Google.

## 2. Plans, Trial, and Multiplayer Access

- `Free`: single-player only, multiplayer locked
- `Trial` (2 days): multiplayer enabled temporarily, room limit `3`
- `Supporter`: multiplayer enabled, room limit `3`
- `Pro`: multiplayer enabled, room limit `10`

Invite flow behavior:

- existing multiplayer-enabled users go straight to room join
- free users can start trial from invite and then join

## 3. Account Page Features

The account page includes:

- plan and trial status
- room quota (`created / limit`)
- extras card
- admin status (allowlisted accounts only)
- username update
- linked email + verification state
- account UID + auth providers
- billing portal and receipt list
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

### Save/open/delete room

Saved room behavior:

- rooms you create or join are saved under your account (`users/{uid}/myRooms/{roomCode}`)
- use `Open` on saved room list to return to that room
- if you are owner, `Delete` permanently removes the room document
- room documents persist until owner deletion (TTL does not delete room docs)

### Leave room

- `Leave` exits active room and stops your presence heartbeat

## 6. Multiplayer Data Lifetime

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

## 7. Chat and Safety

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
- If room actions fail with permissions, confirm deployed Firestore rules and active plan/trial.
- If saved room `Open` fails, confirm the room code exists and owner has not deleted the room.
- If invites fail, verify friend relationship exists first.
- If billing/receipts are missing, refresh account data and inspect function logs.

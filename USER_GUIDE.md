# User Guide

Last reviewed: 2026-02-23

This guide covers current player-facing behavior for app, multiplayer, and account pages.

## 1. Start and Sign In

- Main app: `/app/`
- Account page: `/account/`
- Sign in with Email/Password or Google.

## 2. Plans and Multiplayer Access

- `Free`: multiplayer locked.
- `Trial` (2 days): multiplayer unlocked temporarily.
- `Supporter`: multiplayer unlocked, room create limit `3`.
- `Pro`: multiplayer unlocked, room create limit `10`, extras messaging.

Free users can start trial from account flow and eligible invite flow.

## 3. Profile and Account Data

Account page includes:

- Username (display name) edit/save
- Linked email + verification state
- Account UID and auth providers
- Plan and trial status
- Room quota usage
- Billing status and Stripe receipts
- Friends list and incoming invites

## 4. Friends and Invites

From account page:

1. Add friend using their account UID.
2. Enter room code and optional message.
3. Send invite to friend.
4. Invitee opens invite link to jump into room flow.

Users can remove friends and dismiss/mark invites.

## 5. Multiplayer Room Flow

In Multiplayer tab:

- Create room (private/public, optional name, optional location tag)
- Join by room code or invite link
- Share invite link
- Leave room
- Open room panel and chat

Room settings support owner-managed updates and optional public discovery fields.

## 6. Game Modes

- Free Roam
- Time Trial
- Checkpoints
- Paint the Town
- Police Chase
- Find the Flower

## 7. Paint the Town Controls

### Minimal HUD

Collapsed HUD shows:

- Remaining time
- Painted buildings count

Tap/click HUD to expand advanced controls.

### Paint controls

- Fire paintball from center: `Ctrl`
- Alternate fire: `G` or `P`
- Select color: `1-6`
- Toggle touch/gun tool: `T`
- Left click/touch: paint interaction based on active tool/rules

### Camera controls in gameplay

- Right-click hold or middle-click hold: camera look
- Double-left-click camera toggle is disabled

## 8. Chat and Safety

Room chat is member-only and filtered by server rules:

- message size limits
- write rate checks
- membership checks

Reported/flagged messages are supported by chat state fields.

## 9. Troubleshooting

- If multiplayer stays locked: check current plan/trial in account page.
- If invites fail: verify friend relationship exists first.
- If receipts missing: refresh receipts on account page and verify Stripe subscription.
- If room data lags: allow a short delay for snapshot updates and TTL cleanup.

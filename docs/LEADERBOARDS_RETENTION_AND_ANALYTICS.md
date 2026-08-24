# Leaderboards, Retention, and Analytics Contract

Last reviewed: 2026-08-23. This document distinguishes the release-now system
from future server-authoritative competition. It is an engineering and product
contract, not a promise that client-submitted scores are cheat-proof.

## Release-now architecture

World Explorer has one visible leaderboard surface backed by one catalog:

| Board | Ranking | Current scope | Score origin |
| --- | --- | --- | --- |
| Flower Sprint | Lowest completion time | Global, all time | Signed-in client submission; bounded by Firestore rules |
| Paint Town | Buildings, then coverage | Global, all time | Signed-in client submission; bounded by Firestore rules |
| Fishing | Catch score, then weight | Global, all time | Signed-in client submission; bounded by Firestore rules |
| Explorer League | Community score | Global, all time | Authenticated Firestore transaction after social/room actions |
| DeFlock Hunt | Score, then completion time | Global, all time | Signed-in client submission; bounded by Firestore rules |

Cloud results and results saved only on the current device are merged in the
UI and labeled. An empty cloud query must never erase a valid device result.
Public boards remain readable while signed out. Leaderboard updates are
secondary to room, friend, and artifact actions: a score update failure cannot
turn a successful room action into an apparent failure.

The shared boards are community competition, not prize-grade verified records.
Rules enforce identity, schema, ranges, timestamps, and write immutability, but
the client still observes the gameplay result. Do not attach money, scarce
inventory, or safety-critical rewards to these records.

## Retention loop

The intended loop is discover or join an activity, understand the scoring rule,
complete a bounded run, see the result immediately, compare with the community,
and choose a clear next action. Rooms add a cooperative loop: create or join,
share an artifact or activity, see Explorer progress, and return to continue
with the same group.

Leaderboards appear in the main game menu and after relevant score transitions.
Each board must state its scope and scoring rule, provide a specific empty state,
identify device-only results, highlight the current player, and expose a manual
refresh with an honest live/offline status.

## Analytics contract

Analytics is explicitly opt-in. Advertising storage, advertising user data, and
personalization remain denied. Product events are allow-listed and bounded.
Exact coordinates, room codes/names, player names, email, messages, and free
text are rejected before dispatch. Analytics is diagnostic and never gameplay
authority.

The useful funnels are:

1. Leaderboard view -> activity start -> score submission -> repeat play.
2. Room create/join -> shared artifact/activity -> return room visit.
3. Discovery action -> Journal/Field Guide progress -> later session return.

Track rates and outcomes, not vanity totals: score-publish success, device
fallback rate, room join success, contribution rate, repeat-run rate, and D1/D7
return among consenting users. Firebase standard reports can be delayed; use
DebugView for instrument validation and aggregate reports for product decisions.

## Competition hardening roadmap

Before competitive rewards or seasons ship:

1. Mint canonical result IDs on a trusted backend and make submission
   idempotent.
2. Recompute or validate eligible results from bounded server receipts instead
   of accepting a final client score.
3. Add score-rate limits, anomaly review, and Firebase App Check in monitor mode
   before enforcement.
4. Add weekly/seasonal and friends/room scopes using the same board catalog,
   including personal best and the player-rank window.
5. Preserve historical seasons as read-only records with scoring version and
   rule metadata.
6. Test accessibility, localization, privacy, deletion/export, and abuse paths
   before attaching rewards.

## R&D basis

- Google Play Games quality guidance: leaderboards should be easy to reach,
  visible after key transitions, bounded, and submitted at an appropriate rate:
  https://developer.android.com/games/pgs/quality
- Apple Game Center supports recurring leaderboards and recommends placing
  competition access in relevant game menus:
  https://developer.apple.com/documentation/gamekit/encourage-progress-and-competition-with-leaderboards
- Firebase event guidance and near-real-time DebugView:
  https://firebase.google.com/docs/analytics/web/events
  https://firebase.google.com/docs/analytics/debugview
- Firebase App Check complements authentication and Security Rules:
  https://firebase.google.com/docs/app-check
- Google consent controls for Analytics:
  https://support.google.com/analytics/answer/14009343

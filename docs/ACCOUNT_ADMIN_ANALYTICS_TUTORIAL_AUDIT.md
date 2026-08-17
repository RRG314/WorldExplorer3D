# Account, Administration, Analytics, Tutorial, Memory, and Diagnostics Audit

Date: 2026-08-16
Status: implemented locally; not deployed

## Outcome

World Explorer now presents one Account Center and one permission-gated
Administration workspace. This is an information-architecture consolidation,
not an account-data migration: existing Auth users, profile documents,
entitlements, receipts, creator profiles, friendships, invitations, rooms,
moderation records, and custom claims keep their current owners and schemas.

## Account Center

The account UI is organized around five user tasks:

1. Overview
2. Profile
3. Friends & Rooms
4. Support & Receipts
5. Security & Privacy

Administration appears as one conditional entry for eligible accounts. Signed-
out visitors see an access prompt; private account panels are hidden on first
paint. Sensitive actions live in Security & Privacy and account deletion retains
its separate typed and confirmation steps.

## Administration

The existing backend was already one permission-checked admin service. The
fragmentation was in the UI. The consolidated workspace now groups eight routes:

- Dashboard
- Safety & Community: Moderation, Users, Multiplayer
- Publishing & Insights: Site Content, Product Analytics
- Governance: System, Audit Log

Former `diagnostics` and `operations` links redirect inside the combined System
view so bookmarks do not break. Navigation never grants access: every admin
endpoint still calls `requireModerator`, and Firestore keeps custom-claim checks.

## Analytics baseline and event contract

The linked Firebase/Google Analytics property was inspected read-only for the
28-day window shown as July 19–August 15, 2026:

- 30-day active users: 1.5K
- 7-day active users: 234
- 1-day active users: 30
- Average engagement per active user: 3m 56s
- Engaged sessions per active user: 0.88
- Average engagement per session: 3m 14s
- Aggregate cohort retention shown: week 1 0.9%, week 2 0.4%, week 3 0.2%,
  week 4 0.7%, week 5 1.2%

Existing session/runtime events remain. The implementation adds bounded product
signals for `tutorial_begin`, `we3d_tutorial_step`, `tutorial_complete`, and
`we3d_discovery_action`. The sanitizer excludes coordinates, source/claim IDs,
and free-form text. Realtime/DebugView should be used for release validation;
cohorts and funnels—not raw event totals—should drive retention decisions.

## Tutorial redesign

The previous forced sequence attempted to teach Earth movement, transport,
space, Moon, Earth return, building, rooms, and invitations in one chain. It has
been replaced by a replayable first expedition:

1. Move 12 metres.
2. Choose one local field activity.
3. Record one discovery.

Space, Moon, building, and room guidance is contextual and appears only when the
player opens those systems after the core expedition. The guide supports Later,
Skip, and Replay, migrates completed/disabled version-1 state, and yields while
the Discovery workspace is open so two instructional panels do not stack.

## Memory regression and title lifecycle

The regression ledger correctly identified decoded provider staging as the prior
dense-city heap problem. The accepted release path remains active: decoded
Shortbread and raw Overpass staging are both zero after compilation.

The additional 1.4 GB Chrome symptom came from retaining the entire compiled
Earth world and WebGL geometry behind the title screen, even though starting
Earth always recompiles the selected location. Returning to the title now:

- disposes Living World, Discovery, Editable World presentation, and AR;
- clears roads, buildings, land use, vegetation, POIs, furniture, spatial
  indexes, publications, water registries, and provider staging;
- disposes renderer lists and marks the fixed world not ready;
- preserves durable account, room, creator, discovery, and edit data.

Installed-Chrome New York validation measured 797,886,412 bytes used JS heap and
2,214 WebGL geometries after load, then 484,348,476 bytes and 235 geometries
after title release. That is 313,537,936 bytes and 1,979 geometries released.
The same New York world then rebuilt successfully at 776,083,434 bytes with
provider staging still empty.

## Diagnostics audit

The RDT seed, complexity, and deterministic random helpers are legitimate world
systems and remain enabled. The separate RDT-noise visual experiment was not
used by normal world rendering, but reported itself enabled and allowed a
220,000-cell cache. It now defaults off, clears on disable, reports zero cached
cells in shipping mode, and has an 8,192-cell ceiling when explicitly enabled.

The performance and green debug overlays are local developer UI. Their F8,
F4/backtick shortcuts and performance-panel updates now work only on localhost
or with `?diagnostics=1`. The text-state interface remains lightweight and
available for browser testing. Full snapshots are constructed only on explicit
calls. Diagnostics has no `fetch`, Firebase write, timer-based upload, or paid
service path; the runtime snapshot explicitly reports `networkWrites: false`.

## Focused verification

- Account/admin/onboarding static contract: pass
- Account/admin desktop and 390px browser layouts: pass, no fatal errors
- Three-step tutorial browser journey and analytics events: pass
- New York load → title release → reload memory journey: pass
- Firestore security emulator: 70/70 pass
- Cloud Functions runtime/export contract: pass, 20 exports
- Discovery platform/backend/visual-budget contracts: pass
- Full detector → field activity → journal → companion → AR → mobile journey:
  pass, no fatal errors
- CSS integrity and 470 ES-module URL identities: pass

## External guidance used

- Apple Human Interface Guidelines: Onboarding
  https://developer.apple.com/design/human-interface-guidelines/onboarding
- Apple: Onboarding for Games
  https://developer.apple.com/app-store/onboarding-for-games/
- Google Analytics recommended events
  https://developers.google.com/analytics/devguides/collection/ga4/reference/events
- Firebase Analytics reports and validation
  https://firebase.google.com/docs/analytics/reports
- Chrome DevTools memory problem guidance
  https://developer.chrome.com/docs/devtools/memory-problems

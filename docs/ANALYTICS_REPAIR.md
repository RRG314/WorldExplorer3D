# Site analytics repair — September 8, 2026

Status: local implementation on `steven/building-exteriors-local`. Production still uses `22b2f4ef`; no hosting deployment or Google property configuration change was performed. Missing historical visits cannot be reconstructed from events that were never collected.

## Changes

- A lightweight shared initializer imports only Firebase App/Analytics for measurement. It does not load the world, account UI or App Check. The existing gameplay analytics uses that same singleton.
- Page arrivals now start on Home, About, Account/Admin, capture, game and legal pages. Redirect-only pages are intentionally not counted separately.
- One explicit `page_view`; the automatic initial page view is disabled. Canonical page location/title strip arbitrary paths, coordinates, queries, fragments and capture/room links. Referrer keeps its origin only, allowing broad Reddit referral attribution without private referring paths. UTM campaign parameters are not currently forwarded.
- `we3d_play_click` covers links into the game; `we3d_destination_select` records supported menu destinations; `we3d_menu_ready` and `we3d_first_play_ready` separate menu readiness from playable-world readiness. Existing world session events retain their meaning. These are funnel stages, not counts to add together as people.
- Site startup attempts are bounded to three, with backoff. A failed initializer is no longer permanently cached as null. Persistent browser/network blocking is not bypassed and recovery of every failed browser module import is not guaranteed.
- Standard/limited preference is retained, with a footer control outside the game. Limited mode clears first-party GA cookies and sets denied analytics storage. No new identifying fields or advertising permissions added.
- Admin analytics text now distinguishes accounts, arrivals and players; it points users toward Google Realtime and describes reporting delays. It does not invent an online count or create a second presence database.

## Executed evidence

- Node page-context tests: 2 passed, including capture secrets, arbitrary URL paths, coordinates and canonical sections.
- Existing source verifier passed with no entry-graph failures.
- Real Chrome, real Firebase SDK, collector intercepted locally: homepage produced exactly one page-view collection request; no seeded sensitive URL values were present.
- Mobile-sized Chrome (390 × 844), game bootstrap deliberately blocked: exactly one page-view request, `gameReady=false`. Calling the existing Firebase analytics initializer twice did not duplicate page views. This proves arrival tracking no longer waits for game startup; it is not a gameplay acceptance test.
- Standard-to-limited control cleared GA cookies and sent denied storage with all advertising fields denied. Reload retained the choice with zero GA cookies and no horizontal overflow at 390px. Visual inspection found the About page has an article footer as well as a site footer; placement was corrected to the body-level site footer.

No intercepted requests were forwarded to GA. A queued event or fulfilled test collector request does not prove receipt by the actual Google property. Production totals, historical comparisons, filters, enhanced-measurement settings and Google report access remain unverified. No claim of physical-phone testing.

## Release check

Build the normal production candidate with these changes; do not deploy the unrelated unfinished work merely to ship analytics. After user approval/deployment, confirm production measurement ID `G-H9H6H1EWY6` belongs to the linked property, visit Home then Play in an ordinary browser, and confirm those events in Realtime. Check standard reports after processing. Inspect property filters and automatic enhanced measurement for additional URL/event collection before claiming the property has a complete privacy audit.

Google browser measurement cannot guarantee every person is counted: blockers, disabled scripts, early exits before the SDK is available, and limited measurement still matter. Hosting request counts, if inspected later, are requests rather than deduplicated human visitors and include bots/assets. Do not label them as exact people.

References: [Firebase Analytics API](https://firebase.google.com/docs/reference/js/analytics), [GA configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config), [consent behavior](https://developers.google.com/tag-platform/security/concepts/consent-mode), [reporting freshness](https://support.google.com/analytics/answer/11198161?hl=en).

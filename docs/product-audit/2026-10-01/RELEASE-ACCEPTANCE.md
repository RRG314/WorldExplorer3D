# P20 / C05 acceptance — full release revalidation in progress

October 3 owner follow-up: revalidate phase 0 onward and all additional work for production. Earlier development receipts below are historical evidence, not a pass for the next immutable candidate. The candidate matrix now registers the previously omitted save, swimming, deck, marine art/research, planetary research, navigation, geology, district, mini-game and street-reference journeys. Source fixtures are explicitly separate from packaged journeys. The shared marine journey now uses browser authentication, actual room admission and Firestore SDK subscriptions. The naming-outage/ocean-entry repair passed its dedicated gate. The first immutable run completed all 81 candidate gates: 66 passed, 15 failed. Runtime and harness repairs are under focused verification; a new clean artifact and complete candidate/backend run remain required. The retained first-run report is output/verification/product-plan/first-candidate-d643c222.json.

October 3, 2026. The implementation sequence through P19 and its automated P20 accessibility work is closed. Do not keep adding unrelated features to those phases. The remaining items below are a finite release decision, not permission to claim production acceptance or reopen worldwide art expansion.

## What actually passed

- All 1,792 registered contracts and source checks for the current implementation.
- Actual street/day/night/phone, usable-door/collision and walk/drive/walk checks documented in STREET-QUALITY-REFERENCE.md. The supplied city image remains a design target; no full visual parity is claimed.
- Shared marine: nine two-client cases, three authenticated rules/subscription cases and eighteen local Ocean/ship regression cases. One anchored authored site; no global multiplayer Ocean directory.
- Cameras: actual Finland and California images, expanded four-view desktop wall, phone viewport, IndexedDB favorites/reload, idempotent no-reward Journal reference, source failure/retry and teardown. Eleven camera contracts. No live-video/global coverage claim.
- Operations: seven real geocoder emulator/HTTP/browser cases, provider cancellation/body limits, actual forecast/marine/earthquake reads, six marine asset hashes and updated Overture decode/conversion in Baltimore and London.
- `output/verification/accessibility-release/report.json`: **14 desktop and 8 phone-viewport assertions pass**. Desktop keyboard navigation reaches controls and Explore, 200% text/reduced motion/contrast/settings work, modal focus traps/restores, normal keyboard walking works, Backpack is named and has status, pause owns focus, and visible controls have names. Phone 390×844 touch profile passes 160% text/settings, 44 px targets, control names and unique IDs. No page errors or failed local resources in either profile. Screenshots inspected. This uses an actual source world, staging debug attestation, local geocoder authority, and software-composited Chrome; it is not a physical-phone, screen-reader, or hardware frame-time certificate.
- The fallback HUD/landing labels now say source/development preview instead of falsely claiming 5.2.0. An immutable build still publishes its actual manifest version and commit.

The runner `product-accessibility-emulators.mjs` owns its emulators, browser and disposable staging attestation and closes them. Ordinary Chrome, dist, saved candidates and player data are preserved. Gate registration now includes 17 systems, 82 candidate gates and three backend gates. New local marine, shared marine, camera wall, provider and geocoder checks are mandatory in the existing release matrix and now honor WE3D_VERIFY_ROOT. Emulator wrappers reuse an already attached local emulator instead of starting conflicting instances.

## Finite remaining release gates

| Gate | Current evidence / required result | Who or what supplies it |
|---|---|---|
| Weather service entitlement | Paid Open-Meteo account is unverified; current free endpoints cannot be certified for a commercial app. Confirm the existing plan, then configure/test an eligible server-side customer endpoint without exposing a key in the browser | Owner account information plus implementation/configuration check; no purchase or secret collection in chat |
| Hosted backend and TTL | Staging getPlaceLookup, mutateSharedExpedition, rules/indexes and active cache TTL were verified/deployed. Actual hosted App Check search and rejection without a token passed. Hosted shared access/forged-write denial, idempotence and Ocean presence also pass with disposable identities; deploy the patched dependency lock and retain final identity-matched receipts. Production is unchanged | Coordinated staging release |
| Matching immutable artifact | Existing candidate/backend release receipts are for older HEAD/workspace/artifacts. `product-release-readiness.log` correctly rejects reuse. A source pass cannot approve preserved dist | Build once after configuration is settled; run the registered candidate/backend matrix against that exact artifact; retain its manifest and results |
| Physical phone | iOS Safari and Android Chrome: load flagship location, move/turn, open map/Journal, use boat/ladder/sub recovery and camera wall, background/resume, rotate and return without stuck input or hidden controls | Actual devices; emulated viewport does not substitute |
| Uncoached player comprehension | A fresh player completes the five tasks below and can explain save/remote-data boundaries without developer prompts | Human play review |
| Performance and rollback | Match the existing supported-hardware performance/retention gate to the same artifact; preserve current production artifact/config and prove the rollback target before promotion | Release matrix and operator review; short source samples are not a performance certificate |

## Five uncoached tasks and pass rules

Give only the task, not the route. Record build ID, device/browser, whether completed unaided, the first confusion point and any stuck control. Do not collect GPS trails, account tokens or personal data.

1. **Start exploring and find something meaningful nearby.** Pass if the player chooses a location, recognizes the active task, can move and understands how to return to free roam.
2. **Complete the Coral Shelf research outing and return aboard.** Pass if the player understands the ship/sub relationship, recognizes the next survey target, completes or safely recovers, and locates the saved result. A shared journey additionally needs two people who can identify helm/pilot ownership and recover after one leaves.
3. **Travel to a space destination, perform its field task and return.** Pass if the player distinguishes selected destination from proximity/landing eligibility and can find the resulting report/upgrade.
4. **Find a remote road camera, save it and explore its location.** Pass if the player can switch regions/views, use the wall/favorite, recognize still versus live and unavailable capture time, and explain that viewing remotely did not award an in-person visit.
5. **Leave and resume safely.** Pass if the player can find Journal backup/resume instructions, distinguish browser-local progress from account records, recover from one offline source, and return to the main menu without losing the active journey unexpectedly.

Any blocker or misleading status is fixed and its affected journey rerun before promotion. Cosmetic worldwide expansion is a later increment; do not silently turn this acceptance list into an endless new phase.

## Release identity and rollback

Fresh October 3 read: production is `5.4.0+1532bdfbb5c1.319d215f60318297.production`, source `1532bdfbb5c11e002d278b058d1ebdba88384f60`. Nothing in this continuation replaces it. Historical 5.3 baseline documents and prior green receipts are not current authorization to deploy these changes. Fresh October 4 UTC inventory verifies release-54-1532 matches that exact production artifact; rollback-54-1532 is an older build and must not be selected by its name. The matching channel expires October 8. Backend compatibility still requires verification at promotion. Inventory: output/verification/product-plan/production-rollback-inventory.json.

New backend documents and favorites must survive a frontend rollback. Do not delete player journals, shared voyages, cache authorities or saved candidates to make a release gate green. The new geocoder's TTL applies only to its own public lookup cache. The production rollout must include its routing/function/index dependencies, not merely copy the frontend.

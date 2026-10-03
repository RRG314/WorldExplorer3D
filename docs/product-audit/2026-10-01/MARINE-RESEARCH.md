# P12 — first complete marine research outing

October 3, 2026. Local development; production unchanged.

The finite deliverable is **Coral Shelf: first survey**. It connects the existing research vessel, walkable deck, submarine, regional habitat, recovery and Journal into one completed outing. It does not add another inventory, currency, global rank or mission reward service.

## Player journey

1. Choose **Coral Shelf · first research outing** in the location menu. The shortcut runs the normal coordinate/depth eligibility check, then arrives on the research vessel's deck. It cannot bypass unknown or rejected depth evidence.
2. Select **Wet lab**, walk there, and take the briefing. The existing deck destination guidance leads to the station. The mission explains controls, clear-water travel and recovery.
3. Walk to the **Submarine cradle** and deploy the same saved sub. Follow map markers A, B and C. Guidance names the next area, distance, bearing and simulated target depth.
4. Stop within 18 m of each study site to scan. Each successful save advances exactly one site. Missing assets, wrong environment, pause, speed or distance cannot count as a scan. Reef contact gives a visible rise/reverse instruction.
5. Recover at any point without losing saved findings. A partially finished outing can resume after a real browser reload. The wet lab reports partial progress rather than falsely allowing completion.
6. With all three findings, return to the wet lab and submit. **Scanner II** increases range from **18 m to 35 m**. The on-vessel saved report lists the three findings and the improvement.
7. Deploy again, select a follow-up site and use the longer range. Follow-up records save to the same Journal, deduplicated per site/hour. Free exploration and recovery remain available.

The starter mission is an authored study. It teaches observing and returning evidence; it is not a live ecological survey, real qualification or claim of scientifically measured coral at those exact coordinates. The earlier “Map the hidden shelf” concept remains a possible later outing; its harbor/photo/sonar expansion is not silently claimed as delivered by this first survey.

## Authorities and persistence

`ocean/research-outing.js` owns the finite briefing → survey → report → completed projection and action gates. It derives progress from five stable events in the **existing discovery/Journal store**: briefing, three site records and submission. The completion event owns the local scanner entitlement. No independent mutable upgrade flag can drift away from the report.

`discovery/profile-store.js` gains bounded exact-ID reads (maximum 32 keys), using the existing `events` object store. Research progress cannot disappear merely because more than 500 later Journal entries exist. No database schema migration is needed. Existing Journal backup/restore includes these records; restore already reloads the app. This is device-local progress, with session-only wording when a memory store is used. It is not cross-device or server-verified multiplayer progression.

Every action refreshes authoritative stored events before admission. Lab actions require the actual parent research ship, an active deck pose within station range and the Coral Shelf operating area. Scans require the actual active actor, stationary movement, current regional assets and three-dimensional range. Events include the actor's coordinate/local position, scanner range, measured game distance and explicit authored truth type. Saves must confirm before state advances. Fixed IDs make retries/submissions idempotent; another event occupying a research ID is not overwritten or credited.

The existing voyage owner handles recovery and reload. The research HUD uses the existing voyage and deck panels; unrelated field journey cards cannot compete with it. Phone layouts keep recovery visible. Window framing makes the research vessel's glass walls physically legible without changing deck collision authority.

## Verification

- Six focused contracts: full staged completion/upgrade/reload/follow-up, scan admission, wrong-authority/isolated report rejection, partial recovery, wrong vessel/location, storage failure/idempotency and exact reads beyond the recent-event window.
- Full registered suite: **1,708 passing tests**, no failures/skips/todos. Source graph/syntax checks pass.
- Actual-app browser journey uses the real rig, deck/sub movement controllers and Journal IndexedDB. Only the entry-depth/reverse-location provider responses are controlled. It verifies menu → deck → briefing → deployment → first scan → reload/resume → partial recovery/redeployment → all scans → submission → a second dive using the earned longer range.
- Final actual-app run: eight cases pass, zero page exceptions. All eighteen existing Ocean/ship/deck/recovery/reload regression cases also pass. Final desktop report and phone controls images were inspected after fixing recovery/controls spacing.
- A follow-up was saved outside the original 18 m range with Scanner II's 35 m admission. Exactly one upgrade event and six research events were retained; no new rank points or unrelated inventory mutations occurred.
- The prescribed game client traverses the real research-deck fixture; screenshots are inspected. The actual journey includes desktop and 390×844 viewport checks. These are not physical-phone acceptance or production receipts.
- Local App Check warnings occur in the unsigned headless source harness; no authenticated-service acceptance is claimed. The local marine journey has no page exceptions.

Reports: `output/verification/product-plan/phase12-*.log`, `research-outing/browser.json`, `research-outing/` screenshots and `research-outing-client/`.

P12 closes the first local marine product slice. P13 begins the space navigation presentation work; world-wide ocean art, shared expeditions and release/device validation retain their separate plan owners.

# October 23, 2026 gameplay QA

The practical desktop and touch-emulation pass is complete. Exercised core gameplay passed after repairing fresh planetary entry. Mobile cold startup missed its existing budget, and physical-phone acceptance remains open. This is not a blanket production or every-device approval.

## Tested source and delivery

Testing began from clean `0abc582d42c50bff356b8dfd096b9a5136356d8d` on `steven/visual-quality` in the canonical architecture-evaluation worktree. Earlier fresh browser results used staging source `2b0c1a892345614bfe3bc4deea67d968d522e867`. Runtime fix `a674b568a395f660b9a494092a77d2f7027e5df5` is now on the existing staging test site:

- Build `5.6.1+a674b568a395.e9acda64f8514624.staging`, Hosting version `b26fd8f4ca5e3d66`.
- Package `output/hosting-validation/gameplay-qa-20261023-staging`.
- Asset manifest SHA-256 `57fed61fd280b68ac0c86e5c87b6fee8af35493d739086f4c90b98366d42eca2`.
- Production remains security build `5.6.1+a82ff0abef27.b225efbf098a35bb.production`. No backend, rules, Auth, release branch or player-data changes were made in this QA task. No branches were pushed.

Only three delivered source files differ from the previously tested staging source: transport admission, the existing spawn wrapper and its extracted publication body. `retained-input-review.json` proves the publication body is identical, reviews the narrow admission change, binds expanded input scopes to the original tested source, and supplements prior observations with affected transport regressions. Earlier Earth/ocean timing is retained evidence, not a new post-fix timing run. Test-only retry/freshness refinements do not require recompiling identical game bytes.

## Coverage and evidence levels

| Area | Result and evidence |
| --- | --- |
| Shell/settings | Actual hosted UI at desktop and 320/390/844 widths; navigation, close controls and preference reload persistence passed. |
| Earth | Actual full Baltimore world: 49,080 buildings and 18,951 roads. Walking, three-position camera cycle, map/pause blocking and resume, driving/braking, Backpack/Journal/Guide/Profile, drone/plane/ground handoffs, ship walking/flight/return and Moon/return passed. Same Earth world survived returns. |
| Touch gameplay | Actual touch events in Chrome emulation: walking/look, driving, portrait/landscape control bounds and input release passed. Uses desktop GPU. |
| Ocean | Actual guided Coral Shelf UI: deck walking/map, station approach and submarine deployment, steering/propulsion, scuba movement, recovery into sub and return to saved vessel deck passed. An isolated scuba retry also passed without executing preceding assertions. |
| Space/planetary | Actual visible Space shortcut, Mars course selection without teleportation, assist/manual handoff and preserved journey passed. Fresh Mars and Moon shortcuts and rover movement passed both compiled locally and on hosted staging. The real Mars rover GLB loaded and was visually checked. No Earth city was loaded for these fresh-entry checks. |
| Saves/progress | Real browser IndexedDB with controlled disposable records: cross-tab transaction contention/deduplication, reload, companion XP, import/export/replay, migration backup, failed import preservation, quota recovery and undo passed. Existing user saves were untouched. |
| Home/interior editor | Actual editor DOM and Three.js output at desktop/phone widths: rooms/grid, photo/crop/placement, save/reopen, stale recovery, undo and 3D/inside view passed. Synthetic photos and controlled HTTP; no real private upload/cloud-processing acceptance. |
| GPS/AR | Current components passed synthetic sensor, permission, cancellation and late-result lifecycle checks. Actual fallback 3D viewer opened/closed. Not physical GPS accuracy, WebXR or camera alignment. |
| Focused rules/owners | Current frame/session/navigation, migration/progression, maritime/ocean/spacecraft, economy/build storage, activity/fishing/home/companion and planetary/world-residency contracts passed. Original core group had 50 cases; its affected nine-case file was rerun with one new fresh-entry regression. Other families: 67 play, 68 activity/creation, 55 world-domain, 11 QA-input/cache and three camera/controller/frame-recorder cases. Counts overlap later targeted runs and are not added into a new grand total. |
| Multiplayer | Prior October 23 hosted private two-client room/chat/movement/public discovery and weekly guest publication/SDK lease/leave evidence retained against unchanged multiplayer files. Full guest UI walking/Leave remains prior local evidence. No new accounts or city replay, no 32-client load acceptance. |
| Tester email | Prior October 22 real 24-hour confirmation, approval/invitation/acceptance, reply and withdrawal evidence retained against unchanged relevant files. Owner Gmail Inbox placement only; no additional real mail sent. |
| Other mini-games | Current activity ownership/rule contracts supplement prior UI evidence. Complete new end-to-end playthroughs of every mini-game were not performed. Older broad gates were not silently relabeled as current full-game acceptance. |

## Performance and remaining findings

Measured on this 8 GiB Apple M1 Mac with installed Chrome 156.0.8078.47 and ANGLE Metal hardware rendering. Samples count actual published renderer frames, not every browser animation callback. No source changed while a run measured it.

| Sample | Result |
| --- | --- |
| Desktop street walking, third-person, 20 seconds | 45.81 FPS; p95/p99 33.4 ms; max 33.5 ms; no >100 ms stalls. Existing desktop frame budget passed. |
| Touch layout proxy, 20 seconds | 60.00 FPS; p95 16.7 ms; p99/max 16.8 ms. Proxy frame budget passed. |
| Ocean, 20 seconds | 60.00 FPS; p95 16.7 ms; max 16.8 ms. Frame budget passed. |
| Desktop cold first playable | Corrected full run 84.1 seconds, within its existing 120-second desktop budget. Earlier cold observation 105.2 seconds retained. |
| Mobile proxy cold first playable | **90.6 seconds against the existing 60-second target: failed.** This waits for committed playable world/runtime readiness, not just optional background scenery. The failure is retained and the threshold was not relaxed. |

Physical iPhone/Android hardware, Safari, sustained thermal/battery behavior, retained-memory ceilings, real hardware controllers and higher multiplayer concurrency remain unverified. The desktop heap snapshot is not a post-GC memory-limit certification. Existing geographic transport detail remains a finite selected-area source; these results do not establish unlimited worldwide streaming.

Ordinary automated staging sessions produced App Check 403/reCAPTCHA failures, and some weather/environment requests were unavailable. Gameplay continued through its existing fallback. These checks do not establish fresh protected-service acceptance. An ordinary Chrome Annapolis search displayed the expected place; its seven-day local cache means that observation alone cannot prove a fresh network attestation exchange. No debug attestation or weaker policy was introduced.

The next performance work should measure the cold-start critical path and improve time to first playable on mobile while preserving required coverage and existing publication owners. It should rerun that failed loading case and the changed path only, followed by real-device qualification; another broad feature sweep is not justified by this finding.

## Faster, current testing workflow

Use `docs/verification/GAMEPLAY-QA.md` and `npm run qa:gameplay:plan`, `qa:gameplay:report`, or a named group/check. Checks bind source/dependency/configuration/environment and evidence hashes, retain unrelated successes, preserve failures, and retry only a diagnosed case. Browser successes age out after seven days; component results remain source-bound. Reporting never launches a world. The unchanged default rerun retained 34 receipt units, kept the mobile failure visible, created zero new attempts and took about two seconds.

Failed evidence remains: initial obsolete canvas selector, camera-cycle cleanup assertion, rejected shallow ocean coordinate, missing fixture declaration, early Space readiness assertion, original real Mars failure and initial staging-upload cache prerequisite. These were diagnosed separately; no interrupted or failed observation was overwritten as passing. Later corrections have their own attempts.

All owned browser servers and ephemeral static servers closed. The ordinary Chrome profile/tab inventory, unrelated emulator, current dist, assets, history, production package and rollback packages were preserved. One redundant isolated security staging package was archived byte-for-byte against its retained production basis plus five-file overlay to keep four package slots; recovery proof is recorded. Operational evidence and hashes are under `output/research/gameplay-qa-2026-10-23/`, including coverage, retained-source/service reviews, visual inspection, resume proof and final readiness.

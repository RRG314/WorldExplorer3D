# P17 activity lifecycle — development closeout

October 3, 2026. Scope: existing route activities and standard game plugins share truthful completion, result, replay and lifecycle rules. No new currency or competitive authority. This is a development closeout, not a production or physical-device release certificate.

## Player-visible changes

- Activity details explain the required travel mode and route. Replay starts the selected activity. A world change cancels a route; using a different vehicle or pausing cannot advance its timer or checkpoints.
- Trial and checkpoint challenges enter a road vehicle, place targets at the published road height and require the vehicle at that height. Walking elsewhere cannot complete a parked car's challenge.
- Trial, checkpoints, Paint Town, Flower Sprint and DeFlock use the existing common result screen with readable phone layout, Journal status, retry, replay and Free Roam. Flower replay starts another flower run. Failure attempts are distinguishable from completions.
- The result owns only its own pause reason. Closing it preserves other pause owners. Flower and DeFlock elapsed time excludes pauses; restored completed DeFlock time is not doubled.
- Empty Paint Town starts decline with an explanation. Failed location-game module loads return to Free Explore with an explanation; an old load or failure cannot reactivate or cancel a replacement mode.

## Authorities and recovery

The existing Explorer Journal remains the completion authority. Local activity counts and best times update only after the matching event is accepted. Pending completion IDs persist before submission and are reused after reload/retry. The bounded pending queue admits one pending result per activity. A failed history-cache write retains the accepted pending record, so retry does not duplicate the Journal event. Storage failure is labeled honestly and asks the player to keep the tab open.

Legacy/cached completion history is unverified until its corresponding Journal event can be found. Backups that no longer contain that event do not leave a false confirmed status. Completion captures its original time, region and location before retry. Result presentation suppresses the separate discovery card for the same result. Standard games add zero new progression points; route first-completion behavior retains its existing two-point rule. These local records do not certify competitive results or remote leaderboard delivery.

A pending save prevents replaying the same result into a second unrecorded attempt. The registry declines failed starts, suppresses paused/world-loading updates and prevents asynchronous start ownership from returning after replacement. Fishing and field encounters retain their existing explicit cancel, eligibility and save-before-progress authorities; this phase does not replace those specialized mechanics.

## Verification evidence

- `phase17-close-source.log`: source checks pass.
- `phase17-close-contracts.log`: all 1,761 registered tests pass, including Journal rejection/reload/retry, projection failure, original-location retention, restored-history verification, route ownership, delayed start failure, nested pause and DeFlock restoration.
- `activity-lifecycle-acceptance/report.json`: actual provider-backed Baltimore app. Keyboard traversal of both route legs, wrong-mode checkpoint rejection, pause, injected Journal failure, actual Retry click, IndexedDB acceptance, selected-route replay/abort, trial failure/success and replay/Free Roam. Controlled position/time boundaries are used for trial completion; this is not a full race playthrough.
- `game-modes-lifecycle-final/report.json`: actual app checkpoint road-height/drive/start/cleanup, Paint Town start/result/cleanup, Flower completion/phone result/replay/cleanup, immediate DeFlock and GPS cancellation. Checkpoint/flower completion positions and Paint Town expiry are controlled boundaries. Not a full DeFlock hunt or GPS field session.
- `game-result-client-retry/` and `game-result-client-saved/`: prescribed web-game client, actual result controller/CSS, injected first-save rejection and subsequent acceptance. State and screenshots inspected. Actual phone Flower result also inspected.
- Existing registered field/fishing contracts pass. No fresh full fishing playthrough, physical phone test, remote leaderboard certification or production deployment is claimed.

Evidence lives under `output/verification/product-plan/`. Earlier failed runs remain historical evidence, not passing receipts. P18 shared marine ownership, P19 operations, P20 release and camera C04/C05 remain open; they do not extend this finite lifecycle phase.

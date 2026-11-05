# Current first-time experience audit

Baseline is the published TRAIL staging build `98dbf5d4…c081…staging`, not a diagnostic fixture. Fresh disposable desktop and phone contexts used ordinary `/app/`, normal buttons, keyboard/mouse or native CDP touch input. No diagnostics query, game-context command, preloaded save, grants, pose write or accelerated clock. Developer-informed automation is **not** uncoached human usability research.

Desktop: `output/research/career-world-20261105/onboarding-1793848688278/`; phone: `onboarding-1793849790589/`. Every capture, including driver failures, is retained. Full accepted career methods and laps were not replayed.

## Entry-to-outcome observation

| Boundary | Actual observation | Disposition |
| --- | --- | --- |
| Launch / sign-in | Globe, optional Sign In/Sign Up, search, Explore, guided walk and other quick starts available; tester invitation also appears | Guest entry works. Registered fresh-account creation/login was not newly exercised; reuse prior auth acceptance. Invitation competes with new-player direction. |
| Character | Guided walk did not require manual attribute/appearance creation before movement | Useful low-friction entry; source supports deeper existing creation. Do not add a second character wizard. |
| Guided Start | Selects Baltimore Walk; original tutorial begins at Move | Confirmed card created with `hidden=false` but computed `display:none` on desktop and phone. Presentation defect, not absence of tutorial logic. |
| Controls | Desktop W / mouse and native left touch pad move/look; move threshold advances lesson | Device-appropriate labels exist but hidden. In-game Controls/Settings opens original controls; replay is in globe Settings Learning. |
| First task discovery | Quiet action → Today contains chapter, Sandbox directions, tools, routes and goals | Multiple primary directions before a clear task. Current physical vehicle interaction can replace ambient guidance; not proof task state was lost. |
| Early attempt | Detector field activity started; transient quick Resume disappeared before delayed automation click | Preserve driver timeout. No claim that delayed click on expired UI is an app failure. Later movement/refine ambiguity is unresolved, not a diagnosed movement bug. |
| Achievable guided objective | First Bearings starts an actual nearby virtual field lead and closes Today | A redundant scripted close failed because the panel had already closed. Driver error, not product close defect. |
| First meaningful result | Native movement/hold-position survey → Record: Tulip tree documented as a guided field record | Actual committed virtual habitat result, +3 Explorer story points. Explicitly not a real organism occurrence. The earlier Baltimore visit +1 was not treated as the first meaningful task. |
| Journal / completion | Actual event visible in Journal, then First Bearings finish/badge and next choices | Valid result and badge accepted. Final stored tutorial v6 is `completed:true`, `stage:complete` with exact result ID; stale hidden card caption does not prove event failure. |
| Backpack | Original Backpack opens with carried tools and quick slots | Free field essentials present; many unrelated combat/gear slots visible. Show task essentials first without deleting existing items. Local sandbox balance is not the connected wallet. |
| Next direction | Harbor Run, Three Views, workspace opportunity and other exploration available | There is meaningful continuation, but hierarchy/terminology remains crowded; “Pilot” first job is road delivery. |
| Skip/replay | Learning settings toggle disabled tips; explicit Replay resets lesson only; normal reload retained v6 lesson state | Actual settings/reload boundary observed. No item/course reset detected by this operation; original broader persistence receipts remain reused. |
| Return after reload | Return-to-Baltimore begins world load | Queued menu/Journal actions fired before readiness and timed out, then owned browser closed. Fresh post-reload Journal visual is **not accepted**; no evidence of lost save. Future helper now waits for readiness. |
| Phone | Native touch advances Move; menu→Journal→Today→First Bearings works | First-objective entry accepted, not a complete phone result/badge journey. Phone menu and tall Today hierarchy reviewed visually. |

## Timings and interpretation

Desktop first launch 5,850 ms; first playable observation 67,684 ms from script start. Phone first launch 6,480 ms; first playable 69,943 ms. These are single observed cold sessions, not medians, p95, native-device performance or server SLA. Desktop first recorded result observation at 435,424 ms and badge/next choices at 460,060 ms include long analyst/research pauses. They are not human learning-time measures. Forty-six desktop actions include six failed automation actions; the whole run is not a pass. Phone baseline completed twelve actions without driver error; narrower scope still applies.

## Independent repair included locally

Original tutorial now tags its card from existing explicit guidance consent (`mobileHintsConsent`, also set by desktop Guided Start/Continue/Replay/enable). HUD CSS shows only requested, unhidden guidance; unsolicited ambient banners remain hidden. Fresh **source phone** `onboarding-1793851132061` proves visible first card, real Details/dismiss, native touch Move→Interact and menu suppression, seven actions, no page errors. It is an affected-boundary repair, not a selected career architecture or staged release. Desktop/landscape component checks and exact final evidence are recorded in the acceptance receipt.

## Remaining design issues

Choose one current task; make Help/Continue/Replay easy to find in play; preserve free explore/skip; show saved-result scope honestly; connect career choice to actual compatible work; separate background/focus/task/travel; offer next choices after a real result. Loading/recovery and first interaction clarity need validation with uninstructed people and varied accessibility needs. Do not infer retention improvement from an automated walkthrough.

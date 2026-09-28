# Acceptance and release readiness

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

**Not ready to deploy the new action capability.** Work is local only. Existing production remains separate.

| Gate | Status | Evidence / remaining requirement |
|---|---|---|
| Shared animation controller | Component pass | Real Three mixers: layers, duplicate events, independent ownership, disposal, finite dt |
| Licensed character rendering | Lab visual pass | `output/action-game-rnd/animation-lab/shot-0.png`; two actual rigs walking/waving, punching and holding/firing existing licensed equipment; separate inspected punch/fire captures, not networked |
| Backpack/equipment/hand pose compatibility | Targeted pass after test update | Existing related tests; one old fake-mixer test updated to actual layered controller behavior |
| Server action resolution | Component pass | Injected actors/collision/time; range, occlusion, cooldown, forged targets, retries, throwable fuse |
| Legacy server cooldown | Component pass | Reject early repeat, accept exact boundary; not a live service check |
| Two authenticated players in mapped world | Pending | No action transport/gateway/movement authority integrated |
| Player damage/recovery/respawn | Pending | Prototype condition mutation only; recovery and replication missing |
| Pickup/drop/rewards | Pending | Durable shared custody and simultaneous claims untested |
| NPC response/vehicle/building/activity chain | Pending | Existing pieces retained; full new two-player sequence not run |
| Private admission/capacity/host change | Pending for new layer | Existing admission is reused; new gateway needs enforcement tests |
| Disconnect/reconnect | Partial component only | UID/epoch receipts survive pose-record replacement; process restart/failover not covered |
| Desktop/mobile controls | Lab only / pending | Full game action chain and physical touch remain open |
| Sustained performance/retention | Pending | No matched multiplayer run; no new FPS claim |
| Asset/license audit | Partial | Existing character GLBs measured, source licenses verified; new imports not made |
| Source/build/exact artifact | Source gate passed; artifact pending | Earlier candidate predates these edits; do not advertise it as containing them |
| Production deployment | Not attempted | Explicitly prohibited until gates complete |

A passing component check is not a backend authority or real-browser gameplay pass. A two-rig screenshot is not two authenticated players. Any release report must retain these distinctions and carry the exact tested commit/artifact identity.

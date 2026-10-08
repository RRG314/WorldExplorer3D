# P10 — local marine deployment and recovery

October 2, 2026. Development source, not production.

## Bounded delivery contract

The last single-player marine voyage has stable parent-vessel and submarine IDs, condition, a geographic parent anchor, a submarine pose, wave phase and an aboard/underwater stage. It saves on this device every five simulation seconds and on supported exits/page-hide. The location menu offers an explicit resume action. Underwater reload resumes aboard the parked submarine; aboard reload returns to the parent vessel. A moved parent vessel updates its geographic anchor. This is a local traversal save, not cloud ownership or a multiplayer lease.

The research deck includes a visible submarine and cradle station. Launch uses the existing Ocean controller and starts clear of the rotated parent's stern. The same submarine identity appears underwater; the parent stays visible at the launch point and on the navigation map. Explicit recovery returns the player and submarine to that parent anchor, moors the ship, and enables redeployment from the cradle. Recovery is assisted travel, not a claim that the submarine has physically piloted home. Other vessel classes use their existing Travel route.

The voyage record does not copy or grant cargo, credits, items or Journal rewards. Backpack and Journal retain their existing persistence authorities through these transitions. There is no new tradable marine cargo system in this phase; P12 owns research-outing objectives and upgrade utility, and P18 owns shared expedition/cargo authority.

## Failure and ownership rules

- One boat/sub transfer can run at a time. Duplicate clicks cannot launch another craft.
- Capture water phase and vessel state before suspension. A failed launch restores the original vessel; a changed environment/origin prevents a stale launch or rollback from reviving it.
- Validate the surface candidate before exiting Ocean. Failed surface activation can restore the previous sub; errors do not leave the transfer lock permanently held.
- Resume uses the normal title launch lifecycle and validates the stored record. Current seabed and parent-hull clearance repair unsafe saved poses. The saved record is a past accepted game traversal, not a fresh observed depth measurement.
- Finite/bounded fields and known vessel classes are required. Invalid/future records are retained rather than silently replaced. Storage failure and an observed newer-tab record produce explicit unsaved feedback.
- The storage comparison detects changed records but is not a server transaction or a cross-tab exclusive control lease. Marine saves are device-local; multiplayer is P18.
- The save is the latest voyage, not a fleet of owned ships. Beginning a different ocean outing replaces that continuation slot. Existing inventory and rewards are never copied into this slot.

## Evidence

Eight focused contracts cover validated persistence, quota failure, changed-tab conflicts, stable IDs/condition, moved surface anchors, failed/cancelled/duplicate transitions, rotated hull clearance and closed hull end faces. Six deck browser cases still pass. The full registered suite passes **1,696 tests**, with zero failures/skips/todos. Source checks pass.

Actual-app browser acceptance exercises the Ocean/ship/bridge/map route, underwater reload through the real location-menu button, recovery to the original parent, aboard reload and cradle redeployment. Provider entry responses are controlled; runtime/controllers/storage/renderers are real. Screenshots include the resume menu, resumed submarine, cradle and phone framing. This is browser viewport acceptance, not a physical touch-device certificate. See `phase10-ocean-entry.log`, `phase10-deck-browser.log`, `phase10-focused.log`, `phase10-source.log`, `phase10-full-contracts.log`, and the prescribed `research-cradle-client/` evidence under `output/verification/product-plan`.

P11 regional habitats/art and P12 meaningful research progression are still separate work. None of these development checks constitute a production promotion.

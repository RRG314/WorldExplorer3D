# Navigation and activity hierarchy

Current global destinations are Explore, Activities, Journal, Create and Together. The globe is a destination selector. Activities contains twenty career assignments and quick games/routes; Today adds opening chapters, Sandbox choices, field leads and goals. This overlap makes the product feel larger and less deliberate than its underlying ownership model.

## Terms with distinct jobs

| Term | Meaning | Example |
| --- | --- | --- |
| Destination | Where the current world originates | Baltimore, Moon, Coral Shelf, supported space destination |
| Career/interest | Thematic direction, optional guidance | Geologist, Racer |
| Background | Existing character preparation | Field Prospector |
| Specialty/proficiency | Practice resulting from valid work | Geology, survey equipment |
| Experience/activity | Concrete playable entry through an adapter | Reading the Landscape, a road race, a created route |
| Mission/task | Accepted progression state and next valid action | Compare station B; return the cargo |
| Travel mode | Active movement/controller | Walk, Drive, Drone, submarine |
| Qualification | Evidence-backed capability requirement | Existing advanced-dive readiness check |

## Three navigation alternatives

| Alternative | Layout | Benefit / cost |
| --- | --- | --- |
| 1 Preserve five destinations, improve hierarchy | Explore = place; Activities = one “Continue” + assignments/games; Journal = story/skills; Create/Together stay | Lowest migration and preserves familiar routes. Recommended first implementation. Requires disciplined Today/current-task dedup. |
| 2 Play + Explorer + Create + Together | Play combines place/activity; Explorer combines Journal/character/focus | Simpler top level, but large route/label migration and risk hiding globe or saved workflows. Preview before adoption. |
| 3 Destination-first globe with context drawer | World selection foregrounded; context filters activities, Journal accessible everywhere | Strong geographical coherence; weaker quick access to nonlocal careers, property and long trips. Must not restrict global browsing to current place. |

No production navigation is changed by this review. The interactive preview uses deliberate menu access and shared action terms; the Atlas composition demonstrates a persistent route index at large widths. Keep the existing global navigation IDs and deep links until an approved map defines their migration.

## Recommended first pass

Activities opens with one original accepted task to Continue (or one clear starter if none), then interests and quick play. Opening a focus does not launch a task. Starting a task goes through original offer/place/equipment/admission. Today becomes the expanded current-task view with deliberate alternatives, not a second all-app lobby. Journal contains result history with source/location/custody, plus optional skills and course records. Create retains original track, room, world and capture ownership. Together retains rooms, invites, shared activities and domain restrictions.

Search should match places, activities and interests with explicit type labels rather than mixing incompatible Start actions. Unsupported context shows why and offers valid travel or local alternatives. Do not use a static reference-map pin as a published enterable POI. Globe selection, optional continuous exploration and all current travel modes remain.

Measure after implementation: number of competing primary CTAs, ability to find Continue/Backpack/travel/globe/help without instruction, time to a real first result, successful return to unfinished work and task-switch abandonment. Do not optimize clicks by removing controls players need.

# Three complete redesign options

These are alternative information architectures for the same app, not three new feature sets or color skins. All preserve the selected Roam identity, the 172-entry inventory, all twenty careers, existing saves/owners, optional exploration, creation, multiplayer and platform integrations. They are review proposals; no production UI has been replaced.

[Open the interactive design study](index.html). Switch the option, domain, screen, career, device and text size. The study uses clearly labeled sample data and schematic scenery, not a working game, real save, physical-device emulator or new gameplay evidence.

## A — Atlas: place first

The world/map is the starting surface. A selected place or body opens a readable details panel: available exploration, compatible activities, saved work and travel options. Career plans become routes and site/project overlays. Personal work remains accessible through a compact Continue strip and Journal.

Best if people primarily arrive thinking “take me somewhere.” It makes Earth, Ocean sites and cosmic scale feel like one explorable atlas. A new player can still choose a guided start without a career commitment.

Cost: place-first browsing can bury progression and complex instrument work. The design must keep Continue visible and prevent a giant decorative globe from pushing the phone's useful actions away. An activity should not require searching the map for a compatible site without help.

## B — Expedition: next useful action first — recommended

The starting board offers one real Continue item, Explore a place, Try an activity and Play together. The same navigation framework persists in all worlds. A chosen journey supplies one objective and a contextual kit, with a compact explanation of the result to expect. Explore opens the full atlas; specialist work can open a richer instrument panel.

Best fit for the selected mixed-age/experience audience. It answers “what can I do now?” while keeping free exploration one clear choice away. It foregrounds existing resumable content and useful return visits rather than displaying twenty equally weighted careers on first entry.

Cost: recommendations need honest readiness and a useful new-player empty state. They must never pretend a player has progress, equipment, a live nearby event or a supported destination. Avoid replacing the sandbox with a compulsory linear campaign.

## C — Workbench: chosen pursuit first

A player deliberately selects a workspace, such as Racing, Field research, Marine operations, Space expedition or Making. The workspace foregrounds the relevant map, instruments, inventory and report/project. Play, Plan and Review are workspace views beneath the same global destinations; they do not become another world/save/progression system.

Best for returning players and complex tasks. It can make the large existing science, ship and creation systems feel purposeful instead of scattered.

Cost: selecting a profession before experiencing the app adds cognitive load, and dense panels are harder on phones. Keep an easy general Explorer workspace and an obvious switch. Never rearrange the player's controls automatically while moving or taking a measurement.

## Whole-app comparison

| Area | Atlas | Expedition | Workbench |
| --- | --- | --- | --- |
| First visit | Choose a place; see useful things there | Choose a small understandable intention; enter or continue | Choose an interest/workspace; get a fitted start |
| Earth | Map, district and nearby detail | Current journey plus place/map | Site/route/project workspace |
| Ocean | Site/chart → vessel/sub/diver choices | Continue voyage or guided marine task | Marine stations, chart, deployment and report panels |
| Moon/Mars | Body detail → supported surface options | Current survey/return with optional planetary exploration | Survey workspace and rover/tool/analysis panels |
| Stars/planets/galaxies | Hierarchical atlas with readable scale | Destination and next course/task, atlas on demand | Navigation/science workstation with deeper catalog detail |
| Careers | Find work at a place; pin a career | Interest groups and one next assignment | Explicit workspace and its tools/progress |
| Racing | Venue/track on map, event details | Continue ladder/practice, prepare car, next event | Event, garage, setup, track creation and results workspace |
| Journal and return | Place-linked collections and past visits | Result → saved proof → meaningful next action | Evidence, analysis and project/skill review |
| Creation/home/capture | Make a project at this place | Continue a draft or choose what to make | Editor/project workspace with explicit validation and publication |
| Multiplayer | People/rooms attached to selected places | Join an understandable shared activity | Room roles, permissions and shared work |
| Phone | Large map with bounded detail sheet | Short cards and one current action | One tool/panel at a time; specialist views replace columns |
| VR | Spatial place/object selection with list alternative | Compact objective, common menu and context action | Anchored station tools; no compulsory reaching or extra render loop |
| Portal/widgets/native entry | Saved place opens matching atlas context | Continue opens matching existing task or place | Open a specific saved project where supported |
| Main risk | Wonderful map; unclear reason to return | Over-prescriptive recommendations | Expert power; too much initial complexity |

## Recommendation and decision boundary

Choose **B as the default framework**, retain the atlas treatment inside Explore, and offer Workbench-style specialist panels only within a deliberately selected activity. This is one navigation and action architecture with contextual depth, not three parallel app modes. Keep the global labels, save semantics, controls and return behavior stable.

Choose A instead if the product's central promise is geographic browsing and interviews confirm people want place before purpose. Choose C if the principal audience changes to returning specialist players. Neither needs a different backend or a new gameplay engine.

Before implementation, select the primary option and test the proposed grouping/labels with uncoached users. The clickable study is sufficiently concrete to compare hierarchy and task flow; it does not validate retention, accessibility, scientific accuracy or actual 3D performance. Implementation stages and their stopping points are in [implementation-plan.md](implementation-plan.md).

# World Explorer: whole-app UX redesign plan

November 4, 2026. **Research and design proposal; production is unchanged.** Audience selected by the owner: mixed ages and experience, with simple entry and optional depth. The selected Roam visual identity remains the starting point. This is the next product-design phase after the completed release, not a restart of accepted gameplay testing.

## Start here

[Compare the three interactive designs](index.html). The self-contained study covers Earth, Ocean/vessel, Moon, Mars, Solar System, stars/deep space and home/room contexts; start/continue, exploration, in-world HUD, all 20 careers, brief, kit, Journal, creation/sharing, rooms, settings and saves. Switch desktop/phone/short-landscape/spatial-menu concept, text size, guidance, contrast and example failure states. It is schematic sample UI with no gameplay, backend, account or save connection.

| Option | Starting point | Choose it for | Main risk |
| --- | --- | --- | --- |
| A · Atlas | A place, then what is possible there | Geographic and cosmic discovery | Progression/Continue can become secondary |
| **B · Expedition — recommended** | One useful next action, with easy free exploration | Mixed ages, novices and returning players | Suggestions must be honest and optional |
| C · Workbench | A deliberately chosen pursuit and fitted tools | Deeper science, racing, marine or creation work | More initial complexity and dense phone layouts |

The recommendation is **B as the common framework**, an atlas within Explore, and specialist workspaces within selected activities. This keeps one app with contextual depth. It does not create twenty different career apps or rewrite the game engine.

## Main findings

1. The menu changes between the globe, Earth/vessel play and Space. Journal is primary in the selector and nested under Backpack in ordinary play. Space foregrounds a separate navigation stack.
2. Careers, worlds and cosmic destinations use large flat choices. The UI asks players to know the right profession, object or scale before it helps them choose.
3. Existing task, instrument, travel and creation controls need a consistent hierarchy. On the phone, persistent vessel panels leave a narrow world view despite many useful controls being present.
4. Device-local saves, account records, shared-room changes and published contributions need one understandable status explanation. The recent12-versus290 account confusion was a staging/production distinction; final production checks confirmed the original accounts remained.
5. Progression already has actual evidence, outcomes and varied work. The UI needs to explain what a player kept, what benefit it has and what useful next action is available. Adding more content or currencies would not solve the hierarchy problem.

These findings combine live UI observation, current source tracing and retained evidence. They are not claimed user-study results or proof that every feature is universally accessible.

## What was inventoried

- **172** feature/system entries with current entry, canonical source, proposed destination, scope and evidence notes.
- **20** retained careers and **15** quick-play/route references; **100** product capability descriptions. These overlap; they are not independent counts of finished features.
- **72** interface surfaces, including public site, account, capture, editors, Portal, native launchers/widgets, controls and VR.
- Current `app/js` source scale: **1,374 files / 258,724 lines**. The audit covers feature families and key interactions; it does not pretend every line received a detailed correctness/security review.

The plan preserves all existing gameplay and data ownership: three accepted venues/pits and real vehicles; garage/upgrades/damage; rivals/crews/races/results/leaderboards; all three track creation methods; location-based and optional extended exploration; buildings/home/creation; Ocean/Space/planetary systems; original photos/saves/history; multiplayer; mobile/VR and platform integrations.

## Review packet

| Document | Purpose |
| --- | --- |
| [Current audit](audit.md) |18 prioritized findings, current evidence, strengths and explicit limits |
| [Design options](options.md) | Whole-app comparison, tradeoffs and recommended direction |
| [Architecture and flows](architecture-and-flows.md) | Stable navigation, all domains, all 20 career workspaces, progression, saves, accessibility and system boundaries |
| [Implementation and stopping points](implementation-plan.md) | Ten bounded phases, owner boundaries, acceptance/reuse matrix, actual usability tasks and measurement plan |
| [Research](research.md) |15 primary references and the particular design decisions they inform |
| [Feature inventory](feature-inventory.csv) |172 traceable entries; a review artifact, never a runtime permission registry |
| [Surface crosswalk](surface-crosswalk.json) |72 retained interface surfaces and existing source owners; historical migration status is not treated as current truth |

## The proposed structure

Five stable destinations: **Explore, Activities, Journal, Create, Together**. Profile/account, saves, settings, controls and help are utilities. Map, interaction, Travel, kit and recovery remain directly available in context. A career supplies the useful instruments and next task while global navigation remains predictable.

Keep the existing experience catalog/adapters, ScreenLayout/modal/focus handling, interaction resolver, action input, session coordinator, profile/Backpack/character/voyage stores, render/asset lifetimes and server authorities. The redesign composes their presentation; it does not become another gameplay, economy or persistence owner.

## Decisions and evidence still needed

Choose the preferred starting architecture and evaluate labels/grouping with actual uncoached users before implementation. The plan includes both a novice path and deeper role-specific work without an irreversible career commitment. Real phone/controller/assistive/XR/native evaluation is needed for any changed presentation that promises those experiences. A browser prototype cannot establish universal access, physical comfort or retention gains.

The stopping point for this phase is this research/design packet and a verified comparison study. Application implementation, asset production, new content and production deployment are separate work after direction selection. Accepted gameplay procedures remain closed unless a demonstrated affected boundary changes.

## Design-study verification

The study's first-use/returning choice, career search/brief/kit/result, Back/Escape, track methods, room scope, offline/missing-equipment and failed-save examples were exercised. All 17 screen types render; the three layouts, short landscape, phone and affected 200% text boundaries were checked. Corrected Atlas navigation height, narrow labels and large-text phone overlap were rechecked only at their affected boundaries. Track, workspace and capture concepts now retain different editor intents. Current checks report no page exceptions. This validates the review artifact, not implemented gameplay, universal accessibility or the planned redesign's production readiness. Original tool/locator/layout failures remain in the local evidence ledger.

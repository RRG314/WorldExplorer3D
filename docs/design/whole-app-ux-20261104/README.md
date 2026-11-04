# World Explorer: design studio, UX audit and implementation plan

November 4, 2026. **Design review; production is unchanged.** Audience: mixed ages and experience, simple entry with optional depth.

**Owner selected NOVA and authorized full application implementation and staging verification.** See [NOVA delivery and fixed stops](../NOVA-DELIVERY.md). Production deployment is prohibited for this redesign. The studio below remains a design reference; its generated concept scenery is not an application asset.

## Start with the visual preview

[Open the Visual Design Studio](index.html). The owner rejected the earlier structure-only preview because it retained essentially one appearance. This replacement presents five distinct visual directions with rendered, scene-backed interfaces.

| Direction | Appearance |
| --- | --- |
| TRAIL | Cinematic graphite/coral, condensed display type and cut-corner game HUD |
| ORBIT | Technical midnight/cyan, precise instruments, mono headings and square panels |
| FIELD | Light warm paper, olive ink, serif hierarchy and editorial photography |
| CURRENT | Bright white/cobalt, rounded controls, explicit labels and generous spacing |
| NOVA | Violet/lavender glass, light typography, floating cards and spatial dock |

Use **Compare styles** to see five HUD compositions immediately, **Full preview** to interact with a chosen direction, or **Screen board** to compare nine screen families. Scene choices cover Earth/city, Ocean, Space/stars, planetary surface, field research and home/garage; each direction includes a phone composition. A shared scene can be used for a direct comparison. The visible UI is real HTML/CSS/JavaScript over clearly identified concept scenery and sample data; no game or save APIs are connected.

[Visual direction details](visual-directions.md) explain the typography, surfaces and composition changes. The earlier [Atlas/Expedition/Workbench research](options.md) remains an information-architecture comparison, not a selected visual identity. New visual selection is open. The original rejected preview remains in Git and local evidence.

The retained audit and implementation plan below remain applicable to the full feature portfolio. A new visual choice will set the appearance used during implementation; the selected production Roam identity does not constrain these new proposals.

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
| [Visual directions](visual-directions.md) | Five art directions and the interactive visual studio |
| [Structure options](options.md) | Retained navigation research, tradeoffs and framework recommendation |
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

## Current visual-studio verification

The v2 browser pass verifies five distinct type/palette/shape systems and multiple HUD compositions; all nine screen families render for every direction. The five phone layouts keep objectives, maps, tools and navigation separated; phone menus expose every screen. The gallery itself fits a phone. All twenty careers remain represented, and a less-featured career retains its identity. The screen board renders nine actual HTML interface compositions. Current page exceptions:zero. Sources and document links remain traceable.

Evidence: `output/playwright/whole-app-ux-20261104/visual-v2/`. This verifies the design-review artifact, not implemented gameplay, physical-device accessibility or production readiness. The earlier 17-screen structure study's checks are historical and were not rerun; current application gameplay acceptance remains unchanged.

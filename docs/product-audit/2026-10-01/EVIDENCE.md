# Evidence and audit limits

October 1, 2026

## Fresh runtime evidence

[Runtime report](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/runtime.json) · [Browser audit harness](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/inspect.mjs) · [Source bathymetry probe](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/bathymetry-probe.json)

The browser audit used isolated contexts, one at a time, on the current staging package. It visited four environments via visible launch buttons and sent a short ArrowUp sequence. No fixtures or game-state teleports were used to create the screenshots. The ocean, Mars and Moon views show forward movement; space ArrowUp changes attitude rather than proving a complete flight journey. Zero page exceptions were recorded. Console/provider/network health was not exhaustively asserted by this small harness.

| Scene | Arrival | After input | Evidence interpretation |
|---|---|---|---|
| Ocean | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/ocean-arrival.png) | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/ocean-moved.png) | Fresh visual/control sample, not a full acceptance run |
| Space | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/space-arrival.png) | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/space-moved.png) | Fresh visual/control sample, not a full acceptance run |
| Mars | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/mars-arrival.png) | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/mars-moved.png) | Fresh visual/control sample, not a full acceptance run |
| Moon | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/moon-arrival.png) | [Screenshot](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/product-audit-20261001/moon-moved.png) | Fresh visual/control sample, not a full acceptance run |

[Approved current-source Baltimore capture](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/output/release-evidence/current/complete-baltimore-world.png) was re-opened and visually inspected. It was captured during the preceding release, not newly generated in this audit.

The bathymetry probe injects one missing sample into a small grid. At the center it returns a modeled 60 m depth by treating the null as zero; at x=1,100 outside the sampled extent it returns the edge depth. These are isolated implementation reproductions, not a live ocean survey.

## Source references

These are inspected anchors, not proof that every caller or branch has been executed. The complete filesystem inventory is [source-inventory.json](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/source-inventory.json).

| ID | Source | Relevance |
|---|---|---|
| O1 | [app/js/ocean.js:37](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ocean.js:37) | Underwater controller bounds and launch state |
| O2 | [app/js/ocean/scene-assets.js:95](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ocean/scene-assets.js:95) | Fixed procedural reef construction |
| O3 | [app/js/ocean/bathymetry.js:190](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ocean/bathymetry.js:190) | Grid null coercion and edge clamping |
| O4 | [app/js/ocean/bathymetry.js:265](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ocean/bathymetry.js:265) | Depth compression and presentation scaling |
| O5 | [app/js/ocean/hud.js:3](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ocean/hud.js:3) | Decorative contour construction |
| O6 | [app/js/ui/globe-selector.js:563](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ui/globe-selector.js:563) | Ocean shortcut eligibility |
| O7 | [app/js/ui/title-screen.js:405](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ui/title-screen.js:405) | Ocean shortcut title bridge |
| O8 | [app/js/boat-mode/ocean-transfer.js:38](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/boat-mode/ocean-transfer.js:38) | Boat/submarine mode transfer |
| O9 | [app/js/transport/maritime-catalog.js:47](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/transport/maritime-catalog.js:47) | Existing research-vessel definition |
| O10 | [app/js/boat-mode/runtime-dynamics.js:117](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/boat-mode/runtime-dynamics.js:117) | Wave-derived boat drift |
| O11 | [app/js/geospatial/marine.js:7](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/geospatial/marine.js:7) | Existing marine data integration |
| O12 | [app/js/world/water-environment.js:30](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/world/water-environment.js:30) | Existing water evidence publication |
| O13 | [app/js/character/capability-resolver.js:35](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/character/capability-resolver.js:35) | Dive capability/equipment requirements |
| O14 | [app/js/character/catalog.js:61](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/character/catalog.js:61) | Advertised swimming-related trait |
| O15 | [app/js/travel-mode.js:12](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/travel-mode.js:12) | Actual existing travel states |
| S1 | [app/js/space/ui.js:508](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/space/ui.js:508) | Classic/physical landing eligibility presentation |
| S2 | [app/js/universe/mission-catalog.js:82](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/universe/mission-catalog.js:82) | Shared destination mission structure |
| S3 | [app/js/universe/mission-authority.js:90](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/universe/mission-authority.js:90) | Destination-mission local persistence |
| S4 | [app/js/expedition/campaign.js:22](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/expedition/campaign.js:22) | Existing campaign phases |
| S5 | [app/js/expedition/research-workbench.js:10](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/expedition/research-workbench.js:10) | Functional sample analysis/fabrication |
| S6 | [app/js/planetary/runtime/world-address.js:34](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/planetary/runtime/world-address.js:34) | Existing planetary address contract |
| S7 | [app/js/planetary/runtime/physical-environment.js:9](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/planetary/runtime/physical-environment.js:9) | Existing body-specific physical environment |
| P1 | [app/js/character/progression.js:7](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/character/progression.js:7) | Existing character activity progression |
| P2 | [app/js/discovery/profile-store.js:357](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/discovery/profile-store.js:357) | Journal/event persistence |
| P3 | [app/js/game/modes.js:175](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/game/modes.js:175) | Existing mini-game registry |
| P4 | [app/js/leaderboards/catalog.js:1](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/leaderboards/catalog.js:1) | Separate competition score meanings |
| P5 | [app/js/player/connected-player-state.js:6](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/player/connected-player-state.js:6) | Connected condition/upgrades scope |
| A1 | [app/js/runtime/kernel.js:69](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/runtime/kernel.js:69) | Existing update/owner registry |
| A2 | [app/js/session-coordinator.js:96](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/session-coordinator.js:96) | Environment lifecycle ownership |
| A3 | [app/js/runtime/workload-policy.js:1](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/runtime/workload-policy.js:1) | Existing work/performance baseline |
| A4 | [app/js/assets/model-asset-catalog.js:3](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/assets/model-asset-catalog.js:3) | Existing asset intake metadata and budgets |
| A5 | [functions/economy-authority.js:88](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/functions/economy-authority.js:88) | Existing transactional economy |
| A6 | [functions/expedition-authority.js:171](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/functions/expedition-authority.js:171) | Shared expedition revision rejection |
| A7 | [functions/discovery.js:79](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/functions/discovery.js:79) | Server receipt versus independent validation distinction |
| B1 | [app/js/live-earth/registry.js:3](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/live-earth/registry.js:3) | Live Earth layer scope |
| B2 | [app/js/reality-capture/runtime.js:199](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/reality-capture/runtime.js:199) | Capture presentation integration |
| B3 | [app/js/editable-world/runtime.js:246](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/editable-world/runtime.js:246) | World editing mutation path |
| B4 | [app/js/living-world/runtime.js:121](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/living-world/runtime.js:121) | Traffic/pedestrian world integration |
| B5 | [app/js/ui/accessibility.js:49](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/app/js/ui/accessibility.js:49) | Existing accessibility implementation |
| B6 | [functions/geospatial.js:11](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/functions/geospatial.js:11) | Existing provider cache policies |

## Coverage limits

- All major product domains are represented in the coverage table. Depth of review is deliberately greater for ocean, space, scene quality, progression and transitions. Inventory rows alone are not verification.
- No new full Earth traversal, full mission completion, authenticated multiplayer, billing transaction, account deletion, security penetration test or cloud-cost audit was performed. Existing release results are labeled prior evidence.
- No new physical-phone session, screen-reader study, controller-device check or uncoached usability session was performed. These are explicit delivery gates.
- This audit cannot guarantee that no further defects exist in 828 application JavaScript files, supporting backend code, or external data.
- Reference-game comparisons describe published features and proposed design adaptations; no proprietary implementation or equivalent AAA production capacity is claimed.
- No new model was licensed, downloaded, purchased, or approved for shipping.
- Suggested capability names, mission designs and delivery order are proposals; they do not describe shipped content.

## Artifact identity

Audit source: `1532bdfbb5c11e002d278b058d1ebdba88384f60`. Source inventory hashes were taken before writing these documentation files. Runtime code was not changed.

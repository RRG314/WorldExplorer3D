# World Explorer: make the existing systems into one game

October 1, 2026

**Keep the breadth. Finish the connections and the places.**

The recommended direction is an exploration sandbox with one explorer, one Journal, and consistent progress across Earth, Ocean, and Space. Vehicles help reach meaningful activities. Homes and building give players somewhere to invest. Existing mini-games remain optional activities. Live Earth helps plan and understand the world.

## Read the audit

- [Product audit](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/PRODUCT-AUDIT.md): current strengths, confirmed problems, whole-app coverage, visual direction and priorities.
- [Ocean and space design](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/OCEAN-AND-SPACE.md): research ship, deployable sub, swimming, automatic gear, water behavior, accurate geography, NMS-inspired travel and progression.
- [Delivery plan](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/DELIVERY-PLAN.md): system ownership, 20 sequenced work items, dependencies, acceptance criteria, maintenance and operating concerns.
- [Evidence](/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320/docs/product-audit/2026-10-01/EVIDENCE.md): current-source anchors, fresh screenshots, reproduced bathymetry issues and explicit review limits.

## Three decisions that organize the work

1. **Expeditions connect the experience.** A destination, a purpose, preparation, travel, meaningful action, a saved result and a reason to return.
2. **Location quality is a complete experience.** Terrain, composition, materials, life, sound, interaction and recovery must work together. High-detail models alone cannot provide this.
3. **One system decides each kind of state.** Water, movement, gear, vehicles, missions, rewards and saves need clear ownership that UI and visuals follow.

## First major outcome

A complete ocean outing: board a real research vessel → travel to a valid site → walk the deck → swim or automatically prepare for a dive → deploy/recover the sub → investigate a geographically appropriate underwater environment → return and analyze findings → save progress → use the earned improvement on another outing.

First repair ocean entry, misleading bathymetry, missing-data handling and capability claims. Then build that whole outing to a professional visual and interaction standard. Apply the proven pattern to a complete space expedition and a flagship Earth district.

The detailed plan preserves existing work. Nothing in production was changed during this audit.

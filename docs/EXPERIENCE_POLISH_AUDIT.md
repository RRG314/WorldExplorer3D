# World Explorer 3D — Experience Polish Audit

Date: 2026-08-16
Status: Active implementation guide

## Product point of view

The user is the explorer. World Explorer is one connected, playable world built from real places; wildlife, geology, travel, building, Live Earth, multiplayer, companions, and AR are things the explorer can do in that world. They are not separate products competing for the screen.

Every public-facing surface should make three things immediately clear:

1. Where am I?
2. What can I do here now?
3. What will remain meaningful when I return?

## Interface ownership

| Surface | Job | Visibility rule |
| --- | --- | --- |
| World view | Movement, place, and immediate action | Always primary |
| Compact HUD | Essential movement/status information | Persistent, minimal |
| Context prompt | One nearby opportunity | Appears briefly; dismissible |
| Field Journal | Discovery, collection, companions, equipment, expedition progress | Closed by default; opened intentionally |
| Activity view | Fishing, AR, building, or another focused task | Replaces competing panels while active |
| Account | Identity, progress, support, privacy, and settings | Outside moment-to-moment play |
| Admin workspace | Users, content, moderation, analytics, and operations | Role-gated; one coherent workspace |

This ownership model is the test for future features. If a feature cannot identify its owning surface and visibility rule, it is not ready to add to the UI.

## Current audit

| Area | Finding | Direction | Priority |
| --- | --- | --- | --- |
| Landing | Previously opened with generic platform language, three competing calls to action, ten equal feature cards, and an outdated scrolling screenshot archive | Player-centered expedition story, one primary action, current-build evidence, curated gallery | Implemented in this pass |
| Landing media | Older captures showed systems and visual quality that no longer matched the build | Only current-build captures in the page; refresh deliberately after major visual changes | Implemented in this pass |
| Discovery language | Internal taxonomy such as `procedural-game-encounter` and `domestic-companion` leaked into player cards | Keep machine identifiers in data; translate them at the presentation boundary | Implemented for Field Journal cards in this pass |
| Discovery chrome | “Field Systems / World Discovery” read like a developer subsystem and competed with the app identity | “World Explorer / Field Journal”; keep the panel collapsible and subordinate to the world | Implemented in this pass |
| World rendering | Current city captures still expose flat lighting, repeated facades, weak street texture, and abrupt transitions in some locations | Treat environment presentation as the next visual-quality gate; improve lighting/material cohesion before expanding marketing media | P0 next |
| Landmark completeness | Famous structures can be present in source data or tests yet absent from the rendered city, leaving users to report them one at a time | Maintain a representative-city landmark matrix and require visible evidence for each release; start with Baltimore JFX/harbor bridges and San Francisco–Oakland Bay Bridge | P0 next |
| Characters and traffic | Quality varies by LOD and some distant actors still read as shells; traffic lifetime is visually obvious | Shared quality tiers, longer hysteresis, pooled actors, believable spawn/despawn outside the camera’s attention | P0 next |
| Wildlife and geology | Real reference imagery is now present, but 3D representations remain uneven and some findings still feel synthetic | Curated species/material archetypes, stronger silhouettes/materials, measured LODs, and honest reference labels | P0 next |
| In-play UI | Several systems are individually organized but can still feel attached rather than native when multiple prompts compete | Enforce one context prompt and one focused panel at a time; use the Field Journal as the shared home | P1 |
| Tutorial | The first-expedition path exists but should be validated against actual abandonment points | Instrument stage completion, defer advanced systems, and teach one meaningful discovery during the first session | P1 |
| Account/admin | A consolidation audit and implementation are tracked separately | Keep player account and role-gated admin concerns clearly separated while sharing identity/session infrastructure | See `ACCOUNT_ADMIN_ANALYTICS_TUTORIAL_AUDIT.md` |
| Performance | High Chrome memory makes every visual addition risky | Continue lifecycle cleanup, capped caches/pools, on-demand modules, and real navigation-cycle measurements | P0 ongoing |

## Visual evidence policy

- Gameplay screenshots must come from the current build and record the capture date/build context.
- Marketing art may establish mood, but must never be labeled or framed as gameplay.
- Real animal, plant, and geology photography must include source and license information in the product.
- A weak screenshot is not repaired by adding more copy or decorative UI. Improve the scene or reduce its prominence.
- Retire a screenshot from public pages when its layout, character, vehicle, world rendering, or feature state no longer represents the product.

## Writing standard

- Start with the player action: “Photograph,” “Inspect,” “Follow,” “Record,” “Return.”
- Never expose storage keys, enum values, evidence classes, provider implementation labels, or schema language to players.
- Use “virtual” only where it prevents a real-world safety or occurrence misunderstanding; do not repeat it in every sentence.
- Use one stable name per product concept: World Explorer, Field Journal, Live Earth, Companions, Expedition, Account, Admin.
- Explain limitations plainly and near the relevant action, without placing warnings in the primary emotional pitch.

## Release gates for future polish work

1. The world remains the largest and highest-contrast element during play.
2. All nonessential play panels can be collapsed or dismissed.
3. No internal taxonomy appears in visible cards, headings, empty states, or errors.
4. Desktop and 390px mobile layouts have no horizontal overflow.
5. A current screenshot exists for every major feature promoted on the landing page.
6. Repeated enter/exit/navigation cycles do not cause unbounded memory growth.
7. New visual assets have provenance, license, and LOD/performance ownership.

## Recommended next implementation slice

The next highest-value pass is the world-presentation baseline: capture the same representative street, field, waterfront, traffic, wildlife, landmark, and night scenes; fix the most visible lighting/material/LOD defects; then recapture them under a repeatable screenshot route. The initial landmark matrix must include Baltimore's JFX/harbor crossings and the San Francisco–Oakland Bay Bridge, with a visible-frame assertion rather than a record count alone. That improves the actual experience and the marketing evidence at the same time.

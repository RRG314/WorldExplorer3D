# Street-quality reference and first implementation

October 3, 2026. Owner supplied `759.jpg`, a screenshot of a rendered city street in a video. It establishes a visual direction, not an identified engine, reusable asset license, measured location or promise that the browser will match an offline renderer.

## What the reference asks for

The visible strengths are a coherent street cross-section, repeated but varied architectural bays, distinct ground-floor storefronts, sidewalks with useful furniture, region-appropriate planting, pedestrians at human scale, and clear light/shadow separation. Keep the game's mapped geometry and regional character. Copying palms into Baltimore, inventing real business names, or adding dense unbounded crowds would not meet this standard.

The existing P16 acceptance was a bounded Harbor district interaction/content pass. It did not establish this broader city-art standard. The user's new direction extends the remaining product work; P18 marine authority and P19/P20 operations/release remain unfinished.

## Implemented first pass

- Original shallow shopfront modules: display-window side posts, transoms, stall risers, fascia strips and segmented colored canopies. Existing floor/bay calculations determine their dimensions. Both the physical door clearance and shader-reserved entrance bays are left clear. Retail/catalog eligibility is required; these modules do not invent a business, door or interior.
- Close architectural detail now follows the actual Earth actor after 65 m of travel. Lightweight near/mid building records survive base-geometry batching; no base mesh/material is retained. Existing building/tier limits remain 0/72/150/240, with at most six material batches. This is loaded-world coverage, not unlimited detail across the globe.
- Replacement construction yields between façade edges, buildings and material batches. The old set remains until the new set is complete. World reset/environment change cancels pending construction and releases owned resources. Building/entrance/collision authorities remain unchanged.
- Road albedo correction: the procedural asphalt map already supplied dark color; multiplying a second charcoal tint made streets almost black. Textured roads now use a neutral multiplier; untextured fallback retains its original color.

## Evidence

Actual provider-backed Baltimore app: origin, Light Street and Harbor staged inspection positions; actual keyboard movement after refresh; close storefront and phone screenshots. No page errors. Evidence: `output/verification/product-plan/street-reference-acceptance/report.json` and images. Compare the earlier `street-reference-before/` capture for the original scene. Weather/time were live between runs, so this is not a controlled lighting comparison.

The initial refresh reached 37.2 ms in one work slice. After edge/batch yielding and caching footprint centers, the final sampled Light Street refresh had a maximum 4.3 ms slice (129.3 ms total spread across frames), and Harbor 2.4 ms (95.1 ms total). These are short task timings on the observed 8 GiB Mac, not whole-game FPS or universal no-stall guarantees.

`storefront-street-client/`: prescribed web-game client, real production materials/layout/detail code on a small original four-building fixture, arrow camera controls, state and screenshots inspected. The fixture is not a claim about real storefront identities, NPCs, or complete city performance. First fixture accidentally selected rear façades; road-facing selection was corrected and screenshots reinspected.

Focused behavioral tests cover fitted elevation/entrance reservation, nonretail exclusion, focus replacement after base meshes have been batched away, draw-call bounds, low tier, reset cancellation and preservation of collision ownership. Full current/source checks are recorded separately in `street-reference-contracts.log` and `street-reference-source.log`.

## Remaining finite acceptance

- Street composition: verify connected sidewalks, crossings and lane markings against their actual road/traffic authorities at a representative dense block. Fill furnishing gaps through the existing placement/obstacle system, not decorative poles in the carriageway.
- Street life: measure nearby pedestrians across walking routes, check pavement/door/crossing use, varied existing character models, avoidance and meaningful idle destinations. The first pass did not increase crowd budgets or replace NPC models.
- Storefront identity and lighting: provenance-aware readable signs, restrained display/interior hints, contact shadows and day/night camera comparisons. No claim that today's glass bays are finished shop interiors or that every mapped building is enterable.
- Complete P18 shared marine authority; retain P19 rights/provider/asset budgets and P20 physical-device/comprehension/release gates. Camera C04/C05 remain open. Do not treat this first art pass as production approval or reference-quality completion.

The existing district door/exit and walk→drive→walk journey also passes after these changes, with the same exterior collider set restored (`street-reference-interior/report.json`). All 1,764 registered tests and source checks passed at visual closeout; subsequent backend checks add separate coverage.

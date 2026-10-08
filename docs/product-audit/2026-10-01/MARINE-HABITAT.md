# P11 — first regional marine content pack

October 2–3, 2026. Local development; production unchanged.

The finite P11 deliverable is one authored Coral Shelf pack around −18.2861, 147.7000, integrated with the existing seabed, submarine, diver and water authorities. It is not a recreation of the entire Great Barrier Reef or a live habitat survey. Additional biomes and asset expansion do not keep this phase open indefinitely.

## Delivered content and ownership

`ocean/habitat-plan.js` owns deterministic placement and obstacle bounds. `ocean/habitat.js` owns instanced rendering, distance detail and asset leases. The existing bathymetry authority supplies the floor; neither asset metadata nor the habitat changes geographic depth evidence. Eight reef patches contain up to 192 colonies, seagrass fringes and sparse outcrops. Table Garden, Branch Ridge and Seagrass Edge have A/B/C map markers. Known coordinates anchor the pack across changed launch origins. Terrain-source updates change height without randomly relocating surviving colonies. Shallow/invalid samples are excluded.

Three Smithsonian specimen scans replace the old cone/cylinder coral carpet. Offline preparation bakes transforms, crops mounting-base triangles, embeds the cut into authored rock, simplifies near/far models and removes runtime Draco decoding. Material colors are authored. Six GLBs total under 1.6 MB; nearby models stay under 6,500 triangles, distant models under 2,000, and each file under 500 KB. Immutable model revision hashes and the existing leased asset cache remain authoritative. Instances share geometry within each detail group. Grass has bounded vertex motion rather than independent object updates.

Unknown sites receive explicitly labeled authored sediment/outcrops, not tropical reefs. The featured site's visual fish pool is restricted to giant trevally through the existing fish population authority. This removes Atlantic tarpon from the Australian pack without treating historical occurrence as catch probabilities or current abundance. Fish retain generated-game-school provenance; their body axis, fin silhouettes, scale and countershading are corrected. Generic worldwide fish-catalog regionalization remains outside this first pack.

Submarines and divers respect habitat obstacles, diver exits reject obstructed space, and diver camera probes include habitat. The HUD states authored versus unverified habitat and reports unavailable coral assets. Failed loads release partial coral models while retaining usable seabed/outcrops. Late completions cannot repopulate a disposed scene.

Ocean sound is an optional, authored filtered machinery/water and breathing-like layer. A player gesture creates one session-owned audio context. Pause/hidden tab/mute reduce gain to zero; leaving closes it. It is not a recorded reef soundscape or an essential audio-only instruction.

## Sources and rights

- Smithsonian [coral collection](https://3d.si.edu/corals), [shape and structure](https://3d.si.edu/corals/shape-structure), [public content API](https://3d-api.si.edu/api-docs/) and [Open Access policy](https://www.si.edu/openaccess/faq). The API documentation identifies its referenced files as Open Access. The pack uses *Madrepora spicifera* USNM 244, *Madrepora formosa* USNM 292 and *Porites lobata* USNM 646 as shape references, not assertions that those exact living specimens occupy the game site.
- Exact download URLs, SHA-256 identities, modifications and CC0 rights are recorded in `app/assets/models/marine/asset-manifest.json` and `LICENSE.txt`; Data & Licenses exposes the attribution in the app. No Sketchfab asset or access credential was used.
- Reef Authority [coral reefs](https://outlookreport.gbrmpa.gov.au/values/2-biodiversity/23-habitats-support-species/235-coral-reefs) and [seagrass meadows](https://outlookreport.gbrmpa.gov.au/values/2-biodiversity/23-habitats-support-species/234-seagrass-meadows) inform the shallow reef/sediment/seagrass composition, not exact colony placement.
- Museums Victoria's [Fishes of Australia: giant trevally](https://fishesofaustralia.net.au/home/species/4268) supports regional plausibility. It does not validate this generated school's size or present-day location.

## Evidence and limits

Six focused contracts cover deterministic/geographic placement, provider-height changes, habitat exclusion, collision, measured GLB budgets/rights and sound lifecycle. All **1,702 registered component tests pass**, with no skips/todos/failures. Source/entry-graph checks pass.

Seven browser cases exercise actual-app asset loading, close contact/stop/reverse, sound controls, phone viewport layout, three controlled habitat rebuilds, cancellation and asset outage. The controlled rebuilds retain **9 geometries / 12 textures** each time; all marine leases return to zero on disposal. Expected deliberately blocked asset requests are distinguished from page exceptions. No page exceptions occurred.

One warmed-up actual-app sample captured 180 frames: p50 **16.6 ms**, p95 **17.9 ms**, p99 **18.2 ms**, maximum **18.9 ms**, zero over 100 ms. The sampled close scene used **15 draw calls / 525,732 triangles**. This short local Chrome sample is not a universal FPS or physical-phone claim. Loading, network boundaries and full release performance remain separately qualified.

Screenshots from wide arrival, close viewing, controlled night lighting, phone framing and the prescribed game client are inspected. The controlled flat-floor fixture is clearly distinct from the actual bathymetry scene. Scenery is a bounded first pack, not the requested ultimate ocean art standard across every coordinate. P12 owns the first research outing and earned upgrade; P20 owns wider release/device acceptance.

Reports: `output/verification/product-plan/phase11-*.log`, `habitat/browser.json`, `habitat-client/`, and the actual Ocean transition report in `output/verification/ocean-plan/entry-browser.json`.

The existing **18-case actual-app Ocean/ship/deck/recovery/reload walkthrough passes** after the habitat integration. Submarine contact stops forward motion and reversing clears the obstacle. A small desktop panel spacing correction keeps sound and voyage controls separate.

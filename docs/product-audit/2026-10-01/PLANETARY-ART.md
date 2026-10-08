# P15 — planetary presentation and local geology

October 3, 2026. Development work; production unchanged.

## Finite scope

Moon Apollo 11 terrain, Mars Olympus Mons region and Copper Dawn are the three acceptance sites. Preserve the lunar measured mesh, Mars regional height authority and fictional world's modeled relief. This phase establishes a coherent browser presentation baseline, not a claim of photorealism, worldwide detail or No Man's Sky feature parity. No downloaded asset, new graphics dependency or alternate terrain/collision authority is introduced.

## Changes

- Moon and Mars now have local regolith/low outcrop groupings; Copper Dawn has basalt column clusters. The detail is deterministic authored game geometry, never labeled an observed feature. Fine material detail changes shading without inventing measured elevation. Other catalog worlds retain their prior regional details.
- Each site uses two instanced geology draws with at most 1,800 small gravel pieces and 126 larger formations. Landing and nearby field work retain a clear 55 m area, with travel corridors through outer clusters. Geology follows the accepted rendered terrain sample. Existing scene owners retain and release it.
- Larger formations participate in the existing planetary obstacle authority. Walking and rover movement cannot pass through them; the rover checks the swept path, and an overlapping restored position can move out. Camera collision honors their height, so a camera or airborne rover above a formation is not blocked by an infinite wall.
- Moon/Mars entry no longer inherits Earth's blue environment map. Display lighting is readable, and the exact incoming light/environment/exposure state is restored on exit. Physical irradiance, gravity and temperature are unchanged. Explicit daylight exposure hides star fields on those two surfaces.
- The Moon/Mars map now draws a cached continuous terrain raster with the correct surface placement and color family. It no longer draws thousands of tiny red squares every frame; changes to the terrain buffer invalidate the raster.
- Registered extrasolar solid worlds select the existing animated spacesuit and a sealed expedition rover. Earth keeps its selected explorer/vehicle. Procedural rover replacement releases geometry/material resources; the cached Mars model remains separately owned.
- The return-to-pod control repositions after a viewport resize and no longer covers the phone survey heading.

Existing licensed spacesuit and Mars vehicle source records remain in the asset catalogue. New geology is generated original game detail with no external licensing dependency. The UI retains measured/modeled/fictional distinctions; barren worlds remain barren.

## Acceptance evidence

Development acceptance passes: **1,729 registered tests**, source graph/syntax checks, three actual-app arrival/walk/rover collision cases, phone resize, and scene exit. All three rover attempts moved about 5.9 m before stopping outside the formation; no page exceptions were reported. The prescribed game client was run and its screenshot/state inspected; its only console errors were unsigned local Firebase App Check warnings.

Before/after Moon, Mars and Copper Dawn screenshots and the final phone image were inspected. In three short 180-frame normal-RAF samples, p95 was about 16.8 ms; the worst frame was 100 ms on Copper Dawn. This does not establish sustained frame performance. The final scene exit had zero active obstacles and zero attached visible geology groups. Eight focused geology/map/resource contracts and two additional suit/sky contracts cover deterministic bounds, scene ownership, rover sweep, camera/airborne height, cached-map invalidation, vehicle identity and disposal.

P15 is closed for this three-site development baseline. More regions and photorealistic asset production are separate future content, not an endlessly expanding completion condition. P16 Earth district and camera integration is next. Evidence is collected in `output/verification/product-plan/phase15-*.log`, `planetary-art-before/`, `planetary-art/`, and the prescribed client directory. The browser uses direct arrival fixtures and controlled placement at collision boundaries, not an uncoached full journey. Normal frame sampling is a short local rendering check, not physical-device certification.

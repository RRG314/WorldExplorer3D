# Regional building architecture

Status: implementation in progress; not a release acceptance record.

## Implemented foundation

The importer now retains specific Overture building classes. Explicit flat or
unsupported roof shapes remain authoritative; provider half_hipped spelling is
normalised. Hipped, half-hipped, gambrel and mansard roofs have separate clipped
plane geometry with preserved total height. Mapped tile/slate surfaces use shared
1K photographic textures at physical scale; vertical gable faces retain wall colour. Numeric and compass runoff directions
and along/across ridge orientation are respected; single-slope roofs close their
raised perimeter walls. Observed roof height remains authoritative when roof
shape must be inferred, and named roof colours are preserved.

The existing exterior catalog now receives deterministic style decisions. Mapped
Mission Revival, Mediterranean, Italianate, Queen Anne, Colonial Revival, machiya
and chalet tags select initial material families; roof recommendations apply only
where compatible low-rise residential roof observations are absent. These are
initial presentation rules, not finished recreations of those architectural styles.
Contemporary Japanese/southern-European residential palettes and northern cabin
palettes have bounded eligibility. Industrial, tall, ruined and unknown-use
buildings are excluded from those residential overrides. Farmhouses and cabins
retain residential classification. Painted siding and timber use shared,
photographed plank surfaces instead of plaster; source attribution, conversion
hashes and physical scale accompany the assets.

Coordinate-only selections can resolve supported regional countries from a
compact Natural Earth 1:10m polygon subset. Provided country metadata wins;
coastlines/borders are approximate. Polygon holes remain intact, decoded rings
and query results have bounded caches, and no runtime service call is added.
The ten-country subset is 687 kB before transfer compression. It supplies visual
context, not surveyed district boundaries. Precise historic district coverage
and additional regions remain to be completed.

Visual review confirms distinct roof forms and working material textures. The
facade variants still need authored detail to be convincingly different. The
Tokyo runtime check passed walking/startup and reported no browser/local asset
errors, but its 116-second cold first-playable sample is not an accepted loading
result or a matched performance comparison. It preceded the coordinate fallback.


## Objective

Use the same building pipeline at every location, with locally appropriate massing,
roofs, facade materials and detail. A location must retain its mapped footprints,
heights, uses and landmarks. Missing observations may receive plausible visual
inference, recorded separately from facts. Country-wide historical stereotypes are
not a substitute for local evidence.

## Evidence and precedence

1. Preserve feature identity, source footprint, parts, measured height, mapped roof,
   facade material/colour, use, construction date and heritage attributes.
2. An individually reviewed landmark overrides only its matched source feature.
3. A reviewed district profile supplies missing style attributes only when the
   feature's use, scale and construction period are compatible.
4. Regional climate/material traditions supply conservative alternatives where
   district evidence is absent. These remain inferred, not surveyed properties.
5. Unknown areas retain a restrained contemporary fallback. Never invent temples,
   Roman ruins, stilt foundations or alpine cabins from latitude alone.

Overture distinguishes broad `subtype` from specific `class`; import the specific
class first and preserve both original values. Normalize provider roof vocabulary
at the boundary. Explicit flat roofs and unsupported mapped shapes must never be
silently replaced with a residential gable.

## One pipeline and one owner

Extend the existing exterior catalog, mapped-roof builder and provenance model.
A pure resolver produces a serializable style decision: profile ID/version,
evidence level, eligible use/era, material family, roof recommendation and source
references. Stable feature identity determines variation; camera position, load
order and multiplayer membership must not affect it.

The existing compiler remains responsible for footprint fitting, foundation,
collider, selection identity, batching, LOD and disposal. Roofs share the building's
measured total height; their height is removed from the wall body. Detailed assets
replace their owned representation instead of covering an invisible generic one.
Near and mid LOD consume the same decision. Far LOD retains silhouette and colour.

No extra live network request per building. Load bounded regional catalogs once,
select only needed asset families, share texture/material pools, release references
on unload, and cancel late asset completion when a location is no longer active.

## Regional coverage and exclusions

| Family | Required distinctions | Evidence before enabling ornate forms |
| --- | --- | --- |
| Mediterranean | Terracotta pitched masonry; coastal flat-roof variants; contemporary apartments | District, use and footprint; not a single Italy/Greece preset |
| Japanese | Contemporary housing, urban mixed use, traditional timber streets, snow-country farmhouses | Traditional styles require building/district evidence; gassho belongs to specific villages |
| Roman | Contemporary Rome, historic urban fabric, individually identified ancient remains | Heritage/archaeological identity; never convert ordinary Roman housing into ruins |
| American historic | Colonial Revival, Queen Anne, Italianate, Mission Revival, regional vernacular and rowhouses | Style/date or reviewed historic district; preserve modern neighbours |
| Tropical | Urban masonry, vernacular timber, shaded porches, ventilated pitched roofs | Settlement/use/material evidence; elevation or stilts require actual support data |
| Alpine/Nordic | Rural cabins, farms, mountain buildings and contemporary urban stock | Cabin/farm identity and local tradition; snow is not a building class |
| Other regions | British/European urban masonry, arid courtyard forms, African/Asian/Latin American local families | Expand with documented regional research; no claim of exhaustive coverage yet |

A profile may recommend a palette without changing structural form. Uncertain
roof data, concave footprints, multipart buildings and attached neighbours require
safe topology handling, not oversized intersecting roof meshes. Slope support must
meet the ground without stretching wall windows or changing the roof elevation.

## Roof implementation

Maintain explicit shape and orientation, distinguish hipped from pyramidal, and
implement gambrel/mansard/half-hipped silhouettes rather than aliasing all to gabled.
Use physical material scale and UVs/triplanar mapping appropriate to each surface.
Roof ridge caps, eaves and gutters are shared near-detail modules with bounded
counts; they must not extend into adjacent buildings or streets. Unsupported
shapes are a visible coverage gap in diagnostics, not fabricated mapped geometry.

## Sketchfab acquisition and art review

Prefer coherent modular kits for roofs, windows, shutters, doors, porches and wall
trim; use whole buildings only where footprint, dimensions and identity fit.
Each accepted asset needs a source URL, author, licence, attribution, original hash,
conversion record, dimensions, triangle/material/texture counts and reviewed LODs.
Exclude noncommercial-only or editorial-only assets from the commercial game.
No music, unrelated scene props, hidden duplicate meshes or unreviewed animations.

Review the original model, converted asset and in-world result side by side.
Reject inconsistent scale, lighting baked into albedo, excessive contrast,
cartoon styling and geometry that cannot be reduced within the existing renderer
budget. Download size alone is not a GPU-memory budget: record decoded textures,
mipmaps, geometry buffers, draw calls and repeated-instance cost.

Current discovery is not an accepted asset inventory. A Japanese house candidate
was downloaded and visually inspected under CC BY. Its urban diorama includes
1,060 meshes and renders at 1,061 draw calls in isolation; it is not approved
for repeated placement or registered as a runtime asset. A Mediterranean candidate labelled low-poly contains 257k triangles;
that label is not evidence of fitness. The lightweight cabin and Mediterranean house candidates were also downloaded
and inspected. The cabin is usable only as weathered vernacular reference; the
Mediterranean source has oversized source units and coarse surface textures.
A fourth CC BY candidate, Mehdi Shahsavan’s Wooden Window, was downloaded and
rendered: 346 source triangles, one model draw call and three model textures.
Its arched, weathered appearance needs a compatible use and in-world placement
review; it is not a general replacement for contemporary windows. None of these
candidates is registered for runtime placement. No new model is counted as shipped until
local files, attribution and in-world review exist.

## Acceptance and release sequence

1. Repair observation precedence and add contradictory/missing metadata tests.
2. Implement and test deterministic region/style decisions and district boundaries.
3. Complete distinct roof topology and physical materials; compare silhouettes.
4. Acquire, optimise and review asset families; integrate through existing owners.
5. Compare real scenes: Kyoto/Tokyo/Shirakawa, Florence/Aegean/Rome,
   Baltimore/San Francisco/suburbs, tropical urban/rural and alpine/Nordic sites.
   Include locations outside profile boundaries and locations without metadata.
6. Inspect ground and aerial views, day/night, rain/snow, near/mid transitions,
   attached buildings, concave outlines, steep slopes and missing assets.
7. Verify walking/driving/flight/boat, Earth-space-return, player/NPC collision,
   building selection, public rooms and weekly-room joins on the frozen candidate.
8. Measure matched load, heap, GPU resource counts and repeated-location teardown
   against production. Resolve existing performance failures; do not lower quality
   or waive failed results to declare the work complete.
9. Update release notes with delivered coverage and actual remaining limitations.
   Compatible additions target 5.4; refactoring alone does not require 6.0.

## Research references

- [Overture building fields](https://docs.overturemaps.org/schema/reference/buildings/building/): source identity, specific class, broad subtype and optional measured attributes.
- [Overture roof vocabulary](https://docs.overturemaps.org/schema/reference/buildings/types/roof_shape/): provider shapes include half_hipped, saltbox and sawtooth.
- [Historic England building stones](https://historicengland.org.uk/advice/technical-advice/buildings/building-stones-england): local material evidence for regional character.
- [UNESCO Shirakawa-go and Gokayama](https://whc.unesco.org/en/list/734/): gassho farmhouses are a local environmental and cultural tradition, not a generic Japanese house.
- [NPS Mission Revival](https://www.nps.gov/articles/mission-revival-architecture.htm) and [Queen Anne](https://www.nps.gov/articles/queen-anne-architecture.htm): distinct dated architectural families, not interchangeable US decoration.

- [CityEngine facade modeling](https://doc.arcgis.com/en/cityengine/latest/tutorials/tutorial-7-facade-modeling.htm): separate building mass, floors and bays before inserting premodelled windows and doors. Apply that composition approach within the existing renderer rather than adding a second city engine.
- [UNESCO Alberobello](https://whc.unesco.org/en/list/787): local limestone trulli demonstrate why Mediterranean coverage needs subregional forms.
- [UNESCO Lamu](https://whc.unesco.org/en/list/1055/): coral-stone and timber urban buildings demonstrate why tropical coverage cannot consist solely of wooden huts.

Regional research and asset review remain open work. This document records the
architecture and acceptance sequence, not a claim that every region is finished.

- [OSM roof direction](https://wiki.openstreetmap.org/wiki/Key:roof:direction) defines downhill runoff; [roof orientation](https://wiki.openstreetmap.org/wiki/Key:roof:orientation) defines the ridge relative to the building.

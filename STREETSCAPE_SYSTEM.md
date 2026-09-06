# World Explorer 3D Streetscape System

Status: implemented locally and verified on 2026-09-06. Production is unchanged.

## Purpose and boundary

The streetscape layer makes eligible road edges read as city streets instead of
flat stripes. It adds context-sized concrete sidewalks, a narrow curb cap,
vertical curb faces, grass-verge spacing where appropriate, driveway curb cuts,
and short entrance approaches.

It is deliberately downstream of the existing road publication. It does not
change road points, width profiles, junction geometry, terrain corridors,
traffic routing, driving collision, vehicle physics, bridges, tunnels, ramps,
or the pedestrian navigation graph.

## Existing authorities consumed

| Fact | Existing owner | Streetscape use |
| --- | --- | --- |
| Road centerline, class, tags, structure semantics | `app/js/world/` and `app/js/world/compiler/` | Eligibility and provenance |
| Local carriageway width | `app/js/world/road-cross-section-profile.js` | Offset from the actual road edge |
| Published road surface height | `app/js/structure-semantics.js` and `app/js/terrain/rebuild.js` | Curb height relative to the visible road |
| Rendered terrain height | `app/js/terrain/` | Terrain-conforming outer sidewalk edge |
| Intersections | `app/js/terrain/intersections.js` | Bounded junction exclusion envelopes |
| Building footprints and entrances | Existing building compiler and facade entrance catalog | Collision masks, context, and approaches |
| Parking and developed land use | Existing land-use publication | Pavement masks and urban evidence |
| Driveways | Existing mapped service-road records | Curb cuts |
| Vegetation placements | Existing vegetation publication | Avoid visible overlap |
| Pedestrian routes | `app/js/living-world/navigation-graphs.js` | Remains the only pathfinding authority |

## Generation rules

`app/js/streetscape/model.js` is a deterministic, versioned, data-only model.
For each ordinary at-grade road it applies this evidence order:

1. explicit `sidewalk`, `sidewalk:left`, and `sidewalk:right` tags;
2. an existing separately mapped path when the road says `sidewalk=separate`;
3. restrained inference for developed secondary, tertiary, residential,
   living-street, unclassified, or ordinary road contexts;
4. no generated sidewalk when the evidence is insufficient.

Motorways, trunks, tracks, proposed/construction roads, racing surfaces,
driveways, parking aisles, bridges, tunnels, ramps, and topology-separated
surfaces are excluded from inference. A mapped driveway may cut an eligible
curb but does not become a sidewalk-bearing street.

The cross section is always derived from the existing carriageway width:

`carriageway edge → gutter offset → curb → optional verge → sidewalk → frontage`

Context dimensions are bounded:

| Context | Sidewalk | Verge | Curb height |
| --- | ---: | ---: | ---: |
| Dense commercial/downtown | 2.80 m | 0 m | 0.14 m |
| Urban | 2.15 m | 0 m | 0.14 m |
| Industrial | 1.80 m | 0.35 m | 0.12 m |
| Suburban | 1.55 m | 0.80 m | 0.12 m |

Road bends use bounded joins, never unlimited miters. Sections are subdivided
at eight metres, stop before existing junction envelopes, and are rejected when
they overlap a building footprint, mapped parking surface, or published
vegetation placement. Entrance connectors are short, bounded, and rejected if
they would cross a carriageway.

## Rendering and interaction

`app/js/streetscape/presentation.js` publishes at most two meshes per world:

- one textured concrete batch for sidewalk, curb-top, and entrance surfaces;
- one curb-face batch for visible vertical depth.

The layer reuses the existing pavement texture set, world-space UVs, and scene
lifecycle. It creates no per-segment mesh, physics body, vehicle collider,
network request, timer, or pathfinding graph. The existing walking ground query
recognizes only the versioned streetscape footprint before the road query's
lateral tolerance; the driving query does not consult this layer.

The implementation intentionally adds no polygon dependency. Turf's buffer
operation and polygon-clipping/Clipper-style boolean operations are useful for
larger polygon-editing systems, but they would add projection or runtime
machinery for a bounded road-edge presentation that already has authoritative
widths and intersection exclusions. The current design therefore uses local
offset sections and spatial indexes. References:
[Turf buffer](https://turfjs.org/docs/api/buffer),
[polygon-clipping](https://github.com/mfogel/polygon-clipping), and
[Clipper2](https://angusj.com/clipper2/Docs/Overview.htm).

## Performance and lifecycle

- Nearby roads are processed first without reordering or mutating the source.
- Balanced quality is capped at 3,200 sidewalk sections and 180 entrance
  connectors inside a 1,500 m local radius; other tiers have smaller/larger
  explicit budgets.
- Building, land-use, and parking queries use 64 m spatial indexes.
- World reset and transport rebuild dispose both batches and clear the
  publication before another location is shown.
- `render_game_to_text()` and runtime diagnostics expose version, provenance,
  exclusions, section/curb counts, vertex/triangle totals, draw-call count, and
  explicit zero-mutation counters.

## Verification

`npm run verify:streetscape` covers:

- explicit and inferred eligibility;
- bridge, tunnel, ramp, motorway, service-access, and rural exclusions;
- context-specific width/verge rules;
- bounded joins and deterministic output;
- junction gaps, footprint/parking/vegetation masks, curb cuts, and entrances;
- immutable source roads;
- walking recognition without vehicle collision or navigation duplication;
- no folded/degenerate road triangles and no below-terrain road samples;
- live Baltimore desktop and San Francisco mobile world loads;
- no browser exceptions or failed local resources.

The two live locations each published two streetscape batches. Their existing
road integrity remained at zero folded triangles, zero degenerate triangles,
zero junction coverage gaps, and zero below-terrain findings.

## Intentional limits

This pass does not add crosswalk art, signals, lamps, benches, bicycle lanes,
parking simulation, drainage simulation, editable sidewalks, construction
phases, or a new pedestrian system. Existing mapped separate footways remain
owned by the linear-feature and pedestrian systems. Those areas should be
considered separately rather than expanding this road-safe visual layer.

# Terrain Source Decision

Status: **classified — legacy fallback only; rejected as authoritative 4.1
physics ground**

This record governs Phase 1 of `RELEASE_4_1_REBASE_PLAN.md`. It exists to keep
source correctness separate from renderer tuning, terrain filtering, roads,
buildings, spawn logic, and UI work.

## Candidate

- Dataset: Mapzen Terrain Tiles on AWS
- Product: Terrarium PNG, XYZ, EPSG:3857, 256 × 256 pixels
- Product role: a mixed-source global terrain composite
- Encoding: `R * 256 + G + B / 256 - 32768` metres
- Encoding increment: `1 / 256 m`
- Runtime zoom: 15
- Primary registry:
  <https://registry.opendata.aws/terrain-tiles/>
- Format documentation:
  <https://github.com/tilezen/joerd/blob/master/docs/formats.md>
- Source inventory:
  <https://github.com/tilezen/joerd/blob/master/docs/data-sources.md>
- Required attribution:
  <https://github.com/tilezen/joerd/blob/master/docs/attribution.md>

Mapzen documents 30 m SRTM as the ordinary global source, 3 m and 10 m 3DEP in
supported United States regions, and coarser sources at some scales or for
fill. The merged product's vertical datum is not proven uniform across all
contributing sources. Provider failure and missing tiles have no valid
elevation value and must not be represented as real `0 m` ground.

## Independent contract result

`npm run test:terrain-source` passes:

- global XYZ addressing with longitude wrapping and Web Mercator latitude
  bounds;
- north-to-south XYZ Y direction;
- adjacent tile-edge continuity;
- fixed Terrarium decode examples;
- WGS84 geodetic ↔ ECEF ↔ local ENU metre round trips in both hemispheres,
  across the antimeridian, and at high latitude;
- physical Web Mercator delivery-pixel spacing.

At z15, delivery pixels are about `4.777 m` apart at the equator and `3.967 m`
apart in Sydney. Those values describe the resampled PNG grid, not the
provider's resolving power. They must not be advertised or used as four-metre
global source resolution. The old application coordinate functions are not
used as the oracle for these tests.

## Live provider observations

`npm run audit:terrain-provider` is a read-only audit. It records raw RGB
neighbors, independently decoded metres, the local 5 × 5 range, tile identity,
pixel-registration alternatives, and any assigned government reference.

These first comparisons are observations, not acceptance thresholds. Datum
compatibility must be resolved before strict vertical-error gating.

| Class | Point | Terrarium source-pixel sample | Government reference | Observed difference |
| --- | --- | ---: | ---: | ---: |
| flat urban | Baltimore | 10.964 m | USGS 3DEP 10.990 m | -0.027 m |
| steep urban | Sydney | 62.645 m | Geoscience Australia 60.887 m | +1.758 m |
| rural | central Iowa | 346.470 m | USGS 3DEP 346.353 m | +0.117 m |
| mountain | Swiss Alps probe | 3863.896 m | swisstopo 3835.900 m | +27.996 m |
| coast | Monaco probe | 65.533 m | IGN RGE ALTI 52.330 m | +13.203 m |
| below sea level | Badwater Basin probe | -75.873 m | USGS 3DEP -81.590 m | +5.717 m |

The mountain and coast differences are large enough to require investigation,
but steep-slope horizontal registration, source resolution, and datum
compatibility must be separated before they can be classified as provider
error. A Baltimore cross-tile pair `0.00000002°` apart uses distinct adjacent
tiles and differs by only `-0.0049 m`; the USGS reference is unchanged at its
published precision. The high-latitude probe still needs an independent
reference.

## Sydney failure-chain evidence

At the selected center point:

- requested tile: `15/30147/19663`;
- source-pixel neighbors decode to `61.910`, `62.891`, `63.063`, and
  `63.977 m`;
- source-pixel bilinear result: `62.645 m`;
- legacy runtime registration result: `62.471 m`;
- registration difference: `-0.174 m`;
- raw 5 × 5 neighborhood range: `6.629 m`;
- Geoscience Australia bare-earth reference: `60.887 m`.

This center sample does not show a Terrarium decoding or scale explosion.
The 25-point Sydney grid is more revealing: compared with the Geoscience
Australia bare-earth service, the worst observed point is `+9.159 m` at
`-33.8693, 151.2093`. The spatially varying error is materially larger than
the center-point error and cannot be explained by the `0.174 m` sampling
registration difference alone. Across the grid, differences range from
`-4.013 m` through `+9.159 m`, the median is `+1.289 m`, and four points have
an absolute difference over `5 m`. Datum compatibility and resolution
differences still prevent calling the full difference surface contamination.

Installed-Chrome diagnostics now trace the failing point through the complete
surface chain:

- source elevation and rendered terrain agree within `0.030` world units;
- a nearby grade-separated Castlereagh Street footway marked `subgrade`
  incorrectly captured a new actor about `3.012` world units below terrain;
- after requiring vertical continuity for grade-separated walk attachment, the
  actor's feet equal the rendered terrain and the walk query falls back to
  terrain;
- sustained movement then exposed an `at_grade` footway published near zero
  height while terrain was about `48` world units high; at-grade paths now
  require physical continuity with terrain instead of trusting metadata alone;
- an elevated building part still produced `E Enter Yes` because entry
  selection used footprint overlap without vertical occupancy;
- building entry now requires actor-height overlap, using the same occupied
  volume principle as walking collision;
- the local 3 × 3 mesh/source comparison differs by at most `0.280` world
  units while the raw local relief spans `18.725` world units.

This attributes the observed underground gameplay defect to later surface and
occupancy composition, not Terrarium RGB decoding or terrain-mesh scale. The
remaining sharp local relief is present in provider samples and cannot be
corrected with a renderer-specific or coordinate-specific rule.

Chrome also exposed a world-load transaction defect: geometry finalization
could reveal gameplay before actor reconciliation. Geometry finalization no
longer owns presentation; the outer load session now reconciles actors before
clearing `worldLoading` and hiding the loader. Deferred structural work can
still report phase completion after commit and remains prohibited work for the
atomic-publication phase.

## Legacy defects recorded, not repaired in this phase

- Mercator inputs are not globally normalized or clamped.
- An unloaded or failed elevation tile is returned as real `0 m`.
- Geographic/world transforms depend on mutable shared location state.
- Local coordinates use a degree approximation rather than an explicit WGS84
  ENU frame.
- Raster sampling uses `fraction * 255`; source-pixel-center registration must
  be decided from the producer grid definition.
- Raw elevation, rendered terrain, structure cuts, collision, and later road or
  building rebuilds do not have one immutable owner.

## Classification

Mapzen Terrarium is retained only as the trusted 3.1 runtime's legacy visual
and provisional ground fallback. It is rejected as the authoritative ground
contract for 4.1 because:

1. source resolution and datum vary by region;
2. z15 delivery-pixel spacing overstates global resolving power;
3. independent controls show spatially varying differences that are too large
   to define one correction;
4. unavailable samples currently collapse to plausible zero elevation;
5. one immutable ground owner and confidence/failure output do not exist.

Copernicus GLO-30 is not an automatic replacement because it is a digital
surface model that includes buildings, infrastructure, and vegetation. A
bare-earth-derived product must also pass product-license review. The 4.1
compiler therefore needs a source-adapter boundary: approved regional
bare-earth terrain where available, a declared global fallback, source-native
resolution metadata, datum normalization, and recoverable rejection when
confidence is insufficient.

## Remaining provider-selection work

1. Add an authoritative high-latitude control.
2. Select the legally usable global fallback and regional bare-earth adapters.
3. Define datum conversion and source-confidence rules.
4. Prove the replacement through the same geographic classes before it can
   publish collision or traversal ground.

No filter, smoothing pass, road rebuild, terrain material change, or 4.1 UI
port may claim to fix source correctness. Phase 2 may proceed against the
source-adapter contract while provider candidates are evaluated independently.

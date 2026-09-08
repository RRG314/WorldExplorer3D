# Mapped ground — local checkpoint

## Implemented

- Existing nearby Shortbread request decodes land/sites/street polygons alongside
  POIs. Numeric converter IDs cannot overwrite existing road nodes; POI string
  identities are unchanged. No new provider or request loop.
- Detailed mapped physical cover participates in terrain material selection.
  Regional and detailed terrain share classification. Explicit surface tags win;
  purpose-only residential, commercial, park and reserve labels do not invent a
  uniform surface. Available polygon holes and provenance survive conversion.
- Spatial indexing is retained, with deterministic overlap ordering.
- Pedestrian-scale texture repeats, world-space secondary material scale,
  grass macro variation and rotated sand blend use existing texture assets.
- Parking uses mapped asphalt/gravel/soil/grass/sand material where specified.
  Geometry, height, road/camera ownership and capture delivery are unchanged.

## Executed evidence

15 focused tests passed: mapped cover/overlap/holes, numeric node-ID isolation,
parking materials, polar classification, road conformance and water datum.
Source/entry-graph verification passed; this is not visual proof by itself.

Prescribed browser client used real Chrome, with Android user agent/touch/mobile
viewport for phone emulation. Screenshots were opened and inspected:

- `output/verification/mapped-ground-house`: desktop neighborhood before the
  final data hookup, explorer visible. This is preliminary evidence only.
- `output/verification/mapped-ground-park-android`: preliminary park run exposed
  the missing detailed land collection (only water).
- `output/verification/mapped-ground-park-diagnostic`: final connected park
  loads 993 generalized surface polygons; published collection includes 119
  grass, 64 park and 247 parking records. These are tile/geometry records, not
  necessarily unique real-world sites. Ground and existing vegetation respond.
- `output/verification/mapped-ground-rural-android`: mapped forest, farmland,
  residential and parking evidence; 15.8-second load, no JS/WebGL errors.
- `output/verification/mapped-ground-desert`: 8-second load, no JS/WebGL errors,
  corrected terrain shape retained. Visible tiling prompted a further sand blend.
- `output/verification/mapped-ground-desert-final`: rotated sand blend rerun
  completed and screenshot inspected; near-ground repetition reduced. Distant
  texture patterning is still visible and remains a quality limitation.

Local capture AppCheck HTTP401 is expected on localhost. These runs do not prove
production/private capture asset delivery and did not weaken that protection.

## Open acceptance / limitations

- Dense park first attempt timed out at 90 seconds. Diagnostic retry completed
  in 75.5 seconds. Land geometry compilation was 155 ms and batching 11 ms;
  road/building compilation and transport publication dominate recorded phases.
  This is NOT acceptable startup-performance signoff or proof of zero regression.
- Physical Android testing, urban parking close-ups, broad climate/season visual
  coverage and sustained-travel acceptance remain open.
- Ground boundaries still interpolate over terrain vertices. Generalized z14
  polygons and 10 m land cover cannot provide survey-accurate lawn/driveway edges.
- Farmland material does not identify current crop, growing season or field rows.
  Unknown private-property layout is not invented as mapped truth.
- Material assets remain representative. Full per-surface normal-map blending
  and higher-quality vegetation are not completed by this checkpoint.
- No production deployment or GitHub publication is authorized by this checkpoint.

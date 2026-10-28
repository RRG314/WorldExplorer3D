# Explorer fleet derivatives

Five enterable road models and two aircraft visuals, licensed under CC BY 4.0.
The full source links, creators, source/derived SHA-256 values and measurements
are in [asset-manifest.json](asset-manifest.json). Original author notices are
preserved in the adjacent LICENSE files and the parent model attribution file.
The coupe has no verified model year; the Fleetwood is an early-1980s car.

## Reproduce

Obtain each original downloadable glTF archive from the manifest source URLs
and preserve its license. Extract into the keys `delorean`, `cadillac`,
`fleetwood`, `golf`, `datsun`, `cessna`, and `falcon` under a private SOURCE
folder. Originals and archives are not included in this repository.

From the repository root, using the pinned installed Node dependencies:

```sh
node scripts/prepare-explorer-fleet-assets.mjs SOURCE EMPTY_OUTPUT
```

An optional list of keys after EMPTY_OUTPUT processes only those sources.
The script refuses to overwrite existing output or modify originals. Review
its output visually before updating these derivatives, generated catalog and
model revisions. Never simplify production assets in place.

## Runtime and budgets

Assets load locally through the existing model-template resource leases and
bounded cache. No live Sketchfab account or external model CDN is needed.
Geometry remains shared, materials are cloned, and named wheel/propeller parts
remain articulated. The fleet uses the current population counts, collision,
vehicle admission, multiplayer and transport owners. Physics tuning provides
individual arcade handling, not certified manufacturer simulation.

Every model is below 110,000 triangles and 7 MB; actual metrics are in the
manifest. Color maps are at most 512 pixels, data maps 256. The seven GLBs total
about 18 MB on disk and are loaded on demand. Existing low-detail traffic,
service vehicles and default BMW remain. Aircraft retain a built-in visual
while loading or if a model is unavailable; retired aircraft cannot attach a
late result. Detailed cars retain the existing fail-closed loading behavior.

The Cessna retains the loader-supported KHR_materials_pbrSpecularGlossiness
extension. No new compression decoder or persistent scheduler is required.

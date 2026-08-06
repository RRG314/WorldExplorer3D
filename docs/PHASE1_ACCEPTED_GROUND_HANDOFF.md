# Phase 1 accepted-ground handoff

Status: engineering-complete for Phase 2 entry on 2026-07-29.

## Production authority

- Runtime input is WGS84 and the local metric frame remains EPSG:3857 with
  `+X east`, `+Y up`, and `-Z north`.
- Runtime ground is EGM2008 and is published only from a SHA-256-bound accepted
  artifact. Missing, corrupt, incomplete, unlicensed, or unclassified inputs
  remain unavailable; none become numeric zero.
- USGS 3DEP remains the higher-priority accepted bare-earth source where a
  reviewed regional artifact exists.
- The worldwide source is the public unsigned Copernicus DEM GLO-30 object
  distribution. GLO-90 is a failover only when a public GLO-30 object is absent.
  The builder never calls the permission-gated Copernicus view service.
- Copernicus is explicitly retained as a source DSM. The derived provider is
  separately registered as `copernicus-dem-classified-ground-v1` and cannot
  activate without `correctionAttested: true`.

## Classification and provenance

`worldexplorer-pmf-grid-v1` applies a conservative, slope-adaptive progressive
morphological opening to a buffered metric grid. It is based on the progressive
morphological filtering method described by Zhang et al.,
“A Progressive Morphological Filter for Removing Nonground Measurements from
Airborne LIDAR Data,” IEEE TGRS 41(4), 2003,
DOI `10.1109/TGRS.2003.810682`.

The implementation preserves raw DSM and derived ground as separate numeric
products, records the source tile URL, object hash, ETag, release, reference
frames, correction method, reason, uncertainty, and confidence for every
artifact/sample, and limits any classified above-ground correction to 80
meters. Synthetic tests prove removal of an elevated planar object and
preservation of a steep terrain ridge. Source hashes also make silent upstream
replacement observable.

## Worldwide evidence

The catalog contains nine accepted artifacts: Baltimore plus Monaco, Swiss
Alps, Svalbard, Antarctica, Dubai desert, Dead Sea, Lhasa plateau, and a
four-source-tile corner at 46°N, 8°E. These cover every Phase 1 worldwide
category: mountain city, coast, alpine, polar, desert, below sea level, high
plateau, and vector/DEM tile boundary.

Automated evidence:

- all nine artifacts pass manifest validation, SHA-256 verification, compile,
  edge sampling, outside-coverage unavailability, and corruption rejection;
- Dead Sea remains below -400 meters rather than being clamped to zero;
- Lhasa remains above 3,500 meters rather than being flattened;
- the tile-corner artifact binds four independently hashed source objects;
- raw and classified products remain separated for every sample;
- render/walk/drive surface parity and the authorized-height-consumer audit
  remain green;
- cached sampling p95 was 0.0013 ms against the 0.2 ms budget in the Phase 1
  Node benchmark.

Browser verification used the visible location-selection flow. Monaco, Swiss
Alps, Dead Sea, and the four-tile corner reached `worldLoad.status: "ready"`
with the expected accepted artifact, EGM2008 datum, no runtime errors, and no
visible zero-elevation cliff or source-tile seam. Review screenshot hashes:

- Monaco: `344174e0b3c49b420d9b236e2341dcaa9b4506ed92885959e741efb734edb94b`
- Swiss Alps: `134fbd3cd2e3c215e702aa761a03a4ae6801dbb48ab79642c0fa601b9f2c64bc`
- Dead Sea: `ebf290df5984c9efca120c80f8eb023d743a17646592c5f0517e2e7f30cc9381`
- four-tile corner: `9bdc201ae39fc4857964699d71388fd2809cca41a6c93f7d9a9b96ee4a198d15`

The browser used software rendering, so this is visual/functional evidence, not
the later hardware-eligible release performance sign-off.

## Licence and notices

The Copernicus WorldDEM-30 public licence grants worldwide, unlimited-time,
free rights to reproduce, distribute, communicate, adapt, modify, and combine
the data. Each manifest and the application legal surfaces carry the required
modified-product attribution and liability notice. The application does not
claim provider or Copernicus endorsement.

## Reproduction

```sh
npm ci
npm run ground:worldwide
npm run test:copernicus-ground
npm run test:accepted-ground-artifacts
npm run test:phase1-worldwide-ground
npm run test:ground-authority-consumers
npm run test:surface-contract
npm run build:hosting
```

`npm run ground:worldwide` uses only public unsigned objects. A missing public
object fails the build unless the public GLO-90 fallback exists; it never pauses
for credentials or an access approval.

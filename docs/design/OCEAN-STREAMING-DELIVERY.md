# Geographic ocean streaming

October 11, 2026. Local implementation and verification ledger; not a deployment receipt.

## Audit findings

The previous Ocean scene stopped at 1,200 world units. Its single 1,800-unit
seabed, 5×5 depth query, habitat, parent vessel and saved submarine pose all
assumed the launch point remained the render origin. Removing the movement
clamp alone would leave missing geometry, incorrect coordinates and broken
vessel recovery. The Earth location resolver, multiplayer pose frame and water
environment also independently used that launch origin.

Two lifecycle defects were found: supplying a cancellation signal disabled the
GEBCO request timeout, and generic scene disposal skipped particle geometry and
materials. Both have direct repairs in this change.

## Runtime contract

- New **open-ocean** geographic voyages can opt into continuous travel through
  the starting screen's “Continue beyond the dive site” checkbox. Saved local
  dives, authored Coral Shelf studies and server-owned shared outings retain
  their existing mode. Lakes, rivers, channels, harbors and coastal-only
  admissions are not promoted into permission to cross an entire ocean.
- Geographic cube tiles cover the date line and poles. Their identities do not
  depend on a scene origin. Keep at most nine resident tiles, two depth requests
  and 64 cached source nodes; evict geometry/materials with the depth tile.
- Each tile shares four source corners with adjacent tiles. The mesh and hull
  sampler use the same subdivided-triangle interpolation. This is a coarse game
  model, not a detailed survey or navigation chart. No measured ecological or
  live-animal claim follows from a depth sample.
- Missing depth stops horizontal travel before the hull enters an unready
  tile. The player can rise or recover to the vessel. Failed nodes retry after
  a bounded delay; cancelled/obsolete replies cannot publish into a new region.
- Rebase the local render frame near the player, retaining geographic identity
  for the launch vessel. Sub, diver, camera, tiles, map, water phase, observed
  location and room-pose frame must agree across the change.
- Version-two native-depth voyages and version-three streamed voyages use
  separate keys, preserving released version-one records. Version-three voyages retain the local frame and wave phase in their own storage key. Version-one/two records remain readable and unmodified by an
  underwater streaming checkpoint. A fallback build can still read its previous
  local voyage. Cross-tab conflicts and malformed records fail without overwrite.
- Submarine/deck custody, recovery, dive equipment, Journal and shared-crew
  authorization continue to use their existing owners.

## Research basis

[GEBCO's WMS documentation](https://www.gebco.net/data-products/gebco-web-services/web-map-service)
provides geographic terrain imagery and queryable model values. The service is
mixed-source bathymetry; sparse requests do not become detailed coastal surveys.
Do not infer a live habitat or guarantee navigation safety from these values.
The tile grid in this implementation is a browser budget decision, distinct from
the source dataset's nominal resolution.

[Three.js resource disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html)
requires disposing GPU geometry, materials and owned textures. Removing a scene
node is insufficient. Ocean tiles dispose their own geometry/materials while
retaining the existing shared texture owner; leased character/vessel assets stay
under the model-cache owner.

## Additional audit repairs

- The older native-depth implementation wrote v2 into the released v1 key.
  New native writes now use `we3d.ocean.voyage.v2`; streaming uses `.v3`.
  Already-written preview v2 records in `.v1` remain readable and untouched.
  The newest valid record wins on return, including a newer fallback-build write.
- Regional scenery waits for finite streamed samples rather than placing rocks
  on the temporary entry-depth extension. Late tiles refresh bounded scenery;
  existing outcrop identities do not shuffle as missing samples arrive.
- Streamed wildlife waits for the known water volume. Rebase clears the old
  region's population and admits the new region through the existing species
  rules and licensed asset owner. No tropical habitat is inferred worldwide.
- Tile-seeded outcrop identities survive rebases and arrival direction. A
  moving 650-unit window keeps at most 128 nearby rocks rather than leaving the
  player behind the launch-area scenery. This is simulated sediment scenery,
  not a claim of surveyed rocks at those coordinates.
- Travel weather/place caches now have 64/128-entry LRU limits. Superseded
  requests and departed environments cancel consumers. Weather failures leave a
  clear unavailable state with a 30-second retry delay and an explicitly labeled
  UTC clock when the local timezone is unknown.
- The hosting builder accepts only an empty, non-symlink child of
  `output/hosting-validation/` for optional validation output. Default deployment
  output stays `dist`. Validation cannot overwrite retained artifacts or files.

## Evidence in progress

- Ten streaming component checks cover cube geography, 150 distant window changes,
  network/residency limits, failure/retry/cancellation, mesh/sampler agreement,
  resource retirement, separate-key saves and provider timeouts.
- Existing focused bathymetry, native-depth, diver, voyage, map and wildlife
  contracts passed (42 tests) before the final wave-phase addition.
- Browser receipts live in `output/ocean-stream-20261011`. Failed and incomplete
  attempts are retained separately. The first attempt identified a verification
  clock mismatch: Earth automation stepping did not advance Ocean's separate
  RAF. The prescribed-client adapter now waits real Ocean frames and restores
  the previous hook afterward.
- Deployment identity rechecked: production remains
  `5.5.0+d8775a392c42.88e67f97c00bb4c2.production`; 80 production Functions ACTIVE.

Source browser `browser-7/report.json` passes ten checks with varying depth,
including late scenery placement, movement, repeated rebases, outage, remote
save/reload, diver reboarding and parent recovery. Geometry/texture counts remain
33 geometries and 30–33 textures through eight distance setups, including
licensed regional dolphins. `legacy-diver/diver-browser.json` passes 13
checks and `local-entry/entry-browser.json` records the retained native-entry
journey (26 checks). These use controlled provider responses, not live coverage.
Two direct live GEBCO requests succeeded at 25°N 60°W and near the date line;
that is point-service evidence only. The final packaged fallback and whole-release gates remain separate checks.
This does not finish the separate airport/cabin, berth/gangway, launch-site art,
creative terrain/farms, complete wildlife-art or full public-media roadmap.

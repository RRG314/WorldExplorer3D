# Third-Party Notices

World Explorer 3D includes and interoperates with third-party software, media,
data, and services. The Apache License 2.0 in `LICENSE` applies only to original
project code and documentation unless a file says otherwise.

## Bundled Software

- Three.js 0.128.0 is distributed under the MIT License. The exact runtime
  files and license are retained under `app/vendor/three-r128/`; their byte
  sizes and SHA-256 checksums are recorded in that directory's `manifest.json`.
- Firebase 12.16.0 is distributed under the Apache License 2.0. The locally
  served browser modules and license are retained under
  `app/vendor/firebase-12.16.0/`.
- satellite.js 5.0.0 is distributed under the MIT License. Its locally served
  browser module and license are retained under `app/vendor/satellite-5.0.0/`.
- PMTiles 4.4.1 is distributed under the BSD-3-Clause License and uses fflate
  0.8.3 under the MIT License. Their locally served browser modules and the
  complete license texts are retained under `app/vendor/pmtiles-4.4.1/`.
- The Colyseus browser SDK is distributed under the MIT License. Its bundled
  license is retained at `app/vendor/COLYSEUS-SDK-LICENSE.txt`.
- Pbf 3.2.1 and Mapbox Vector Tile JS 1.3.1 are distributed under BSD-3-Clause
  licenses. Their browser bundles and license texts are retained under
  `app/vendor/vector-tile/` so core OSM parsing does not depend on a runtime CDN.
- npm dependencies retain the licenses declared by their respective packages.

## Bundled Models And Materials

- `app/assets/models/mars-exploration-rover.glb` is derived from a NASA Mars
  Exploration Rover model and remains subject to NASA media guidelines.
- Eiffel Tower and Pyramid of Khufu models are CC0 1.0.
- The Elizabeth Tower model is CC BY 4.0 and requires attribution to Microsoft.
- Earth materials credited to ambientCG and Poly Haven are CC0.
- Planetary imagery and terrain credited to NASA, JPL-Caltech, LROC, and USGS
  retain their source-specific terms.

Exact asset provenance is recorded in:

- `app/assets/models/ATTRIBUTION.md`
- `app/assets/textures/ATTRIBUTION.md`
- `assets/landing/ATTRIBUTION.md`

## Remote Data And Services

Runtime data is not relicensed by this repository. Important sources include:

- OpenStreetMap and compatible derived map databases: ODbL 1.0.
- Overture Maps Foundation: source-specific Overture attribution and licenses.
- ESA WorldCover 2021: CC BY 4.0.
- Panoramax and KartaView imagery: CC BY-SA 4.0.
- ADSB.lol aircraft observations: ODbL 1.0.
- OpenSky Network: optional and disabled by default; operational use requires
  the operator to obtain any agreement required by OpenSky.
- NASA, USGS, NOAA, CelesTrak, and Open-Meteo data: provider-specific terms.

See `ATTRIBUTION.md`, `DATA_SOURCES.md`, and `DATA_LICENSES.md` for the complete
runtime attribution and data-use boundary.

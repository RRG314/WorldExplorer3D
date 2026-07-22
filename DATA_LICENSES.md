# Data Licensing

The Apache License 2.0 covers original World Explorer 3D code. It does not
relicense map databases, imagery, scientific datasets, live API responses, or
other third-party data used by the application.

## Map And Land Data

- OpenStreetMap data is licensed under ODbL 1.0. Attribution to OpenStreetMap
  contributors is required, and publicly used derived databases may carry
  share-alike obligations.
- Overture Maps data retains the licenses and attribution assigned to each
  source in an Overture release.
- ESA WorldCover 2021 is CC BY 4.0 and contains modified Copernicus Sentinel
  data processed by the WorldCover consortium.
- GEBCO data used by the project is CC BY 4.0.

## Scientific And Operational Data

NASA, USGS, NOAA, CelesTrak, Open-Meteo, ADSB.lol, Panoramax, KartaView, and
other provider responses remain governed by their source licenses or terms.
Fetching data through project code does not grant redistribution rights beyond
those terms. OpenSky integration is disabled by default and may be enabled only
by an operator who has the required provider agreement.

## Bundled Data

Files under `app/data/` retain their recorded source metadata and attribution.
Do not remove source, license, modification, or retrieval fields when updating
them. New bundled datasets must have a redistribution-compatible license and a
documented transformation path before merge.

See `DATA_SOURCES.md` and `ATTRIBUTION.md` for source-by-source details.

# Limitations

Last reviewed: 2026-03-13

World Explorer 3D is an active, experimental geospatial application. The following limitations are important for users, reviewers, and OSM community readers.

## 1. Data Availability and Freshness

- Earth-mode world generation depends on upstream OSM ecosystem services (Overpass, tiles, geocoding).
- Availability, response time, and data freshness can vary by region and provider load.
- In sparse or overloaded regions, fallback geometry/labels may be used.

## 2. Browser and Device Variability

- Performance is hardware/browser dependent (GPU, driver, WebGL implementation, memory).
- Low-end devices may require lower quality settings for stable interaction.
- Mobile browsers can behave differently for input precision and rendering stability.

## 3. Network Dependence

- This is not an offline-first runtime.
- Initial world loading and some UI features are network-sensitive.
- Transient upstream errors (timeouts, 429/5xx) can affect map-derived detail quality.

## 4. Destination Mode Maturity Differences

- Earth mode has the broadest map-driven integration.
- Moon, Space, and Ocean are destination modes with different data/runtime assumptions.
- Ocean mode is currently experimental and intentionally stylized; it is not a scientific ocean simulator.

## 5. Geolocation Caveats

- Geolocation requires browser permission, secure context, and device capability.
- Accuracy is device/network dependent and may be coarse in some environments.

## 6. Backend-Dependent Features

- Multiplayer/account/billing/social flows require correctly configured backend services.
- Without backend setup, core exploration still runs but platform features will be limited.

## 7. Product Scope

- This project is an interactive exploration app, not a full GIS analysis platform.
- It is not a turn-by-turn navigation product and does not guarantee routing correctness.

## 8. Licensing Scope

- Repository code is source-available (custom license), not open-source.
- Third-party map/data components remain under their own licenses and terms.

## Related Docs

- [DATA_SOURCES.md](DATA_SOURCES.md)
- [ATTRIBUTION.md](ATTRIBUTION.md)
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md)

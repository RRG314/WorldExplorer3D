# World Explorer 3D - Initial Launch Release

[![Launch](https://img.shields.io/badge/Launch-Initial%20Release-0ea5e9?style=for-the-badge)](./README.md)
[![Platform](https://img.shields.io/badge/Platform-WebGL%20Runtime-1d4ed8?style=for-the-badge)](./public/app/index.html)
[![Plans](https://img.shields.io/badge/Plans-Free%20%7C%20Supporter%20%7C%20Pro-f59e0b?style=for-the-badge)](./public/account/index.html)
[![License](https://img.shields.io/badge/License-Source--Available-b91c1c?style=for-the-badge)](./LICENSE)
[![RDT DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.18012166-0f766e?style=for-the-badge)](https://doi.org/10.5281/zenodo.18012166)
[![RGE-256 DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.17982804-0f766e?style=for-the-badge)](https://doi.org/10.5281/zenodo.17982804)

Release date: **February 17, 2026**

## Release Summary

World Explorer 3D launches as a unified world exploration platform that allows users to drive, walk, and fly across Earth-scale environments, transition into orbital space flight, and land on the Moon in a continuous session.

This release introduces a full public product surface with:

- A dedicated landing experience for discovery and plan selection.
- A full interactive runtime at `/app/`.
- A subscription and account center at `/account/`.
- Required legal surfaces at `/legal/privacy` and `/legal/terms`.
- Integrated identity, plan entitlements, and billing workflows.

The product is designed for both immediate exploration and long-term platform growth, with deterministic runtime architecture, adaptive performance controls, and feature-gated subscription tiers.

## Product Positioning

World Explorer 3D is not a single-scene demo. It is a platform model built around:

- Continuous exploration across Earth, space, and lunar surfaces.
- Multi-mode interaction (driving, walking, drone, space flight).
- Persistent user progression layers (challenge records, memory markers, build actions).
- Subscription-aware entitlement gating for product monetization and roadmap delivery.

## Launch Feature Inventory

## 1. World Runtime and Environment Systems

- Earth runtime with streamed roads, buildings, POIs, and terrain.
- Space flight runtime with solar-system object interaction and destination landing.
- Moon runtime with dedicated terrain and return-trip controls.
- Environment state manager (`EARTH`, `SPACE_FLIGHT`, `MOON`) for explicit transition control.
- Time-of-day and sky systems including clouds, constellation overlays, and astronomical star interaction.

## 2. Exploration and Gameplay Systems

- Free Roam, Time Trial, and Checkpoint gameplay modes.
- Red Flower timed challenge with leaderboard support.
- Police challenge mechanics and “busted” state handling.
- Track recording and replayable route utilities.
- Spawn/respawn systems and next-location switching.

## 3. Interface and Interaction Systems

- Title-screen location launcher with preset and custom location flows.
- Floating in-game command menus:
  - Exploration
  - Environment
  - Game Mode
  - Real Estate
- Minimap + large-map interface with filtering and map-info drilldown.
- Mobile dual-pad touch control profiles with mode-aware bindings.
- Share utilities (copy/native/Facebook/X/Instagram/Text).

## 4. User-Generated Layer Systems

- Memory marker composer (pin/flower + notes).
- Local persistent memory storage with validation and limits.
- Build-mode block placement/removal with per-location persistence.

## 5. Data and Mapping Systems

- OpenStreetMap-based geographic foundation.
- Overpass endpoint failover strategy with in-memory response cache.
- Terrain elevation decoding from Terrarium tiles.
- Vector/raster map layer rendering with satellite/roads toggles.
- Layer visibility controls for POI categories, gameplay objects, memory markers, and roads.

## 6. Real Estate Extension Systems

- Optional real-estate mode with property browsing panel.
- Demo dataset operation when no external keys are configured.
- External provider paths for Estated, ATTOM, and RentCast.
- Radius and sorting controls for property discovery.

## 7. Account, Entitlements, and Billing Systems

- Firebase Authentication (Google + Email/Password).
- Firestore entitlement model (`free`, `trial`, `supporter`, `pro`).
- Two-day no-card trial on first sign-in.
- Automatic trial expiration downgrade when no active subscription is present.
- Stripe subscription checkout and billing portal support.
- Webhook-based plan synchronization to Firestore user records.

## Subscription and Plan Model (Launch)

| Plan | Price | Access Model |
| --- | --- | --- |
| Free | $0/mo | Core exploration, local-only persistence, no Pro-only tools |
| Trial | 2 days (no card) | Full core access during trial window, no Pro-only perks |
| Supporter | $1/mo | Full access + cloud-sync entitlement |
| Pro | $5/mo | Full access + early demo toggles + priority communication paths |

## Original Research Applied in This Release

World Explorer 3D includes original deterministic systems authored by Steven Reid.

## Recursive Division Tree (RDT) Integration

RDT methodology is applied as a deterministic complexity index in runtime world generation and adaptive budget logic. In launch scope, this supports:

- Load-profile adaptation by environment and location depth.
- Tile and feature budgeting decisions.
- Procedural subdivision and complexity-aware geometry behavior.
- Reproducible runtime behavior under equivalent seeded inputs.

Citation:

- Reid, S. (2025). *Recursive Division Tree: A Log-Log Algorithm for Integer Depth*. Zenodo.
- DOI: https://doi.org/10.5281/zenodo.18012166

## Deterministic PRNG Track (RGE-256 Research Line)

The runtime includes deterministic seeded random helpers for reproducible procedural behavior, while preserving compatibility fallbacks where needed. The launch architecture is aligned with the original RGE-256 research track and references that work as the formal PRNG research basis for ongoing deterministic hardening.

Citation:

- Reid, S. (2025). *RGE-256: A New ARX-Based Pseudorandom Number Generator With Structured Entropy and Empirical Validation*. Zenodo.
- DOI: https://doi.org/10.5281/zenodo.17982804
- Core repository: https://github.com/RRG314/rge256
- Demo application: https://github.com/RRG314/RGE-256-app

## Release Licensing and Attribution Requirements

The following items are required for compliant release packaging and public publication.

## 1. Project License Declaration

- License model: **source-available, all rights reserved**.
- Governing file: `LICENSE`.
- Required copyright line:
  - `World Explorer 3D (c) 2026 Steven Reid / World Explorer 3D. All Rights Reserved.`

## 2. Required Attribution Lines

Attribution that must remain visible in product/release contexts:

- `Map data (c) OpenStreetMap contributors`
- Three.js attribution and MIT license notice in distribution materials.

## 3. Third-Party Terms and Notices

Release documentation must include (or link to) notices for:

- Three.js (MIT)
- OpenStreetMap (ODbL)
- Font licenses (SIL OFL)
- Optional API-provider terms (Estated, ATTOM, RentCast)
- Any additional items listed in `ACKNOWLEDGEMENTS.md`

## 4. Subscription Legal Surfaces

For subscription distribution, both legal pages must be available:

- `/legal/privacy`
- `/legal/terms`

## 5. Data and Security Notice

Release notes should state:

- Payments are processed by Stripe.
- Card data is handled by Stripe, not stored by World Explorer runtime code.
- Auth/session and entitlement state are handled through Firebase services.

## 6. Release Package Checklist

Use this checklist before any public launch post:

- `LICENSE` included and unchanged.
- `ACKNOWLEDGEMENTS.md` current and published.
- Privacy/Terms links live and accessible.
- OpenStreetMap attribution visible in UI/release materials.
- No secrets committed to repository (`sk_*`, `whsec_*`, private API keys).
- Billing and entitlement flows validated in production environment.

## Platform Readiness Statement

This initial launch establishes World Explorer 3D as a production-capable exploration platform with:

- A complete public-to-runtime-to-account funnel,
- Deterministic runtime architecture informed by first-party research,
- Subscription-grade entitlement and billing flows,
- Licensing and attribution coverage suitable for formal public release.

## Citations

- Reid, S. (2025). *Recursive Division Tree: A Log-Log Algorithm for Integer Depth*. Zenodo. DOI: https://doi.org/10.5281/zenodo.18012166
- Reid, S. (2025). *RGE-256: A New ARX-Based Pseudorandom Number Generator With Structured Entropy and Empirical Validation*. Zenodo. DOI: https://doi.org/10.5281/zenodo.17982804


# World Explorer System Inventory Report

Date: 2026-03-15  
Repository: `WorldExplorer3D`  
Deployed target: `worldexplorer3d-d9b83`  
Primary live domain: `https://worldexplorer3d.io`

## 1. Current Source of Truth

- Canonical runtime source: `app/*`
- Canonical landing source: `index.html`
- Canonical account source: `account/index.html`
- Hosted mirror: `public/*`
- Runtime mirror: `public/app/*`

Current mirror workflow:

1. Edit canonical source first.
2. Run `npm run sync:public`.
3. Run `npm run verify:mirror`.
4. Run validation.
5. Deploy hosting.

## 2. Active Public Surfaces

- `/` -> landing experience
- `/app/` -> main 3D runtime
- `/account/` -> account, billing, social, moderation access
- `/account/moderation.html` -> private moderation panel
- `/about/` -> informational site page
- `/legal/privacy` -> privacy page
- `/legal/terms` -> terms page

## 3. Top-Level Project Areas

Primary active areas:

- `app/` -> canonical runtime app
- `public/` -> hosting output
- `functions/` -> Firebase backend functions
- `scripts/` -> validation, release, sync tooling
- `tests/` -> Firestore/rules/security checks
- `js/` -> landing/account/shared browser modules
- `account/` -> account UI source
- `assets/` -> screenshots and landing media
- `docs/` -> supporting documentation

Secondary/reference areas present in the repo:

- `WorldExplorer3D-rdt-engine/`
- `_style_reference_worldexplorer3d/`
- `world-explorer-esm/`
- `export/`
- `repos/`
- `output/`
- `tmp/`

These are not the main live runtime path for `worldexplorer3d.io`.

## 4. Runtime Architecture Ownership

### Core boot/runtime

- `app/js/bootstrap.js` -> bootstraps runtime dependencies
- `app/js/app-entry.js` -> main initialization entrypoint
- `app/js/shared-context.js` -> shared app context/state wiring
- `app/js/state.js` -> runtime state/defaults
- `app/js/main.js` -> main loop/update cadence
- `app/js/engine.js` -> scene/render/environment integration
- `app/js/ui.js` -> in-game UI controls and float menus
- `app/js/hud.js` -> HUD and camera-linked HUD/sky positioning

### World generation / loading

- `app/js/world.js` -> Earth-world loading and shared world data ownership
- `app/js/terrain.js` -> terrain surface building and conformance
- `app/js/ground.js` -> ground sampling and placement support
- `app/js/earth-location.js` -> resolves active Earth coordinates from runtime state

### Surface / terrain classification

- `app/js/surface-rules.js` -> terrain material classification rules
- `app/js/terrain.js` -> applies material decisions to terrain rendering

### Environment / sky / weather

- `app/js/astro.js` -> astronomical calculations
- `app/js/sky.js` -> sun/moon/stars/day-night state
- `app/js/weather.js` -> live weather lookup, HUD weather, override handling
- `app/js/ocean.js` -> ocean mode environment integration

### Traversal / movement

- `app/js/physics.js` -> vehicle movement/physics
- `app/js/walking.js` -> walking mode logic
- `app/js/travel-mode.js` -> shared traversal switching control

### Buildings / interiors

- `app/js/building-entry.js` -> shared building entry support model
- `app/js/interiors.js` -> interior load/enter/exit/generated interior flow

### Real estate / destinations

- `app/js/real-estate.js` -> listing/property interactions
- `app/js/game.js` -> game systems plus property/historic navigation integration

### Map systems

- `app/js/map.js` -> minimap and large map rendering/interactions

### Multiplayer / shared world

- `app/js/multiplayer/ui-room.js` -> room UI orchestration
- `app/js/multiplayer/rooms.js` -> room lifecycle
- `app/js/multiplayer/presence.js` -> live presence sync
- `app/js/multiplayer/ghosts.js` -> remote entity rendering
- `app/js/multiplayer/chat.js` -> room chat
- `app/js/multiplayer/social.js` -> friends/invites/recent players
- `app/js/multiplayer/artifacts.js` -> shared artifacts
- `app/js/multiplayer/blocks.js` -> shared blocks
- `app/js/multiplayer/painttown.js` -> paint-town room state

### Contribution / editor

- `app/js/editor/config.js` -> contribution type config
- `app/js/editor/store.js` -> submission data flow and backend calls
- `app/js/editor/session.js` -> editor session UI/state
- `app/js/editor/public-layer.js` -> approved contribution display layer

## 5. UI Surface Inventory

### Title / launch UI

- launch tabs for location, games, multiplayer, settings, controls
- preset location buttons
- custom location flow
- globe selector
- `Use My Location`
- Earth / Moon / Space / Ocean launch options

### In-game always-present UI

- white HUD
- coordinate pill
- minimap
- float menu cluster:
  - `Exploration`
  - `Environment`
  - `Game Mode`
  - `Land & Property`
- small green multiplayer circle
- top-right `Main Menu`

### Contextual in-game UI

- large map
- property panels
- interior prompt
- room panel
- room chat drawer
- editor/contribution flows
- flower challenge UI
- share/menu overlays

## 6. Environment and Realism Systems

Current active environment stack includes:

- real location-based sun position
- real location-based moon position and phase
- live/manual sky time toggle
- live location-aware weather lookup
- manual weather override cycle
- terrain material classification with local beach/sand fixes
- polar snow/frozen water handling
- desert/arid classification fallback

## 7. Persistence and Backend Inventory

### Frontend account/billing modules

- `js/auth-ui.js`
- `js/entitlements.js`
- `js/billing.js`
- `js/function-api.js`
- `js/contribution-api.js`

### Firebase backend

- `functions/index.js`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

### Moderation/backend contribution pipeline

Primary callable/backend endpoints:

- `submitContribution`
- `listContributionSubmissions`
- `getContributionModerationOverview`
- `moderateContributionSubmission`

### Moderation/admin UI

- `account/moderation.html`

### Email notification config path

- `functions/.env.worldexplorer3d-d9b83`
- expected keys include Resend API/sender/admin email values

## 8. Security / Access Control Inventory

- Firestore rules prevent direct client approval of contributions
- contributors cannot directly publish to the live world
- moderation actions require admin access
- public reads only expose approved contribution data where intended
- room, invite, presence, and social writes are rules-restricted

Primary security test:

- `tests/firestore.rules.security.test.mjs`

## 9. Validation and Release Tooling

NPM scripts:

- `npm run test`
- `npm run test:rules`
- `npm run sync:public`
- `npm run verify:mirror`
- `npm run test:runtime`
- `npm run test:world-matrix`
- `npm run test:osm-smoke`
- `npm run release:verify`

Key validation artifacts are written under:

- `output/playwright/runtime-invariants/`
- `output/playwright/world-matrix/`
- `output/playwright/osm-smoke/`

## 10. Current Runtime Verification Baseline

Recent release validation passed:

- mirror parity
- Firestore rules/security suite
- runtime invariants
- OSM/environment smoke
- world-matrix coverage

Runtime checks currently include validation for:

- traversal safety
- map controls
- sky API and live/manual sky cycling
- star info close behavior
- live weather readiness
- weather HUD presence
- manual weather override behavior
- editor isolation
- contribution layer exposure
- interior entry readiness

## 11. Hosting / Deployment Inventory

Deployment target:

- Firebase Hosting project `worldexplorer3d-d9b83`

Verified deployed surfaces:

- `https://worldexplorer3d.io/app/`
- `https://worldexplorer3d-d9b83.web.app/app/`

## 12. Current Operational Notes

- The active live runtime is the `app/*` -> `public/app/*` pipeline, not the older sibling/reference directories.
- The repo contains historical/reference material and auxiliary repos; those should not be treated as the primary live app.
- The weather HUD, astronomical sky, contribution moderation, interiors, multiplayer, and terrain classification are all active parts of the current runtime.
- The green multiplayer circle and white HUD are now part of the verified live build.


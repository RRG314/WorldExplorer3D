# Complete Inventory Report (Personal/Internal)

Date: 2026-02-19  
Repository: `WorldExplorer`  
Branch inspected: `codex/worldexplorer-root-pages-photoreal`

This inventory captures current systems, subsystems, features, and user-facing options on this branch.

## 1. Product Surfaces

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `public/index.html` | Landing page, gameplay visuals, pricing, FAQ |
| `/app/` | `public/app/index.html` | Main 3D runtime |
| `/account/` | `public/account/index.html` | Sign-in, plan state, upgrade, billing |
| `/legal/privacy` | `public/legal/privacy.html` | Privacy policy |
| `/legal/terms` | `public/legal/terms.html` | Terms |

## 2. Runtime Subsystem Inventory (`/app/`)

### 2.1 Boot/Module Load

- `public/app/js/bootstrap.js`
- `public/app/js/modules/manifest.js`
- `public/app/js/app-entry.js`

### 2.2 Core Engine and State

- `public/app/js/state.js`
- `public/app/js/config.js`
- `public/app/js/shared-context.js`
- `public/app/js/engine.js`
- `public/app/js/main.js`

### 2.3 World and Terrain

- `public/app/js/world.js`
- `public/app/js/terrain.js`
- `public/app/js/ground.js`
- `public/app/js/map.js`

### 2.4 Movement and Physics

- `public/app/js/input.js`
- `public/app/js/physics.js`
- `public/app/js/walking.js`
- Travel modes: driving, walking, drone, rocket/space

### 2.5 Environment and Space

- `public/app/js/env.js`
- `public/app/js/sky.js`
- `public/app/js/space.js`
- `public/app/js/solar-system.js`

### 2.6 Gameplay and Challenges

- `public/app/js/game.js`
- `public/app/js/flower-challenge.js`

Implemented title-screen game modes:

- `free` (Free Roam)
- `trial` (Time Trial)
- `checkpoint` (Checkpoints)
- `painttown` (Paint the Town Red)
- `police` (Police Chase)
- `flower` (Find the Flower)

Paint the Town Red runtime behavior:

- fixed 2-minute timer
- score metric: painted building count
- rooftop auto-paint detection
- HUD: time + painted/total building count

### 2.7 Build and Memory Systems

- `public/app/js/blocks.js`
- `public/app/js/memory.js`

Build system behavior:

- click-based block placement with raycast world targeting
- remove/clear blocks
- local persistence per location
- vehicle collision against placed blocks
- walking collision against placed blocks
- walking can stand on top surfaces of placed blocks

Memory system behavior:

- place pin/flower markers
- per-location memory limits
- local persistence
- marker detail popup and remove actions

### 2.8 Real Estate/POI/Historic

- `public/app/js/real-estate.js`
- `public/app/js/game.js` UI integration

Features:

- optional provider chain (Estated/ATTOM/RentCast)
- demo fallback data
- map markers, cards, and navigation
- POI visibility/filter integration

### 2.9 Performance Instrumentation

- `public/app/js/perf.js`

Capabilities:

- RDT vs baseline mode
- overlay toggle
- auto quality tier tuning
- perf snapshot output

## 3. Title-Screen and In-Game UI Inventory

### 3.1 Title Screen Tabs

- Location
- Settings
- Controls

### 3.2 Location Launch Options

- Earth
- Moon
- Space
- 15 presets + custom location search/lat-lon

### 3.3 Runtime Float Menus

Exploration menu:

- Driving Mode
- Walk Mode
- Drone Mode
- Direct to Moon
- Rocket to Moon
- New Location

Environment menu:

- Satellite
- Show Roads
- Land Use
- Day/Night
- Clouds
- Constellations

Game menu:

- Police
- Record Track
- Erase Track
- Build Mode
- Clear Blocks
- Respawn
- Random Respawn

Real Estate menu:

- Real Estate
- Historic
- POI
- Land Use

### 3.4 Challenge/Leaderboard UI

- Leaderboard panel with two tabs:
  - Flower leaderboard (best time)
  - Paint leaderboard (most buildings)
- Challenge start controls from title and in-game float actions

## 4. Landing Page Inventory

File: `public/index.html`

Sections:

- Hero
- Gameplay (scrollable gallery)
- Feature Grid
- Pricing
- FAQ
- Footer legal/contact links

Gameplay visual assets:

- directory: `public/assets/landing/gameplay/`
- files: 12 screenshots covering driving, walking, drone, moon, space, paint, police, memory, blocks

## 5. Auth/Entitlements/Billing Inventory

Shared frontend modules (`public/js/`):

- `firebase-init.js`
- `auth-ui.js`
- `entitlements.js`
- `billing.js`
- `firebase-project-config.js`

Auth methods:

- email/password sign-in
- email/password sign-up
- Google sign-in
- password reset email

Plan states:

- free
- trial (48h)
- supporter
- pro

Cloud Functions (`functions/index.js`):

- `createCheckoutSession`
- `createPortalSession`
- `stripeWebhook`

## 6. Firestore and Rules Inventory

Active rule-defined collections:

- `users/{uid}` owner-only read/write
- `flowerLeaderboard/{entryId}` public read, authenticated create

Runtime challenge module also references:

- `paintTownLeaderboard` (uses local fallback behavior when cloud writes are unavailable)

## 7. Local Persistence Inventory

Active browser-storage surfaces include:

- Firebase config fallback
- memory markers
- build blocks
- challenge local leaderboards (flower + paint)
- challenge player name
- perf settings
- optional real-estate API keys
- optional real-estate mode preference
- pro demo toggles

## 8. External Services Inventory

- Firebase Hosting
- Firebase Authentication
- Firestore
- Firebase Functions
- Stripe Billing (checkout + portal + webhook)
- OpenStreetMap / Overpass
- Terrarium elevation tiles
- Optional property providers (Estated, ATTOM, RentCast)

## 9. Operational Constraints Snapshot

- Functions currently use legacy `functions.config().stripe.*` runtime config path.
- Node 20 runtime deprecation warning applies to functions.
- Dual runtime copies exist (root legacy runtime and active `public/app` runtime).


# Complete Inventory Report (Personal/Internal)

Date: 2026-02-17  
Repository: `WorldExplorer`  
Branch inspected: `codex/github-pages-compat`

This is a full product inventory of the current World Explorer codebase. It is focused on the app itself (systems, subsystems, features, and options), not GitHub workflow details.

## 1. Executive Summary

World Explorer is a browser-based 3D exploration product with four live product surfaces:

- Landing page (`/`)
- Runtime/game (`/app/`)
- Account + billing (`/account/`)
- Legal pages (`/legal/privacy`, `/legal/terms`)

The runtime combines Earth driving/walking/drone exploration, space flight, and Moon exploration in one application flow. Subscription and trial logic are enforced through Firebase Auth + Firestore + Stripe-backed Cloud Functions.

## 2. Product Surface Inventory

| Route | File | Primary Purpose | Key User Actions |
| --- | --- | --- | --- |
| `/` | `public/index.html` | Marketing + pricing + trial start | Play now, start trial, open account, read pricing/FAQ/legal |
| `/app/` | `public/app/index.html` | Interactive runtime | Select location/mode, explore, use float menus, challenge, map, sharing |
| `/account/` | `public/account/index.html` | Plan + billing management | Sign in, upgrade, open billing portal, sign out |
| `/legal/privacy` | `public/legal/privacy.html` | Subscription/privacy disclosure | Review data usage |
| `/legal/terms` | `public/legal/terms.html` | Subscription terms | Review trial/subscription terms |

## 3. Architecture Inventory

### 3.1 Frontend hosting and routing

- Hosting root: `public/`
- Function rewrites:
  - `/createCheckoutSession`
  - `/createPortalSession`
  - `/stripeWebhook`
- Legal rewrites:
  - `/legal/privacy` -> `/legal/privacy.html`
  - `/legal/terms` -> `/legal/terms.html`
- Cache policy:
  - Static assets: `max-age=31536000, immutable`
  - HTML: `max-age=300`

### 3.2 Backend billing/auth integration

Cloud Functions in `functions/index.js`:

- `createCheckoutSession` (authenticated): creates Stripe subscription checkout session URL.
- `createPortalSession` (authenticated): creates Stripe billing portal URL.
- `stripeWebhook` (Stripe-signed): processes subscription lifecycle events and updates Firestore user plan/entitlements.

### 3.3 Data layers

- Firebase Auth: identity/session
- Firestore:
  - `users/{uid}`: plan/trial/entitlements/subscription references
  - `flowerLeaderboard/{entryId}`: challenge leaderboard
- Browser local storage: runtime preferences, local persistence for markers/blocks/challenge fallback

## 4. Runtime Subsystem Inventory (`/app/`)

### 4.1 Runtime boot and loading

Files:

- `public/app/js/bootstrap.js`
- `public/app/js/modules/manifest.js`
- `public/app/js/app-entry.js`

Behavior:

- Loads critical Three.js dependencies.
- Boots app module entrypoint.
- Defers optional post-processing scripts and enables them if available.
- Shows fatal loading message if script/module load fails.

### 4.2 Core state and configuration

Files:

- `public/app/js/config.js`
- `public/app/js/state.js`
- `public/app/js/shared-context.js`

Behavior:

- Defines preset location catalog (15 presets + custom).
- Defines terrain/world scaling constants.
- Defines POI categories, map layers, and core mutable runtime state.
- Defines astronomical star and constellation datasets.

### 4.3 Render and engine subsystem

File:

- `public/app/js/engine.js`

Behavior:

- Initializes scene, renderer, lighting, textures, materials.
- Handles renderer quality profile and optional post-processing.
- Exposes shared configuration (`CFG`) for other modules.

### 4.4 World + map data subsystem

Files:

- `public/app/js/world.js`
- `public/app/js/map.js`
- `public/app/js/terrain.js`
- `public/app/js/ground.js`

Behavior:

- Pulls roads/buildings/POIs/landuse from Overpass APIs with endpoint fallback and memory cache.
- Uses OpenStreetMap raster tiles (plus optional satellite mode via Esri imagery).
- Uses Terrarium elevation tiles for terrain mesh and height sampling.
- Uses vector water tiles fallback path when available.
- Applies LOD and RDT-based adaptive load budgeting.

### 4.5 Movement and physics subsystem

Files:

- `public/app/js/physics.js`
- `public/app/js/walking.js`
- `public/app/js/input.js`

Behavior:

- Vehicle physics and ground/road interaction.
- Walking mode with character and camera support.
- Drone mode controls and update loop.
- Keyboard input mapping, mode switching, track recording, city switching.

### 4.6 Environment and celestial subsystem

Files:

- `public/app/js/env.js`
- `public/app/js/sky.js`
- `public/app/js/space.js`
- `public/app/js/solar-system.js`

Behavior:

- Environment state machine: `EARTH`, `SPACE_FLIGHT`, `MOON`.
- Time-of-day cycling, clouds, constellations, star interactions.
- Moon travel, return-to-Earth paths, Apollo info trigger.
- Space flight mode and solar-system body rendering/inspection.

### 4.7 UI and HUD subsystem

Files:

- `public/app/js/ui.js`
- `public/app/js/hud.js`
- `public/app/js/main.js`

Behavior:

- Title screen tabs and launch flow.
- Runtime float menu system and control panels.
- HUD/minimap/large map orchestration.
- Overlay positioning and loading transitions.

### 4.8 Gameplay subsystem

File:

- `public/app/js/game.js`

Behavior:

- Free roam / time trial / checkpoint flows.
- Police chase logic.
- Destination and checkpoint spawning.
- Navigation route generation.
- Map legend/filter interactions.
- Property/historic/POI map and panel integration.

### 4.9 Challenge subsystem

File:

- `public/app/js/flower-challenge.js`

Behavior:

- Timed red-flower challenge.
- Leaderboard on title screen with Firebase backend when available.
- Local leaderboard fallback when Firebase unavailable.
- Player name persistence and challenge HUD timer.

### 4.10 Memory subsystem

File:

- `public/app/js/memory.js`

Behavior:

- Place persistent pin/flower memory markers.
- Note text limits and marker metadata.
- Local storage persistence with capability checks.
- Marker read/remove/clear interactions.

### 4.11 Build subsystem

File:

- `public/app/js/blocks.js`

Behavior:

- Toggleable block build mode.
- Place/remove block grid columns.
- Per-location and total limits.
- Local storage persistence and reset support.

### 4.12 Real estate subsystem

File:

- `public/app/js/real-estate.js`

Behavior:

- Demo property generation without external API keys.
- Optional provider fetch chain (Estated -> ATTOM -> RentCast fallback).
- Property listing models for sale/rent with photo/metadata support.

### 4.13 Performance instrumentation subsystem

File:

- `public/app/js/perf.js`

Behavior:

- Perf mode switching (`rdt`, `baseline`).
- Live overlay option.
- Perf snapshot capture/copy.
- Dynamic quality tier control and spike metrics.

## 5. Full User Feature and Option Catalog

## 5.1 Landing page (`/`)

Primary actions:

- `Play Now` -> `/app/`
- `Start 2-Day Trial`:
  - attempts sign-in
  - initializes entitlements
  - redirects to `/app/?startTrial=1`
- `Account` -> `/account/`

Content sections:

- Hero (title, value statement)
- Visual Proof
- Feature Grid
- Pricing (Free/Supporter/Pro)
- FAQ
- Footer links (privacy, terms, contact, GitHub, OSM attribution)

## 5.2 Title-screen location options (`/app/`)

Launch mode toggles:

- Earth
- Moon
- Space

Preset locations:

- Baltimore
- Hollywood
- New York
- Miami
- Tokyo
- Monaco
- Nürburgring
- Las Vegas
- London
- Paris
- Dubai
- San Francisco
- Los Angeles
- Chicago
- Seattle

Custom location flow:

- Search input + button
- Enter-key trigger
- Manual latitude/longitude inputs

## 5.3 Title-screen settings tab options

Game Mode:

- Free Roam
- Time Trial
- Checkpoints

Performance Benchmark:

- Mode select:
  - `RDT Optimized`
  - `Baseline (No RDT Budgeting)`
- `Show live benchmark overlay` toggle
- `Apply + Reload World`
- `Copy Snapshot`

Real Estate Mode:

- `Enable Real Estate Features` toggle

API configuration inputs:

- Estated API key
- ATTOM API key
- RentCast API key
- `Save All API Keys`

## 5.4 Title-screen controls tab categories

- Driving controls
- Walking controls
- Drone controls
- Camera/view controls
- Mode switching controls
- Navigation/map controls
- Space exploration controls
- Space flight controls
- Other controls (memory markers, track recording, pause)

## 5.5 Title-screen challenge/leaderboard controls

- Leaderboard open/close floating button
- Player name input
- `Find Flower`
- `Refresh`

## 5.6 Share options

Title-screen share actions:

- Copy link
- Native share
- Facebook
- X/Twitter
- Instagram
- Text message

In-game floating share menu actions:

- Copy link
- Native share
- Facebook
- X/Twitter
- Instagram
- Text

## 5.7 Runtime float menus (in-game)

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

Game Mode menu:

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

## 5.8 Map and filter options

Large map controls:

- Open/close
- Satellite layer toggle
- Roads layer toggle
- Zoom in/out
- Legend panel
- Map info panel

Legend mass controls:

- Show All
- Hide All

Legend layer filters:

- Properties
- Navigation
- POI group + per-category toggles:
  - Schools
  - Healthcare
  - Emergency
  - Food
  - Shopping
  - Culture
  - Historic
  - Parks
  - Parking
  - Fuel
  - Banks
  - Postal
  - Hotels
  - Tourism
- Memory markers:
  - Pins
  - Flowers
- Game elements:
  - Checkpoints
  - Trial destination
  - Custom track
- Police
- Roads

## 5.9 Runtime utility and overlay options

- Main Menu button (return to title flow)
- Pause screen (`Resume`, `Restart`, `Main Menu`)
- Result screen (`Play Again`, `Free Roam`, `Menu`)
- Caught screen (`Try Again`)
- Mobile dual-pad controls with mode-dependent bindings
- Compact controls card toggling by mode

## 5.10 Auth and plan UI options in runtime

Top-left auth float:

- Sign In / Sign Up toggle
- Email/password sign-in
- Email/password sign-up with display name
- Google sign-in
- Password reset
- Signed-in panel actions:
  - Open Account
  - Sign Out

Plan/Pro panel:

- Shows Pro access status
- Non-Pro auto-hide after delay
- Pro-only buttons:
  - Toggle Demo Build A
  - Toggle Demo Build B
  - Contact developer link
  - Suggest feature link
- Non-Pro upgrade CTA to account page

## 6. Account, Trial, Subscription, and Billing Inventory

## 6.1 Authentication

Sources:

- `public/js/auth-ui.js`
- `public/js/firebase-init.js`

Supported auth methods:

- Email/password sign-in
- Email/password sign-up
- Google popup (fallback redirect)
- Password reset email
- Auth observer for live session state

## 6.2 Trial and entitlement rules

Source:

- `public/js/entitlements.js`

Behavior:

- On first sign-in, creates `users/{uid}` if missing.
- Sets:
  - `plan = trial`
  - `trialEndsAt = now + 48h`
  - trial entitlements
- On load/snapshot update:
  - if trial expired and no active subscription (`active`, `trialing`, `past_due`), downgrades to `free`.

Plan states:

- `free`
- `trial`
- `supporter`
- `pro`

Entitlement flags tracked:

- `fullAccess`
- `cloudSync`
- `proEarlyAccess`
- `prioritySupport`
- `featureConsideration`
- `directContact`

## 6.3 Account page actions

Source:

- `public/account/index.html`

Actions:

- Sign in
- Sign out
- Upgrade to Supporter (`$1/mo`)
- Upgrade to Pro (`$5/mo`)
- Manage Billing

Status panels:

- Current plan panel
- Trial panel
- Checkout status messaging (`success`, `cancel`)

## 6.4 Billing backend contract

Source:

- `functions/index.js`

Endpoints:

- `POST /createCheckoutSession`
  - requires Firebase bearer token
  - requires `plan` in `{supporter, pro}`
  - creates Stripe checkout subscription session
- `POST /createPortalSession`
  - requires Firebase bearer token
  - requires existing `stripeCustomerId`
  - creates Stripe billing portal session
- `POST /stripeWebhook`
  - validates Stripe signature
  - applies subscription lifecycle updates to Firestore

Webhook events handled:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## 7. Data Inventory

## 7.1 Firestore collections

`users/{uid}` (owner read/write only):

- Identity fields (`uid`, `email`, `displayName`)
- Plan state (`plan`, `subscriptionStatus`, `trialEndsAt`)
- Entitlements object
- Stripe linkage (`stripeCustomerId`, `stripeSubscriptionId`)
- Timestamps (`createdAt`, `updatedAt`)

`flowerLeaderboard/{entryId}`:

- Public read
- Authenticated create
- No update/delete

## 7.2 Firestore security rules

- `users/{userId}`: only authenticated owner can read/write.
- `flowerLeaderboard/{entryId}`:
  - read: public
  - create: authenticated
  - update/delete: denied

## 7.3 Local storage keys

Runtime/storage keys in active use:

- `worldExplorer3D.firebaseConfig`
- `worldExplorer3D.memories.v1`
- `worldExplorer3D.memories.test`
- `worldExplorer3D.buildBlocks.v1`
- `worldExplorer3D.buildBlocks.test`
- `worldExplorer3D.flowerChallenge.localLeaderboard.v1`
- `worldExplorer3D.flowerChallenge.playerName`
- `worldExplorerPerfMode`
- `worldExplorerPerfOverlay`
- `worldExplorerPerfAutoQuality`
- `worldExplorer.earlyDemo.buildA`
- `worldExplorer.earlyDemo.buildB`
- `estatedApiKey`
- `attomApiKey`
- `rentcastApiKey`
- `realEstateEnabled`

## 8. External Service and Dependency Inventory

External runtime dependencies:

- Three.js (core + loaders + optional post-processing)
- Firebase JS SDK modules (app/auth/firestore)

External data/providers:

- OpenStreetMap raster tiles
- Overpass API endpoints (multi-endpoint fallback)
- OSM vector water tiles
- Esri World Imagery (satellite layer option)
- Terrarium elevation tiles

Optional real-estate providers:

- Estated
- ATTOM
- RentCast

Subscription/billing providers:

- Stripe Checkout
- Stripe Billing Portal
- Stripe Webhooks

## 9. Configuration and Runtime Variable Inventory

Frontend variables:

- `window.WORLD_EXPLORER_FIREBASE`
- `window.WORLD_EXPLORER_FUNCTIONS_ORIGIN` (optional override)

Function config keys expected:

- `stripe.secret`
- `stripe.webhook`
- `stripe.price_supporter`
- `stripe.price_pro`

Current implementation note:

- Functions still use legacy `functions.config()` path.

## 10. Current Behavioral Notes (Important)

- Runtime auth float appears only on title screen and hides during gameplay.
- Pro panel auto-hides for non-Pro after a short delay.
- Trial activation can be initiated from landing page or app query param flow.
- Leaderboard uses Firebase when available and falls back locally when unavailable.
- Memory markers and build blocks are local-browser persistent, with storage capability checks.

## 11. Operational Risk/Constraint Inventory

- Firebase runtime config deprecation (functions.config path) requires migration before shutdown.
- Node 20 runtime deprecation warning for Cloud Functions is active.
- Stripe plan mapping depends on correct live price IDs configured in function config.
- Auth and billing are disabled if frontend Firebase config is missing or invalid.

## 12. Validation Checklist (Inventory Coverage)

This inventory covers:

- All live routes and pages
- Runtime module set and subsystem responsibilities
- User-facing controls and options across title and in-game UI
- Plan/trial/entitlement lifecycle behavior
- Billing endpoints and webhook event handling
- Firestore model and security boundaries
- Local storage persistence surfaces
- External provider integrations


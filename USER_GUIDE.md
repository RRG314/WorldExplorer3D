# User Guide

Last reviewed: 2026-02-19

This guide is for players and subscribers using the hosted World Explorer experience.

## 1. Where to Start

Firebase-hosted URLs:

- Landing page: `https://worldexplorer3d-d9b83.web.app/`
- Play runtime: `https://worldexplorer3d-d9b83.web.app/app/`
- Account/billing: `https://worldexplorer3d-d9b83.web.app/account/`

GitHub Pages URLs:

- Branch-root mode: `https://rrg314.github.io/WorldExplorer/` (root runtime)
- `public/` mode (if configured): `https://rrg314.github.io/WorldExplorer/app/` and `.../account/`

## 2. Sign In and Trial

On `/app/`, use the top-left `Sign In / Sign Up` button.

Available login methods:

- Email/password
- Google

Trial behavior:

- First successful sign-in creates a 2-day trial automatically
- Trial is no-card-required
- Trial gives full access equivalent to Supporter, without Pro-only perks

## 3. Plan Levels

### Free

- Core exploration available
- Cloud sync disabled
- Pro-only controls hidden/locked

### Supporter ($1/month)

- Full app access
- Cloud sync entitlement enabled
- Supports ongoing development

### Pro ($5/month)

- Everything in Supporter
- Early-access demo controls
- Priority contact/feature consideration entitlements

## 4. Upgrading and Billing

Use `/account/` to:

- upgrade to Supporter
- upgrade to Pro
- open Stripe billing portal
- sign out

Checkout flow:

1. click upgrade button
2. app redirects to Stripe Checkout
3. complete purchase
4. Stripe webhook updates your plan in Firestore
5. account page reflects new plan

## 5. In-App UI Notes

### Auth button

- Top-left floating button opens auth/account panel on title screen
- Clicking outside closes the panel
- During gameplay, the auth/account button is hidden

### Pro panel

- Non-Pro users see the Pro info panel briefly on load
- Panel auto-hides after a few seconds
- Pro users keep access to Pro controls

### Graphics settings

- Open `Settings` on the title screen
- `Photoreal Buildings (Beta)` toggles enhanced building materials
- Setting is stored in browser local storage (`worldExplorerPhotorealBuildings`)
- If changed before starting, it applies on next `Explore`

## 6. Gameplay Controls

### Game Modes (Title Screen -> Game Mode)

- Free Roam: open exploration with no objective timer
- Time Trial: reach destination before timer expires
- Checkpoints: collect all checkpoints as quickly as possible
- Paint the Town Red: 2-minute rooftop challenge; score is buildings painted
- Police Chase: starts with police pursuit enabled
- Find the Flower: starts the red-flower challenge immediately

### Desktop

- Move/drive: `WASD` or arrows
- Brake/space actions: `Space`
- Boost/sprint: `Ctrl` or `Shift` depending on mode
- Toggle walk: `F`
- Toggle drone: `6`
- Large map: `M`
- Pause: `Esc`

### Touch/Mobile

Mode-specific touch controls are shown automatically:

- driving
- walking
- drone
- rocket/space flight

Desktop is still recommended for highest performance.

## 7. Challenges, Build Mode, and Memories

- Red-flower challenge supports leaderboard entries (best time).
- Paint challenge supports leaderboard entries (most buildings painted in 2:00).
- Challenge panel includes both `Flower` and `Paint` leaderboard tabs.
- Leaderboards use Firestore when available, with local fallback when unavailable.
- Build mode supports click-based block placement on world surfaces.
- Cars collide with placed blocks.
- Walking character collides with block sides and can stand on top of blocks.
- Memory markers and several user settings rely on browser storage.

## 8. Privacy and Terms

Required legal pages:

- Privacy: `/legal/privacy`
- Terms: `/legal/terms`

## 9. Troubleshooting

### Sign-in panel opens but login fails

Likely Auth provider disabled in Firebase project.

### Upgrade button says checkout session failed

Usually Stripe config mismatch (key mode, invalid key, or missing price IDs).

### Plan does not update after payment

Webhook may not be configured correctly.

### Dangerous site warning in browser

If this appears, do not enter credentials until verified in Search Console/Safe Browsing review and domain reputation checks.

## 10. Support Path

- Pro users get priority contact links from in-app/account surfaces.
- Feature suggestions can be submitted through the configured issue/contact channels.

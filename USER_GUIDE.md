# User Guide

Last reviewed: 2026-02-16

This guide is for players and subscribers using the hosted World Explorer experience.

## 1. Where to Start

- Landing page: `https://worldexplorer3d-d9b83.web.app/`
- Play runtime: `https://worldexplorer3d-d9b83.web.app/app/`
- Account/billing: `https://worldexplorer3d-d9b83.web.app/account/`

GitHub mirror URLs (when using Pages):

- Landing: `https://rrg314.github.io/WorldExplorer/`
- Play runtime: `https://rrg314.github.io/WorldExplorer/app/`
- Account: `https://rrg314.github.io/WorldExplorer/account/`

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

## 6. Gameplay Controls

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

## 7. Leaderboard and Memories

- Red-flower challenge supports leaderboard entries.
- Leaderboard uses Firestore when available, with local fallback when unavailable.
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

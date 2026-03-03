# World Explorer

Last reviewed: 2026-03-02

World Explorer is a browser-based 3D exploration platform with Earth/Moon/Space traversal, multiplayer room systems, social invites, and Firebase-backed account persistence.

## Runtime Surfaces

- Landing: `/index.html`
- Main app runtime: `/app/index.html`
- Account center: `/account/index.html`
- About: `/about/index.html`
- Legal pages: `/legal/privacy`, `/legal/terms`

## Core Features

### Location and launch

- Preset cities (Earth)
- Custom globe selector with click-to-pick coordinates
- Reverse place lookup and nearby city list
- Favorites view with:
  - `Preset Cities`
  - `Your Saved Favorites` (with delete)
- Earth, Moon, Space launch toggles
- Continue Last Location support

### Gameplay

- Free Roam
- Time Trial
- Checkpoints
- Paint the Town
- Police Chase
- Find the Flower

### Movement modes

- Walking
- Driving
- Drone
- Rocket/space flight
- Moon traversal

### Tutorial

- First-run guided walkthrough stored per browser
- Shows once by default after completion
- User can disable or restart manually from Settings

### Multiplayer

- Public/private room creation and join by code
- Saved room list with `Open` and owner `Delete`
- Invite links and friend invite workflow
- Live presence, chat, friends, incoming invites, recent players
- Shared room data:
  - blocks
  - paint claims
  - artifacts
  - home base
- Weekly featured city room
- Public and owned/current room markers on minimap and large map

### Account and donations

- Email/password and Google sign-in
- Account profile and room quota status
- Optional monthly donations:
  - Supporter: $1/month
  - Pro: $5/month
- Stripe checkout/portal integration
- Billing receipt list
- Permanent self-service account deletion flow

## Architecture Summary

- Canonical gameplay source: `app/*`
- Hosted mirror: `public/app/*`
- Root compatibility/runtime modules: `js/*`
- Backend: `functions/index.js`
- Security: `firestore.rules`

Important: edit `app/*` first, then mirror to `public/app/*`.

## Local Development

```bash
cd "/Users/stevenreid/Documents/New project"
npm install
cd functions && npm install && cd ..
```

Run hosting-style local server:

```bash
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`
- `http://127.0.0.1:4173/account/`

## Validation Commands

```bash
npm run sync:public
npm run verify:mirror
npm run test
npm run release:verify
```

## Deployment

### Firebase

```bash
firebase use worldexplorer3d-d9b83
firebase deploy
```

### GitHub Pages

Deploy from branch root (`/`) as configured in repo settings.

Pages backend notes:

- Cloud Functions CORS allowlist must include the Pages origin (`https://rrg314.github.io`).
- Firebase Auth authorized domains should include `rrg314.github.io` for Google sign-in flow.

### itch.io Wrapper Build

Build/update the redirect wrapper and zip:

```bash
bash scripts/make-itch-wrapper.sh
```

Output artifact:

- `dist/worldexplorer3d-itch-wrapper.zip`

## Documentation

- `COMPLETE_INVENTORY_REPORT_2026-03-02.md` (full inventory snapshot)
- `QUICKSTART.md`
- `USER_GUIDE.md`
- `CONTROLS_REFERENCE.md`
- `ARCHITECTURE.md`
- `TECHNICAL_DOCS.md`
- `API_SETUP.md`
- `RELEASE_CHECKLIST.md`
- `KNOWN_ISSUES.md`
- `CHANGELOG.md`
- `DOCUMENTATION_INDEX.md`

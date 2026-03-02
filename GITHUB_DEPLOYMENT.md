# GitHub Deployment Guide

Last reviewed: 2026-03-02

Guide for publishing the repository root to GitHub Pages while using Firebase Auth/Firestore/Functions backends.

## 1. Deployment Mode

Use GitHub Pages with:

- Source: `Deploy from a branch`
- Branch: target branch (for example `steven/product`)
- Folder: `/ (root)`

## 2. Required Files for Pages

Root runtime files:

- `index.html`
- `js/*`
- `styles.css`

App/account routes still required in repo:

- `app/index.html`
- `app/js/*`
- `account/index.html`

## 3. Important Mirror Note

Production Firebase hosting serves `public/*`, but Pages serves branch root directly.

Before publishing, ensure app mirror parity:

```bash
npm run sync:public
npm run verify:mirror
```

## 4. Backend Dependencies Still Required

GitHub Pages hosting does not replace Firebase backend services. These still must be live:

- Firebase Auth
- Firestore
- Cloud Functions
- Stripe webhook integration (if donations enabled)

## 5. Deploy Steps (Typical)

1. Run release checks:
   - `npm run release:verify`
2. Commit and push target branch.
3. Verify Pages build is published.
4. Run manual smoke checks:
   - app load
   - signup/signin
   - room create/join/invite
   - account overview and controls

## 6. Firebase Backend Deploy Commands

When backend changes are included:

```bash
firebase use worldexplorer3d-d9b83
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only functions
```

## 7. Cache Troubleshooting

If stale JS appears after deploy:

1. hard refresh (`Cmd+Shift+R` / `Ctrl+F5`)
2. clear site data for the Pages domain
3. reopen page and retry


# GitHub Deployment Guide

Last reviewed: 2026-02-23

This guide covers publishing the project from repository root on GitHub Pages while still using Firebase/Stripe backends.

## 1. Recommended Mode: Branch Root

Use GitHub Pages with `Deploy from a branch` and `/ (root)`.

Steps:

1. Push your target branch (for example `steven/product`).
2. In GitHub: `Settings -> Pages`.
3. `Source: Deploy from a branch`.
4. Branch: target branch.
5. Folder: `/ (root)`.

Root runtime files used by Pages:

- `index.html`
- `js/*`
- `styles.css`

## 2. Firebase Dependencies Still Required

Even on GitHub Pages, these remain required:

- Firebase Auth
- Firestore
- Cloud Functions
- Stripe webhook + prices

Ensure Firebase Auth authorized domain includes:

- `rrg314.github.io`

## 3. Cloud Functions Deployment

After backend changes:

```bash
cd "/Users/stevenreid/Documents/New project"
firebase use worldexplorer3d-d9b83
firebase deploy --only functions
```

## 4. Firestore Deployment

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## 5. Pages Validation Checklist

After publish:

1. Root page loads with no module 404s.
2. App starts and game modes open.
3. PaintTown controls:
   - `Ctrl` fires paintball
   - right-click camera hold works
   - double-left-click does not toggle camera mode
4. Multiplayer panel opens and room actions work.
5. Account page loads and shows profile/plan/receipt/friends sections.

## 6. Cache Troubleshooting

If you see stale JS path errors:

1. Hard refresh (`Ctrl+F5` or `Cmd+Shift+R`).
2. Clear site data for the GitHub Pages domain.
3. Re-open the page.

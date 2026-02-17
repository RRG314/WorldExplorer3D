# Contributing to World Explorer

Thanks for contributing.

This repository is source-visible but proprietary (`LICENSE`).
Contributions are accepted at maintainer discretion.

## 1. Repository and Branching

Canonical repository:

- `https://github.com/RRG314/WorldExplorer.git`

Preferred working branch pattern:

- `codex/<feature-or-fix-name>`

## 2. Local Setup

```bash
git clone https://github.com/RRG314/WorldExplorer.git
cd WorldExplorer
cd functions && npm install && cd ..
python3 -m http.server --directory public 4173
```

## 3. Active Source of Truth

Use these paths for production behavior:

- `public/` (all hosted pages/assets)
- `functions/` (billing backend)
- `firebase.json`, `.firebaserc`, `firestore.rules`

Do not assume root legacy runtime files (`index.html`, `js/`) are the active deployed path.

## 4. Required Validation Before PR

At minimum:

1. `/` loads
2. `/app/` loads
3. auth float opens/closes
4. `/account/` loads
5. no new console errors in core flows
6. GitHub Pages mirror (`/WorldExplorer/` subpath) still loads key routes if frontend routing or paths changed

If billing touched:

1. checkout session creation tested
2. webhook event handling validated in logs
3. Firestore user plan updates confirmed

Useful commands:

```bash
firebase functions:log --only createCheckoutSession -n 50
firebase functions:log --only stripeWebhook -n 50
```

## 5. Documentation Rule

Any behavior change must update docs in the same PR:

- `README.md`
- `QUICKSTART.md`
- `ARCHITECTURE.md`
- `TECHNICAL_DOCS.md`
- `USER_GUIDE.md`
- `CHANGELOG.md`
- `GITHUB_DEPLOYMENT.md` (if deployment/routing/cache behavior is affected)

## 6. PR Format

Use this structure:

1. Summary
2. Problem
3. Fix
4. Validation
5. Risks / follow-ups

Include screenshots for UI changes and log snippets for backend fixes.

## 7. Security and Secrets

- Never commit secret keys.
- Never include real `sk_live`, `whsec`, or private tokens in markdown/screenshots.
- Use placeholders in docs and examples.

## 8. Current Mandatory Follow-up Work

Contributors touching backend config/runtime should be aware:

- migrate off `functions.config()` to params/secrets before March 2026
- upgrade functions runtime from Node 20 to Node 22

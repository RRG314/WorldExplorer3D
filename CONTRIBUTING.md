# Contributing to World Explorer 3D

Thanks for contributing.

This repository is public for source visibility, but it is proprietary and all rights are reserved.
By contributing, you agree that maintainers may use, modify, and relicense your submitted changes inside this project.

## 1. Before You Start

- Read `README.md`, `TECHNICAL_DOCS.md`, and `KNOWN_ISSUES.md`.
- Open or reference an issue for non-trivial work.
- Keep changes scoped and regression-safe.

## 2. Local Setup

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
python -m http.server 8000
```

Open `http://localhost:8000`.

## 3. Project Layout

- Entry: `index.html`
- Styles: `styles.css`
- Runtime: `js/*.js`
- Module boot: `js/bootstrap.js`, `js/app-entry.js`, `js/modules/*`
- Docs: `*.md`

## 4. Development Rules

- Preserve existing behavior unless the issue explicitly changes it.
- Avoid broad refactors in bug-fix PRs.
- Keep deterministic behavior deterministic (do not introduce random regressions).
- Prefer small commits with clear messages.

## 5. Validation Checklist

Before opening a PR:

1. App loads without console errors.
2. Driving, walking, and drone mode transitions work.
3. City switch works without major terrain/building breakage.
4. Space transitions still work (if touched).
5. Any changed docs are updated in the same PR.
6. CI checks pass in GitHub (`CI` workflow).

## 6. Testing a Change

Minimum manual matrix (run relevant items):

- Cities: Baltimore, Monaco, San Francisco
- Modes: drive, walk, drone
- Maps: minimap + large map
- Environment: Earth and space toggles (if changed)

Capture the following in PR notes:

- What you changed
- What you tested
- Any known follow-up risks

## 7. Pull Request Rules

Use this PR format:

- Summary
- Root cause
- Fix details
- Validation steps
- Screenshots/video (UI/rendering changes)

PR expectations:

- One concern per PR when possible
- No unrelated formatting churn
- Documentation updates included when behavior changes

## 8. Style and Consistency

This repo includes a no-build formatting/lint baseline:

- `.editorconfig`
- `.eslintrc.cjs`
- `.prettierrc.json`

Optional local checks:

```bash
npx eslint js/*.js js/modules/*.js
npx prettier --check "**/*.{md,js,css,html,json,yml,yaml}"
for f in js/*.js js/modules/*.js; do node --check "$f"; done
node .github/scripts/check-pages-readiness.mjs
```

If you do not have these tools installed, run manual validation and document that in your PR.

## 9. GitHub Workflows

- `CI` workflow:
  - runs JS syntax checks (`node --check`)
  - runs static Pages readiness checks (`.github/scripts/check-pages-readiness.mjs`)
- `Deploy Pages` workflow:
  - deploys static site artifact for `main` and `rdt-engine`
  - requires GitHub Pages source to be set to `GitHub Actions`

## 10. Security

Do not post security-sensitive findings in public issues.

Report privately to the maintainer email listed in repository documentation.

## 11. License Reminder

Submitting a contribution does not grant redistribution rights to project code.
This remains a source-available, all-rights-reserved repository unless the license file changes in a future release.

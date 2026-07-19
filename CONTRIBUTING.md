# Contributing to World Explorer 3D

Last reviewed: 2026-07-15

Contribution workflow and minimum quality bars for this repository.

## 1. Repository and Branching

Canonical repository:

- `https://github.com/RRG314/WorldExplorer3D`

Preferred branch naming:

- `steven/<feature-or-fix>`
- `codex/<feature-or-fix>`

## 2. Local Setup

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
cd functions && npm install && cd ..
npm run build:hosting -- --firebase-env staging
python3 -m http.server --directory dist 4173
```

## 3. Source-of-Truth Rule

Canonical runtime source is `app/*`.
Canonical landing/account sources are `index.html` and `account/index.html`. The separate `github-pages/` directory contains only the public project explainer.
Firebase Hosting output is generated into ignored `dist/`; it is not a second source tree.

Required before merge/deploy:

```bash
npm run build:hosting -- --firebase-env staging
npm run verify:hosting
npm run audit:reachability
```

Do not merge gameplay/UI/runtime changes unless the generated hosting artifact matches canonical source and reports a traceable build ID.
Do not retain superseded runtime modules: the reachability audit must report zero orphan JavaScript or CSS files.

## 4. Minimum Validation Before PR

Required:

1. `npm run release:verify` passes.
2. Manual smoke for launch flows, geolocation path, and Earth/Ocean mode switching.
3. No new blocking console/runtime errors in critical flows.

If backend touched:

1. rules/indexes/functions deployment paths verified
2. relevant function logs reviewed
3. no secrets committed

## 5. Documentation Requirement

Behavior changes must update docs in the same PR.

At minimum, review the affected public documents:

- `README.md`
- `DATA_SOURCES.md`
- `ATTRIBUTION.md`
- `KNOWN_ISSUES.md`
- `ROADMAP.md`
- `CHANGELOG.md`

## 6. PR Format

Use this structure:

1. Summary
2. Problem
3. Fix
4. Validation
5. Risks/follow-ups

Include screenshots for UI changes and logs for backend behavior changes.

## 7. Security and Secrets

- never commit real secrets (`sk_live`, `whsec`, tokens)
- use placeholders in docs/examples
- keep billing/env values in runtime env, not source files

## 8. OSM-Facing Quality Bar

For map/data path changes:

- keep OSM attribution visible and accurate
- avoid exaggerated performance or coverage claims
- document known tradeoffs/limitations explicitly

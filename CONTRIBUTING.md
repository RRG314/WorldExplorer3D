# Contributing to World Explorer 3D

Last reviewed: 2026-03-13

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
python3 -m http.server --directory public 4173
```

## 3. Source-of-Truth Rule

Canonical runtime source is `app/*`.

Required before merge/deploy:

```bash
npm run sync:public
npm run verify:mirror
```

Do not merge gameplay/UI/runtime changes without mirror parity.

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

At minimum, review/update affected files from:

- `README.md`
- `QUICKSTART.md`
- `DOCUMENTATION_INDEX.md`
- `DATA_SOURCES.md`
- `ATTRIBUTION.md`
- `LIMITATIONS.md`
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

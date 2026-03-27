# Contributing to World Explorer 3D

Last reviewed: 2026-03-27

This guide is for anyone who wants to help, not only people writing code.

You can contribute by:

- playtesting and reporting bugs
- improving docs or screenshots
- checking controls, menus, and loading behavior
- validating map/data issues in real places
- submitting code fixes or new features

If you are not planning to code, read:

1. [README.md](README.md)
2. [USER_GUIDE.md](USER_GUIDE.md)
3. [QUICKSTART.md](QUICKSTART.md)

If you are planning to code, also read:

1. [ARCHITECTURE.md](ARCHITECTURE.md)
2. [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md)
3. [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)

## 1. Repository and Branching

Canonical repository:

- `https://github.com/RRG314/WorldExplorer3D`

Preferred branch naming:

- `steven/<feature-or-fix>`
- `codex/<feature-or-fix>`

If you are contributing without writing code, you do not need to create a branch. A clear issue report, screenshot set, or written test notes are still useful.

## 2. Ways To Contribute

### Playtesting and bug reports

Helpful reports include:

- what you were trying to do
- which location and travel mode you used
- what happened instead
- whether it was repeatable
- screenshots or short screen recordings if possible

Especially useful right now:

- loading glitches or stalls
- driving, walking, drone, boat, ocean, moon, and space smoothness
- wrong spawn locations or trapped player states
- missing roads, buildings, water, or map overlays
- account or contribution flow problems

### Docs and UX feedback

Useful contributions include:

- unclear instructions
- misleading labels or buttons
- controls that are hard to discover
- docs that assume too much technical knowledge

### Code contributions

Code contributions should focus on one problem at a time and include validation.

## 3. Local Setup

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
cd functions && npm install && cd ..
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`

If you only want to test the game locally, this is enough.

## 4. Source-of-Truth Rule

Canonical runtime source is `app/*`.
Canonical landing/account sources are `index.html` and `account/index.html`.

Required before merge/deploy:

```bash
npm run sync:public
npm run verify:mirror
```

Do not merge gameplay/UI/runtime changes without mirror parity.

## 5. Minimum Validation Before PR

Required:

1. `npm run release:verify` passes.
2. Manual smoke for launch flows, geolocation path, and Earth/Ocean mode switching.
3. No new blocking console/runtime errors in critical flows.

If backend touched:

1. rules/indexes/functions deployment paths verified
2. relevant function logs reviewed
3. no secrets committed

## 6. Documentation Requirement

Behavior changes must update docs in the same PR.

At minimum, review/update affected files from:

- `README.md`
- `QUICKSTART.md`
- `DOCUMENTATION_INDEX.md`
- `DATA_SOURCES.md`
- `ATTRIBUTION.md`
- `LIMITATIONS.md`
- `CHANGELOG.md`

## 7. Plain-Language Change Notes

Write PRs and commit summaries so non-developers can follow what changed.

Good:

- "Fix repeated fullscreen loading during normal gameplay"
- "Keep fast driving road-first in dense downtown areas"
- "Clarify setup steps for local testing"

Avoid:

- unexplained abbreviations
- "misc cleanup"
- "patch fixes"
- "refactor stuff"

## 8. PR Format

Use this structure:

1. Summary
2. Problem
3. Fix
4. Validation
5. Risks/follow-ups

Include screenshots for UI changes and logs for backend behavior changes.

## 9. Security and Secrets

- never commit real secrets (`sk_live`, `whsec`, tokens)
- use placeholders in docs/examples
- keep billing/env values in runtime env, not source files

## 10. OSM-Facing Quality Bar

For map/data path changes:

- keep OSM attribution visible and accurate
- avoid exaggerated performance or coverage claims
- document known tradeoffs/limitations explicitly

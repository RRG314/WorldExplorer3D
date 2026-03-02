# Contributing to World Explorer

Last reviewed: 2026-03-02

Contribution workflow and minimum quality bars for this repository.

## 1. Repository and Branching

Canonical repository:

- `https://github.com/RRG314/WorldExplorer.git`

Preferred branch naming:

- `steven/<feature-or-fix>`
- `codex/<feature-or-fix>`

## 2. Local Setup

```bash
git clone https://github.com/RRG314/WorldExplorer.git
cd WorldExplorer
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
2. Manual smoke for signup/signin, room create/join/invite, and key menu/button flows.
3. No new blocking console/runtime errors in critical flows.

If backend touched:

1. rules/indexes/functions deployment paths verified
2. relevant function logs reviewed
3. no secrets committed

## 5. Documentation Requirement

Behavior changes must update docs in same PR.

At minimum, update affected files from:

- `README.md`
- `COMPLETE_INVENTORY_REPORT_2026-03-02.md`
- `QUICKSTART.md`
- `USER_GUIDE.md`
- `ARCHITECTURE.md`
- `TECHNICAL_DOCS.md`
- `API_SETUP.md`
- `RELEASE_CHECKLIST.md`
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

## 8. Open Engineering Debt to Respect

- Node runtime upgrade for functions (target Node 22)
- continued mirror discipline between `app/*` and `public/app/*`


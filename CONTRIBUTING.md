# Contributing to World Explorer 3D

Last reviewed: 2026-07-21

Contribution workflow and minimum quality bars for this repository.

## 1. Repository and Branching

Canonical repository:

- `https://github.com/RRG314/WorldExplorer3D`

Suggested branch naming:

- `feature/<short-description>`
- `fix/<short-description>`
- `docs/<short-description>`

## 2. Local Setup

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
cd functions && npm install && cd ..
npm run build:hosting -- --firebase-env staging
python3 -m http.server --directory dist 4173
```

For authoritative-room work, run the local server in a second terminal:

```bash
npm run dev:mmo-server
```

For a credential-free one-command contributor stack, follow
[SELF_HOSTING.md](SELF_HOSTING.md). Gameplay and builder extension points are
documented in [CONTENT_EXTENSION_GUIDE.md](CONTENT_EXTENSION_GUIDE.md).

Use local fixtures and the Firebase Emulator Suite for backend tests. Public contributors do not need and must not request production credentials.

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
2. `npm run test:mmo` passes when room, sandbox, combat, progression, or multiplayer code changed.
3. Manual smoke covers the complete changed gameplay flow, not only page boot.
4. UI changes include inspected desktop and phone screenshots.
5. No new blocking console/runtime errors in critical flows.

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
- never use production user records as test fixtures
- do not add client-authoritative inventory, progression, combat, moderation, or rewards

## 8. Realtime World Contributions

- keep room commands declarative, schema-validated, permission-checked, and budgeted
- preserve existing player and room data through additive migrations
- use server-owned world cells for durable edits and interest management
- do not accept uploaded executable scripts; creator behavior must use reviewed resource definitions
- include disconnect, reconnect, duplicate-command, and denial-path tests

## 9. OSM-Facing Quality Bar

For map/data path changes:

- keep OSM attribution visible and accurate
- avoid exaggerated performance or coverage claims
- document known tradeoffs/limitations explicitly

## 10. License and Conduct

Contributions are submitted under [Apache License 2.0](LICENSE) and must comply
with the [project governance](GOVERNANCE.md) and
[community code of conduct](CODE_OF_CONDUCT.md). Every commit must certify the
[Developer Certificate of Origin](DCO.txt) with a sign-off:

```bash
git commit -s
```

Do not contribute third-party code, data, models, textures, imagery, or fonts
without compatible terms and a provenance record. Contributions do not grant
access to production credentials, infrastructure, or user data.

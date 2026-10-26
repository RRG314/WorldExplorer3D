# Contributing to World Explorer 3D

Last reviewed: 2026-10-26

Contribution workflow and minimum quality bars for this repository.

## 1. Repository and Branching

Canonical repository:

- `https://github.com/RRG314/WorldExplorer3D`

Preferred branch naming:

- `steven/<short-description>`
- Keep unrelated changes in separate pull requests.

## 2. Local Setup

Requirements: Node.js 22+, Java 21 for backend emulators, and a WebGL browser.
Core exploration can run with staging configuration. Online services require an
authorized environment; credentials are never committed.

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

Required before releasing runtime changes:

```bash
npm run build:hosting -- --firebase-env staging
npm run verify:hosting
npm run audit:reachability
```

Do not merge gameplay/UI/runtime changes unless the generated hosting artifact matches canonical source and reports a traceable build ID.
Do not retain superseded runtime modules: the reachability audit must report zero orphan JavaScript or CSS files.

## 4. Minimum Validation Before PR

Choose focused checks for the changed behavior. Use an actual browser journey
when a runtime, input or UI change needs it; distinguish service doubles,
emulation and physical devices. Retain a passing result while its source,
configuration and environment remain applicable. Do not restart unrelated
release sequences after a small repair. A complete release still needs its
current package, affected services and representative gameplay checked together.
Record failures and limitations honestly; a screenshot alone is not acceptance.

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

Describe what changed, why it changed, how it was validated, and any remaining compatibility or deployment risk.

Include screenshots for UI changes and logs for backend behavior changes.
Share only reviewed, redacted evidence. Keep raw browser state and diagnostic
logs outside the public Git tree.

## 7. Security and Secrets

- never commit real secrets (`sk_live`, `whsec`, tokens)
- use placeholders in docs/examples
- keep billing/env values in runtime env, not source files
- keep signing certificates with private keys, player records, raw evidence and
  operator handoffs outside public Git; `.env.example` uses placeholders only
- Firebase client IDs and client API keys are public app configuration, not
  backend credentials; restrict them to their intended clients/services
- run `node scripts/verification/public-repository-policy.mjs` before publishing
  repository changes; CI checks this boundary as well as content secret scanning

## Focused verification

`npm run verify:boundary-types` uses TypeScript from the application toolchain
when available, or the isolated pinned verification toolchain. To install the
latter, copy `scripts/architecture-evaluation/tooling/package.json` and its lock
to ignored `output/architecture-evaluation/tooling/`, then run
`npm ci --prefix output/architecture-evaluation/tooling --no-audit --no-fund`.
The lockfile is source; downloaded compilers and generated reports are not.

Native Android and Apple projects keep source, public SDK configuration and
dependency locks in Git. Their workflows build in owned emulators/simulators.
Release signing material and temporary live-test identities stay outside Git;
they must never enter screenshots, uploaded logs or build artifacts.

`scripts/verification/web-startup-current.mjs` checks a failed essential file,
explicit reload and slow startup in one selected browser engine. Run it through
`scripts/verification/attested-source-check.mjs` with authorized staging access.
`WE3D_STARTUP_WORLD=1` adds one city entry; `WE3D_STARTUP_PHASE=world-only` reuses
accepted startup checks when only a world journey needs investigation. Optional
allocation profiling and regional settling are diagnostics, not phone performance
acceptance. Keep their output private and reuse applicable successful results.

## 8. OSM-Facing Quality Bar

For map/data path changes:

- keep OSM attribution visible and accurate
- avoid exaggerated performance or coverage claims
- document known tradeoffs/limitations explicitly

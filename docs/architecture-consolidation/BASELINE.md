# Consolidation baseline — October 13, 2026

This is an implementation audit of the existing product, not a new release or a claim of complete gameplay certification.

## Identity and preservation

Authoritative checkout: `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`, branch `steven/visual-quality`, initial clean commit `64bab7769e6ae0fc97bb395bc22fedb35f973e51`. `CURRENT-STATE.md` resolves the stale checkout instruction in `AGENTS.md`. Other Documents/Developer worktrees are preserved.

GitHub default `stable` is `437e06cb`; both active development branches have the same tree (`025f88bd`). Stable code/package, secret scan and Pages deployment passed before this task. Source version is 5.6.0; the public app remains 5.5.0 (`d8775a392c42`). The 5.6 release remains a draft. No production deployment, rule change, push, asset purchase or data migration is part of this assignment.

Local rollback ref: `steven/consolidation-baseline-20261013`. Changes are separate reviewable commits; revert individual commits on this branch if necessary. Never reset another checkout or roll back player storage. Preserve `dist`, four retained packages, Git history, private verification material and ordinary Chrome. No whole-repository copies or deletions. Disk at admission: 11.8 GiB free; host memory: 8 GiB. Run one heavy test at a time and close only owned resources.

## Runtime and entrypoints

Node v22.22.0, npm 10.9.4; browser Three.js 0.128.0 is locally pinned. Firebase browser modules load separately from npm build/emulator dependencies; `config/runtime-dependencies.json` and `verify:dependencies` own those identities.

Entrypoints: `index.html` (landing), `app/index.html` → `app/js/bootstrap.js` → `app-entry.js` (game), `account/index.html`, `functions/index.js` (HTTP/server triggers), `.github/workflows/` (checks/Pages), `github-pages/index.html` (project page). Hosting is built by `scripts/hosting-artifact.mjs`, admitted by `scripts/release-finalize.mjs`, and promoted by `scripts/firebase-hosting-promote.mjs`.

## Fresh source inventory

1,104 runtime JS modules; 227,782 lines including generated Functions code. 167 direct shared-context importers; 121 direct writer modules; 1,147 root members. A current three-module static cycle exists in structure semantics / transport surfaces / tunnel obstruction limits. Older reports of no static cycles no longer apply. Counts exclude vendor and do not capture arbitrary reflective, injected or aliased writes; they are not measured defects or coverage percentages.

Reused the existing Babel inventory with an explicit output destination instead of overwriting the October 4 evidence. The fresh graph, context accesses and subscription/event sites are in ignored `output/architecture-consolidation/2026-10-13/baseline/inventory.json`; its manifest records every npm command, runtime versions, worktrees and production artifact hashes. `config/context-write-allowlist.json` separately guards injected/aliased context writers.

## Commands and baseline evidence

All commands and expanded definitions are preserved in `output/architecture-consolidation/2026-10-13/baseline-manifest.json`; the authoritative command registry remains `package.json`. Principal checks:

- `npm run verify:pr`: dependencies, source, ownership, boundary types, runtime names, selected component contracts, test inventory/sensitivity.
- `npm run verify:system-release`: browser/release matrix; run only at a release milestone.
- `npm run verify:backend-release`: isolated backend groups, not production mutation.
- `npm run verify:world`, `verify:city-switch-lifecycle`, `verify:ship-traversal`, `verify:space-release`, `verify:reality-capture:local`, `verify:journal-transactions`, `verify:condition-tabs`, `verify:connected-property-backend`: risk-specific evidence.
- `node scripts/architecture-evaluation/system-review.mjs --out output/architecture-consolidation/2026-10-13/baseline`: fresh graph and state/event access inventory.

The October 13 source-equivalent baseline has 2,528 passing component tests and passing protected CI. Prior packaged journeys cover opening (28 checks), coastal (23), vessel traversal (27 routes), aquarium (33 functional checks), museum, location reload, marine/space returns and backend groups. Their exact package and limitations remain in `output/production-readiness-20261012/remaining-review-ledger.json`. They are inherited evidence, not new runs for this task.

Known failures retained: ground/transition stalls; active heap/transfer budgets; incomplete physical-device and ordinary hosted acceptance. Coverage and post-exit retention passed their prior scoped tests. This consolidation must not hide those failures, thin the world or change thresholds.

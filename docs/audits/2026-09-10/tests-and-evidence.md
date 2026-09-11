# Tests and evidence ledger

September 10, 2026. A passing test proves only the behavior it actually checks. Source inspection, mocked execution, browser interaction and a live service journey are different levels of evidence.

## Checks performed during this audit

| Check | Result | What it proves / limitation |
|---|---|---|
| `npm run verify:source` | Passed | Source/graph checks and some executable inline terrain logic. Does not exercise the full product. |
| `npm run verify:current-contracts` | 234 passed, 0 failed, 0 skipped; 38 listed files | The selected contract suite works on this snapshot. Other test files are outside this command. |
| `npm run verify:system-release` without `--run` | Configuration validation passed | Gate configuration is structurally valid; the feature matrix was not executed. |
| `npm run verify:release-scope` | Structure passed; execution evidence missing | Not release-ready. Checkpoints require execution; do not present this as release acceptance. |
| Root `npm audit --json` | 0 known vulnerabilities reported | Installed npm dependency advisory check, not a full security audit. |
| Functions `npm audit --omit=dev --json` | 0 known vulnerabilities reported | Backend production npm dependency advisory check. Browser CDN dependencies are outside this result. |
| World browser verification against dist | Interrupted/incomplete | No fresh passing result. Heavy checks were stopped after the resource complaint. |
| Firestore + Storage emulator test attempt | Tests did not run | Java was unavailable on the command PATH. An installed Java location was subsequently found; no heavy retry was started. |
| Full backend release matrix | Not run | No claim of fresh backend acceptance. |
| API ambiguous-response probe | Reproduced two writes | Original client code with stubbed imports/transport; first write succeeds but response is lost, fallback repeats it. No real user data written. |
| API cancellation probe | Cancellation not forwarded; request still pending | Mocked fetch saw no signal despite an aborted caller signal. No real service timeout measured. |
| Script-loader retry probe | First timeout rejected; retry remained pending | Original loader with fake DOM and shortened timer; failed script remained. Not a complete browser startup benchmark. |
| Candidate capacity guard | Four isolated checks passed with stubbed filesystem | Accepts three recognized builds with space; blocks four; blocks low disk; preserves unrecognized directories. No build launched. |
| Cleanup safeguard syntax | `node --check scripts/local-candidate.mjs` passed | Syntax only; no build or browser launched. |

Temporary logs from the pre-interruption checks did not survive the host restart. Results above are retained from tool outputs in this task. They are not presented as downloadable raw logs. Previous house/capture browser and live-flow passes belong to the earlier feature task and are not substituted for a fresh whole-product pass.

## Existing reports are not fresh evidence

`output/release-evidence/current/execution-manifest.json` records `ok:false`, an older baseline beginning `5dc28fa`, and a September 6 run. `output/verification/world/report.json` records `ok:false` from September 7 with a closed-page/browser error. These do not prove a new regression in the current build; they show why a folder named “current” cannot be treated as proof without checking build identity and completion.

## Why the test setup needs repair

1. Pull-request CI calls `verify:pr`, which is `verify:source`. The normal `npm test` adds the world check, but neither automatically runs the 234 current contract tests. Valuable tests exist without being part of the ordinary acceptance path.
2. Full release verification is manually dispatched. Its workflow installs root dependencies but does not explicitly install `functions/` dependencies before backend verification. This is a clean-run reproducibility gap found in source, not a freshly reproduced CI failure.
3. The backend matrix names nine verification steps, but Storage rules and the complete reality-capture publication journey are not dedicated steps. The overall 42-gate configuration does not close that gap.
4. Some platform smoke checks count navigation elements and visible headings. That can detect a missing page while still accepting a page whose save, approve or delete action fails.
5. No standard coverage, lint or type-check gate was found in the inspected root setup. Coverage would help locate untested behavior, but a high percentage would not prove that a user journey works.
6. Several browser scripts request the Chrome channel while CI installs Playwright Chromium. Some runners may already include Chrome; this is a portability risk, not a demonstrated failure on all runners.
7. Policy documents list checks that the default test command does not execute. Declared policy and enforced policy need one source of truth.

Eighteen test files read source files. That alone does not make them fake tests: source-contract checks are useful for structural constraints. They become misleading when used as substitutes for observing actual behavior. Likewise, the private-room tests currently affirm prejoin player reads; a passing test can preserve a product policy that should be reconsidered.

## A practical test structure

| Layer | Example | Where to run |
|---|---|---|
| Small unit/contract tests | Geometry transforms, command validation, retry deduplication, room-state transitions | Every change; sequentially on this Mac when needed. |
| Security and backend integration | A second user cannot approve another person's submission; Storage access denied correctly; deletion retries failures | CI with emulators and explicit dependencies. |
| Browser journeys | Create room → reshape → attach floor/ceiling → submit → approve → enter published interior | Dedicated CI job, one browser at a time, with disposable users/data. |
| Release smoke | The deployed build serves the expected assets and consumes the published revision | Explicit staging environment with cleanup receipt. |
| Physical-device acceptance | Touch controls, camera permissions, memory, long sessions and recovery | Actual target devices; no desktop-emulation substitute. |

Require assertions about durable results, not just button presence. For publication, verify the exact revision ID in the world and its geometry/materials. For deletion, inject a cleanup failure and require an unfinished/retrying status. For permission rules, include denied actions. For retries, lose a response after commit and prove the record count remains one.

Every report should name source commit, artifact/build ID, environment, test command, start/end time, result, skipped cases and cleanup outcome. A failed or interrupted test must remain failed or incomplete. No test status should be inferred from a screenshot alone.

## Source evidence index

These are the implementation locations supporting the findings, rather than links to external best-practice claims.

| Finding | Source to inspect |
|---|---|
| Mandatory checks and release omissions | `package.json`; `.github/workflows/runtime-verify.yml`; `.github/workflows/release-verify.yml`; `config/system-release-gates.json`; `config/verification-policy.json`; `scripts/verification/backend-release.mjs`, `system-release.mjs`, `release.mjs` |
| Presence-only account smoke assertions | `scripts/verification/world.mjs`, function `verifyPlatformSurfaces` |
| Retry and cancellation | `js/function-api.js`, functions `postAppCheckedFunction` and `postProtectedFunction`; `functions/index.js`, `submitContribution` and its `editorSubmissions.add` write |
| Loader retry hang | `app/js/modules/script-loader.js`, existing-script and timeout branches |
| Incomplete deletion | `functions/index.js`, `deleteDocsByQuery`, `updateDocsByQuery`, `deleteUserData`, `deleteAccount`; `account/index.html`, deletion description |
| Private-room disclosure and capacity | `firestore.rules`, room and player match blocks; `app/js/multiplayer/rooms.js`, count-then-join path; `rooms-model.js`, `randomCode`; `tests/firestore.rules.security.test.mjs`, prejoin read assertions |
| Production default | `.firebaserc`; `functions/package.json`, deploy script; contrast browser-only `js/firebase-environment-policy.js` |
| Shared contracts | `app/js/shared-context.js` and importing modules |
| Browser dependency boundary | `js/firebase-init.js`; `app/js/modules/manifest.js`, `script-loader.js`; `firebase.json` hosting headers |
| Operational visibility | `app/js/runtime-diagnostics.js`; external cloud settings remain unverified |
| Documentation drift | `docs/CURRENT_TEST_GUIDE.md`; `docs/SYSTEM_INVENTORY.md`; `docs/ARCHITECTURE_MAP.md`; existing output manifests described above |
| Resource safeguard | `scripts/local-candidate.mjs`; root `AGENTS.md`; this folder's `resource-cleanup.json` |

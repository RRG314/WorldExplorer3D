# Verification record

October 13, 2026. Baseline `64bab776`; source version 5.6.0. All checks are local/source unless explicitly marked prior. Detailed logs remain in ignored `output/architecture-consolidation/2026-10-13/` so they are not added to the public gallery or release.

| Command / evidence | Result and scope |
| --- | --- |
| `node scripts/architecture-evaluation/system-review.mjs --out output/architecture-consolidation/2026-10-13/baseline` | PASS inventory: 1,104 runtime modules / 227,782 lines / 121 direct writer modules / one three-module static cycle. AST inventory is not line-by-line review. |
| `node --experimental-vm-modules --test --test-concurrency=1 tests/account-request-lifetime-current.test.mjs` before source change | **EXPECTED FAIL: 14 of 17** actual-module cases fail. `account-before.tap`. Same-account current/legacy success cases passed. |
| `node --experimental-vm-modules --test --test-concurrency=1 tests/account-request-lifetime-current.test.mjs tests/request-reliability.test.mjs tests/economy-authority-current.test.cjs tests/property-authority.test.cjs tests/convenience-commerce-current.test.mjs` | **PASS 56/56**, `account-after.tap`. Real transport/API/owners; controlled SDK, clock/network boundaries. No production records. |
| `node --test tests/tunnel-boundary-authority-current.test.mjs tests/tunnel-foundation-clearance-current.test.mjs tests/tunnel-overhead-road-current.test.mjs tests/bridge-tunnel-consistency-current.test.mjs` before C3 | PASS baseline characterization, `transport-before.tap`. |
| Above transport set plus `tests/tunnel-solid-current.test.mjs`, `tests/tunnel-worker-packaging-current.test.mjs`, `tests/transport-profile-buffer-current.test.mjs`, `tests/transport-surface-control-timing-current.test.mjs`, sequential | **PASS 42/42**, `transport-after.tap`. Compiler/geometry/adapter evidence; not worldwide driving acceptance. |
| `npm run verify:pr` | **PASS 2,547/2,547 tests in 470 files**, zero skips/TODO/failures; dependency, source, ownership, boundary types, runtime names, inventory and sensitivity pass. `source-chain.log`; original structured component summary copied into the local receipt. |
| `node scripts/verification/account-request-lifetime-current.mjs` | **PASS**, native Chrome actual ESM. Three controlled scenarios: switch during purchase; ignore retired listeners and reconnect; logout during response. No page errors. `account-browser/report.json`; screenshot inspected. Controlled services, not live sign-in or emulator acceptance. |
| Existing `web-game-ready-current.mjs` adapter + exact skill `web_game_playwright_client.js`; real Chrome GPU; Baltimore 39.2867,-76.6121; drive/turn/idle bursts | **INCOMPLETE/FAILED** after first burst on local reCAPTCHA/App Check errors and provider availability. `driving-browser/` retains screenshot/state/errors. Actual city ready, car moving/grounded on road, 44,147 buildings / 18,912 roads / 49 terrain tiles. Different origin/live provider snapshot from older 49,080/18,952 fixture; not an equivalent coverage comparison. No game code was changed to silence these failures. |
| Fresh final AST graph with account-page coverage and new helper | **PASS inventory: 1,107 modules / 227,857 lines; zero resolved static cycles**. Increase includes two account modules and the new wallet projection. Same 121 direct context writer modules. Events/persistence sites retained; dynamic/aliased/reflective runtime cycles still require tracing. |
| Live `https://worldexplorer3d.io/build-manifest.json` allowlisted identity read | Production still **5.5.0+d8775a392c42.88e67f97c00bb4c2.production**. No deployment. |
| Read-only `firebase functions:list --project worldexplorer3d-d9b83 --json`, allowlisted in memory | 80 deployed Function metadata records; only id/entrypoint/region/platform/runtime retained. No secrets/configuration or player records logged. This is inventory, not live endpoint acceptance. |
| `git diff --check`, source references, baseline dist manifest hashes | Final checkpoint checks recorded in local summary. Source/test commits remain local; rollback ref preserved. |

## Browser diagnosis and safety

The account fixture deliberately controls identity, Firebase subscription and response timing while importing the shipped modules. It uses no real records, tokens or credentials. The ordinary world smoke uses real input/renderer; its loopback host does not establish public reCAPTCHA acceptance, and the local weather/marine paths returned unavailable responses. Do not turn that into a passing hosted check or bypass protection. New credentials were not created. The failure is retained for a correctly configured staging/hosted follow-up.

The driving screenshot confirms the car and mapped scene are present; it also contains angular pavement/corner fragments requiring a matched-provider visual investigation. This slice changes no pavement or road math. A single frame cannot prove worldwide appearance or smoothness.

## Performance, security and unrun classes

No matched before/after full-world performance run was performed for these ownership changes. Existing active hitch, venue heap and transfer failures remain open. The short driving actions are not a p95/p99 or memory benchmark. No performance threshold, world coverage, retention requirement or assertion was weakened.

The source suite includes server/revision/permission components; no new Firestore/Storage policy or server schema was changed. Existing emulator runs remain dated prior evidence. Ordinary multi-account property/service gameplay, private capture grant/revoke, sign-in, App Check and recovery must be checked together on a new immutable candidate. Full release matrix, physical Android/iOS, hardware GPS/AR, every campaign/catalog and assistive-technology review were **not run here**.

## Exact next work

1. Start with `BASELINE.md` and `REFACTOR-PLAN.md`; inspect `git status --short` and `CURRENT-STATE.md`. Do not touch the older Documents checkout or production dist.
2. `node scripts/verification/account-request-lifetime-current.mjs` reproduces this slice's controlled browser acceptance. The regression tests are part of `npm run verify:pr`.
3. Configure a valid existing staging/hosted test context under its normal rules, then rerun the driving adapter and connected-property journey; retain the failed local receipt separately. No repeated unconfigured cold-world run.
4. Use the retained `rdt-building-index.matches` and regional graphics profile leads for one measured performance repair. Preserve in-place capture edits, old complete scenery, cancellation and unchanged map coverage.
5. At the next release milestone, build a separate permitted immutable candidate and run risk-weighted preservation, backend/private-data and device classes. Never overwrite the preserved production package as a shortcut.

Final source commit: `a028e65e`. The final focused reruns pass 56 and 42 checks (`account-final.tap`, `transport-final.tap`). The production build/asset manifest hashes exactly match baseline. `checkpoint.json` records code identity, evidence hashes and preservation decisions.


### C5 connected commerce recovery follow-up

`node --experimental-vm-modules --test --test-concurrency=1 tests/commerce-recovery-current.test.mjs tests/account-request-lifetime-current.test.mjs tests/convenience-commerce-current.test.mjs tests/local-economy-transaction.test.mjs tests/economy-authority-current.test.cjs`
passes 56/56. Before-change failures are retained as `commerce-model-before.tap`
and `commerce-recovery-before.tap`. Fixtures were updated to supply real contract
fields (UID, original request ID, item quantity) and Storage.removeItem; assertions
were not weakened. `node scripts/verification/commerce-recovery-current.mjs` passes
four Chrome checks using actual domain modules, native storage/locks, prescribed
skill mouse choreography, a page reload and a competing tab. Screenshot and state
inspected; no page errors. HTTP/Auth/persistence boundaries are controlled and
must not be described as a live account purchase. `npm run verify:pr` passes 2,559
component tests and the full structural chain (`source-chain-recovery.log`).

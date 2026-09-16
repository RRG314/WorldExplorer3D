# World Explorer 3D performance and regression audit

Audit date: September 15, 2026, America/New_York. Scope: current application versus the owner's live reference, https://worldexplorer3d.io. This is an internal engineering report, not release approval.

The current branch is **not ready for release**. The audit found a reproducible packaging defect, a failing regression check omitted from the main contract suite, and measurement differences that invalidate a simple live-versus-local FPS comparison. These explain how apparently successful checks could miss failures. They do not yet identify every source of flight stutter or prove a memory leak.

No application implementation, dependency, provider configuration, or production deployment was changed during this audit. One local production-format artifact was built for inspection, and checks ran sequentially. The existing preview at port 4192 remains unchanged. The temporary live test tab was closed after returning to the menu.

## What was actually examined

The audit compared source and history, read the existing architecture and regression records, traced loading and runtime ownership, inspected release/test tooling, loaded the live San Francisco world, entered aircraft mode through the UI, built the current source into its production format, inspected worker targets, and ran the current contract suite plus the older production regression suite.

This is a completed source/build/test audit with an initial live observation. **The controlled performance experiment remains incomplete:** no matching local build of the live commit was timed, no matched long-flight runs across all three cities were completed, and no allocation-retainer or CPU profile was captured. Account/backend workflows were inspected through their architecture and test coverage, not exercised against production accounts. Those limits prevent a claim that all application performance problems have been diagnosed or repaired.

## Identity and comparison boundaries

| Item | Verified identity |
|---|---|
| Live release | `db62593ba377e276e5079c78238fa3a83e501c93` |
| Live build | `5.2.0+db62593ba377.6342cddaba06fc68.production`; clean source |
| Working checkout | `steven/street-system-rd`, HEAD `1519f0618e08b4779a9eff976ec7193d11aa819b`, with existing uncommitted work |
| Audit-only local artifact | `5.2.0+1519f0618e08.2fe6655d6ad0cb33.production`; dirty source; not a release candidate |
| Source inventory | 541 changed paths versus live; 1,224 source/config/script/test files fingerprinted |
| Packaged runtime | Live: 112 files. Current: 142 files. File count is not a performance verdict. |

The existing release source-of-truth document names another commit. The live manifest is the comparison authority for this audit. Asset/provider versions also differ: the live ground release is `b2b9634b37add3d0`, while the audit artifact uses `6456c26fd92b181c`. Identical coordinates do not establish identical input data.

The source inventory excludes asset payload hashes and private configuration. The build manifest separately identifies packaged content. [Preservation check](preservation-check.json) confirms whether any inventoried files changed during the audit.

## Findings, in repair order

### 1. The production artifact omits both new sidewalk workers — confirmed release blocker

`scripts/hosting-artifact.mjs` explicitly bundles the tunnel worker but not the street overview or street pavement workers. It excludes ordinary `app/js` source files from the copied artifact. The two street owners use relative `new URL(..., import.meta.url)` worker addresses.

The built bundle consequently references `app/js/bundles/compiler/street-overview-worker.js` and `app/js/bundles/compiler/street-pavement-worker.js`; neither file exists in the artifact. Both the build and artifact verification nevertheless report success. [Packaged file evidence](packaged-worker-audit.json), [build log](artifact-build.log), [verification log](artifact-verify.log).

This can make source-preview sidewalks appear functional while the packaged application cannot create their workers. It does not explain every defect in the source preview. The tunnel worker's missing relative fallback is not the same defect: its production URL is explicitly injected and points to the existing hashed worker.

**Required repair:** give both street workers explicit artifact entry points and resolved production URLs, using the established tunnel-worker pattern or another fully verified bundling mechanism. Extend artifact validation to worker dependencies, then exercise worker startup, output publication, cancellation, and teardown from the packaged application. Checking HTTP 200 alone is insufficient because hosting may return HTML for a missing script.

### 2. A known regression test fails outside the normal contract gate — confirmed verification gap

`tests/production-regression-hotfix-current.test.mjs`: **6 passed, 1 failed**. The failing assertion expects detached road-center marking quads to remain disabled at ground level; current `shouldRenderRoadCenterMarkings` permits ground-road markings. Aircraft heading/bank, class differences, parachute heading, drone camera, and the bridge-support example passed.

`scripts/verification/current-contracts.mjs`: **428 passed**. Its explicit file list does not include the failing production regression file. No reference to that file was found in package scripts, configuration, verification scripts, or the checked workflow references. [Regression output](production-regression-tests.log), [contract output](current-contracts.log).

The failed assertion proves an unresolved behavioral contract, not by itself a currently visible floating-marking defect. The current source intentionally restores ground markings; reconcile that choice with the original bug and a real surface-contact test. Do not simply delete the test or suppress useful markings everywhere to make it pass.

**Required repair:** register retained production regressions in the applicable release gate; replace obsolete broad expectations only with documented behavior and stronger rendered/contact checks. Test that markings stay on their owning surface across hills, bridges, intersections and terrain updates.

### 3. Current and live frame counters do not measure the same thing — confirmed measurement defect

Live `core-frame-systems.js` records `frame.dt`, which the runtime kernel caps before simulation. Current source records `frame.rawDelta ?? frame.dt`. A long freeze can therefore be understated by the live HUD while appearing in the current HUD. The physics time cap itself has a legitimate stability purpose; it should not be used as elapsed-frame evidence.

The existing performance script uses animation-frame timestamps, which is the right independent basis, but observes each movement mode for only **five seconds** (1.5 seconds in audit-only mode). That does not establish sustained flight performance or repeated boundary behavior. Its reload policy also permits building count to fall to 80% of its earlier count. Counts alone cannot establish that the correct buildings remain.

**Required repair:** compare identical external frame timing, record elapsed duration and distance, and exercise multiple streaming boundaries. Keep simulation timing and performance timing separate. Use stable building identities/provider provenance alongside counts so missing content cannot masquerade as a speedup.

### 4. Loading and memory have substantial world costs, but a leak is not proven

Earlier retained local San Francisco evidence reports approximately 197 seconds to load, including about 67.9 seconds for transport and 39.1 seconds for carriageway work. Reported geometry buffers total roughly 333 MB, with buildings about 158 MB, roads 66 MB and vegetation 43 MB. The legacy heap estimate rose from about 1.12 GB at startup to 1.69 GB in a later flight sample. These are earlier diagnostic observations, **not fresh matched benchmark results**.

Geometry byte totals exclude textures, GPU/driver overhead and many JavaScript objects. The legacy browser heap estimate is not isolated process memory and does not prove that the increase remains after teardown. Worker input copies, temporary compilation arrays, rendered buffers and retained caches have different lifetimes.

The application does have explicit disposal infrastructure: lifecycle scopes, world reset, terrain mesh disposal, pavement cancellation, overview disposal and location-model release. Its existence is encouraging but must be verified through repeated transitions and retained-owner evidence. Deleting whole systems because they consume memory would risk removing required behavior.

**Required repair approach:** attribute long tasks and retained objects to owners before changing their lifetimes. Measure loading separately from moving-world work and teardown. Optimize geometry construction, publication and upload costs while preserving world identity and contact behavior. See [ownership map](architecture-and-ownership.md).

### 5. The stronger flight-regression suspects surround the aircraft — supported hypothesis

The tracked `plane-mode.js`, `plane/` flight modules and camera source match the live commit. World compilation, terrain, scenery and runtime scheduling have changed extensively. The top-level `physics.js` has also changed; it now uses a new road-query policy. Its inspected call site is driving logic, so this is not evidence that the policy causes flight stalls.

Pavement focus updates run in the presentation path. Near geometry compilation, terrain conformance, collision publication and full-location terrain-mask updates can compete with rendering as the player moves. Worker computation does not eliminate main-thread preparation, result processing, mesh creation, or GPU uploads. This is where to collect a flight trace before changing aircraft tuning.

The local URL includes `streetDiagnostics=1`. In current source that enables timing wrappers around WebGL calls. Those wrappers measure each call and add work; their overhead has not been quantified. Normal acceptance runs must omit this instrumentation, with separate diagnostic runs used to locate costs.

**Required repair approach:** capture a flight stall with task stacks and rendering/upload activity; link it to a specific publication or update. Change that owner, repeat the same route, and retain aircraft-control regression checks. Do not alter handling to conceal stalls.

### 6. More complete content and provider fallback complicate the comparison — confirmed differences

The live UI loaded San Francisco and entered aircraft mode. Its console recorded failed exact OpenStreetMap transport requests followed by adaptive selection of 17,158 of 36,134 road records. The plane subsequently appeared at a new coordinate at 149 knots and altitude 119. This establishes a live workflow observation, not smooth-flight timing or a memory benchmark. [Live log](live-browser-log.json), [plane UI record](live-plane-dom.txt).

The current final building-detail selection removed an earlier 85% coverage selection and local publication cap. Other selection budgets still exist. Current fallback handling also preserves more local detail. These changes can legitimately increase loaded work while correcting missing buildings. Live and current comparisons must record provider, completeness, feature identities, bounds and settings.

**Required repair approach:** use fixed input fixtures for deterministic regression tests, and separately test real provider success/failure. Preserve required content while reducing representation and scheduling costs. Do not restore missing-building behavior merely to match the live memory figure.

### 7. RDT is not established as the cause

Live already defaults/resets to baseline mode. The baseline profile retains the same nominal limits found in current source: 20,000 roads, 26,000 buildings, 15,000 land-use features and 8,000 POIs, along with matching baseline distance settings. Removal of the RDT branch therefore does **not** demonstrate that default budgets increased.

This is not proof that all former RDT behavior was harmless. It rules out one tempting but unsupported explanation. Evaluate changes in effective selection, retained ownership and update work rather than blaming the experiment's name.

## How the process allowed repeated partial fixes

The confirmed gap is between levels of evidence. Geometry/unit tests validate selected rules; a source preview validates a different delivery path from production; a brief flight sample misses sustained movement; a feature count says nothing about terrain contact or missing identities. Passing one level was being treated as evidence for the whole system. The successful artifact validator with absent street workers is a direct example.

There is already useful architecture, lifecycle code and a substantial release matrix. The repair is to connect those tools to the actual failure boundaries and require the corresponding evidence, not generate another disconnected collection of tests or replace the entire engine.

## Repair sequence and acceptance criteria

1. **Repair release packaging and regression registration.** Both street workers must execute in the packaged build. Retained production regression checks must run in the gate. Resolve the road-marking contract with contact/render evidence. Keep the current source preview and live site separate.
2. **Create a valid comparison.** Build the verified live source and candidate in the same production format. Record asset releases, providers, quality, viewport and host activity. Run one world at a time. Preserve existing user storage; use a dedicated test context rather than clearing it.
3. **Trace the expensive paths.** Capture cold/warm load phases, sustained flight and a world transition. Separate normal timing from instrumented profiling. Attribute CPU work, render uploads and retained memory to the owners in the map before optimizing them.
4. **Make bounded changes with protected behavior.** First address the measured owner with the largest relevant cost. Preserve building identities, road connectivity, terrain/contact agreement, entrances, controls and environment teardown. Repeat the exact failing route after each change.
5. **Run geographic and lifecycle acceptance.** Baltimore, San Francisco and Monaco; flat streets, steep slopes, intersections, bridges/tunnels, terrain boundaries, missing-provider fallback, movement outside the initial focus area, return to menu, city switch and re-entry. Inspect street-level and aerial images as well as contact errors. At least 90 seconds of movement per flight case is a starting minimum; also require several observed publication boundaries. Repeat comparison runs to expose variability.
6. **Gate the exact final artifact.** Resolve contradictory performance budgets into one declared target set before judging improvements. Run normal rendering without street diagnostics, then separate diagnostic traces. No missing required content, accumulating world owners, failed local resources or unresolved regression tests. A green code check alone is not release approval.

## Evidence ledger

| Check | Result | What it establishes |
|---|---|---|
| Live manifest | Verified | Exact deployed identity |
| Source/history inventory | Written | Changed areas and preserved source hashes |
| Live San Francisco UI | Loaded; plane mode progressed | Workflow observation; provider fallback recorded |
| Production-format artifact build | Passed | Artifact generated, not runtime correctness |
| Artifact verifier | Passed despite missing workers | Concrete validation gap |
| Street worker target inspection | Two missing targets | Packaged worker defect |
| Current contract suite | 428/428 passed | Listed source/model contracts |
| Separate production regressions | 6/7 passed | One unresolved road-marking contract |
| Matched multi-city load/flight benchmark | Not completed | No comparative performance conclusion |
| CPU profiles / retained allocation snapshots | Not captured | No proven dominant flight stack or leak owner |
| Production account writes / backend deployment | Not performed | No service acceptance claim |

## Professional reference method

Chrome's [runtime profiling guidance](https://developer.chrome.com/docs/devtools/performance) describes recording actual execution and examining expensive tasks; its [memory investigation guidance](https://developer.chrome.com/docs/devtools/memory-problems) distinguishes excessive working sets, leaks and garbage-collection pressure. Three.js documents [explicit disposal of geometry, materials and textures](https://threejs.org/manual/en/how-to-dispose-of-objects.html). These support the measurement and ownership approach above; they do not provide evidence that this application has already passed it.

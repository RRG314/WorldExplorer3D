# Reproducing isolated experiments

Use this architecture worktree and the pinned Node 22.23.2 verification runtime. Do not install tooling into the application dependency tree. Run one heavy workload at a time, preserving ordinary Chrome. Experiments do not deploy anything.

## Source access and TypeScript

Copy `scripts/architecture-evaluation/tooling/package.json` and its lock into `output/architecture-evaluation/tooling/`, then run `npm ci --prefix output/architecture-evaluation/tooling --no-audit --no-fund`. Pinned tools: Babel parser/traverse 8.0.6, TypeScript 7.0.2.

Run `node scripts/architecture-evaluation/coupling-inventory.mjs`, then `coupling-report.mjs`. Their output is source-access evidence and explicitly provisional role triage. For types, run `output/architecture-evaluation/tooling/node_modules/.bin/tsc -p scripts/architecture-evaluation/contracts/tsconfig.json`.

## Physical world captures

`profile-player.mjs` launches one owned headed Chrome browser on localhost, fixed medium quality and normal RAF. It closes its browser/server on success or failure. A staging AppCheck credential is required by existing test infrastructure. Use the established `with-staging-appcheck.cjs` wrapper; it creates a temporary credential outside the repository and revokes it in `finally`. Never put its contents into evidence.

Flags: `WE3D_CAPTURE_PROFILES=1` captures existing transport numeric records; `WE3D_CAPTURE_WORLD=1` captures the bounded neutral projection; `WE3D_PROFILE_COMPILER=1` captures sampled compiler CPU separately from normal timing; `WE3D_PROFILE_SKIP_EARTH_WINDOWS=1` avoids redundant walking/driving samples; `WE3D_VERIFY_NOTICE_SPACE=1` reproduces the selected-card/Travel interaction. Set a descriptive `WE3D_PROFILE_LABEL` to preserve distinct evidence. `profile-environments.mjs` measures Space/Moon/Mars entry scenes with explicit renderer ownership.

## Numeric replay

The fixed replay input is `output/architecture-evaluation/transport-input-capture/transport-profiles.json`. Its hash is recorded in the benchmark report. The input is generated from current provider data, so a new capture may differ; never claim a matched comparison across different hashes.

The Rust crate is pinned to 1.98.1, has no external crates and targets wasm32-unknown-unknown. Use an isolated `RUSTUP_HOME`, `CARGO_HOME` and `CARGO_TARGET_DIR` under ignored output. Build release output into `output/architecture-evaluation/rust-build`. Run `node scripts/architecture-evaluation/run-profile-benchmark.mjs`. Browser and Workers close afterward. Run `node --test scripts/architecture-evaluation/profile-prototype.test.mjs` for numeric edge coverage.

Do not include downloaded compilers, node_modules, 40 MB captures, raw credentials or browser profiles in source control. The benchmark report, source tools and small reviewed evidence are retained.

## Visual proofs

`check-portable-world.mjs` and `check-notice-menu.mjs` use the prescribed web-game Playwright client. Inspect their screenshots and JSON state; a generated image alone is not a passed visual review. The data preview is diagnostic geometry, not game artwork or full gameplay parity.

## Frontage and extended scene evidence

Run `node --test scripts/architecture-evaluation/frontage-query.test.mjs` for ordered before/after comparisons against committed source `ee1bca65`. The reference is generated from Git history, not maintained as a duplicate runtime. `node scripts/architecture-evaluation/benchmark-frontage.mjs` replays the bounded captured location; retain the input hash. Core regression coverage is in the existing `tests/street-frontage-policy-current.test.mjs`; related grading/visibility tests exercise integration.

`WE3D_PROFILE_LAT`, `WE3D_PROFILE_LON` and `WE3D_PROFILE_LOCATION` select another real location. `WE3D_RETENTION_CYCLES=3` observes three Earth/Main Menu cycles, with separate post-GC diagnostics; it is not normal timing evidence. `WE3D_CAPTURE_RDT=1` records existing building query inputs and `WE3D_PROFILE_ALLOCATIONS=1` samples a separate ten-second walking allocation window. Neither creates a replacement world authority.

After an `urban-retention` capture with `WE3D_CAPTURE_RDT=1`, run `benchmark-capture-query.mjs` for the complete Capture selection boundary. It includes validation and a deliberate in-place identity mutation; the copied evaluation records are never published back into the game. `check-frontage-preview.mjs` uses the prescribed browser client to inspect query hits on the same bounded Baltimore footprints; generate its baseline first with `benchmark-frontage.mjs`.

For compile-time allocation sampling, `WE3D_PROFILE_COMPILE_ALLOCATIONS=1` uses a 128 KiB sampling interval and includes objects collected by minor/major GC. Treat its load latency as instrumented. This differs from the earlier ten-second default allocation sample, which reports surviving sampled allocations only. `WE3D_PROFILE_DAY=1` selects Day through the normal quick-time control; `WE3D_PROFILE_FLIGHT=1` uses actual throttle/climb input followed by a 90-second flight window. The harness also records browser long tasks above 50 ms; these are main-thread task observations, not GPU duration.

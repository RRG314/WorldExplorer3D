# RDT restoration and game performance

RDT is restored in the local application as a shared mathematical/identity core and an exact nearby-building spatial lookup. The lookup improves the measured dense-data component cost while preserving its results. **Whole-world loading and flight performance remain unaccepted.** This is not a claim that restoring RDT alone resolves the reported regressions.

## What was reviewed

The game source before removal is preserved in commit `1519f0618e08b4779a9eff976ec7193d11aa819b`. Its `app/js/rdt.js` contains depth, deterministic identity and experimental noise; its world budgets additionally used geographic-hash depth to change feature caps, road sampling and visibility. Reviewing only seed equivalence was insufficient to evaluate all these changes.

The local research review covered:

- `Documents/New project/repos/rdt-spatial-index`: README, implementation, results and license; commit `8d2d9553668606436eb2bde14e8851fced82f29b`. Its JavaScript index uses occupancy-driven recursive grid partitioning. The repository explicitly reports workload-dependent performance and no universal winner.
- `Documents/ChatGPT/Oeis/rdt_software_research/RDT_SOFTWARE_RESEARCH_REPORT.md`: exact integer/sparse-search work. Its own evaluation reports losses against its strongest equal-memory quantile baseline; that is not evidence to transplant the integer-search method into a frame loop.
- The Codex task **Run falsification pass**, including its completed comparative study: exact observable-preserving reductions are mathematical results for specified observations. They do not certify visual or collision-preserving reduction of this game.
- `Documents/rdt-grant-attachments/rdt_repository_ecosystem.md` and the local game RDT-engine README, to distinguish the spatial prototype, game integration and separate entropy/noise work.

These repositories were read only. No research results, repository histories or remote branches were modified.

## Current implementation

The original RDT module is restored from game history, with finite positive-alpha validation added. The newer procedural import delegates to it. `rdtSeed` and `worldSeed` now refer to the same mutable value, so existing consumers cannot drift into different procedural worlds. World-load diagnostics restore separate raw and reduced-input depth values. Noise retains its existing bounded cache and disabled default; road geometry does not acquire experimental deformation.

Capture presentation uses an RDT spatial partition derived from actual building occupancy, rather than a hash of geographic coordinates. The browser adaptation uses the repository's log-power grid rule with a capped fan-out, finite depth and leaf limit. Node bounds are computed from their actual points, avoiding boundary-rounding omissions. Expanding radius queries collect enough unique IDs before the existing exact nearest selector orders them. Coincident/small leaves and broad queries fall back to the existing exact scan. No road, building or collision object is removed.

The capture runtime owns one index. Each reuse validates identity and coordinates, including mutable footprint centers; list replacement, additions, location changes and capture cleanup invalidate it. This validation still scans source records but avoids most repeated distance calculations and selection work. It allocates no per-record center object on the common explicit-center path. There is no new worker, timer, network request, background research job or second random generator.

The older geographic-hash feature thinning and road-centerline simplification remain disabled. Restoring those unchanged would conflict with the missing-building and connected-street requirements. The performance-mode label still describes the baseline coverage policy; the capture diagnostics independently report `algorithm: rdt-spatial`, rebuild status, nodes and candidates. This is an explicit restoration boundary, not a claim that every historical policy is re-enabled.

## Evidence

The final current-contract suite passed **453 tests**, including the refined validation and broad/degenerate fallback. The source gate passed earlier in this restoration. The focused RDT and street-policy suites also passed **10 tests**. Tests cover canonical depth, invalid alpha, shared identity, exact nearest-ID ordering, dense/clustered/linear/coincident inputs, distant arrivals, in-place edits, world changes and cleanup. The prior blanket source ban on RDT was replaced by the retained ban on duplicate road-geometry owners; content-invariance tests remain.

The sequential CPU benchmark uses 23,000 synthetic building records, five warmups and 30 measured moving queries per distribution, alternating measurement order. Every result must equal the current exact scan. Mutation validation is included. Final evidence is in `capture-benchmark.json`:

| Distribution | Existing scan median | RDT median | Build + first query |
|---|---:|---:|---:|
| Dense | 1.357 ms | 0.215 ms | 16.769 ms |
| Clustered | 1.229 ms | 0.655 ms | 13.899 ms |
| Coincident | 0.946 ms | 1.079 ms | 11.269 ms |

The initial validation implementation regressed to about 8 ms by repeatedly constructing temporary center objects; direct coordinate comparison corrected that measured problem. Coincident data still pays validation overhead and does not improve. This is a local component benchmark, not a frame-rate claim or comparison against every spatial data structure. Build cost is additional and must be considered in real-world acceptance.

Reproduce with `node scripts/verification/rdt-capture-benchmark.mjs`. Run the focused tests with `node --test --test-concurrency=1 tests/rdt-restoration-current.test.mjs tests/production-street-policy-current.test.mjs`.

## Remaining acceptance

The preceding Baltimore test became unresponsive before useful diagnostics were captured. It cannot be called a passing test or attributed to RDT removal without a matched trace. Browser discovery now reports no remaining tabs, so the former owned test world is no longer discovered. No new whole-world retry was launched during this restoration.

The current source preview is port 4192. The saved packaged artifact predates this restoration. No production deployment or GitHub update was performed. Full loading, memory retention, sustained urban flight and cross-city visual acceptance still require a traced comparison; region-wide road/building construction and first-frame rendering remain open owners. The measured capture improvement is real within its test scope and does not explain every freeze.

The spatial adaptation's MIT notice is included in its source and in `RDT-SPATIAL-LICENSE.txt`.

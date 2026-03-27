# Recursive Discovery Program Report

## Program Intent
- Build and test a unified RDT + REC + RGE + valuation research program.
- Prioritize empirical validation, algorithm discovery, and structural analysis.
- Keep speculative claims separated from proven/verified claims.

## Step 0 (Priority First Check): RDT Tree Geometry + Entropy vs Random Trees
- `N=10000000`, `alpha=1.5`.
- Entropy of subtree distributions, depth layers, and reduction paths was computed for RDT and a random recursive tree baseline.
| Metric | RDT | Random Tree | Delta (RDT - Random) |
|---|---:|---:|---:|
| Depth-layer entropy (bits) | 0.826462 | 4.099572 | -3.273109 |
| Subtree-distribution entropy (bits, log2 bins) | 0.134486 | 2.000175 | -1.865689 |
| Reduction-path entropy (bits) | 5.591268 | 16.851872 | -11.260605 |
- Interpretation: non-zero deltas indicate the RDT tree organization differs measurably from random recursive trees.

## Step 1: Core Mathematical Objects
- Extracted and version-tracked from existing papers/code.
- Total tracked definition variants: `12`.
- Clean reference implementations were created in `src/discovery/reference_impl.py`.

## Step 2: Unified Framework Construction
- Unified candidate object: `RDT-REC-RGE hierarchical entropy tree`.
- Consistency checks:
  - Step monotonic decrease: `True`
  - Ultrametric verified (random trials): `True`
  - Hahn valuation axioms verified: `True`
  - Integer depth valuation candidate counterexample found: `True`

## Step 3: Structural Analysis (up to 1e7)
- Run reached `N=10000000`.
- Depth summary: mean `6.170258`, median `6`, p95 `7`, max `7`.
- Subtree heavy-tail fit slope (log-log rank): `-0.42663868201236316`.
- Max indegree: `127`.

## Step 4: Entropy Analysis (REC/RGE vs Classical)
- Datasets analyzed: RDT depth sequence, random sequence, structured sequence.
- REC slope separation (RDT vs random): `0.000558`.
- Spectral entropy gap (structured - random): `-7.097643`.
- Spectral entropy captures periodic structure as expected.
- RDT depth values are more concentrated than random integer values.

## Step 5: Algorithm Discovery
- Benchmarked index-style workloads W1..W4 for RDT bucket index vs hash map and sorted array.
- Also reused broad benchmark suite including KD-tree / p-adic / hamming / Euclidean baselines.
- Broad benchmark has failure-case focus. Number of explicit RDT failure cases: `2`.
- Number of explicit RDT superior cases: `2`.

## Step 6: Parameter Exploration
- Variants explored at `N=800000` with rule families including `n/log(n)^alpha`, `n/sqrt(log n)`, `n/(log n * log log n)`, and polylog forms.
- Top ranked variants by structural score:
| Rank | Variant | Structural Score | Mean Depth | Max Depth | Max In-degree |
|---:|---|---:|---:|---:|---:|
| 1 | sqrt_log | -2.874311 | 15.375383 | 16 | 5 |
| 2 | log_power_alpha_1.1 | -4.381614 | 7.787413 | 8 | 33 |
| 3 | log_power_alpha_1.5 | -4.666599 | 5.769241 | 6 | 99 |
| 4 | log_times_loglog | -4.749308 | 6.855130 | 7 | 69 |
| 5 | polylog_1p2 | -4.949276 | 6.945204 | 7 | 43 |

## Step 7: Mathematical Investigation
- Fit RMSE mean-depth vs log(n)/loglog(n): `0.068673`.
- Fit RMSE mean-depth vs loglog(n): `0.053566`.
- Candidate theorem targets are listed as conjectures unless formally proven.

## Step 8: Literature / Novelty Check
- arXiv query results collected: `21`.
- Query failures: `0`.
- Full links and notes are in `docs/recursive_discovery_citation_log.md`.

## Step 9: Unified Conclusion
- The combined framework is computationally coherent as a deterministic hierarchical object with measurable non-random entropy signatures.
- Hahn-style valuation structures are consistent in their intended algebraic domain, while integer depth valuation candidates need correction.
- Algorithmic usefulness appears workload-dependent: strongest on hierarchy-aligned tasks, weaker on Euclidean-geometry-heavy tasks.
- Recommended next targets: formal bounds for depth transitions, preimage multiplicity theory, and application-specific indexing/sharding validations.

## Generated Artifacts
- `results/recursive_discovery/core_objects.json`
- `results/recursive_discovery/unified_framework_checks.json`
- `results/recursive_discovery/structural_analysis.json`
- `results/recursive_discovery/entropy_analysis.json`
- `results/recursive_discovery/algorithm_discovery.json`
- `results/recursive_discovery/parameter_exploration.json`
- `results/recursive_discovery/math_investigation.json`
- `results/recursive_discovery/literature_scan.json`
- `docs/recursive_discovery_citation_log.md`
- `docs/recursive_discovery_report.md`

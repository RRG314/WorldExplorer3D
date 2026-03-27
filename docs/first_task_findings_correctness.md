# First Task Findings: Correctness, Failures, Repairs, and Useful Algorithms

Generated: 2026-03-04
Primary evidence files:
- `results/recursive_discovery/unified_framework_checks.json`
- `results/recursive_discovery/structural_analysis.json`
- `results/recursive_discovery/entropy_analysis.json`
- `results/recursive_discovery/algorithm_discovery.json`
- `results/recursive_discovery/math_investigation.json`
- `results/tests_summary.json`
- `results/counterexamples.json`

Reproduce this first-task run:

```bash
python3 /Users/stevenreid/Documents/New\ project/tools/recursive_discovery_runner.py --n-max 10000000
```

## 1) Core Object Implemented

For the research variant used in the discovery run:

- Divisor rule (log-divisor family):
  - `d(n) = max(2, floor((ln n)^alpha))` for `n >= 3`, else `2`
- Step rule:
  - `f(1) = 1`
  - `f(n) = floor(n / d(n))` for `n > 1`
- Depth:
  - `D(1) = 0`
  - `D(n) = min {k >= 0 : f^k(n) = 1}`
- Tree ultrametric (LCA-based):
  - `d(a,b) = 2^{-depth(LCA(a,b))}`

## 2) What Is Correct (Proven or Verified)

### Proven / mathematically valid
- Tree-based LCA ultrametric is valid (tree metric argument). Randomized stress check: 30,000 triples, 0 violations.
- Hahn-valuation layer is valid in the intended algebraic domain (finite-support random checks: multiplicativity and ultrametric both verified).
- Dual number and square-zero tower constructions are legitimate ring constructions (not fields when nilpotents are present).

### Verified computationally
- RDT step monotone decrease verified over tested range (`step(n) < n` for `n>1` in checks).
- Large-scale structural run completed at `N = 10,000,000`.
  - mean depth: `6.1702577`
  - median depth: `6`
  - p95 depth: `7`
  - max depth: `7`
- Entropy signature differs strongly from random recursive trees at `N = 10,000,000`:
  - depth-layer entropy delta: `-3.273109` bits
  - subtree entropy delta: `-1.865689` bits
  - reduction-path entropy delta: `-11.260605` bits

## 3) What Is Wrong (Falsified as Stated)

### Raw integer-depth valuation claims (direct on integers)
These fail valuation axioms in small counterexamples.

- Multiplicativity failure (`v(xy)=v(x)+v(y)`):
  - Example counterexample recorded: `x=2, y=5` with `v(ab)=2`, `v(a)+v(b)=3`
- Additive ultrametric-type condition failure on integer candidate also observed in stress reports.

Conclusion:
- A new nontrivial valuation on `Q` from raw RDT integer depth is not currently supported.
- This matches the Ostrowski-classification constraint directionally (no claim of new absolute-value class on `Q`).

## 4) Minimal Repairs That Work

- Repair A (recommended): embed into Hahn-style valued structure and apply standard Hahn valuation there.
  - Status: verified in computational tests.
- Repair B: treat integer-depth map as quasi-valuation / complexity score (bounded-defect style), not as strict valuation.
  - Status: viable as an empirical score, not a strict valuation theorem.

## 5) Usefulness: Better vs Worse Cases

## Overall benchmark posture
- Not globally superior to all baselines.
- Workload-dependent performance, with clear failure cases and clear win cases.

### Cases where RDT is stronger
- `structured_sequences_rdt_ancestry`:
  - clustering accuracy: `1.0`
  - nearest-neighbor accuracy: `1.0`
  - best system on both in this dataset
- `real_fips_state_subset`:
  - nearest-neighbor: tied best (`1.0`), while clustering is slightly below best Euclidean

### Cases where RDT is weaker
- `synthetic_clustered`:
  - best clustering (Euclidean): `0.75`
  - RDT clustering: `0.521875` (gap `0.228125`)
  - best NN (Euclidean): `1.0`
  - RDT NN: `0.94375` (gap `0.05625`)

### Practical implication
- RDT-style hierarchy is useful when data structure aligns with recursive ancestry/hierarchical reduction.
- It is weaker than geometry-native baselines on strongly Euclidean cluster geometry unless hybridized.

## 6) Candidate Useful Algorithms from This First Task

1. **RDT ancestry ultrametric index**
- Good for deterministic hierarchy-aware neighbor grouping.
- Works best when signal/source has ancestry-like structure.

2. **RDT bucket indexing (depth/path signatures)**
- Supports explainable hierarchical buckets.
- Good candidate for deterministic partitioning and sharding experiments.

3. **REC/RGE entropy profile as structure detector**
- Useful as a diagnostic signal for non-random hierarchical organization.
- Not a standalone proof of novelty; use as comparative metric.

## 7) Conservative Research Position

- Do claim:
  - deterministic hierarchical structure
  - valid tree-ultrametric geometry
  - valid Hahn-valued embedding layer
  - measurable entropy-structure differences vs random trees
- Do not claim:
  - a new strict valuation on integers or `Q` from raw depth alone
  - universal superiority over standard metrics/indexes

## 8) What to Do Next (After This First Task)

- Implement RDT-anchored consistent sharding with two mapping modes:
  - direct `bucket % N`
  - mapping-table mode optimized for minimal remap when `N` changes
- Benchmark movement/load/runtime/memory against mod-hash, rendezvous, and consistent ring.
- Only claim superiority where margin is clear on at least one realistic workload.

## 9) Proof/Derivation Pointers

- `docs/proofs/hahn_valuation_axioms.md`
- `docs/proofs/no_go_raw_depth_as_integer_valuation.md`
- `docs/proofs/rdt_iterative_convergence_bound.md`
- `docs/proofs/dual_number_norm_and_calculus.md`
- `docs/proofs/hyperreal_tower_square_zero_extension.md`
- `docs/proofs/prime_weight_lift_clean_construction.md`

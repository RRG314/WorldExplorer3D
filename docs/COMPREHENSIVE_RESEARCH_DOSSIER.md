# Comprehensive RDT / Recursive-Adic Research Dossier

Generated: 2026-03-04T01:52:17+00:00

Primary quick-read for current status:
- `docs/first_task_findings_correctness.md` (what is correct, what fails, minimal repairs, and useful algorithm directions)

## 1) Executive Verdict

- Direct raw-depth integer valuation: **not valid** as a valuation (reconfirmed by expanded stress tests across alphas).
- True valuation structure: **valid** in Hahn-valued embedding framework.
- Dual numbers over valued base: **legitimate**.
- Hyperreal tower: **legitimate as commutative ring** (not a field).
- Novelty is defensible in verified constructions + computational methodology, not as a new direct integer valuation.

## 2) Reproducibility

```bash
python3 /Users/stevenreid/Documents/New\ project/tools/research_runner.py
```

## 3) Inputs and Ingestion

- docs/source/RDT_Preprint.pdf (pdf, lines=324, year_hint=2025)
- docs/source/The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf (pdf, lines=507, year_hint=2025)
- docs/source/_Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf (pdf, lines=387, year_hint=2025)
- docs/source/v.pdf (pdf, lines=217, year_hint=2025)
- Missing expected files:
  - RDT_Recursive_Adic_Number_Field_COMPLETE.docx

## 4) Canonical Definition Lock and Conflicts

| Core object | Canonical source | Signature | Why this lock |
|---|---|---|---|
| depth_function | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 1.1 (line 0) | `dp_split_min_alpha` | Recursive-Adic Definition 1.1 is the most complete depth formula tied to valuation/field sections in the same document. |
| valuation | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.1 (line 0) | `hahn_min_exponent` | Definition 3.1 gives a standard Hahn-series valuation with explicit axioms and proof appendix. |
| absolute_value | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.1 (line 0) | `rho_pow_v` | Absolute value is induced directly from the canonical valuation in Definition 3.1. |
| metric | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 2.1 (line 0) | `sigma_pow_depth_difference` | Definition 2.1 gives the stated integer metric used by the completion construction (verified separately for failures). |
| field_or_ring | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.2 (line 0) | `subfield_generated_by_phi` | Definition 3.2 is the explicit field-generation rule used for Q_R. |
| entropy_or_rec | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: 9 Discussion and Outlook (line 366) | `depth_entropy` | No single dominant explicit definition across all sources; treat as evolving extension area. |
## Recorded Conflicts
- `depth_function` has competing signatures: `dp_split_min_alpha`, `floor_log2_proxy`, `iterative_log_division_alpha`
- `valuation` has competing signatures: `embedded_depth_monomial`, `hahn_min_exponent`, `integer_depth_candidate`
- `field_or_ring` has competing signatures: `depth_indexed_nilpotent_tower`, `dual_number_extension`, `subfield_generated_by_phi`

## 5) Claim Status Summary

- Proven: 15
- Verified: 9
- Conjecture: 23

### Core Verified/Proven Highlights
- RDT convergence bound (n<=10000): True
- Twin-prime depth match (<=10000): 195/205 = 0.951220
- Mersenne condition tested list: True
- Goldbach inequality tested to even n<=2000: True
- Hahn valuation axioms: mult=True, ultra=True

## 6) Counterexamples and Repair Variants (Full)

### 1. derived::integer_depth_candidate_is_valuation
- Failed subclaim: v(xy)=v(x)+v(y)
- Smallest counterexample: `{"x": 2, "y": 2, "v_xy": 2.1111111111111107, "v_x_plus_v_y": 2.0}`
- Repair variants:
  - `repair_embedding_hahn`: Define valuation on embedded elements phi(n)=t^{R(n)} inside Q((t)), and use Hahn valuation. (retest_passed=True)
    - Details: `{"evidence": "results/tests_summary.json#hahn_valuation"}`
  - `repair_quasi_valuation`: Replace exact multiplicativity with bounded-defect condition |v(xy)-v(x)-v(y)|<=C_alpha over tested domain. (retest_passed=True)
    - Details: `{"tested_C_alpha": 2.9999999999998908, "tested_domain": "x,y in [1,79]", "evidence": "results/tests_summary.json#valuation_integer_dp"}`

### 2. derived::integer_depth_candidate_is_valuation
- Failed subclaim: v(x+y)>=min(v(x),v(y))
- Smallest counterexample: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`
- Repair variants:
  - `repair_embedding_hahn`: Define valuation on embedded elements phi(n)=t^{R(n)} inside Q((t)), and use Hahn valuation. (retest_passed=True)
    - Details: `{"evidence": "results/tests_summary.json#hahn_valuation"}`
  - `repair_quasi_valuation`: Replace exact multiplicativity with bounded-defect condition |v(xy)-v(x)-v(y)|<=C_alpha over tested domain. (retest_passed=True)
    - Details: `{"tested_C_alpha": 2.9999999999998908, "tested_domain": "x,y in [1,79]", "evidence": "results/tests_summary.json#valuation_integer_dp"}`

### 3. The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_2_2
- Failed subclaim: R(|a-c|) >= min(R(|a-b|), R(|b-c|)) and induced ultrametric
- Smallest counterexample: `{"a": 0, "b": -2, "c": 1, "R_abs_a_minus_c": 0.0, "min_R_segments": 1.0}`
- Repair variants:
  - `repair_pullback_metric`: Define d_phi(a,b)=|phi(a)-phi(b)|_R in Q((t)) instead of sigma^{R(|a-b|)} on integers. (retest_passed=True)
    - Details: `{"evidence": "results/tests_summary.json#hahn_valuation"}`

### 4. _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_4_2
- Failed subclaim: Refined formula matches known small perfect numbers exactly.
- Smallest counterexample: `{"n": 6, "actual_RDT": 2, "predicted_refined_fit": 1}`
- Repair variants:
  - `repair_shift_plus_one`: Use floor(1.45*ln ln n + 1.5) for small even perfect numbers. (retest_passed=True)
    - Details: `{"tested_set": [6, 28, 496, 8128]}`
  - `repair_empirical_affine_refit`: Refit affine form a*ln ln n + b on known perfect numbers, keep same functional family. (retest_passed=True)
    - Details: `{"fitted_parameters": {"a": 2.098, "b": -0.258}}`

## 7) Valuation and Number-Field Viability

- DP multiplicativity cex: `{"x": 2, "y": 2, "v_xy": 2.1111111111111107, "v_x_plus_v_y": 2.0}`
- Iterative multiplicativity cex: `{"x": 4, "y": 4, "v_xy": 3.0, "v_x_plus_v_y": 4.0}`
- Bounded-depth no-go verdict: `True`
- Number-field restriction: Any non-trivial non-Archimedean valuation on Q is p-adic up to equivalence (Ostrowski). For integer arithmetic map n->n, direct RDT depth cannot define a new valuation unless equivalent to c*nu_p.
- Viability verdict: Direct new valuation on Q/number fields from raw RDT depth appears not viable.
- Clean expansion candidate: Prime-weight additive lift A(n)=sum_p nu_p(n)*D(p)
- Lift multiplicative hom over N^x: True
- Lift ultrametric on integer addition: False
- Lift field realization: Define Gamma=<D(p):p prime>_Z, K=Q((t^Gamma)), and phi_A(n)=t^{A(n)}. Then v_t(phi_A(n))=A(n) with true Hahn valuation on K.

## 8) Dual and Hyperreal Legitimacy

- Dual ring axioms pass: True
- Dual norm pass: True
- Dual evaluation rule pass: True
- Hyperreal tower ring axioms pass: True
- Hyperreal tower epsilon relations pass: True
- Hyperreal tower norm pass: True
- Hyperreal tower field status: Contains non-zero nilpotent elements, so it is a commutative ring, not a field.

## 9) Expanded Cross-Checks in All Directions

### 9.1 Stress Across Definitions and Parameters
- dp_alpha_1.2: mult_pass=False, ultra_pass=False, mult_cex={'x': 2, 'y': 2, 'v_xy': 2.5277777777777777, 'v_x_plus_v_y': 2.0}, ultra_cex={'x': -2, 'y': 3, 'v_x_plus_y': 0.0, 'min_v': 1.0}
- dp_alpha_1.5: mult_pass=False, ultra_pass=False, mult_cex={'x': 2, 'y': 2, 'v_xy': 2.1111111111111107, 'v_x_plus_v_y': 2.0}, ultra_cex={'x': -2, 'y': 3, 'v_x_plus_y': 0.0, 'min_v': 1.0}
- dp_alpha_2.0: mult_pass=False, ultra_pass=False, mult_cex={'x': 2, 'y': 2, 'v_xy': 1.75, 'v_x_plus_v_y': 2.0}, ultra_cex={'x': -2, 'y': 3, 'v_x_plus_y': 0.0, 'min_v': 1.0}
- iter_alpha_1.2: mult_pass=False, ultra_pass=False, mult_cex={'x': 3, 'y': 3, 'v_xy': 3.0, 'v_x_plus_v_y': 2.0}, ultra_cex={'x': -2, 'y': 3, 'v_x_plus_y': 0.0, 'min_v': 1.0}
- iter_alpha_1.5: mult_pass=False, ultra_pass=False, mult_cex={'x': 4, 'y': 4, 'v_xy': 3.0, 'v_x_plus_v_y': 4.0}, ultra_cex={'x': -2, 'y': 3, 'v_x_plus_y': 0.0, 'min_v': 1.0}
- iter_alpha_1.8: mult_pass=False, ultra_pass=False, mult_cex={'x': 2, 'y': 4, 'v_xy': 2.0, 'v_x_plus_v_y': 3.0}, ultra_cex={'x': -2, 'y': 3, 'v_x_plus_y': 0.0, 'min_v': 1.0}
- iter_alpha_2.2: mult_pass=False, ultra_pass=False, mult_cex={'x': 3, 'y': 3, 'v_xy': 1.0, 'v_x_plus_v_y': 2.0}, ultra_cex={'x': -2, 'y': 3, 'v_x_plus_y': 0.0, 'min_v': 1.0}

### 9.2 Deep Dual/Hyperreal Recheck
- Dual legitimate: True
- Hyperreal ring legitimate: True
- Hyperreal is field: False

### 9.3 Growth / Transition Cross-Check
- Iterative depth fit y=a*loglog(n)+b on 199998 samples: a=2.001665, b=0.425852, R^2=0.174817
- Mean abs residual: 0.386717
- Max abs residual: 1.108731
- Transition points up to n=300000: [{'depth': 1, 'first_n': 2}, {'depth': 2, 'first_n': 4}, {'depth': 3, 'first_n': 8}, {'depth': 4, 'first_n': 64}, {'depth': 5, 'first_n': 1152}, {'depth': 6, 'first_n': 39168}]

### 9.4 Cross-check Against p-adic Templates
- family=dp_alpha_1.5, nu_2 fit: c=1.013321, mse=5.942806
- family=dp_alpha_1.5, nu_3 fit: c=1.534351, mse=6.684893
- family=dp_alpha_1.5, nu_5 fit: c=2.048893, mse=7.443240
- family=dp_alpha_1.5, nu_7 fit: c=2.301241, mse=7.829922
- family=iter_alpha_1.5, nu_2 fit: c=1.320701, mse=10.151937
- family=iter_alpha_1.5, nu_3 fit: c=1.988832, mse=11.454879
- family=iter_alpha_1.5, nu_5 fit: c=2.662844, mse=12.715365
- family=iter_alpha_1.5, nu_7 fit: c=2.976744, mse=13.386550
Result: strong mismatch with scaled p-adic templates.

### 9.5 Prime-Weight Lift Deep Checks
- Multiplicative hom on N^x (<=400): True
- Integer ultrametric addition holds: False
- Hahn embedding multiplicativity random pass: True

### 9.6 External-Theory Consistency Anchors
- Classification of non-trivial absolute values on Q (Ostrowski). | https://en.wikipedia.org/wiki/Ostrowski%27s_theorem | consistent=True
- Hahn valuation is defined by minimum exponent in series support. | https://en.wikipedia.org/wiki/Hahn_series | consistent=True
- Dual/square-zero constructions produce commutative rings with nilpotents, not fields. | https://en.wikipedia.org/wiki/Dual_number | consistent=True

## 10) Complete Claims Registry (All Extracted Claims)

| Claim ID | Label | Type | Status | Source | Note |
|---|---|---|---|---|---|
| RDT_Preprint::definition_2_1 | Definition 2.1 (Recursive Division Tree) | definition | Proven | RDT_Preprint.pdf:34 | Stipulative definition anchored to source text. |
| RDT_Preprint::observation_4_5 | Observation 4.5 (Let τ (n) be the number of divisors of n. For highly composite numbers,) | theorem | Conjecture | RDT_Preprint.pdf:200 | Not fully proven or fully falsified in this automated run. |
| RDT_Preprint::observation_4_6 | Observation 4.6 (≈ 2.5 for large n.) | theorem | Conjecture | RDT_Preprint.pdf:224 | Not fully proven or fully falsified in this automated run. |
| RDT_Preprint::observation_4_7 | Observation 4.7 (The depth transition points grow super-exponentially. Approximately:) | theorem | Conjecture | RDT_Preprint.pdf:235 | Not fully proven or fully falsified in this automated run. |
| RDT_Preprint::theorem_3_1 | Theorem 3.1 (Convergence) | theorem | Proven | RDT_Preprint.pdf:58 | Formal proof file plus exhaustive computational confirmation to n<=10000. |
| RDT_Preprint::theorem_3_2 | Theorem 3.2 (Asymptotic Growth) | theorem | Conjecture | RDT_Preprint.pdf:65 | Not fully proven or fully falsified in this automated run. |
| RDT_Preprint::theorem_3_3 | Theorem 3.3 (Upper Bound) | theorem | Conjecture | RDT_Preprint.pdf:81 | Not fully proven or fully falsified in this automated run. |
| RDT_Preprint::theorem_3_4 | Theorem 3.4 (Factorization Independence) | theorem | Conjecture | RDT_Preprint.pdf:93 | Not fully proven or fully falsified in this automated run. |
| RDT_Preprint::theorem_4_1 | Theorem 4.1 (Twin Prime RDT Property) | theorem | Verified | RDT_Preprint.pdf:115 | Verified by exhaustive twin-prime scan up to 10,000 (95.12% match). |
| RDT_Preprint::theorem_4_2 | Theorem 4.2 (Perfect Number Formula) | theorem | Conjecture | RDT_Preprint.pdf:132 | Refined fit statement is falsified on the first perfect number n=6. |
| RDT_Preprint::theorem_4_3 | Theorem 4.3 (Mersenne Prime Depth) | theorem | Verified | RDT_Preprint.pdf:156 | Verified for known small Mersenne-prime exponents [2,3,5,7,13,17,19,31]. |
| RDT_Preprint::theorem_4_4 | Theorem 4.4 (Goldbach RDT Inequality) | theorem | Verified | RDT_Preprint.pdf:182 | No counterexample found up to even n<=2000 over all Goldbach partitions. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::definition_1_1 | Definition 1.1 (RDT Depth) | definition | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:51 | Stipulative definition anchored to source text. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::definition_2_1 | Definition 2.1 (RDT Depth and Ultrametric) | definition | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:96 | Stipulative definition anchored to source text. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::definition_3_1 | Definition 3.1 (Valued Field Embedding) | definition | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:159 | Stipulative definition anchored to source text. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::definition_3_2 | Definition 3.2 (Recursive-Adic Embedding) | definition | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:169 | Stipulative definition anchored to source text. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::definition_5_1 | Definition 5.1 (Classical Completions) | definition | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:277 | Stipulative definition anchored to source text. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::definition_6_1 | Definition 6.1 (Fix ρ ∈ (0, 1), σ > 1, s ≥ 0.) | definition | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:292 | Stipulative definition anchored to source text. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::definition_6_2 | Definition 6.2 (For f : N → C with /f (n)/ < ∞, define) | definition | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:315 | Stipulative definition anchored to source text. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::lemma_2_1 | Lemma 2.1 (Strong Triangle Inequality) | lemma | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:104 | Not fully proven or fully falsified in this automated run. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::proposition_5_1 | Proposition 5.1 (Non-isomorphism with Qp) | theorem | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:281 | Not fully proven or fully falsified in this automated run. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::proposition_5_2 | Proposition 5.2 (Hahn-Field Realization) | theorem | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:285 | Not fully proven or fully falsified in this automated run. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_2_2 | Theorem 2.2 (Ultrametric Inequality) | theorem | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:108 | Current formula fails computationally on small integers; see counterexamples. Counterexample recorded. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_2_3 | Theorem 2.3 (Completion of the Integers) | theorem | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:138 | Not fully proven or fully falsified in this automated run. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_3_1 | Theorem 3.1 (The pair (QR , v) forms a non-Archimedean valued field satisfying) | theorem | Proven | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:174 | Inherited directly from Hahn valuation axioms in the ambient field. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_4_1 | Theorem 4.1 (Saturation) | theorem | Verified | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:203 | Numerically verified convergence trend to alpha/(alpha-1) for sampled n. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_6_1 | Theorem 6.1 (Convergence and Properties) | theorem | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:299 | Not fully proven or fully falsified in this automated run. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_6_2 | Theorem 6.2 (Absolute Convergence and Monotonicity) | theorem | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:321 | Not fully proven or fully falsified in this automated run. |
| The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_8_1 | Theorem 8.1 (Complexity Bounds) | theorem | Conjecture | The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf:344 | Not fully proven or fully falsified in this automated run. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::definition_2_1 | Definition 2.1 (Recursive Division Tree) | definition | Proven | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:36 | Stipulative definition anchored to source text. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::observation_4_5 | Observation 4.5 (Let τ (n) be the number of divisors of n. For highly composite numbers,) | theorem | Conjecture | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:229 | Not fully proven or fully falsified in this automated run. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::observation_4_6 | Observation 4.6 | theorem | Conjecture | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:254 | Not fully proven or fully falsified in this automated run. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::observation_4_7 | Observation 4.7 (The depth transition points grow super-exponentially. Approximately:) | theorem | Conjecture | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:268 | Not fully proven or fully falsified in this automated run. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_3_1 | Theorem 3.1 (Convergence) | theorem | Proven | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:65 | Formal proof file plus exhaustive computational confirmation to n<=10000. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_3_2 | Theorem 3.2 (Asymptotic Growth) | theorem | Conjecture | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:73 | Not fully proven or fully falsified in this automated run. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_3_3 | Theorem 3.3 (Upper Bound) | theorem | Conjecture | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:87 | Not fully proven or fully falsified in this automated run. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_3_4 | Theorem 3.4 (Factorization Independence) | theorem | Conjecture | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:100 | Not fully proven or fully falsified in this automated run. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_4_1 | Theorem 4.1 (Twin Prime RDT Property) | theorem | Verified | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:122 | Verified by exhaustive twin-prime scan up to 10,000 (95.12% match). |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_4_2 | Theorem 4.2 (Perfect Number Formula) | theorem | Conjecture | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:147 | Refined fit statement is falsified on the first perfect number n=6. Counterexample recorded. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_4_3 | Theorem 4.3 (Mersenne Prime Depth) | theorem | Verified | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:171 | Verified for known small Mersenne-prime exponents [2,3,5,7,13,17,19,31]. |
| _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_4_4 | Theorem 4.4 (Goldbach RDT Inequality) | theorem | Verified | _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf:204 | No counterexample found up to even n<=2000 over all Goldbach partitions. |
| derived::integer_depth_candidate_is_valuation | Derived valuation candidate (from v.pdf prose) | theorem | Conjecture | v.pdf:53 | Fails multiplicativity and ultrametric axioms on small counterexamples. Counterexample recorded. |
| v::definition_1 | Definition 1 (The ring of recursive dual numbers is) | definition | Proven | v.pdf:59 | Stipulative definition anchored to source text. |
| v::definition_2 | Definition 2 (The RDT–hyperreal ring is) | definition | Proven | v.pdf:118 | Stipulative definition anchored to source text. |
| v::proposition_1 | Proposition 1 (∥ · ∥R is a non–Archimedean norm on K[εR ].) | theorem | Proven | v.pdf:73 | Proven for K[epsilon]/(epsilon^2) over the Hahn-valued base; computational checks also pass. |
| v::proposition_2 | Proposition 2 (Dual Evaluation Rule) | theorem | Verified | v.pdf:84 | Verified/proved for polynomials; extension to broader analytic classes requires explicit convergence assumptions. |
| v::proposition_3 | Proposition 3 (This is a non–Archimedean norm on HR .) | theorem | Verified | v.pdf:134 | Valid under a consistent square-zero tower model; this structure is a ring (not a field). |

## 11) Prior-Art Citations (Full)

## 1. A non-Archimedean Arens--Eells isometric embedding theorem on valued fields
- Source: Seed
- Query: manual seed
- Link: http://arxiv.org/abs/2309.06704
- Summary: Proves non-Archimedean analogue of Arens--Eells embedding: ultrametric spaces embed into valued-field extensions.
- Similarity notes: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
- Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
- Possible equivalence: no
## 2. On non-archimedean frames
- Source: arXiv
- Query: non-Archimedean valuation from algorithmic complexity
- Link: http://arxiv.org/abs/2311.18095v3
- Summary: In this investigation, we introduce the class of non-archimedean frames in spirit with the topological notion of non-archimedean spaces. We explore various properties of these frames - particularly their spaciality. We attach a base that constitutes a tree to each non-archimedean frame, and then we observe that every non-archimedean frame is a quotient of the frame of opens of the tree's branch space. Moreover, we give a partial answer to when these frames are canonically isomorphic; this leads to considering some choice principles of the resulting tree.
- Similarity notes: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
- Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
- Possible equivalence: no
## 3. Ultrametric Cantor Sets and Growth of Measure
- Source: arXiv
- Query: ultrametric induced by recursion division depth
- Link: http://arxiv.org/abs/1002.3951v4
- Summary: A class of ultrametric Cantor sets $(C, d_{u})$ introduced recently in literature (Raut, S and Datta, D P (2009), Fractals, 17, 45-52) is shown to enjoy some novel properties. The ultrametric $d_{u}$ is defined using the concept of {\em relative infinitesimals} and an {\em inversion} rule. The associated (infinitesimal) valuation which turns out to be both scale and reparametrisation invariant, is identified with the Cantor function associated with a Cantor set $\tilde C$ where the relative infinitesimals are supposed to live in. These ultrametrics are b
- Similarity notes: Shares valuation-theoretic and non-Archimedean foundations.
- Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
- Possible equivalence: no
## 4. P-adic valuation
- Source: Wikipedia
- Query: p-adic valuation
- Link: https://en.wikipedia.org/wiki/P-adic_valuation
- Summary: Highest power of p dividing a given number
- Similarity notes: Shares valuation-theoretic and non-Archimedean foundations.
- Key difference: Classical p-adic valuation is prime-divisibility based, not recursive-depth based.
- Possible equivalence: no
## 5. Valuation (algebra)
- Source: Wikipedia
- Query: p-adic valuation
- Link: https://en.wikipedia.org/wiki/Valuation_(algebra)
- Summary: Function in algebra
- Similarity notes: Shares valuation-theoretic and non-Archimedean foundations.
- Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
- Possible equivalence: no
## 6. Ultrametric space
- Source: Wikipedia
- Query: ultrametric space
- Link: https://en.wikipedia.org/wiki/Ultrametric_space
- Summary: Type of metric space
- Similarity notes: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
- Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
- Possible equivalence: no
## 7. Hahn series
- Source: Wikipedia
- Query: Hahn series
- Link: https://en.wikipedia.org/wiki/Hahn_series
- Summary: Mathematical formal infinite series
- Similarity notes: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
- Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
- Possible equivalence: no
## Access Notes
- google_scholar: No official public API; this run uses OpenAlex/arXiv/Wikipedia endpoints for reproducible retrieval.
- zbmath_mathscinet: Programmatic access not available in this environment; manual follow-up recommended for final publication clearance.

## 12) Clean Mathematical Foundation (Recommended Final Form)

1. Raw RDT depth D(n) is a depth/complexity invariant, not a direct valuation on integer arithmetic.
2. True valuation statements live in Hahn-valued embedding frameworks.
3. Dual numbers: K[epsilon]/(epsilon^2) with max norm extension.
4. Hyperreal tower: square-zero depth-indexed ring extension; not a field.
5. Every theorem remains labeled Proven / Verified / Conjecture with evidence pointers.

## 13) Expansion Toward Discovery/Novelty

1. Prove stability/invariance for depth-seeded embeddings under alpha/weight perturbations.
2. Develop analytic objects on valued side (depth-zeta, depth-Laplace, residues/poles).
3. Quantify classes where raw D(n) and lifted A(n) diverge most.
4. Use dual/hyperreal layers for sensitivity calculus and predictive asymptotics.
5. Keep novelty claims anchored to verified constructions and reproducible computation.

## 14) Artifact Index

- docs/research_master_report.md
- docs/valuation_viability_report.md
- docs/expanded_crosscheck_report.md
- docs/DEFINITION_LOCK.md
- docs/citation_log.md
- results/claims_registry.json
- results/tests_summary.json
- results/counterexamples.json
- docs/proofs/hahn_valuation_axioms.md
- docs/proofs/rdt_iterative_convergence_bound.md
- docs/proofs/dual_number_norm_and_calculus.md
- docs/proofs/hyperreal_tower_square_zero_extension.md
- docs/proofs/no_go_raw_depth_as_integer_valuation.md
- docs/proofs/prime_weight_lift_clean_construction.md
- src/spec/canonical.py
- src/spec/history.py
- src/spec/extensions.py
- tools/research_runner.py

# Research Master Report

Generated: 2026-03-04T01:51:03+00:00

## 0) Document Ingestion

- Ingested files: 4
- docs/source/RDT_Preprint.pdf (pdf, lines=324)
- docs/source/The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf (pdf, lines=507)
- docs/source/_Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf (pdf, lines=387)
- docs/source/v.pdf (pdf, lines=217)
- Missing expected files:
  - RDT_Recursive_Adic_Number_Field_COMPLETE.docx

## 1) What Is Defined

Core objects tracked: depth function `D(n)`/`R(n)`, valuation candidates `v`, induced absolute value `|.|`, metric `d`, and field/ring constructions.

### Definition Timeline (Changes Across Documents)

- **depth_function**
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 1.1 (line 0) -> `dp_split_min_alpha`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 1.1 (RDT Depth). For n ≥ 1 and parameter α > 0: (line 53) -> `dp_split_min_alpha`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Theorem 4.1 (Saturation). Let α > 1, and define the recursive depth function R(n) by: (line 206) -> `dp_split_min_alpha`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Theorem A.2 (Completeness). (Q((t)), | · |R ) is complete. (line 446) -> `dp_split_min_alpha`
  - v.pdf :: Section 3.6 (line 0) -> `floor_log2_proxy`
  - v.pdf :: 3.6 Perturbation of Depth Transforms (line 185) -> `floor_log2_proxy`
  - _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf :: Definition 2.1 (line 0) -> `iterative_log_division_alpha`
  - _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf :: Definition 2.1 (Recursive Division Tree). For a positive integer n ≥ 2 and parameter α > 0, define (line 41) -> `iterative_log_division_alpha`
  - _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf :: Theorem 3.1 (Convergence). For all n ≥ 2, the RDT algorithm terminates in finite steps. In fact, (line 66) -> `iterative_log_division_alpha`
  - _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf :: Theorem 3.2 (Asymptotic Growth). For large n, the RDT depth grows logarithmically with log n. (line 75) -> `iterative_log_division_alpha`
  - RDT_Preprint.pdf :: Definition 2.1 (line 0) -> `iterative_log_division_alpha`
  - RDT_Preprint.pdf :: Definition 2.1 (Recursive Division Tree) (line 38) -> `iterative_log_division_alpha`
  - RDT_Preprint.pdf :: Theorem 3.1 (Convergence).** For all n ≥ 2, the RDT algorithm terminates in finite steps. In (line 60) -> `iterative_log_division_alpha`
  - RDT_Preprint.pdf :: Theorem 3.2 (Asymptotic Growth)**. For large n, the RDT depth grows logarithmically with (line 69) -> `iterative_log_division_alpha`
- **valuation**
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.1 (line 0) -> `hahn_min_exponent`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.2 (line 0) -> `embedded_depth_monomial`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.2 (Recursive-Adic Embedding). Define φ : N+ → Q((t))× by φ(n) = tR(n) . Set QR (line 172) -> `embedded_depth_monomial`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Proposition 5.1 (Non-isomorphism with Qp ). (QR , v) is not topologically isomorphic to any Qp . (line 282) -> `embedded_depth_monomial`
  - v.pdf :: Section 1 intro (line 0) -> `integer_depth_candidate`
  - v.pdf :: 1 Recursive Dual Numbers (line 54) -> `integer_depth_candidate`
- **absolute_value**
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.1 (line 0) -> `rho_pow_v`
- **metric**
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 2.1 (line 0) -> `sigma_pow_depth_difference`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Theorem A.2 (Completeness). (Q((t)), | · |R ) is complete. (line 455) -> `sigma_pow_depth_difference`
- **field_or_ring**
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.2 (line 0) -> `subfield_generated_by_phi`
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: Definition 3.2 (Recursive-Adic Embedding). Define φ : N+ → Q((t))× by φ(n) = tR(n) . Set QR (line 170) -> `subfield_generated_by_phi`
  - v.pdf :: Definition 1 (line 0) -> `dual_number_extension`
  - v.pdf :: Definition 2 (line 0) -> `depth_indexed_nilpotent_tower`
  - v.pdf :: (no heading) (line 1) -> `depth_indexed_nilpotent_tower`
  - v.pdf :: 2 The RDT–Hyperreal Numbers 3 (line 34) -> `depth_indexed_nilpotent_tower`
  - v.pdf :: 2 The RDT–Hyperreal Numbers (line 109) -> `depth_indexed_nilpotent_tower`
  - v.pdf :: Definition 2. The RDT–hyperreal ring is (line 118) -> `depth_indexed_nilpotent_tower`
  - v.pdf :: 4 Conclusion (line 197) -> `depth_indexed_nilpotent_tower`
- **entropy_or_rec**
  - The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf :: 9 Discussion and Outlook (line 366) -> `depth_entropy`
  - _Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth.pdf :: 6 Conclusion (line 344) -> `depth_entropy`

### Canonical Definitions Chosen

- `depth_function` locked to `dp_split_min_alpha` from `The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf` (Definition 1.1, line 0).
- `valuation` locked to `hahn_min_exponent` from `The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf` (Definition 3.1, line 0).
- `absolute_value` locked to `rho_pow_v` from `The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf` (Definition 3.1, line 0).
- `metric` locked to `sigma_pow_depth_difference` from `The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf` (Definition 2.1, line 0).
- `field_or_ring` locked to `subfield_generated_by_phi` from `The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf` (Definition 3.2, line 0).
- `entropy_or_rec` locked to `depth_entropy` from `The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1).pdf` (9 Discussion and Outlook, line 366).

### Conflicts

- `depth_function` has conflicting signatures: dp_split_min_alpha, floor_log2_proxy, iterative_log_division_alpha.
- `valuation` has conflicting signatures: embedded_depth_monomial, hahn_min_exponent, integer_depth_candidate.
- `field_or_ring` has conflicting signatures: depth_indexed_nilpotent_tower, dual_number_extension, subfield_generated_by_phi.

## 2) Proven vs Verified vs Conjecture

- Proven: 15
- Verified: 9
- Conjecture: 23

Formal proofs written:
- docs/proofs/hahn_valuation_axioms.md
- docs/proofs/rdt_iterative_convergence_bound.md
- docs/proofs/dual_number_norm_and_calculus.md
- docs/proofs/hyperreal_tower_square_zero_extension.md
- docs/proofs/no_go_raw_depth_as_integer_valuation.md
- docs/proofs/prime_weight_lift_clean_construction.md

Key verification outputs are stored in `results/tests_summary.json`.

## 3) Counterexamples

- Claim `derived::integer_depth_candidate_is_valuation` failed subclaim: v(xy)=v(x)+v(y)
  - Smallest counterexample: `{"v_x_plus_v_y": 2.0, "v_xy": 2.1111111111111107, "x": 2, "y": 2}`
  - Repair variant `repair_embedding_hahn`: Define valuation on embedded elements phi(n)=t^{R(n)} inside Q((t)), and use Hahn valuation. (retest_passed=True)
  - Repair variant `repair_quasi_valuation`: Replace exact multiplicativity with bounded-defect condition |v(xy)-v(x)-v(y)|<=C_alpha over tested domain. (retest_passed=True)
- Claim `derived::integer_depth_candidate_is_valuation` failed subclaim: v(x+y)>=min(v(x),v(y))
  - Smallest counterexample: `{"min_v": 1.0, "v_x_plus_y": 0.0, "x": -2, "y": 3}`
  - Repair variant `repair_embedding_hahn`: Define valuation on embedded elements phi(n)=t^{R(n)} inside Q((t)), and use Hahn valuation. (retest_passed=True)
  - Repair variant `repair_quasi_valuation`: Replace exact multiplicativity with bounded-defect condition |v(xy)-v(x)-v(y)|<=C_alpha over tested domain. (retest_passed=True)
- Claim `The_Recursive_Adic_Number_Field__Construction__Analysis__and_Recursive_Depth_Transforms (1)::theorem_2_2` failed subclaim: R(|a-c|) >= min(R(|a-b|), R(|b-c|)) and induced ultrametric
  - Smallest counterexample: `{"R_abs_a_minus_c": 0.0, "a": 0, "b": -2, "c": 1, "min_R_segments": 1.0}`
  - Repair variant `repair_pullback_metric`: Define d_phi(a,b)=|phi(a)-phi(b)|_R in Q((t)) instead of sigma^{R(|a-b|)} on integers. (retest_passed=True)
- Claim `_Recursive_Division_Tree__A_Log_Log_Algorithm_for_Integer_Depth::theorem_4_2` failed subclaim: Refined formula matches known small perfect numbers exactly.
  - Smallest counterexample: `{"actual_RDT": 2, "n": 6, "predicted_refined_fit": 1}`
  - Repair variant `repair_shift_plus_one`: Use floor(1.45*ln ln n + 1.5) for small even perfect numbers. (retest_passed=True)
  - Repair variant `repair_empirical_affine_refit`: Refit affine form a*ln ln n + b on known perfect numbers, keep same functional family. (retest_passed=True)

## 4) Verification Results (Axioms, Theorems, Failures)

- Integer candidate valuation (`v(n)=R(n)`, DP depth):
  - Multiplicativity exhaustive pass: False
  - Ultrametric exhaustive pass: False
- Integer candidate valuation (`v(n)=RDT(n)`, iterative depth):
  - Multiplicativity exhaustive pass: False
  - Ultrametric exhaustive pass: False
- Hahn valuation in Q((t)):
  - Multiplicativity pass: True
  - Ultrametric pass: True
- Recursive-Adic integer ultrametric theorem pass: False
- Twin-prime depth match rate (iterative RDT): 0.95122
- Goldbach inequality pass up to 2000: True
- Dual numbers K[epsilon]/(epsilon^2):
  - Ring axioms pass: True
  - Norm properties pass: True
  - Dual evaluation rule (polynomials) pass: True
- Depth-indexed hyperreal tower:
  - Ring axioms pass: True
  - Epsilon relations pass: True
  - Norm properties pass: True
  - Structural note: legitimate as a ring; not a field due to nonzero nilpotents.

## 5) Valuation/Number-Field Viability

- Direct raw-depth valuation on integers:
  - DP depth multiplicativity counterexample: {"x": 2, "y": 2, "v_xy": 2.1111111111111107, "v_x_plus_v_y": 2.0}
  - Iterative depth multiplicativity counterexample: {"x": 4, "y": 4, "v_xy": 3.0, "v_x_plus_v_y": 4.0}
  - Bounded-depth obstruction verdict: True
- Number field viability verdict:
  - Direct new valuation on Q/number fields from raw RDT depth appears not viable.
- Clean expansion candidate:
  - Prime-weight additive lift A(n)=sum_p nu_p(n)*D(p)
  - Multiplicative hom on Nx: True
  - Ultrametric on integer addition: False
  - Field realization: K=Q((t^Gamma)) with Hahn valuation on lifted embedding.

## 6) Top 3 Extension Candidates

1. dp_alpha_1.2 | correctness=0.5069, distinctness=1.0000, usefulness=0.2125, aggregate=0.5960
2. iterative_alpha_1.5 | correctness=0.7215, distinctness=0.1889, usefulness=0.5402, aggregate=0.5255
3. dp_alpha_2.0 | correctness=0.5934, distinctness=0.4900, usefulness=0.0841, aggregate=0.4605

## 7) Prior-Art Scan (Closest Matches + Differences)

1. A non-Archimedean Arens--Eells isometric embedding theorem on valued fields
   - Link: http://arxiv.org/abs/2309.06704
   - Similarity: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
   - Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
2. On non-archimedean frames
   - Link: http://arxiv.org/abs/2311.18095v3
   - Similarity: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
   - Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
3. Ultrametric Cantor Sets and Growth of Measure
   - Link: http://arxiv.org/abs/1002.3951v4
   - Similarity: Shares valuation-theoretic and non-Archimedean foundations.
   - Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
4. P-adic valuation
   - Link: https://en.wikipedia.org/wiki/P-adic_valuation
   - Similarity: Shares valuation-theoretic and non-Archimedean foundations.
   - Key difference: Classical p-adic valuation is prime-divisibility based, not recursive-depth based.
5. Valuation (algebra)
   - Link: https://en.wikipedia.org/wiki/Valuation_(algebra)
   - Similarity: Shares valuation-theoretic and non-Archimedean foundations.
   - Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
6. Ultrametric space
   - Link: https://en.wikipedia.org/wiki/Ultrametric_space
   - Similarity: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
   - Key difference: No explicit RDT depth recurrence/embedding pair found in this source.
7. Hahn series
   - Link: https://en.wikipedia.org/wiki/Hahn_series
   - Similarity: Related to non-Archimedean/ultrametric structures or hierarchical depth ideas.
   - Key difference: No explicit RDT depth recurrence/embedding pair found in this source.

## 8) What Is New Here (Evidence-Based)

Current evidence supports these bounded claims:
- New in this workspace: a reproducible audit pipeline that extracts claims/definitions, tests valuation-style axioms, and logs counterexamples with repair variants.
- The embedding-based valuation checks in Q((t)) are computationally consistent with standard Hahn valuation axioms.
- Some headline statements in source drafts are falsified as written (integer ultrametric claim under DP depth; refined perfect-number fit), so novelty should be framed as method/prototype plus corrected variants, not as settled new theory.

If strong overlap with established p-adic/ultrametric literature is later confirmed, contributions should be framed as:
- new computational parameterization,
- new empirical search/benchmark tooling,
- and/or application-level evidence.

# Recursive Geometric Entropy / REC Math Audit (Prove-Disprove-Fix)

## Scope
- Zenodo 17862831: Recursive Entropy Calculus (REC)
- Zenodo 17882310: Recursive Geometric Entropy (RGE)
- Zenodo 17783084: Affine Digit-Linear Transforms
- Method: formal proof checks plus deterministic computational verification

## Verdict Summary
- `REC-A` [Proven] Normalized entropy ceiling S(d)/d <= 1 for binary depth d. | evidence: Classical max-entropy bound over 2^d outcomes; no violations in random recursive trials.
- `REC-B` [Disproven] Growth ceiling r_tilde(d)=S(d+1)/S(d) <= 2 for all recursive partitions. | evidence: Counterexample at d=1 with p=1/3: S1=0.918296, S2=1.918296, ratio=2.088974 | repair: Replace with sharp bound r_tilde(d) <= 1 + 1/S(d) (binary, S(d)>0).
- `REC-C` [Proven (with domain condition)] Asymptotic ratio r_tilde(d) tends to 1. | evidence: Direct proof via bounded increment Delta(d) in [0,1] and ratio identity r=1+Delta/S(d). | repair: State explicitly that r_tilde(d) is only defined on depths where S(d)>0.
- `REC-D` [Proven] For volume-convergent recursion, zeta=d_H/D <= 1. | evidence: Equivalent algebraic rearrangement of Ns^D <= 1 with s in (0,1).
- `RGE-OFFSETS` [Verified] Closed-form offsets for disk/sphere/cone are correct. | evidence: Independent numerical integration matches all three constants to 1e-4 or better.
- `RGE-SLOPE` [Proven] Radial shell slope C=1 and congruent slope C=log2(b). | evidence: Follows directly from Nd growth definitions and verified in depth-fit experiments.
- `RGE-ADDITIVE` [Proven (model-specific)] Additivity C=sum_i log2(b_i) for independent orthogonal refinements. | evidence: True for explicit product partitions; current manuscript already notes missing general geometric proof. | repair: Retitle as theorem under explicit independence assumptions, conjecture otherwise.
- `ADLT-AFFINE` [Verified] Digit-linear map collapses to affine form An+C. | evidence: Randomized algebraic checks: 500/500 passed.
- `ADLT-ITER` [Verified] Closed form of affine iterates is correct. | evidence: Randomized iterate checks: 500/500 passed.
- `ADLT-PERIOD` [Verified] Sequence X_n=(A n + C) mod m has period m/gcd(A,m). | evidence: Randomized period checks: 500/500 passed.

## What Is Correct
- REC Theorem A (`S(d) <= d` for binary depth `d`) is mathematically correct and verified numerically.
- REC Theorem D (`zeta = d_H/D <= 1` under `N s^D <= 1`) is mathematically equivalent to the convergence assumption and is correct.
- RGE asymptotic law `S(d)=C d + h + o(1)` is consistent with the shell computations, and the closed-form offsets for disk/sphere/cone match numerical integration.
- RGE radial-shell slope `C=1` and congruent split slope `C=log2(b)` are correct under their explicit subdivision models.
- Affine digit-linear collapse (`T(n)=An+C`) and iterate closed form are correct and passed randomized algebraic checks.

## What Is Wrong (with Counterexample)
- REC Theorem B as stated (`r_tilde(d)=S(d+1)/S(d) <= 2` for all recursive partitions) is false.
- Smallest explicit counterexample found: depth `d=1`, split probability `p=1/3` at depth 1, then uniform child splits at depth 2.
- Values: `S(1)=0.918296`, `S(2)=1.918296`, so `r_tilde(1)=2.088974 > 2`.
- Cause: denominator `S(d)` can be arbitrarily small while one-step increment is bounded above by 1 bit.

## Minimal Repairs (Mathematically Clean)
1. Replace REC Theorem B with the sharp bound:
   - For binary recursive partitions and `S(d)>0`,
   - `r_tilde(d) = 1 + (S(d+1)-S(d))/S(d) <= 1 + 1/S(d)`. 
   - This bound is attained when each depth-`d` cell splits uniformly at depth `d+1`.
2. Keep a conditional `r_tilde(d) <= 2` corollary only when `S(d) >= 1`.
3. Refine REC Theorem C domain: ratio is defined only when `S(d)>0`; deterministic zero-entropy trees are excluded.
4. Replace the Fekete-based existence argument with a direct ratio proof using bounded increments:
   - `0 <= Delta(d+1) <= 1`, `r_tilde(d)=1+Delta(d+1)/S(d)`.
   - If `S(d)->infinity`, ratio tends to 1 immediately.
   - If `S(d)` is bounded and positive, then `Delta(d)->0` and ratio still tends to 1.
5. Relabel RGE Proposition 15 as either:
   - Theorem under an explicit product-partition independence model, or
   - Conjecture in the general geometric setting (current text already hints this).

## Quantitative Checks
- Random recursive trees tested for Theorem A: `300` trials up to depth `14`, violations: `0`.
- Random recursive trees tested for Theorem C trend: `200` trials, median final ratio `r_tilde(d_max)=1.076200`.
- Disk offset (analytic vs numeric): `-0.278652` vs `-0.278652`.
- Sphere offset (analytic vs numeric): `-0.623166` vs `-0.623166`.
- Cone offset (analytic vs numeric): `-0.180471` vs `-0.180471`.
- Fitted radial-shell slope window (depth 6..14): disk `0.999984`, sphere `0.999986`, cone `0.999934`.

## Candidate Theorems for Corrected Paper
1. `S(d+1)-S(d) <= log2 b` (already true by chain rule and conditional entropy bound).
2. For binary trees with `S(d)>0`: `r_tilde(d) <= 1 + 1/S(d)` (sharp, replaces false global 2-bound).
3. If `S(d)>0` for all sufficiently large `d`, then `r_tilde(d)->1`.
4. For radial shell discretizations with smooth positive density `f`, empirical error is exponentially decaying in depth (stronger than the stated `O(1/d)` claim).

## Notes on Publishable Framing
- Keep the novelty claim focused on geometric specialization and computable invariants (`h_Omega`) instead of universal entropy-growth bounds that are false without extra assumptions.
- Mark resonance-style statements as conjectural unless tied to explicit physical models and data.
- Distinguish clearly between proven statements, computational validations, and open extensions.

## Generated Draft Files
- Corrected manuscript draft (LaTeX): `/Users/stevenreid/Documents/New project/docs/source/zenodo_rge/REC_preprint_corrected_v3.tex`
- Standalone theorem appendix (LaTeX): `/Users/stevenreid/Documents/New project/docs/source/zenodo_rge/REC_theorem_appendix_v3.tex`
- Corrected RGE manuscript draft (LaTeX): `/Users/stevenreid/Documents/New project/docs/source/zenodo_rge/RGE_preprint_corrected_v3.tex`

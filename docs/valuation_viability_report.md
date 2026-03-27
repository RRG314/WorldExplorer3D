# Valuation and Clean Expansion Report

Generated: 2026-03-04T01:51:03+00:00

## Decision Summary

- Raw RDT depth as a direct valuation on integer arithmetic: **not viable**.
- New non-Archimedean valuation on number fields from raw integer depth: **not viable as stated**.
- Mathematically clean, publishable core: **viable** via Hahn-valued embeddings + verified dual/hyperreal extensions (ring-level for hyperreal tower).

## Why Direct Valuation Fails

- DP depth multiplicativity counterexample: `{"x": 2, "y": 2, "v_xy": 2.1111111111111107, "v_x_plus_v_y": 2.0}`
- Iterative depth multiplicativity counterexample: `{"x": 4, "y": 4, "v_xy": 3.0, "v_x_plus_v_y": 4.0}`
- Bounded-depth obstruction (DP depth): `True`

## Number-Field Constraint

- Any non-trivial non-Archimedean valuation on Q is p-adic up to equivalence (Ostrowski). For integer arithmetic map n->n, direct RDT depth cannot define a new valuation unless equivalent to c*nu_p.
- Practical implication: direct `n -> n` arithmetic cannot carry a new RDT valuation unless equivalent to p-adic behavior.

## Clean Expansion That Is Correct

- Construction: `Prime-weight additive lift A(n)=sum_p nu_p(n)*D(p)`
- Multiplicative homomorphism over positive integers: `True`
- As an integer valuation (addition ultrametric): `False`
- Realization: Define Gamma=<D(p):p prime>_Z, K=Q((t^Gamma)), and phi_A(n)=t^{A(n)}. Then v_t(phi_A(n))=A(n) with true Hahn valuation on K.

## Dual and Hyperreal Legitimacy

- Dual numbers legitimate over Hahn-valued base: `True`
- Hyperreal tower legitimate as ring: `True`
- Hyperreal tower is field: `False`

## Expansion Program Toward Discovery/Novelty

1. Prove stability/invariance results for depth-driven embeddings (e.g., perturbation of D on primes and induced valuation spectra).
2. Build arithmetic diagnostics comparing raw D(n) vs lifted A(n) and identify where they diverge most (novel structure classes).
3. Develop analytic objects on the valued side (depth-zeta, depth-Laplace, residue behavior, poles/abscissa).
4. Use dual/hyperreal layers for sensitivity calculus of depth transforms and derive testable asymptotic predictions.
5. Anchor novelty claims to computation method + verified structures, not to raw integer valuation claims that fail.

## Required Honesty Statement

Current evidence supports novelty in formalization and computational methodology around depth-seeded valued structures.
It does not support claiming a new direct valuation on integers/number fields from raw RDT depth alone.

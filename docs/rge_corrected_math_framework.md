# Corrected Recursive Geometric Entropy / REC Framework

## 1. Source Corpus and Scope
This correction pass is based on the exact Zenodo records you specified:

1. [Recursive Entropy Calculus: Bounds and Resonance in Hierarchically Partitioned Systems (Zenodo 17862831)](https://zenodo.org/records/17862831)
2. [Recursive Geometric Entropy: A Unified Framework for Information-Theoretic Shape Analysis (Zenodo 17882310)](https://zenodo.org/records/17882310)
3. [Affine Digit-Linear Transforms in Arbitrary Bases (Zenodo 17783084)](https://zenodo.org/records/17783084)

Local artifacts used:
- `/Users/stevenreid/Documents/New project/docs/source/zenodo_rge/REC_preprint.tex`
- `/Users/stevenreid/Documents/New project/docs/source/zenodo_rge/rge_paper.txt`
- `/Users/stevenreid/Documents/New project/docs/source/zenodo_rge/affine_digit.txt`
- `/Users/stevenreid/Documents/New project/results/rge_math_audit.json`
- `/Users/stevenreid/Documents/New project/results/rge_counterexamples.json`
- `/Users/stevenreid/Documents/New project/results/rec_rge_corrected_validation.json`

## 2. Core Definitions (Kept)
For a binary recursive partition at depth `d`, with leaf probabilities `p_j(d)`:

\[
S(d) = -\sum_{j=1}^{2^d} p_j(d)\log_2 p_j(d), \quad
\bar S(d) = \frac{S(d)}{d}, \quad
\tilde r(d) = \frac{S(d+1)}{S(d)} \ (S(d)>0).
\]

For self-similar geometric recursion with retained parts `N`, scale `s\in(0,1)`, embedding dimension `D`:

\[
d_H = \frac{\ln N}{\ln(1/s)},\quad
\zeta = \frac{d_H}{D},\quad
\lambda = Ns^D.
\]

For radial shell RGE with `N_d=2^d`:

\[
S(d)= C d + h_\Omega + o(1),\quad C=1.
\]

## 3. Claim Registry: Proven vs Disproven vs Repaired

| Claim ID | Statement | Status | Evidence | Repair |
|---|---|---|---|---|
| REC-A | `\bar S(d) <= 1` | Proven | Standard max entropy bound on `2^d` outcomes; no numerical violations | None |
| REC-B | `\tilde r(d) <= 2` for all recursive partitions | **Disproven** | Counterexample at `d=1`: `p=1/3`, `S(1)=0.9183`, `S(2)=1.9183`, `\tilde r(1)=2.089>2` | Replace with sharp bound below |
| REC-C | `\tilde r(d) \to 1` | Proven with domain condition | Direct proof from bounded entropy increments | Require `S(d)>0` where ratio is used |
| REC-D | `\zeta <= 1` under `Ns^D <=1` | Proven | Algebraic rearrangement of convergence inequality | None |
| RGE-7/8/9 | Disk/sphere/cone offset constants | Verified | Independent numerical integration agrees to ~1e-10 | None |
| RGE-6/10 | Radial slope `C=1`, congruent slope `C=\log_2 b` | Proven | Immediate from `N_d` growth and verified slope fits | None |
| RGE-15 | Additivity `C=\sum_i \log_2 b_i` | Proven only under explicit independence model | Model-consistent; manuscript itself flags missing general proof | Relabel as model theorem or general conjecture |
| ADLT-2.2/5.1/6.7 | Affine collapse, iterate formula, period formula | Verified | 500 randomized algebraic checks, 0 failures | None |

## 4. Disproof of REC Theorem B (as currently stated)
Current claim in REC: `\tilde r(d)=S(d+1)/S(d) <= 2` for all recursive binary partitions.

Construct depth-1 probabilities `[p,1-p]` with `p=1/3`. Then:

\[
S(1)=H_2(1/3)\approx 0.918295834.
\]

At depth 2, split each depth-1 cell uniformly into two children. By chain rule, this adds exactly 1 bit:

\[
S(2)=S(1)+1\approx 1.918295834.
\]

Hence:

\[
\tilde r(1)=\frac{S(2)}{S(1)}\approx 2.088973687 > 2.
\]

So the global `<=2` statement is false.

## 5. Corrected Theorem B (Sharp and True)
### Theorem B* (binary case)
For any binary recursive partition and any depth with `S(d)>0`:

\[
\tilde r(d) = \frac{S(d+1)}{S(d)} \le 1 + \frac{1}{S(d)}.
\]

### Proof
Let
\[
\Delta(d+1):=S(d+1)-S(d).
\]
By conditional entropy decomposition in a binary split:
\[
0\le \Delta(d+1)\le 1.
\]
Therefore
\[
\tilde r(d)=\frac{S(d)+\Delta(d+1)}{S(d)}=1+\frac{\Delta(d+1)}{S(d)}\le 1+\frac{1}{S(d)}.
\]
QED.

### Corollary
If additionally `S(d)\ge 1`, then `\tilde r(d)\le 2`.

## 6. Corrected Theorem C (Domain-Explicit)
### Theorem C*
If `S(d)>0` for all sufficiently large `d`, then
\[
\lim_{d\to\infty} \tilde r(d)=1.
\]

### Proof
Again, `\tilde r(d)=1+\Delta(d+1)/S(d)` with `0\le\Delta(d+1)\le 1`.

Case 1: `S(d)\to\infty`. Then `\Delta(d+1)/S(d)\to 0`, so `\tilde r(d)\to1`.

Case 2: `S(d)` is bounded above. Since `S(d+1)\ge S(d)` and bounded, `S(d)` converges to finite `L>0`; then `\Delta(d+1)=S(d+1)-S(d)\to0`. Hence `\Delta(d+1)/S(d)\to0` and again `\tilde r(d)\to1`.

So the limit is 1 whenever ratio is defined eventually. QED.

## 7. RGE Constants and Asymptotics (Validated)
From RGE paper formulas:

\[
h_{disk} = -1+\frac{1}{2\ln2} \approx -0.2786524796,
\]
\[
h_{sphere} = -\log_2 3 + \frac{2}{3\ln2} \approx -0.6231658068,
\]
\[
h_{cone} = -\log_2 6 + \frac{5}{3\ln2} \approx -0.1804707659.
\]

Independent midpoint numerical integration matches these values to approximately `1e-10` absolute error.

Depth-fit for shell entropies (`d=6..14`) gives slopes:
- disk: `0.999984`
- sphere: `0.999986`
- cone: `0.999934`

This supports `C=1` strongly.

## 8. Finite-Depth 1.25 Crossing Interpretation
If asymptotically `S(d)=d+h_\Omega+o(1)`, then

\[
\tilde r(d)=\frac{d+1+h_\Omega}{d+h_\Omega}=1+\frac{1}{d+h_\Omega}+o(1/d).
\]
Setting `\tilde r(d)=1.25` gives the model crossing

\[
d_{1.25}=4-h_\Omega.
\]

For negative `h_\Omega`, this predicts crossing around depths 4 to 5, which matches the reported finite-depth behavior.

## 9. Affine-Digit Paper Cross-Check (from your third link)
The audited core algebraic claims are internally consistent:
- affine collapse `T(n)=An+C`
- closed iterate formula
- period formula for `X_n=(An+C) mod m`

Randomized test battery (500 trials) found 0 failures.

## 10. What Should Be Changed in the Papers
1. Replace REC Theorem B with Theorem B* above.
2. Add explicit domain condition to REC Theorem C (`S(d)>0` where ratio is used).
3. Remove or demote the Fekete-lemma argument for this limit proof. It is unnecessary here.
4. In RGE, relabel Proposition 15 as model-dependent theorem or general conjecture.
5. Keep resonance language clearly marked conjectural/empirical unless tied to a physical model with data.

## 11. Reproducibility
Run:

```bash
python3 /Users/stevenreid/Documents/New\ project/tools/rge_math_audit.py
python3 /Users/stevenreid/Documents/New\ project/tools/rec_rge_corrected_validation.py
```

Outputs:
- `/Users/stevenreid/Documents/New project/results/rge_math_audit.json`
- `/Users/stevenreid/Documents/New project/results/rge_counterexamples.json`
- `/Users/stevenreid/Documents/New project/results/rec_rge_corrected_validation.json`
- `/Users/stevenreid/Documents/New project/docs/rge_math_prove_disprove_fix_report.md`
- `/Users/stevenreid/Documents/New project/docs/rge_corrected_math_framework.md`

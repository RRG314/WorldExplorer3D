# RDT + Topological Adam + MHD Comprehensive Correction Report

Generated: 2026-03-04T18:14:35+00:00

## Scope
- Correct and test three paper lines: RDT arithmetic-entropy law, Topological Adam, and resistive-MHD Euler-potential closure.
- For each claim, classify as `Proven`, `Verified`, `Conjecture`, or `Disproved`.
- Provide minimal repair variants and tool-ready implementations.

## Reproducibility
Run:
```bash
/Users/stevenreid/Documents/New project/.venv_pdf/bin/python tools/rdt_topoadam_mhd_research_runner.py
```

## A) RDT Arithmetic-Entropy Paper
- `rdt.C1` Proven: Shellwise entropy by RDT depth is a well-defined statistic.
- `rdt.C2` Verified: Exponential saturation is a usable empirical fit family for shell entropy trajectories.
- `rdt.C3` Conjecture: Universal quantized law Lambda_f = k_f * Psi with fixed classes {1, 9, 1/3}.

Counterexamples and repairs:
- `sigma` has infeasible fitted limit: H_inf=173.962049, upper_bound=19.644935.
  - Repair: Constrained exponential fit: enforce 0 <= H_inf <= max_d log2(|S_d|), B >= 0.
  - Repair: Switch from fixed quantization classes to data-driven clusters with uncertainty.
- `phi` has infeasible fitted limit: H_inf=165.664606, upper_bound=19.644935.
  - Repair: Constrained exponential fit: enforce 0 <= H_inf <= max_d log2(|S_d|), B >= 0.
  - Repair: Switch from fixed quantization classes to data-driven clusters with uncertainty.

## B) Topological Adam Paper
- `topo.C1` Proven: w_topo = 0 gives exact Adam update.
- `topo.C2` Disproved: eta = 0 or w_topo = 0 gives exact Adam update.
  - Repair: Correct statement to: exact Adam when w_topo=0, or eta=0 and alpha=beta (or topological term disabled).
- `topo.C3` Disproved: Paper pseudocode enforces damping when energy exceeds target.
  - Repair: Use symmetric energy clamp [E_min, E_max] with explicit downscale when E > E_max.
- `topo.C4` Verified: Corrected topological variant can be run as a stable optimizer heuristic.

Rosenbrock check (lower is better):
- Adam final loss: `3.949193`
- Paper variant (zero fields) final loss: `3.949193`
- Paper variant (nonzero fields) final loss: `3.923951`
- Corrected variant final loss: `3.948504`

## C) MHD Paper
- `mhd.C1` Proven: Cartesian closure for alpha=xy, beta=xz with S_alpha=eta*y/x, S_beta=eta*z/x satisfies closure equation exactly.
- `mhd.C2` Proven: All six listed cylindrical bilinear cases satisfy the reported closure formulas.
- `mhd.C3` Disproved: Global smooth analytic spherical bilinear closure exists (reference pair alpha=r*theta, beta=r*phi).
  - Repair: Treat spherical closure as numerical-only domain with local patch methods; avoid global analytic closure claims.

Key equations checked:
- Closure condition: `∇S_alpha × ∇beta + ∇alpha × ∇S_beta = R`.
- Remainder term: `R = eta ∇²(∇alpha × ∇beta) - ∇(eta∇²alpha)×∇beta - ∇alpha×∇(eta∇²beta)`.
- Cartesian proven case: `alpha=xy`, `beta=xz`, `S_alpha=eta*y/x`, `S_beta=eta*z/x`.
- Cylindrical: all six tabulated bilinear shared-coordinate cases were symbolically verified.

## D) Usable Tools Produced
- `src/discovery/topological_adam_tools.py`: paper-consistent and corrected reference optimizers, claim audit helpers.
- `src/discovery/mhd_closure_tools.py`: symbolic closure verifier + reusable closure toolkit for Cartesian/Cylindrical cases.
- `tools/rdt_topoadam_mhd_research_runner.py`: one command to regenerate this report and JSON results.

Tool demo outputs:
- RDT demo entropy (N=100000): depth entropy `0.921595` bits, subtree entropy `0.211430` bits.
- Corrected Topological Adam demo energy after 250 steps: `1.500000`.
- MHD closure demo values generated for both Cartesian and Cylindrical APIs (see JSON for numeric outputs).

## E) External Repo Test Status (topological-adam)
- Command: `/Users/stevenreid/Documents/New project/.venv_pdf/bin/python -m pytest -q`
- Passed: `False` (return code `2`)
- Environment note: torch is missing in this Python environment

## Bottom Line
- RDT entropy machinery is usable, but universal quantized constant claims remain conjectural and need constrained fitting plus uncertainty analysis.
- Topological Adam is legitimate as a heuristic optimizer family after correcting reduction and energy-stabilization claims.
- MHD closure work is strongest in Cartesian and cylindrical structured cases; spherical global smooth analytic closure is not supported by these checks.

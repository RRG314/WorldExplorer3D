# Expanded Cross-Check Report

Generated: 2026-03-04T01:51:03+00:00

This report expands verification across additional directions and cross-checks against external theoretical anchors.

## 1) Stress Tests Across Definitions

- `dp_alpha_1.2`: mult_pass=False, ultra_pass=False
  - smallest mult cex: `{"x": 2, "y": 2, "v_xy": 2.5277777777777777, "v_x_plus_v_y": 2.0}`
  - smallest ultra cex: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`
- `dp_alpha_1.5`: mult_pass=False, ultra_pass=False
  - smallest mult cex: `{"x": 2, "y": 2, "v_xy": 2.1111111111111107, "v_x_plus_v_y": 2.0}`
  - smallest ultra cex: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`
- `dp_alpha_2.0`: mult_pass=False, ultra_pass=False
  - smallest mult cex: `{"x": 2, "y": 2, "v_xy": 1.75, "v_x_plus_v_y": 2.0}`
  - smallest ultra cex: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`
- `iter_alpha_1.2`: mult_pass=False, ultra_pass=False
  - smallest mult cex: `{"x": 3, "y": 3, "v_xy": 3.0, "v_x_plus_v_y": 2.0}`
  - smallest ultra cex: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`
- `iter_alpha_1.5`: mult_pass=False, ultra_pass=False
  - smallest mult cex: `{"x": 4, "y": 4, "v_xy": 3.0, "v_x_plus_v_y": 4.0}`
  - smallest ultra cex: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`
- `iter_alpha_1.8`: mult_pass=False, ultra_pass=False
  - smallest mult cex: `{"x": 2, "y": 4, "v_xy": 2.0, "v_x_plus_v_y": 3.0}`
  - smallest ultra cex: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`
- `iter_alpha_2.2`: mult_pass=False, ultra_pass=False
  - smallest mult cex: `{"x": 3, "y": 3, "v_xy": 1.0, "v_x_plus_v_y": 2.0}`
  - smallest ultra cex: `{"x": -2, "y": 3, "v_x_plus_y": 0.0, "min_v": 1.0}`

## 2) Deep Dual/Hyperreal Checks

- Dual legitimate: `True`
- Hyperreal tower legitimate as ring: `True`
- Hyperreal tower is field: `False`

## 3) Growth Cross-Check (Iterative Depth)

- Sample size: 199998
- Fit y = a*log(log n)+b: a=2.001665, b=0.425852, R^2=0.174817
- Mean abs residual: 0.386717
- Max abs residual: 1.108731

## 4) Transition-Point Cross-Check

- Search max n: 300000
- depth 1 starts at n=2
- depth 2 starts at n=4
- depth 3 starts at n=8
- depth 4 starts at n=64
- depth 5 starts at n=1152
- depth 6 starts at n=39168

## 5) p-adic Template Cross-Check

- family=dp_alpha_1.5, template=nu_2, best_c=1.013321, mse=5.942806
- family=dp_alpha_1.5, template=nu_3, best_c=1.534351, mse=6.684893
- family=dp_alpha_1.5, template=nu_5, best_c=2.048893, mse=7.443240
- family=dp_alpha_1.5, template=nu_7, best_c=2.301241, mse=7.829922
- family=iter_alpha_1.5, template=nu_2, best_c=1.320701, mse=10.151937
- family=iter_alpha_1.5, template=nu_3, best_c=1.988832, mse=11.454879
- family=iter_alpha_1.5, template=nu_5, best_c=2.662844, mse=12.715365
- family=iter_alpha_1.5, template=nu_7, best_c=2.976744, mse=13.386550

## 6) Prime-Weight Lift Deep Checks

- Multiplicative hom on N^x (n,m<=400): `True`
- Integer ultrametric addition via lift: `False`
- Hahn embedding multiplicativity random checks: `True`

## 7) External Theory Cross References

- Classification of non-trivial absolute values on Q (Ostrowski). | source: https://en.wikipedia.org/wiki/Ostrowski%27s_theorem | consistent=True
- Hahn valuation is defined by minimum exponent in series support. | source: https://en.wikipedia.org/wiki/Hahn_series | consistent=True
- Dual/square-zero constructions produce commutative rings with nilpotents, not fields. | source: https://en.wikipedia.org/wiki/Dual_number | consistent=True

## 8) Overall

- raw depth direct valuation supported: `False`
- valued embedding program supported: `True`
- dual/hyperreal program supported: `True`

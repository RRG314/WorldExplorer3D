# RDT Tree Geometry Report

## Setup
- Generated at: `2026-03-04T02:21:13+00:00`
- Map parameter: `alpha=1.5`
- Truncation: `N=1000000`
- Random seed: `1729`
- Source definition (Definition 2.1 in RDT drafts):
  - `x_0=n`
  - `d_i=max(2, floor((log x_i)^alpha))`
  - `x_{i+1}=floor(x_i/d_i)`
  - `D(n)=min{k: x_k<=1}`
  - Parent map on `n>=2`: `f(n)=floor(n/max(2,floor((log n)^alpha)))` with root `1`.

## Tree and Ultrametric Definitions
- Rooted tree on vertices `{1,...,N}` with directed edge `n -> f(n)` for `n>=2`.
- `path(n)` is the ancestor chain from `n` to `1`.
- `LCA(a,b)` is the deepest common ancestor.
- Convention: `LCAdepth(a,a)=+infinity`, else `LCAdepth(a,b)=D(LCA(a,b))`.
- Distance: `d(a,b)=0` if `a=b`, else `d(a,b)=2^{-LCAdepth(a,b)}`.
- Example paths:
  - `path(2)`: `2 -> 1`
  - `path(10)`: `10 -> 3 -> 1`
  - `path(1260)`: `1260 -> 66 -> 8 -> 4 -> 2 -> 1`
  - `path(1000000)`: `1000000 -> 19607 -> 632 -> 39 -> 5 -> 2 -> 1`

### Short Ultrametric Proof
For any three nodes `a,b,c`, let `u=LCA(a,b)`, `v=LCA(b,c)`, `w=LCA(a,c)` and denote depths by `h_u,h_v,h_w`.
In a rooted tree, two of the three LCAs are ancestors of the third; therefore `h_w >= min(h_u,h_v)` after relabeling.
Since `2^{-x}` is decreasing, `d(a,c)=2^{-h_w} <= max(2^{-h_u},2^{-h_v}) = max(d(a,b), d(b,c))`.
Thus `d` satisfies the strong triangle inequality. Identity and symmetry hold by definition, so `d` is an ultrametric.

## Depth Growth
| N | mean D | median D | p95 D | max D |
|---:|---:|---:|---:|---:|
| 1000 | 3.809000 | 4 | 4 | 4 |
| 10000 | 4.558000 | 5 | 5 | 5 |
| 100000 | 5.131100 | 5 | 6 | 6 |
| 1000000 | 5.815393 | 6 | 6 | 6 |

### Candidate Asymptotic Fits
- Fit sample size: `200000`
- `log_n`: a=0.289966, b=2.099455, rmse=0.273843, mae=0.188544, r2=0.529783
- `log_n_over_loglog_n`: a=1.204102, b=-0.232839, rmse=0.273934, mae=0.187879, r2=0.529471
- `loglog_n`: a=3.308613, b=-2.611998, rmse=0.276376, mae=0.183831, r2=0.521043
- Best by RMSE: `log_n` with `D(n) ~= 0.289966 * feature(n) + 2.099455`.
- Note: depth values are highly concentrated near max depth at this N, so fitted models are pre-asymptotic diagnostics, not proofs of final asymptotics.

### Depth Transition Points
| depth k | first n with D(n)=k | ratio to previous transition |
|---:|---:|---:|
| 0 | 1 | - |
| 1 | 2 | 2.000000 |
| 2 | 4 | 2.000000 |
| 3 | 8 | 2.000000 |
| 4 | 64 | 8.000000 |
| 5 | 1152 | 18.000000 |
| 6 | 39168 | 34.000000 |

## Level-Set Densities
| depth k | count | share |
|---:|---:|---:|
| 0 | 1 | 0.000001 |
| 1 | 2 | 0.000002 |
| 2 | 11 | 0.000011 |
| 3 | 159 | 0.000159 |
| 4 | 4056 | 0.004056 |
| 5 | 175958 | 0.175958 |
| 6 | 819813 | 0.819813 |

- 80% concentration window: `[6, 6]` (width=0, mass=0.819813).
- 90% concentration window: `[5, 6]` (width=1, mass=0.995771).

## Ball Volumes (Subtree Sizes)
Each node at depth `k` defines a ball equal to its subtree in the truncated tree `<=N`.
| depth k | population | sample | mean size | median size | max size |
|---:|---:|---:|---:|---:|---:|
| 0 | 1 | 1 | 1000000.000 | 1000000 | 1000000 |
| 1 | 2 | 2 | 499999.500 | 499999 | 695225 |
| 2 | 11 | 11 | 90908.818 | 19616 | 365206 |
| 3 | 159 | 159 | 6289.220 | 1132 | 61581 |
| 4 | 4056 | 1024 | 235.878 | 42 | 4673 |
| 5 | 175958 | 1024 | 5.340 | 1 | 102 |
| 6 | 819813 | 1024 | 1.000 | 1 | 1 |

## Branching / In-Degree
- Max in-degree: `101`
- Mean in-degree among nonzero nodes: `51.002142`
- Nonzero in-degree nodes: `19607`
- Tail counts (>=2,4,8,...): `{"2": 19607, "4": 19605, "8": 19605, "16": 19582, "32": 19002, "64": 2593, "128": 0}`
- Top parent nodes by in-degree:
  - node 18776: indegree=101
  - node 18775: indegree=101
  - node 18774: indegree=101
  - node 18773: indegree=101
  - node 18772: indegree=101
  - node 18771: indegree=101
  - node 18770: indegree=101
  - node 18769: indegree=101
  - node 18768: indegree=101
  - node 18767: indegree=101

## Ultrametric Sanity Check
- Random triple tests: `100000`; violations of strong triangle inequality: `0`.
- Verified in tested range: `True`.

## Candidate Conjectures
### C1_transition_supergrowth
- Statement: If T_k=min{n: D(n)=k}, then T_k grows super-multiplicatively in k (in particular faster than geometric).
- Evidence: Observed transitions: k=1 -> n=2; k=2 -> n=4; k=3 -> n=8; k=4 -> n=64; k=5 -> n=1152; k=6 -> n=39168.
- Next proof target: Prove recursive lower bounds on T_{k+1} from admissible divisor windows in the update x -> floor(x/max(2,floor((log x)^alpha))).

### C2_level_set_concentration
- Statement: For fixed alpha=1.5, depth mass for n<=N concentrates in an O(1)-width window around the modal depth.
- Evidence: Mode depth is 6; minimal 80% concentration window is [6,6] (width=0).
- Next proof target: Establish Lipschitz-like control on D(n+1)-D(n) over long intervals and derive concentration via counting arguments.

### C3_preasymptotic_log_fit_then_crossover
- Statement: On finite windows up to 10^6, one-feature fits cannot sharply distinguish true asymptotic law; a pre-asymptotic log n trend likely transitions to slower growth at larger scales.
- Evidence: Best fit is `log_n` with a=0.2900, b=2.0995, rmse=0.2738, while transition gaps accelerate with depth.
- Next proof target: Analyze D(n) via transition thresholds T_k and derive a scaling law for k as a function of n.

### C4_ball_volume_multiscale
- Statement: Subtree volumes at fixed depth k are broad and become increasingly skewed with depth, consistent with a multiplicative cascade.
- Evidence: Depth 4 sample has q50=42, q95=1451; depth 5 has q50=1, q95=48.
- Next proof target: Relate subtree size recursion to inverse image counts and prove depth-indexed moment bounds.

### C5_branching_polylog_upper_envelope
- Statement: Maximum in-degree up to N grows slower than any power N^eps and is compatible with a polylog envelope.
- Evidence: Observed max indegree at N=1000000 is 101.
- Next proof target: Bound preimage counts of f(n)=m by controlling admissible divisor bands d= floor((log n)^alpha).

## Next Proof Targets
1. Derive matching upper/lower bounds for `D(n)` by comparing the discrete recursion with controlled ODE inequalities.
2. Prove concentration of level sets by counting preimages of depth layers under `f`.
3. Bound preimage multiplicities to get rigorous in-degree and ball-volume envelopes.
4. Extend the ultrametric from finite truncations to the full infinite rooted tree and prove completeness properties.

## Status Labeling
- Proven: ultrametric property of the tree distance (short proof above).
- Verified: all empirical summaries and random inequality checks in this report.
- Conjecture: asymptotic laws and structural growth claims listed under Candidate Conjectures.

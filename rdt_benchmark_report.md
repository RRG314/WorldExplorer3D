# RDT Benchmark Report

## Scope
- Goal: stress-test RDT as both metric and partitioning hierarchy.
- Systems: `rdt`, `euclidean`, `hamming`, `padic2`, `random_hash`, `kd_tree`.
- Tasks: clustering accuracy, nearest-neighbor quality, partition balance, tree-depth profile, computation cost.

## Dataset Suite
- `synthetic_clustered`: n=320, classes=4. Four Gaussian-like integer clusters with known labels. (source: synthetic)
- `random_integer_set`: n=320, classes=4. Uniform random integers with random class labels (adversarial for structure). (source: synthetic)
- `structured_sequences_rdt_ancestry`: n=320, classes=4. Classes defined by common RDT ancestor at depth 3 (structured hierarchy stress test). (source: derived_from_rdt_alpha_1.5)
- `real_fips_state_subset`: n=320, classes=4. Real county FIPS integer codes, labels by U.S. state subset. (source: https://raw.githubusercontent.com/kjhealy/fips-codes/master/state_and_county_fips_master.csv)

## Per-Dataset Comparison
### synthetic_clustered
| system | clustering_acc | nn_acc | total_ms | partition_cv | max_depth |
|---|---:|---:|---:|---:|---:|
| rdt | 0.5219 | 0.9437 | 78.28 | 1.2004 | 6 |
| euclidean | 0.7500 | 1.0000 | 40.28 | 2.0556 | 1 |
| hamming | 0.4062 | 0.7969 | 14.76 | 2.1033 | 4 |
| padic2 | 0.2875 | 0.2250 | 21.98 | 0.1468 | 4 |
| random_hash | 0.2969 | 0.2594 | 0.78 | 0.1961 | 1 |
| kd_tree | 0.7500 | 1.0000 | 3.13 | 0.9312 | 6 |

Clustering Accuracy Bars:
```text
rdt         0.522 ###################
euclidean   0.750 ############################
hamming     0.406 ###############
padic2      0.287 ###########
random_hash 0.297 ###########
kd_tree     0.750 ############################
```

NN Accuracy Bars:
```text
rdt         0.944 ##########################
euclidean   1.000 ############################
hamming     0.797 ######################
padic2      0.225 ######
random_hash 0.259 #######
kd_tree     1.000 ############################
```

Depth Distribution Snapshots:
- `rdt`: `4:23, 5:186, 6:111`
- `euclidean`: `1:320`
- `hamming`: `4:320`
- `padic2`: `4:320`
- `random_hash`: `1:320`
- `kd_tree`: `2:80, 3:80, 4:80, 5:70, 6:10`

### random_integer_set
| system | clustering_acc | nn_acc | total_ms | partition_cv | max_depth |
|---|---:|---:|---:|---:|---:|
| rdt | 0.3000 | 0.2625 | 72.20 | 1.4170 | 6 |
| euclidean | 0.3063 | 0.2562 | 33.45 | 0.2352 | 1 |
| hamming | 0.2781 | 0.2188 | 11.86 | 0.3112 | 4 |
| padic2 | 0.3063 | 0.2812 | 21.06 | 0.2222 | 4 |
| random_hash | 0.3187 | 0.2250 | 0.74 | 0.2143 | 1 |
| kd_tree | 0.3063 | 0.2562 | 3.05 | 0.0000 | 4 |

Clustering Accuracy Bars:
```text
rdt         0.300 ##########################
euclidean   0.306 ###########################
hamming     0.278 ########################
padic2      0.306 ###########################
random_hash 0.319 ############################
kd_tree     0.306 ###########################
```

NN Accuracy Bars:
```text
rdt         0.263 ##########################
euclidean   0.256 ##########################
hamming     0.219 ######################
padic2      0.281 ############################
random_hash 0.225 ######################
kd_tree     0.256 ##########################
```

Depth Distribution Snapshots:
- `rdt`: `5:50, 6:270`
- `euclidean`: `1:320`
- `hamming`: `4:320`
- `padic2`: `4:320`
- `random_hash`: `1:320`
- `kd_tree`: `4:320`

### structured_sequences_rdt_ancestry
| system | clustering_acc | nn_acc | total_ms | partition_cv | max_depth |
|---|---:|---:|---:|---:|---:|
| rdt | 1.0000 | 1.0000 | 65.00 | 0.0000 | 6 |
| euclidean | 0.7438 | 0.9906 | 36.46 | 0.9661 | 1 |
| hamming | 0.4875 | 0.7281 | 11.89 | 1.4191 | 4 |
| padic2 | 0.2875 | 0.2625 | 20.83 | 0.1904 | 4 |
| random_hash | 0.3000 | 0.2219 | 0.71 | 0.2500 | 1 |
| kd_tree | 0.9094 | 0.9906 | 3.00 | 0.4593 | 6 |

Clustering Accuracy Bars:
```text
rdt         1.000 ############################
euclidean   0.744 #####################
hamming     0.487 ##############
padic2      0.287 ########
random_hash 0.300 ########
kd_tree     0.909 #########################
```

NN Accuracy Bars:
```text
rdt         1.000 ############################
euclidean   0.991 ############################
hamming     0.728 ####################
padic2      0.263 #######
random_hash 0.222 ######
kd_tree     0.991 ############################
```

Depth Distribution Snapshots:
- `rdt`: `5:9, 6:311`
- `euclidean`: `1:320`
- `hamming`: `4:320`
- `padic2`: `4:320`
- `random_hash`: `1:320`
- `kd_tree`: `3:80, 4:220, 5:10, 6:10`

### real_fips_state_subset
| system | clustering_acc | nn_acc | total_ms | partition_cv | max_depth |
|---|---:|---:|---:|---:|---:|
| rdt | 0.9719 | 1.0000 | 62.93 | 0.4331 | 6 |
| euclidean | 1.0000 | 1.0000 | 30.09 | 1.7321 | 1 |
| hamming | 0.7219 | 1.0000 | 16.05 | 1.7321 | 4 |
| padic2 | 0.3344 | 0.1469 | 42.57 | 0.8779 | 4 |
| random_hash | 0.2906 | 0.2469 | 5.74 | 0.2823 | 1 |
| kd_tree | 1.0000 | 1.0000 | 23.16 | 0.3062 | 5 |

Clustering Accuracy Bars:
```text
rdt         0.972 ###########################
euclidean   1.000 ############################
hamming     0.722 ####################
padic2      0.334 #########
random_hash 0.291 ########
kd_tree     1.000 ############################
```

NN Accuracy Bars:
```text
rdt         1.000 ############################
euclidean   1.000 ############################
hamming     1.000 ############################
padic2      0.147 ####
random_hash 0.247 #######
kd_tree     1.000 ############################
```

Depth Distribution Snapshots:
- `rdt`: `5:240, 6:80`
- `euclidean`: `1:320`
- `hamming`: `4:320`
- `padic2`: `4:320`
- `random_hash`: `1:320`
- `kd_tree`: `3:40, 4:260, 5:20`

## Aggregate Statistics
| system | mean_cluster | mean_nn | mean_total_ms | mean_partition_cv |
|---|---:|---:|---:|---:|
| rdt | 0.6984 | 0.8016 | 69.60 | 0.7626 |
| euclidean | 0.7000 | 0.8117 | 35.07 | 1.2473 |
| hamming | 0.4734 | 0.6859 | 13.64 | 1.3914 |
| padic2 | 0.3039 | 0.2289 | 26.61 | 0.3593 |
| random_hash | 0.3016 | 0.2383 | 1.99 | 0.2357 |
| kd_tree | 0.7414 | 0.8117 | 8.08 | 0.4242 |

Average Rank (lower is better by column objective):
| system | rank_cluster(hi) | rank_nn(hi) | rank_time(lo) | rank_balance_cv(lo) |
|---|---:|---:|---:|---:|
| rdt | 3.00 | 1.75 | 6.00 | 3.50 |
| euclidean | 1.75 | 2.00 | 4.75 | 4.75 |
| hamming | 4.50 | 4.25 | 2.75 | 5.75 |
| padic2 | 5.00 | 4.50 | 4.25 | 2.50 |
| random_hash | 4.25 | 5.25 | 1.00 | 2.00 |
| kd_tree | 2.50 | 3.25 | 2.25 | 2.50 |

## Failure Cases (Counterexamples to RDT Dominance)
- `synthetic_clustered`: clustering gap=0.2281 (best=euclidean:0.7500, rdt=0.5219); nn gap=0.0563 (best=euclidean:1.0000, rdt=0.9437).
- `real_fips_state_subset`: clustering gap=0.0281 (best=euclidean:1.0000, rdt=0.9719); nn gap=0.0000 (best=rdt:1.0000, rdt=1.0000).

## Scenarios Where RDT Is Superior
- `structured_sequences_rdt_ancestry`: rdt clustering=1.0000, rdt nn=1.0000; best clustering system=rdt, best nn system=rdt.
- `real_fips_state_subset`: rdt clustering=0.9719, rdt nn=1.0000; best clustering system=euclidean, best nn system=rdt.

## Mathematical Deepening

### 1) Asymptotic Growth Law for D(n)
- Analysis range: `n<= 1000000`, `alpha=1.5`.
- Best one-feature fit by RMSE: `log_n`.
| model | a | b | rmse | r2 |
|---|---:|---:|---:|---:|
| loglog_n | 3.308613 | -2.611998 | 0.276376 | 0.521043 |
| log_n_over_loglog_n | 1.204102 | -0.232839 | 0.273934 | 0.529471 |
| log_n | 0.289966 | 2.099455 | 0.273843 | 0.529783 |
- Transition points `T_k=min{n:D(n)=k}`:
  - depth 0: first_n=1, ratio_to_prev=-
  - depth 1: first_n=2, ratio_to_prev=2.000
  - depth 2: first_n=4, ratio_to_prev=2.000
  - depth 3: first_n=8, ratio_to_prev=2.000
  - depth 4: first_n=64, ratio_to_prev=8.000
  - depth 5: first_n=1152, ratio_to_prev=18.000
  - depth 6: first_n=39168, ratio_to_prev=34.000

### 2) Subtree Size Bounds (Proven + Checked)
- Proven statement: For finite truncation [1..N], every subtree size S_N(u) satisfies 1 <= S_N(u) <= N-u+1.
- Proof sketch: Each subtree contains u itself, so S_N(u)>=1. Any descendant index is >=u, hence at most N-u+1 eligible nodes.
- Sample verification (violations found): 0
| depth | nodes | q50 subtree | q90 subtree | q95 subtree | max subtree |
|---:|---:|---:|---:|---:|---:|
| 0 | 1 | 500000 | 500000 | 500000 | 500000 |
| 1 | 2 | 165606 | 334393 | 334393 | 334393 |
| 2 | 11 | 19261 | 84422 | 249970 | 249970 |
| 3 | 159 | 1033 | 2296 | 15562 | 42264 |
| 4 | 4056 | 41 | 82 | 685 | 3883 |
| 5 | 175958 | 1 | 1 | 1 | 94 |
| 6 | 319813 | 1 | 1 | 1 | 1 |

### 3) Branching Factor Behavior
- Max in-degree: `93`
- Mean in-degree over nonzero nodes: `47.0012`
- Tail counts: `{"2": 10638, "4": 10636, "8": 10636, "16": 10612, "32": 10032, "64": 1384}`

### 4) Sensitivity to Alpha
- Sweep range: `n<= 300000`.
| alpha | mean_depth | median_depth | p95_depth | max_depth | max_indegree |
|---:|---:|---:|---:|---:|---:|
| 1.10 | 7.4331 | 7 | 8 | 8 | 31 |
| 1.30 | 6.4396 | 6 | 7 | 7 | 51 |
| 1.50 | 5.3846 | 5 | 6 | 6 | 87 |
| 1.70 | 4.8625 | 5 | 5 | 5 | 147 |
| 2.00 | 3.9828 | 4 | 4 | 4 | 317 |

### 5) RDT vs p-adic Ultrametrics
- Triple tests per metric: `20000`
- RDT ultrametric violations: `0`
- p-adic ultrametric violations: `0`
- Pearson correlation of distance scales `(-log2 d)`: `-0.0153`
- Nearest-neighbor overlap rate (RDT vs p-adic): `0.0075`

## Bottom Line
- This benchmark intentionally searched for failure modes; RDT loses clearly on multiple datasets (especially Euclidean-like cluster structure), while showing strength on hierarchy-aligned structured data.
- RDT remains a legitimate ultrametric hierarchy, but utility is strongly dataset/task dependent and should not be assumed universal.

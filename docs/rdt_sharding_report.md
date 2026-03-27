# RDT-Anchored Sharding Benchmark Report

Generated: 2026-03-04T16:24:13+00:00

## Scope
- Implemented and benchmarked: `baseline_mod_hash`, `rendezvous_hashing`, `consistent_hash_ring`, `rdt_anchored_bucket_mod`, `rdt_anchored_mapping_table`.
- RDT strategy uses ancestor buckets: `bucket = ancestor(key, k)` with `k` fixed by config.
- Mapping-table mode uses minimal-remap transitions when shard count changes.

## Configuration
- Variant used: `research`
- Alpha: `1.5`
- Ancestor level k: `1`
- Shards N: `16`
- Keys per workload: `200000`
- Runtime probe assignments: `1000000` (reported as ms per 1e6 assignments)

Reproduce this exact configuration:
```bash
python3 tools/rdt_sharding_benchmark.py --seed 1729 --alpha 1.5 --level-k 1 --shards 16 --keys-per-workload 200000 --runtime-assignments 1000000 --ring-vnodes 64 --target-fill-ratio 0.8 --variant auto
```

## Workload Results

### W1_uniform_random
| Strategy | Move N->N+1 | Move N->N-1 | Max/Mean Load | Load Stddev | Runtime ms/1e6 | Memory KB |
|---|---:|---:|---:|---:|---:|---:|
| baseline_mod_hash | 94.15% | 93.75% | 1.015 | 104.7 | 542.4 | 0.4 |
| rendezvous_hashing | 5.94% | 6.29% | 1.016 | 108.1 | 7704.1 | 1.2 |
| consistent_hash_ring | 6.73% | 6.11% | 1.224 | 1538.4 | 708.8 | 54.0 |
| rdt_anchored_bucket_mod | 94.12% | 93.77% | 1.016 | 84.0 | 722.0 | 1.1 |
| rdt_anchored_mapping_table | 4.71% | 6.25% | 1.000 | 0.0 | 922.5 | 26621.7 |

RDT clear-margin wins in this workload:
- `movement_plus`: baseline best `0.05944` vs RDT best `0.04706` (margin `20.83%`).

RDT clear-gap failures in this workload:
- `runtime`: baseline best `542.364` vs RDT best `722.021` (gap `33.12%`).

### W2_sequential_timestamps
| Strategy | Move N->N+1 | Move N->N-1 | Max/Mean Load | Load Stddev | Runtime ms/1e6 | Memory KB |
|---|---:|---:|---:|---:|---:|---:|
| baseline_mod_hash | 94.09% | 93.79% | 1.016 | 108.8 | 545.2 | 0.4 |
| rendezvous_hashing | 5.89% | 6.22% | 1.025 | 133.0 | 7951.1 | 1.2 |
| consistent_hash_ring | 6.88% | 6.11% | 1.243 | 1515.4 | 706.7 | 54.0 |
| rdt_anchored_bucket_mod | 93.79% | 94.09% | 1.001 | 31.2 | 714.5 | 1.1 |
| rdt_anchored_mapping_table | 4.75% | 6.21% | 1.001 | 31.2 | 761.8 | 202.2 |

RDT clear-margin wins in this workload:
- `movement_plus`: baseline best `0.05888` vs RDT best `0.04753` (margin `19.28%`).

RDT clear-gap failures in this workload:
- `runtime`: baseline best `545.201` vs RDT best `714.478` (gap `31.05%`).

### W3_clustered_keys
| Strategy | Move N->N+1 | Move N->N-1 | Max/Mean Load | Load Stddev | Runtime ms/1e6 | Memory KB |
|---|---:|---:|---:|---:|---:|---:|
| baseline_mod_hash | 94.28% | 94.22% | 1.162 | 911.3 | 506.2 | 0.3 |
| rendezvous_hashing | 6.23% | 6.46% | 1.133 | 814.6 | 7829.5 | 1.1 |
| consistent_hash_ring | 6.30% | 6.42% | 1.305 | 1871.3 | 657.5 | 54.0 |
| rdt_anchored_bucket_mod | 99.88% | 92.12% | 1.765 | 6883.3 | 637.5 | 1.1 |
| rdt_anchored_mapping_table | 5.39% | 6.25% | 1.000 | 1.2 | 690.0 | 18.1 |

RDT clear-margin wins in this workload:
- `movement_plus`: baseline best `0.06231` vs RDT best `0.053915` (margin `13.47%`).
- `max_over_mean`: baseline best `1.13288` vs RDT best `1.00032` (margin `11.70%`).

RDT clear-gap failures in this workload:
- `runtime`: baseline best `506.226` vs RDT best `637.537` (gap `25.94%`).

### W4_zipf_keys
| Strategy | Move N->N+1 | Move N->N-1 | Max/Mean Load | Load Stddev | Runtime ms/1e6 | Memory KB |
|---|---:|---:|---:|---:|---:|---:|
| baseline_mod_hash | 97.59% | 84.15% | 2.973 | 7405.3 | 505.1 | 0.3 |
| rendezvous_hashing | 16.55% | 5.54% | 3.348 | 8205.2 | 7824.0 | 1.1 |
| consistent_hash_ring | 6.84% | 3.99% | 3.162 | 8022.6 | 645.6 | 54.0 |
| rdt_anchored_bucket_mod | 35.00% | 35.58% | 4.319 | 12024.5 | 604.6 | 1.1 |
| rdt_anchored_mapping_table | 24.37% | 4.44% | 3.899 | 9758.5 | 650.1 | 186.2 |

RDT clear-gap failures in this workload:
- `movement_plus`: baseline best `0.068445` vs RDT best `0.243705` (gap `256.06%`).
- `movement_minus`: baseline best `0.039875` vs RDT best `0.0444` (gap `11.35%`).
- `max_over_mean`: baseline best `2.97296` vs RDT best `3.89928` (gap `31.16%`).
- `runtime`: baseline best `505.101` vs RDT best `604.621` (gap `19.70%`).

## Minimal RDT Modification Rerun
Smallest modification tested: replace `rdt_anchored_bucket_mod` with `rdt_anchored_mapping_table` (balanced bucket table + minimal-remap transitions).

| Workload | Move+ Improvement | Move- Improvement | Load Max/Mean Improvement | Runtime Improvement |
|---|---:|---:|---:|---:|
| W1_uniform_random | 95.00% | 93.33% | 1.59% | -27.77% |
| W2_sequential_timestamps | 94.93% | 93.40% | 0.00% | -6.62% |
| W3_clustered_keys | 94.60% | 93.22% | 43.34% | -8.23% |
| W4_zipf_keys | 30.37% | 87.52% | 9.71% | -7.53% |

## Conservative Conclusion
- RDT clear-margin win cases (raw metric only): `4`
- RDT qualified win cases (with load/runtime guardrails): `4`
- RDT clear-gap failure cases: `7`
- RDT-anchored sharding shows a qualified measurable advantage on at least one metric/workload under this setup.
- Qualified win: `W1_uniform_random` metric `movement_plus` via `rdt_anchored_mapping_table` (baseline `0.05944` vs RDT `0.04706`, margin `20.83%`).
- Qualified win: `W2_sequential_timestamps` metric `movement_plus` via `rdt_anchored_mapping_table` (baseline `0.05888` vs RDT `0.04753`, margin `19.28%`).
- Qualified win: `W3_clustered_keys` metric `movement_plus` via `rdt_anchored_mapping_table` (baseline `0.06231` vs RDT `0.053915`, margin `13.47%`).
- Qualified win: `W3_clustered_keys` metric `max_over_mean` via `rdt_anchored_mapping_table` (baseline `1.13288` vs RDT `1.00032`, margin `11.70%`).
- Claims are limited to measured metrics above.

## Notes
- `rdt_anchored_bucket_mod` is simple and deterministic but can be unbalanced on skewed bucket distributions.
- `rdt_anchored_mapping_table` reduces remapping and can improve load behavior, but adds metadata memory.
- For full reproducibility, see `results/rdt_sharding.json` and rerun this benchmark script with the same seed/config.

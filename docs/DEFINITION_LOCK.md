# Definition Lock

Generated: 2026-03-04T01:51:03+00:00

This lock binds each core object to a canonical source section. Older variants remain tracked in `src/spec/history.py`.

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

# TypeScript boundary evaluation

Recommendation: **boundary-only TypeScript first**, progressively expanding where contracts prove useful. No wholesale conversion and no performance gain claimed.

The isolated prototype in `scripts/architecture-evaluation/contracts/` imports the existing `createWorldLoadRequest` implementation. It does not introduce a second validator or world authority. The compiler infers the immutable request result from that JS module. A narrow typed input facade, explicit coordinate frames and a provenance discriminated union are the experiments.

TypeScript 7.0.2 passes the positive fixture and verifies six expected compile errors: mutation of published coordinates, unchecked nullable validator output, form-control strings crossing a numeric-coordinate boundary, string sequences, local positions used as geographic coordinates, and inferred provenance without its method. These are defect classes covered by existing runtime validation/contracts; they are deliberately injected negative fixtures, **not six newly discovered production bugs**.

Runtime checks still own untrusted JSON, finite/range validation, permissions, stale asynchronous generations and schema migration. TypeScript alone cannot prove any of those. In particular, the service reset race needed a runtime generation guard, not merely types.

Start with WorldLoadRequest/WorldLayerProduct, building provenance and stable identity, transport profiles and worker result envelopes. Then add player/resource/activity and Reality Capture service projections. Preserve backend authorization and client/server schema compatibility. A typed declaration that silently casts an arbitrary Firebase object would conceal rather than solve coupling.

Reproduce: install the pinned analysis tooling and run its `tsc -p scripts/architecture-evaluation/contracts/tsconfig.json`. No emitted JS and no runtime dependency were added. Broader integration, editor usability and CI wiring remain to be evaluated after this pilot.

# RDT Evaluation For Continuous World

This branch evaluates RDT as an engineering option, not as a required dependency.

## Inputs Reviewed

- `repos/rdt-spatial-index/README.md`
- `repos/rdt-spatial-index/LIMITATIONS.md`
- `repos/rdt-spatial-index/publication/LIMITATIONS.md`
- `RDT_ECOSYSTEM_ORGANIZATION.md`

## Direct Answer

RDT should not be the core continuous-world model.

It is better suited as a support index for selected locality-heavy workloads once the continuous-world ownership model exists.

## Where RDT Helps

- nearby object relevance queries inside loaded regions
- streaming priority ranking among already-known candidates
- multiplayer locality filtering
- activity/event proximity lookup
- vegetation/object clustering queries

## Where RDT Should Not Lead

- global coordinate model
- floating origin / rebase logic
- chunk ownership
- terrain tile addressing
- authoritative region lifecycle

## Why

The RDT repo and publication notes are explicit:

- performance is workload dependent
- there is no universal query-time win
- large-scale query behavior can degrade badly in some regimes

That makes it a poor choice for the base world model. A continuous-world runtime needs predictable chunk ownership and lifecycle before it needs a specialized query accelerator.

## Recommended Adoption Timing

- now: no mandatory integration
- later: optional adapter for locality filtering inside loaded regions
- maybe never: if grid/hash/ring structures remain simpler and fast enough for the actual runtime workloads

## Practical Recommendation

Phase the system this way:

1. build continuous-world ownership and streaming first
2. gather actual locality/query hotspots from the new diagnostics
3. benchmark RDT against simpler alternatives for those exact hotspots
4. only integrate if it wins on real workloads with acceptable complexity

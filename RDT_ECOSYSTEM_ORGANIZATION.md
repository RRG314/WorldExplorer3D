# RDT Ecosystem Organization (Workspace Pointer)

The recommended ecosystem organization has been implemented in:

- `repos/rdt-ecosystem-hub/README.md`
- `repos/rdt-ecosystem-hub/docs/REPO_MAP.md`
- `repos/rdt-ecosystem-hub/docs/LAYER_MODEL.md`
- `repos/rdt-ecosystem-hub/docs/PAPERS_AND_CORRECTIONS.md`
- `repos/rdt-ecosystem-hub/plans/MIGRATION_PLAN.md`

## Scope Covered

- RDT core research and paper track
- installable RDT library repos
- engine/runtime repos
- product layer including Sidestreets (`LocalHub3D`)
- public website/documentation repo
- cross-repo benchmark/evaluation orchestration

## Key Decision

Use a **hybrid multi-repo model with a documentation-first hub**.

- keep implementation repos separate by responsibility
- use the hub for architecture, paper/corrections index, and migration governance
- keep older useful work visible, but clearly labeled by status and layer

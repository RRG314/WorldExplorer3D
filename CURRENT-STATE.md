# Current deployment — September 26, 2026

Production is `5.3.0+bbe6502228e3.8044052b36c00b4a.production`, from source
`bbe6502228e369fe2a15dc6a177f5d83948584c3`. Hosting version is
`sites/worldexplorer3d-d9b83/versions/946641d59f2315f5`.
The public homepage and app respond successfully; hosted manifests match the
production package. Firestore and Storage rules match; all 78 functions are
ACTIVE and all declared indexes are present.

The owner explicitly directed deployment of the already-approved build and
deferral of further repairs to the architecture/refactor investigation. Do not
restart the release matrix or interpret the later failed performance budget as
an instruction to change the deployed version. Retain that measurement for the
separate investigation; no comprehensive performance acceptance is claimed.

Safe-ground recovery commit `2c8e9499` and the night-light shader investigation
are preserved for later work and are excluded from the deployment. The latter
is in the release repository's named Git stash. The isolated architecture
worktree remains on `steven/architecture-evaluation`.

Rollback: `worldexplorer3d-d9b83@135a1b74cd0b8395` (5.2), with original rule
files preserved under `output/release-integration/final-production/rollback-before-5.3`.
The GitHub v5.3.0 release remains a draft. Ordinary Chrome must remain open.

See `docs/RELEASE_INTEGRATION_STATUS.md` for release details and `AGENTS.md` for
workspace and credential handling. Older release-preparation notes are history.

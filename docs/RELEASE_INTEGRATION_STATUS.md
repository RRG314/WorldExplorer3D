# 5.3 release status

Updated September 26, 2026. **5.3 is deployed to production.**

The public game now includes the redesigned ship, research workbenches, licensed
furnishings and space-rendering changes from the approved 5.3 candidate.
The GitHub release remains a draft.

## Completed checks

- Source/module consistency, current component checks, test inventory and the
  cleanup sensitivity check passed in the PR workflow.
- Browser checks covered space destinations, star selection, course guidance,
  ship camera modes, research and Pathfinder departure.
- All 25 ship-room views were inspected after the furniture and corridor fixes.
- Two-player backend verification covered research custody, fabrication and
  rejection of stale updates.
- Production shared research is updated. All 11 declared composite indexes and
  12 field-index configurations match ready production indexes.
- The staging package identity and newly added model URLs were verified after
  deployment. Asset authors and licenses are recorded with the models.

## Deployment

The live build is `5.3.0+bbe6502228e3.8044052b36c00b4a.production`.
Its game files match the preserved staging candidate; only Firebase configuration
changed for production. Hosted build and asset manifests were verified after
release, and the deployed Firestore and Storage rules match the package.

Additional recovery and lighting changes are deferred to the refactor work.
Desktop driving and flight missed the configured performance budgets in the
later diagnostic build. The owner chose to deploy the previously approved
candidate and investigate further changes separately. This is not a claim that
all performance targets or physical-phone checks passed.

Passing software-rendered browser checks does not establish phone responsiveness.
Some utility equipment remains simpler than the licensed ship furnishings;
terrain quality and map coverage vary by location. These limitations are also in
[the release notes](../RELEASE_NOTES_5.3.0.md).

See [what changed](RELEASE_COMPARISON_5.3.md), [source identities](RELEASE_SOURCE_OF_TRUTH.md)
and [what verification results mean](TEST-AND-RELEASE-EVIDENCE.md).

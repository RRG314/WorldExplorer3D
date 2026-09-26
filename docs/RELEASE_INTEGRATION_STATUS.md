# 5.3 release status

Updated September 25, 2026. **Release candidate; not deployed to production.**

The public game remains on 5.2. The 5.3 staging preview includes the redesigned
ship, research workbenches, licensed furnishings and space-rendering changes.
The GitHub release is being prepared as a draft, not a publication announcement.

## Completed checks

- Source/module consistency, current component checks, test inventory and the
  cleanup sensitivity check passed in the PR workflow.
- Browser checks covered space destinations, star selection, course guidance,
  ship camera modes, research and Pathfinder departure.
- All 25 ship-room views were inspected after the furniture and corridor fixes.
- Two-player backend verification covered research custody, fabrication and
  rejection of stale updates.
- The staging package identity and newly added model URLs were verified after
  deployment. Asset authors and licenses are recorded with the models.

## Before production

1. Finish the physical-phone walkthrough: location search, walking/driving,
   water, Main Menu, multiplayer controls and ship/space transitions.
2. Deploy the compatible shared-research handler and confirm the production
   function/index inventory. Keep existing configuration and user data.
3. Prepare and verify the production-configured package against the tested
   candidate, retain rollback information, and complete release finalization.
4. Confirm the deployed build before publishing the draft release.

Passing software-rendered browser checks does not establish phone responsiveness.
Some utility equipment remains simpler than the licensed ship furnishings;
terrain quality and map coverage vary by location. These limitations are also in
[the release notes](../RELEASE_NOTES_5.3.0.md).

See [what changed](RELEASE_COMPARISON_5.3.md), [source identities](RELEASE_SOURCE_OF_TRUTH.md)
and [what verification results mean](TEST-AND-RELEASE-EVIDENCE.md).

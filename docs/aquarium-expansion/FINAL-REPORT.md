# Aquarium work status

October 12, 2026. **In progress; not a completed aquarium or release.**

Completed research: audited existing owners, corrected the wrong-institution map,
documented compound OSM identity/public circulation, reviewed five software
candidates, acquired and renderer-tested two animated Sketchfab candidates, and expanded the brief
into concrete architecture, asset, interaction, visual and test requirements.

Implementation still required: actual source-to-loaded-building match; final asset selection/optimization and provenance review; separate aquarium architectural profile;
multi-floor movement/void/glazing support; habitats; study interactions; full-game
failure/reentry and performance checks. The complete public campus remains beyond
the first connected route and cannot be described as completed by that route.

Known independent release failures: ocean resource budgets and sustained outdoor
performance. The old immutable museum approach helper failed; the corrected source
journey now passes, but a fresh immutable package is still required. The completed
14-gate diagnostic recorded eight passes and six failures, including gallery
inventory and identity gates. These are retained, not waived or relabeled.

Production, saved candidates and existing player data are unchanged. No sponsor
or institution has been contacted. No sponsorship, access-proposal or demo language
has been added to the game. Museums and aquariums remain distinct buildings and
experiences; shared technical owners do not imply a shared room template.

See SOURCE-AUDIT.md for code findings, BALTIMORE-ARCHITECTURE.md for evidence,
OPEN-SOURCE-ASSETS.md and LICENSE-REVIEW.md for intake decisions, and VERIFICATION.md
for the precise checks that must pass before any completion claim.

The museum/aquarium boundary is implemented in the local source and 37 focused
component checks pass. Shared floor controls now use authored elevations and
labels. Aquarium/untyped records cannot invoke the museum fit, finish or model
lifecycle. The turtle rendering issue was isolated to an incorrect review camera,
not patched into the asset. The full source museum regression passes 30 checks with inspected screenshots.
The geographic survey exposed incorrect parent suppression and invalid bridge/roof
entry eligibility; those repairs and their current verification are tracked below.
These repairs do not complete the aquarium.

Current local source checks: the complete chain passes all 2,492 component cases.
The exact provider regression now retains the three main exterior sections; their
full-game diagnostic image confirms restored coverage. It also confirms that
inferred heights/generic finishes remain insufficient for aquarium visual approval.
The final combined browser result is recorded in VERIFICATION.md. No part of this
work claims that the aquarium interior or complete public campus is delivered.

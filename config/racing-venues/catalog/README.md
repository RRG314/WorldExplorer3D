# Reviewed shared venue content

These three product datasets retain canonical, published pavement facts for
Silverstone GP, Nordschleife T13 and Daytona's tri-oval/pit branch. They are
server content, separate from player saves, race results and creator drafts.
Each file identifies its source geometry, accepted ground, capture revision,
geographic licences and retained complete native practice journey. Timing lines,
pit speeds, barriers and other authored details are World Explorer game rules.

`scripts/racing/intake-venue-catalog.mjs` reconstructs both lap choices using the
existing course rules and immutable district chunks. Dry-run is the default.
Explicit reviewed publication creates the existing approved course records with
platform ownership. It creates no qualification result, player or award, and
refuses to overwrite an existing creator or differently curated course.
Player publication continues to require its server-timed test and moderation.

Silverstone's separate pit branch is excluded because its current native ground
does not meet admission limits. Daytona retains its accepted complete pit lane.
The remaining nine researched venue layouts are outside this release.

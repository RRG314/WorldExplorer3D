# Reviewed shared venue content

These three product datasets retain canonical, published pavement facts for
Silverstone GP and its complete pit branch, Nordschleife T13, and Daytona's tri-oval/pit branch. They are
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

Silverstone retains the earlier complete GP lap and a separate completed native
pit journey: 73 checkpoints, four-wheel contact, clean exit and no contacts or
penalties. The lower pit corridor is an authored preparation of the pinned
source geometry, not an OSM edit or a surveyed pavement boundary. Daytona's
retained full practice includes its complete pit branch. The importer requires
explicit pit acceptance whenever a selected venue includes a pit branch.
The remaining nine researched venue layouts are outside this release.

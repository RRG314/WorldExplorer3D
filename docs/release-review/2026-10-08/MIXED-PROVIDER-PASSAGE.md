# Mixed-provider passage ownership

The October 8 release recheck found three height discontinuities, up to
5.72 metres, around OSM way 757223802 in Baltimore. Exact OSM describes a
building passage at ground level. The generalized tile describes a tunnel and
borrows the nearby Madison Avenue label. Treating that presentation label as an
authoritative name prevented duplicate retirement and produced two height owners.

The accepted-ground selection now ignores a spatially associated label only
when every generalized segment is covered within 1.5 metres by accepted exact
geometry of the same road class, structure family and vertical layer. It uses
the existing interval-coverage matcher. Exact geometry and semantics are retained.
Nearby parallel roads, explicit names/references, separate layers, partial spans,
truncated data and unavailable exact ground keep their fallback coverage.

The sanitized OSM/Shortbread capture is in
`tests/fixtures/baltimore-building-passage-20261008.json`. Two new regressions
failed before the repair. All 30 focused ownership and bridge/tunnel tests pass
afterward. The live source-world check passes but both Overpass requests failed;
it is fallback evidence, not proof of the mixed-provider repair.

A separate rendered replay supplies only the captured exact passage/connector
and normal live generalized tiles. It verifies one ground-level passage, no
coarse duplicate, and zero discontinuities across 495 connections. The initial
replay incorrectly aborted primary requests, causing provider cooldown before
the regional capture could load; that failed setup is retained. The corrected
replay uses successful controlled-empty primary data and a captured regional
response. Its first movement attempt completed one burst but failed on missing
local weather/marine routing. With hosted staging routes configured, both prescribed driving-input bursts complete
without reported errors. Inspected captures show the actor grounded after about
12 metres of movement near the passage. This is a movement smoke check, not a
claim of a measured entrance-to-exit passage traversal.

Six earlier immutable-candidate rechecks passed: runtime resource diagnostics,
all seven fallback locations, actors/vehicles, terrain boundaries, urban sandbox
and environments/underwater fish. Normal mixed-provider assembled worlds failed
and initiated this repair. These results belong to the e5dadb07 package, not the
new candidate. The complete source chain passes 2,183 tests plus dependencies, ownership, types,
inventory and sensitivity. Full immutable acceptance and production promotion remain pending.

Evidence: `output/verification/mixed-provider-road-junction` and the preserved
October 8 system-release logs. No road width, terrain smoothing, bridge grade,
tunnel clearance or player-save schema was changed by this ownership repair.

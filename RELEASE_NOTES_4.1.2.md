# World Explorer 3D 4.1.2

World Explorer 3D 4.1.2 is the production-architecture release. It replaces
overlapping terrain, transport, structure, building, water, controller, and
environment ownership with explicit contracts and release evidence.

## Highlights

- Accepted terrain is integrity checked, datum normalized, provenance bound,
  and unavailable outside documented coverage instead of silently flattening
  to zero.
- One compiled OpenStreetMap transport graph and surface feeds rendering,
  collision, navigation, bridges, tunnels, ramps, and stacked interchanges.
- Buildings and water retain stable source identity and one publication owner;
  boat entry requires a contained, vertically reachable navigable surface.
- Walk, drive, drone, plane, boat, and space transitions clear stale input and
  preserve valid surface pose.
- Space uses explicit local axes and quaternion camera smoothing. Space and
  ocean renderer, animation, timer, and listener resources are session leased
  and disposed on exit.

## Verification

The locked release suite covers pure data/geometry contracts, runtime
ownership, accepted-ground scenarios at representative locations worldwide,
real bridge/tunnel/ramp/water journeys, real keyboard driving and mode
transitions, planetary round trips, space control invariants, mobile Chromium
and WebKit interaction, sustained controller behavior, repeated lifecycle
cleanup, visual review, and immutable artifact parity.

The production artifact records its full Git commit, dependency-lock hash,
accepted source-release manifest hash, asset-manifest hash, content hash,
Firebase environment, and deployment target. Promotion uses the already-tested
Firebase preview artifact without rebuilding.

## Compatibility and limitations

World detail still depends on available mapped geometry and the accepted-ground
coverage catalog. Unsupported ground coverage fails closed rather than
presenting invented terrain. Provider availability and client GPU capability
can affect live enrichment and performance.

Physical iOS/Android and Windows hardware smoke results are release evidence,
not assumptions derived from desktop emulation. See
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), [DATA_SOURCES.md](DATA_SOURCES.md), and
[ATTRIBUTION.md](ATTRIBUTION.md).

## Rollback

The rollback target is the previously verified 4.1.1 production artifact.
Rollback promotes that retained immutable artifact; it never rebuilds the old
tag.

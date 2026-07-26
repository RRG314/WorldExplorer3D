# World Explorer 3D 4.1.0

World Explorer 3D 4.1 is a stabilization release for the selected-location
exploration experience. It reduces runtime ownership conflicts, improves dense
location performance, and turns the fixes made during 4.1 into repeatable
release gates.

## Highlights

- Uses OpenStreetMap as the sole ordinary Earth vector source and removes the
  Continuous World, Overture, and PMTiles runtime paths.
- Keeps roads, paths, terrain, water, buildings, bridges, tunnels, actors, and
  cameras on one shared surface and location lifecycle.
- Improves dense-location loading and warmed gameplay stability through bounded
  building compilation, spawn validation, render prewarming, and earlier
  release of source working sets.
- Starts sparse land locations on mapped pedestrian networks when available
  and rejects unsafe subgrade, mapped-water, or camera-collapsed arrivals.
- Uses one fitted, texel-stabilized soft-shadow policy on supported medium/high
  quality hardware.
- Retains walk, drive, drone, plane, boat, ocean, Moon, Mars, space, account,
  editor, activity, and multiplayer journeys.

## Verification

The 4.1 release candidate passed the selected-location runtime gate, sustained
Baltimore walk/drive and S-turn profiles, repeated destination and travel-mode
resource plateaus, account and mobile journeys, and the fixed 11-class Apple
Metal geography matrix. The matrix covers Baltimore, Los Angeles, Tokyo,
Monaco, the Swiss Alps, Sahara, Iowa farmland, Lake Tahoe, the North Atlantic,
Golden Gate Bridge, and Holland Tunnel.

Dense representative loads remained under the 20-second cold-load budget. The
hosting artifact is rebuilt from canonical source and checked for identity,
size, attribution, source reachability, and parity before promotion.

## Scope And Known Limits

4.1 does not claim photorealistic regional facades, advanced water/vessel
simulation, pilotable orbital spacecraft, or historical Earth layers. Those
remain later roadmap work. Building detail, snow, rural terrain, tunnel
architecture, water, and boats remain visibly simplified where source data or
the current presentation system is limited.

The dependency review records zero critical advisories and a reviewed
high-severity transitive Firebase/Google toolchain chain that cannot be removed
by an in-range lockfile update. See
[docs/RELEASE_4_1_SECURITY_REVIEW.md](docs/RELEASE_4_1_SECURITY_REVIEW.md) and
[KNOWN_ISSUES.md](KNOWN_ISSUES.md).

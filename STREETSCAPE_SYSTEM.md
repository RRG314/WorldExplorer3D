# World Explorer 3D Streetscape Boundary

Status: the September 6 generated sidewalk presentation was rejected and
removed from runtime before deployment.

## Why it was removed

The rejected generator offset independent eight-metre quads from road
centerlines and deleted sections around intersection, building, parking, and
vegetation masks. In normal play this produced short disconnected strips,
abrupt junction gaps, terrain-like materials, and no coherent relationship
between the curb, block, frontage, and building. That contradicted the supplied
streetscape specification and was not acceptable release behavior.

## Current release behavior

The game retains the established production authorities for:

- mapped road geometry, width, elevation, junctions, bridges, tunnels, and
  ramps;
- accepted terrain and road-surface contact;
- mapped footways and the existing pedestrian navigation graph;
- building footprints, entrances, parking, vegetation, traffic, and vehicle
  collision.

There is no generated curb/sidewalk ribbon, no added walking collision surface,
and no streetscape geometry cost in the release runtime.

## Requirement for a future replacement

A new streetscape system must start from coherent carriageway and city-block
polygons, not independent centerline ribbons. It must join intersection corners,
classify block/frontage surfaces, respect mapped sidewalks and driveways, and
visually distinguish asphalt, concrete, paving, verge, and terrain. It must be
visually accepted in downtown, irregular urban, suburban, commercial,
industrial, rural, bridge/overpass, tunnel, and steep-terrain locations before
it can be connected to runtime or release gates.

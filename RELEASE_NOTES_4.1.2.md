# World Explorer 3D 4.1.2

World Explorer 3D 4.1.2 is the production-recovery and architecture release.
It updates the deployed 4.1.1 selected-location runtime without restoring the
removed Continuous World or adding a second world renderer.

## Verified release baseline

On August 6, 2026, the public app at `https://worldexplorer3d.io/app/` served an
`app/index.html` byte-for-byte identical to GitHub `stable` at commit
`3abce676198056b17d9266b2c16bf80c1848c0b1` (World Explorer 3D 4.1.1). The live
New York selector and gameplay world were also opened and visually inspected.
This release is therefore compared to the actual deployed 4.1.1 baseline, not
to an assumed or locally cached version.

## Highlights

- Accepted terrain artifacts are integrity checked, datum normalized,
  provenance bound, and fail closed outside documented coverage instead of
  silently flattening unavailable elevation to zero.
- One compiled OpenStreetMap transport graph and surface feeds rendering,
  collision, navigation, bridges, tunnels, ramps, and stacked interchanges.
- Dense locations retain broad building coverage and current facade/roof
  visuals while exact road-footprint conflicts are filtered without deleting
  nearby city blocks.
- Terrain uses mapped land-cover semantics and reusable PBR materials. Built-up
  areas surround city buildings without publishing extra OSM sidewalks or
  footpaths.
- Mapped water geometry remains the sole visible water authority. Low terrain
  and rectangular fallback meshes can no longer create false coastal moats or
  blue squares around cities.
- Vehicle contact work is cached and bounded, travel remains location based,
  and screen-relative space controls stay consistent across world axes.
- Space presentation uses observation-derived imagery, deterministic catalog
  data, and physical mass/radius metadata while retaining conservative roof
  inference from mapped building types.

## Loading and ownership

The Earth launch path does not load disabled sidewalk rendering modules. The
removed far-terrain owner no longer performs an elevation-only build followed
by a second mapped rebuild, and near-district buildings are rejected before
far-context retention. These changes remove duplicate or discarded work
without reducing the intended terrain, road, or dense-city building budgets.

The large accepted-ground files in the source diff are versioned runtime data
bound to manifests and hashes. Generated hosting directories, test output,
browser captures, dependency directories, local progress notes, and temporary
release artifacts are excluded from the Git diff.

## Verification

Release verification includes module-identity, terrain-source, accepted-ground,
transport-surface, road-publication, building-coverage, city-surface,
hydrology, controller, space, roof, workload, and production-contract checks.
Deterministic accepted-ground and world-contract fixtures cover representative locations worldwide;
they do not substitute for unrecorded physical-device testing.
The corrected Baltimore candidate was inspected in Chrome before and after the
far-terrain removal at comparable aerial heights; the cyan rectangular bands
were present before removal and absent afterward while city terrain, roads,
and buildings remained visible.

The hosting workflow records the exact Git commit, dependency-lock hash,
accepted source-release manifest hash, asset-manifest hash, content hash,
Firebase environment, and deployment target. Production deployment is not part
of this source pull request.

## Compatibility and limitations

World detail still depends on available mapped geometry and the accepted-ground
coverage catalog. Unsupported ground coverage fails closed rather than
presenting invented terrain. Provider availability and client GPU capability
can affect live enrichment and performance.

No physical-device result is claimed by these notes. See
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), [DATA_SOURCES.md](DATA_SOURCES.md), and
[ATTRIBUTION.md](ATTRIBUTION.md) for provider, coverage, and platform
constraints.

## Rollback

The rollback target is the previously verified 4.1.1 production artifact.
Rollback promotes that retained immutable artifact; it never rebuilds the old
tag.

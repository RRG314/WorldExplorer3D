# Street geometry regression inputs

These finite geographic inputs exercise the current pavement compiler, road
contact storage, cooperative publication and decal projection. They are test
fixtures, not performance reports, player records or destination qualifications.

The Monaco and San Francisco road-surface files retain only the exact ordered
XYZ triangle coordinates consumed by their tests. The three layout files retain
the compiler's input records; business contact, address and opening-hours fields
have been removed. The layout replay pins the reviewed fixture bytes. Contact
and projection assertions retain their existing expected results.

Mapped data derives from OpenStreetMap contributors and the game's existing
world preparation. See [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)
and the repository's [source attribution](../../../ATTRIBUTION.md). These saved
extents do not establish worldwide coverage, current provider content or visual
quality on a device. Historical runtime captures and diagnostic logs remain
outside the public source tree.

# World Explorer 3D 4.3.0

World Explorer 3D 4.3.0 is the Explorer Experience release. It integrates
contextual discovery, field interaction, wildlife, geology, companions and AR
into the existing fixed-location world rather than presenting them as separate
or permanently open systems.

## Explorer experience

- Discover context-aware wildlife, geology, natural-history specimens and
  detector finds while walking through real-world locations.
- Use visible field equipment including the detector, hand trowel, specimen
  brush, camera, binoculars and sediment tools.
- Review observations in the Field Journal and Field Guide, keep acquired
  virtual specimens in Collection, and advance Explorer rank, specialties,
  goals and regional progress.
- Keep gameplay readable through collapsible, task-focused Explorer panels.

## Wildlife, companions and AR

- Wildlife uses distinct bounded procedural models and licensed reference media
  for identification context; generated encounters are never presented as proof
  of a real animal at the selected coordinate.
- Companion choices include three dogs, three cats, two birds and a virtual fox
  with species-aware scale and grounded or airborne following behavior.
- AR supports owned companions, tabletop recorded specimens and a habitat-gated
  virtual wildlife photo challenge through WebXR, camera overlay or interactive
  3D fallback according to device capability.

## World, accounts and multiplayer

- Regional bridge and tunnel handling preserves visible JFX, Bay Bridge, Fort
  McHenry, Yerba Buena and Monaco structure continuity without city-specific
  duplicate renderers.
- Building exteriors now combine the existing high-resolution facade atlases
  with deterministic ground-level doors, frames, handles, thresholds, lights,
  canopies and storefront side panes. Contextual entry activates only at the
  published doorway and works through keyboard and touch controls.
- Living-world pedestrians and vehicles have broader visual variety with bounded
  population and rendering budgets.
- Account and administrator surfaces are consolidated around conventional user,
  moderation, room, content, analytics and operations tasks.
- Firestore rules and Cloud Functions cover trusted Discovery inventory/trading,
  accounts, rooms, shared edits, chat and admin claims.

## Verification

- Firestore emulator security suite: 77/77 assertions.
- Two independent authenticated multiplayer browsers: 8/8 synchronization and
  shared-edit assertions.
- Installed-Chrome Discovery journey: detector, excavation, wildlife, Guide,
  Progress, dog, bird, AR and mobile presentation passed with human-reviewed
  screenshots.
- Installed-Chrome structure journeys visibly verified Baltimore, San Francisco
  and Monaco bridge/tunnel systems.
- Moon, Earth, Mars, Space and Ocean lifecycle journeys passed without duplicate
  renderer or world ownership.
- Strict reachability passed 532/532 production modules with zero orphans; all
  93 hosted assets and 27 dynamic PBR assets are owned.
- Installed-Chrome facade acceptance publishes 112 entrances with three opaque
  instanced detail draw calls, verifies desktop entry and a 390x844 touch entry,
  rejects entry at an arbitrary wall, and retains one world publication.
- The latest repaired dense New York lifecycle measured 541.4 MB post-GC,
  released to 150.9 MB at the title and reloaded at 585.7 MB. The former 2.02 GB
  editable-world rebuild path no longer rebuilds the provider world.

The release matrix exercises representative locations worldwide. This candidate
is not approved for deployment: Baltimore and New York building-enrichment
fallback coverage, Miami and Tokyo outage landcover, Everglades far-horizon
fallback, and Lake Tahoe and Panama Canal water-start vehicle selection must be
corrected and rerun. Manual phone and integrated-GPU acceptance also remains
open. Production therefore remains on the verified 4.2.1 rollback artifact.

## Rollback

Rollback target: commit `74f1a47d437027bae5d7bd5745e35d1db0bbfe3e`,
the previous `stable` production source for version 4.2.1. Retain and promote its
existing artifact when available; do not rebuild historical source as 4.3.0.

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
- Living-world pedestrians and vehicles have broader visual variety with bounded
  population and rendering budgets.
- Account and administrator surfaces are consolidated around conventional user,
  moderation, room, content, analytics and operations tasks.
- Firestore rules and Cloud Functions cover trusted Discovery inventory/trading,
  accounts, rooms, shared edits, chat and admin claims.

## Verification

- Firestore emulator security suite: 70/70 assertions.
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
- A fresh title-release journey removed 1,020 geometries and reduced measured
  JavaScript heap from 689.5 MB to 469.8 MB before a clean Earth reload.

The heavier Living/Editable World edit-and-reload journey reached a 2.02 GB heap
high-water mark. World release behavior is verified, but this remains a disclosed
performance risk for dense scenes and lower-memory hardware.

## Rollback

Rollback target: commit `74f1a47d437027bae5d7bd5745e35d1db0bbfe3e`,
the previous `stable` production source for version 4.2.1. Retain and promote its
existing artifact when available; do not rebuild historical source as 4.3.0.

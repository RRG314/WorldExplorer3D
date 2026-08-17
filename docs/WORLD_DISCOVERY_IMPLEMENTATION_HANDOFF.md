# World Discovery — Playable Build Handoff

Date: 2026-08-16
Status: ready for local hands-on testing; not deployed

## Start here

Open `http://127.0.0.1:4192/app/`, launch Baltimore or another Earth location,
switch to walking, open the existing **Exploration** menu, and choose
**Field Journal & Activities** (keyboard shortcut: **X**). The first-use guide explains the
loop. The interface stays absent during normal play; an active field task uses
only a compact status control until the player reopens it.

Suggested acceptance path:

1. Open World Discovery and complete a detector find.
2. Try **Inspect**, **Photograph**, or another action offered by the current cell;
   the panel minimizes and the compact resume control supplies range and bearing.
3. Check **Journal** and **Expedition** for the Field Guide, saved collection,
   progress, equipment, and museum.
4. In **Companions**, complete the three-step trust/observation sequence, then
   feed and train the active companion.
5. Load a contrasting world such as a beach, forest, river, or rural field and
   confirm its actions differ from downtown.
6. Resize to a phone-width window and repeat the detector flow.

## Implemented in this build

- One immutable environment, eligibility, contextual-action, detector, field
  activity, and bounded wildlife derivation attached to the accepted
  `WorldSnapshot` lifecycle.
- Twenty-five contextual activities and seventeen free-testing tools covering
  the first playable pass of geology, panning, fossils, beachcombing, foraging,
  wildlife tracking/photography, fishing, sonar, diving, treasure/history,
  farming/forestry/camping, surveying, weather, astronomy, urban work, delivery,
  and virtual search-and-rescue.
- Deterministic detector targets with sweep, bearing, signal, classification,
  semantic depth/tool selection, excavation, reveal, collect/leave, and stable
  revisit behavior.
- Progressive opportunity density: compatible cells publish three finite detector
  targets and two field-action targets. Trailhead exposes the first local pass,
  Surveyor exposes the follow-up pass at three records, and Naturalist exposes
  the third detector pass at ten records. This raises encounter availability
  without revealing every outcome immediately or turning locations into endless
  random generators.
- Field actions now use a locate → approach → hold → document loop. Opportunities
  are within the current 160 m survey cell, the minimized control provides distance
  and bearing, observation starts within 24 m, and moving beyond 31 m pauses it.
- IndexedDB profiles, duplicate-proof claims, collection, Field Guide, five
  progression disciplines, regional summaries, non-consuming museum displays,
  and exportable local records.
- Distinct bounded articulated models for the trail hound, harbor cat, woodland
  fox, white-tailed deer, small mammal, mallard, and rock pigeon. Companion
  trust/unlock flows retain unique identity, one-active enforcement, following,
  vehicle safety, care, training, personality, and variation.
- Character-attached detector, shovel, trowel, rock hammer, specimen brush,
  camera, binoculars, field lens, and sediment pan presentations, including a
  first-person attachment path. Detector controls and signal display are no
  longer a prop floating beside the actor.
- Bounded in-world granite, quartz, fossil-shell, dandelion, sea-glass, and
  general field-evidence presentations for revealed natural-history records.
- Ten locally optimized real reference photographs for animals, a plant,
  geology, mineralogy, and fossils. Every image includes alt text, creator,
  license, and Wikimedia Commons source metadata; image pixels total about
  1.5 MB and list/card images lazy-load. They are identification references,
  never claims that the subject exists at the selected map location.
- An app-native V4 drawer entered through the existing Exploration menu. It uses
  World Explorer's square panels, blue active accents, compact hierarchy, and
  contextual disclosure instead of a persistent parallel dashboard.
- Four product-level destinations replace eight technical tabs: **Explore** is
  current in-world play, **Journal** combines identifications and saved records,
  **Companions** owns care/following, and **Expedition** combines rank, equipment,
  museum display, and the optional collapsed online exchange.
- Editable World outputs for virtual land-use activities without changing mapped
  source data.
- Signed-in receipt persistence plus owner-readable/server-write-only Firestore
  records. Ordinary client-reported receipts remain non-tradeable; only
  independently validated/admin-issued records can enter atomic offer, accept,
  cancel, lock, and ownership-swap transactions.
- Privacy-minimized telemetry events that exclude coordinates, claim IDs, source
  IDs, and free text.

## Intentional first-test boundaries

- No purchase gates or paid currency are enabled; all tools are usable in free
  testing mode.
- No Cloud Functions, rules, or hosting changes were deployed from this task.
- Production-scale biodiversity/geology ingestion, shared-room unique encounter
  claims, and the full player-facing trade offer browser remain later
  acceptance-driven expansions. The current image-backed species/specimen set
  is intentionally curated and local while occurrence logic remains procedural
  and clearly labeled rather than inventing exact real-world claims.

## Focused verification

- Discovery fixtures/state machines/progression/privacy: passed.
- Discovery backend normalization and 20 Cloud Function exports: passed.
- Firestore security: 70/70 passed.
- Editable World model, ES-module identity, maintainability ownership, and
  whitespace validation: passed.
- Installed Chrome: detector tutorial → signal → classify → excavate → reveal →
  collect, field locate/collapse/resume/record, Journal, Expedition, companion
  care/training, and mobile layout: passed with zero fatal browser errors.
- Discovery visual budget gate: seven distinct animal models, five natural-
  history presentation types, nine held-equipment types, ten loadable reference
  images, and character attachment: passed.

# Major racing venue coverage

Owner decision, October 28, 2026: **balanced circuits, stock-car ovals and rally stages**, with Open rivals and racing crews as the primary progression and optional collector/skill goals integrated with the existing Explorer. No purchase or production deployment.

## Three-venue launch scope

The owner's October 31 correction supersedes the twelve-pack launch requirement.
This release contains **Silverstone GP, full Nordschleife T13 and Daytona
tri-oval**. Complete native private-practice journeys already pass for all three;
presentation, moving desktop budgets and changed shared catalogue admission now pass.
Silverstone also has a completed native 73-checkpoint pit journey, including
four-wheel support and a clean exit. Final packaging is recorded in RELEASE_READINESS.md.
The other nine references below are deferred. Retain their source work without
enabling unfinished packs or treating their production as a launch blocker.

## Retained coverage register

The source register is `app/js/racing/venue-catalog.js`. It contains twelve **researched layout references**, four in each group. Three main courses are playable with retained complete native journeys; their current acceptance and evidence limits are recorded in RELEASE_READINESS.md. The existing Monaco district practice run is a qualified 705.99 m city route, not the Monaco Grand Prix circuit. Course names, target lengths and references do not certify geometry or provide a content licence.

Silverstone and Daytona include their accepted complete pit branches. Silverstone's main loop and
Nordschleife T13 retain their completed practice journeys. The following table
is historical source research; the other nine references are not enabled packs.

| Group | Venue and exact layout | Reference length | Primary factual source |
|---|---|---:|---|
| Circuit | Nürburgring full Nordschleife, T13 timing line | 20.832 km | [Venue facts](https://www.nuerburgring.de/info/nuerburgring/race-tracks/nordschleife), [timing definitions](https://nuerburgring.de/info/nuerburgring/records) |
| Circuit | Silverstone Grand Prix | 5.891 km | [Formula 1 circuit guide](https://www.formula1.com/en/racing/2026/great-britain) |
| Circuit | Spa-Francorchamps Grand Prix | 7.004 km | [Formula 1 circuit guide](https://www.formula1.com/en/information/belgium-circuit-de-spa-francorchamps.3LltuYaAXVRU8iezEsjzGw) |
| Circuit | Monza Grand Prix road circuit | 5.793 km | [Venue specifications](https://www.monzanet.it/en/circuit/) |
| Oval | Daytona tri-oval | 2.5 mi / 4.02336 km | [Venue history/specifications](https://www.daytonainternationalspeedway.com/about-daytona-international-speedway/) |
| Oval | Indianapolis oval | 2.5 mi / 4.02336 km | [Venue oval event information](https://www.indianapolismotorspeedway.com/events/indy500/event-info/open-test) |
| Oval | Talladega tri-oval | 2.66 mi / 4.28097 km | [Venue facts](https://www.talladegasuperspeedway.com/track-facts/) |
| Oval | Bristol concrete oval | 0.533 mi / 0.85779 km | [Venue media specifications](https://www.bristolmotorspeedway.com/media/) |
| Rally | La Bollène-Vésubie → Moulinet via Turini, 2026 | 23.45 km | [Automobile Club de Monaco stage report](https://acm.mc/racefeed/es15-la-bollene-vesubie-moulinet-1/) |
| Rally | Ouninpohja, historical 2025 stage | 23.98 km | [Organiser's 2025 guide](https://sectorallyfinland.fi/wp-content/uploads/2025/03/SRF25-RG1_A4_FINAL_200325-1.pdf) |
| Rally | Fafe, 2026 stage | 11.18 km | [Organiser's route announcement](https://www.rallydeportugal.pt/content.aspx?eid=15739&idioma=1&menuid=2) |
| Rally | Umeå full stage, 2026 | 10.23 km | [Competing team's preview](https://toyotagazooracing.com/wrc/release/2026/rd02-preview/), [WRC stage guide](https://www.wrc.com/en/news/stage-guide-wrc-rally-sweden-2026) |

Mile conversions are arithmetic using 1609.344 m/mile; quoted circuit distances are reference specifications, not measured game geometry. The full Nordschleife, tourist timing, GP track and combined endurance routes need distinct identifiers and records. Rally stage names recur with different directions and start/finish positions across years. A year or variant change invalidates certification and record keys. Ouninpohja is explicitly historical; no claim that it belongs to the 2026 itinerary.

“Every big course” is the long-term coverage objective, not a defensible finite completion claim. Further intake must cover additional geographic regions and series, using dated references from the [FIA circuit register](https://www.fia.com/circuit-safety), [NASCAR national-series schedule](https://www.nascar.com/nascar-cup-series/2026/schedule/) and [WRC season directory](https://www.fia.com/events/world-rally-championship/season-2026/fia-world-rally-championship-2026). These identify coverage leads, not content licences. Do not import a stale calendar and call its names playable. Add exact layouts to this register as their facts are verified, preserving the balanced release mix rather than filling the catalogue only with short, easy circuits.

## What a finished venue must contain

Additional source/ground intake is recorded in `MAJOR_VENUE_PIPELINE.md`: exact
Spa GP, Monza GP and Talladega main/pit geometry, plus normalized Talladega
terrain. These inputs do not add playable packs to this register. Bristol and
Indianapolis retain explicit source-length discrepancies. The launch-specific acceptance and final package boundaries are
recorded in RELEASE_READINESS.md; the general future-pack criteria remain below.

1. A versioned geographic pack with independently reusable rights-cleared source geometry, source identifiers, survey date, length reconciliation, direction, elevation, banking, usable width and vertically separate crossings. No hand-drawn approximate oval standing in for a real tri-oval.
2. Admission through existing world publication, transport support, collision and session owners. Complete required road/support data must be ready before the race; no forced reload travel or second terrain source that disagrees with ordinary exploration. Preserve nearby mapped buildings, waterways, entrances and real identities.
3. Surface/collision agreement at all four wheels, including kerbs, crests, banking transitions, tunnels and bridge decks. Missing bank heights cannot be filled with flat terrain and called correct.
4. Track-specific edge paint, timing/grid positions, kerbs, braking references, barriers/catch fencing, runoff, pit entry/exit, pit buildings, visible landmarks, signs and landscape. Asset provenance, metre scale, LOD, texture limits and collision envelopes are mandatory. Original World Explorer event signage is suitable; official sponsor graphics and series logos require separate rights.
5. Appropriate rules: circuit sectors/cuts/pit entry; oval lane behaviour, rolling starts/flags, safe pit entry and drafting where supported; rally staggered timing, ordered split gates, pace notes, loose/icy surfaces, jumps/landings and bounded stage recovery. The current ghost practice run does not satisfy these disciplines by renaming its selector.
6. Actual complete laps/stages with human input, AI, the longest eligible chassis and desktop/mobile presentation. Multiplayer uses the shared authenticated authority and durable result receipts; no client-reported competitive results.
7. Bounded first playable/load time, frame pacing and resource-release evidence for the exact pack and build. Default location-based play remains available. Entire Nordschleife/high-banked oval/rally mobile acceptance has not occurred.

Ordinary city-adapter limits remain explicit: 270 world-unit starter district
(maximum request 1200), 200–8000 m routes, at least 6 m width and at most 15%
crossfall. Reviewed long venues now bind bounded source membership and extent
through qualification, canonical storage and authority reconstruction; the
Nordschleife world and full-loop practice journey pass. Its explicitly admitted
banked-road model retains the shared contact/force contract and a 70% crossfall
ceiling. These capabilities do not themselves certify an oval or rally pack.
Daytona's published 31°, Talladega's 33° and Bristol's up-to-28° banks exceed the
ordinary 15% envelope; their crossfalls, approximately 60.1%, 64.9% and 53.2%,
fit the reviewed model's 70% ceiling. That arithmetic is not evidence of their
actual surface geometry, banking transitions or appropriate oval rules. Rally
can need narrower roads, varying grip and flight/landing support. Extend the
shared surface/controller contract where needed and prove a complete venue
before admission.

## Data and asset acquisition

- [OpenStreetMap data](https://www.openstreetmap.org/copyright) is ODbL: retain attribution and adapted-database obligations. Official venue maps/photographs are factual research references, not automatically reusable texture/geometry files. The racing SVG now displays its own visible OSM credit.
- [OSMF vector service policy](https://operations.osmfoundation.org/policies/vector/) prohibits bulk prefetch/offline tile archives and gives no service guarantee. Do not build a worldwide venue library by scraping the runtime tile service. Use an appropriate licensed bulk/geodata source or authorised survey intake and retain an openly distributable derived-data recipe where required.
- [Poly Haven Asphalt Track](https://polyhaven.com/a/asphalt_track) and [Asphalt 03](https://polyhaven.com/a/asphalt_03): free CC0 material candidates, with normal/roughness/diffuse sources and 1K/2K variants available. [Licence](https://polyhaven.com/license) permits commercial use and redistribution of assets, but not arbitrary website artwork. Use the actual material downloads, not their preview images. No download/import completed in this checkpoint.
- [Kenney Racing Kit](https://kenney.nl/assets/racing-kit): free CC0, 110 publisher-listed files. Useful as a blockout/reference or distant small props; it is not an exact high-detail replica of these venues or an automatic style match for the detailed BMW. No import completed.
- [Sketchfab Nürburgring candidate](https://sketchfab.com/3d-models/nurburgring-circuit-02d04e005e274e0da846dd62b9e98125): search surfaced an old downloadable listing, but direct inspection returned HTTP 403. The [official public model metadata](https://api.sketchfab.com/v3/models/02d04e005e274e0da846dd62b9e98125) subsequently verified francobravo as author, CC BY 4.0, 6,930 vertices / 13,864 faces and a description of a 420 × 400 mm printable STL sculpture. **Rejected for driving; no asset archive downloaded.** Do not substitute a game-extracted mod or decorative circuit sculpture for a surveyed drivable track.

No paid asset is selected. No owner purchase is currently needed to complete the shared rules or the practice improvements.

- [Bacinger F1 GeoJSON](https://github.com/bacinger/f1-circuits): author states MIT for the repository, but acknowledges an initial Google source and describes altitude as primarily a start/finish reference, sometimes nearby-city altitude. This does not establish a fully surveyed surface, banking or safe redistribution of all underlying data. Not imported as authoritative course geometry; resolve provenance and measure complete 3D support first.

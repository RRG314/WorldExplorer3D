# Racing release readiness

Updated October 31, 2026. Launch scope is **Silverstone GP, full Nordschleife
T13 and Daytona tri-oval**, with the shared real cars and existing racing
product. The other nine researched layouts are deferred. Nothing in this
candidate has been deployed to production.

## Three native main courses

| Course | Retained complete practice | Changed presentation and moving desktop check |
| --- | --- | --- |
| Silverstone GP | 5.87 km, 230 gates; Results, Journal and walking return; no barrier contacts or penalties | 22 source-bound grandstands, 326 landscape ways and original bend paint; 59.01 FPS, p95 17.7 ms, maximum 50.1 ms |
| Nordschleife T13 | 20.710 km, 784 gates; complete loop, Results, Journal and walking return; no barrier contacts or penalties | Native relief, reviewed decks/approaches, kerbs, rails and denser mapped woodland; 46.79 FPS, p95 34.2 ms, maximum 84.4 ms |
| Daytona tri-oval | 4.011 km, 161 main gates and the full 40-checkpoint pit branch; Results and Journal; no barrier contacts or penalties | Curved grandstand, corrected low paddock exteriors/canopies, continuous paint, catch fencing and pit stalls; 49.82 FPS, p95 33.4 ms, maximum 67.4 ms |

Each moving window is approximately 60 seconds, with continuously moving cars,
zero frames over 250 ms and zero barrier contacts or WebGL errors. Controlled
analogue input used the existing input owner. These are desktop observations,
not physical-phone or headset performance claims. Completed laps and the
separately accepted held-input interpolation repair are reused, not repeated
for scenery, catalogue or packaging edits.

The courses are geographic game interpretations, with explicitly authored
timing, rules and scenery. They do not claim official homologation, surveyed
pit speeds, sponsor rights or factory handling.

## Silverstone pit acceptance

The complete separate pit lane now passes native-world acceptance: 1.120 km,
73 ordered checkpoints, clean entry and exit, zero barrier contacts and
penalties. All 181 sampled contact poses have four supported wheels; maximum
wheel gap is 1.83 cm and penetration is 1.71 cm. The shared circuit rule is
60 km/h. Native publication qualifies all 589 main/pit spans with no rejected
spans, and the ordinary Racing selector offers both complete GP lap choices.

The original mapped line runs beside the rising pit wall. A conservative
six-metre game corridor on the lower apron offsets up to 3.5 metres and tapers
to the exact original junctions. Pinned map nodes/tags and native ground are
retained. Shared road preparation compiles this authored alignment before
junctions, terrain, meshes and contacts; no runtime height fallback or actor
pose smoother was added. Native-ground crossfall is at most 8.6%, within the
unchanged 15% fence. This is an authored usable corridor, not a surveyed width.

The accepted complete GP lap is retained. Enabling full-corridor terrain detail
also changes the published height of five main-track spans at the pit fork by
more than half a metre. Their geometry remains mapped, and full main/pit wheel
qualification passes. A short held-input check of that changed fork in the
final package remains required; a repeated full GP lap is unnecessary.

## Shared product and online integration

- The BMW M3 E46 road coupe, BMW M3 E92 race car and Porsche 911 Carrera 4S
  retain their actual licensed source models, garage ownership, upgrades,
  condition, custody, model leases and authored live instruments. They are not
  GT3 or factory-cockpit claims. Their original licences and derivative recipes
  accompany the assets. Actual-world purchases, driving, model changes,
  reload persistence and walking handback are retained.
- Three real Auth/Firestore emulator accounts bought and selected those model
  IDs, joined the actual WebSocket authority, recovered a disconnect, finished
  on the server clock, saved class-specific records and received replay-safe
  awards once. App Check was a local seam; accepted live city Auth/App Check
  evidence remains separate.
- The three native catalogue datasets reconstruct both lap choices through
  the shared browser, service and Functions course contract. Actual Auth,
  Firestore transactions and WebSocket joins/ready/start/leave pass with all
  three real cars at each venue. Fourteen Nordschleife and three Daytona
  storage chunks remain complete. Publication retry is idempotent and custody
  releases. These checks accept changed catalogue/admission boundaries, not
  three new live-cloud full-race results.
- Large unbanked courses now use the existing compact course projection,
  resolved only against the browser's verified course key. The native GP
  no longer floods the socket during join. The existing 128 KiB output-buffer
  and 256 KiB browser-message limits remain unchanged. Actual browser-client
  callback and two-socket checks pass.
- The accepted two-account live city race, trusted result/250+150 Credit
  settlement, Journal, class Rankings and walking return remain valid. Creator
  qualification/moderation, rivals/crews and existing-wallet progression are
  retained. See [shared acceptance](SHARED_RACE_ACCEPTANCE.md),
  [career](CAREER.md) and [VR and records](VR_AND_RECORDS.md).
- Portrait/landscape/desktop Racing layouts pass. Long Nordschleife event names
  use their intrinsic row height; selection no longer overlaps the summary.
  Existing phone/tracked VR lifecycle and control evidence is retained.

## Distribution

Venue ground catalogue URLs resolve inside both source and immutable delivery
roots with identical artifact hashes. The packaged Daytona load exposed and
then verified the corrected ground delivery boundary. Native main/pit
qualification still retains all 139 spans. Lake Lloyd's explicit lake subtype
now survives generic natural-water metadata.

The release must coordinate the frozen Hosting artifact, generated race engine,
Functions, indexes and reviewed shared catalogue. The catalogue importer is
read-only by default and uses the existing immutable district/course records.
It creates no player or qualification result, mints no awards, and refuses
foreign or changed existing content. Production publication requires an
explicit project and production-release flag. See [rollout](THREE_VENUE_RELEASE.md).

Physical Apple, calibrated phone-viewer, tracked-headset and sustained
physical-phone acceptance remain unverified. The owner has explicitly chosen
not to wait for hardware they do not own. Location-based play, optional
continuous exploration, buildings, Ocean, Space, saves and platform launch
owners remain in place. This package does not claim a new native-store release.

## Candidate rebuild in progress

The prior production-configured candidate is superseded by the completed pit
work. A matching frozen artifact, catalogue receipt and coordinated rollout
handoff are being rebuilt. Nothing has been deployed. Existing production
code/ground retention and rollback remain required.

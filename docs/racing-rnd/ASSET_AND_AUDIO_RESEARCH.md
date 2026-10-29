# Asset and audio intake

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

No further purchase is necessary for the current vehicle foundation. The source fleet includes everyday hatchback/sedan/SUV/pickup/vans,utility trucks,bus,taxi,classics and sports coupes. Do not require more sports cars to fix existing selection,spacing or ownership.

October 29 racing expansion adds three original unbranded CC0 Innerscene bodies:
[front-engine grand tourer](https://www.innerscene.com/tools/library/3d-parts/generic-front-engine-grand-tourer-coupe-9a08f635),
[sports coupe](https://www.innerscene.com/tools/library/3d-parts/generic-1990s-japanese-style-sports-coupe-ace64592)
and [hot hatch](https://www.innerscene.com/tools/library/3d-parts/generic-hot-hatch-a60561a5).
The game names them Meridian GT, Apex ClubSport and Kestrel Rally. Original
competition equipment distinguishes the ClubSport and rally derivatives. The
three local GLBs total 5.38 MB, each below 65,000 triangles, with separate wheel
pivots and reviewed cabin eyes. Hashes, exact measurements, rights and the offline
recipe accompany the assets. The original Explorer fleet remains unchanged.

All three use the shared garage, canonical server prices, condition, upgrades,
room leases and vehicle/session controllers. The source and service catalogs are
generated together. Their handling remains original game tuning within the
shared 120 mph ceiling. A rally body does not itself certify loose-surface,
jump/landing or completed rally-stage gameplay. Controlled render and held-input
checks are separate from final rendered-world and network acceptance.

Future gaps: detailed everyday SUV/pickup/van,heavy transport,specialty/offroad,rally/race bodies,and motorcycles only after suitable dynamics. [Quaternius Cars](https://quaternius.com/packs/cars.html) is already the creditedCC0source for several classes. [Sketchfab licence agreement](https://sketchfab.com/licenses) must be reviewed with each actual model: a creator's mesh licence does not automatically establish all manufacturer/trademark rights. ExistingCCBY4derivatives retain author/source/licence/modification notices. No new branded candidate is approved merely because it is downloadable.

Intake needs measured triangles/materials/textures,physical envelope,clean axes,pivot,glass/cabin visibility,wheel names,licence provenance and a reproducible derivative recipe. Preserve originals privately;only needed runtime derivatives/licences go into the public repository. Current `prepare-explorer-fleet-assets.mjs` and model leases remain the pipeline.

Engine audio needs RPM/load/shift signals or clearly arcade approximations. Do not copy recorded audio from racing games or videos. Research CC0/procedural recordings first;no paid pack selected. Surface/skid/impact sounds must use current collision/grip events and an existing AudioContext lease,not an audio timer per car. Motion effects/vibration stay optional and bounded.

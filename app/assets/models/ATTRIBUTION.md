Curated Vehicle Assets

BMW 525i E34 Player Vehicle

- File: `vehicles/bmw-525i-e34.glb`
- Title: BMW 525i E34 | Project Zomboid
- Creator: Uralvagonzavod
- Source: https://sketchfab.com/3d-models/bmw-525i-e34-project-zomboid-c65aa3b7687d4f5dbbabdfad0b7816bb
- License: Creative Commons Attribution 4.0 (CC BY 4.0).
- Notes: Used as the close player-vehicle visual. The existing World Explorer vehicle controller, collision envelope, headlights, damage rules, and procedural fallback remain authoritative.

Quaternius Close-Traffic Vehicle Family

The upstream Cars Pack is published by Quaternius under CC0 1.0. Its `License.txt` is Google Drive file ID `1CqsvhpIzBNSDlZsBWdJcJNC1B-TE3cXK`: https://creativecommons.org/publicdomain/zero/1.0/

- Files: `vehicles/traffic/compact-hatchback-v1.glb`, `vehicles/traffic/four-door-sedan-v1.glb`, `vehicles/traffic/trail-suv-v1.glb`, and `vehicles/traffic/city-taxi-v1.glb`
- Upstream titles: Cars Pack — NormalCar2, NormalCar1, SUV, and Taxi
- Creator: Quaternius
- Source: https://quaternius.com/packs/cars.html
- Source file identities: Google Drive OBJ file IDs `1Msv8m0vli0YGLLEHIx_ojM6grpmD_ygz`, `1dfatafHMRRxI3WE5srluI4Y4WD72pCD6`, `1_26j_0vooPFidwFSlHRWlF1ifphQZemK`, and `1UMriCC_JWsDfpTh5tBjQdhAj9_lJeuR2`, respectively.
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256 values: `e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39`, `bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462`, `1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6`, and `14b2f982f8a501565702ecb56f917c82e9abae914fa3f76d2f622a8670598af1`, respectively.
- Processing: converted from OBJ to extension-free, texture-free GLB with `obj2gltf`; original geometry and named materials were retained.
- Notes: Used only for the bounded close-detail traffic layer: at most four distinct curated cars on desktop and two on mobile. The existing articulated instanced traffic remains authoritative at mid/far distance. Existing routes, motion, collisions, entry, doors, damage, and cleanup remain authoritative; the procedural close vehicle returns during entry, damage, load failure, or disposal. The BMW E34 remains the sole player-car model.

Curated Character Assets

The upstream pack's `License.txt` is Google Drive file ID `1TTvylHa1CsiJuHFWWiv6PFGhLM-aAH5z` and declares CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

The Ultimate Modular Women pack's `License.txt` is Google Drive file ID `1lIFL16xEpoPbr0j_HUATgmcEnAmYoIK2` and declares CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

Field Explorer

- File: `characters/field-explorer-v1.glb`
- Upstream title: Ultimate Modular Men — Adventurer
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularcharacters.html
- Source file identity: Google Drive `Adventurer.gltf`, file ID `1fzSq1Rr037f7QkfXPWEAzmbLMNx-FpPA`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `84b8cc2f07abe4b48bae8155a79868bfac5216b4b0a1b4d624f39f3698d6e0c4`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, modeled backpack, and all 24 animation clips were retained.
- Notes: Used for the close walking player. The existing movement, collision, interaction, equipment, vehicle, and world-state systems remain authoritative. The procedural Field Navigator remains the load-failure fallback.

Field Explorer — Woman

- File: `characters/field-explorer-woman-v1.glb`
- Upstream title: Ultimate Modular Women — Adventurer
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularwomen.html
- Source file identity: Google Drive `Adventurer.gltf`, file ID `1uxAFnDp73NO1c16LvHHjAYh1-deMNk5I`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `b76cf5acefdbb213add675bd1b822ebd41d232c6f0cb21969c981122d3b86a32`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, modeled backpack, and all 24 animation clips were retained.
- Notes: Available alongside the Field Explorer man through the persistent Backpack character choice. Both choices retain the same existing player movement, collision, interaction, equipment, vehicle, and world-state authority; the procedural Field Navigator remains the loading/error fallback.

City Explorer — Hoodie

- File: `characters/city-explorer-v1.glb`
- Upstream title: Ultimate Modular Men — Casual Hoodie
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularcharacters.html
- Source file identity: Google Drive `Casual_Hoodie.gltf`, file ID `1em1So1xwwQNfHJYMvzKcXkZllvtxpKP5`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `0dba57f454956ca5886a2d72e6c5a65f6dc9d45987dc3d47bfe419ff0d0b82b4`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all 24 animation clips were retained.
- Notes: One member of the balanced nearby NPC family. Detailed pedestrians use the four bundled men/women variants; the procedural urban NPC remains the loading/error and broader-population fallback.

City Explorer — Casual

- File: `characters/city-explorer-casual-v1.glb`
- Upstream title: Ultimate Modular Men — Casual 2
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularcharacters.html
- Source file identity: Google Drive `Casual_2.gltf`, file ID `1Jn7kULNmrtqP8BUUL19h8MhbdOnwPFhv`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `d6a8fc4ad8ef22104773eba260f211c6ec8d797f1f15c87207e0e4edf942d83d`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all 24 animation clips were retained.
- Notes: One member of the balanced nearby NPC family. The broader mid/far population stays on the articulated instanced path.

City Explorer — Casual Woman

- File: `characters/city-explorer-woman-casual-v1.glb`
- Upstream title: Ultimate Modular Women — Casual
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularwomen.html
- Source file identity: Google Drive `Casual.gltf`, file ID `18b3WwlrwrFYWAM7BcnjWeIxKJyxAQiGh`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `e406f91a5fc6f94cc2ee0df0bfcfcc4c8c4e3949412daeac586201b75df244a6`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all 24 animation clips were retained.
- Notes: One of the two women in the balanced nearby NPC family. Existing pedestrian motion, collision, reactions, interactions, combat state, and cleanup remain authoritative.

City Explorer — Worker Woman

- File: `characters/city-explorer-woman-worker-v1.glb`
- Upstream title: Ultimate Modular Women — Worker
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularwomen.html
- Source file identity: Google Drive `Worker.gltf`, file ID `1iwF_fqDErPH9uyol6NmS-MnzGgsZ5ejV`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `7ce26118c4ec96b06a920519982d1118d86600712261b19d4936e7c6135b40db`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all 24 animation clips were retained.
- Notes: One of the two women in the balanced nearby NPC family. Every promoted close pedestrian is assigned one of the four cohesive family assets, bounded to three instances per variant on mobile and four on desktop; the procedural model appears only while loading or on failure.

Civic Responder

- File: `characters/civic-responder-v1.glb`
- Upstream title: Ultimate Modular Men — SWAT
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularcharacters.html
- Source file identity: Google Drive `Swat.gltf`, file ID `1VGmU5f8a43NBT22JWB507NDSLbmNxzF9`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `0cd2b3876e5f20f3c85ffc5dcccd05dccb7aaec86235434f7f449f3b44417b7c`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all 24 animation clips were retained.
- Notes: Used for at most two deployed civic officers on desktop and one on mobile. Existing responder dispatch, approach, arrest, combat, equipment, condition, and cleanup remain authoritative; the procedural officer remains the loading/error fallback.

Expedition Ship Crew

- File: `characters/ship-crew-v1.glb`
- Upstream title: Ultimate Modular Men — Spacesuit
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularcharacters.html
- Source file identity: Google Drive `Spacesuit.gltf`, file ID `1B6zZMmjGYzk38bIgv8a0hEodH2sgbKnw`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `42454123d38585e901b3e28fd1415e6764f12d7e2f43eb29c4d6b3bc37c13b0c`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all 24 animation clips were retained. Per-instance cloned materials are role-tinted at runtime; geometry remains shared.
- Notes: Used for the seven established moving ship-crew roots. Existing crew identity, assignments, routes, rooms, interactions, deck visibility, and cleanup remain authoritative; the procedural crew remains the loading/error fallback.

Mars Exploration Rover
- File: `mars-exploration-rover.glb`
- Source: NASA Mars Exploration Rover 3D model
- URL: https://science.nasa.gov/resource/mars-exploration-rovers-3d-model/
- Notes: NASA media usage guidelines apply.

Curated Earth Landmarks
- `landmarks/eiffel-tower.glb`: "Eiffel.stl" by ingoenius, sourced from Wikimedia Commons and converted to GLB. CC0 1.0. https://commons.wikimedia.org/wiki/File:Eiffel.stl
- `landmarks/elizabeth-tower.glb`: "Big Ben.stl" by Microsoft, sourced from Wikimedia Commons and converted to GLB. CC BY 4.0. https://commons.wikimedia.org/wiki/File:Big_Ben.stl
- `landmarks/pyramid-khufu.glb`: "Pyramid of Khufu.stl" by Drummyfish, sourced from Wikimedia Commons and converted to GLB. CC0 1.0. https://commons.wikimedia.org/wiki/File:Pyramid_of_Khufu.stl
- Placement and scale use real geographic coordinates and published landmark dimensions; OSM/Overture remain the sources for surrounding world geometry and collision.

Curated Vehicle Assets

BMW 525i E34 Player Vehicle

- File: `vehicles/bmw-525i-e34.glb`
- Title: BMW 525i E34 | Project Zomboid
- Creator: Uralvagonzavod
- Source: https://sketchfab.com/3d-models/bmw-525i-e34-project-zomboid-c65aa3b7687d4f5dbbabdfad0b7816bb
- License: Creative Commons Attribution 4.0 (CC BY 4.0).
- Notes: Used as the close player-vehicle visual. The existing World Explorer vehicle controller, collision envelope, headlights, damage rules, and procedural fallback remain authoritative.

Curated World Traffic and Response Fleet

The upstream Cars Pack is published by Quaternius under CC0 1.0. Its `License.txt` is Google Drive file ID `1CqsvhpIzBNSDlZsBWdJcJNC1B-TE3cXK`: https://creativecommons.org/publicdomain/zero/1.0/

- Files: `vehicles/traffic/compact-hatchback-v1.glb`, `vehicles/traffic/four-door-sedan-v1.glb`, `vehicles/traffic/trail-suv-v1.glb`, and `vehicles/traffic/city-taxi-v1.glb`
- Upstream titles: Cars Pack — NormalCar2, NormalCar1, SUV, and Taxi
- Creator: Quaternius
- Source: https://quaternius.com/packs/cars.html
- Source file identities: Google Drive OBJ file IDs `1Msv8m0vli0YGLLEHIx_ojM6grpmD_ygz`, `1dfatafHMRRxI3WE5srluI4Y4WD72pCD6`, `1_26j_0vooPFidwFSlHRWlF1ifphQZemK`, and `1UMriCC_JWsDfpTh5tBjQdhAj9_lJeuR2`, respectively.
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256 values: `e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39`, `bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462`, `1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6`, and `14b2f982f8a501565702ecb56f917c82e9abae914fa3f76d2f622a8670598af1`, respectively.
- Processing: converted from OBJ to extension-free, texture-free GLB with `obj2gltf`; original geometry and named materials were retained.
- Notes: Used across near, mid, and far ambient traffic. Existing routes, motion, collisions, entry, and damage rules remain authoritative. Curated assets fail closed; no retired procedural road-vehicle mesh is loaded or revealed as fallback. The BMW E34 remains the sole player-car model.

Additional Traffic and Response Vehicles

- `vehicles/traffic/utility-pickup-v1.glb` — Pickup Truck by Quaternius — CC0 1.0 — https://poly.pizza/m/qn4grQgHm8 — SHA-256 `9d6b2e33af0d37bf42b2e7af850949f4efd0ddbb9a88077812d152d8b4c1c3eb`
- `vehicles/traffic/service-truck-v1.glb` — Truck by Quaternius — CC0 1.0 — https://poly.pizza/m/cXw6oiFtZ8 — SHA-256 `a5d107b5b06f8ca2d8d7e66ae6309f2e1a25cac577c5db8ebb661b3f0ca5ed8f`
- `vehicles/traffic/police-response-v1.glb` — Police Car by Quaternius — CC0 1.0 — https://poly.pizza/m/BwwnUrWGmV — SHA-256 `2ad6705f58bae2acf806eddb28acd9fc2ff6dc65a726575be5c180631b3132d0`
- `vehicles/traffic/city-van-v1.glb` — Van by Poly by Google — CC BY 3.0 — https://poly.pizza/m/aT_24cDaW1a — SHA-256 `21e57a7be6afbea279ed9acd91e2e0bb0ea0543100778386363eec9ccf9f6f5d`
- `vehicles/traffic/city-bus-v1.glb` — Bus by Poly by Google — CC BY 3.0 — https://poly.pizza/m/4CPpvEmrMoF — SHA-256 `594f1e515bd1882467f50bbc3588df5009338e2ec8bbc31eee36c85774207a76`
- Notes: These local GLBs complete all active road-vehicle categories and the police response fleet. They are presentation-only; the established World Explorer simulation and collision authorities remain unchanged.

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
- Notes: Available alongside the Field Explorer man through the persistent Account Center → Profile character choice. Both choices retain the same existing player movement, collision, interaction, equipment, vehicle, and world-state authority; the procedural Field Navigator remains the loading/error fallback.

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

Curated Companion and Wildlife Animals

The Ultimate Animated Animal Pack is published by Quaternius under CC0 1.0. Its `License.txt` is Google Drive file ID `1F2uy8T2fRpdc6gZ4mnS02_C2E63WvKtn`: https://creativecommons.org/publicdomain/zero/1.0/

- Files: `animals/trail-hound-husky-v1.glb`, `animals/pasture-cow-v1.glb`, `animals/field-horse-v1.glb`, `animals/white-tailed-deer-v1.glb`, and `animals/woodland-fox-v1.glb`
- Upstream titles: Ultimate Animated Animal Pack — Husky, Cow, Horse, Deer, and Fox
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimateanimatedanimals.html
- Source file identities: Google Drive glTF file IDs `1oYn47mfq9JAdkJJDcUftbhHNsgQ_CWdt`, `1lS3t1Sof0FVne1C1WXfdX48qaHES_pDG`, `1hbtY8kxnXiPdwYGVY7rWRgU0jl_-Q-LG`, `1iGpXKrqYGyZCPGHPPSuDAoKnOXLhXJ0q`, and `1z-CWoUC2vJxrqgGFTYlMaywpE1ooV-bA`, respectively.
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256 values: `b29929034d1cdb3dca8c57e92d7cdb9b89bbaa0b8489561b904692995648d79e`, `357383dcbd435cf7089f985487bb65f0b3aa1f713aefc6223e383ee9f9d2aca0`, `0470f0b4d26f2533d461705c4ba3a4dc9754d95d815428bfb274ba85b7597cce`, `75d88a0aa2f0569f8fbde28e4f8b0746b0adcab03018bac88e9326071dcdd1d6`, and `71e28dc471e8d0018ed2935273e63517860bb4ff84e6784320d6c5c650161086`, respectively.
- Processing: repacked from embedded-buffer glTF to extension-free, texture-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all supplied animation clips were retained.
- Roles: the approved Husky presentation serves every dog identity (Trail Hound, Field Retriever, and Park Terrier); Cow, Horse, Deer, and Fox serve their matching catalog species. Existing companion identity, taming, care, following, progression, vehicle travel, ambient ecology, movement, interaction, collision, and lifecycle systems remain authoritative. Curated files only replace their visual and animation presentation.

The Farm Animal Pack is published by Quaternius under CC0 1.0. Its `License.txt` is Google Drive file ID `1tOEbeiWqvuTIfFzyZTe92NUdGNAZSOHL`: https://creativecommons.org/publicdomain/zero/1.0/

- File: `animals/heritage-pig-v1.glb`
- Upstream title: Farm Animal Pack — Pig
- Creator: Quaternius
- Source: https://quaternius.com/packs/farmanimal.html
- Source file identity: Google Drive `Pig.fbx`, file ID `1rdiu2AJFEbH4-n32jjOpnMKYorhpxR0G`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `ed0697fed906a25a4ecec0d620c90757f6685cfc2067a7370d66bb819788d88b`
- Processing: converted from FBX to extension-free, texture-free GLB with Three.js FBXLoader and GLTFExporter 0.178.0. The source skin, geometry, colors, and two supplied animation clips were retained; source material opacity was normalized to its intended opaque presentation.
- Notes: Used for the Heritage Pig companion and ambient farm animal. Unsupported animals—including cats, birds, goats, sheep, and generic small mammals—continue to use their species-correct procedural presentation rather than an inaccurate substitute. All procedural animals remain available during curated loading, on load failure, and after disposal.

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

Furnished Explorer Home

- File: `interiors/furnished-explorer-home-v1.glb`
- Upstream title: Low Poly House Interior
- Creator: Paolo Mercogliano (`paolo.mercoglia`)
- Source: https://sketchfab.com/3d-models/low-poly-house-interior-62b1714ef66f4e0d9f42dcd12efb3f52
- License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
- Original download SHA-256: `72d3742042e8fd5f85242116fd2430f394aee1ba347b500736687191896a6beb`
- Bundled SHA-256: `a3c6c77e7ba695eaebe45da4d2163e948099eb5bb1188ca73081190985249323`
- Processing: optimized locally with glTF-Transform 4.5.0 using deduplication, instancing, palette consolidation, flattening, joining, welding, conservative simplification (`ratio 0.72`, `error 0.0005`), pruning, and sparse-accessor optimization. The self-contained GLB has no required extensions or remote textures.
- Contents: a complete multi-level house presentation with kitchen, living space, bedrooms, bathrooms, stairs, lighting fixtures, and household props.
- Runtime policy: at most one copy is loaded, and only inside the matching owned residential property. World Explorer's measured building footprint, walk surfaces, exterior shell, stairs/elevator authority, entry/exit interaction, and collision proxies remain authoritative. The functional generated interior remains available while this presentation loads and on failure.

Explorer Pulse Sidearm and Laser Rifle

- Files: `equipment/explorer-pulse-sidearm-v1.glb` and `equipment/explorer-laser-rifle-v1.glb`
- Upstream titles: Sci-Fi Modular Gun Pack — `Pistol_2` and `AR_3`
- Creator: Quaternius
- Source: https://quaternius.com/packs/scifimodularguns.html
- Source folder: Google Drive `1P5j8xZyIEmZGHjGYmIgYCev9SVmB-IHC`
- Source file identities: `Pistol_2.obj` (`1zHb_ge1hHMrRb8c1ZEevNxyvKI6yctm6`), `Pistol_2.mtl` (`1PI4EF2FXb_hUnzGhBxYxgNOnLroKp-y5`), `AR_3.obj` (`1O_9SbpctbwUO8U3Qqnky0uhPR_INIIlk`), and `AR_3.mtl` (`1Uk3msdvhugJr_YPrfEDQP_tCQrF0yyAE`).
- License: Creative Commons Zero v1.0 Universal (CC0 1.0). Source `License.txt` is Google Drive file `1ni87azxuEJdzWLhBPxNcg6Y2lC_j4Cq8`.
- Source SHA-256 values: `7cd3d206de92b68d804760b9a54f9a0b8fe8a491cacca346709fb5c81d1a0b9b`, `8810589b7a8cf78353c70550c723be25e5412c4c3af8b389a58b548248daa316`, `57052eda3d1836120aa10dc16f445c7e9218ee244c5d52b3f6111d92967cafc2`, and `096882bbf4f9389eefd9f4c22b81f4c9ba4eace8e0c01cf1323b3bda33ae0c94`, in the same order.
- Bundled SHA-256 values: `c7e5e28636c18a09c9129cbf9f2d8132eea97c7d142477978c086d8c876b04ca` and `5482cf683aad4f08526764db0697894d17cc45b8c18e189d23facaba55a72441`.
- Processing: converted from OBJ/MTL to self-contained GLB with obj2gltf, then deduplicated, palette-consolidated, flattened, joined, welded, pruned, and sparse-optimized with glTF-Transform 4.5.0. No external textures or runtime decoder are required.
- Runtime policy: these are held-item presentation only. Existing Backpack identity, acquisition, ammo, cooldowns, firing, projectiles, hit response, damage, police response, persistence, and cleanup remain authoritative. Procedural equipment is retained only while loading and after a confirmed load failure.

Explorer Ram-air Parachute

- File: `equipment/explorer-parachute-v1.glb`
- Upstream title: Parachute - Low Poly
- Creator: calebcram
- Source: https://sketchfab.com/3d-models/parachute-low-poly-c6208b577e6b4d83a8bd5d5402ee485e
- License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
- Bundled SHA-256: `63f9af1d963509e5a9b440a615b5946fc6ca66c909d000f39cbfc903f7c1f9e6`
- Download profile: official Sketchfab optimized GLB with 1K textures; 1,304 triangles and 704 vertices according to the source listing.
- Runtime policy: deployed-canopy presentation only. Existing high-drop offer, manual deployment, flight physics, landing/repack state, input, and cleanup remain authoritative. The generated canopy remains available while loading and on failure.

Solis Reach and Pathfinder Spacecraft Family

- Files: `space/solis-reach-exterior-v1.glb` and `space/pathfinder-transfer-pod-v2.glb`
- Upstream models: Ultimate Spaceships Pack — Challenger and Dispatcher
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatespaceships.html
- Source folder: Google Drive `1NpfT3wqe2k3Jwue2xryi7tzxP4bWzETu`
- Source file identities: `Challenger.gltf` (`1t-fA25DrO2v48m_PSPnz6cvMU0VLzeoR`) and `Dispatcher.gltf` (`1oAFY-NWo0Icqfstijhk-5U_9PPNW6kUD`).
- License: Creative Commons Zero v1.0 Universal (CC0 1.0). Source `License.txt` is Google Drive file `16iPJQOxZQgJB6UBiutO-PU35YROyGEL8`.
- Source SHA-256 values: `c600b39fd587c323557c682e7aae2e976b62fff2984929163b7ee12a0e4323fd` and `e76c42a694ac602152ee0c8a897f6c79a894da716d22410838892df0d04e8d5c`.
- Bundled SHA-256 values: `67e1962f65c2cf7a6d9bc2f9ee3e3d9d4550bfe63bb5f60b27a6217814ffb233` and `1c7e5a363fbf766dd19fa45bb045f99bef5278dceb4afd6a94384527ffd4a489`.
- Processing: converted from the self-contained source glTF files to GLB, resized the embedded textures to 512px, then deduplicated, flattened, joined, welded, pruned, sparse-optimized, and quantized with glTF-Transform 4.5.0. No external texture or runtime decoder is required.
- Runtime policy: presentation only. Existing Space flight, collision, launch, atmospheric entry, landing, docking, transitions, effects, and cleanup remain authoritative. The generated craft is hidden before loading begins and restored only after a confirmed load failure.

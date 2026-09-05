Curated Vehicle Assets

BMW 525i E34 Player Vehicle

- File: `vehicles/bmw-525i-e34.glb`
- Title: BMW 525i E34 | Project Zomboid
- Creator: Uralvagonzavod
- Source: https://sketchfab.com/3d-models/bmw-525i-e34-project-zomboid-c65aa3b7687d4f5dbbabdfad0b7816bb
- License: Creative Commons Attribution 4.0 (CC BY 4.0).
- Notes: Used as the close player-vehicle visual. The existing World Explorer vehicle controller, collision envelope, headlights, damage rules, and procedural fallback remain authoritative.

Curated Character Assets

The upstream pack's `License.txt` is Google Drive file ID `1TTvylHa1CsiJuHFWWiv6PFGhLM-aAH5z` and declares CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

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

City Explorer

- File: `characters/city-explorer-v1.glb`
- Upstream title: Ultimate Modular Men — Casual Hoodie
- Creator: Quaternius
- Source: https://quaternius.com/packs/ultimatemodularcharacters.html
- Source file identity: Google Drive `Casual_Hoodie.gltf`, file ID `1em1So1xwwQNfHJYMvzKcXkZllvtxpKP5`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0).
- Bundled SHA-256: `0dba57f454956ca5886a2d72e6c5a65f6dc9d45987dc3d47bfe419ff0d0b82b4`
- Processing: repacked from embedded-buffer glTF to an extension-free GLB with glTF-Transform 4.5.0. Geometry, materials, skinning, and all 24 animation clips were retained.
- Notes: Used for at most one nearby detailed NPC while the existing procedural urban NPC remains the load-failure and broader-population fallback.

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

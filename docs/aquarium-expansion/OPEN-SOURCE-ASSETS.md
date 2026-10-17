# Aquarium asset and software review

Reviewed October 12; refreshed October 13, 2026. Candidate is not the same as imported/approved.

## Current intake status

The two animal GLBs **are registered in the local runtime catalog**, contrary to
the historical pre-intake paragraphs below. Their author/license/source and
optimized output hashes remain pinned in
`app/assets/models/interiors/aquarium/PROVENANCE.json`; the focused actual-byte
test verifies both files, animation, embedded textures and size limits.
The acquired art remains a species illustration with the documented shark
detail limitation. No artist file, source texture or animation was replaced in
this continuation, and no aquarium building model was approved.

[Fresh GitHub metadata](evidence/2026-10-13-source-refresh.json) confirms all five
reviewed heads/push dates below are unchanged. Explicit repository license files
were rechecked: jamisonhill's LICENSES.md states MIT, polyfish's LICENSE states
MIT, and no root code-license grant was established for the other three.
Their applications were not executed for comparative benchmarks; performance
claims in their READMEs remain unverified here. Compatibility assessments are
source/dependency inspections, not measured comparative performance. No third
party source code, audio, texture or candidate app is copied or installed.

The runtime already supplies local rig cloning/leases, bounded model downloads,
coral scans and contained water optics. Future kelp/jelly/tunnel systems require
separate author/asset license intake and actual rendering budgets. Neither a
generic domestic aquarium nor a reef demo provides real venue architecture.

## Sketchfab candidates

| Candidate | Public evidence | Decision |
|---|---|---|
| [Blacktip Reef Shark — Lais.Marques](https://sketchfab.com/3d-models/blacktip-reef-shark-a52bb96c5a0c4157b49982471f8902b0) | Official API: downloadable, CC BY 4.0, 6,228 triangles, one animation | Acquired and renderer-reviewed. Animation works; painted gills/minimal mouth detail fall short of the close-up realism target. Not approved as a hero animal. |
| [Green Sea Turtle — jgrabo20](https://sketchfab.com/3d-models/green-sea-turtle-d3dc6a6a4ff74465a59105fd7c66b32b) | Official API: downloadable, CC BY 4.0, 19,678 triangles, one animation | Acquired and renderer-reviewed with detailed shell/skin and articulated flippers. Posed bounds need correct normalization; final creator-provenance and habitat review remain. |
| [Baltimore National Aquarium — maxxscholten](https://sketchfab.com/3d-models/baltimore-national-aquarium-75d1270e14114d6298d1cac6a2424042) | About 1.6k triangles; no downloadable license displayed | Not approved. No evidence of a complete interior. Cannot meet the building requirement. |
| [Juvenile green sea turtle — DigitalLife3D](https://sketchfab.com/3d-models/model-72b-juvenile-green-sea-turtle-c90a930f8b2a4cc8bc516742a0df01d9) | Photogrammetry/animation; CC BY-NC | Excluded from commercial candidate without separate permission. |
| [Blacktip Shark — DigitalLife3D](https://sketchfab.com/3d-models/model-9a-blacktip-shark-3bdfcf9c47134d4b9dc9888963622be9) | CC BY-NC; Carcharhinus limbatus | Excluded: rights and species mismatch; a blacktip is not necessarily a blacktip **reef** shark. |
| [BlackTip Reef Shark — KangaroOz](https://sketchfab.com/3d-models/blacktip-reef-shark-21ce788a4f2a4440ae6e25dc22cf1fe3) | Title says reef shark; description identifies C. limbatus | Unresolved species and acquisition. Do not select by title alone. |
| [Room aquarium — NeoT1](https://sketchfab.com/3d-models/room-aquarium-now-animated-3d2177c3e90a4379b3484d811c013284) | CC BY; roughly 1.3M triangles; domestic room | Rejected for venue shell. Wrong architecture and excessive scene complexity. |
| [Sea turtle — C.J. Goldman](https://sketchfab.com/3d-models/sea-turtle-442800e6cfe0447ba51327f863c45d7e) | CC BY; approximately 4M triangles | Not runtime-ready. Lower-detail original would need separate review. |
| [Doc Ricketts ROV — MBARI](https://sketchfab.com/3d-models/doc-ricketts-rov-def365ad47894a06b5f0fb2876795bf9) | Institution-authored model; CC BY | Good later research-display candidate; not evidence that it is exhibited in Baltimore. |

Approved existing project assets remain available for their documented purpose:
Smithsonian CC0 coral structure, Poly Haven CC0 architectural materials/furniture,
and existing marine model leases. The common dolphin is not a bottlenose dolphin;
the barramundi is not a Blacktip Reef fish. Neither is an acceptable shortcut.

## Requested software candidates

| Repository and inspected revision | Rights / compatibility | Integration decision |
|---|---|---|
| [jamisonhill/aquarium](https://github.com/jamisonhill/aquarium/tree/2a6e16ce5df82b858183c02624d2ac5e605faec5) | LICENSES.md explicitly says project MIT; GitHub metadata alone omitted it. Three 0.169, React 18, Zustand; procedural visuals. Last push July 26, 2026. | Study behavior/optics concepts. Whole application would duplicate renderer, UI, storage and simulation. No code copied. |
| [unclemattmakes/polyfish](https://github.com/unclemattmakes/polyfish/tree/2223904b7c3935984f52570c2dc109cf98fc42f6) | MIT software; Three ^0.170 and Jolt, WebGPU/WASM/XR architecture. Audio has separate attribution files. Last push September 10, 2026. | Not compatible as a drop-in r128 subsystem. Isolate any future algorithm; audit asset rights separately. No code copied. |
| [Nihdao/three-aquarium-challenge](https://github.com/Nihdao/three-aquarium-challenge/tree/aafa3bf67421a267f743ea68e364d5ca8234bc28) | No repository code license established. Credits identify Quaternius fish; R3F/React 19/Rapier/Three ^0.174. Last push September 9, 2025. | Visual reference only; source credits do not license the whole project. No assets copied. |
| [KaleabBantayehu/threejs-virtual-aquarium](https://github.com/KaleabBantayehu/threejs-virtual-aquarium/tree/7cdec73ff44f4dc0e2ae2acddfd34a0d7087b5cb) | No repository license established; browser fish factory/textures. Last push June 13, 2026. | No source/asset incorporation without license. |
| [meghprkh/webgl-aquarium](https://github.com/meghprkh/webgl-aquarium/tree/758b0b6742f10381e427b0e4adffd7a253e47941) | No repository license established; custom WebGL/OBJ/MTL scene. Last push November 23, 2020. | Not an architectural interior system; no runtime/dependency import. |

The established technique is bounded steering/containment plus authored locomotion,
not a new aquarium engine. [Reynolds' primary steering paper](https://www.red3d.com/cwr/steer/gdc99/)
separates action selection, steering and locomotion. Apply that separation within
the existing update loop. Three's current docs are not proof that newer glass
extensions work in this game's r128 loader; verify actual material support locally.

## Asset acceptance before publication

Inspect the full animation cycle against neutral and tank lighting; capture the
actual model from several angles. Check no missing textures, inverted normals,
alpha halos, implausible scaling, rigid flippers, detached eyes or deformed jaws.
Measure worst animation bounds for containment. Pin source/output hashes and
store creator/license/change notice with the asset. License availability and low
triangle count do not establish visual quality. No AI-generated animal or building
substitution is approved by this review.

## Acquired originals (not yet approved for publication)

The ordinary signed-in Sketchfab download panels supplied the shark and turtle
GLBs on October 12. Both panels state CC Attribution and commercial permission.
Pinned originals are retained in `output/aquarium-expansion/quarantine/` alongside
intake records. The shark is 5,001,464 bytes with six meshes, nine joints and one
animation; the turtle is 4,582,936 bytes with five meshes, 27 joints and one
animation. No external GLB resources or extensions are present.

SHA-256: shark `9f30d3aef4cfc47941fa844db4dcb0f7b4799acca8bacfa7d3972d16680cac8f`;
turtle `7294581e0e7a2d2259ed343fcdb8dc9c7f8b55031bfffb282e4342b9cb63c818`.

Renderer review in `scripts/verification/aquarium-assets-current.mjs` passes both
authored animations without page/GPU errors; front, side and animated images were
visually inspected. The turtle camera required posed, rather than rest, bounds. The
files are not added to the runtime catalog or displayed as approved aquarium
fauna. Original model names/materials and source creator claims are preserved
for provenance review. Do not call their quality verified based on licensing alone.

## Local runtime intake — October 12 continuation

The originals above have now been transformed by
`scripts/prepare-aquarium-animals.mjs` into self-contained local GLBs under
`app/assets/models/interiors/aquarium/`. `PROVENANCE.json` pins both source and
output hashes and the sampled animated bounds used for normalization. Root
transforms preserve the original skeletons, bind matrices and clips. The turtle
retains 1K color/normal/material maps; shark body is 1K, fins 512 and eyes 256.
Current emitted sizes are 570,128 bytes (6,228 triangles) and 3,758,740 bytes
(19,678 triangles). Catalog limits are four MB and 20,000 triangles per animal.

Rights permit this attributed adaptation. Runtime/visual approval is separate:
new full-game journey evidence is still being collected. The prototype population
is three shark rigs and one turtle rig, independently animated, plus 18 leased
Smithsonian coral models. It does not claim to represent the real collection's
current counts. Habitat release removes all model instances and leases.

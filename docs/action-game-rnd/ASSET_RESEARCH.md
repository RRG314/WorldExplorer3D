# Asset and license research

Sources accessed 2026-09-27 UTC. No new assets downloaded during this investigation. Existing glTF character binaries were parsed directly; exact bytes, SHA-256, mesh triangle counts, primitives, material/texture counts, skeleton joints and clip names are in [character-asset-inventory.json](character-asset-inventory.json). Triangle counts sum mesh primitives, not transformed scene instances or catalog budget metadata.

## Verified existing family and candidates

| Candidate / creator / exact source | License and use | Technical evidence | Decision |
|---|---|---|---|
| Quaternius [Ultimate Modular Characters](https://quaternius.com/packs/ultimatemodularcharacters.html) | CC0; commercial use, modification and redistribution permitted; attribution not required | Existing field-explorer GLB: 1,977,568 bytes, 10,202 mesh triangles, 15 primitives, 11 materials, no textures; one 60-joint skin, 24 clips | Retain existing rig; optimize draw calls before multiplying near actors |
| Quaternius [Ultimate Modular Women](https://quaternius.com/packs/ultimatemodularwomen.html) | CC0; same permissions | Existing field-explorer-woman GLB: 1,627,776 bytes, 6,812 triangles, 17 primitives, 9 materials, no textures; one 60-joint skin, 24 clips | Same controller; runtime test passed independent playback. Not a prebuilt LOD chain |
| Quaternius [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | Page specifies CC0 and commercial use; full/source tiers are distinct from free portion | FBX/GLB/Blend; universal humanoid, advertised 120+ animations. Exact free download bytes, per-clip coverage and retarget fit not yet verified | License qualifies for evaluation, not an assertion all clips are free. Offline retarget/bake and silhouette/contact test before integration |
| Kenney [Blocky Characters](https://www.kenney.nl/assets/blocky-characters) | Page specifies CC0; [support terms](https://kenney.nl/support) allow commercial use without attribution | 20 files advertised animated; per-model triangles/materials, rig, exact formats and download bytes not inspected | Alternative coherent family, not mixed into current rig. Compatibility/LOD unverified |
| Quaternius [Animated Human Low Poly on OpenGameArt](https://opengameart.org/content/animated-human-low-poly) | Author-uploaded page specifies CC0 | ZIP advertised 5 MB; idle/jump/punch/run/walk/work/death listed. Exact mesh/texture/rig/format counts not inspected | Older alternative; no benefit established over existing family; not downloaded |

The [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/) is linked by the source pages. Retain provenance and license records even when attribution is not mandatory. A license permits use; it does not guarantee rig quality, reasonable download cost or likeness/trademark clearance.

## Sources investigated but not approved assets

[Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) allows characters/animations in personal and commercial projects and requires an Adobe ID. Raw-file redistribution rights and a specific chosen animation's export conditions have not been established here. No Mixamo file is approved or downloaded; record exact item/export/terms before proceeding.

[Sketchfab download guidelines](https://sketchfab.com/developers/download-api/guidelines) require user login for API downloads and carrying attribution with assets. The search lead `https://sketchfab.com/3d-models/lowpoly-character-freerigged-2a0bd3f2cb604e6ab8858e701e33642f` could not be opened (403). Its exact license/version and technical properties are **unverified**, so it is not an approved candidate. Do not infer license from a thumbnail or search snippet.

[Poly Haven license](https://polyhaven.com/license) describes CC0 assets, but no specific prop/material has yet been selected for this action slice. A source-wide policy is not a substitute for a per-file record. No download is needed for the existing character prototype.

## Required import record

Before integrating any new file, record creator, canonical item URL, exact license/version and attribution, commercial/modification/redistribution terms, archive hash/bytes, output GLB bytes, triangles, materials, texture dimensions, skeleton/rest pose/axis, animation coverage, retarget recipe, LODs and actual draw calls. Unknown fields block integration, not research. Compare visible style and motion with current Explorer before importing unrelated models simply to increase asset count.

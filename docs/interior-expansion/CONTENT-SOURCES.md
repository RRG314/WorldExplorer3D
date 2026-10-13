# Selected museum content and geographic candidates

The runtime contains one explicitly representative World Explorer Gallery at the mapped Peale footprint, with three public-domain collection reproductions. It does not reproduce The Peale’s rooms, exhibits, services or opening hours. The reviewed catalog pins the OSM outline; admission also checks the live building’s stable source identity, footprint agreement and an entry anchor. Private captures and mapped indoor plans retain priority.

## Content

| Exhibit | Import path | Near payload / triangles | Optional distant payload / triangles |
|---|---|---|---|
| [Triceratops horridus](https://3d-api.si.edu/content/document/3d_package:d8c623be-4ebc-11ea-b77f-2e728ce88125/resources/Triceratops_horridus_Marsh_1889-150k-4096.glb) | glb → normalized local GLB | 3,420,376 bytes / 49,990 | 999,944 bytes / 10,282 |
| [Madrepora formosa · USNM 292](https://3d-api.si.edu/content/document/3d_package:03d6b38a-bf7d-4334-90c9-1f7b4c3041a9/resources/usnm_292-100k-2048_std.glb) | glb → normalized local GLB | 2,502,460 bytes / 23,990 | 756,340 bytes / 5,128 |
| [Wheat Field with Cypresses](https://images.metmuseum.org/CRDImages/ep/web-large/DP-42549-001.jpg) | image → normalized local GLB | 214,576 bytes / 2 | not needed for two-triangle panel |

Output hashes, normalization, budgets and source rights are in `app/assets/models/interiors/museum/asset-manifest.json`; source intake is `config/interior-imports.json`. Models are fetched through the existing revision-pinned model cache after admitted entry, not during other Earth/ocean/space play. Optional distant models are prepared, not claimed to be an active progressive-room system.

## Mapping review

Public Nominatim search responses were collected sequentially with a descriptive User-Agent and >1 second spacing, after two bounded Overpass requests failed. The results below retain stable OSM identities and source geometries. No search name/nearest coordinate authorizes an interior. Building/campus/tenant resolution, actual door evidence and rights to corresponding indoor content must pass before publishing additional interiors.

| City/query | Stable candidates | Mapping conclusion |
|---|---|---|
| Walters Art Museum, Baltimore | [way/1155100625](https://www.openstreetmap.org/way/1155100625) (Polygon); [node/4590173181](https://www.openstreetmap.org/node/4590173181) (Point) | Point/tenant or duplicate identity needs building and entrance evidence; no nearest-building publication. |
| Baltimore Museum of Art, Baltimore | [way/114709357](https://www.openstreetmap.org/way/114709357) (Polygon) | Candidate only; no interior publication. |
| Maryland Center for History and Culture, Baltimore | No result from this bounded query | Unresolved identity; do not infer or fabricate a building association. |
| American Visionary Art Museum, Baltimore | [way/138488343](https://www.openstreetmap.org/way/138488343) (Polygon); [way/138488338](https://www.openstreetmap.org/way/138488338) (Polygon) | Candidate only; no interior publication. |
| B&O Railroad Museum, Baltimore | [way/322870129](https://www.openstreetmap.org/way/322870129) (Polygon) | Candidate only; no interior publication. |
| Metropolitan Museum of Art, New York | [relation/3698894](https://www.openstreetmap.org/relation/3698894) (Polygon) | Campus/relation geometry requires component-building and entrance review. |
| American Museum of Natural History, New York | [way/388436810](https://www.openstreetmap.org/way/388436810) (Polygon) | Candidate only; no interior publication. |
| Museum of Modern Art, New York | [way/278346578](https://www.openstreetmap.org/way/278346578) (Polygon) | Candidate only; no interior publication. |
| Brooklyn Museum, New York | [way/1432069915](https://www.openstreetmap.org/way/1432069915) (Polygon) | Candidate only; no interior publication. |
| New York Transit Museum, New York | [node/368061648](https://www.openstreetmap.org/node/368061648) (Point) | Point/tenant or duplicate identity needs building and entrance evidence; no nearest-building publication. |
| The Peale, Baltimore | [way/336352958](https://www.openstreetmap.org/way/336352958) v4; six-vertex concave outline | Representative gallery candidate selected; derived gameplay door, not a verified historic entrance. |

This supplies five Baltimore institutions with mapped candidates including The Peale, plus the unresolved Maryland Center lead, and five NYC institutions. The New York Transit Museum’s point record does not establish its underground station footprint/floors. AVAM has multiple building records; Walters has a polygon and a separate point. Their distinction is intentional. `config/museum-geographic-candidates.json` is a research inventory, not runtime permission or a promise of playable museums.

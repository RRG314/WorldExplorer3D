// Reviewed public content metadata only. Models load after admitted entry.
export const MUSEUM_CONTENT = [
  {
    "schemaVersion": 1,
    "id": "baltimore-natural-forms",
    "version": "1.1.0",
    "kind": "representative",
    "title": "World Explorer Gallery",
    "layoutProfile": "peale-front-ground-v1",
    "layoutEvidence": "https://thepeale.org/wp-content/uploads/2022/07/Revised-Peale-Wayfinding-Text-Directions-2022-2.pdf",
    "accuracyLabel": "Front-ground-floor interpretation: lobby/gallery connections follow The Peale’s public guide; dimensions and finishes are estimated. Upper floors are not included. Smithsonian and Met reproductions are not The Peale’s collection.",
    "review": {
      "status": "approved",
      "date": "2026-10-12",
      "evidence": "docs/interior-expansion/LICENSE-REVIEW.md"
    },
    "association": {
      "kind": "mapped-building",
      "sourceIds": [
        "way/336352958",
        "osm:way:336352958"
      ],
      "footprint": [
        {
          "lat": 39.2917732,
          "lon": -76.6100502
        },
        {
          "lat": 39.2917673,
          "lon": -76.6101916
        },
        {
          "lat": 39.2919075,
          "lon": -76.610201
        },
        {
          "lat": 39.2919194,
          "lon": -76.6099099
        },
        {
          "lat": 39.2918205,
          "lon": -76.6099029
        },
        {
          "lat": 39.2918143,
          "lon": -76.6100527
        }
      ],
      "footprintSource": "https://api.openstreetmap.org/api/0.6/way/336352958/full.json",
      "revision": "OSM way 336352958 v4; retrieved 2026-10-12",
      "geometryLicense": "ODbL-1.0",
      "address": "225 North Holliday Street, Baltimore, Maryland"
    },
    "sources": [
      {
        "id": "smithsonian-triceratops",
        "author": "Smithsonian Institution, National Museum of Natural History",
        "url": "https://3d-api.si.edu/content/document/3d_package:d8c623be-4ebc-11ea-b77f-2e728ce88125/resources/Triceratops_horridus_Marsh_1889-150k-4096.glb",
        "rightsEvidence": "https://www.si.edu/openaccess/faq",
        "license": "CC0-1.0",
        "sha256": "cd8525c7371d14876bcdefe3f579d216bf597db892c2de6ed597da86bf1a98b3",
        "modifications": "Uniformly scaled display reproduction; geometry simplified and textures resized. Original scan supports retained."
      },
      {
        "id": "smithsonian-coral",
        "author": "Smithsonian Institution, National Museum of Natural History",
        "url": "https://3d-api.si.edu/content/document/3d_package:03d6b38a-bf7d-4334-90c9-1f7b4c3041a9/resources/usnm_292-100k-2048_std.glb",
        "rightsEvidence": "https://www.si.edu/openaccess/faq",
        "license": "CC0-1.0",
        "sha256": "6516992aa8c3873c09fe000326df79b9953e97c6b1023fdc7a378ce1cd863c2b",
        "modifications": "Uniformly scaled display reproduction; geometry simplified and textures resized. Original scan supports retained."
      },
      {
        "id": "met-cypresses",
        "author": "Vincent van Gogh / The Metropolitan Museum of Art",
        "url": "https://images.metmuseum.org/CRDImages/ep/web-large/DP-42549-001.jpg",
        "rightsEvidence": "https://www.metmuseum.org/hubs/open-access",
        "license": "CC0-1.0",
        "sha256": "af0e3486621c210b54932d055294051b5601aa3362af4b84ab97e2831f8163bc",
        "modifications": "Public-domain image resized and mounted on a game gallery panel."
      }
    ],
    "exhibits": [
      {
        "id": "triceratops",
        "title": "Triceratops horridus",
        "period": "Late Cretaceous · fossil skeleton",
        "description": "Look at the three horns and the broad bony frill. Compare the skull with the rest of the skeleton as you turn the display. This Smithsonian scan is shown as a small display model, not at the animal’s original size.",
        "collection": "Smithsonian National Museum of Natural History",
        "displayExtentMeters": 2.2,
        "roomIndex": 0,
        "presentation": "sculpture",
        "assetId": "museum-smithsonian-triceratops",
        "sourceId": "smithsonian-triceratops",
        "interactionRangeMeters": 2.8
      },
      {
        "id": "branching-coral",
        "title": "Branching coral · USNM 292",
        "period": "Natural history specimen",
        "description": "Follow the branching structure of this Madrepora formosa specimen. The scan shows the preserved specimen and its museum support, not living tissue. Compare its repeated branches with the trees in the next room.",
        "collection": "Smithsonian National Museum of Natural History",
        "displayExtentMeters": 1.1,
        "roomIndex": 0,
        "presentation": "sculpture",
        "assetId": "museum-smithsonian-coral",
        "sourceId": "smithsonian-coral",
        "interactionRangeMeters": 2.8
      },
      {
        "id": "cypresses",
        "title": "Wheat Field with Cypresses",
        "period": "1889 · oil on canvas",
        "description": "Vincent van Gogh painted this landscape in 1889. Notice how the cypresses, clouds and wheat each have a different rhythm. This is a digital reproduction of the Met’s public-domain image, enlarged for viewing. The original canvas measures 73.2 × 93.4 cm.",
        "collection": "The Metropolitan Museum of Art · 1993.132",
        "displayExtentMeters": 2.1,
        "roomIndex": 1,
        "presentation": "artwork",
        "assetId": "museum-met-cypresses",
        "sourceId": "met-cypresses",
        "interactionRangeMeters": 2.8
      }
    ]
  }
];

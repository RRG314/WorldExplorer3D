var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// app/js/transport/vehicle-garage-rules.js
var vehicle_garage_rules_exports = {};
__export(vehicle_garage_rules_exports, {
  PERSONAL_VEHICLES: () => PERSONAL_VEHICLES,
  normalizeVehicleGarage: () => normalizeVehicleGarage,
  personalVehicleById: () => personalVehicleById,
  personalVehicleIdentity: () => personalVehicleIdentity,
  prepareVehicleGarageChange: () => prepareVehicleGarageChange
});
module.exports = __toCommonJS(vehicle_garage_rules_exports);

// app/js/transport/catalog-contract.js?v=1
var TRANSPORT_CATALOG_SCHEMA_VERSION = 1;
var TRANSPORT_DOMAINS = Object.freeze(["road", "aviation", "maritime"]);
var TRANSPORT_DURABILITY_POLICIES = Object.freeze({
  EXPLORATION_UNLIMITED: "exploration_unlimited",
  STANDARD: "standard",
  HEAVY_DUTY: "heavy_duty"
});
function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function defineTransportCatalogEntry(definition = {}) {
  const id = String(definition.id || "").trim();
  const domain = String(definition.domain || "").trim();
  if (!id) throw new TypeError("Transport catalog entries require a stable id.");
  if (!TRANSPORT_DOMAINS.includes(domain)) throw new TypeError(`Unsupported transport domain: ${domain || "missing"}`);
  const dimensions = Object.freeze({
    width: finitePositive(definition.width ?? definition.dimensions?.width, 1),
    height: finitePositive(definition.height ?? definition.dimensions?.height, 1),
    length: finitePositive(definition.length ?? definition.dimensions?.length, 1),
    massKg: finitePositive(definition.massKg ?? definition.dimensions?.massKg, 1e3),
    draft: Math.max(0, Number(definition.draft ?? definition.dimensions?.draft) || 0),
    wingspan: Math.max(0, Number(definition.wingspan ?? definition.dimensions?.wingspan) || 0),
    rotorDiameter: Math.max(0, Number(definition.rotorDiameter ?? definition.dimensions?.rotorDiameter) || 0)
  });
  const performance = Object.freeze({
    topSpeed: finitePositive(definition.topSpeedMph ?? definition.performance?.topSpeed, 1),
    topSpeedUnit: String(definition.performance?.topSpeedUnit || (domain === "maritime" ? "knots" : domain === "aviation" ? "knots-ias" : "mph")),
    accelerationScale: finitePositive(definition.accelerationScale ?? definition.performance?.accelerationScale, 1),
    steeringScale: finitePositive(definition.steeringScale ?? definition.performance?.steeringScale, 1),
    gripScale: finitePositive(definition.gripScale ?? definition.performance?.gripScale, 1),
    brakeScale: finitePositive(definition.brakeScale ?? definition.performance?.brakeScale, 1),
    turningRadius: finitePositive(definition.turningRadius ?? definition.performance?.turningRadius, dimensions.length)
  });
  const interaction = Object.freeze({
    playable: definition.playable !== false,
    enterable: definition.enterable !== false,
    seatCount: Math.max(1, Math.floor(Number(definition.seatCount ?? definition.interaction?.seatCount) || 1)),
    boardingPoints: Object.freeze((definition.boardingPoints || definition.interaction?.boardingPoints || ["driver"]).map(String)),
    companionAboard: definition.companionAboard !== false
  });
  const damage = Object.freeze({
    durabilityPolicy: String(definition.durabilityPolicy || definition.damage?.durabilityPolicy || TRANSPORT_DURABILITY_POLICIES.STANDARD),
    resistance: finitePositive(definition.resistance ?? definition.damage?.resistance, 160),
    zones: Object.freeze((definition.damageZones || definition.damage?.zones || ["front", "rear", "left", "right", "running-gear"]).map(String)),
    recovery: String(definition.recovery || definition.damage?.recovery || "nearby-safe-surface")
  });
  const visual = Object.freeze({
    recipeId: String(definition.visualRecipeId || definition.visual?.recipeId || `${domain}:${id}`),
    lods: Object.freeze([...definition.visual?.lods || ["promoted", "ambient", "distant"]]),
    mobileBudget: String(definition.visual?.mobileBudget || "bounded"),
    referenceEvidence: String(definition.visual?.referenceEvidence || "")
  });
  const rights = Object.freeze({
    kind: String(definition.rights?.kind || "original-generic-design"),
    brand: String(definition.rights?.brand || "unbranded"),
    attribution: String(definition.rights?.attribution || "")
  });
  return Object.freeze({
    ...definition,
    schemaVersion: TRANSPORT_CATALOG_SCHEMA_VERSION,
    id,
    domain,
    width: dimensions.width,
    height: dimensions.height,
    length: dimensions.length,
    massKg: dimensions.massKg,
    playable: interaction.playable,
    enterable: interaction.enterable,
    durabilityPolicy: damage.durabilityPolicy,
    resistance: damage.resistance,
    dimensions,
    performance,
    interaction,
    damage,
    visual,
    rights
  });
}

// app/js/assets/explorer-fleet-assets.js
var EXPLORER_FLEET_ASSETS = Object.freeze([
  {
    "schemaVersion": 1,
    "id": "road-delorean-dmc12",
    "label": "DeLorean DMC-12",
    "url": "/app/assets/models/vehicles/explorer-fleet/road-delorean-dmc12.glb",
    "roles": [
      "road-vehicle-presentation"
    ],
    "vehicleVariantIds": [
      "delorean"
    ],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/delorean-dmc-12-7001f739fe594314b5a3081163577139",
    "attribution": "DeLorean DMC-12 by JandroS",
    "sourceCredit": "JandroS (https://sketchfab.com/JandroS)",
    "dimensionsMeters": {
      "width": 2.17,
      "height": 1.2,
      "length": 4.27
    },
    "paintMaterialNames": [],
    "wheelLayout": [
      {
        "id": "front-right",
        "position": [
          0.8910983204841614,
          0.3385186465602601,
          1.2409984469413757
        ],
        "radius": 0.3382132975239074
      },
      {
        "id": "front-left",
        "position": [
          -0.8910983204841614,
          0.3385186167579377,
          1.2409984171390533
        ],
        "radius": 0.338213267721585
      },
      {
        "id": "rear-right",
        "position": [
          0.8910983204841614,
          0.33851864957250655,
          -1.179979145526886
        ],
        "radius": 0.33381554461084306
      },
      {
        "id": "rear-left",
        "position": [
          -0.8910983204841614,
          0.33851858996786177,
          -1.179979145526886
        ],
        "radius": 0.3338154850061983
      }
    ],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-road-vehicle-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 2342904,
      "triangles": 65216,
      "textureEdgePixels": 512,
      "maxInstances": 10
    }
  },
  {
    "schemaVersion": 1,
    "id": "road-cadillac-coupe-deville",
    "label": "Cadillac Coupe deVille",
    "url": "/app/assets/models/vehicles/explorer-fleet/road-cadillac-coupe-deville.glb",
    "roles": [
      "road-vehicle-presentation"
    ],
    "vehicleVariantIds": [
      "cadillac_coupe"
    ],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/cadillac-coupe-deville-2adc47898c3145078f0b3bc51995cfe9",
    "attribution": "Cadillac Coupe deVille by its.anjaney",
    "sourceCredit": "its.anjaney (https://sketchfab.com/rajanjaney)",
    "dimensionsMeters": {
      "width": 2.03,
      "height": 1.42,
      "length": 5.7
    },
    "paintMaterialNames": [
      "car_colour"
    ],
    "wheelLayout": [
      {
        "id": "front-right",
        "position": [
          0.7717157304286957,
          0.32863111421465874,
          1.8847010731697083
        ],
        "radius": 0.32292645052075386
      },
      {
        "id": "rear-right",
        "position": [
          0.7717182636260986,
          0.32292643189430237,
          -1.3604450225830078
        ],
        "radius": 0.32292643189430237
      },
      {
        "id": "front-left",
        "position": [
          -0.8527450263500214,
          0.32292643189430237,
          1.8847002387046814
        ],
        "radius": 0.32292643189430237
      },
      {
        "id": "rear-left",
        "position": [
          -0.8527425229549408,
          0.32863111421465874,
          -1.36044579744339
        ],
        "radius": 0.32292645052075386
      }
    ],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-road-vehicle-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 1813916,
      "triangles": 55013,
      "textureEdgePixels": 512,
      "maxInstances": 10
    }
  },
  {
    "schemaVersion": 1,
    "id": "road-cadillac-fleetwood-brougham",
    "label": "Cadillac Fleetwood Brougham \xB7 early 1980s",
    "url": "/app/assets/models/vehicles/explorer-fleet/road-cadillac-fleetwood-brougham.glb",
    "roles": [
      "road-vehicle-presentation"
    ],
    "vehicleVariantIds": [
      "cadillac_fleetwood"
    ],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/1980s-cadillac-e0bbaf9283b2413a8dae9b991fe121ff",
    "attribution": "Cadillac Fleetwood Brougham \xB7 early 1980s by scorpion81",
    "sourceCredit": "scorpion81 (https://sketchfab.com/scorpion81)",
    "dimensionsMeters": {
      "width": 2.02,
      "height": 1.46,
      "length": 5.62
    },
    "paintMaterialNames": [
      "Paint"
    ],
    "wheelLayout": [
      {
        "id": "rear-right",
        "position": [
          0.7990407645702362,
          0.3582015491119819,
          -1.3263687491416931
        ],
        "radius": 0.3578828119643731
      },
      {
        "id": "front-right",
        "position": [
          0.7703105509281158,
          0.3582015491119819,
          1.8154231905937195
        ],
        "radius": 0.3578828119643731
      },
      {
        "id": "rear-left",
        "position": [
          -0.8069601953029633,
          0.3582015491119819,
          -1.3263687491416931
        ],
        "radius": 0.3578828119643731
      },
      {
        "id": "front-left",
        "position": [
          -0.8066717982292175,
          0.3582015491119819,
          1.8154231905937195
        ],
        "radius": 0.3578828119643731
      }
    ],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-road-vehicle-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 4842116,
      "triangles": 106224,
      "textureEdgePixels": 512,
      "maxInstances": 10
    }
  },
  {
    "schemaVersion": 1,
    "id": "road-volkswagen-golf-ii",
    "label": "Volkswagen Golf II",
    "url": "/app/assets/models/vehicles/explorer-fleet/road-volkswagen-golf-ii.glb",
    "roles": [
      "road-vehicle-presentation"
    ],
    "vehicleVariantIds": [
      "golf_ii"
    ],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/volkswagen-golf-ii-740500f10bc94e7a91c2290e445fcb39",
    "attribution": "Volkswagen Golf II by ARDmation",
    "sourceCredit": "ARDmation (https://sketchfab.com/ardmation)",
    "dimensionsMeters": {
      "width": 1.86,
      "height": 1.41,
      "length": 3.99
    },
    "paintMaterialNames": [
      "paint"
    ],
    "wheelLayout": [
      {
        "id": "rear-right",
        "position": [
          0.7235738337039948,
          0.32376161217689514,
          -1.2782131135463715
        ],
        "radius": 0.32376161217689514
      },
      {
        "id": "rear-left",
        "position": [
          -0.7261285781860352,
          0.32376161217689514,
          -1.2782131135463715
        ],
        "radius": 0.32376161217689514
      },
      {
        "id": "front-left",
        "position": [
          -0.7261285781860352,
          0.32376161217689514,
          1.1820045709609985
        ],
        "radius": 0.32376161217689514
      },
      {
        "id": "front-right",
        "position": [
          0.7235738337039948,
          0.32376161217689514,
          1.1820045709609985
        ],
        "radius": 0.32376161217689514
      }
    ],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-road-vehicle-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 3454328,
      "triangles": 15128,
      "textureEdgePixels": 512,
      "maxInstances": 10
    }
  },
  {
    "schemaVersion": 1,
    "id": "road-datsun-280z",
    "label": "Datsun 280Z",
    "url": "/app/assets/models/vehicles/explorer-fleet/road-datsun-280z.glb",
    "roles": [
      "road-vehicle-presentation"
    ],
    "vehicleVariantIds": [
      "datsun_280z"
    ],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/free-datsun-280z-0789ab2ece9442de94b3c41595e0ecbd",
    "attribution": "Datsun 280Z by Martin Trafas",
    "sourceCredit": "Martin Trafas (https://sketchfab.com/Bexxie)",
    "dimensionsMeters": {
      "width": 1.73,
      "height": 1.3,
      "length": 4.42
    },
    "paintMaterialNames": [
      "280z_CarPaint"
    ],
    "wheelLayout": [
      {
        "id": "front-right",
        "position": [
          0.6351710855960846,
          0.3450880591117311,
          1.076420158147812
        ],
        "radius": 0.3442734535492491
      },
      {
        "id": "front-left",
        "position": [
          -0.6351837515830994,
          0.34508739854209125,
          1.0764634907245636
        ],
        "radius": 0.3442221984732896
      },
      {
        "id": "rear-right",
        "position": [
          0.63646100461483,
          0.34508805177756585,
          -1.2901999652385712
        ],
        "radius": 0.34458841182640754
      },
      {
        "id": "rear-left",
        "position": [
          -0.6364549398422241,
          0.34508805177756585,
          -1.2901553213596344
        ],
        "radius": 0.34458841182640754
      }
    ],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-road-vehicle-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 3372132,
      "triangles": 44076,
      "textureEdgePixels": 512,
      "maxInstances": 10
    }
  },
  {
    "schemaVersion": 1,
    "id": "aircraft-cessna-172",
    "label": "Cessna 172",
    "url": "/app/assets/models/vehicles/explorer-fleet/aircraft-cessna-172.glb",
    "roles": [
      "aircraft-presentation"
    ],
    "vehicleVariantIds": [],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/cessna-172-64cddaee5aff470682659a8c08525046",
    "attribution": "Cessna 172 by Nobilis the Palaeovespa",
    "sourceCredit": "e737 (https://sketchfab.com/e0057537)",
    "dimensionsMeters": {
      "width": 10.9,
      "height": 2.2,
      "length": 7.9
    },
    "paintMaterialNames": [],
    "wheelLayout": [],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-aircraft-catalog-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 858872,
      "triangles": 14240,
      "textureEdgePixels": 512,
      "maxInstances": 5
    }
  },
  {
    "schemaVersion": 1,
    "id": "aircraft-falcon-10",
    "label": "Dassault Falcon 10",
    "url": "/app/assets/models/vehicles/explorer-fleet/aircraft-falcon-10.glb",
    "roles": [
      "aircraft-presentation"
    ],
    "vehicleVariantIds": [],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/falcon10-0d5a676f75da403b8419154b102d55a7",
    "attribution": "Dassault Falcon 10 by manilov.ap",
    "sourceCredit": "manilov.ap (https://sketchfab.com/manilov.ap)",
    "dimensionsMeters": {
      "width": 14.1,
      "height": 3.8,
      "length": 15.2
    },
    "paintMaterialNames": [],
    "wheelLayout": [],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-aircraft-catalog-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 1399288,
      "triangles": 22245,
      "textureEdgePixels": 512,
      "maxInstances": 5
    }
  }
].map((record) => Object.freeze(record)));

// app/js/assets/racing-fleet-assets.js
var RACING_FLEET_ASSETS = Object.freeze([
  {
    "schemaVersion": 1,
    "id": "road-bmw-m3-e46",
    "label": "BMW M3 E46",
    "url": "/app/assets/models/vehicles/racing-fleet/road-bmw-m3-e46.glb",
    "roles": [
      "road-vehicle-presentation"
    ],
    "vehicleVariantIds": [
      "bmw_m3_e46"
    ],
    "license": "CC-BY-4.0",
    "sourceUrl": "https://sketchfab.com/3d-models/bmw-m3-e46-f1b00ff37d504629b10031da32bc7497",
    "attribution": "BMW M3 E46 by MMC Works",
    "sourceCredit": "M\xE1rcio Meireles (https://sketchfab.com/marciomeireles)",
    "dimensionsMeters": {
      "width": 1.9006898684883853,
      "height": 1.3690595307716498,
      "length": 4.493
    },
    "paintMaterialNames": [
      "Car_Paint_-_All_Colors"
    ],
    "wheelLayout": [
      {
        "id": "front-right",
        "position": [
          0.7402718961238861,
          0.3208164716925239,
          1.4547739028930664
        ],
        "radius": 0.32033197629789356
      },
      {
        "id": "front-left",
        "position": [
          -0.7258506417274475,
          0.3220483546028845,
          1.4835588932037354
        ],
        "radius": 0.32033200218575075
      },
      {
        "id": "rear-right",
        "position": [
          0.7378740608692169,
          0.32033199071884155,
          -1.2492441236972809
        ],
        "radius": 0.32033199071884155
      },
      {
        "id": "rear-left",
        "position": [
          -0.740881621837616,
          0.32033199071884155,
          -1.249243974685669
        ],
        "radius": 0.32033199071884155
      }
    ],
    "driverEyeGroundMeters": [
      0.345,
      1.075,
      0.015
    ],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-road-vehicle-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 3049196,
      "triangles": 101109,
      "textureEdgePixels": 512,
      "maxInstances": 4
    }
  },
  {
    "schemaVersion": 1,
    "id": "road-bmw-m3-e92-race",
    "label": "BMW M3 E92 race car",
    "url": "/app/assets/models/vehicles/racing-fleet/road-bmw-m3-e92-race.glb",
    "roles": [
      "road-vehicle-presentation"
    ],
    "vehicleVariantIds": [
      "bmw_m3_e92_race"
    ],
    "license": "CC0-1.0",
    "sourceUrl": "https://blendswap.com/blend/3697",
    "attribution": "BMW M3 racing exterior by Neubi",
    "sourceCredit": "Neubi (https://blendswap.com/profile/1050)",
    "dimensionsMeters": {
      "width": 1.921459138393402,
      "height": 1.2318495512008667,
      "length": 4.634
    },
    "paintMaterialNames": [
      "Race_Paint"
    ],
    "wheelLayout": [
      {
        "id": "front-right",
        "position": [
          0.7949231863021851,
          0.313029408454895,
          1.3881207704544067
        ],
        "radius": 0.313029408454895
      },
      {
        "id": "front-left",
        "position": [
          -0.7949246168136597,
          0.31302958726882935,
          1.3881196975708008
        ],
        "radius": 0.313029408454895
      },
      {
        "id": "rear-left",
        "position": [
          -0.796084463596344,
          0.3247285485267639,
          -1.2729437351226807
        ],
        "radius": 0.3229954242706299
      },
      {
        "id": "rear-right",
        "position": [
          0.7960859537124634,
          0.3247283697128296,
          -1.2729429006576538
        ],
        "radius": 0.3229954242706299
      }
    ],
    "driverEyeGroundMeters": [
      0.34,
      1.025,
      0.02
    ],
    "sourceUpAxis": "y",
    "rigPolicy": "preserve-parts",
    "collisionPolicy": "existing-road-vehicle-envelope",
    "instancePolicy": {
      "geometry": "shared",
      "materials": "clone"
    },
    "loadPolicy": {
      "bounded": true,
      "timeoutMs": 2e4
    },
    "budgets": {
      "bytes": 2553772,
      "triangles": 95434,
      "textureEdgePixels": 512,
      "maxInstances": 4
    }
  }
].map((record) => Object.freeze(record)));

// app/js/engine/vehicle-catalog.js?v=6
var ROAD_VEHICLE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "compact", label: "Compact hatchback", bodyStyle: "compact", handlingLabel: "Nimble", width: 1.65, height: 1.42, length: 3.65, cabinScale: 0.48, wheelRadius: 0.34, speedFactor: 1.04, acceleration: 2.8, turningRadius: 4.6, accelerationScale: 1.13, steeringScale: 1.14, gripScale: 0.98, brakeScale: 1.04, topSpeedMph: 120, weight: 18, color: 9060165, parkedEligible: true }),
  Object.freeze({ id: "sedan", label: "Four-door sedan", bodyStyle: "sedan", handlingLabel: "Balanced", width: 1.78, height: 1.45, length: 4.45, cabinScale: 0.5, wheelRadius: 0.36, speedFactor: 1, acceleration: 2.5, turningRadius: 5.2, accelerationScale: 1, steeringScale: 1, gripScale: 1, brakeScale: 1, topSpeedMph: 120, weight: 22, color: 3235705, parkedEligible: true }),
  Object.freeze({ id: "suv", label: "Trail SUV", bodyStyle: "suv", handlingLabel: "Planted", width: 1.9, height: 1.72, length: 4.65, cabinScale: 0.54, wheelRadius: 0.41, speedFactor: 0.94, acceleration: 2.2, turningRadius: 5.6, accelerationScale: 0.96, steeringScale: 0.92, gripScale: 1.1, brakeScale: 1.08, topSpeedMph: 120, weight: 15, color: 8016193, parkedEligible: true }),
  Object.freeze({ id: "pickup", label: "Utility pickup", bodyStyle: "pickup", handlingLabel: "Torque-heavy", width: 1.92, height: 1.68, length: 5.05, cabinScale: 0.42, wheelRadius: 0.42, speedFactor: 0.92, acceleration: 2.1, turningRadius: 5.9, accelerationScale: 1.02, steeringScale: 0.87, gripScale: 0.96, brakeScale: 0.95, topSpeedMph: 120, weight: 10, color: 5859912, parkedEligible: true }),
  Object.freeze({ id: "van", label: "Passenger van", bodyStyle: "van", handlingLabel: "Steady", width: 1.95, height: 2.12, length: 5.15, cabinScale: 0.68, wheelRadius: 0.4, speedFactor: 0.86, acceleration: 1.8, turningRadius: 6.2, accelerationScale: 0.86, steeringScale: 0.82, gripScale: 1.04, brakeScale: 0.93, topSpeedMph: 112, weight: 10, color: 5400954, parkedEligible: true }),
  Object.freeze({ id: "delivery_van", label: "Delivery van", bodyStyle: "van", handlingLabel: "Cargo-weighted", width: 2.02, height: 2.35, length: 5.5, cabinScale: 0.62, wheelRadius: 0.42, speedFactor: 0.82, acceleration: 1.7, turningRadius: 6.5, accelerationScale: 0.8, steeringScale: 0.77, gripScale: 0.98, brakeScale: 0.9, topSpeedMph: 108, weight: 8, color: 13158333, parkedEligible: true }),
  Object.freeze({ id: "taxi", label: "City taxi", bodyStyle: "taxi", handlingLabel: "City-responsive", width: 1.78, height: 1.5, length: 4.5, cabinScale: 0.5, wheelRadius: 0.36, speedFactor: 1, acceleration: 2.4, turningRadius: 5.2, accelerationScale: 1.08, steeringScale: 1.07, gripScale: 0.98, brakeScale: 1.03, topSpeedMph: 120, weight: 7, color: 13940781, parkedEligible: true }),
  Object.freeze({ id: "box_truck", label: "Local box truck", bodyStyle: "box-truck", handlingLabel: "Heavy", width: 2.25, height: 2.85, length: 6.8, cabinScale: 0.7, wheelRadius: 0.48, speedFactor: 0.72, acceleration: 1.25, turningRadius: 8.2, accelerationScale: 0.64, steeringScale: 0.61, gripScale: 0.92, brakeScale: 0.84, topSpeedMph: 94, weight: 5, color: 11450813, parkedEligible: false }),
  Object.freeze({ id: "city_bus", label: "City bus", bodyStyle: "bus", handlingLabel: "Transit-heavy", width: 2.45, height: 3.05, length: 10.4, cabinScale: 0.76, wheelRadius: 0.52, speedFactor: 0.64, acceleration: 1.05, turningRadius: 10.5, accelerationScale: 0.52, steeringScale: 0.48, gripScale: 0.9, brakeScale: 0.8, topSpeedMph: 82, weight: 3, color: 4155013, parkedEligible: false, majorRoadOnly: true })
]);
var ROAD_VEHICLE_METADATA = Object.freeze({
  compact: Object.freeze({ massKg: 1240, seatCount: 4, resistance: 145 }),
  sedan: Object.freeze({ massKg: 1520, seatCount: 5, resistance: 160 }),
  suv: Object.freeze({ massKg: 1980, seatCount: 5, resistance: 185 }),
  pickup: Object.freeze({ massKg: 2240, seatCount: 5, resistance: 195 }),
  van: Object.freeze({ massKg: 2350, seatCount: 8, resistance: 205 }),
  delivery_van: Object.freeze({ massKg: 2480, seatCount: 2, resistance: 210 }),
  taxi: Object.freeze({ massKg: 1640, seatCount: 5, resistance: 165 }),
  box_truck: Object.freeze({ massKg: 5200, seatCount: 3, resistance: 285, durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY }),
  city_bus: Object.freeze({ massKg: 11800, seatCount: 38, resistance: 360, durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY })
});
var ROAD_FLEET_REFERENCE = "docs/reference-art/road-fleet-and-damage-2026-08-29.png";
var LICENSED_ROAD_PROFILES = Object.freeze([
  { id: "delorean", assetId: "road-delorean-dmc12", bodyStyle: "sedan", handlingLabel: "Rear-engine touring", massKg: 1230, seatCount: 2, weight: 12, color: 10922413, topSpeedMph: 109, accelerationScale: 0.92, steeringScale: 1.04, gripScale: 1.02, brakeScale: 1.04, turningRadius: 5.4 },
  { id: "cadillac_coupe", assetId: "road-cadillac-coupe-deville", bodyStyle: "sedan", handlingLabel: "Long-wheelbase cruiser", massKg: 2240, seatCount: 6, weight: 16, color: 8171424, topSpeedMph: 105, accelerationScale: 0.8, steeringScale: 0.76, gripScale: 0.96, brakeScale: 0.91, turningRadius: 6.6 },
  { id: "cadillac_fleetwood", assetId: "road-cadillac-fleetwood-brougham", bodyStyle: "sedan", handlingLabel: "Luxury touring sedan", massKg: 1930, seatCount: 6, weight: 20, color: 7022133, topSpeedMph: 105, accelerationScale: 0.83, steeringScale: 0.8, gripScale: 1.02, brakeScale: 0.96, turningRadius: 6.4 },
  { id: "golf_ii", assetId: "road-volkswagen-golf-ii", bodyStyle: "compact", handlingLabel: "Light city hatchback", massKg: 1010, seatCount: 5, weight: 40, color: 12019246, topSpeedMph: 110, accelerationScale: 1.04, steeringScale: 1.12, gripScale: 1.04, brakeScale: 1.05, turningRadius: 4.8 },
  { id: "datsun_280z", assetId: "road-datsun-280z", bodyStyle: "sedan", handlingLabel: "Sport coupe", massKg: 1300, seatCount: 2, weight: 20, color: 15056201, topSpeedMph: 120, accelerationScale: 1.16, steeringScale: 1.1, gripScale: 1.07, brakeScale: 1.09, turningRadius: 5.1 },
  { id: "bmw_m3_e46", assetId: "road-bmw-m3-e46", bodyStyle: "sedan", category: "Performance coupe", handlingLabel: "M3 sports coupe", massKg: 1495, seatCount: 4, weight: 0, color: 2250384, topSpeedMph: 120, accelerationScale: 1.38, steeringScale: 1.12, gripScale: 1.14, brakeScale: 1.22, turningRadius: 5.2, parkedEligible: false },
  { id: "bmw_m3_e92_race", assetId: "road-bmw-m3-e92-race", bodyStyle: "sedan", category: "GT racing coupe", handlingLabel: "M3 racing chassis", massKg: 1150, seatCount: 1, weight: 0, color: 13226972, topSpeedMph: 120, accelerationScale: 1.8, steeringScale: 1.18, gripScale: 1.42, brakeScale: 1.48, turningRadius: 5.1, parkedEligible: false }
].map((profile) => {
  const asset = [...EXPLORER_FLEET_ASSETS, ...RACING_FLEET_ASSETS].find((entry) => entry.id === profile.assetId);
  return Object.freeze({
    ...profile,
    ...asset.dimensionsMeters,
    label: asset.label,
    wheelContacts: asset.wheelLayout,
    wheelBase: Math.max(...asset.wheelLayout.map((w) => w.position[2])) - Math.min(...asset.wheelLayout.map((w) => w.position[2])),
    halfTrack: (Math.max(...asset.wheelLayout.map((w) => w.position[0])) - Math.min(...asset.wheelLayout.map((w) => w.position[0]))) * 0.5,
    wheelRadius: asset.wheelLayout[0].radius,
    cabinScale: 0.5,
    speedFactor: 1,
    acceleration: 2.5,
    parkedEligible: profile.parkedEligible !== false,
    driverEyeGroundMeters: asset.driverEyeGroundMeters,
    rights: { kind: "licensed-model", brand: asset.license === "CC0-1.0" ? "unbranded" : asset.label, attribution: asset.attribution }
  });
}));
var VEHICLE_CATALOG = Object.freeze([...ROAD_VEHICLE_DEFINITIONS, ...LICENSED_ROAD_PROFILES].map((definition) => {
  const metadata = ROAD_VEHICLE_METADATA[definition.id] || ROAD_VEHICLE_METADATA.sedan;
  return defineTransportCatalogEntry({
    ...definition,
    ...metadata,
    ...definition.assetId ? { massKg: definition.massKg, seatCount: definition.seatCount } : {},
    domain: "road",
    playable: true,
    enterable: true,
    boardingPoints: ["driver-door", "passenger-door"],
    companionAboard: true,
    damageZones: ["front", "rear", "left", "right", "glass", "lights", "running-gear"],
    recovery: "nearby-safe-road-or-ground",
    visualRecipeId: `road-family:${definition.id}`,
    visual: {
      recipeId: `road-family:${definition.id}`,
      lods: ["promoted", "ambient", "distant"],
      mobileBudget: definition.id === "city_bus" || definition.id === "box_truck" ? "heavy-bounded" : "standard-bounded",
      referenceEvidence: ROAD_FLEET_REFERENCE
    }
  });
}));
var VEHICLE_BY_ID = Object.freeze(Object.fromEntries(VEHICLE_CATALOG.map((entry) => [entry.id, entry])));
var PARKED_VEHICLE_CATALOG = Object.freeze(VEHICLE_CATALOG.filter((entry) => entry.parkedEligible === true));

// app/js/transport/vehicle-garage-rules.js
var prices = {
  compact: 8e3,
  sedan: 14e3,
  suv: 24e3,
  pickup: 22e3,
  van: 19e3,
  delivery_van: 26e3,
  taxi: 18e3,
  box_truck: 48e3,
  city_bus: 9e4,
  delorean: 55e3,
  cadillac_coupe: 22e3,
  cadillac_fleetwood: 26e3,
  golf_ii: 9e3,
  datsun_280z: 34e3,
  bmw_m3_e46: 54e3,
  bmw_m3_e92_race: 13e4
};
var PERSONAL_VEHICLES = Object.freeze([
  Object.freeze({ id: "bmw_e34", label: "BMW 525i E34", variantId: "sedan", assetId: "vehicle-bmw-525i-e34", price: 0, category: "Personal sedan", defaultVisual: true }),
  ...VEHICLE_CATALOG.map((v) => Object.freeze({
    id: v.id,
    label: v.label,
    variantId: v.id,
    assetId: v.assetId || "",
    price: prices[v.id],
    category: v.category || v.bodyStyle,
    defaultVisual: false
  }))
]);
function personalVehicleById(id) {
  return PERSONAL_VEHICLES.find((v) => v.id === id) || null;
}
function personalVehicleIdentity(id) {
  return id === "bmw_e34" ? "player-default:sedan" : `personal-vehicle:${id}`;
}
function normalizeVehicleGarage(raw) {
  if (raw && raw.schemaVersion !== 1) throw Error("Unsupported saved vehicle garage");
  const vehicles = {};
  for (const [id, row] of Object.entries(raw?.vehicles || {})) {
    if (!personalVehicleById(id) || !row || !Number.isFinite(row.condition)) throw Error("Invalid saved vehicle");
    vehicles[id] = { ...row, id, condition: Math.max(0, Math.min(1, row.condition)), homeId: String(row.homeId || "") };
  }
  vehicles.bmw_e34 ||= { id: "bmw_e34", condition: 1, homeId: "", acquiredAt: 0 };
  const selectedId = vehicles[raw?.selectedId] ? raw.selectedId : "bmw_e34";
  return { schemaVersion: 1, revision: Math.max(0, Number(raw?.revision) || 0), selectedId, vehicles };
}
function prepareVehicleGarageChange(raw, command = {}, context = {}) {
  const garage = normalizeVehicleGarage(raw), definition = personalVehicleById(command.vehicleId);
  if (!definition) throw Error("vehicle_not_available");
  if (command.expectedRevision !== garage.revision) throw Error("vehicle_garage_changed");
  const row = garage.vehicles[definition.id];
  let cost = 0;
  if (command.action === "buy") {
    if (row) throw Error("vehicle_already_owned");
    cost = definition.price;
    garage.vehicles[definition.id] = { id: definition.id, condition: 1, homeId: "", acquiredAt: context.now || Date.now() };
  } else if (!row) throw Error("vehicle_not_owned");
  else if (command.action === "select") garage.selectedId = definition.id;
  else if (command.action === "park") {
    if (!Number.isFinite(command.condition) || command.condition < 0 || command.condition > 1) throw Error("invalid_vehicle_condition");
    row.condition = Math.min(row.condition, command.condition);
  } else if (command.action === "home") {
    const homeId = String(command.homeId || "");
    if (homeId && !context.ownsHome?.(homeId)) throw Error("vehicle_home_not_owned");
    row.homeId = homeId;
  } else throw Error("invalid_vehicle_action");
  garage.revision++;
  return { garage, cost };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PERSONAL_VEHICLES,
  normalizeVehicleGarage,
  personalVehicleById,
  personalVehicleIdentity,
  prepareVehicleGarageChange
});

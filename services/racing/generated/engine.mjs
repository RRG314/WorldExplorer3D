// Generated from existing browser rules by scripts/build-racing-service.mjs. Do not edit.
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// functions/generated/vehicle-garage-rules.cjs
var require_vehicle_garage_rules = __commonJS({
  "functions/generated/vehicle-garage-rules.cjs"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var vehicle_garage_rules_exports = {};
    __export(vehicle_garage_rules_exports, {
      PERSONAL_VEHICLES: () => PERSONAL_VEHICLES2,
      normalizeVehicleGarage: () => normalizeVehicleGarage2,
      personalVehicleById: () => personalVehicleById2,
      personalVehicleIdentity: () => personalVehicleIdentity2,
      prepareVehicleGarageChange: () => prepareVehicleGarageChange
    });
    module.exports = __toCommonJS(vehicle_garage_rules_exports);
    var TRANSPORT_CATALOG_SCHEMA_VERSION2 = 1;
    var TRANSPORT_DOMAINS2 = Object.freeze(["road", "aviation", "maritime"]);
    var TRANSPORT_DURABILITY_POLICIES2 = Object.freeze({
      EXPLORATION_UNLIMITED: "exploration_unlimited",
      STANDARD: "standard",
      HEAVY_DUTY: "heavy_duty"
    });
    function finitePositive2(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : fallback;
    }
    function defineTransportCatalogEntry2(definition = {}) {
      const id = String(definition.id || "").trim();
      const domain = String(definition.domain || "").trim();
      if (!id) throw new TypeError("Transport catalog entries require a stable id.");
      if (!TRANSPORT_DOMAINS2.includes(domain)) throw new TypeError(`Unsupported transport domain: ${domain || "missing"}`);
      const dimensions = Object.freeze({
        width: finitePositive2(definition.width ?? definition.dimensions?.width, 1),
        height: finitePositive2(definition.height ?? definition.dimensions?.height, 1),
        length: finitePositive2(definition.length ?? definition.dimensions?.length, 1),
        massKg: finitePositive2(definition.massKg ?? definition.dimensions?.massKg, 1e3),
        draft: Math.max(0, Number(definition.draft ?? definition.dimensions?.draft) || 0),
        wingspan: Math.max(0, Number(definition.wingspan ?? definition.dimensions?.wingspan) || 0),
        rotorDiameter: Math.max(0, Number(definition.rotorDiameter ?? definition.dimensions?.rotorDiameter) || 0)
      });
      const performance = Object.freeze({
        topSpeed: finitePositive2(definition.topSpeedMph ?? definition.performance?.topSpeed, 1),
        topSpeedUnit: String(definition.performance?.topSpeedUnit || (domain === "maritime" ? "knots" : domain === "aviation" ? "knots-ias" : "mph")),
        accelerationScale: finitePositive2(definition.accelerationScale ?? definition.performance?.accelerationScale, 1),
        steeringScale: finitePositive2(definition.steeringScale ?? definition.performance?.steeringScale, 1),
        gripScale: finitePositive2(definition.gripScale ?? definition.performance?.gripScale, 1),
        brakeScale: finitePositive2(definition.brakeScale ?? definition.performance?.brakeScale, 1),
        turningRadius: finitePositive2(definition.turningRadius ?? definition.performance?.turningRadius, dimensions.length)
      });
      const interaction = Object.freeze({
        playable: definition.playable !== false,
        enterable: definition.enterable !== false,
        seatCount: Math.max(1, Math.floor(Number(definition.seatCount ?? definition.interaction?.seatCount) || 1)),
        boardingPoints: Object.freeze((definition.boardingPoints || definition.interaction?.boardingPoints || ["driver"]).map(String)),
        companionAboard: definition.companionAboard !== false
      });
      const damage = Object.freeze({
        durabilityPolicy: String(definition.durabilityPolicy || definition.damage?.durabilityPolicy || TRANSPORT_DURABILITY_POLICIES2.STANDARD),
        resistance: finitePositive2(definition.resistance ?? definition.damage?.resistance, 160),
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
        schemaVersion: TRANSPORT_CATALOG_SCHEMA_VERSION2,
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
    var EXPLORER_FLEET_ASSETS2 = Object.freeze([
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
    var ROAD_VEHICLE_DEFINITIONS2 = Object.freeze([
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
    var ROAD_VEHICLE_METADATA2 = Object.freeze({
      compact: Object.freeze({ massKg: 1240, seatCount: 4, resistance: 145 }),
      sedan: Object.freeze({ massKg: 1520, seatCount: 5, resistance: 160 }),
      suv: Object.freeze({ massKg: 1980, seatCount: 5, resistance: 185 }),
      pickup: Object.freeze({ massKg: 2240, seatCount: 5, resistance: 195 }),
      van: Object.freeze({ massKg: 2350, seatCount: 8, resistance: 205 }),
      delivery_van: Object.freeze({ massKg: 2480, seatCount: 2, resistance: 210 }),
      taxi: Object.freeze({ massKg: 1640, seatCount: 5, resistance: 165 }),
      box_truck: Object.freeze({ massKg: 5200, seatCount: 3, resistance: 285, durabilityPolicy: TRANSPORT_DURABILITY_POLICIES2.HEAVY_DUTY }),
      city_bus: Object.freeze({ massKg: 11800, seatCount: 38, resistance: 360, durabilityPolicy: TRANSPORT_DURABILITY_POLICIES2.HEAVY_DUTY })
    });
    var ROAD_FLEET_REFERENCE2 = "docs/reference-art/road-fleet-and-damage-2026-08-29.png";
    var LICENSED_ROAD_PROFILES2 = Object.freeze([
      { id: "delorean", assetId: "road-delorean-dmc12", bodyStyle: "sedan", handlingLabel: "Rear-engine touring", massKg: 1230, seatCount: 2, weight: 12, color: 10922413, topSpeedMph: 109, accelerationScale: 0.92, steeringScale: 1.04, gripScale: 1.02, brakeScale: 1.04, turningRadius: 5.4 },
      { id: "cadillac_coupe", assetId: "road-cadillac-coupe-deville", bodyStyle: "sedan", handlingLabel: "Long-wheelbase cruiser", massKg: 2240, seatCount: 6, weight: 16, color: 8171424, topSpeedMph: 105, accelerationScale: 0.8, steeringScale: 0.76, gripScale: 0.96, brakeScale: 0.91, turningRadius: 6.6 },
      { id: "cadillac_fleetwood", assetId: "road-cadillac-fleetwood-brougham", bodyStyle: "sedan", handlingLabel: "Luxury touring sedan", massKg: 1930, seatCount: 6, weight: 20, color: 7022133, topSpeedMph: 105, accelerationScale: 0.83, steeringScale: 0.8, gripScale: 1.02, brakeScale: 0.96, turningRadius: 6.4 },
      { id: "golf_ii", assetId: "road-volkswagen-golf-ii", bodyStyle: "compact", handlingLabel: "Light city hatchback", massKg: 1010, seatCount: 5, weight: 40, color: 12019246, topSpeedMph: 110, accelerationScale: 1.04, steeringScale: 1.12, gripScale: 1.04, brakeScale: 1.05, turningRadius: 4.8 },
      { id: "datsun_280z", assetId: "road-datsun-280z", bodyStyle: "sedan", handlingLabel: "Sport coupe", massKg: 1300, seatCount: 2, weight: 20, color: 15056201, topSpeedMph: 120, accelerationScale: 1.16, steeringScale: 1.1, gripScale: 1.07, brakeScale: 1.09, turningRadius: 5.1 }
    ].map((profile) => {
      const asset = EXPLORER_FLEET_ASSETS2.find((entry) => entry.id === profile.assetId);
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
        parkedEligible: true,
        rights: { kind: "licensed-model", brand: asset.label, attribution: asset.attribution }
      });
    }));
    var VEHICLE_CATALOG2 = Object.freeze([...ROAD_VEHICLE_DEFINITIONS2, ...LICENSED_ROAD_PROFILES2].map((definition) => {
      const metadata = ROAD_VEHICLE_METADATA2[definition.id] || ROAD_VEHICLE_METADATA2.sedan;
      return defineTransportCatalogEntry2({
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
          referenceEvidence: ROAD_FLEET_REFERENCE2
        }
      });
    }));
    var VEHICLE_BY_ID2 = Object.freeze(Object.fromEntries(VEHICLE_CATALOG2.map((entry) => [entry.id, entry])));
    var PARKED_VEHICLE_CATALOG2 = Object.freeze(VEHICLE_CATALOG2.filter((entry) => entry.parkedEligible === true));
    var prices2 = {
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
      datsun_280z: 34e3
    };
    var PERSONAL_VEHICLES2 = Object.freeze([
      Object.freeze({ id: "bmw_e34", label: "BMW 525i E34", variantId: "sedan", assetId: "vehicle-bmw-525i-e34", price: 0, category: "Personal sedan", defaultVisual: true }),
      ...VEHICLE_CATALOG2.map((v) => Object.freeze({
        id: v.id,
        label: v.label,
        variantId: v.id,
        assetId: v.assetId || "",
        price: prices2[v.id],
        category: v.bodyStyle,
        defaultVisual: false
      }))
    ]);
    function personalVehicleById2(id) {
      return PERSONAL_VEHICLES2.find((v) => v.id === id) || null;
    }
    function personalVehicleIdentity2(id) {
      return id === "bmw_e34" ? "player-default:sedan" : `personal-vehicle:${id}`;
    }
    function normalizeVehicleGarage2(raw) {
      if (raw && raw.schemaVersion !== 1) throw Error("Unsupported saved vehicle garage");
      const vehicles = {};
      for (const [id, row] of Object.entries(raw?.vehicles || {})) {
        if (!personalVehicleById2(id) || !row || !Number.isFinite(row.condition)) throw Error("Invalid saved vehicle");
        vehicles[id] = { ...row, id, condition: Math.max(0, Math.min(1, row.condition)), homeId: String(row.homeId || "") };
      }
      vehicles.bmw_e34 ||= { id: "bmw_e34", condition: 1, homeId: "", acquiredAt: 0 };
      const selectedId = vehicles[raw?.selectedId] ? raw.selectedId : "bmw_e34";
      return { schemaVersion: 1, revision: Math.max(0, Number(raw?.revision) || 0), selectedId, vehicles };
    }
    function prepareVehicleGarageChange(raw, command = {}, context = {}) {
      const garage = normalizeVehicleGarage2(raw), definition = personalVehicleById2(command.vehicleId);
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
  }
});

// functions/economy-authority.js
var require_economy_authority = __commonJS({
  "functions/economy-authority.js"(exports, module) {
    "use strict";
    var STARTING_CREDITS = 1e6;
    var MAX_CREDITS = 2e9;
    var CURRENCY_VERSION = 2;
    var LEGACY_CURRENCY_SCALE = 2e3;
    var STANDARD_DAILY_QUANTITY = 3;
    var COMMERCE_CATALOG = Object.freeze({
      "trail-water": Object.freeze({ buy: 4, sell: 2 }),
      "route-snack": Object.freeze({ buy: 6, sell: 3 }),
      "battery-pack": Object.freeze({ buy: 14, sell: 7 }),
      "first-aid-pouch": Object.freeze({ buy: 18, sell: 9 }),
      "field-medicine": Object.freeze({ buy: 34, sell: 17 }),
      "city-postcard": Object.freeze({ buy: 10, sell: 5 }),
      "field-notebook": Object.freeze({ buy: 12, sell: 6 }),
      "reclaimed-aluminum-stock": Object.freeze({ buy: 42, sell: 21 }),
      "ceramic-repair-stock": Object.freeze({ buy: 38, sell: 19 }),
      "copper-wire-coil": Object.freeze({ buy: 28, sell: 14 }),
      "sealed-bearing-kit": Object.freeze({ buy: 55, sell: 27 }),
      "repair-sealant-case": Object.freeze({ buy: 34, sell: 17 }),
      "vehicle-full-repair": Object.freeze({ service: 3800 }),
      "companion-wellness": Object.freeze({ service: 180 }),
      "player-treatment": Object.freeze({ service: 450 }),
      "vessel-full-repair": Object.freeze({ service: 4200 }),
      "vehicle-upgrade:engine-tune:1": Object.freeze({ service: 4e3 }),
      "vehicle-upgrade:engine-tune:2": Object.freeze({ service: 9e3 }),
      "vehicle-upgrade:engine-tune:3": Object.freeze({ service: 18e3 }),
      "vehicle-upgrade:street-brakes:1": Object.freeze({ service: 2500 }),
      "vehicle-upgrade:street-brakes:2": Object.freeze({ service: 5200 }),
      "vehicle-upgrade:street-brakes:3": Object.freeze({ service: 9500 }),
      "vehicle-upgrade:all-road-tires:1": Object.freeze({ service: 1200 }),
      "vehicle-upgrade:all-road-tires:2": Object.freeze({ service: 2400 }),
      "vehicle-upgrade:all-road-tires:3": Object.freeze({ service: 4500 }),
      "vehicle-upgrade:reinforced-suspension:1": Object.freeze({ service: 3e3 }),
      "vehicle-upgrade:reinforced-suspension:2": Object.freeze({ service: 6500 }),
      "vehicle-upgrade:reinforced-suspension:3": Object.freeze({ service: 12e3 })
    });
    function finite(value, fallback = 0) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }
    function integer(value, min, max, fallback = min) {
      return Math.max(min, Math.min(max, Math.round(finite(value, fallback))));
    }
    function clean2(value, max = 180) {
      return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
    }
    function snapshotData(snapshot) {
      if (!snapshot) return null;
      const exists = typeof snapshot.exists === "function" ? snapshot.exists() : snapshot.exists === true;
      return exists ? snapshot.data() || {} : null;
    }
    function walletData(raw = {}) {
      const legacy = finite(raw.currencyVersion) < CURRENCY_VERSION;
      const scale = legacy && Object.keys(raw).length ? LEGACY_CURRENCY_SCALE : 1;
      return {
        authority: "explorer-wallet-v2",
        credits: integer(finite(raw.credits, STARTING_CREDITS) * scale, 0, MAX_CREDITS, STARTING_CREDITS),
        lifetimeEarned: integer(finite(raw.lifetimeEarned, finite(raw.credits, STARTING_CREDITS)) * scale, 0, MAX_CREDITS, STARTING_CREDITS),
        lifetimeSpent: integer(finite(raw.lifetimeSpent) * scale, 0, MAX_CREDITS, 0),
        revision: integer(raw.revision, 0, MAX_CREDITS, 0),
        currencyVersion: CURRENCY_VERSION
      };
    }
    async function settleCommerceTransaction(options = {}) {
      const { runTransaction, walletRef, receiptRef, itemRef, stockRef, timestampFromMs, uid, nowMs = Date.now(), input = {} } = options;
      if (typeof runTransaction !== "function" || !walletRef || !receiptRef || !itemRef || !stockRef || !uid || typeof timestampFromMs !== "function") {
        throw new TypeError("commerce transaction dependencies are required");
      }
      const action = clean2(input.action, 16).toLowerCase();
      const requestId = clean2(input.requestId, 120);
      const storeId = clean2(input.storeId, 420);
      const catalogId = clean2(input.catalogId, 100);
      const targetId = clean2(input.targetId, 180);
      const dayKey = clean2(input.dayKey, 10);
      const definition = COMMERCE_CATALOG[catalogId];
      const expectedDayKey = new Date(nowMs).toISOString().slice(0, 10);
      if (!["buy", "sell", "service"].includes(action) || !requestId || !storeId || !definition || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || action === "service" !== Number.isFinite(definition.service)) {
        throw new Error("invalid_commerce_transaction");
      }
      return runTransaction(async (transaction) => {
        const [receiptSnapshot, walletSnapshot, itemSnapshot, stockSnapshot] = await Promise.all([
          transaction.get(receiptRef),
          transaction.get(walletRef),
          transaction.get(itemRef),
          transaction.get(stockRef)
        ]);
        const prior = snapshotData(receiptSnapshot);
        if (prior) {
          if (["action", "storeId", "catalogId", "targetId", "dayKey"].some((key) => String(prior[key] || "") !== String({ action, storeId, catalogId, targetId, dayKey }[key] || ""))) {
            throw new Error("invalid_commerce_transaction");
          }
          return Object.freeze({ ...prior, itemId: action === "service" ? "" : itemRef.id || "", duplicate: true });
        }
        if (dayKey !== expectedDayKey) throw new Error("invalid_commerce_transaction");
        const wallet = walletData(snapshotData(walletSnapshot) || {});
        const item = snapshotData(itemSnapshot) || { catalogId, quantity: 0 };
        const quantity = integer(item.quantity, 0, 1e5, 0);
        const stock = snapshotData(stockSnapshot) || { dayKey, storeId, catalogId, purchased: 0 };
        const purchased = integer(stock.purchased, 0, STANDARD_DAILY_QUANTITY, 0);
        const amount = action === "buy" ? definition.buy : action === "sell" ? definition.sell : definition.service;
        if (action !== "sell" && wallet.credits < amount) return Object.freeze({ accepted: false, reason: "not_enough_credits", credits: wallet.credits });
        if (action === "buy" && purchased >= STANDARD_DAILY_QUANTITY) return Object.freeze({ accepted: false, reason: "sold_out", credits: wallet.credits });
        if (action === "sell" && quantity < 1) return Object.freeze({ accepted: false, reason: "item_not_owned", credits: wallet.credits });
        const nextWallet = {
          ...wallet,
          credits: wallet.credits + (action === "sell" ? amount : -amount),
          lifetimeEarned: wallet.lifetimeEarned + (action === "sell" ? amount : 0),
          lifetimeSpent: wallet.lifetimeSpent + (action !== "sell" ? amount : 0),
          revision: wallet.revision + 1,
          updatedAt: timestampFromMs(nowMs)
        };
        const nextItem = {
          authority: "explorer-commerce-item-v1",
          catalogId,
          quantity: quantity + (action === "buy" ? 1 : action === "sell" ? -1 : 0),
          revision: integer(item.revision, 0, MAX_CREDITS, 0) + 1,
          updatedAt: timestampFromMs(nowMs)
        };
        const receipt = {
          accepted: true,
          authority: "explorer-wallet-v2",
          requestId,
          action,
          storeId,
          catalogId,
          targetId,
          dayKey,
          amount,
          itemId: action === "service" ? "" : itemRef.id || "",
          credits: nextWallet.credits,
          itemQuantity: action === "service" ? null : nextItem.quantity,
          storePurchased: action === "buy" ? purchased + 1 : purchased,
          settlementStatus: action === "service" ? "effect_pending" : "complete",
          createdAt: timestampFromMs(nowMs)
        };
        transaction.set(walletRef, nextWallet, { merge: false });
        if (action !== "service") transaction.set(itemRef, nextItem, { merge: false });
        if (action === "buy") transaction.set(stockRef, {
          authority: "explorer-commerce-stock-v1",
          dayKey,
          storeId,
          catalogId,
          purchased: purchased + 1,
          updatedAt: timestampFromMs(nowMs)
        }, { merge: false });
        transaction.set(receiptRef, receipt, { merge: false });
        return Object.freeze({ ...receipt, itemId: action === "service" ? "" : itemRef.id || "" });
      });
    }
    async function settleCommerceOutcome(options = {}) {
      const { runTransaction, walletRef, receiptRef, playerProgressRef, timestampFromMs, nowMs = Date.now(), input = {} } = options;
      if (typeof runTransaction !== "function" || !walletRef || !receiptRef || typeof timestampFromMs !== "function") {
        throw new TypeError("commerce outcome dependencies are required");
      }
      const requestId = clean2(input.requestId, 120);
      const outcome = clean2(input.outcome, 24).toLowerCase();
      const reason = clean2(input.reason, 120);
      if (!requestId || !["applied", "failed"].includes(outcome)) throw new Error("invalid_commerce_outcome");
      return runTransaction(async (transaction) => {
        const [receiptSnapshot, walletSnapshot, progressSnapshot] = await Promise.all([
          transaction.get(receiptRef),
          transaction.get(walletRef),
          playerProgressRef ? transaction.get(playerProgressRef) : Promise.resolve(null)
        ]);
        const receipt = snapshotData(receiptSnapshot);
        if (!receipt || receipt.requestId !== requestId || receipt.action !== "service" || receipt.accepted !== true) {
          throw new Error("commerce_receipt_not_found");
        }
        if (["complete", "compensated"].includes(receipt.settlementStatus)) {
          return Object.freeze({ ...receipt, duplicate: true });
        }
        if (outcome === "applied") {
          const settled = { ...receipt, settlementStatus: "complete", effectAppliedAt: timestampFromMs(nowMs) };
          transaction.set(receiptRef, settled, { merge: false });
          const upgrade = /^vehicle-upgrade:([a-z0-9-]+):(\d+)$/.exec(String(receipt.catalogId || ""));
          if (playerProgressRef && upgrade && receipt.targetId) {
            const current = snapshotData(progressSnapshot) || {};
            const vehicles = current.vehicles && typeof current.vehicles === "object" ? { ...current.vehicles } : {};
            const levels = vehicles[receipt.targetId] && typeof vehicles[receipt.targetId] === "object" ? { ...vehicles[receipt.targetId] } : {};
            levels[upgrade[1]] = Math.max(Number(levels[upgrade[1]] || 0), Number(upgrade[2]));
            vehicles[receipt.targetId] = levels;
            transaction.set(playerProgressRef, {
              ...current,
              authority: "explorer-player-state-v1",
              schemaVersion: 1,
              vehicles,
              revision: Math.max(0, Number(current.revision || 0)) + 1,
              updatedAt: timestampFromMs(nowMs)
            }, { merge: false });
          }
          if (playerProgressRef && receipt.catalogId === "vehicle-full-repair" && receipt.targetId) {
            const current = snapshotData(progressSnapshot) || {};
            const { normalizeVehicleGarage: normalizeVehicleGarage2, personalVehicleIdentity: personalVehicleIdentity2 } = require_vehicle_garage_rules();
            const garage = normalizeVehicleGarage2(current.garage);
            const row = Object.values(garage.vehicles).find((v) => personalVehicleIdentity2(v.id) === receipt.targetId);
            if (row) {
              row.condition = 1;
              garage.revision++;
              transaction.set(playerProgressRef, { ...current, garage, updatedAt: timestampFromMs(nowMs) }, { merge: false });
            }
          }
          return Object.freeze(settled);
        }
        const wallet = walletData(snapshotData(walletSnapshot) || {});
        const amount = integer(receipt.amount, 0, MAX_CREDITS, 0);
        const nextWallet = {
          ...wallet,
          credits: Math.min(MAX_CREDITS, wallet.credits + amount),
          lifetimeSpent: Math.max(0, wallet.lifetimeSpent - amount),
          revision: wallet.revision + 1,
          updatedAt: timestampFromMs(nowMs)
        };
        const compensated = {
          ...receipt,
          settlementStatus: "compensated",
          compensationReason: reason || "gameplay_effect_failed",
          credits: nextWallet.credits,
          compensatedAt: timestampFromMs(nowMs)
        };
        transaction.set(walletRef, nextWallet, { merge: false });
        transaction.set(receiptRef, compensated, { merge: false });
        return Object.freeze(compensated);
      });
    }
    module.exports = {
      COMMERCE_CATALOG,
      CURRENCY_VERSION,
      MAX_CREDITS,
      STARTING_CREDITS,
      STANDARD_DAILY_QUANTITY,
      settleCommerceOutcome,
      settleCommerceTransaction,
      walletData
    };
    async function settleVehicleGarageAction({
      runTransaction,
      walletRef,
      progressRef,
      receiptRef,
      propertyRef,
      uid,
      input = {},
      nowMs = Date.now(),
      timestampFromMs
    }) {
      const { normalizeVehicleGarage: normalizeVehicleGarage2, prepareVehicleGarageChange } = require_vehicle_garage_rules();
      if (!uid || !input.requestId || !["initialize", "buy", "select", "park", "home"].includes(input.action)) throw Error("invalid_vehicle_action");
      const fingerprint = JSON.stringify([input.action, input.vehicleId || "", input.homeId || "", input.condition ?? null, input.expectedRevision ?? null]);
      return runTransaction(async (tx) => {
        const [saved, balance, receipt, property] = await Promise.all([tx.get(progressRef), tx.get(walletRef), tx.get(receiptRef), propertyRef ? tx.get(propertyRef) : null]);
        const prior = snapshotData(receipt);
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw Error("vehicle_request_conflict");
          return { ...prior.result, duplicate: true };
        }
        const progress = snapshotData(saved) || {}, wallet = walletData(snapshotData(balance) || {});
        if (input.action !== "initialize" && (progress.raceReservation?.expiresAt?.toMillis?.() || 0) > nowMs) throw Error("vehicle_in_race");
        const change = input.action === "initialize" ? { garage: normalizeVehicleGarage2(progress.garage), cost: 0 } : prepareVehicleGarageChange(progress.garage, input, { now: nowMs, ownsHome: (id) => id === input.homeId && snapshotData(property)?.ownerUid === uid });
        if (change.cost > wallet.credits) throw Error("not_enough_credits");
        if (change.cost) tx.set(walletRef, {
          ...wallet,
          credits: wallet.credits - change.cost,
          lifetimeSpent: wallet.lifetimeSpent + change.cost,
          revision: wallet.revision + 1,
          updatedAt: timestampFromMs(nowMs)
        }, { merge: false });
        const result = { ok: true, garage: change.garage, credits: wallet.credits - change.cost };
        tx.set(progressRef, {
          ...progress,
          authority: "explorer-player-state-v1",
          schemaVersion: 1,
          garage: change.garage,
          revision: Number(progress.revision || 0) + 1,
          updatedAt: timestampFromMs(nowMs)
        }, { merge: false });
        tx.set(receiptRef, { fingerprint, result, createdAt: timestampFromMs(nowMs) }, { merge: false });
        return result;
      });
    }
    module.exports.settleVehicleGarageAction = settleVehicleGarageAction;
    function prepareExplorerCreditAward2(raw, { amount, nowMs, timestampFromMs }) {
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1e3) throw Error("invalid_credit_award");
      const wallet = walletData(raw), credit = Math.min(amount, MAX_CREDITS - wallet.credits);
      return {
        ...wallet,
        credits: wallet.credits + credit,
        lifetimeEarned: Math.min(MAX_CREDITS, wallet.lifetimeEarned + credit),
        revision: wallet.revision + 1,
        updatedAt: timestampFromMs(nowMs)
      };
    }
    module.exports.prepareExplorerCreditAward = prepareExplorerCreditAward2;
  }
});

// app/js/racing/course-rules.js
var RACE_COURSE_VERSION = 1;
var RACE_DISCIPLINES = Object.freeze(["sprint", "circuit", "time-trial"]);
var finitePoint = (p) => p && ["x", "y", "z"].every((k) => Number.isFinite(p[k]));
var distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
var angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z)));
var direction = (a, b) => {
  const n = distance(a, b);
  return { x: (b.x - a.x) / n, z: (b.z - a.z) / n };
};
var clean = (s) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
function sampleRaceSegmentY(segment, t, lateralMeters = 0) {
  const samples = segment.heightSamples;
  if (!samples?.length) return segment.a.y + (segment.b.y - segment.a.y) * t;
  let lower = samples[0], upper = samples.at(-1);
  for (let index = 1; index < samples.length; index++) if (samples[index].t >= t) {
    lower = samples[index - 1];
    upper = samples[index];
    break;
  }
  const blend = Math.max(0, Math.min(1, (t - lower.t) / Math.max(1e-9, upper.t - lower.t))), y = lower.y + (upper.y - lower.y) * blend;
  const side = lateralMeters < 0 ? "leftY" : "rightY", edge = Number.isFinite(lower[side]) && Number.isFinite(upper[side]) ? lower[side] + (upper[side] - lower[side]) * blend : y;
  return y + (edge - y) * Math.abs(lateralMeters) / Math.max(0.1, segment.heightSampleSpanMeters || 1.2);
}
function sliceHeights(segment, start, end) {
  if (!segment.heightSamples?.length) return null;
  const at = (t) => ({ t: (t - start) / (end - start), y: sampleRaceSegmentY(segment, t), leftY: sampleRaceSegmentY(segment, t, -segment.heightSampleSpanMeters), rightY: sampleRaceSegmentY(segment, t, segment.heightSampleSpanMeters) });
  return [at(start), ...segment.heightSamples.filter((s) => s.t > start && s.t < end).map((s) => ({ ...s, t: (s.t - start) / (end - start) })), at(end)];
}
function buildRaceRoadGraph(roads, { metersPerUnit = 1, minimumWidth = 6, maximumGrade = 0.22 } = {}) {
  if (!(metersPerUnit > 0 && metersPerUnit <= 10) || !Array.isArray(roads) || roads.length > 5e4) throw Error("invalid_race_road_source");
  const nodes = [], edges = [], outgoing = /* @__PURE__ */ new Map(), buckets = /* @__PURE__ */ new Map(), edgeIds = /* @__PURE__ */ new Set();
  function node(point, layer) {
    const gx = Math.round(point.x * 2), gz = Math.round(point.z * 2), key = `${gx}:${gz}:${layer}`;
    for (let x = gx - 1; x <= gx + 1; x++) for (let z = gz - 1; z <= gz + 1; z++) for (const id2 of buckets.get(`${x}:${z}:${layer}`) || []) {
      const n = nodes[id2];
      if (distance(n, point) * metersPerUnit <= 0.55 && Math.abs(n.y - point.y) * metersPerUnit <= 0.35) return id2;
    }
    const id = nodes.length;
    nodes.push({ id, ...point });
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
    return id;
  }
  for (const road of roads) {
    let add = function(a, b, reverse) {
      const heights = road.heightSamples;
      if (heights && (!Array.isArray(heights) || heights.length < 2 || heights.length > 250 || heights.some((s, i) => !Number.isFinite(s.t) || !Number.isFinite(s.y) || s.t < 0 || s.t > 1 || i > 0 && s.t <= heights[i - 1].t) || heights[0].t !== 0 || heights.at(-1).t !== 1)) throw Error("invalid_race_road_heights");
      if (heights) {
        const span = Number(road.heightSampleSpanMeters ?? 1.2);
        if (!(span >= 0.2 && span <= 4) || Math.abs(heights[0].y - road.a.y) > 1e-3 || Math.abs(heights.at(-1).y - road.b.y) > 1e-3 || heights.some((s, i) => i > 0 && Math.abs(s.y - heights[i - 1].y) * metersPerUnit / ((s.t - heights[i - 1].t) * length) > maximumGrade || (s.leftY !== void 0 || s.rightY !== void 0) && (!Number.isFinite(s.leftY) || !Number.isFinite(s.rightY) || Math.max(Math.abs(s.leftY - s.y), Math.abs(s.rightY - s.y)) * metersPerUnit / span > 0.15))) throw Error("invalid_race_road_heights");
      }
      const id = `${String(road.sourceId).slice(0, 180)}:${reverse ? "reverse" : "forward"}`, edge = {
        id,
        from: a,
        to: b,
        length,
        widthMeters: width,
        sourceId: String(road.sourceId).slice(0, 180),
        structure: road.structure || "surface",
        clearanceMeters: Number(road.clearanceMeters) || 0
      };
      if (heights) {
        edge.heightSamples = reverse ? heights.map((s) => ({ ...s, t: 1 - s.t, leftY: s.rightY, rightY: s.leftY })).reverse() : heights.map((s) => ({ ...s }));
        edge.heightSampleSpanMeters = Number(road.heightSampleSpanMeters) || 1.2;
      }
      if (edgeIds.has(id)) throw Error("duplicate_race_road_identity");
      edgeIds.add(id);
      edges.push(edge);
      if (!outgoing.has(a)) outgoing.set(a, []);
      outgoing.get(a).push(edge);
    };
    if (!road?.sourceId || !finitePoint(road.a) || !finitePoint(road.b) || road.driveable !== true || road.supported !== true) continue;
    const length = distance(road.a, road.b) * metersPerUnit, width = Number(road.widthMeters);
    if (length < 2 || !Number.isFinite(width) || width < minimumWidth || Math.abs(road.b.y - road.a.y) * metersPerUnit / length > maximumGrade) continue;
    if (road.blocked === true || road.structure === "tunnel" && !(road.clearanceMeters >= 2.5)) continue;
    const from = node(road.a, String(road.a.connectionLayer || "road")), to = node(road.b, String(road.b.connectionLayer || "road"));
    if (road.direction !== "reverse") add(from, to, false);
    if (road.direction !== "forward") add(to, from, true);
  }
  return { version: RACE_COURSE_VERSION, metersPerUnit, nodes, edges, outgoing };
}
function createRaceCourse(graph, path, settings = {}) {
  if (!Array.isArray(path) || path.length < 1 || path.length > 500) throw Error("invalid_race_route");
  const byId = new Map(graph.edges.map((e) => [e.id, e])), edges = path.map((id) => byId.get(id));
  if (edges.some((e) => !e)) throw Error("race_road_missing");
  const discipline = settings.discipline || "sprint";
  if (!RACE_DISCIPLINES.includes(discipline)) throw Error("invalid_race_discipline");
  const closed = edges.at(-1).to === edges[0].from;
  if (discipline === "circuit" && !closed) throw Error("race_circuit_not_closed");
  if (discipline !== "circuit" && closed) throw Error("race_sprint_is_closed");
  const laps = discipline === "circuit" ? Math.floor(Number(settings.laps) || 1) : 1;
  if (laps < 1 || laps > 8) throw Error("invalid_race_laps");
  const points = [{ ...graph.nodes[edges[0].from] }], segments = [];
  let lengthMeters = 0;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (i && edges[i - 1].to !== edge.from) throw Error("disconnected_race_route");
    const a = graph.nodes[edge.from], b = graph.nodes[edge.to], forward = direction(a, b);
    if (i) {
      const previous = segments.at(-1);
      if (angle(previous.forward, forward) > Math.PI * 0.64) throw Error("race_turn_too_sharp");
    }
    segments.push({
      sourceId: edge.sourceId,
      a: { ...a },
      b: { ...b },
      forward,
      widthMeters: edge.widthMeters,
      lengthMeters: edge.length,
      startMeters: lengthMeters,
      structure: edge.structure,
      clearanceMeters: edge.clearanceMeters,
      ...edge.heightSamples ? { heightSamples: edge.heightSamples.map((s) => ({ ...s })), heightSampleSpanMeters: edge.heightSampleSpanMeters } : {}
    });
    points.push({ ...b });
    lengthMeters += edge.length;
  }
  if (closed && angle(segments.at(-1).forward, segments[0].forward) > Math.PI * 0.64) throw Error("race_turn_too_sharp");
  if (lengthMeters < 200 || lengthMeters > 8e3) throw Error("race_route_length");
  if (closed) {
    const original = segments.shift(), offset = Number(settings.startOffsetMeters ?? original.lengthMeters * 0.5);
    if (!(offset > 0 && offset < original.lengthMeters)) throw Error("invalid_race_start");
    const t = offset / original.lengthMeters, midpoint = {
      x: original.a.x + (original.b.x - original.a.x) * t,
      y: sampleRaceSegmentY(original, t),
      z: original.a.z + (original.b.z - original.a.z) * t
    };
    segments.unshift({ ...original, a: midpoint, lengthMeters: original.lengthMeters - offset, heightSamples: sliceHeights(original, t, 1) });
    segments.push({ ...original, b: midpoint, lengthMeters: offset, heightSamples: sliceHeights(original, 0, t) });
    let cursor = 0;
    for (const segment of segments) {
      segment.startMeters = cursor;
      cursor += segment.lengthMeters;
    }
    points.splice(0, points.length, { ...segments[0].a }, ...segments.map((segment) => ({ ...segment.b })));
  }
  const participants = Math.max(1, Math.min(4, Math.floor(Number(settings.participants) || 1)));
  const gridLength = (Math.ceil(participants / 2) - 1) * 8 + 12;
  let gridRun = 0;
  for (const segment of segments) {
    if (angle(segments[0].forward, segment.forward) > 0.12 || segment.widthMeters < 6) break;
    gridRun += segment.lengthMeters;
    if (gridRun >= gridLength) break;
  }
  if (gridRun < gridLength) throw Error("race_grid_has_no_clearance");
  const course = {
    version: RACE_COURSE_VERSION,
    sourcePath: [...path],
    startOffsetMeters: closed ? Number(settings.startOffsetMeters ?? edges[0].length * 0.5) : null,
    name: clean(settings.name) || "Mapped road run",
    description: String(settings.description || "").trim().slice(0, 400),
    locationId: clean(settings.locationId),
    locationLabel: clean(settings.locationLabel),
    anchor: settings.anchor ? { lat: Number(settings.anchor.lat), lon: Number(settings.anchor.lon) } : null,
    discipline,
    laps,
    participants,
    vehicleEnvelope: { widthMeters: 2.35, lengthMeters: 6.5, heightMeters: 2.4 },
    metersPerUnit: graph.metersPerUnit,
    vehicleClass: settings.vehicleClass || "road",
    traffic: "closed-course",
    collision: "ghost",
    lengthMeters,
    segments,
    points,
    gateSpacingMeters: Math.min(30, Math.max(15, Number(settings.gateSpacingMeters) || 25)),
    gates: []
  };
  let at = course.gateSpacingMeters;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index], before = segments[index - 1], after = segments[index + 1];
    while (at < segment.startMeters + segment.lengthMeters - 1e-6) {
      const t = (at - segment.startMeters) / segment.lengthMeters;
      const nearStart = before && angle(before.forward, segment.forward) > 0.15 && at - segment.startMeters < 5;
      const nearEnd = after && angle(segment.forward, after.forward) > 0.15 && segment.startMeters + segment.lengthMeters - at < 5;
      if (nearStart || nearEnd) {
        at += course.gateSpacingMeters;
        continue;
      }
      course.gates.push({
        x: segment.a.x + (segment.b.x - segment.a.x) * t,
        y: sampleRaceSegmentY(segment, t),
        z: segment.a.z + (segment.b.z - segment.a.z) * t,
        forward: segment.forward,
        halfWidthMeters: segment.widthMeters * 0.5,
        distanceMeters: at
      });
      at += course.gateSpacingMeters;
    }
  }
  const last = segments.at(-1);
  course.gates.push({ ...last.b, forward: last.forward, halfWidthMeters: last.widthMeters * 0.5, distanceMeters: lengthMeters });
  if (!course.locationId || !course.anchor || !Number.isFinite(course.anchor.lat) || Math.abs(course.anchor.lat) > 85 || !Number.isFinite(course.anchor.lon) || Math.abs(course.anchor.lon) > 180) throw Error("invalid_race_location");
  return course;
}
function projectRacePosition(course, pose, { minimumMeters = -Infinity, maximumMeters = Infinity } = {}) {
  let nearest = null;
  for (let index = 0; index < course.segments.length; index++) {
    const s = course.segments[index], dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l2 = dx * dx + dz * dz;
    if (s.startMeters > maximumMeters || s.startMeters + s.lengthMeters < minimumMeters) continue;
    const lower = Math.max(0, (minimumMeters - s.startMeters) / s.lengthMeters), upper = Math.min(1, (maximumMeters - s.startMeters) / s.lengthMeters);
    const t = Math.max(lower, Math.min(upper, ((pose.x - s.a.x) * dx + (pose.z - s.a.z) * dz) / l2));
    const x = s.a.x + dx * t, z = s.a.z + dz * t, lateral = ((pose.x - x) * s.forward.z - (pose.z - z) * s.forward.x) * course.metersPerUnit, y = sampleRaceSegmentY(s, t, lateral);
    const error = Math.hypot(pose.x - x, pose.z - z) * course.metersPerUnit, vertical = Math.abs(pose.y - y) * course.metersPerUnit;
    if (vertical > 2.5) continue;
    if (!nearest || error < nearest.error) nearest = { index, t, x, y, z, lateralMeters: lateral, error, vertical, distanceMeters: s.startMeters + s.lengthMeters * t, widthMeters: s.widthMeters };
  }
  return nearest;
}
function raceGridPose(course, index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= course.participants) throw Error("invalid_race_grid_slot");
  const distanceMeters = course.vehicleEnvelope.lengthMeters / 2 + 1 + (Math.ceil(course.participants / 2) - 1 - Math.floor(index / 2)) * 8;
  const s = course.segments.find((segment) => segment.startMeters + segment.lengthMeters >= distanceMeters) || course.segments.at(-1);
  const forward = s.forward, along = (distanceMeters - s.startMeters) / course.metersPerUnit;
  const lateral = (course.participants === 1 ? 0 : index % 2 === 0 ? -1.4 : 1.4) / course.metersPerUnit;
  return {
    x: s.a.x + forward.x * along + forward.z * lateral,
    y: sampleRaceSegmentY(s, along * course.metersPerUnit / s.lengthMeters, lateral * course.metersPerUnit),
    z: s.a.z + forward.z * along - forward.x * lateral,
    yaw: Math.atan2(forward.x, forward.z)
  };
}
function createRaceProgress(pose, nowMs) {
  if (!finitePoint(pose) || !Number.isFinite(nowMs)) throw Error("invalid_race_pose");
  return { nextGate: 0, lap: 1, finished: false, invalid: false, penaltyMs: 0, lastPose: { ...pose }, lastAtMs: nowMs, lapStartedAtMs: nowMs, lapTimes: [], bestLapMs: null };
}
function advanceRaceProgress(course, progress, pose, nowMs, { startedAtMs, maximumMetersPerSecond = 85 } = {}) {
  if (progress.finished || progress.invalid) return progress;
  if (!Number.isFinite(startedAtMs) || !(maximumMetersPerSecond > 0 && maximumMetersPerSecond <= 150)) throw Error("invalid_race_clock");
  if (!finitePoint(pose) || !Number.isFinite(nowMs) || !(nowMs > progress.lastAtMs)) throw Error("invalid_race_pose");
  const elapsed = (nowMs - progress.lastAtMs) / 1e3, travel = distance(progress.lastPose, pose) * course.metersPerUnit;
  if (elapsed > 10 || travel > maximumMetersPerSecond * elapsed + 1.5) throw Error("implausible_race_motion");
  const projection = projectRacePosition(course, pose);
  if (!projection || projection.error > projection.widthMeters * 0.5 + 0.5) throw Error("outside_race_course");
  const sweepSteps = Math.ceil(travel / 2);
  if (sweepSteps > 750) throw Error("implausible_race_motion");
  for (let step = 1; step < sweepSteps; step++) {
    const t = step / sweepSteps, from2 = progress.lastPose, sample = projectRacePosition(course, { x: from2.x + (pose.x - from2.x) * t, y: from2.y + (pose.y - from2.y) * t, z: from2.z + (pose.z - from2.z) * t });
    if (!sample || sample.error > sample.widthMeters * 0.5 + 0.5) throw Error("outside_race_course");
  }
  const next = { ...progress, lastPose: { ...pose }, lastAtMs: nowMs, lapTimes: [...progress.lapTimes] };
  if (nowMs < startedAtMs) {
    if (travel > 0.3) throw Error("race_false_start");
    return next;
  }
  const from = progress.lastPose;
  for (let count = 0; count < 8 && !next.finished; count++) {
    const gate = course.gates[next.nextGate], f = gate.forward;
    const a = (from.x - gate.x) * f.x + (from.z - gate.z) * f.z, b = (pose.x - gate.x) * f.x + (pose.z - gate.z) * f.z;
    if (!(a <= 0 && b > 0)) break;
    const t = -a / (b - a), x = from.x + (pose.x - from.x) * t, z = from.z + (pose.z - from.z) * t, y = from.y + (pose.y - from.y) * t;
    if (Math.abs((x - gate.x) * f.z - (z - gate.z) * f.x) * course.metersPerUnit > gate.halfWidthMeters || Math.abs(y - gate.y) * course.metersPerUnit > 2) break;
    const crossedAt = progress.lastAtMs + (nowMs - progress.lastAtMs) * t;
    next.nextGate++;
    if (next.nextGate === course.gates.length) {
      const lapMs = Math.max(1, crossedAt - Math.max(startedAtMs, next.lapStartedAtMs));
      next.lapTimes.push(lapMs);
      next.bestLapMs = Math.min(next.bestLapMs ?? Infinity, lapMs);
      if (next.lap === course.laps) {
        next.finished = true;
        next.finishAtMs = crossedAt;
        next.elapsedMs = crossedAt - startedAtMs + next.penaltyMs;
      } else {
        next.lap++;
        next.nextGate = 0;
        next.lapStartedAtMs = crossedAt;
      }
    }
  }
  return next;
}

// app/js/controls/traversal-control-policy.js?v=9
var PRIMARY_TRAVEL_MODE_ORDER = Object.freeze(["walk", "drive", "plane", "drone"]);
var MAX_STEERING_ANGLE_RAD = 1.22;
function earthDrivingSteeringProfile(speed = 0) {
  const speedAbs = Math.abs(Number(speed) || 0);
  const steerBlend = Math.max(0, Math.min(1, (speedAbs - 5) / 105));
  const yawBlend = Math.max(0, Math.min(1, 1 - speedAbs / 78));
  return Object.freeze({
    maxSteeringAngle: 1.02 + (0.42 - 1.02) * steerBlend,
    maxYawRate: 1.08 + 1.46 * yawBlend
  });
}
function resolveCarDriveCommand(options = {}) {
  const speed = Number(options.speed) || 0;
  const throttle = Math.max(0, Number(options.throttle) || 0);
  const reverse = Math.max(0, Number(options.reverse) || 0);
  const brake = Math.max(0, Number(options.brake) || 0);
  const stopSpeed = Math.max(0.05, Number(options.stopSpeed) || 0.5);
  const requestedDirection = throttle > 0.05 && reverse <= 0.05 ? 1 : reverse > 0.05 && throttle <= 0.05 ? -1 : 0;
  const movingDirection = speed > stopSpeed ? 1 : speed < -stopSpeed ? -1 : 0;
  const changingDirection = requestedDirection !== 0 && movingDirection !== 0 && requestedDirection !== movingDirection;
  return Object.freeze({
    requestedDirection,
    movingDirection,
    changingDirection,
    serviceBrake: changingDirection || Number(options.serviceBrake) > 0.05,
    handbrake: brake > 0.05,
    forward: requestedDirection === 1 && !changingDirection && !(Number(options.serviceBrake) > 0.05) ? throttle : 0,
    reverse: requestedDirection === -1 && !changingDirection && !(Number(options.serviceBrake) > 0.05) ? reverse : 0
  });
}
function arcadeSteeringYawTarget(speed = 0, steeringAngle = 0, wheelBase = 2.6, maxYawRate = Infinity) {
  const requestedSteeringAngle = Number(steeringAngle) || 0;
  const safeSteeringAngle = Math.max(
    -MAX_STEERING_ANGLE_RAD,
    Math.min(MAX_STEERING_ANGLE_RAD, requestedSteeringAngle)
  );
  const target = (Number(speed) || 0) / Math.max(0.1, Number(wheelBase) || 2.6) * Math.tan(safeSteeringAngle);
  const limit = Math.max(0, Number(maxYawRate));
  return Math.max(-limit, Math.min(limit, target));
}

// app/js/physics/vehicle-speed-units.js?v=2
var MPH_PER_SIMULATION_SPEED_UNIT = 0.5;
var METERS_PER_SECOND_PER_MPH = 0.44704;
var MPH_PER_METER_PER_SECOND = 1 / METERS_PER_SECOND_PER_MPH;
var DEFAULT_METERS_PER_WORLD_UNIT = 1.11;
function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
function carSpeedToMph(simulationSpeed = 0) {
  return finiteNumber(simulationSpeed) * MPH_PER_SIMULATION_SPEED_UNIT;
}
function mphToCarSpeed(mph = 0) {
  return finiteNumber(mph) / MPH_PER_SIMULATION_SPEED_UNIT;
}
function mphToWorldUnitsPerSecond(mph = 0, metersPerWorldUnit = DEFAULT_METERS_PER_WORLD_UNIT) {
  const scale = Math.max(1e-3, Math.abs(finiteNumber(metersPerWorldUnit, DEFAULT_METERS_PER_WORLD_UNIT)));
  return finiteNumber(mph) * METERS_PER_SECOND_PER_MPH / scale;
}
function carSpeedToWorldUnitsPerSecond(simulationSpeed = 0, metersPerWorldUnit = DEFAULT_METERS_PER_WORLD_UNIT) {
  return mphToWorldUnitsPerSecond(carSpeedToMph(simulationSpeed), metersPerWorldUnit);
}

// app/js/physics/vehicle-config.js
var ROAD_CAR_CONFIG = Object.freeze({
  // Simulation speed is 2 units per displayed MPH. Keep the road-car envelope
  // in one importable data contract so physics and verification share values.
  maxSpd: 240,
  accel: 32,
  boostAccel: 44,
  brake: 38,
  friction: 25,
  // Boost improves acceleration and recovery, but never exceeds the advertised
  // 120 mph road-car ceiling.
  boostMax: 240,
  boostDur: 2.5,
  brakeForce: 4,
  gripRoad: 0.96,
  gripOff: 0.7,
  gripBrake: 0.48,
  gripDrift: 0.3,
  driftRec: 3.8,
  turnLow: 1.8,
  turnHigh: 0.8,
  turnMin: 30,
  roadForce: 0.93,
  roadPushback: 0.3,
  maxOffDist: 15,
  cpRadius: 25,
  trialTime: 120,
  policeSpd: 140,
  policeAccel: 60,
  policeDist: 800
});
var PLANETARY_ROVER_CONFIG = Object.freeze({ accel: 108, boostAccel: 156, brake: 150 });

// app/js/physics/automatic-powertrain.js
var RATIOS = Object.freeze([4, 2.5, 1.72, 1.24, 0.94]);
var CURVE = Object.freeze([[0.12, 0.55], [0.27, 0.8], [0.5, 1], [0.76, 0.94], [1, 0.58], [1.06, 0]]);
function torqueAt(rpm, redline) {
  const n = rpm / redline;
  for (let i = 1; i < CURVE.length; i++) if (n <= CURVE[i][0]) {
    const a = CURVE[i - 1], b = CURVE[i], t = Math.max(0, (n - a[0]) / (b[0] - a[0]));
    return a[1] + (b[1] - a[1]) * t;
  }
  return 0;
}
function stepAutomaticPowertrain(car, frame, dt, handling) {
  const heavy = handling.massKg > 4500, redline = heavy ? 4600 : 6200, idle = heavy ? 750 : 850, wheelRadius = Math.max(0.25, Number(handling.wheelRadius) || Number(handling.height) * 0.22 || 0.35);
  const speedMps = Math.abs(carSpeedToMph(car.speed)) * 0.44704, wheelRpm = speedMps / wheelRadius * 60 / (Math.PI * 2), finalDrive = heavy ? 4.2 : 3.4;
  const reverse = car.speed < -0.5 || Math.abs(car.speed) <= 0.5 && frame.reverse;
  let gear = Number.isInteger(car.driveGear) && car.driveGear > 0 ? Math.min(RATIOS.length, car.driveGear) : 1;
  car.shiftTime = Math.max(0, (car.shiftTime || 0) - dt);
  if (!reverse && car.shiftTime === 0) {
    const connectedRpm = wheelRpm * RATIOS[gear - 1] * finalDrive;
    if (gear < RATIOS.length && connectedRpm > redline * 0.83) {
      gear++;
      car.shiftTime = 0.16;
    } else if (gear > 1 && connectedRpm < redline * 0.27 && wheelRpm * RATIOS[gear - 2] * finalDrive < redline * 0.76) {
      gear--;
      car.shiftTime = 0.12;
    }
  }
  car.driveGear = reverse ? -1 : gear;
  car.engineRedlineRpm = redline;
  const ratio = reverse ? 3.55 : RATIOS[gear - 1], connected = wheelRpm * ratio * finalDrive;
  const throttle = frame.gas ? frame.driveCommand.forward : frame.reverse ? frame.driveCommand.reverse : 0;
  const target = Math.min(redline * 1.04, Math.max(idle, connected, throttle > 0 && speedMps < 3 ? idle + throttle * 900 : idle));
  car.engineRpm = Number.isFinite(car.engineRpm) ? car.engineRpm + (target - car.engineRpm) * (1 - Math.exp(-dt * 14)) : target;
  car.engineLoad = throttle;
  const massResponse = Math.max(0.35, Math.min(1.25, Math.pow(1540 / Math.max(600, handling.massKg || 1540), 0.45)));
  return torqueAt(car.engineRpm, redline) * (ratio / RATIOS[0]) * massResponse * (car.shiftTime > 0 ? 0.18 : 1);
}

// app/js/physics/vehicle-planar-dynamics.js
function prepareVehicleDriveFrame(car, actions, dt, config = ROAD_CAR_CONFIG) {
  const steerControl = Number(actions.steer) || 0;
  const throttleControl = Math.max(0, Number(actions.throttle) || 0);
  const reverseControl = Math.max(0, Number(actions.reverse) || 0);
  const brakeControl = Math.max(0, Number(actions.brake) || 0);
  const left = steerControl > 0.05, right = steerControl < -0.05;
  const driveCommand = resolveCarDriveCommand({
    speed: car.speed,
    throttle: throttleControl,
    reverse: reverseControl,
    brake: brakeControl,
    serviceBrake: actions.serviceBrake
  });
  const gas = driveCommand.forward > 0.05;
  const reverse = driveCommand.reverse > 0.05;
  const braking = driveCommand.handbrake;
  const boostKey = Number(actions.boost) > 0.05;
  if (car.yawRate === void 0) car.yawRate = 0;
  if (car.vFwd === void 0) car.vFwd = 0;
  if (car.vLat === void 0) car.vLat = 0;
  if (car.rearSlip === void 0) car.rearSlip = 0;
  if (car.steerSm === void 0) car.steerSm = 0;
  if (car.throttleSm === void 0) car.throttleSm = 0;
  if (car.isDrifting === void 0) car.isDrifting = false;
  if (car._driftHoldTimer === void 0) car._driftHoldTimer = 0;
  if (car.vy === void 0) car.vy = 0;
  if (car._lastSurfaceY === void 0) car._lastSurfaceY = null;
  if (car._lastRawSurfaceY === void 0) car._lastRawSurfaceY = null;
  if (car._terrainAirTimer === void 0) car._terrainAirTimer = 0;
  if (car._roadContinuityTimer === void 0) car._roadContinuityTimer = 0;
  if (car._driveDirection === void 0) car._driveDirection = 1;
  if (boostKey && car.boostReady && !car.boost) {
    car.boost = true;
    car.boostTime = config.boostDur;
    car.boostReady = false;
    car.boostDecayTime = 0;
  }
  if (car.boost) {
    car.boostTime -= dt;
    if (car.boostTime <= 0) {
      car.boost = false;
      car.boostTime = 0;
      car.boostDecayTime = 1.5;
    }
  }
  if (!boostKey && !car.boost) car.boostReady = true;
  let boostDecayFactor = 0;
  if (car.boostDecayTime > 0) {
    car.boostDecayTime -= dt;
    boostDecayFactor = Math.max(0, car.boostDecayTime / 1.5);
  }
  return { serviceBrakeControl: actions.serviceBrake, steerControl, throttleControl, reverseControl, brakeControl, left, right, driveCommand, gas, reverse, braking, boostKey, boostDecayFactor };
}
function stepVehiclePlanarDrive(car, dt, frame, environment) {
  const { serviceBrakeControl, steerControl, throttleControl, brakeControl, left, right, driveCommand, gas, reverse, braking, boostDecayFactor } = frame;
  const {
    config = ROAD_CAR_CONFIG,
    planetary = false,
    metersPerWorldUnit = 1.11,
    surfaceDynamics,
    vehicleHandling,
    vehicleCondition,
    vehicleUpgrades,
    characterVehicle,
    planetaryNormalMaxSpd = 18
  } = environment;
  let { maxSpd, friction, accel } = environment;
  maxSpd *= surfaceDynamics.topSpeed;
  friction *= surfaceDynamics.rolling;
  accel *= surfaceDynamics.accel;
  if (!planetary) {
    maxSpd *= vehicleCondition.topSpeedScale;
    accel *= vehicleCondition.accelerationScale;
  }
  accel *= characterVehicle.accelerationScale;
  accel *= vehicleUpgrades.accelerationScale;
  const spd = Math.abs(car.speed);
  const hasGroundControl = !car.isAirborne;
  const canAccelerate = hasGroundControl && (planetary || vehicleCondition.operable);
  const driftBrakeSpeed = mphToCarSpeed(16);
  const earthDriftBrakeIntent = !planetary && braking && (left || right) && spd > driftBrakeSpeed;
  const tyreGrip = Math.max(0.2, Math.min(1.35, Number(config.gripRoad || 0.96) * surfaceDynamics.grip * vehicleHandling.gripScale * vehicleCondition.gripScale * vehicleUpgrades.gripScale));
  const gripAcceleration = tyreGrip * 9.81 / 0.22352;
  const lateralAcceleration = Math.min(gripAcceleration * 0.9, Math.abs((car.yawRate || 0) * carSpeedToMph(car.speed) * 0.44704) / 0.22352);
  const availableLongitudinal = Math.sqrt(Math.max(0, gripAcceleration * gripAcceleration - lateralAcceleration * lateralAcceleration));
  const transmission = planetary ? 1 : stepAutomaticPowertrain(car, frame, dt, vehicleHandling);
  if (driveCommand.serviceBrake && hasGroundControl) {
    const configuredStopRate = Math.max(6, Number(planetary ? PLANETARY_ROVER_CONFIG.brake : config.brake) || 18) * (planetary ? 1 : vehicleHandling.brakeScale * vehicleCondition.brakeScale) * characterVehicle.brakingScale * vehicleUpgrades.brakeScale;
    const stopRate = planetary ? configuredStopRate : Math.min(configuredStopRate, availableLongitudinal);
    const brakeStrength = driveCommand.changingDirection ? 1 : Math.min(1, Math.max(0, Number(serviceBrakeControl) || 0));
    const nextMagnitude = Math.max(0, Math.abs(car.speed) - stopRate * brakeStrength * dt);
    car.speed = Math.sign(car.speed) * nextMagnitude;
    if (nextMagnitude < 0.5) car.speed = 0;
  }
  if (gas && !braking && !driveCommand.serviceBrake && canAccelerate) {
    let throttleAccel = planetary ? accel : Math.min(accel * transmission, availableLongitudinal);
    if (planetary) {
      const lowSpeedBoost = Math.max(0, 1 - spd / 14);
      throttleAccel *= 1 + lowSpeedBoost * 0.75;
    }
    car.speed += throttleAccel * driveCommand.forward * (1 - spd / maxSpd * 0.7) * dt;
  }
  if (braking && spd > 0.5 && hasGroundControl) {
    if (earthDriftBrakeIntent) {
      const driftBrakeRate = 0.72;
      car.speed *= Math.exp(-driftBrakeRate * dt);
    } else {
      car.speed *= 1 - config.brakeForce * brakeControl * dt;
    }
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  }
  if (reverse && !braking && !driveCommand.serviceBrake && canAccelerate) {
    const reverseAccelScale = planetary ? 0.65 : 0.5;
    car.speed -= (planetary ? accel : Math.min(accel * transmission, availableLongitudinal)) * reverseAccelScale * driveCommand.reverse * dt;
  }
  if (!gas && !reverse && !braking && !driveCommand.serviceBrake) {
    car.speed *= 1 - friction * dt * 0.01;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  }
  const reverseLimit = planetary ? maxSpd * 0.3 : Math.min(maxSpd * 0.3, mphToCarSpeed(18));
  car.speed = Math.max(-reverseLimit, Math.min(maxSpd, car.speed));
  if (boostDecayFactor > 0 && !car.boost) {
    const normalMaxSpd = planetary ? planetaryNormalMaxSpd : Math.min(config.maxSpd, mphToCarSpeed(vehicleHandling.topSpeedMph));
    if (Math.abs(car.speed) > normalMaxSpd) {
      const targetSpeed = normalMaxSpd + (Math.abs(car.speed) - normalMaxSpd) * boostDecayFactor;
      const sign = car.speed >= 0 ? 1 : -1;
      car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
    }
  }
  const steerInput = steerControl;
  const throttleInput = gas && !reverse ? throttleControl : 0;
  const steerSmooth = 1 - Math.exp(-dt * 14 * characterVehicle.steeringResponseScale);
  const throttleSmooth = 1 - Math.exp(-dt * 6);
  if (Math.abs(steerInput) > 0.05 && steerInput * car.steerSm < 0) {
    car.steerSm = 0;
    car.yawRate *= 0.28;
    car.rearSlip *= 0.2;
  }
  car.steerSm += (steerInput - car.steerSm) * steerSmooth;
  car.throttleSm += (throttleInput - car.throttleSm) * throttleSmooth;
  const spdAbs = Math.abs(car.speed);
  const driveDirection = car.speed < -0.5 ? -1 : car.speed > 0.5 ? 1 : reverse ? -1 : 1;
  if (driveDirection !== car._driveDirection) {
    car.yawRate = 0;
    car.vLat = 0;
    car.rearSlip = 0;
    car._driveDirection = driveDirection;
  }
  const earthSteering = earthDrivingSteeringProfile(carSpeedToMph(spdAbs));
  const maxSteer = planetary ? 1.02 + (0.28 - 1.02) * Math.max(0, Math.min(1, (spdAbs - 5) / 90)) : earthSteering.maxSteeringAngle * vehicleHandling.steeringScale * vehicleCondition.steeringScale * characterVehicle.steeringAngleScale;
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const steerMag = Math.abs(car.steerSm);
  const speedNorm = planetary ? clamp01((spdAbs - 8) / 70) : clamp01((carSpeedToMph(spdAbs) - 10) / 60);
  const parkingTurnBlend = clamp01(1 - spdAbs / 14);
  const reverseTurnBlend = car.speed < -1 ? clamp01((Math.abs(car.speed) - 1) / 12) : 0;
  const lowSpeedTurnBoost = Math.max(parkingTurnBlend, reverseTurnBlend);
  const handbrakeTurnIntent = !planetary && braking && steerMag >= 0.1 && spdAbs >= 16;
  const handbrakeSteerBoost = handbrakeTurnIntent ? 1 + (0.2 + 0.35 * speedNorm) : 1;
  const steerAngle = car.steerSm * Math.min(
    1.08,
    maxSteer * handbrakeSteerBoost * (1 + lowSpeedTurnBoost * 0.42)
  );
  const driftStartSteer = 0.12;
  const driftHoldSteer = 0.05;
  const driftStartSpeed = mphToCarSpeed(18);
  const driftHoldSpeed = mphToCarSpeed(14);
  const driftStartIntent = !planetary && braking && steerMag >= driftStartSteer && spdAbs >= driftStartSpeed;
  if (planetary) {
    car._driftHoldTimer = 0;
  } else if (driftStartIntent) {
    car._driftHoldTimer = 0.65;
  } else {
    car._driftHoldTimer = Math.max(0, car._driftHoldTimer - dt);
  }
  const driftCanSustain = !planetary && (braking || car._driftHoldTimer > 0) && steerMag >= driftHoldSteer && spdAbs >= driftHoldSpeed;
  const isDrifting = driftStartIntent || !!car.isDrifting && driftCanSustain;
  let gripBase = Number(config.gripRoad || 0.88) * surfaceDynamics.grip * (planetary ? 1 : vehicleHandling.gripScale * vehicleCondition.gripScale * vehicleUpgrades.gripScale);
  if (planetary) gripBase = 1;
  let driftGrip = gripBase;
  if (isDrifting) {
    const brakeGrip = Number(config.gripBrake || 0.6);
    const driftGripFloor = Number(config.gripDrift || 0.36);
    const blend = (0.72 + 0.28 * speedNorm) * surfaceDynamics.drift;
    driftGrip = Math.max(driftGripFloor, gripBase * (1 - blend) + brakeGrip * blend);
  }
  const grip = Math.max(0.2, Math.min(1.2, driftGrip));
  let latDamp, yawDamp, yawResponse;
  if (planetary) {
    latDamp = 11 * (0.75 + grip * 0.55);
    yawDamp = 8.8 * (0.7 + grip * 0.6);
    yawResponse = 2.4 * (0.65 + grip * 0.45);
  } else {
    latDamp = 15.5 * (0.72 + grip * 0.58);
    yawDamp = 9.2 * (0.7 + grip * 0.6);
    yawResponse = 4.4 * (0.64 + grip * 0.42);
    if (lowSpeedTurnBoost > 0) {
      yawResponse += lowSpeedTurnBoost * 1.35;
      yawDamp *= 1 - lowSpeedTurnBoost * 0.12;
    }
    if (isDrifting) {
      latDamp *= 0.28;
      yawDamp *= 0.58;
      yawResponse *= 1.78;
    } else {
      const driftRecovery = Math.max(0, Number(config.driftRec || 6));
      latDamp += driftRecovery * 0.55;
      yawDamp += driftRecovery * 0.32;
    }
  }
  if (!isDrifting) {
    latDamp *= characterVehicle.recoveryScale * vehicleUpgrades.recoveryScale;
    yawResponse *= characterVehicle.steeringResponseScale;
  }
  const wheelBase = planetary ? 2.6 : vehicleHandling.wheelBase;
  const v = planetary ? car.speed : carSpeedToWorldUnitsPerSecond(car.speed, metersPerWorldUnit);
  let steerAuthority = 1.08;
  if (!planetary && lowSpeedTurnBoost > 0) {
    steerAuthority *= 1 + lowSpeedTurnBoost * 0.48;
  }
  if (!planetary && (isDrifting || handbrakeTurnIntent)) {
    steerAuthority *= 1.22;
  }
  const radiusAuthority = Math.max(0.76, Math.min(1.22, 5.2 / vehicleHandling.turningRadius));
  const tyreYawLimit = tyreGrip * 9.81 / Math.max(2, Math.abs(carSpeedToMph(car.speed)) * 0.44704) * (isDrifting ? 1.35 : 1);
  const maxYawRate = planetary ? Infinity : Math.min(tyreYawLimit, earthSteering.maxYawRate * vehicleHandling.steeringScale * radiusAuthority * characterVehicle.steeringAngleScale);
  const yawRateTarget = arcadeSteeringYawTarget(
    v,
    steerAngle * steerAuthority,
    wheelBase,
    maxYawRate
  );
  car.yawRate += (yawRateTarget - car.yawRate) * (1 - Math.exp(-dt * yawResponse));
  if (planetary) {
    car.yawRate *= Math.exp(-dt * yawDamp);
  } else if (steerMag < 0.04) {
    car.yawRate *= Math.exp(-dt * yawDamp);
  } else if (!isDrifting) {
    car.yawRate *= Math.exp(-dt * yawDamp * 0.08);
  }
  if (hasGroundControl) {
    car.angle += car.yawRate * dt;
  } else {
    car.yawRate *= Math.exp(-dt * 2);
    car.angle += car.yawRate * dt;
  }
  car.vFwd += (car.speed - car.vFwd) * (1 - Math.exp(-dt * 8));
  car.vLat *= Math.exp(-dt * latDamp);
  const halfWheelBase = wheelBase * 0.5;
  let frontLat = car.vLat + car.yawRate * halfWheelBase;
  let rearLat = car.vLat - car.yawRate * halfWheelBase;
  let frontGripDamp = 22 * (0.7 + grip * 0.55);
  let rearGripDamp = 18 * (0.72 + grip * 0.52);
  if (!planetary) {
    if (isDrifting) {
      frontGripDamp *= 0.9;
      rearGripDamp *= 0.12;
      rearLat += car.steerSm * 2.35 * (0.5 + 0.5 * speedNorm);
    }
  }
  frontLat *= Math.exp(-dt * frontGripDamp);
  rearLat *= Math.exp(-dt * rearGripDamp);
  car.vLat = (frontLat + rearLat) * 0.5;
  let slipGain = 5e-3 * steerMag * speedNorm;
  if (!planetary) {
    if (isDrifting) {
      const driftSlip = 0.064;
      slipGain = driftSlip * steerMag * (0.45 + 0.55 * speedNorm);
    } else {
      slipGain = 12e-4 * steerMag * speedNorm;
    }
  }
  car.vLat += car.yawRate * spdAbs * slipGain;
  if (!planetary && isDrifting) {
    const rearStep = rearLat - frontLat;
    const rearSlipGain = 1.38;
    const steerSlipGain = 1.05;
    car.rearSlip += rearStep * dt * rearSlipGain;
    car.rearSlip += car.steerSm * dt * steerSlipGain;
    const rearSlipLimit = 1.75;
    car.rearSlip = Math.max(-rearSlipLimit, Math.min(rearSlipLimit, car.rearSlip));
    car.rearSlip *= Math.exp(-dt * 3.1);
    car.yawRate += car.rearSlip * (0.86 + 0.34 * speedNorm);
    car.vLat *= Math.exp(-dt * 4.3);
  } else {
    car.rearSlip *= Math.exp(-dt * 9.5);
  }
  if (isDrifting) {
    const yawKick = car.steerSm * 1.28 * (0.35 + 0.65 * speedNorm);
    car.yawRate += yawKick * dt * 4.6;
  }
  if (!planetary) car.yawRate = Math.max(-tyreYawLimit, Math.min(tyreYawLimit, car.yawRate));
  car.isDrifting = isDrifting;
  return { wheelBase, steerAngle, isDrifting, spdAbs };
}
function integrateVehiclePlanarPosition(car, dt, { wheelBase, isDrifting, spdAbs }, metersPerWorldUnit = 1.11, planetary = false) {
  const sinA = Math.sin(car.angle), cosA = Math.cos(car.angle);
  const lateralVelForPosition = !planetary && isDrifting ? car.vLat * 0.34 : car.vLat;
  const worldForwardVelocity = planetary ? car.vFwd : carSpeedToWorldUnitsPerSecond(car.vFwd, metersPerWorldUnit);
  const worldLateralVelocity = planetary ? lateralVelForPosition : carSpeedToWorldUnitsPerSecond(lateralVelForPosition, metersPerWorldUnit);
  car.vx = sinA * worldForwardVelocity + cosA * worldLateralVelocity;
  car.vz = cosA * worldForwardVelocity - sinA * worldLateralVelocity;
  const velMag = Math.hypot(car.vx, car.vz);
  if (velMag > 5) {
    const velAngle = Math.atan2(car.vx, car.vz);
    let da = car.angle - velAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    car.driftAngle = da;
  } else {
    car.driftAngle = 0;
  }
  let nx;
  let nz;
  if (!planetary && isDrifting && spdAbs > 6) {
    const frontPivotDist = wheelBase * 0.42;
    const frontX = car.x + sinA * frontPivotDist;
    const frontZ = car.z + cosA * frontPivotDist;
    const frontVx = sinA * worldForwardVelocity + cosA * (worldLateralVelocity * 0.35);
    const frontVz = cosA * worldForwardVelocity - sinA * (worldLateralVelocity * 0.35);
    const nextFrontX = frontX + frontVx * dt;
    const nextFrontZ = frontZ + frontVz * dt;
    nx = nextFrontX - Math.sin(car.angle) * frontPivotDist;
    nz = nextFrontZ - Math.cos(car.angle) * frontPivotDist;
  } else {
    nx = car.x + car.vx * dt;
    nz = car.z + car.vz * dt;
  }
  return { x: nx, z: nz };
}

// app/js/physics/vehicle-speed-units.js
var MPH_PER_SIMULATION_SPEED_UNIT2 = 0.5;
var METERS_PER_SECOND_PER_MPH2 = 0.44704;
var MPH_PER_METER_PER_SECOND2 = 1 / METERS_PER_SECOND_PER_MPH2;
function finiteNumber2(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
function carSpeedToMph2(simulationSpeed = 0) {
  return finiteNumber2(simulationSpeed) * MPH_PER_SIMULATION_SPEED_UNIT2;
}
function mphToCarSpeed2(mph = 0) {
  return finiteNumber2(mph) / MPH_PER_SIMULATION_SPEED_UNIT2;
}

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

// app/js/engine/vehicle-catalog.js?v=6
var VEHICLE_ROOT_TO_GROUND_METERS = 1.12;
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
  { id: "datsun_280z", assetId: "road-datsun-280z", bodyStyle: "sedan", handlingLabel: "Sport coupe", massKg: 1300, seatCount: 2, weight: 20, color: 15056201, topSpeedMph: 120, accelerationScale: 1.16, steeringScale: 1.1, gripScale: 1.07, brakeScale: 1.09, turningRadius: 5.1 }
].map((profile) => {
  const asset = EXPLORER_FLEET_ASSETS.find((entry) => entry.id === profile.assetId);
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
    parkedEligible: true,
    rights: { kind: "licensed-model", brand: asset.label, attribution: asset.attribution }
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
function vehicleDefinitionById(id, fallbackId = "sedan") {
  return VEHICLE_BY_ID[String(id || "")] || VEHICLE_BY_ID[fallbackId] || VEHICLE_CATALOG[0];
}
function vehicleHandlingProfile(variantOrId = "sedan", options = {}) {
  const variant = typeof variantOrId === "string" ? vehicleDefinitionById(variantOrId) : variantOrId || vehicleDefinitionById("sedan");
  const responder = String(options.serviceType || "") === "responder";
  return Object.freeze({
    id: responder ? `response-${variant.id}` : variant.id,
    label: responder ? "Response-tuned" : String(variant.handlingLabel || "Balanced"),
    assetId: String(variant.assetId || ""),
    width: Number(variant.width || 1.8),
    height: Number(variant.height || 1.5),
    length: Number(variant.length || 4.45),
    wheelRadius: Number(variant.wheelRadius) || 0.35,
    halfTrack: Number(variant.halfTrack || Number(variant.width || 1.8) * 0.43),
    topSpeedMph: responder ? 120 : Math.max(40, Math.min(120, Number(variant.topSpeedMph) || 120)),
    accelerationScale: Math.max(0.35, Number(variant.accelerationScale) || 1) * (responder ? 1.18 : 1),
    steeringScale: Math.max(0.35, Number(variant.steeringScale) || 1) * (responder ? 1.1 : 1),
    gripScale: Math.max(0.55, Number(variant.gripScale) || 1) * (responder ? 1.06 : 1),
    brakeScale: Math.max(0.45, Number(variant.brakeScale) || 1) * (responder ? 1.08 : 1),
    massKg: vehicleMassKg(variant) + (responder ? 140 : 0),
    wheelBase: Math.max(1.9, Math.min(4.8, Number(variant.wheelBase || Number(variant.length || 4.45) * 0.58))),
    turningRadius: Math.max(3.8, Number(variant.turningRadius) || 5.2)
  });
}
function vehicleMassKg(variantOrId = "sedan") {
  const variant = typeof variantOrId === "string" ? vehicleDefinitionById(variantOrId) : variantOrId || vehicleDefinitionById("sedan");
  if (Number.isFinite(Number(variant.massKg)) && Number(variant.massKg) > 0) return Number(variant.massKg);
  const style = String(variant.bodyStyle || variant.id || "sedan");
  const masses = {
    compact: 1240,
    sedan: 1520,
    suv: 1980,
    pickup: 2240,
    van: 2350,
    taxi: 1640,
    "box-truck": 5200,
    bus: 11800
  };
  return masses[style] || (style.includes("van") ? 2480 : 1520);
}
function vehicleConditionDynamics(condition = 1) {
  const normalized = Math.max(0, Math.min(1, Number(condition) || 0));
  return Object.freeze({
    operable: normalized > 0.05,
    topSpeedScale: 0.5 + normalized * 0.5,
    accelerationScale: 0.3 + normalized * 0.7,
    steeringScale: 0.72 + normalized * 0.28,
    gripScale: 0.78 + normalized * 0.22,
    brakeScale: 0.65 + normalized * 0.35
  });
}
function vehicleWheelContactLayout(variant = {}) {
  const width = Math.max(0.8, Number(variant.width) || 1.8);
  const length = Math.max(1.8, Number(variant.length) || 4.4);
  const style = String(variant.bodyStyle || variant.id || "sedan");
  if (variant.wheelBase && variant.halfTrack) return Object.freeze({ halfTrack: variant.halfTrack, halfWheelbase: variant.wheelBase * 0.5, wheelRadius: variant.wheelRadius });
  const axleFactor = style === "bus" ? 0.37 : style === "box-truck" ? 0.35 : style === "compact" ? 0.3 : 0.32;
  return Object.freeze({
    halfTrack: width * 0.43,
    halfWheelbase: length * axleFactor,
    wheelRadius: Math.max(0.2, Number(variant.wheelRadius) || 0.36)
  });
}

// app/js/engine/vehicle-road-attitude.js?v=3
var WHEEL_CONTACTS = Object.freeze([
  Object.freeze({ front: -1, side: -1 }),
  Object.freeze({ front: -1, side: 1 }),
  Object.freeze({ front: 1, side: -1 }),
  Object.freeze({ front: 1, side: 1 })
]);
function finiteNumber3(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function resolveVehicleRoadContactPose(options = {}) {
  const x = finiteNumber3(options.x);
  const y = finiteNumber3(options.y);
  const z = finiteNumber3(options.z);
  const yaw = finiteNumber3(options.yaw);
  const fallbackPitch = finiteNumber3(options.pitch);
  const fallbackRoll = finiteNumber3(options.roll);
  const sampleSurface = typeof options.sampleSurface === "function" ? options.sampleSurface : null;
  const layout = vehicleWheelContactLayout(options.variant);
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const heights = [0, 0, 0, 0];
  const footprint = (pitch2, roll2) => {
    let valid = true;
    for (let index = 0; index < 4; index += 1) {
      const contact = WHEEL_CONTACTS[index];
      const { front, side } = contact;
      const localX = side * layout.halfTrack;
      const localZ = front * layout.halfWheelbase;
      const lateral = Math.cos(roll2) * localX;
      const longitudinal = Math.sin(pitch2) * Math.sin(roll2) * localX + Math.cos(pitch2) * localZ;
      const contactX = x + rightX * lateral + forwardX * longitudinal;
      const contactZ = z + rightZ * lateral + forwardZ * longitudinal;
      const sample = sampleSurface?.(contactX, contactZ, contact);
      heights[index] = sample == null ? NaN : Number(sample);
      if (!Number.isFinite(heights[index])) valid = false;
    }
    return valid;
  };
  const fallback = () => Object.freeze({
    x,
    y,
    z,
    yaw,
    pitch: fallbackPitch,
    roll: fallbackRoll,
    sampledWheelContacts: 0,
    maximumWheelPenetration: 0,
    maximumWheelGap: 0,
    previousMaximumWheelPenetration: 0,
    authority: "edge-plane-fallback"
  });
  const poseDelta = (pitch2, roll2, contact) => Math.cos(pitch2) * Math.sin(roll2) * contact.side * layout.halfTrack - Math.sin(pitch2) * contact.front * layout.halfWheelbase;
  let pitch = clamp(fallbackPitch, -0.55, 0.55);
  let roll = clamp(fallbackRoll, -0.55, 0.55);
  if (!footprint(pitch, roll) || !sampleSurface) return fallback();
  let previousMaximumWheelPenetration = 0;
  for (let index = 0; index < 4; index += 1) {
    previousMaximumWheelPenetration = Math.max(
      previousMaximumWheelPenetration,
      heights[index] - (y + poseDelta(fallbackPitch, fallbackRoll, WHEEL_CONTACTS[index]))
    );
  }
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const rearHeight = (heights[0] + heights[1]) * 0.5;
    const frontHeight = (heights[2] + heights[3]) * 0.5;
    const leftHeight = (heights[0] + heights[2]) * 0.5;
    const rightHeight = (heights[1] + heights[3]) * 0.5;
    const forwardSlope = (frontHeight - rearHeight) / (2 * layout.halfWheelbase * Math.cos(pitch));
    const rightSlope = ((rightHeight - leftHeight) / (2 * layout.halfTrack) - forwardSlope * Math.sin(pitch) * Math.sin(roll)) / Math.cos(roll);
    const nextPitch = clamp(-Math.atan(forwardSlope), -0.55, 0.55);
    const nextRoll = clamp(Math.atan(rightSlope * Math.cos(nextPitch)), -0.55, 0.55);
    if (Math.abs(nextPitch - pitch) + Math.abs(nextRoll - roll) < 1e-7) break;
    pitch = nextPitch;
    roll = nextRoll;
    if (!footprint(pitch, roll)) return fallback();
  }
  let resolvedY = -Infinity;
  for (let index = 0; index < 4; index += 1) {
    resolvedY = Math.max(resolvedY, heights[index] - poseDelta(pitch, roll, WHEEL_CONTACTS[index]));
  }
  let maximumWheelPenetration = 0, maximumWheelGap = 0;
  for (let index = 0; index < 4; index += 1) {
    const gap = resolvedY + poseDelta(pitch, roll, WHEEL_CONTACTS[index]) - heights[index];
    maximumWheelPenetration = Math.max(maximumWheelPenetration, -gap);
    maximumWheelGap = Math.max(maximumWheelGap, gap);
  }
  const contactAnomaly = maximumWheelGap > 0.22 ? WHEEL_CONTACTS.map((contact, index) => {
    const localX = contact.side * layout.halfTrack;
    const localZ = contact.front * layout.halfWheelbase;
    const lateral = Math.cos(roll) * localX;
    const longitudinal = Math.sin(pitch) * Math.sin(roll) * localX + Math.cos(pitch) * localZ;
    return {
      ...contact,
      x: x + rightX * lateral + forwardX * longitudinal,
      z: z + rightZ * lateral + forwardZ * longitudinal,
      y: heights[index],
      gap: resolvedY + poseDelta(pitch, roll, contact) - heights[index]
    };
  }) : null;
  return Object.freeze({
    x,
    y: resolvedY,
    z,
    yaw,
    pitch,
    roll,
    sampledWheelContacts: 4,
    maximumWheelPenetration,
    maximumWheelGap,
    previousMaximumWheelPenetration,
    contactAnomaly,
    authority: "published-road-four-wheel-contact"
  });
}

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
  datsun_280z: 34e3
};
var PERSONAL_VEHICLES = Object.freeze([
  Object.freeze({ id: "bmw_e34", label: "BMW 525i E34", variantId: "sedan", assetId: "vehicle-bmw-525i-e34", price: 0, category: "Personal sedan", defaultVisual: true }),
  ...VEHICLE_CATALOG.map((v) => Object.freeze({
    id: v.id,
    label: v.label,
    variantId: v.id,
    assetId: v.assetId || "",
    price: prices[v.id],
    category: v.bodyStyle,
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

// app/js/transport/vehicle-upgrades.js?v=1
var VEHICLE_UPGRADE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "engine-tune", label: "Engine tune", maximumLevel: 3, prices: [4e3, 9e3, 18e3], description: "Sharper throttle response and stronger acceleration.", effect: "Acceleration +8% per level" }),
  Object.freeze({ id: "street-brakes", label: "Performance brakes", maximumLevel: 3, prices: [2500, 5200, 9500], description: "Shorter, more controlled braking from road speeds.", effect: "Braking +10% per level" }),
  Object.freeze({ id: "all-road-tires", label: "All-road tire set", maximumLevel: 3, prices: [1200, 2400, 4500], description: "More dependable grip during turns and on rough approaches.", effect: "Grip +7% per level" }),
  Object.freeze({ id: "reinforced-suspension", label: "Reinforced suspension", maximumLevel: 3, prices: [3e3, 6500, 12e3], description: "More stable steering recovery and less damage from hard landings.", effect: "Recovery +6% and landing protection +12% per level" })
]);
var UPGRADE_BY_ID = new Map(VEHICLE_UPGRADE_DEFINITIONS.map((definition) => [definition.id, definition]));
function serviceIdForUpgrade(upgradeId, level) {
  return `vehicle-upgrade:${upgradeId}:${Math.max(1, Math.floor(Number(level) || 1))}`;
}
var VEHICLE_UPGRADE_SERVICES = Object.freeze(VEHICLE_UPGRADE_DEFINITIONS.flatMap((definition) => definition.prices.map((price, index) => Object.freeze({
  id: serviceIdForUpgrade(definition.id, index + 1),
  capability: "service.vehicleUpgrade",
  label: `${definition.label} \xB7 level ${index + 1}`,
  price,
  description: `${definition.description} ${definition.effect}.`,
  upgradeId: definition.id,
  upgradeLevel: index + 1
}))));
function vehicleUpgradeDynamics(levels = {}) {
  const engine = Math.max(0, Number(levels["engine-tune"]) || 0);
  const brakes = Math.max(0, Number(levels["street-brakes"]) || 0);
  const tires = Math.max(0, Number(levels["all-road-tires"]) || 0);
  const suspension = Math.max(0, Number(levels["reinforced-suspension"]) || 0);
  return Object.freeze({
    accelerationScale: 1 + engine * 0.08,
    brakeScale: 1 + brakes * 0.1,
    gripScale: 1 + tires * 0.07,
    recoveryScale: 1 + suspension * 0.06,
    suspensionResistance: Math.min(0.36, suspension * 0.12)
  });
}

// app/js/racing/vehicle-controller.js
function createRaceVehicleProfile(vehicleId, { condition = 1, levels = {}, grip = 1 } = {}) {
  const definition = personalVehicleById(vehicleId);
  if (!definition) throw Error("race_vehicle_unknown");
  if (!Number.isFinite(condition) || condition < 0.3 || condition > 1) throw Error("race_vehicle_needs_repair");
  const handling = vehicleHandlingProfile(definition.variantId);
  return Object.freeze({
    vehicleId,
    variant: VEHICLE_CATALOG.find((v) => v.id === definition.variantId),
    conditionValue: condition,
    handling,
    condition: vehicleConditionDynamics(condition),
    upgrades: vehicleUpgradeDynamics(levels),
    config: ROAD_CAR_CONFIG,
    character: Object.freeze({ accelerationScale: 1, brakingScale: 1, steeringResponseScale: 1, steeringAngleScale: 1, recoveryScale: 1 }),
    surface: Object.freeze({ topSpeed: 1, rolling: 1, accel: 1, grip: Math.max(0.55, Math.min(1, Number(grip) || 1)), drift: 1 })
  });
}
function createRaceVehicleState(pose, profile) {
  return {
    x: pose.x,
    y: pose.y + VEHICLE_ROOT_TO_GROUND_METERS,
    z: pose.z,
    angle: pose.yaw,
    speed: 0,
    vFwd: 0,
    vLat: 0,
    yawRate: 0,
    condition: profile.conditionValue,
    boostReady: false,
    vehicleVariantId: personalVehicleById(profile.vehicleId).variantId,
    isAirborne: false,
    barrierContacts: 0
  };
}
function stepRaceVehicle(course, car, actions, dt, profile) {
  if (!(dt > 0 && dt <= 1 / 30)) throw Error("invalid_race_physics_step");
  const frame = prepareVehicleDriveFrame(car, { ...actions, boost: 0 }, dt, profile.config);
  const driving = stepVehiclePlanarDrive(car, dt, frame, {
    config: profile.config,
    planetary: false,
    metersPerWorldUnit: course.metersPerUnit,
    surfaceDynamics: profile.surface,
    vehicleHandling: profile.handling,
    vehicleCondition: profile.condition,
    vehicleUpgrades: profile.upgrades,
    characterVehicle: profile.character,
    maxSpd: Math.min(profile.config.maxSpd, mphToCarSpeed2(profile.handling.topSpeedMph)),
    friction: profile.config.friction,
    accel: profile.config.accel * profile.handling.accelerationScale
  });
  car.steerAngle = driving.steerAngle;
  const next = integrateVehiclePlanarPosition(car, dt, driving, course.metersPerUnit, false);
  const support = projectRacePosition(course, { ...next, y: car.y - VEHICLE_ROOT_TO_GROUND_METERS });
  if (!support) throw Error("race_surface_lost");
  const margin = Math.max(0.3, (support.widthMeters - profile.handling.width) * 0.5 - 0.2);
  let x = next.x, z = next.z;
  if (support.error > margin) {
    const distance2 = Math.hypot(x - support.x, z - support.z), scale = margin / Math.max(1e-3, distance2 * course.metersPerUnit);
    x = support.x + (x - support.x) * scale;
    z = support.z + (z - support.z) * scale;
    car.speed *= 0.35;
    car.vFwd *= 0.35;
    car.vLat *= 0.2;
    car.barrierContacts++;
  }
  const segment = course.segments[support.index];
  const contact = resolveVehicleRoadContactPose({
    x,
    z,
    y: support.y,
    yaw: car.angle,
    variant: profile.variant,
    pitch: car.terrainPitch || 0,
    roll: car.terrainRoll || 0,
    sampleSurface: (px, pz) => projectRacePosition(course, { x: px, z: pz, y: support.y }, { minimumMeters: Math.max(0, segment.startMeters - 12), maximumMeters: Math.min(course.lengthMeters, segment.startMeters + segment.lengthMeters + 12) })?.y
  });
  car.x = x;
  car.z = z;
  car.y = contact.y + VEHICLE_ROOT_TO_GROUND_METERS;
  car.terrainPitch = contact.pitch;
  car.terrainRoll = contact.roll;
  car.maximumWheelPenetration = contact.maximumWheelPenetration;
  car.maximumWheelGap = contact.maximumWheelGap;
  return driving;
}
function raceVehicleSpeedMetersPerSecond(car) {
  return carSpeedToMph2(car.speed) * 0.44704;
}
function raceVehicleGroundPose(car) {
  return { x: car.x, y: car.y - VEHICLE_ROOT_TO_GROUND_METERS, z: car.z, yaw: car.angle };
}
var RACE_VEHICLE_NUMERIC_FIELDS = Object.freeze([
  "x",
  "y",
  "z",
  "angle",
  "speed",
  "vFwd",
  "vLat",
  "vx",
  "vz",
  "yawRate",
  "steerAngle",
  "steerSm",
  "rearSlip",
  "throttleSm",
  "terrainPitch",
  "terrainRoll",
  "engineRpm",
  "engineRedlineRpm",
  "engineLoad",
  "driveGear",
  "shiftTime",
  "condition",
  "maximumWheelPenetration",
  "maximumWheelGap",
  "_driveDirection",
  "_driftHoldTimer",
  "driftAngle"
]);
function snapshotRaceVehicle(car) {
  if (!car) return null;
  const frame = {};
  for (const key of RACE_VEHICLE_NUMERIC_FIELDS) frame[key] = Number(car[key] ?? (key === "_driveDirection" ? 1 : 0));
  frame.isDrifting = car.isDrifting === true;
  return frame;
}

// app/js/racing/ai-controller.js
var clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
var wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
function pointOnRaceCourse(course, distanceMeters) {
  const distance2 = course.discipline === "circuit" ? (distanceMeters % course.lengthMeters + course.lengthMeters) % course.lengthMeters : clamp2(distanceMeters, 0, course.lengthMeters);
  const segment = course.segments.find((s) => s.startMeters + s.lengthMeters >= distance2) || course.segments.at(-1), t = clamp2((distance2 - segment.startMeters) / segment.lengthMeters, 0, 1);
  return { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: sampleRaceSegmentY(segment, t), z: segment.a.z + (segment.b.z - segment.a.z) * t, segment };
}
function raceAiActions(course, car, progress, profile, { difficulty = 0.65 } = {}) {
  if (progress.finished) return { steer: 0, throttle: 0, serviceBrake: 1 };
  const goal = course.gates[progress.nextGate], pose = raceVehicleGroundPose(car), speed = Math.abs(raceVehicleSpeedMetersPerSecond(car));
  const projection = projectRacePosition(course, pose, { minimumMeters: Math.max(0, (course.gates[progress.nextGate - 1]?.distanceMeters || 0) - 8), maximumMeters: Math.min(course.lengthMeters, goal.distanceMeters + 15) });
  if (!projection) return { steer: 0, throttle: 0, serviceBrake: 1 };
  const look = clamp2(3.5 + speed * 0.6, 4, 15), target = pointOnRaceCourse(course, projection.distanceMeters + look);
  const dx = (target.x - car.x) * course.metersPerUnit, dz = (target.z - car.z) * course.metersPerUnit, heading = Math.atan2(dx, dz), error = wrap(heading - car.angle);
  const steering = earthDrivingSteeringProfile(carSpeedToMph(Math.abs(car.speed)));
  const desiredAngle = Math.atan2(2 * profile.handling.wheelBase * Math.sin(error), Math.max(2, Math.hypot(dx, dz)));
  const maxAngle = steering.maxSteeringAngle * profile.handling.steeringScale * profile.condition.steeringScale;
  const steer = clamp2(desiredAngle / Math.max(0.1, maxAngle) * 1.35, -1, 1);
  let targetSpeed = Math.min(profile.handling.topSpeedMph * 0.44704 * (0.32 + 0.25 * clamp2(difficulty, 0, 1)), 23);
  const gripAcceleration = profile.config.gripRoad * profile.surface.grip * profile.handling.gripScale * profile.condition.gripScale * profile.upgrades.gripScale * 9.81;
  const planningDeceleration = Math.max(1.2, Math.min(4, gripAcceleration * 0.45, profile.config.brake * 0.22352 * profile.handling.brakeScale * 0.65));
  const horizon = Math.min(180, Math.max(70, speed * speed / (2 * planningDeceleration) + look + 15));
  for (let index = 0; index < course.segments.length; index++) {
    const segment = course.segments[index];
    let ahead = segment.startMeters - projection.distanceMeters;
    if (ahead < 0 && course.discipline === "circuit") ahead += course.lengthMeters;
    if (ahead < 0 || ahead > horizon) continue;
    const previous = course.segments[(index + course.segments.length - 1) % course.segments.length];
    if (!index && course.discipline !== "circuit") continue;
    const bend = Math.acos(clamp2(previous.forward.x * segment.forward.x + previous.forward.z * segment.forward.z, -1, 1));
    if (bend < 0.12) continue;
    const corner = Math.max(2.8, Math.min(15, 4.5 / bend)) * Math.sqrt(profile.surface.grip), brakeDistance = Math.max(0, ahead - look * 0.35);
    targetSpeed = Math.min(targetSpeed, Math.sqrt(corner * corner + 2 * planningDeceleration * brakeDistance));
  }
  targetSpeed *= clamp2(1 - Math.abs(error) * 0.32, 0.25, 1);
  const difference = targetSpeed - speed;
  return { steer, throttle: difference > 0.2 ? clamp2(difference * 0.6, 0.12, 1) : 0, reverse: 0, brake: 0, serviceBrake: difference < -0.35 ? clamp2(-difference * 0.3, 0, 1) : 0 };
}

// app/js/racing/session-rules.js
var STEP_MS = 1e3 / 60;
var NEUTRAL = Object.freeze({ steer: 0, throttle: 0, reverse: 0, brake: 0, serviceBrake: 1 });
var ACTIONS = /* @__PURE__ */ new Set(["steer", "throttle", "reverse", "brake", "serviceBrake"]);
function normalizeRaceActions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !ACTIONS.has(key))) throw Error("invalid_race_controls");
  const result = {};
  for (const key of ACTIONS) {
    const n = value[key] ?? 0;
    if (typeof n !== "number" || !Number.isFinite(n) || n < (key === "steer" ? -1 : 0) || n > 1) throw Error("invalid_race_controls");
    result[key] = n;
  }
  return result;
}
function createRaceSession({ id, course, creatorUid, createdAtMs, maximumDurationMs = 6e5, onComplete = () => {
} }) {
  if (!id || !course || !creatorUid || !Number.isFinite(createdAtMs)) throw Error("invalid_race_session");
  course = structuredClone(course);
  const players = /* @__PURE__ */ new Map();
  let phase = "lobby", leaderUid = creatorUid, startAtMs = null, tick = 0, lastNow = createdAtMs, completedAtMs = null, reason = "", outcomeEmitted = false;
  const activeHumans = () => [...players.values()].filter((p) => !p.ai && !p.left);
  function participant(uid) {
    const p = players.get(uid);
    if (!p) throw Error("race_not_joined");
    return p;
  }
  function lobby() {
    if (phase !== "lobby") throw Error("race_roster_locked");
  }
  function add({ uid, label, profile, ai = false, difficulty = 0.65 }) {
    lobby();
    if (!uid || players.has(uid) || players.size >= course.participants || !ai && String(uid).startsWith("rival:")) throw Error("race_roster_unavailable");
    const envelope = course.vehicleEnvelope || { widthMeters: 2.35, lengthMeters: 6.5, heightMeters: 2.4 }, handling = profile?.handling;
    if (!handling || handling.width > envelope.widthMeters || handling.length > envelope.lengthMeters || handling.height > envelope.heightMeters) throw Error("race_vehicle_exceeds_course_envelope");
    const p = {
      uid,
      label: String(label || "Explorer").slice(0, 40),
      profile,
      ai: ai === true,
      difficulty: Math.max(0, Math.min(1, Number(difficulty) || 0.65)),
      ready: ai === true,
      slot: players.size,
      car: null,
      progress: null,
      lastSequence: -1,
      queue: [],
      actions: NEUTRAL,
      lastControlAt: -Infinity,
      disconnectedAt: null,
      left: false,
      dnf: false
    };
    players.set(uid, p);
    for (const other of players.values()) if (!other.ai) other.ready = false;
    return snapshot();
  }
  function setReady(uid, ready) {
    lobby();
    const p = participant(uid);
    if (p.ai) throw Error("race_rival_control_forbidden");
    p.ready = ready === true;
    return snapshot();
  }
  function start(uid, nowMs) {
    lobby();
    if (uid !== leaderUid) throw Error("race_leader_required");
    if (players.size < 1 || !activeHumans().length || [...players.values()].some((p) => !p.ready || p.disconnectedAt !== null)) throw Error("race_not_ready");
    if (!Number.isFinite(nowMs) || nowMs < lastNow) throw Error("invalid_race_clock");
    startAtMs = nowMs + 4e3;
    lastNow = nowMs;
    phase = "countdown";
    for (const p of players.values()) {
      p.car = createRaceVehicleState(raceGridPose(course, p.slot), p.profile);
      stepRaceVehicle(course, p.car, NEUTRAL, 1 / 60, p.profile);
      p.progress = createRaceProgress(raceVehicleGroundPose(p.car), startAtMs);
    }
    return snapshot();
  }
  function control(uid, sequence, actions, receivedAtMs) {
    if (!["countdown", "running"].includes(phase)) throw Error("race_not_running");
    const p = participant(uid);
    if (p.ai || p.left || p.dnf || p.progress?.finished) throw Error("race_controls_unavailable");
    if (!Number.isSafeInteger(sequence) || sequence <= p.lastSequence || !Number.isFinite(receivedAtMs) || receivedAtMs < lastNow - 1e3) throw Error("obsolete_race_controls");
    const normalized = normalizeRaceActions(actions);
    if (phase === "countdown" && receivedAtMs < startAtMs) p.queue = [];
    if (p.queue.length >= 32) throw Error("race_controls_rate_limited");
    p.lastSequence = sequence;
    p.queue.push({ actions: normalized, at: receivedAtMs });
    return true;
  }
  function disconnect(uid, nowMs) {
    const p = participant(uid);
    if (p.ai) return;
    p.disconnectedAt = nowMs;
    if (phase === "lobby") p.ready = false;
    p.queue = [];
    p.actions = NEUTRAL;
  }
  function reconnect(uid, nowMs) {
    const p = participant(uid);
    if (p.progress?.finished) return snapshot();
    if (p.left || p.dnf || p.disconnectedAt !== null && nowMs - p.disconnectedAt > 1e4) throw Error("race_reconnect_expired");
    p.disconnectedAt = null;
    p.queue = [];
    p.actions = NEUTRAL;
    return snapshot();
  }
  function leave(uid, nowMs) {
    const p = participant(uid);
    if (phase === "lobby") {
      players.delete(uid);
      for (const [index, row] of [...players.values()].entries()) row.slot = index;
      if (uid === leaderUid) leaderUid = activeHumans()[0]?.uid || "";
      if (!activeHumans().length) {
        phase = "cancelled";
        reason = "race_empty";
      }
    } else {
      p.left = true;
      p.dnf = !p.progress?.finished;
      p.queue = [];
      p.actions = NEUTRAL;
      p.disconnectedAt = nowMs;
    }
    return snapshot();
  }
  function finishIfComplete(nowMs) {
    if ([...players.values()].every((p) => p.dnf || p.progress?.finished) || nowMs - startAtMs >= maximumDurationMs) {
      for (const p of players.values()) if (!p.progress?.finished) p.dnf = true;
      phase = "complete";
      completedAtMs = nowMs;
      if (!outcomeEmitted) {
        outcomeEmitted = true;
        onComplete(snapshot());
      }
    }
  }
  function advance(nowMs) {
    if (!Number.isFinite(nowMs) || nowMs < lastNow) throw Error("invalid_race_clock");
    lastNow = nowMs;
    if (phase === "lobby") {
      if (nowMs - createdAtMs > 3e5) {
        phase = "cancelled";
        reason = "race_lobby_expired";
      }
      return snapshot();
    }
    if (!["countdown", "running"].includes(phase) || nowMs < startAtMs) return snapshot();
    phase = "running";
    const targetTick = Math.floor((nowMs - startAtMs) / STEP_MS);
    if (targetTick - tick > 30) {
      phase = "cancelled";
      reason = "race_authority_stalled";
      return snapshot();
    }
    while (tick < targetTick) {
      tick++;
      const frameAt = startAtMs + tick * STEP_MS;
      for (const p of players.values()) {
        if (p.dnf || p.progress.finished) continue;
        if (p.disconnectedAt !== null && frameAt - p.disconnectedAt > 1e4) {
          p.dnf = true;
          continue;
        }
        while (p.queue.length && p.queue[0].at <= frameAt) {
          const command = p.queue.shift();
          p.actions = command.actions;
          p.lastControlAt = command.at;
        }
        const actions = p.ai ? raceAiActions(course, p.car, p.progress, p.profile, { difficulty: p.difficulty }) : p.disconnectedAt !== null || frameAt - p.lastControlAt > 400 ? NEUTRAL : p.actions;
        stepRaceVehicle(course, p.car, actions, 1 / 60, p.profile);
        p.progress = advanceRaceProgress(course, p.progress, raceVehicleGroundPose(p.car), frameAt, { startedAtMs: startAtMs });
      }
      finishIfComplete(frameAt);
      if (phase === "complete") break;
    }
    return snapshot();
  }
  function snapshot() {
    const ordered = [...players.values()].sort((a, b) => a.dnf - b.dnf || (a.progress?.finished && b.progress?.finished ? a.progress.elapsedMs - b.progress.elapsedMs : a.progress?.finished ? -1 : b.progress?.finished ? 1 : (b.progress?.lap || 1) - (a.progress?.lap || 1) || (b.progress?.nextGate || 0) - (a.progress?.nextGate || 0)));
    let previousPosition = 0;
    return {
      id,
      phase,
      reason,
      courseName: course.name,
      discipline: course.discipline,
      laps: course.laps,
      creatorUid,
      leaderUid,
      createdAtMs,
      startAtMs,
      serverAtMs: lastNow,
      simulationAtMs: startAtMs === null ? null : startAtMs + tick * STEP_MS,
      completedAtMs,
      players: ordered.map((p, index) => {
        const previous = ordered[index - 1], tied = !p.dnf && p.progress?.finished && previous?.progress?.finished && p.progress.elapsedMs === previous.progress.elapsedMs;
        const position = tied ? previousPosition : index + 1;
        previousPosition = position;
        return {
          uid: p.uid,
          label: p.label,
          ai: p.ai,
          vehicleId: p.profile.vehicleId,
          slot: p.slot,
          ready: p.ready,
          disconnected: p.disconnectedAt !== null,
          dnf: p.dnf,
          position,
          lastInputSequence: p.lastSequence,
          pose: p.car ? raceVehicleGroundPose(p.car) : null,
          speed: p.car?.speed || 0,
          condition: p.car?.condition ?? p.profile.conditionValue,
          barrierContacts: p.car?.barrierContacts ?? 0,
          vehicleState: snapshotRaceVehicle(p.car),
          progress: p.progress ? {
            nextGate: p.progress.nextGate,
            lap: p.progress.lap,
            finished: p.progress.finished,
            elapsedMs: p.progress.elapsedMs ?? null,
            bestLapMs: p.progress.bestLapMs,
            lapTimes: [...p.progress.lapTimes],
            penaltyMs: p.progress.penaltyMs
          } : null
        };
      })
    };
  }
  return Object.freeze({
    add,
    setReady,
    start,
    control,
    advance,
    disconnect,
    reconnect,
    leave,
    snapshot,
    cancel(cancelReason = "race_cancelled") {
      if (phase === "complete") return snapshot();
      phase = "cancelled";
      reason = cancelReason;
      return snapshot();
    }
  });
}

// app/js/racing/course-library.js
function normalizeRaceRouteReference(value) {
  if (!value || value.version !== 1 || !/^race-district:[a-f0-9]{64}$/.test(value.districtFingerprint) || !Array.isArray(value.path) || value.path.length < 1 || value.path.length > 500 || value.path.some((id) => typeof id !== "string" || id.length > 190) || !RACE_DISCIPLINES.includes(value.discipline) || !Number.isInteger(value.laps) || value.laps < 1 || value.laps > 8 || !Number.isInteger(value.participants) || value.participants < 1 || value.participants > 4) throw Error("invalid_saved_race_route");
  const offset = value.startOffsetMeters ?? null;
  if (offset !== null && (!Number.isFinite(offset) || offset <= 0)) throw Error("invalid_saved_race_route");
  return {
    version: 1,
    districtFingerprint: value.districtFingerprint,
    path: [...value.path],
    discipline: value.discipline,
    laps: value.laps,
    participants: value.participants,
    startOffsetMeters: offset,
    name: String(value.name || "Your mapped route").trim().slice(0, 100)
  };
}
async function raceDistrictFingerprint(district) {
  const value = JSON.stringify({
    version: 1,
    locationId: district.locationId,
    anchor: district.anchor,
    metersPerUnit: district.metersPerUnit,
    roads: [...district.roads].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map((r) => ({
      id: r.sourceId,
      a: r.a,
      b: r.b,
      width: r.widthMeters,
      direction: r.direction || "both",
      structure: r.structure,
      clearance: r.clearanceMeters,
      heights: r.heightSamples,
      span: r.heightSampleSpanMeters
    }))
  });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return "race-district:" + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
function restoreRaceCourse(reference, district, graph, fingerprint) {
  const route = normalizeRaceRouteReference(reference);
  if (route.districtFingerprint !== fingerprint) throw Error("race_roads_changed_requalify_route");
  return createRaceCourse(graph, route.path, {
    ...route,
    locationId: district.locationId,
    locationLabel: district.locationLabel,
    anchor: district.anchor,
    ...route.startOffsetMeters === null ? { startOffsetMeters: void 0 } : {}
  });
}
async function raceCourseKey(course) {
  const data = new TextEncoder().encode(JSON.stringify({
    version: course.version,
    location: course.locationId,
    anchor: course.anchor,
    discipline: course.discipline,
    laps: course.laps,
    segments: course.segments
  }));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return "road-race-" + Array.from(new Uint8Array(hash).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

// app/js/racing/record-rules.js
var RACE_PHYSICS_VERSION = "earth-road-2026-10-28.2";
function raceRecordConfiguration(profile) {
  if (!profile?.vehicleId || !Number.isFinite(profile.conditionValue)) throw Error("invalid_race_record_profile");
  return {
    physicsVersion: RACE_PHYSICS_VERSION,
    vehicleId: profile.vehicleId,
    condition: profile.conditionValue,
    grip: profile.surface.grip,
    upgrades: profile.upgrades,
    character: "standard",
    boost: false
  };
}
function raceCompetitiveRecordConfiguration(profile, { slot, participants }) {
  if (!Number.isInteger(participants) || participants < 1 || participants > 4 || !Number.isInteger(slot) || slot < 0 || slot >= participants) throw Error("invalid_race_record_grid");
  return { ...raceRecordConfiguration(profile), gridRow: Math.floor(slot / 2), gridParticipants: participants, timing: "grid-to-finish" };
}

// services/racing/engine-entry.mjs
var import_economy_authority = __toESM(require_economy_authority(), 1);
var export_prepareExplorerCreditAward = import_economy_authority.prepareExplorerCreditAward;
export {
  RACE_PHYSICS_VERSION,
  buildRaceRoadGraph,
  createRaceCourse,
  createRaceSession,
  createRaceVehicleProfile,
  normalizeRaceActions,
  normalizeVehicleGarage,
  personalVehicleById,
  personalVehicleIdentity,
  export_prepareExplorerCreditAward as prepareExplorerCreditAward,
  raceCompetitiveRecordConfiguration,
  raceCourseKey,
  raceDistrictFingerprint,
  raceGridPose,
  raceRecordConfiguration,
  restoreRaceCourse
};

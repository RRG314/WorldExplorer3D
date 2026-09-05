const MODEL_ASSET_SCHEMA_VERSION = 1;

const MODEL_ASSET_CATALOG = Object.freeze([
  Object.freeze({
    schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
    id: 'vehicle-bmw-525i-e34',
    label: 'BMW 525i E34',
    url: '/app/assets/models/vehicles/bmw-525i-e34.glb',
    roles: Object.freeze(['player-road-vehicle']),
    license: 'CC-BY-4.0',
    sourceUrl: 'https://sketchfab.com/3d-models/bmw-525i-e34-project-zomboid-c65aa3b7687d4f5dbbabdfad0b7816bb',
    attribution: 'BMW 525i E34 | Project Zomboid by Uralvagonzavod',
    dimensionsMeters: Object.freeze({ length: 4.72, width: 1.75, height: 1.41 }),
    sourceUpAxis: 'z',
    sourceLengthAxis: 'y',
    collisionPolicy: 'existing-player-vehicle-envelope',
    instancePolicy: Object.freeze({ geometry: 'clone', materials: 'clone' }),
    budgets: Object.freeze({
      bytes: 4_900_000,
      triangles: 40_000,
      maxInstances: 1
    })
  }),
  Object.freeze({
    schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
    id: 'character-field-explorer-v1',
    label: 'Field Explorer Adventurer',
    url: '/app/assets/models/characters/field-explorer-v1.glb',
    roles: Object.freeze(['player-character']),
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    attribution: 'Ultimate Modular Men — Adventurer by Quaternius',
    dimensionsMeters: Object.freeze({ height: 1.78 }),
    sourceUpAxis: 'y',
    sourceForwardAxis: 'z',
    collisionPolicy: 'existing-character-envelope',
    animationClips: Object.freeze({ idle: 'Idle', walk: 'Walk', run: 'Run', wave: 'Wave' }),
    instancePolicy: Object.freeze({ geometry: 'shared', materials: 'clone' }),
    budgets: Object.freeze({
      bytes: 2_000_000,
      triangles: 30_700,
      maxInstances: 1,
      textureEdgePixels: 0
    })
  }),
  Object.freeze({
    schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
    id: 'character-city-explorer-v1',
    label: 'City Explorer Hoodie',
    url: '/app/assets/models/characters/city-explorer-v1.glb',
    roles: Object.freeze(['nearby-npc-character']),
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    attribution: 'Ultimate Modular Men — Casual Hoodie by Quaternius',
    dimensionsMeters: Object.freeze({ height: 1.74 }),
    sourceUpAxis: 'y',
    sourceForwardAxis: 'z',
    collisionPolicy: 'existing-character-envelope',
    animationClips: Object.freeze({ idle: 'Idle', walk: 'Walk', run: 'Run', wave: 'Wave' }),
    instancePolicy: Object.freeze({ geometry: 'shared', materials: 'clone' }),
    budgets: Object.freeze({
      bytes: 1_600_000,
      triangles: 18_700,
      maxInstances: 1,
      textureEdgePixels: 0
    })
  }),
  Object.freeze({
    schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
    id: 'character-city-explorer-casual-v1',
    label: 'City Explorer Casual',
    url: '/app/assets/models/characters/city-explorer-casual-v1.glb',
    roles: Object.freeze(['nearby-npc-character']),
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    attribution: 'Ultimate Modular Men — Casual 2 by Quaternius',
    dimensionsMeters: Object.freeze({ height: 1.76 }),
    sourceUpAxis: 'y',
    sourceForwardAxis: 'z',
    collisionPolicy: 'existing-character-envelope',
    animationClips: Object.freeze({ idle: 'Idle', walk: 'Walk', run: 'Run', wave: 'Wave' }),
    instancePolicy: Object.freeze({ geometry: 'shared', materials: 'clone' }),
    budgets: Object.freeze({
      bytes: 1_550_000,
      triangles: 17_400,
      maxInstances: 1,
      textureEdgePixels: 0
    })
  }),
  Object.freeze({
    schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
    id: 'character-civic-responder-v1',
    label: 'Civic Responder',
    url: '/app/assets/models/characters/civic-responder-v1.glb',
    roles: Object.freeze(['civic-responder-character']),
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    attribution: 'Ultimate Modular Men — SWAT by Quaternius',
    dimensionsMeters: Object.freeze({ height: 1.8 }),
    sourceUpAxis: 'y',
    sourceForwardAxis: 'z',
    collisionPolicy: 'existing-character-envelope',
    animationClips: Object.freeze({ idle: 'Idle', walk: 'Walk', run: 'Run', wave: 'Wave' }),
    instancePolicy: Object.freeze({ geometry: 'shared', materials: 'clone' }),
    budgets: Object.freeze({
      bytes: 1_780_000,
      triangles: 26_400,
      maxInstances: 2,
      textureEdgePixels: 0
    })
  }),
  Object.freeze({
    schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
    id: 'character-ship-crew-v1',
    label: 'Expedition Ship Crew',
    url: '/app/assets/models/characters/ship-crew-v1.glb',
    roles: Object.freeze(['ship-crew-character']),
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    attribution: 'Ultimate Modular Men — Spacesuit by Quaternius',
    dimensionsMeters: Object.freeze({ height: 1.82 }),
    sourceUpAxis: 'y',
    sourceForwardAxis: 'z',
    collisionPolicy: 'existing-character-envelope',
    animationClips: Object.freeze({ idle: 'Idle', walk: 'Walk', run: 'Run', wave: 'Wave' }),
    instancePolicy: Object.freeze({ geometry: 'shared', materials: 'clone' }),
    budgets: Object.freeze({
      bytes: 2_050_000,
      triangles: 31_700,
      maxInstances: 7,
      textureEdgePixels: 0
    })
  })
]);

const MODEL_ASSET_BY_ID = new Map(MODEL_ASSET_CATALOG.map((entry) => [entry.id, entry]));

function getModelAsset(id) {
  return MODEL_ASSET_BY_ID.get(String(id || '')) || null;
}

function modelAssetsForRole(role) {
  const token = String(role || '');
  return MODEL_ASSET_CATALOG.filter((entry) => entry.roles.includes(token));
}

export {
  MODEL_ASSET_CATALOG,
  MODEL_ASSET_SCHEMA_VERSION,
  getModelAsset,
  modelAssetsForRole
};

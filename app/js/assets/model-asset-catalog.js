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
    budgets: Object.freeze({
      bytes: 4_900_000,
      triangles: 40_000,
      maxInstances: 1
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

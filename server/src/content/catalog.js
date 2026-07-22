const INITIAL_ASSETS = Object.freeze([
  { id: 'block.cube', kind: 'object', shape: 'cube', collision: 'solid', dimensions: [1, 1, 1] },
  { id: 'block.ramp', kind: 'object', shape: 'ramp', collision: 'solid', dimensions: [1, 1, 1] },
  { id: 'block.slab', kind: 'object', shape: 'slab', collision: 'solid', dimensions: [1, 0.5, 1] },
  { id: 'block.wedge', kind: 'object', shape: 'wedge', collision: 'solid', dimensions: [1, 1, 1] },
  { id: 'block.column', kind: 'object', shape: 'column', collision: 'solid', dimensions: [0.72, 1, 0.72] },
  { id: 'block.cylinder', kind: 'object', shape: 'cylinder', collision: 'solid', dimensions: [0.96, 1, 0.96] },
  { id: 'block.pyramid', kind: 'object', shape: 'pyramid', collision: 'solid', dimensions: [1, 1, 1] },
  { id: 'block.stairs', kind: 'object', shape: 'stairs', collision: 'stepped', dimensions: [1, 1, 1] },
  { id: 'block.wall', kind: 'object', shape: 'wall', collision: 'solid', dimensions: [1, 1, 0.25] },
  { id: 'block.beam', kind: 'object', shape: 'beam', collision: 'solid', dimensions: [1, 0.25, 0.25] },
  { id: 'block.roof', kind: 'object', shape: 'roof', collision: 'sloped', dimensions: [1, 1, 1] },
  { id: 'block.panel', kind: 'object', shape: 'panel', collision: 'solid', dimensions: [1, 1, 0.25] },
  { id: 'vehicle.compact', kind: 'vehicle', seats: 4 },
  { id: 'vehicle.boat', kind: 'vehicle', seats: 6 },
  { id: 'vehicle.rover', kind: 'vehicle', seats: 2 }
]);
const BUILD_COLORS = Object.freeze([
  'red',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'white',
  'charcoal',
  'brick',
  'stone',
  'concrete',
  'wood',
  'glass',
  'metal',
  'grass',
  'sand'
]);

function createAssetCatalog(entries = INITIAL_ASSETS) {
  const assets = new Map(entries.map((entry) => [entry.id, Object.freeze({ ...entry })]));
  return Object.freeze({
    get: (assetId) => assets.get(String(assetId || '')) || null,
    has: (assetId) => assets.has(String(assetId || '')),
    list: () => Array.from(assets.values())
  });
}

function assetMatchesCommand(asset, commandType) {
  if (!asset) return false;
  if (commandType === 'vehicle.spawn') return asset.kind === 'vehicle';
  if (commandType === 'world.object.place') return asset.kind === 'object';
  return true;
}

function normalizeAssetMetadata(asset, input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  if (asset?.kind !== 'object') return {};
  const color = BUILD_COLORS.includes(source.color) ? source.color : 'red';
  return { color, shape: asset.shape };
}

export {
  BUILD_COLORS,
  INITIAL_ASSETS,
  assetMatchesCommand,
  createAssetCatalog,
  normalizeAssetMetadata
};

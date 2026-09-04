const MODEL_ASSET_SCHEMA_VERSION = 1;

const ALLOWED_LICENSES = Object.freeze(new Set([
  'CC0-1.0',
  'CC-BY-2.0',
  'CC-BY-4.0',
  'NASA-MEDIA'
]));

function finiteBudget(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function defineModelAsset(definition = {}) {
  const id = String(definition.id || '').trim();
  const url = String(definition.url || '').trim();
  const license = String(definition.license || '').trim();
  const sourceUrl = String(definition.sourceUrl || '').trim();
  const attribution = String(definition.attribution || '').trim();
  if (!id) throw new TypeError('Curated model assets require a stable id.');
  if (!url.startsWith('/app/assets/models/')) throw new TypeError(`${id} must use a bundled model URL.`);
  if (!ALLOWED_LICENSES.has(license)) throw new TypeError(`${id} has an unsupported license: ${license || 'missing'}`);
  if (!sourceUrl.startsWith('https://')) throw new TypeError(`${id} requires a public source URL.`);
  if (!attribution) throw new TypeError(`${id} requires an attribution record.`);

  return Object.freeze({
    schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
    id,
    label: String(definition.label || id),
    url,
    roles: Object.freeze([...(definition.roles || [])].map(String)),
    license,
    sourceUrl,
    attribution,
    animation: Object.freeze({
      rigged: definition.animation?.rigged === true,
      clips: Object.freeze([...(definition.animation?.clips || [])].map(String))
    }),
    scale: Object.freeze({
      targetHeightMeters: Number(definition.scale?.targetHeightMeters) || null,
      authoritative: String(definition.scale?.authoritative || 'catalog')
    }),
    collision: Object.freeze({
      policy: String(definition.collision?.policy || 'bounds'),
      walkable: definition.collision?.walkable === true
    }),
    delivery: Object.freeze({
      desktop: String(definition.delivery?.desktop || 'bundled'),
      mobile: String(definition.delivery?.mobile || 'bundled')
    }),
    budgets: Object.freeze({
      desktopBytes: finiteBudget(definition.budgets?.desktopBytes, 8_000_000),
      mobileBytes: finiteBudget(definition.budgets?.mobileBytes, 4_000_000),
      desktopTriangles: finiteBudget(definition.budgets?.desktopTriangles, 80_000),
      mobileTriangles: finiteBudget(definition.budgets?.mobileTriangles, 30_000),
      maxInstances: finiteBudget(definition.budgets?.maxInstances, 1)
    })
  });
}

const MODEL_ASSET_CATALOG = Object.freeze([
  defineModelAsset({
    id: 'planetary-rover-mars',
    label: 'Mars exploration rover',
    url: '/app/assets/models/mars-exploration-rover.glb',
    roles: ['planetary-vehicle'],
    license: 'NASA-MEDIA',
    sourceUrl: 'https://science.nasa.gov/resource/mars-exploration-rovers-3d-model/',
    attribution: 'NASA Mars Exploration Rover 3D model',
    scale: { authoritative: 'vehicle-catalog-dimensions' },
    collision: { policy: 'vehicle-envelope', walkable: false },
    delivery: { desktop: 'bundled', mobile: 'procedural-fallback' },
    budgets: { desktopBytes: 12_500_000, mobileBytes: 5_000_000, desktopTriangles: 90_000, mobileTriangles: 45_000, maxInstances: 1 }
  }),
  defineModelAsset({
    id: 'landmark-eiffel-tower',
    label: 'Eiffel Tower source mesh',
    url: '/app/assets/models/landmarks/eiffel-tower.glb',
    roles: ['earth-landmark'],
    license: 'CC0-1.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Eiffel.stl',
    attribution: 'Eiffel.stl by ingoenius',
    scale: { authoritative: 'landmark-catalog-dimensions' },
    collision: { policy: 'landmark-footprint', walkable: false },
    budgets: { desktopBytes: 5_000_000, mobileBytes: 3_000_000, desktopTriangles: 80_000, mobileTriangles: 35_000, maxInstances: 1 }
  }),
  defineModelAsset({
    id: 'landmark-elizabeth-tower',
    label: 'Elizabeth Tower source mesh',
    url: '/app/assets/models/landmarks/elizabeth-tower.glb',
    roles: ['earth-landmark'],
    license: 'CC-BY-4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Big_Ben.stl',
    attribution: 'Big Ben.stl by Microsoft',
    scale: { authoritative: 'landmark-catalog-dimensions' },
    collision: { policy: 'landmark-footprint', walkable: false },
    budgets: { desktopBytes: 5_000_000, mobileBytes: 3_000_000, desktopTriangles: 80_000, mobileTriangles: 35_000, maxInstances: 1 }
  }),
  defineModelAsset({
    id: 'landmark-khufu-pyramid',
    label: 'Great Pyramid source mesh',
    url: '/app/assets/models/landmarks/pyramid-khufu.glb',
    roles: ['earth-landmark'],
    license: 'CC0-1.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pyramid_of_Khufu.stl',
    attribution: 'Pyramid of Khufu.stl by Drummyfish',
    scale: { authoritative: 'landmark-catalog-dimensions' },
    collision: { policy: 'landmark-footprint', walkable: true },
    budgets: { desktopBytes: 5_000_000, mobileBytes: 3_000_000, desktopTriangles: 80_000, mobileTriangles: 35_000, maxInstances: 1 }
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
  ALLOWED_LICENSES,
  MODEL_ASSET_CATALOG,
  MODEL_ASSET_SCHEMA_VERSION,
  defineModelAsset,
  getModelAsset,
  modelAssetsForRole
};

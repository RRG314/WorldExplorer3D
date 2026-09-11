const ENVIRONMENT_CONTEXT_SCHEMA_VERSION = 1;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function featurePoints(feature) {
  if (Array.isArray(feature?.pts)) return feature.pts;
  if (Array.isArray(feature?.points)) return feature.points;
  return [];
}

function featureCenter(feature) {
  const points = featurePoints(feature);
  if (points.length) {
    return points.reduce((center, point) => ({
      x: center.x + Number(point?.x || 0) / points.length,
      z: center.z + Number(point?.z || 0) / points.length
    }), { x: 0, z: 0 });
  }
  return { x: Number(feature?.x || 0), z: Number(feature?.z || 0) };
}

function distanceSquared(a, b) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0);
  const dz = Number(a?.z || 0) - Number(b?.z || 0);
  return dx * dx + dz * dz;
}

function textTags(feature) {
  const values = [
    feature?.type, feature?.kind, feature?.category, feature?.subtype,
    feature?.name, feature?.tags?.landuse, feature?.tags?.natural,
    feature?.tags?.leisure, feature?.tags?.water, feature?.tags?.waterway
  ];
  return values.filter(Boolean).join(' ').toLowerCase();
}

function containsPoint(feature, point, pointInPolygon) {
  const points = featurePoints(feature);
  if (points.length >= 3 && typeof pointInPolygon === 'function') {
    try { return !!pointInPolygon(point.x, point.z, points); } catch (_) {}
  }
  return distanceSquared(featureCenter(feature), point) < 90 * 90;
}

function elevationBand(elevation) {
  if (!Number.isFinite(elevation)) return 'unknown';
  if (elevation < 10) return 'low';
  if (elevation < 250) return 'rolling';
  if (elevation < 900) return 'highland';
  return 'mountain';
}

function contextSetForCell(cell, options) {
  const contexts = new Set();
  const point = cell.center;
  const radiusSq = Math.pow(options.cellSize * 0.8, 2);
  const nearbyBuildings = options.buildings.filter((feature) => distanceSquared(featureCenter(feature), point) <= radiusSq);
  const nearbyRoads = options.roads.filter((feature) => distanceSquared(featureCenter(feature), point) <= radiusSq);
  const containingLand = options.landuses.filter((feature) => containsPoint(feature, point, options.pointInPolygon));
  const containingWater = options.waterAreas.filter((feature) => containsPoint(feature, point, options.pointInPolygon));
  const nearbyWaterways = options.waterways.filter((feature) => distanceSquared(featureCenter(feature), point) <= radiusSq);
  const tags = containingLand.map(textTags).join(' ');
  const waterTags = [...containingWater, ...nearbyWaterways].map(textTags).join(' ');

  if (nearbyBuildings.length >= 10 || nearbyRoads.length >= 8) contexts.add('urban-core');
  if (nearbyBuildings.length >= 2 || nearbyRoads.length >= 2) contexts.add('urban');
  if (/park|recreation|garden|village_green/.test(tags)) contexts.add('park');
  if (/forest|wood/.test(tags)) contexts.add('forest');
  const mappedRuralLand = /meadow|farmland|farmyard|farm|orchard|pasture/.test(tags);
  if (/meadow|grass|farmland|farm|orchard/.test(tags)) contexts.add('field');
  if (mappedRuralLand) {
    contexts.add('farm');
    if (nearbyBuildings.length < 2 && nearbyRoads.length < 2) contexts.add('rural');
  }
  if (/wetland|marsh|swamp|bog/.test(tags)) contexts.add('wetland');
  if (/sand|beach|dune/.test(tags)) contexts.add('beach');
  if (/quarry|rock|bare_rock|scree/.test(tags)) contexts.add('outcrop');
  if (/path|footway|track|bridleway/.test([...containingLand, ...nearbyRoads].map(textTags).join(' '))) contexts.add('trail');
  if (containingWater.length || nearbyWaterways.length) {
    if (/ocean|sea|coast|bay/.test(waterTags)) contexts.add('coast');
    else contexts.add('fresh-water');
    if (/river|stream|creek/.test(waterTags)) contexts.add('stream');
  }
  if (cell.elevationBand === 'mountain') contexts.add('mountain');
  if (Math.abs(options.latitude) < 35 && /sand|bare|scrub/.test(tags)) contexts.add('desert');
  if (contexts.size === 0) contexts.add(options.defaultContext || 'field');
  return { contexts, nearbyBuildings: nearbyBuildings.length, nearbyRoads: nearbyRoads.length };
}

function compileEnvironmentContext(options = {}) {
  if (options.snapshot?.type !== 'WorldSnapshot' || !Object.isFrozen(options.snapshot)) {
    throw new TypeError('Environment context requires an immutable WorldSnapshot.');
  }
  const worldIdentity = options.worldIdentity;
  if (worldIdentity?.type !== 'WorldIdentity') throw new TypeError('Environment context requires a WorldIdentity.');
  const cellSize = Math.max(80, Number(options.cellSize) || 160);
  const gridRadius = Math.max(1, Math.min(4, Math.floor(Number(options.gridRadius) || 2)));
  const runtime = {
    cellSize,
    latitude: Number(worldIdentity.location?.lat || 0),
    buildings: Array.isArray(options.buildings) ? options.buildings : [],
    roads: Array.isArray(options.roads) ? options.roads : [],
    landuses: Array.isArray(options.landuses) ? options.landuses : [],
    waterAreas: Array.isArray(options.waterAreas) ? options.waterAreas : [],
    waterways: Array.isArray(options.waterways) ? options.waterways : [],
    pointInPolygon: options.pointInPolygon,
    defaultContext: options.defaultContext
  };
  const cells = [];
  for (let zIndex = -gridRadius; zIndex <= gridRadius; zIndex++) {
    for (let xIndex = -gridRadius; xIndex <= gridRadius; xIndex++) {
      const center = { x: xIndex * cellSize, z: zIndex * cellSize };
      const elevation = Number(options.sampleSurfaceY?.(center.x, center.z));
      const base = { center, elevationBand: elevationBand(elevation) };
      const result = contextSetForCell(base, runtime);
      cells.push({
        cellId: `cell:${xIndex}:${zIndex}`,
        center,
        bounds: {
          minX: center.x - cellSize / 2, maxX: center.x + cellSize / 2,
          minZ: center.z - cellSize / 2, maxZ: center.z + cellSize / 2
        },
        elevationBand: base.elevationBand,
        reliefBand: base.elevationBand === 'mountain' ? 'steep' : 'gentle',
        contexts: [...result.contexts].sort(),
        urbanDensityBand: result.nearbyBuildings >= 10 ? 'dense' : result.nearbyBuildings >= 2 ? 'developed' : 'open',
        accessSensitivity: 'unknown-real-world-access',
        provenance: ['world-snapshot', 'compiled-local-features']
      });
    }
  }

  cells.forEach((cell) => {
    const water = cell.contexts.some((value) => ['fresh-water', 'coast'].includes(value));
    const nearOpposite = cells.some((other) =>
      other !== cell && distanceSquared(cell.center, other.center) <= cellSize * cellSize * 1.1 &&
      other.contexts.some((value) => ['fresh-water', 'coast'].includes(value)) !== water
    );
    if (nearOpposite) {
      const contexts = new Set(cell.contexts);
      contexts.add(contexts.has('coast') ? 'beach' : 'riverbank');
      cell.contexts = [...contexts].sort();
    }
  });

  return deepFreeze({
    type: 'EnvironmentContextPublication',
    schemaVersion: ENVIRONMENT_CONTEXT_SCHEMA_VERSION,
    requestId: options.snapshot.requestId,
    sequence: options.snapshot.sequence,
    worldIdentity,
    coverage: { cellSize, gridRadius, cellCount: cells.length },
    cells,
    temporal: {
      month: Number(options.month) || new Date().getUTCMonth() + 1,
      seasonModel: runtime.latitude >= 0 ? 'northern' : 'southern',
      localTimeBand: String(options.localTimeBand || 'day'),
      weatherBand: String(options.weatherBand || 'unknown')
    },
    diagnostics: {
      generatedWithAdditionalProviderQueries: false,
      sourceCounts: {
        buildings: runtime.buildings.length,
        roads: runtime.roads.length,
        landuses: runtime.landuses.length,
        waterAreas: runtime.waterAreas.length,
        waterways: runtime.waterways.length
      }
    }
  });
}

function createEnvironmentFixture(name) {
  const profiles = {
    downtown: ['urban', 'urban-core'], suburb: ['urban', 'park'], field: ['field'], farm: ['farm', 'field', 'rural'], forest: ['forest', 'trail'],
    river: ['fresh-water', 'stream', 'riverbank'], beach: ['coast', 'beach'], mountain: ['mountain', 'outcrop', 'trail'],
    desert: ['desert', 'outcrop'], outcrop: ['outcrop', 'field'], 'fossil-formation': ['outcrop', 'fossil-formation'],
    'open-ocean': ['open-ocean', 'coast']
  };
  const contexts = profiles[name];
  if (!contexts) throw new Error(`Unknown environment fixture: ${name}`);
  return deepFreeze({
    type: 'EnvironmentContextPublication', schemaVersion: 1, requestId: `fixture:${name}`, sequence: 1,
    worldIdentity: { type: 'WorldIdentity', id: `fixture:${name}`, location: { lat: 39, lon: -76 } },
    coverage: { cellSize: 160, gridRadius: 0, cellCount: 1 },
    cells: [{ cellId: 'cell:0:0', center: { x: 0, z: 0 }, bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 }, elevationBand: name === 'mountain' ? 'mountain' : 'low', reliefBand: name === 'mountain' ? 'steep' : 'gentle', contexts, urbanDensityBand: contexts.includes('urban-core') ? 'dense' : 'open', accessSensitivity: 'unknown-real-world-access', provenance: ['fixture'] }],
    temporal: { month: 8, seasonModel: 'northern', localTimeBand: 'day', weatherBand: 'clear' },
    diagnostics: { generatedWithAdditionalProviderQueries: false, fixture: name }
  });
}

export { compileEnvironmentContext, createEnvironmentFixture, ENVIRONMENT_CONTEXT_SCHEMA_VERSION };

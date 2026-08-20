const WORLD_LAYER_COLLECTIONS = Object.freeze({
  terrain: Object.freeze([]),
  hydrology: Object.freeze(['waterAreas', 'waterways', 'waterWaveVisuals']),
  transport: Object.freeze(['roads', 'roadMeshes', 'urbanSurfaceMeshes', 'linearFeatures', 'linearFeatureMeshes', 'structureVisualMeshes']),
  buildings: Object.freeze(['buildings', 'buildingMeshes', 'dynamicBuildingColliders']),
  landuse: Object.freeze(['landuses', 'surfaceFeatureHints', 'landuseMeshes', 'vegetationFeatures', 'vegetationMeshes']),
  places: Object.freeze(['pois', 'poiMeshes', 'historicSites', 'historicMarkers', 'streetFurnitureMeshes'])
});

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function immutableValue(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableValue));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, immutableValue(nested)])
  ));
}

function collectionCounts(counts, names) {
  return Object.fromEntries(names.map((name) => [name, finiteCount(counts?.[name])]));
}

function sumCounts(counts) {
  return Object.values(counts).reduce((total, count) => total + finiteCount(count), 0);
}

function compactScalars(source, names) {
  return Object.fromEntries(names.flatMap((name) => {
    const value = source?.[name];
    return value === null || ['string', 'number', 'boolean'].includes(typeof value)
      ? [[name, value ?? null]]
      : [];
  }));
}

function layerProduct(options = {}) {
  const {
    request, name, counts, authority, provider, compiler, coverage,
    explicitEntryCount = null, compilation = {}
  } = options;
  const layerCounts = collectionCounts(counts, WORLD_LAYER_COLLECTIONS[name]);
  const collectionEntryCount = explicitEntryCount === null
    ? sumCounts(layerCounts)
    : finiteCount(explicitEntryCount);
  const hasRecords = collectionEntryCount > 0;
  return immutableValue({
    type: 'WorldLayerProduct',
    schemaVersion: 1,
    id: `world-layer:${name}:${request.id}`,
    requestId: request.id,
    sequence: request.sequence,
    layer: name,
    authority: hasRecords ? authority : null,
    completeness: hasRecords ? 'partial' : 'empty',
    source: {
      provider: provider || 'unknown',
      compiler,
      canonical: true
    },
    coverage,
    record: hasRecords ? {
      id: `${name}:${request.id}`,
      collectionEntryCount,
      collectionCounts: layerCounts,
      compilation
    } : null
  });
}

export function compileWorldLayerProducts(options = {}) {
  const {
    request, counts = {}, runtimeState = {}, loadMetrics = {}, artifacts = {}
  } = options;
  if (!request?.id || !Object.isFrozen(request)) {
    throw new TypeError('World layer products require an immutable WorldLoadRequest.');
  }
  const coverage = immutableValue({
    center: request.location,
    detailRadiusWorld: finiteCount(options.detailRadiusWorld)
  });
  const terrainCount = finiteCount(options.terrainCount);
  const groundModel = runtimeState.districtGroundModel || {};
  const transportPublication = artifacts.transportSurfacePublication || {};
  const waterPublication = artifacts.waterSurfaceRegistrySnapshot || {};
  const buildingPublication = artifacts.buildingProvenanceModel || {};
  const transportProvider = loadMetrics.overpassSource || runtimeState.districtSource || 'selected-location-transport';
  const buildingProvider = runtimeState?.publicationSources?.buildings || 'selected-location-buildings';

  return immutableValue({
    terrain: layerProduct({
      request,
      name: 'terrain',
      counts,
      authority: runtimeState.groundMode || 'accepted-ground',
      provider: groundModel.providerId || runtimeState.groundMode || 'accepted-ground',
      compiler: 'accepted-ground-terrain-compiler',
      coverage,
      explicitEntryCount: terrainCount,
      compilation: {
        terrainMeshCount: terrainCount,
        ...compactScalars(groundModel, ['status', 'providerId', 'verticalDatum', 'reason']),
        ...compactScalars(loadMetrics.terrainSurfaceMaterials, [
          'ready', 'total', 'pending', 'timedOut', 'waitMs', 'radiusWorld'
        ])
      }
    }),
    hydrology: layerProduct({
      request,
      name: 'hydrology',
      counts,
      authority: 'water_surface_registry',
      provider: 'openstreetmap-shortbread-and-osm',
      compiler: 'mapped-water-surface-compiler',
      coverage,
      compilation: compactScalars(waterPublication, [
        'schemaVersion', 'surfaceCount', 'navigableCount'
      ])
    }),
    transport: layerProduct({
      request,
      name: 'transport',
      counts,
      authority: transportPublication.authority || 'compiled_transport_surface',
      provider: transportProvider,
      compiler: 'transport-surface-compiler',
      coverage,
      compilation: compactScalars(transportPublication, [
        'transportGraphId', 'roadCount', 'meshCount', 'intersectionCount',
        'topologyIntersectionCount', 'compiledSampleCount', 'vertices', 'triangles',
        'worldLoadSequence'
      ])
    }),
    buildings: layerProduct({
      request,
      name: 'buildings',
      counts,
      authority: buildingPublication.authority || 'compiled_building_provenance',
      provider: buildingProvider,
      compiler: 'building-geometry-and-provenance-compiler',
      coverage,
      compilation: {
        ...compactScalars(buildingPublication, [
          'schemaVersion', 'featureCount', 'validCount', 'outlineCount', 'partCount',
          'inferredGeometryCount', 'ambiguousMetadataCount'
        ]),
        ...compactScalars(loadMetrics.buildings?.geometryPublication, [
          'candidateCount', 'renderedFeatureCount', 'yieldCount',
          'constrainedBuildings', 'constrainedRoads', 'gradeSeparatedOverlaps',
          'newlyNonDriveableRoads', 'minimumResolvedWidth',
          'suppressedCenterlineConflicts', 'suppressedMappedCrossSectionConflicts',
          'suppressedInferredFootprintConflicts', 'suppressedInsufficientClearanceConflicts',
          'unresolvedAtGradeConflicts'
        ])
      }
    }),
    landuse: layerProduct({
      request,
      name: 'landuse',
      counts,
      authority: 'terrain-worldcover-and-explicit-osm',
      provider: 'worldcover-and-osm',
      compiler: 'landcover-and-landuse-compiler',
      coverage,
      compilation: {
        ...compactScalars(loadMetrics.landuse, ['requested', 'selected']),
        ...compactScalars(loadMetrics.landuseBatching, [
          'sourceMeshCount', 'batchedMeshCount', 'outputMeshCount'
        ])
      }
    }),
    places: layerProduct({
      request,
      name: 'places',
      counts,
      authority: 'selected-location-places',
      provider: 'osm-and-bundled-landmarks',
      compiler: 'place-and-landmark-compiler',
      coverage,
      compilation: {
        ...compactScalars(loadMetrics.pois, ['requested', 'selected', 'near', 'mid', 'far']),
        ...compactScalars(loadMetrics.vegetation, [
          'treesRequested', 'treesSelected', 'treeRowsRequested', 'treeRowsSelected', 'generated'
        ])
      }
    })
  });
}

export function worldLayerProductCounts(products = {}) {
  const counts = {};
  Object.values(products).forEach((product) => {
    Object.assign(counts, product?.record?.collectionCounts || {});
  });
  return immutableValue(counts);
}

export { WORLD_LAYER_COLLECTIONS };

import {
  createDistrictSource,
  districtSourceLegacySelection
} from './district-source.js?v=1';
import {
  DISTRICT_GROUND_MODEL_SCHEMA_VERSION
} from './district-ground-model.js?v=1';

function featureBudgetWarning(selection) {
  const requested = selection.requestedCounts || {};
  const selected = {
    roads: selection.roadWays?.length || 0,
    buildings: selection.buildingWays?.length || 0,
    landuse: selection.landuseWays?.length || 0,
    pois: selection.poiNodes?.length || 0
  };
  if (Object.keys(selected).every((key) => selected[key] >= (requested[key] || 0))) {
    return null;
  }
  return `[WorldLoad] Applied adaptive limits ` +
    `(roads ${selected.roads}/${requested.roads || 0}, ` +
    `buildings ${selected.buildings}/${requested.buildings || 0}, ` +
    `landuse ${selected.landuse}/${requested.landuse || 0}, ` +
    `pois ${selected.pois}/${requested.pois || 0}).`;
}

export function adaptSelectedLocationSource(options = {}) {
  const location = options.location || {};
  const selection = options.selection || {};
  const requestedCounts = selection.requestedCounts || {};
  const count = (key) => Array.isArray(selection[key])
    ? selection[key].length
    : 0;
  const districtSource = createDistrictSource({
    districtId: `${Number(location.lat).toFixed(7)},${Number(location.lon).toFixed(7)}`,
    origin: {
      latitude: location.lat,
      longitude: location.lon,
      heightMeters: 0
    },
    provider: {
      name: 'OpenStreetMap',
      namespace: 'osm',
      endpoint: options.data?._overpassEndpoint || null,
      retrieval: options.data?._overpassSource || 'vector-source',
      license: 'ODbL-1.0'
    },
    nodes: options.nodes,
    featureCollections: {
      roads: selection.roadWays,
      buildings: selection.buildingWays,
      landuse: selection.landuseWays,
      waterways: selection.waterwayWays,
      railways: selection.railwayWays,
      footways: selection.footwayWays,
      cycleways: selection.cyclewayWays,
      structureConnectors: selection.structureConnectorWays,
      trees: selection.treeNodes,
      treeRows: selection.treeRowWays,
      pois: selection.poiNodes
    },
    completeness: {
      status: 'budgeted',
      selected: {
        roads: count('roadWays'),
        buildings: count('buildingWays'),
        landuse: count('landuseWays'),
        waterways: count('waterwayWays'),
        railways: count('railwayWays'),
        footways: count('footwayWays'),
        cycleways: count('cyclewayWays'),
        structureConnectors: count('structureConnectorWays'),
        trees: count('treeNodes'),
        treeRows: count('treeRowWays'),
        pois: count('poiNodes')
      },
      requested: {
        roads: requestedCounts.roads,
        buildings: requestedCounts.buildings,
        landuse: requestedCounts.landuse,
        pois: requestedCounts.pois
      },
      providerResponse: 'available'
    }
  });

  return Object.freeze({
    districtSource,
    budgetWarning: featureBudgetWarning(selection),
    rawSelection: selection,
    selection: districtSourceLegacySelection(districtSource),
    diagnostics: Object.freeze({
      districtSource: Object.freeze({
        districtId: districtSource.districtId,
        schemaVersion: districtSource.schemaVersion,
        nodeCount: districtSource.reconciliation.nodeCount,
        wayCount: districtSource.reconciliation.wayCount,
        provider: districtSource.provider.name
      }),
      districtGroundModel: Object.freeze({
        schemaVersion: DISTRICT_GROUND_MODEL_SCHEMA_VERSION,
        status: 'blocked',
        reason: 'approved-ground-provider-adapter-required'
      })
    })
  });
}

export function prepareSelectedLocationSource(options = {}) {
  if (typeof options.prepareSelection !== 'function') {
    throw new TypeError('prepareSelection must be a function');
  }
  const selection = options.prepareSelection({
    ...(options.selectionOptions || {}),
    centerLat: options.location?.lat,
    data: options.data,
    nodes: options.nodes
  });
  return adaptSelectedLocationSource({ ...options, selection });
}

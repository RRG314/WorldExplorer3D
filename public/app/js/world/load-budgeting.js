import { ctx as appCtx } from "../shared-context.js?v=55";

function isLanduseCandidate(tags) {
  return !!(
    tags?.landuse ||
    tags?.['area:highway'] ||
    tags?.amenity === 'parking' ||
    tags?.place === 'square' ||
    (tags?.highway === 'pedestrian' && tags?.area === 'yes') ||
    (tags?.area === 'yes' && /^(paved|asphalt|concrete|concrete:plates|paving_stones|sett|cobblestone)$/.test(tags?.surface || '')) ||
    tags?.natural === 'wood' ||
    tags?.natural === 'forest' ||
    tags?.natural === 'scrub' ||
    tags?.natural === 'grassland' ||
    tags?.natural === 'heath' ||
    tags?.natural === 'wetland' ||
    tags?.natural === 'sand' ||
    tags?.natural === 'beach' ||
    tags?.natural === 'bare_rock' ||
    tags?.natural === 'scree' ||
    tags?.natural === 'shingle' ||
    tags?.natural === 'glacier' ||
    tags?.natural === 'water' ||
    tags?.water ||
    tags?.leisure === 'park' ||
    tags?.leisure === 'garden' ||
    tags?.leisure === 'nature_reserve'
  );
}

function setWorldSurfaceProfile(worldSurfaceProfile) {
  if (typeof appCtx.setWorldSurfaceProfile === 'function') {
    appCtx.setWorldSurfaceProfile(worldSurfaceProfile);
  } else {
    appCtx.worldSurfaceProfile = worldSurfaceProfile;
  }
}

export function prepareWorldFeatureSelections(options = {}) {
  const data = options.data || {};
  const nodes = options.nodes || {};
  const loadMetrics = options.loadMetrics || {};
  const tileBudgetCfg = options.tileBudgetCfg || {};
  const useRdtBudgeting = options.useRdtBudgeting === true;
  const baselineFullWorld = options.baselineFullWorld === true;
  const enableLinearFeatures = options.enableLinearFeatures === true;
  const maxRoadWays = Number(options.maxRoadWays || 0);
  const maxBuildingWays = Number(options.maxBuildingWays || 0);
  const maxLanduseWays = Number(options.maxLanduseWays || 0);
  const maxPoiNodes = Number(options.maxPoiNodes || 0);
  const maxTreeNodes = Number(options.maxTreeNodes || 0);
  const maxTreeRowWays = Number(options.maxTreeRowWays || 0);

  const classifyLinearFeatureTags = options.classifyLinearFeatureTags;
  const classifyStructureSemantics = options.classifyStructureSemantics;
  const classifyWorldSurfaceProfile = options.classifyWorldSurfaceProfile;
  const isDriveableHighwayTag = options.isDriveableHighwayTag;
  const limitNodesByTileBudget = options.limitNodesByTileBudget;
  const limitWaysByTileBudget = options.limitWaysByTileBudget;
  const linearFeaturePriority = options.linearFeaturePriority;
  const poiKeyFromTags = options.poiKeyFromTags;
  const roadTypePriority = options.roadTypePriority;

  const allRoadWays = data.elements.filter((element) =>
    element.type === 'way' &&
    isDriveableHighwayTag(element.tags?.highway)
  );
  const roadWays = limitWaysByTileBudget(allRoadWays, nodes, {
    globalCap: maxRoadWays,
    basePerTile: tileBudgetCfg.roadsPerTile,
    minPerTile: tileBudgetCfg.roadsMinPerTile,
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting,
    compareFn: (a, b) => roadTypePriority(b.tags?.highway) - roadTypePriority(a.tags?.highway)
  });

  const allBuildingWays = data.elements.filter((element) =>
    element.type === 'way' && (element.tags?.building || element.tags?.['building:part'])
  );
  const buildingWays = baselineFullWorld ?
    allBuildingWays :
    limitWaysByTileBudget(allBuildingWays, nodes, {
      globalCap: maxBuildingWays,
      basePerTile: tileBudgetCfg.buildingsPerTile,
      minPerTile: tileBudgetCfg.buildingsMinPerTile,
      tileDegrees: tileBudgetCfg.tileDegrees,
      useRdt: useRdtBudgeting,
      spreadAcrossArea: true,
      coreRatio: useRdtBudgeting ? 0.35 : 0.45
    });

  const allLanduseWays = data.elements.filter((element) =>
    element.type === 'way' &&
    element.tags &&
    isLanduseCandidate(element.tags)
  );
  const landuseWays = limitWaysByTileBudget(allLanduseWays, nodes, {
    globalCap: maxLanduseWays,
    basePerTile: tileBudgetCfg.landusePerTile,
    minPerTile: tileBudgetCfg.landuseMinPerTile,
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting
  });

  const allWaterwayWays = data.elements.filter((element) =>
    element.type === 'way' &&
    element.tags &&
    !!element.tags.waterway
  );
  const waterwayWays = baselineFullWorld ?
    allWaterwayWays :
    limitWaysByTileBudget(allWaterwayWays, nodes, {
      globalCap: Math.max(240, Math.floor(maxLanduseWays * 0.8)),
      basePerTile: Math.max(20, Math.floor(tileBudgetCfg.landusePerTile * 0.7)),
      minPerTile: Math.max(8, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.6)),
      tileDegrees: tileBudgetCfg.tileDegrees,
      useRdt: useRdtBudgeting
    });

  const allRailwayWays = enableLinearFeatures ? data.elements.filter((element) =>
    element.type === 'way' &&
    classifyLinearFeatureTags(element.tags)?.kind === 'railway'
  ) : [];
  const railwayWays = enableLinearFeatures ? limitWaysByTileBudget(allRailwayWays, nodes, {
    globalCap: Math.max(80, Math.floor(maxRoadWays * 0.22)),
    basePerTile: Math.max(6, Math.floor(tileBudgetCfg.roadsPerTile * 0.22)),
    minPerTile: Math.max(2, Math.floor(tileBudgetCfg.roadsMinPerTile * 0.18)),
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting,
    compareFn: (a, b) =>
      linearFeaturePriority('railway', classifyLinearFeatureTags(b.tags)?.subtype) -
      linearFeaturePriority('railway', classifyLinearFeatureTags(a.tags)?.subtype)
  }) : [];

  const allFootwayWays = enableLinearFeatures ? data.elements.filter((element) =>
    element.type === 'way' &&
    classifyLinearFeatureTags(element.tags)?.kind === 'footway'
  ) : [];
  const footwayWays = enableLinearFeatures ? limitWaysByTileBudget(allFootwayWays, nodes, {
    globalCap: Math.max(150, Math.floor(maxLanduseWays * 0.65)),
    basePerTile: Math.max(10, Math.floor(tileBudgetCfg.landusePerTile * 0.55)),
    minPerTile: Math.max(4, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.5)),
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting,
    spreadAcrossArea: true,
    coreRatio: 0.45,
    compareFn: (a, b) =>
      linearFeaturePriority('footway', classifyLinearFeatureTags(b.tags)?.subtype) -
      linearFeaturePriority('footway', classifyLinearFeatureTags(a.tags)?.subtype)
  }) : [];

  const allCyclewayWays = enableLinearFeatures ? data.elements.filter((element) =>
    element.type === 'way' &&
    classifyLinearFeatureTags(element.tags)?.kind === 'cycleway'
  ) : [];
  const cyclewayWays = enableLinearFeatures ? limitWaysByTileBudget(allCyclewayWays, nodes, {
    globalCap: Math.max(110, Math.floor(maxLanduseWays * 0.45)),
    basePerTile: Math.max(8, Math.floor(tileBudgetCfg.landusePerTile * 0.36)),
    minPerTile: Math.max(3, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.32)),
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting,
    spreadAcrossArea: true,
    coreRatio: 0.45,
    compareFn: (a, b) =>
      linearFeaturePriority('cycleway', classifyLinearFeatureTags(b.tags)?.subtype) -
      linearFeaturePriority('cycleway', classifyLinearFeatureTags(a.tags)?.subtype)
  }) : [];

  const allStructureConnectorWays = data.elements.filter((element) => {
    if (element.type !== 'way') return false;
    const classification = classifyLinearFeatureTags(element.tags, { force: true });
    if (!classification || classification.kind !== 'footway') return false;
    const semantics = classifyStructureSemantics(element.tags || {}, {
      featureKind: classification.kind,
      subtype: classification.subtype
    });
    return semantics.gradeSeparated || semantics.skywalk;
  });
  const structureConnectorWays = limitWaysByTileBudget(allStructureConnectorWays, nodes, {
    globalCap: Math.max(36, Math.floor(tileBudgetCfg.landusePerTile * 1.4)),
    basePerTile: Math.max(3, Math.floor(tileBudgetCfg.landusePerTile * 0.16)),
    minPerTile: 1,
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting,
    compareFn: (a, b) => {
      const aSemantics = classifyStructureSemantics(a.tags || {}, { featureKind: 'footway', subtype: a.tags?.highway || '' });
      const bSemantics = classifyStructureSemantics(b.tags || {}, { featureKind: 'footway', subtype: b.tags?.highway || '' });
      const aScore = aSemantics.skywalk ? 4 : aSemantics.gradeSeparated ? 3 : 1;
      const bScore = bSemantics.skywalk ? 4 : bSemantics.gradeSeparated ? 3 : 1;
      return bScore - aScore;
    }
  });

  const allTreeNodes = data.elements.filter((element) =>
    element.type === 'node' &&
    element.tags?.natural === 'tree'
  );
  const treeNodes = limitNodesByTileBudget(allTreeNodes, {
    globalCap: maxTreeNodes,
    basePerTile: Math.max(6, Math.floor(tileBudgetCfg.landusePerTile * 0.22)),
    minPerTile: Math.max(2, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.18)),
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting
  });

  const allTreeRowWays = data.elements.filter((element) =>
    element.type === 'way' &&
    element.tags?.natural === 'tree_row'
  );
  const treeRowWays = limitWaysByTileBudget(allTreeRowWays, nodes, {
    globalCap: maxTreeRowWays,
    basePerTile: Math.max(3, Math.floor(tileBudgetCfg.landusePerTile * 0.14)),
    minPerTile: 1,
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting,
    spreadAcrossArea: true,
    coreRatio: 0.5
  });

  const allPoiNodes = data.elements.filter((element) =>
    element.type === 'node' &&
    !!poiKeyFromTags(element.tags)
  );
  const poiNodes = limitNodesByTileBudget(allPoiNodes, {
    globalCap: maxPoiNodes,
    basePerTile: tileBudgetCfg.poiPerTile,
    minPerTile: tileBudgetCfg.poiMinPerTile,
    tileDegrees: tileBudgetCfg.tileDegrees,
    useRdt: useRdtBudgeting
  });

  loadMetrics.roads.requested = allRoadWays.length;
  loadMetrics.roads.selected = roadWays.length;
  loadMetrics.buildings.requested = allBuildingWays.length;
  loadMetrics.buildings.selected = buildingWays.length;
  loadMetrics.landuse.requested = allLanduseWays.length;
  loadMetrics.landuse.selected = landuseWays.length;
  loadMetrics.linearFeatures.railway.requested = allRailwayWays.length;
  loadMetrics.linearFeatures.railway.selected = railwayWays.length;
  loadMetrics.linearFeatures.footway.requested = allFootwayWays.length;
  loadMetrics.linearFeatures.footway.selected = footwayWays.length;
  loadMetrics.linearFeatures.cycleway.requested = allCyclewayWays.length;
  loadMetrics.linearFeatures.cycleway.selected = cyclewayWays.length;
  loadMetrics.vegetation.treesRequested = allTreeNodes.length;
  loadMetrics.vegetation.treesSelected = treeNodes.length;
  loadMetrics.vegetation.treeRowsRequested = allTreeRowWays.length;
  loadMetrics.vegetation.treeRowsSelected = treeRowWays.length;
  loadMetrics.pois.requested = allPoiNodes.length;
  loadMetrics.pois.selected = poiNodes.length;
  loadMetrics.waterways = {
    requested: allWaterwayWays.length,
    selected: waterwayWays.length
  };

  const worldSurfaceProfile = classifyWorldSurfaceProfile({
    centerLat: options.centerLat,
    landuseWays,
    waterwayWays
  });
  loadMetrics.surfaceProfile = {
    reason: worldSurfaceProfile.reason,
    terrainModeHint: worldSurfaceProfile.terrainModeHint,
    waterModeHint: worldSurfaceProfile.waterModeHint,
    absLat: Number(worldSurfaceProfile.absLat?.toFixed?.(2) || worldSurfaceProfile.absLat || 0),
    signals: worldSurfaceProfile.signals?.normalized || {}
  };
  setWorldSurfaceProfile(worldSurfaceProfile);
  appCtx.osmTreeNodes = treeNodes;
  appCtx.osmTreeRows = treeRowWays;

  return {
    roadWays,
    buildingWays,
    landuseWays,
    waterwayWays,
    railwayWays,
    footwayWays,
    cyclewayWays,
    structureConnectorWays,
    treeNodes,
    treeRowWays,
    poiNodes,
    worldSurfaceProfile,
    requestedCounts: {
      roads: allRoadWays.length,
      buildings: allBuildingWays.length,
      landuse: allLanduseWays.length,
      pois: allPoiNodes.length
    }
  };
}

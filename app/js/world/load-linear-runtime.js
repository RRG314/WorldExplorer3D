import {
  publishLinearFeaturePresentation
} from './linear-feature-presentation.js?v=1';
import {normalizeTransportSource} from './compiler/transport-source-normalizer.js?v=4';
import {publishedRoadSourceTopology} from './road-source-topology.js';

export function shouldOmitUnmatchedElevatedPedestrianFeature(
  classification,
  structureSemantics,
  runtimeOptions = {}
) {
  if (classification?.kind !== 'footway') return false;
  if (structureSemantics?.terrainMode !== 'elevated') return false;

  // A standalone OSM footway/steps bridge rarely carries enough vertical
  // information to reconstruct a trustworthy 3D structure. In steep or
  // multi-level cities, rendering those fragments independently fabricated
  // disconnected skywalks and arbitrarily tall supports. Only a future
  // vehicle-bridge matcher may opt a pedestrian feature back in after it has
  // positively associated the full path with a compiled road-bridge chain.
  return runtimeOptions.matchedVehicleBridge === true ? false : true;
}

export function createLinearFeatureRuntime(options = {}) {
  const {
    appCtx,
    applyBuildingContextSemanticsToFeature,
    buildFeatureRibbonEdges,
    classifyLinearFeatureTags,
    classifyStructureSemantics,
    cloneStructureSemantics,
    decimatePoints,
    enableLinearFeatures = false,
    linearFeatureVisualSpec,
    polylineBounds,
    refreshStructureAwareFeatureProfiles,
    sanitizeWorldPathPoints,
    updateFeatureSurfaceProfile,
    worldBaseTerrainY
  } = options;

  function addLinearFeatureRecord(pts, tags, runtimeOptions = {}) {
    if (!enableLinearFeatures) return false;
    if (!pts || pts.length < 2) return false;

    const classification = classifyLinearFeatureTags(tags, runtimeOptions);
    if (!classification) return false;

    const centerline = decimatePoints(pts, classification.kind === 'railway' ? 900 : 700, false);
    if (centerline.length < 2) return false;

    const spec = linearFeatureVisualSpec(classification, tags);
    const structureSemantics = classifyStructureSemantics(tags || {}, {
      featureKind: classification.kind,
      subtype: classification.subtype
    });
    if (shouldOmitUnmatchedElevatedPedestrianFeature(
      classification,
      structureSemantics,
      runtimeOptions
    )) return false;
    const sourceFeatureId=String(tags?._sourceFeatureId || tags?.sourceFeatureId || '');
    const transportRecord=sourceFeatureId?normalizeTransportSource({
      sourceId:sourceFeatureId,
      providerNamespace:sourceFeatureId.startsWith('shortbread:')?'shortbread':'osm',
      completeness:sourceFeatureId.startsWith('shortbread:')?'generalized':'lossless',
      incomplete:runtimeOptions.incomplete===true,
      geometryProvenance:sourceFeatureId.startsWith('shortbread:')?'shortbread-v1':'osm-overpass'
    },tags):null;
    const sourceTopologyNodes=publishedRoadSourceTopology(
      runtimeOptions.sourceNodes || [],runtimeOptions.sourcePoints || pts,centerline);
    const feature = {
      kind: classification.kind,
      subtype: classification.subtype,
      sourceTags: { ...(tags || {}) },
      crossingNodes: runtimeOptions.crossingNodes || [],
      networkKind: classification.kind,
      name: String(tags?.name || '').trim(),
      sourceFeatureId,
      transportRecord,
      sourceNodeIds:Object.freeze(sourceTopologyNodes.map(node=>node.id)),
      sourceTopologyNodes,
      width: spec.width,
      bias: spec.bias,
      surfaceBias: spec.bias,
      pts: centerline,
      walkable: true,
      driveable: false,
      structureSemantics,
      baseStructureSemantics: cloneStructureSemantics(structureSemantics),
      structureTags: {
        bridge: tags?.bridge || '',
        tunnel: tags?.tunnel || '',
        layer: tags?.layer || '',
        level: tags?.level || '',
        placement: tags?.placement || '',
        ramp: tags?.ramp || '',
        covered: tags?.covered || '',
        indoor: tags?.indoor || '',
        location: tags?.location || '',
        min_height: tags?.min_height || '',
        man_made: tags?.man_made || ''
      },
      bounds: polylineBounds(centerline, spec.width * 0.5 + 12),
      isStructureConnector: runtimeOptions.force === true
    };

    applyBuildingContextSemanticsToFeature(feature);
    feature.isStructureConnector =
      runtimeOptions.force === true &&
      feature?.structureSemantics?.physicalStructureEvidence === true &&
      (feature?.structureSemantics?.gradeSeparated || feature?.structureSemantics?.skywalk === true);
    if (runtimeOptions.force === true && !feature.isStructureConnector) return false;

    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, { surfaceBias: spec.bias });
    appCtx.linearFeatures.push(feature);

    // This record feeds navigation and the resident pavement area compiler.
    // The publication pass below provides coarse paths outside that coverage.
    return true;
  }

  function buildImmediateLinearFeatureDataPass(runtimeOptions = {}) {
    const {
      cyclewayWays,
      endLoadPhase,
      footwayWays,
      geometryGuards,
      nodes,
      railwayWays,
      startLoadPhase,
      structureConnectorWays,
      deferStructureRefresh = false
    } = runtimeOptions;

    const hasImmediateLinearFeatures = [railwayWays, cyclewayWays, footwayWays, structureConnectorWays]
      .some((ways) => Array.isArray(ways) && ways.length > 0);
    if (!hasImmediateLinearFeatures) return 0;

    if (!deferStructureRefresh) refreshStructureAwareFeatureProfiles();
    const initialFeatureCount = appCtx.linearFeatures.length;
    startLoadPhase('buildLinearFeatureData');
    const linearFeatureGroups = [
      { ways: railwayWays, force: false, alwaysVisible: false },
      { ways: cyclewayWays, force: false, alwaysVisible: false },
      { ways: footwayWays, force: false, alwaysVisible: false },
      { ways: structureConnectorWays, force: true, alwaysVisible: true }
    ];

    const publishedWays=new Set();
    linearFeatureGroups.forEach((group) => {
      const featureWays = group.ways;
      if (!Array.isArray(featureWays) || featureWays.length === 0) return;
      featureWays.forEach((way) => {
        const identity=String(way.tags?._sourceFeatureId || way.sourceId || way.id);
        if(publishedWays.has(identity))return;
        const sourceNodes=way.nodes.map(id=>nodes[id]).filter(Boolean);
        const rawPts = sourceNodes
          .map((node) => appCtx.geoToWorld(node.lat, node.lon));
        const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
        if (pts.length < 2) return;
        const added=addLinearFeatureRecord(pts, { ...(way.tags || {}), sourceFeatureId: identity }, {
          sourceNodes,sourcePoints:rawPts,incomplete:sourceNodes.length!==way.nodes.length,
          crossingNodes: way.nodes.map(id => nodes[id]).filter(n => n?.tags?.kerb || n?.tags?.highway === 'crossing').map(n => ({ ...appCtx.geoToWorld(n.lat,n.lon), kerb:n.tags.kerb, tags:{...n.tags} })),
          force: group.force === true,
          alwaysVisible: group.alwaysVisible === true
        });
        if(added)publishedWays.add(identity);
      });
    });

    publishLinearFeaturePresentation({
      appCtx,
      buildFeatureRibbonEdges,
      features: appCtx.linearFeatures.slice(initialFeatureCount),
      worldBaseTerrainY
    });
    if (!deferStructureRefresh) refreshStructureAwareFeatureProfiles();
    if (!deferStructureRefresh && typeof appCtx.rebuildStructureVisualMeshes === 'function') {
      appCtx.rebuildStructureVisualMeshes();
    }
    endLoadPhase('buildLinearFeatureData');
    return appCtx.linearFeatures.length - initialFeatureCount;
  }

  return {
    addLinearFeatureRecord,
    buildImmediateLinearFeatureDataPass
  };
}

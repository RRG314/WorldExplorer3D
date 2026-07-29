import {
  publishLinearFeaturePresentation
} from './linear-feature-presentation.js?v=1';

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
    const feature = {
      kind: classification.kind,
      subtype: classification.subtype,
      networkKind: classification.kind,
      name: String(tags?.name || '').trim(),
      sourceFeatureId: tags?.sourceFeatureId ? String(tags.sourceFeatureId) : '',
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
      (feature?.structureSemantics?.gradeSeparated || feature?.structureSemantics?.skywalk === true);
    if (runtimeOptions.force === true && !feature.isStructureConnector) return false;

    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, { surfaceBias: spec.bias });
    appCtx.linearFeatures.push(feature);

    // Navigation and physical surface semantics are data. The legacy ribbons
    // exposed raw mapped walking paths as competing world geometry. That
    // presentation owner has been deleted; this module publishes data only.
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

    linearFeatureGroups.forEach((group) => {
      const featureWays = group.ways;
      if (!Array.isArray(featureWays) || featureWays.length === 0) return;
      featureWays.forEach((way) => {
        const rawPts = way.nodes
          .map((id) => nodes[id])
          .filter((node) => node)
          .map((node) => appCtx.geoToWorld(node.lat, node.lon));
        const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
        if (pts.length < 2) return;
        addLinearFeatureRecord(pts, { ...(way.tags || {}), sourceFeatureId: way.id ? String(way.id) : '' }, {
          force: group.force === true,
          alwaysVisible: group.alwaysVisible === true
        });
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

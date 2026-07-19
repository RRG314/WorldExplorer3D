import { appendUpwardRibbonGeometry } from "../road-render.js?v=2";

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
    syncLinearFeatureOverlayVisibility,
    updateFeatureSurfaceProfile,
    worldBaseTerrainY
  } = options;

  function addLinearFeatureRibbon(pts, tags, runtimeOptions = {}) {
    if (!enableLinearFeatures) return false;
    if (!pts || pts.length < 2) return false;

    const classification = classifyLinearFeatureTags(tags, runtimeOptions);
    if (!classification) return false;

    const centerline = decimatePoints(pts, classification.kind === 'railway' ? 900 : 700, false);
    if (centerline.length < 2) return false;

    const spec = linearFeatureVisualSpec(classification, tags);
    const halfWidth = spec.width * 0.5;
    const verts = [];
    const indices = [];
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
    const ribbonEdges = buildFeatureRibbonEdges(feature, centerline, halfWidth, worldBaseTerrainY, {
      surfaceBias: spec.bias
    });

    appendUpwardRibbonGeometry(ribbonEdges.leftEdge, ribbonEdges.rightEdge, verts, indices);

    if (verts.length < 12 || indices.length < 6) return false;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.emissive,
      emissiveIntensity: spec.emissiveIntensity,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: false,
      opacity: spec.opacity,
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    mesh.receiveShadow = false;
    mesh.userData.isLinearFeatureLine = true;
    mesh.userData.linearFeatureCenterline = centerline;
    mesh.userData.linearFeatureKind = classification.kind;
    mesh.userData.linearFeatureSubtype = classification.subtype;
    mesh.userData.linearFeatureWidth = spec.width;
    mesh.userData.linearFeatureBias = spec.bias;
    mesh.userData.linearFeatureRef = feature;
    mesh.userData.structureSemantics = structureSemantics;
    mesh.userData.structureConnector = runtimeOptions.force === true;
    mesh.visible = runtimeOptions.alwaysVisible === true ? true : appCtx.showPathOverlays !== false;

    appCtx.scene.add(mesh);
    appCtx.linearFeatureMeshes.push(mesh);
    appCtx.linearFeatures.push(feature);
    return true;
  }

  function buildImmediateLinearFeatureGeometryPass(runtimeOptions = {}) {
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
    startLoadPhase('buildLinearFeatureGeometry');
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
        addLinearFeatureRibbon(pts, { ...(way.tags || {}), sourceFeatureId: way.id ? String(way.id) : '' }, {
          force: group.force === true,
          alwaysVisible: group.alwaysVisible === true
        });
      });
    });

    if (!deferStructureRefresh) refreshStructureAwareFeatureProfiles();
    syncLinearFeatureOverlayVisibility();
    if (!deferStructureRefresh && typeof appCtx.rebuildStructureVisualMeshes === 'function') {
      appCtx.rebuildStructureVisualMeshes();
    }
    endLoadPhase('buildLinearFeatureGeometry');
    return appCtx.linearFeatureMeshes.length;
  }

  return {
    addLinearFeatureRibbon,
    buildImmediateLinearFeatureGeometryPass
  };
}

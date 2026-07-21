import { appendUpwardRibbonGeometry } from "../road-render.js?v=2";

function buildMappedPedestrianBatch(appCtx, candidates, subtype) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;
  for (const mesh of candidates) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(
        normal ? normal.getX(i) : 0,
        normal ? normal.getY(i) : 1,
        normal ? normal.getZ(i) : 0
      );
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i += 1) {
        indices.push(vertexOffset + geometry.index.getX(i));
      }
    } else {
      for (let i = 0; i < position.count; i += 1) indices.push(vertexOffset + i);
    }
    vertexOffset += position.count;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = candidates[0].material.clone();
  const batch = new THREE.Mesh(geometry, material);
  batch.renderOrder = 2;
  batch.receiveShadow = false;
  batch.frustumCulled = false;
  batch.userData.isLinearFeatureLine = true;
  batch.userData.isLinearFeatureBatch = true;
  batch.userData.alwaysMappedPedestrian = true;
  batch.userData.linearFeatureKind = 'footway';
  batch.userData.linearFeatureSubtype = subtype;
  batch.userData.linearSurfaceMode = candidates[0]?.userData?.linearSurfaceMode || 'pavement';
  batch.userData.batchCount = candidates.length;
  batch.visible = true;
  appCtx.scene.add(batch);
  return { batch, vertexCount: vertexOffset };
}

function batchMappedPedestrianMeshes(appCtx, startIndex) {
  const addedMeshes = appCtx.linearFeatureMeshes.slice(startIndex);
  const candidates = addedMeshes.filter((mesh) =>
    mesh?.userData?.alwaysMappedPedestrian === true &&
    mesh?.userData?.structureConnector !== true &&
    mesh.geometry?.attributes?.position
  );
  if (candidates.length < 2) return candidates.length;

  const groups = new Map();
  candidates.forEach((mesh) => {
    const subtype = String(mesh.userData.linearFeatureSubtype || 'footway');
    const surfaceMode = String(mesh.userData.linearSurfaceMode || 'pavement');
    const key = `${subtype}:${surfaceMode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  });

  const batches = [];
  const batchedMeshes = [];
  let vertexCount = 0;
  groups.forEach((group) => {
    if (group.length < 2) return;
    const subtype = String(group[0]?.userData?.linearFeatureSubtype || 'footway');
    const built = buildMappedPedestrianBatch(appCtx, group, subtype);
    batches.push(built.batch);
    batchedMeshes.push(...group);
    vertexCount += built.vertexCount;
  });
  const candidateSet = new Set(batchedMeshes);
  for (const mesh of batchedMeshes) {
    mesh.parent?.remove(mesh);
    mesh.geometry?.dispose?.();
    mesh.material?.dispose?.();
  }
  const retained = addedMeshes.filter((mesh) => !candidateSet.has(mesh));
  appCtx.linearFeatureMeshes.splice(startIndex, addedMeshes.length, ...batches, ...retained);
  appCtx._lastPedestrianBatchStats = {
    sourceMeshCount: batchedMeshes.length,
    batchMeshCount: batches.length,
    vertexCount
  };
  return batchedMeshes.length;
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

    const explicitSurface = String(tags?.surface || '').toLowerCase();
    const pavedSurface = /^(asphalt|concrete|paved|paving_stones|sett|cobblestone)$/.test(explicitSurface);
    const naturalPath = classification.subtype === 'path' && !pavedSurface;
    const surfaceMode = naturalPath ? 'soil' : 'pavement';
    const surfaceTextures = appCtx.surfaceTextureSets?.[surfaceMode] || (surfaceMode === 'pavement' ? {
      map: appCtx.pavementDiffuse,
      normalMap: appCtx.pavementNormal,
      roughnessMap: appCtx.pavementRoughness
    } : null);
    const surfaceTint = naturalPath ? 0xb19a76 : classification.subtype === 'crossing' ? 0x9fa2a3 : 0xb8b4ae;
    const textureScale = naturalPath ? 4.5 : 3.2;
    const position = geometry.attributes.position;
    const uvs = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
      uvs[i * 2] = position.getX(i) / textureScale;
      uvs[i * 2 + 1] = position.getZ(i) / textureScale;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const material = new THREE.MeshStandardMaterial({
      color: surfaceTextures?.map ? surfaceTint : spec.color,
      map: surfaceTextures?.map || null,
      normalMap: surfaceTextures?.normalMap || null,
      roughnessMap: surfaceTextures?.roughnessMap || null,
      normalScale: surfaceTextures?.normalMap ? new THREE.Vector2(0.22, 0.22) : undefined,
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
    mesh.userData.linearSurfaceMode = surfaceMode;
    mesh.userData.linearFeatureWidth = spec.width;
    mesh.userData.linearFeatureBias = spec.bias;
    mesh.userData.linearFeatureRef = feature;
    mesh.userData.structureSemantics = structureSemantics;
    mesh.userData.structureConnector = runtimeOptions.force === true;
    mesh.userData.alwaysMappedPedestrian = classification.kind === 'footway';
    mesh.visible = mesh.userData.alwaysMappedPedestrian || runtimeOptions.alwaysVisible === true || appCtx.showPathOverlays !== false;

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
    const initialMeshCount = appCtx.linearFeatureMeshes.length;
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

    batchMappedPedestrianMeshes(appCtx, initialMeshCount);

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

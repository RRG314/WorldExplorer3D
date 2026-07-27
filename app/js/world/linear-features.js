export function scheduleDeferredWorldLinearFeatureLoad(options = {}) {
  const {
    enabled = false,
    isActiveLoadContext,
    overpassTimeoutMs = 0,
    deferredLinearFeatureQuery = '',
    fetchOverpassJSON,
    classifyLinearFeatureTags,
    limitWaysByTileBudget,
    tileBudgetCfg,
    useRdtBudgeting = false,
    linearFeaturePriority,
    geometryGuards,
    geoToWorld,
    sanitizeWorldPathPoints,
    addLinearFeatureRecord,
    startLoadPhase,
    endLoadPhase,
    rebuildStructureVisualMeshes,
    invalidateTraversalNetworks,
    buildTraversalNetworks,
    safeLoadCall,
    updateWorldLod,
    recordLoadWarning
  } = options;

  if (!enabled) return;

  globalThis.setTimeout(async () => {
    if (typeof isActiveLoadContext === 'function' && !isActiveLoadContext()) return;
    try {
      const extendedDeadline = performance.now() + Math.max(12000, Math.min(overpassTimeoutMs, 18000));
      const linearData = await fetchOverpassJSON(
        deferredLinearFeatureQuery,
        Math.min(overpassTimeoutMs, 18000),
        extendedDeadline,
        null
      );
      if (typeof isActiveLoadContext === 'function' && !isActiveLoadContext()) return;

      const linearNodes = {};
      linearData.elements
        .filter((element) => element.type === 'node')
        .forEach((node) => { linearNodes[node.id] = node; });

      const buildLinearWays = (kind, budgetConfig) => {
        const allWays = linearData.elements.filter((element) =>
          element.type === 'way' &&
          classifyLinearFeatureTags(element.tags)?.kind === kind
        );
        return limitWaysByTileBudget(allWays, linearNodes, {
          ...budgetConfig,
          tileDegrees: tileBudgetCfg.tileDegrees,
          useRdt: useRdtBudgeting,
          compareFn: (a, b) =>
            linearFeaturePriority(kind, classifyLinearFeatureTags(b.tags)?.subtype) -
            linearFeaturePriority(kind, classifyLinearFeatureTags(a.tags)?.subtype)
        });
      };

      const railwayWays = buildLinearWays('railway', {
        globalCap: 24,
        basePerTile: Math.max(3, Math.floor(tileBudgetCfg.roadsPerTile * 0.08)),
        minPerTile: 1
      });
      const footwayWays = buildLinearWays('footway', {
        globalCap: 80,
        basePerTile: Math.max(6, Math.floor(tileBudgetCfg.landusePerTile * 0.18)),
        minPerTile: 2
      });
      const cyclewayWays = buildLinearWays('cycleway', {
        globalCap: 40,
        basePerTile: Math.max(4, Math.floor(tileBudgetCfg.landusePerTile * 0.12)),
        minPerTile: 1
      });

      startLoadPhase('buildLinearFeatureDataDeferred');
      try {
        [railwayWays, cyclewayWays, footwayWays].forEach((featureWays) => {
          if (!Array.isArray(featureWays) || featureWays.length === 0) return;
          featureWays.forEach((way) => {
            const rawPts = way.nodes
              .map((id) => linearNodes[id])
              .filter((node) => node)
              .map((node) => geoToWorld(node.lat, node.lon));
            const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
            if (pts.length < 2) return;
            addLinearFeatureRecord(pts, { ...(way.tags || {}), sourceFeatureId: way.id ? String(way.id) : '' });
          });
        });
      } finally {
        endLoadPhase('buildLinearFeatureDataDeferred');
      }

      if (typeof rebuildStructureVisualMeshes === 'function') {
        rebuildStructureVisualMeshes();
      }
      invalidateTraversalNetworks('deferred_linear_features_ready');
      safeLoadCall('buildTraversalNetworksDeferred', () => buildTraversalNetworks());
      if (typeof updateWorldLod === 'function') {
        safeLoadCall('updateWorldLodDeferred', () => updateWorldLod(true));
      }
      console.log(
        `[WorldLoad] Deferred linear features ready (${railwayWays.length} rail, ${footwayWays.length} foot, ${cyclewayWays.length} cycle).`
      );
    } catch (err) {
      recordLoadWarning('deferredLinearFeatures', err);
    }
  }, 0);
}

export function scheduleDeferredStructureRefresh(options = {}) {
  const roads = Array.isArray(options.roads) ? options.roads : [];
  if (!roads.some((road) => road?.structureSemantics?.gradeSeparated)) return;

  const run = () => {
    if (typeof options.isActiveLoadContext === 'function' && !options.isActiveLoadContext()) return;
    options.startLoadPhase?.('refreshStructureGeometryDeferred');
    try {
      options.refreshStructureAwareFeatureProfiles?.();
      options.rebuildStructureVisualMeshes?.();
    } catch (err) {
      options.recordLoadWarning?.('refreshStructureGeometryDeferred', err);
    } finally {
      options.endLoadPhase?.('refreshStructureGeometryDeferred');
    }
  };

  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(run, { timeout: 2200 });
  } else {
    globalThis.setTimeout(run, 400);
  }
}

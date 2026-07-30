import { ctx as appCtx } from "../shared-context.js?v=55";
import { mergeBuildingMetadata } from "./building-metadata.js?v=1";
import { supplementSparseBuildingData } from "./inferred-building-footprints.js?v=2";
import { createBuildingProvenanceSnapshot } from './building-provenance-model.js?v=1';

function buildingDataPriority(way) {
  const tags = way?.tags || {};
  let score = tags._geometrySource === 'overture' ? 2 : 0;
  if (tags.height || tags['building:levels']) score += 4;
  if (tags['building:part']) score += 3;
  if (tags['roof:shape'] || tags['roof:height']) score += 1;
  return score;
}

async function fetchBuildingMetadata(options, metadataState) {
  if (!options.fetchPreferredMetadata && !(options.metadataQuery && typeof options.fetchOverpassJSON === 'function')) {
    return null;
  }
  try {
    let metadata = null;
    if (options.fetchPreferredMetadata) {
      try {
        metadata = await options.fetchPreferredMetadata();
      } catch (preferredMetadataErr) {
        options.recordLoadWarning?.('bundled building metadata', preferredMetadataErr);
      }
    }
    if (!metadata) {
      metadata = await options.fetchOverpassJSON(
        options.metadataQuery,
        options.metadataTimeoutMs || options.timeoutMs,
        options.metadataDeadlineMs || options.deadlineMs,
        options.metadataCacheMeta
      );
    }
    metadataState.status = 'ready';
    return metadata;
  } catch (metadataErr) {
    metadataState.status = 'error';
    metadataState.error = metadataErr?.message || String(metadataErr);
    options.recordLoadWarning?.('building metadata enrichment', metadataErr);
    return null;
  }
}

function setBuildingDetailState(status, extra = {}) {
  appCtx.worldDetailState ||= {};
  appCtx.worldDetailState.buildings = {
    status,
    updatedAt: Date.now(),
    ...extra
  };
}

export async function loadBuildingDetailForPublication(options = {}) {
  const query = String(options.query || '');
  const isActiveLoadContext = typeof options.isActiveLoadContext === 'function' ? options.isActiveLoadContext : () => true;
  const fetchPreferredData = typeof options.fetchPreferredData === 'function' ? options.fetchPreferredData : null;
  if (!fetchPreferredData && (!query || typeof options.fetchOverpassJSON !== 'function')) {
    setBuildingDetailState('skipped');
    return appCtx.worldDetailState.buildings;
  }

  setBuildingDetailState('loading', { requested: 0, selected: 0 });
  if (!isActiveLoadContext()) {
    return { status: 'aborted', updatedAt: Date.now() };
  }
  const startedAt = performance.now();
  try {
      let metadataState = { status: 'skipped' };
      let data;
      try {
        data = fetchPreferredData ? await fetchPreferredData() : null;
      } catch (preferredErr) {
        options.recordLoadWarning?.('vector building detail', preferredErr);
      }
      const authoritativeMassing = data?._overpassSource === 'overture-buildings-pmtiles';
      if (data && !authoritativeMassing) {
        const metadata = await fetchBuildingMetadata(options, metadataState);
        if (!isActiveLoadContext()) return;
        if (metadata) {
          mergeBuildingMetadata(data, metadata, {
            lat: options.location?.lat,
            lon: options.location?.lon
          });
        }
      }
      if (!data) {
        data = await options.fetchOverpassJSON(
          query,
          options.timeoutMs,
          options.deadlineMs,
          options.cacheMeta
        );
      }
      if (!isActiveLoadContext()) return;
      const inferredCoverage = supplementSparseBuildingData(data, appCtx);

      const nodes = {};
      for (const element of data.elements || []) {
        if (element?.type === 'node') nodes[element.id] = element;
      }
      const requested = (data.elements || []).filter((element) =>
        element?.type === 'way' && (element.tags?.building || element.tags?.['building:part'])
      );
      const provenancePublicationCap = Math.min(
        Number(options.maxBuildingWays) || 12000,
        12000
      );
      const buildingWays = options.limitWaysByTileBudget(requested, nodes, {
        globalCap: provenancePublicationCap,
        basePerTile: options.tileBudgetCfg.buildingsPerTile,
        minPerTile: options.tileBudgetCfg.buildingsMinPerTile,
        tileDegrees: options.tileBudgetCfg.tileDegrees,
        useRdt: options.useRdtBudgeting,
        spreadAcrossArea: true,
        coreRatio: options.useRdtBudgeting ? 0.35 : 0.45,
        compareFn: (a, b) => buildingDataPriority(b) - buildingDataPriority(a)
      });

      options.loadMetrics.buildings.requested = requested.length;
      options.loadMetrics.buildings.selected = buildingWays.length;
      options.loadMetrics.buildings.provenancePublicationCap = provenancePublicationCap;
      options.buildBuildingGeometryPass({
        buildingGeometryGuards: options.buildingGeometryGuards,
        buildingWays,
        featureMinPolygonArea: options.featureMinPolygonArea,
        loadMetrics: options.loadMetrics,
        lodThresholds: options.lodThresholds,
        nodes,
        pickBuildingBaseColor: options.pickBuildingBaseColor,
        rdtLoadComplexity: options.rdtLoadComplexity,
        registerBuildingCollision: options.registerBuildingCollision,
        sanitizeWorldFootprintPoints: options.sanitizeWorldFootprintPoints,
        showLoad: () => {},
        signedPolygonAreaXZ: options.signedPolygonAreaXZ,
        startLoadPhase: options.startLoadPhase,
        endLoadPhase: options.endLoadPhase,
        useRdtBudgeting: options.useRdtBudgeting
      });
      appCtx.buildingProvenanceModel = createBuildingProvenanceSnapshot(
        appCtx.buildingProvenanceRecords || []
      );
      if (!isActiveLoadContext()) return;

      options.refreshStructureAwareFeatureProfiles?.();
      appCtx.refreshTerrainSurfaceProfiles?.();
      appCtx.clearTerrainHeightCache?.();
      options.updateWorldLod?.(true);
      setBuildingDetailState('ready', {
        requested: requested.length,
        selected: buildingWays.length,
        meshes: appCtx.buildingMeshes.length,
        provenanceFeatures: appCtx.buildingProvenanceModel.featureCount,
        publicationDiagnostics: { ...(options.loadMetrics.buildingPublication || {}) },
        durationMs: Math.round(performance.now() - startedAt),
        source: data._overpassSource || null,
        endpoint: data._overpassEndpoint || null,
        metadata: data._buildingMetadata || metadataState,
        sourceDetails: data._overtureBuildings || data._shortbreadTiles || null,
        inferredCoverage
      });
  } catch (err) {
    options.recordLoadWarning?.('building publication', err);
    setBuildingDetailState('error', {
      durationMs: Math.round(performance.now() - startedAt),
      error: err?.message || String(err)
    });
  }
  return appCtx.worldDetailState?.buildings || {
    status: 'unknown',
    updatedAt: Date.now()
  };
}

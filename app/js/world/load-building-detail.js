import { ctx as appCtx } from "../shared-context.js?v=55";
import { mergeBuildingMetadata } from "./building-metadata.js?v=1";
import { supplementSparseBuildingData } from "./inferred-building-footprints.js?v=2";
import { createBuildingProvenanceSnapshot } from './building-provenance-model.js?v=1';
import {
  mappedWaterStructurePriority,
  mergeMappedWaterStructures
} from './water-structure-source.js?v=3';

const COMPLETE_BUILDING_TILE_CAP = 1200;

export function resolveBuildingPublicationSelection(options = {}) {
  const configuredGlobalCap = Math.max(1, Math.floor(Number(options.maxBuildingWays) || 12000));
  const configuredPerTile = Math.max(
    1,
    Math.floor(Number(options.tileBudgetCfg?.buildingsPerTile) || 1),
    Math.floor(Number(options.tileBudgetCfg?.buildingsMinPerTile) || 1)
  );
  return Object.freeze({
    globalCap: configuredGlobalCap,
    // Building geometry is already spatially batched and runtime-culled. Do
    // not apply the recursive-depth tile thinning used for roads and props:
    // that policy intentionally retained as little as 62% of dense tiles and
    // left visible holes between otherwise authoritative footprints.
    basePerTile: Math.max(configuredPerTile, COMPLETE_BUILDING_TILE_CAP),
    minPerTile: configuredPerTile,
    useRdt: false,
    spreadAcrossArea: true,
    // If the source still exceeds the device-scaled global ceiling, preserve
    // a contiguous center first and use the remainder for outer context.
    coreRatio: 0.78
  });
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
      if (authoritativeMassing && options.waterStructureQuery) {
        let waterStructureSummary = mergeMappedWaterStructures(
          data,
          options.mappedWaterStructureData,
          { lat: options.location?.lat, lon: options.location?.lon }
        );
        try {
          if (!waterStructureSummary.semanticVessels) {
            const semanticData = await options.fetchOverpassJSON(
              options.waterStructureQuery,
              options.waterStructureTimeoutMs || options.timeoutMs,
              options.waterStructureDeadlineMs || options.deadlineMs,
              options.waterStructureCacheMeta
            );
            waterStructureSummary = mergeMappedWaterStructures(data, semanticData, {
              lat: options.location?.lat,
              lon: options.location?.lon
            });
          }
        } catch (waterStructureError) {
          options.recordLoadWarning?.('mapped water structures', waterStructureError);
        }
      }
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
      const publicationSelection = resolveBuildingPublicationSelection(options);
      const provenancePublicationCap = publicationSelection.globalCap;
      const buildingWays = options.limitWaysByTileBudget(requested, nodes, {
        ...publicationSelection,
        tileDegrees: options.tileBudgetCfg.tileDegrees,
        // Vessels remain the only semantic exception to distance ordering.
        // Ordinary height/roof metadata must not displace closer buildings.
        compareFn: (a, b) =>
          mappedWaterStructurePriority(b?.tags || {}) - mappedWaterStructurePriority(a?.tags || {})
      });

      options.loadMetrics.buildings.requested = requested.length;
      options.loadMetrics.buildings.selected = buildingWays.length;
      options.loadMetrics.buildings.provenancePublicationCap = provenancePublicationCap;
      options.loadMetrics.buildings.publicationSelection = publicationSelection;
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
        selectionRetention: requested.length > 0 ? buildingWays.length / requested.length : 1,
        meshes: appCtx.buildingMeshes.length,
        provenanceFeatures: appCtx.buildingProvenanceModel.featureCount,
        publicationDiagnostics: { ...(options.loadMetrics.buildingPublication || {}) },
        coveragePolicy: {
          globalCap: publicationSelection.globalCap,
          basePerTile: publicationSelection.basePerTile,
          recursiveTileThinning: publicationSelection.useRdt,
          contiguousCoreRatio: publicationSelection.coreRatio
        },
        durationMs: Math.round(performance.now() - startedAt),
        source: data._overpassSource || null,
        endpoint: data._overpassEndpoint || null,
        metadata: data._buildingMetadata || metadataState,
        sourceDetails: data._overtureBuildings || data._shortbreadTiles || null,
        waterStructures: data._waterStructureSemantics || null,
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

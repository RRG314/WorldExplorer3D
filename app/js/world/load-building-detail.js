import { ctx as appCtx } from "../shared-context.js?v=55";
import { mergeBuildingMetadata } from "./building-metadata.js?v=2";
import { supplementSparseBuildingData } from "./inferred-building-footprints.js?v=2";
import {
  mappedWaterStructurePriority,
  mergeMappedWaterStructures
} from './water-structure-source.js?v=3';

const COMPLETE_BUILDING_TILE_CAP = 1200;
const BUILDING_COVERAGE_TARGET = 0.85;
const EXPANDED_COVERAGE_FLOOR = 9001;

function mappedBuildingHeightMeters(tags = {}) {
  const explicitHeight = Number.parseFloat(tags.height);
  if (Number.isFinite(explicitHeight)) return explicitHeight;
  const levels = Number.parseFloat(tags['building:levels']);
  return Number.isFinite(levels) ? levels * 3.2 : null;
}

export function buildingPublicationPriority(tags = {}) {
  if (mappedWaterStructurePriority(tags) > 0) return 1000000;
  const mappedHeight = mappedBuildingHeightMeters(tags);
  return Number.isFinite(mappedHeight) && mappedHeight >= 60
    ? 10000 + Math.min(2000, mappedHeight)
    : 0;
}

function buildingWayCenterWorld(way, nodes, geoToWorld) {
  const points = (way?.nodes || [])
    .map((id) => nodes[id])
    .filter((node) => Number.isFinite(Number(node?.lat)) && Number.isFinite(Number(node?.lon)))
    .map((node) => geoToWorld(Number(node.lat), Number(node.lon)))
    .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z)));
  if (points.length < 3) return null;
  if (points.length > 3) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) <= 1e-4) points.pop();
  }
  if (points.length < 3) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length
  };
}

export function constrainBuildingWaysToPublicationDomain(ways, nodes, options = {}) {
  const visibleRadiusWorld = Math.max(0, Number(options.visibleRadiusWorld) || 0);
  const geoToWorld = typeof options.geoToWorld === 'function' ? options.geoToWorld : appCtx.geoToWorld;
  if (!Array.isArray(ways) || visibleRadiusWorld <= 0 || typeof geoToWorld !== 'function') {
    return Object.freeze({ ways: Array.isArray(ways) ? ways : [], clipped: 0 });
  }
  const eligible = [];
  let clipped = 0;
  for (const way of ways) {
    const center = buildingWayCenterWorld(way, nodes, geoToWorld);
    if (center && Math.hypot(center.x, center.z) > visibleRadiusWorld) {
      clipped += 1;
      continue;
    }
    eligible.push(way);
  }
  return Object.freeze({ ways: eligible, clipped });
}

export function shouldFetchSupplementalWaterStructures(options = {}) {
  return options.authoritativeMassing === true &&
    options.providerAvailable !== false &&
    options.waterStructureQueryAvailable === true &&
    options.primaryCoverageComplete !== true &&
    Number(options.semanticVessels || 0) === 0;
}

export function resolveBuildingPublicationSelection(options = {}) {
  const configuredSafetyCap = Math.max(
    1,
    Math.floor(Number(options.maxBuildingWays) || 12000)
  );
  const requestedBuildingWays = Math.max(
    0,
    Math.floor(Number(options.requestedBuildingWays) || 0)
  );
  // Retain approximately 85% of mapped footprints. The one-feature floor
  // above the retired 9,000 cap ensures a dense source cannot silently fall
  // back to the exact coverage level the user rejected.
  const coverageTargetCap = requestedBuildingWays > 0
    ? Math.min(
        requestedBuildingWays,
        Math.max(
          requestedBuildingWays > 9000 ? EXPANDED_COVERAGE_FLOOR : 1,
          Math.ceil(requestedBuildingWays * BUILDING_COVERAGE_TARGET)
        )
      )
    : configuredSafetyCap;
  const configuredGlobalCap = Math.min(configuredSafetyCap, coverageTargetCap);
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
    coverageTarget: BUILDING_COVERAGE_TARGET,
    requestedBuildingWays,
    // Preserve the broad mapped district when a global cap is reached instead
    // of concentrating nearly every retained footprint in the center.
    coreRatio: 0.78
  });
}

async function fetchBuildingMetadata(options, metadataState, fetchOptions = {}) {
  if (!options.fetchPreferredMetadata && !(options.metadataQuery && typeof options.fetchOverpassJSON === 'function')) {
    return null;
  }
  try {
    let metadata = null;
    if (options.fetchPreferredMetadata) {
      try {
        metadata = await options.fetchPreferredMetadata();
      } catch (preferredMetadataErr) {
        if (preferredMetadataErr?.name === 'AbortError' || options.isActiveLoadContext?.() === false) {
          throw preferredMetadataErr;
        }
        options.recordLoadWarning?.('bundled building metadata', preferredMetadataErr);
      }
    }
    if (!metadata && fetchOptions.preferredOnly === true) {
      metadataState.status = 'skipped';
      metadataState.reason = 'no-compatible-cross-provider-metadata';
      return null;
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
    if (metadataErr?.name === 'AbortError' || options.isActiveLoadContext?.() === false) {
      throw metadataErr;
    }
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
  if (options.skipReason) {
    setBuildingDetailState('skipped', {
      reason: String(options.skipReason),
      requested: 0,
      selected: 0
    });
    return appCtx.worldDetailState.buildings;
  }
  const query = String(options.query || '');
  const isActiveLoadContext = typeof options.isActiveLoadContext === 'function' ? options.isActiveLoadContext : () => true;
  const fetchPreferredData = typeof options.fetchPreferredData === 'function' ? options.fetchPreferredData : null;
  const fetchFallbackData = typeof options.fetchFallbackData === 'function' ? options.fetchFallbackData : null;
  if (!fetchPreferredData && !fetchFallbackData && (!query || typeof options.fetchOverpassJSON !== 'function')) {
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
        if (preferredErr?.name === 'AbortError' || !isActiveLoadContext()) throw preferredErr;
        options.recordLoadWarning?.('vector building detail', preferredErr);
      }
      if (!data && fetchFallbackData) {
        try {
          data = await fetchFallbackData();
        } catch (fallbackErr) {
          if (fallbackErr?.name === 'AbortError' || !isActiveLoadContext()) throw fallbackErr;
          options.recordLoadWarning?.('generalized vector building fallback', fallbackErr);
        }
      }
      const authoritativeMassing = data?._overpassSource === 'overture-buildings-pmtiles';
      if (authoritativeMassing && options.waterStructureQuery) {
        let waterStructureSummary = mergeMappedWaterStructures(
          data,
          options.mappedWaterStructureData,
          { lat: options.location?.lat, lon: options.location?.lon }
        );
        try {
          if (shouldFetchSupplementalWaterStructures({
            authoritativeMassing,
            providerAvailable: options.overpassProviderAvailable,
            waterStructureQueryAvailable: true,
            primaryCoverageComplete: options.mappedWaterStructureCoverageComplete,
            semanticVessels: waterStructureSummary.semanticVessels
          })) {
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
          if (waterStructureError?.name === 'AbortError' || !isActiveLoadContext()) throw waterStructureError;
          options.recordLoadWarning?.('mapped water structures', waterStructureError);
        }
      }
      if (data) {
        // Geometry and mapped semantics are separate authorities. Overture may
        // own the footprint while a uniquely matched bundled OSM identity owns
        // missing height, level, roof, type, or name metadata. Live Overpass
        // metadata cannot be joined to Overture without a shared stable id, so
        // authoritative Overture massing uses only the curated bundled join.
        const metadata = await fetchBuildingMetadata(options, metadataState, {
          preferredOnly: authoritativeMassing
        });
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
      const publicationSource = String(data._overpassSource || 'unknown-building-source');
      appCtx.worldLoadRuntimeState ||= {};
      appCtx.worldLoadRuntimeState.publicationSources = {
        ...(appCtx.worldLoadRuntimeState.publicationSources || {}),
        buildings: publicationSource
      };
      appCtx.worldLoadRuntimeState.buildingProviderDecision = data._buildingProviderDecision || {
        selected: publicationSource,
        authority: 'explicit-publication-source',
        status: 'available',
        fallbackStarted: false
      };
      const inferredCoverage = supplementSparseBuildingData(data, appCtx);

      const nodes = {};
      for (const element of data.elements || []) {
        if (element?.type === 'node') nodes[element.id] = element;
      }
      const providerRequested = (data.elements || []).filter((element) =>
        element?.type === 'way' && (element.tags?.building || element.tags?.['building:part'])
      );
      // Vector providers fetch rectangular tile coverage. Publication owns a
      // circular fixed-location LOD domain, so clip the decoded rectangle with
      // the same footprint-center measurement used by the renderer before any
      // selection budget can be consumed by never-visible corner features.
      const publicationDomain = constrainBuildingWaysToPublicationDomain(
        providerRequested,
        nodes,
        {
          geoToWorld: appCtx.geoToWorld,
          visibleRadiusWorld: options.lodThresholds?.farVisible
        }
      );
      const requested = publicationDomain.ways;
      const publicationSelection = resolveBuildingPublicationSelection({
        ...options,
        requestedBuildingWays: requested.length
      });
      const provenancePublicationCap = publicationSelection.globalCap;
      const buildingWays = options.limitWaysByTileBudget(requested, nodes, {
        ...publicationSelection,
        tileDegrees: options.tileBudgetCfg.tileDegrees,
        // Mapped vessels and mapped tall-building identities are sparse,
        // authoritative skyline features. Preserve those mapped records before
        // distributing the remaining ordinary footprint budget by distance.
        compareFn: (a, b) =>
          buildingPublicationPriority(b?.tags || {}) - buildingPublicationPriority(a?.tags || {})
      });

      options.loadMetrics.buildings.providerRequested = providerRequested.length;
      options.loadMetrics.buildings.requested = requested.length;
      options.loadMetrics.buildings.selected = buildingWays.length;
      options.loadMetrics.buildings.publicationDomain = {
        authority: 'building-far-visible-lod',
        visibleRadiusWorld: Number(options.lodThresholds?.farVisible || 0),
        providerRequested: providerRequested.length,
        eligible: requested.length,
        clipped: publicationDomain.clipped
      };
      options.loadMetrics.buildings.provenancePublicationCap = provenancePublicationCap;
      options.loadMetrics.buildings.publicationSelection = publicationSelection;
      const buildingPublication = await options.buildBuildingGeometryPass({
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
      options.loadMetrics.buildings.geometryPublication = buildingPublication;
      if (!isActiveLoadContext()) return;

      // Terrain-dependent caches are invalidated here, but visibility,
      // provenance, traversal, and presentation publish exactly once in the
      // final world-publication owner after landmarks are also complete.
      appCtx.clearTerrainHeightCache?.();
      setBuildingDetailState('ready', {
        providerRequested: providerRequested.length,
        requested: requested.length,
        selected: buildingWays.length,
        selectionRetention: requested.length > 0 ? buildingWays.length / requested.length : 1,
        meshes: appCtx.buildingMeshes.length,
        provenanceFeatures: Array.isArray(appCtx.buildingProvenanceRecords)
          ? appCtx.buildingProvenanceRecords.length
          : 0,
        publicationDiagnostics: {
          ...(options.loadMetrics.buildingPublication || {}),
          buildingDimensions: { ...(options.loadMetrics.buildingDimensions || {}) }
        },
        coveragePolicy: {
          publicationDomain: options.loadMetrics.buildings.publicationDomain,
          globalCap: publicationSelection.globalCap,
          targetRatio: publicationSelection.coverageTarget,
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
    if (err?.name === 'AbortError' || !isActiveLoadContext()) throw err;
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

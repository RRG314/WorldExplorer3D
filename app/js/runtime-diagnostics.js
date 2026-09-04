import { ctx as appCtx } from "./shared-context.js?v=55";
import { getModelAssetRuntimeMetrics } from './assets/model-asset-runtime.js?v=1';

const diagnosticsParams = new URLSearchParams(globalThis.location?.search || '');
// Production-like local runs must behave exactly like the deployed build.
// Developer controls are available only through an explicit diagnostic URL;
// localhost by itself is not authorization to expose debug gameplay controls.
const developerDiagnosticsEnabled = diagnosticsParams.get('diagnostics') === '1';
appCtx.developerDiagnosticsEnabled = developerDiagnosticsEnabled;

const runtimeErrors = [];
function recordRuntimeError(kind, value) {
  const message = value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value?.message || value || "Unknown runtime error");
  const entry = { kind, message, at: Date.now() };
  if (runtimeErrors.some((existing) => existing.kind === kind && existing.message === message)) return;
  runtimeErrors.push(entry);
  if (runtimeErrors.length > 12) runtimeErrors.shift();
}
globalThis.addEventListener?.("error", (event) => recordRuntimeError("error", event.error || event.message));
globalThis.addEventListener?.("unhandledrejection", (event) => recordRuntimeError("unhandledrejection", event.reason));

function numberOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function compiledEndpointConnectionPublished(feature, endpoint) {
  const connected = feature?.connectedFeatures?.[endpoint];
  if (Array.isArray(connected) && connected.length > 0) return true;
  const total = Number(feature?.transportGraphRef?.totalDistance);
  if (!Number.isFinite(total)) return false;
  const tolerance = Math.max(0.2, Math.min(1.25, (Number(feature?.width) || 6) * 0.08));
  return (feature?.transportGraphRef?.stations || []).some((station) => {
    const distance = Number(station?.distanceAlong);
    if (!Number.isFinite(distance)) return false;
    return endpoint === 'start' ? distance <= tolerance : total - distance <= tolerance;
  });
}

function vectorSnapshot(vector) {
  if (!vector) return null;
  return {
    x: numberOrNull(vector.x),
    y: numberOrNull(vector.y),
    z: numberOrNull(vector.z)
  };
}

function spaceFlightSnapshot() {
  const rocket = appCtx.spaceFlight?.rocket;
  const travelSession = appCtx.getSpaceTravelSession?.() || null;
  const Vector3 = globalThis.THREE?.Vector3;
  const forward = rocket && Vector3 ? new Vector3(0, 1, 0).applyQuaternion(rocket.quaternion).normalize() : null;
  const up = rocket && Vector3 ? new Vector3(0, 0, -1).applyQuaternion(rocket.quaternion).normalize() : null;
  return {
    active: appCtx.spaceFlight?.active === true,
    controlMode: String(appCtx.spaceFlight?.mode || 'idle'),
    presentationAuthority: String(appCtx.spaceFlight?.presentationAuthority || 'classic'),
    travelSession: travelSession ? {
      active: travelSession.active === true,
      sequence: Number(travelSession.sequence || 0),
      activeCraftId: travelSession.activeCraftId || null,
      location: travelSession.location || null,
      phase: travelSession.phase || null,
      sourceBodyId: travelSession.sourceBodyId || null,
      destinationId: travelSession.destination?.id || null,
      guidance: travelSession.guidance || null,
      reason: travelSession.reason || null
    } : null,
    destinationBodyId: appCtx.spaceJourney?.destinationBodyId || appCtx.spaceFlight?.destination || null,
    phase: appCtx.spaceJourney?.phase || null,
    assist: appCtx.spaceJourneyAssistState ? {
      active: appCtx.spaceJourneyAssistState.active === true,
      available: appCtx.spaceJourneyAssistState.available !== false,
      kind: appCtx.spaceJourneyAssistState.kind || null,
      progress: numberOrNull(appCtx.spaceJourneyAssistState.progress)
    } : null,
    cameraMode: String(appCtx.spaceFlight?.cameraMode || 'chase'),
    earthLandingSelection: appCtx.getEarthLandingSelection?.() || null,
    vehiclePresentation: appCtx.getActiveSpaceCraftId?.() || rocket?.userData?.spaceCraftId || null,
    position: vectorSnapshot(rocket?.position),
    forward: vectorSnapshot(forward),
    up: vectorSnapshot(up)
  };
}

function transportFacilitySnapshot() {
  const graph = appCtx.transportFacilityGraph;
  const visual = appCtx.transportFacilityVisual?.group;
  if (!graph) return { active: false, recordCount: 0, aviation: 0, maritime: 0 };
  const taxiwayMarkings = [];
  visual?.traverse?.((object) => {
    if (object?.userData?.mappedAirportMarking !== true) return;
    taxiwayMarkings.push({
      visible: object.visible !== false,
      frustumCulled: object.frustumCulled === true,
      renderOrder: Number(object.renderOrder || 0),
      depthWrite: object.material?.depthWrite !== false,
      polygonOffset: object.material?.polygonOffset === true,
      polygonOffsetFactor: Number(object.material?.polygonOffsetFactor || 0),
      polygonOffsetUnits: Number(object.material?.polygonOffsetUnits || 0),
      boundsReady: Boolean(object.geometry?.boundingBox && object.geometry?.boundingSphere)
    });
  });
  return {
    active: true,
    authority: String(graph.authority || ''),
    bounded: graph.coverage?.bounded === true,
    recordCount: Number(graph.records?.length || 0),
    aviation: Number(graph.byDomain?.aviation?.length || 0),
    maritime: Number(graph.byDomain?.maritime?.length || 0),
    typeCounts: graph.diagnostics?.typeCounts || {},
    visualAttached: Boolean(visual?.parent),
    visualCount: Number(visual?.children?.length || 0),
    mappedOnly: (graph.records || []).every((record) => record.mapped === true && record.generatedActivity === false),
    taxiwayMarkings: {
      count: taxiwayMarkings.length,
      distanceStableCount: taxiwayMarkings.filter((marking) =>
        marking.visible && !marking.frustumCulled && marking.renderOrder >= 9 &&
        !marking.depthWrite && marking.polygonOffset &&
        marking.polygonOffsetFactor <= -4 && marking.polygonOffsetUnits <= -4 &&
        marking.boundsReady
      ).length
    }
  };
}

function cameraFollowSnapshot(activeActor) {
  const camera = appCtx.camera;
  const yaw = Number(activeActor?.orientation?.yaw);
  const actorX = Number(activeActor?.position?.x);
  const actorZ = Number(activeActor?.position?.z);
  const elements = camera?.matrixWorld?.elements;
  if (!camera || !Number.isFinite(yaw) || !Number.isFinite(actorX) ||
      !Number.isFinite(actorZ) || !elements?.length) return null;
  const actorForwardX = Math.sin(yaw);
  const actorForwardZ = Math.cos(yaw);
  const cameraForwardX = -Number(elements[8]);
  const cameraForwardZ = -Number(elements[10]);
  const cameraForwardLength = Math.hypot(cameraForwardX, cameraForwardZ);
  if (!(cameraForwardLength > 0.0001)) return null;
  const normalizedCameraX = cameraForwardX / cameraForwardLength;
  const normalizedCameraZ = cameraForwardZ / cameraForwardLength;
  const dot = Math.max(-1, Math.min(1,
    normalizedCameraX * actorForwardX + normalizedCameraZ * actorForwardZ
  ));
  const signedHeadingOffset = Math.atan2(
    actorForwardZ * normalizedCameraX - actorForwardX * normalizedCameraZ,
    dot
  );
  const cameraOffsetX = Number(camera.position?.x) - actorX;
  const cameraOffsetZ = Number(camera.position?.z) - actorZ;
  return {
    headingAlignmentDegrees: Number((Math.acos(dot) * 180 / Math.PI).toFixed(2)),
    signedHeadingOffsetDegrees: Number((signedHeadingOffset * 180 / Math.PI).toFixed(2)),
    trailingDistance: Number((-(cameraOffsetX * actorForwardX + cameraOffsetZ * actorForwardZ)).toFixed(2)),
    horizontalDistance: Number(Math.hypot(cameraOffsetX, cameraOffsetZ).toFixed(2))
  };
}

function safeCall(callback, fallback = null) {
  try {
    return callback();
  } catch {
    return fallback;
  }
}

function surfaceSampleSnapshot(sample) {
  if (!sample) return null;
  const feature = sample.feature || null;
  const featureId = String(feature?.sourceFeatureId || feature?.transportRecord?.identity || feature?.id || '');
  const assembly = feature?.transportStructureAssembly || null;
  const connectedEndpoints = ['start', 'end'].filter((endpoint) =>
    Array.isArray(feature?.connectedFeatures?.[endpoint]) &&
    feature.connectedFeatures[endpoint].length > 0
  );
  const connectedEndpointAbutments = (assembly?.abutments || []).filter((abutment) =>
    connectedEndpoints.includes(String(abutment?.endpoint || '').replace('_tie_in', ''))
  );
  const matchingStructureVisuals = featureId
    ? (appCtx.structureVisualMeshes || []).filter((mesh) =>
        Array.isArray(mesh?.userData?.structureFeatureIds) &&
        mesh.userData.structureFeatureIds.includes(featureId)
      )
    : [];
  return {
    kind: String(sample.kind || ""),
    y: numberOrNull(sample.position?.y),
    source: String(sample.provenance?.source || ""),
    dataset: String(sample.provenance?.dataset || ""),
    fallback: sample.provenance?.fallback === true,
    feature: feature
      ? {
          id: featureId,
          kind: String(feature.kind || feature.networkKind || feature.type || ""),
          name: String(feature.name || feature.tags?.name || ""),
          terrainMode: String(feature.structureSemantics?.terrainMode || ""),
          structureKind: String(feature.structureSemantics?.structureKind || ""),
          verticalOrder: numberOrNull(feature.structureSemantics?.verticalOrder),
          cutDepth: numberOrNull(feature.structureSemantics?.cutDepth),
          structureTags: feature.structureTags || null,
          transportSource: feature.transportRecord
            ? {
                identity: String(feature.transportRecord.identity || featureId),
                providerNamespace: String(feature.transportRecord.providerNamespace || ''),
                completeness: String(feature.transportRecord.completeness || ''),
                routeState: String(feature.transportRecord.routeState || '')
              }
            : null,
          graphStationCount: Number(feature.transportGraphRef?.stations?.length || 0),
          connectionCount: Number(feature.transportConnections?.length || 0),
          structureAssembly: assembly
            ? {
                authority: String(assembly.authority || ''),
                family: String(assembly.family || ''),
                publishBody: assembly.publishBody === true,
                bodyCoverage: numberOrNull(assembly.bodyCoverage),
                supportStationCount: Number(assembly.supportStations?.length || 0),
                terminalSupportCount: Number(assembly.terminalSupports?.length || 0),
                abutmentCount: Number(assembly.abutments?.length || 0),
                connectedEndpoints,
                connectedEndpointAbutmentCount: connectedEndpointAbutments.length
              }
            : null,
          structureVisual: {
            meshCount: matchingStructureVisuals.length,
            attachedMeshCount: matchingStructureVisuals.filter((mesh) => !!mesh?.parent).length,
            visibleMeshCount: matchingStructureVisuals.filter((mesh) => mesh?.visible !== false && !!mesh?.parent).length
          }
        }
      : null
  };
}

function terrainSourceSampleSnapshot(sample) {
  if (!sample) return null;
  return {
    type: String(sample.type || ''),
    schemaVersion: numberOrNull(sample.schemaVersion),
    status: String(sample.status || ''),
    available: sample.available === true,
    reason: sample.reason == null ? null : String(sample.reason),
    elevationMeters: numberOrNull(sample.elevationMeters),
    confidence: numberOrNull(sample.confidence),
    deliveryResolutionMeters:
      numberOrNull(sample.deliveryResolutionMeters),
    tile: sample.tile || null,
    provenance: sample.provenance || null
  };
}

function buildingSnapshot(building) {
  if (!building) return null;
  return {
    id: String(building.id || building.sourceFeatureId || ""),
    name: String(building.name || building.tags?.name || ""),
    type: String(building.buildingType || building.type || ""),
    collisionKind: String(building.collisionKind || ""),
    colliderDetail: String(building.colliderDetail || ""),
    baseY: numberOrNull(building.baseY),
    minY: numberOrNull(building.minY),
    maxY: numberOrNull(building.maxY),
    height: numberOrNull(building.height),
    allowsPassageBelow: building.allowsPassageBelow === true,
    collisionDisabled: building.collisionDisabled === true
  };
}

function mappedTallBuildingVisualSnapshot() {
  const visualsByIdentity = new Map();
  for (const mesh of appCtx.buildingMeshes || []) {
    if (!mesh) continue;
    const attached = !!mesh.parent;
    const visible = attached && mesh.visible !== false && mesh.material?.visible !== false;
    const direct = mesh.userData?.buildingProvenance;
    const batch = mesh.userData?.buildingProvenanceRecords || [];
    const records = direct ? [direct, ...batch] : batch;
    for (const record of records) {
      const identity = String(record?.identity?.featureId || '');
      if (!identity) continue;
      const current = visualsByIdentity.get(identity) || {
        meshCount: 0,
        attachedMeshCount: 0,
        visibleMeshCount: 0,
        lodTiers: new Set(),
        renderedTopOffsetMeters: null
      };
      current.meshCount += 1;
      if (attached) current.attachedMeshCount += 1;
      if (visible) current.visibleMeshCount += 1;
      if (mesh.userData?.lodTier) current.lodTiers.add(String(mesh.userData.lodTier));
      if (direct && mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const groundBaseY = Number(direct?.foundation?.groundBaseY);
        if (mesh.geometry.boundingBox && Number.isFinite(groundBaseY)) {
          mesh.updateMatrixWorld(true);
          const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
          const foundationRise = Math.max(0, Number(mesh.userData?.terrainFoundationRise) || 0);
          const topOffset = bounds.max.y - groundBaseY - foundationRise;
          if (Number.isFinite(topOffset)) {
            current.renderedTopOffsetMeters = Math.max(
              topOffset,
              Number(current.renderedTopOffsetMeters) || -Infinity
            );
          }
        }
      }
      const batchedTopOffset = Number(mesh.userData?.buildingVisualTopOffsetsByFeatureId?.[identity]);
      if (Number.isFinite(batchedTopOffset)) {
        current.renderedTopOffsetMeters = Math.max(
          batchedTopOffset,
          Number(current.renderedTopOffsetMeters) || -Infinity
        );
      }
      visualsByIdentity.set(identity, current);
    }
  }

  const records = (appCtx.buildingProvenanceRecords || []).map((record) => {
    const heightField = record?.fields?.heightMeters;
    const levelsField = record?.fields?.levels;
    const heightMeters = Number(heightField?.value);
    const mappedHeightAuthority = heightField?.status === 'mapped' || (
      heightField?.status === 'inferred' &&
      heightField?.method === 'levels' &&
      levelsField?.status === 'mapped'
    );
    if (!mappedHeightAuthority || !(heightMeters >= 60)) return null;
    const identity = String(record?.identity?.featureId || '');
    const visual = visualsByIdentity.get(identity) || null;
    const structureBaseOffsetMeters = Number(record?.foundation?.structureBaseOffsetMeters) || 0;
    // A mapped `height` is the feature top above ground. A height inferred
    // from mapped levels is the rendered body thickness, so an elevated part
    // must add its mapped base offset before comparing final geometry.
    const expectedTopOffsetMeters = heightField?.status === 'mapped'
      ? heightMeters
      : structureBaseOffsetMeters + heightMeters;
    const renderedTopOffsetMeters = numberOrNull(visual?.renderedTopOffsetMeters);
    const heightDeltaMeters = renderedTopOffsetMeters == null
      ? null
      : renderedTopOffsetMeters - expectedTopOffsetMeters;
    const heightToleranceMeters = Math.max(3, expectedTopOffsetMeters * 0.05);
    return {
      identity,
      name: String(record?.fields?.name?.value || ''),
      heightMeters,
      heightAuthority: heightField?.status === 'mapped' ? 'explicit_height' : 'mapped_levels',
      heightSourceFeatureId: String(
        heightField?.status === 'mapped'
          ? heightField?.sourceFeatureId || ''
          : levelsField?.sourceFeatureId || ''
      ),
      geometryAuthority: String(record?.identity?.geometryAuthority || ''),
      meshCount: Number(visual?.meshCount || 0),
      attachedMeshCount: Number(visual?.attachedMeshCount || 0),
      visibleMeshCount: Number(visual?.visibleMeshCount || 0),
      lodTiers: visual ? [...visual.lodTiers].sort() : [],
      buildingRole: String(record?.identity?.role || ''),
      structureBaseOffsetMeters,
      mappedMinimumHeight: record?.fields?.minHeightMeters || null,
      foundation: record?.foundation || null,
      expectedTopOffsetMeters,
      renderedTopOffsetMeters,
      heightDeltaMeters: numberOrNull(heightDeltaMeters),
      heightToleranceMeters,
      heightMatchesMappedSource: heightDeltaMeters != null && Math.abs(heightDeltaMeters) <= heightToleranceMeters
    };
  }).filter(Boolean).sort((left, right) =>
    right.heightMeters - left.heightMeters || left.identity.localeCompare(right.identity)
  );
  const attached = records.filter((record) => record.attachedMeshCount > 0).length;
  const visible = records.filter((record) => record.visibleMeshCount > 0).length;
  const missingRenderedHeight = records.filter((record) => record.renderedTopOffsetMeters == null).length;
  const heightMismatches = records.filter((record) => record.heightMatchesMappedSource !== true).length;
  return {
    authority: 'mapped-building-identity-to-final-scene-visual',
    mappedTallRecords: records.length,
    attachedMappedTallRecords: attached,
    visibleMappedTallRecords: visible,
    missingVisualRecords: records.length - attached,
    hiddenVisualRecords: records.length - visible,
    missingRenderedHeightRecords: missingRenderedHeight,
    heightMismatchRecords: heightMismatches,
    samples: records.slice(0, 32)
  };
}

function buildingOccupancySnapshot(x, z, feetY, actorHeight) {
  const nearby = safeCall(() => appCtx.getNearbyBuildings?.(x, z, 12), []);
  if (!Array.isArray(nearby)) return null;
  const containing = nearby.filter((building) => {
    if (!building) return false;
    if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) return false;
    if (!Array.isArray(building.pts) || building.pts.length < 3) return true;
    return safeCall(() => appCtx.pointInPolygon?.(x, z, building.pts), false);
  }).slice(0, 8);
  const entry = safeCall(() => appCtx.pickNearbyEnterableBuildingSupport?.(x, z, {
    radius: 8,
    actorBaseY: feetY,
    actorHeight
  }), null);
  return {
    nearbyCount: nearby.length,
    containingFootprints: containing.map((building) => {
      const minY = Number.isFinite(building?.minY)
        ? Number(building.minY)
        : Number(building?.baseY);
      const maxY = Number.isFinite(building?.maxY)
        ? Number(building.maxY)
        : Number.isFinite(minY) ? minY + (Number(building?.height) || 0) : NaN;
      const topY = Number(feetY) + (Number(actorHeight) || 1.7);
      return {
        ...buildingSnapshot(building),
        actorVerticalOverlap: Number.isFinite(feetY) && Number.isFinite(minY) && Number.isFinite(maxY)
          ? !(topY < minY - 0.45 || feetY > maxY + 0.45)
          : null
      };
    }),
    entryCandidate: entry?.support
      ? {
          label: String(entry.support.label || ""),
          distance: numberOrNull(entry.distance),
          inside: entry.inside === true,
          building: buildingSnapshot(entry.support.building)
        }
      : null
  };
}

function actorFeetY(actor) {
  if (!actor) return null;
  const offset = {
    walk: 1.7,
    drive: 1.2,
    plane: 0.85,
    drone: 0.25,
    boat: 1.1
  }[actor.mode] ?? 0;
  const y = Number(actor.position?.y);
  return Number.isFinite(y) ? y - offset : null;
}

function terrainNeighborhoodSnapshot(centerX, centerZ) {
  const offsets = [-40, 0, 40];
  const samples = [];
  for (const offsetZ of offsets) {
    for (const offsetX of offsets) {
      const x = centerX + offsetX;
      const z = centerZ + offsetZ;
      const sourceY = safeCall(() => appCtx.peekElevationWorldYAtWorldXZ?.(x, z), null);
      const renderedY = safeCall(() => appCtx.terrainMeshHeightAt?.(x, z), null);
      samples.push({
        offsetX,
        offsetZ,
        sourceY: numberOrNull(sourceY),
        renderedY: numberOrNull(renderedY),
        renderedMinusSource: Number.isFinite(Number(sourceY)) && Number.isFinite(Number(renderedY))
          ? Number(renderedY) - Number(sourceY)
          : null
      });
    }
  }
  const rendered = samples.map((sample) => sample.renderedY).filter(Number.isFinite);
  const deltas = samples.map((sample) => sample.renderedMinusSource).filter(Number.isFinite);
  return {
    radius: 40,
    samples,
    renderedRange: rendered.length > 0 ? Math.max(...rendered) - Math.min(...rendered) : null,
    maxAbsoluteRenderedMinusSource: deltas.length > 0
      ? Math.max(...deltas.map(Math.abs))
      : null
  };
}

function surfaceChainSnapshot(actor = appCtx.activeTransportActor?.() || null) {
  if (!actor || ["ocean", "rocket"].includes(actor.mode)) return null;
  const x = Number(actor.position?.x);
  const z = Number(actor.position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

  const feetY = actorFeetY(actor);
  const geographic = safeCall(() => appCtx.worldToLatLon?.(x, z), null);
  const lat = Number(geographic?.lat);
  const lon = Number(geographic?.lon);
  const sourceElevationMeters = Number.isFinite(lat) && Number.isFinite(lon)
    ? safeCall(() => appCtx.peekElevationMetersAtLatLon?.(lat, lon), null)
    : null;
  const terrainSourceSample = Number.isFinite(lat) && Number.isFinite(lon)
    ? safeCall(() => appCtx.peekTerrainSourceSampleAtLatLon?.(lat, lon), null)
    : null;
  const sourceWorldY = safeCall(() => appCtx.peekElevationWorldYAtWorldXZ?.(x, z), null);
  const renderedTerrainY = safeCall(() => appCtx.terrainMeshHeightAt?.(x, z), null);
  const terrain = safeCall(() => appCtx.SurfaceQuery?.terrainAt?.(x, z), null);
  const walk = safeCall(() => appCtx.SurfaceQuery?.walkAt?.(x, z, { currentY: feetY }), null);
  const drive = safeCall(() => appCtx.SurfaceQuery?.driveAt?.(x, z, {
    currentY: feetY,
    preferRoad: true
  }), null);
  const collision = safeCall(() => appCtx.checkBuildingCollision?.(
    x,
    z,
    actor.mode === "walk" ? 0.35 : Number(actor.bounds?.radius) || 1,
    {
      actorBaseY: feetY,
      actorHeight: Number(actor.bounds?.height) || 1.7
    }
  ), null);

  const renderedY = Number(renderedTerrainY);
  const walkY = Number(walk?.position?.y);
  const driveY = Number(drive?.position?.y);
  return {
    coordinateSystem: "local tangent world; +x east, +y up, +z south",
    world: { x, z },
    geographic: {
      lat: numberOrNull(lat),
      lon: numberOrNull(lon)
    },
    actor: {
      mode: actor.mode,
      centerY: numberOrNull(actor.position?.y),
      feetY: numberOrNull(feetY),
      grounded: actor.contact?.grounded ?? null,
      contactKind: String(actor.contact?.kind || ""),
      vehicleContact: actor.mode === 'drive' && appCtx.car?.groundContact
        ? {
            centerY: numberOrNull(appCtx.car.groundContact.centerY),
            supportY: numberOrNull(appCtx.car.groundContact.supportY),
            chassisClearance: Number.isFinite(feetY) && Number.isFinite(Number(appCtx.car.groundContact.supportY))
              ? feetY - Number(appCtx.car.groundContact.supportY)
              : null,
            pitch: numberOrNull(appCtx.car.groundContact.pitch),
            roll: numberOrNull(appCtx.car.groundContact.roll),
            sampleCount: Number(appCtx.car.groundContact.sampleCount || 0),
            supportSampleCount: Number(appCtx.car.groundContact.supportSampleCount || 0),
            roadCentered: appCtx.car.groundContact.roadCentered === true
          }
        : null
    },
    sourceElevationMeters: numberOrNull(sourceElevationMeters),
    terrainSourceSample:
      terrainSourceSampleSnapshot(terrainSourceSample),
    sourceWorldY: numberOrNull(sourceWorldY),
    renderedTerrainY: numberOrNull(renderedTerrainY),
    surfaces: {
      terrain: surfaceSampleSnapshot(terrain),
      walk: surfaceSampleSnapshot(walk),
      drive: surfaceSampleSnapshot(drive)
    },
    deltas: {
      feetMinusRenderedTerrain: Number.isFinite(feetY) && Number.isFinite(renderedY)
        ? feetY - renderedY
        : null,
      feetMinusWalkSurface: Number.isFinite(feetY) && Number.isFinite(walkY)
        ? feetY - walkY
        : null,
      feetMinusDriveSurface: Number.isFinite(feetY) && Number.isFinite(driveY)
        ? feetY - driveY
        : null,
      renderedMinusSourceWorld: Number.isFinite(renderedY) && Number.isFinite(Number(sourceWorldY))
        ? renderedY - Number(sourceWorldY)
        : null
    },
    buildingCollision: collision
      ? {
          collision: collision.collision === true,
          inside: collision.inside === true,
          penetration: numberOrNull(collision.penetration),
          building: buildingSnapshot(collision.building)
        }
      : null,
    buildingOccupancy: buildingOccupancySnapshot(
      x,
      z,
      feetY,
      Number(actor.bounds?.height) || 1.7
    ),
    terrainNeighborhood: terrainNeighborhoodSnapshot(x, z)
  };
}

function rendererSnapshot() {
  const renderer = appCtx.renderer;
  if (!renderer) return null;

  let contextLost = null;
  let glError = null;
  try {
    const gl = renderer.getContext?.();
    contextLost = gl?.isContextLost?.() ?? null;
    glError = gl?.getError?.() ?? null;
  } catch {
    contextLost = null;
  }

  return {
    contextLost,
    glError,
    pixelRatio: numberOrNull(renderer.getPixelRatio?.()),
    width: numberOrNull(renderer.domElement?.width),
    height: numberOrNull(renderer.domElement?.height),
    calls: numberOrNull(renderer.info?.render?.calls),
    triangles: numberOrNull(renderer.info?.render?.triangles),
    programs: Array.isArray(renderer.info?.programs) ? renderer.info.programs.length : null,
    geometries: numberOrNull(renderer.info?.memory?.geometries),
    textures: numberOrNull(renderer.info?.memory?.textures)
  };
}

function spaceCatalogSnapshot() {
  const scene = appCtx.spaceFlight?.scene;
  const group = scene?.getObjectByName?.('solarSystemGroup') || null;
  const asteroidBelt = group?.getObjectByName?.('asteroidBelt') || null;
  const kuiperBelt = group?.getObjectByName?.('kuiperBelt') || null;
  const directChildren = group?.children || [];
  return {
    groupAttached: !!group && group.parent === scene,
    planets: directChildren.filter((object) => object?.userData?.isPlanet === true).length,
    namedAsteroids: directChildren.filter((object) => object?.userData?.isAsteroid === true).length,
    spacecraft: scene?.children?.filter((object) => object?.userData?.isSpacecraft === true).length || 0,
    deepSpaceSpacecraft: directChildren.filter((object) => object?.userData?.isSpacecraft === true).length,
    galaxies: directChildren.filter((object) => object?.userData?.isGalaxy === true).length,
    asteroidParticles: asteroidBelt?.geometry?.attributes?.position?.count || 0,
    kuiperParticles: kuiperBelt?.geometry?.attributes?.position?.count || 0
  };
}

function composerSnapshot() {
  const composer = appCtx.composer;
  if (!composer) return null;
  return {
    readWidth: numberOrNull(composer.readBuffer?.width),
    readHeight: numberOrNull(composer.readBuffer?.height),
    writeWidth: numberOrNull(composer.writeBuffer?.width),
    writeHeight: numberOrNull(composer.writeBuffer?.height),
    passes: Array.isArray(composer.passes)
      ? composer.passes.map((pass) => ({
          name: pass?.constructor?.name || "unknown",
          enabled: pass?.enabled !== false,
          renderToScreen: !!pass?.renderToScreen
        }))
      : []
  };
}

function worldCompositionSnapshot() {
  const result = {
    aerialReplacementMeshes: 0,
    farTerrainClipmaps: 0,
    farMappedContexts: 0,
    mappedTerrainMeshes: 0,
    suppressedTerrainMeshes: 0,
    terrainMeshes: 0
  };
  appCtx.scene?.traverse?.((object) => {
    if (object?.userData?.aerialSurfaceContext) result.aerialReplacementMeshes += 1;
    if (object?.userData?.isFarTerrainClipmap) result.farTerrainClipmaps += 1;
    if (object?.userData?.isFarMappedContext) result.farMappedContexts += 1;
    if (!object?.userData?.isTerrainMesh) return;
    result.terrainMeshes += 1;
    if (object.material && !Array.isArray(object.material) && object.material.map) {
      result.mappedTerrainMeshes += 1;
    }
    if (object.userData.terrainAerialDetailSuppressed === true) {
      result.suppressedTerrainMeshes += 1;
    }
  });
  return result;
}

function transportStructureSnapshot() {
  const roads = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  const visuals = Array.isArray(appCtx.structureVisualMeshes) ? appCtx.structureVisualMeshes : [];
  const generalizedEndpointAuditRadius = Number.isFinite(Number(appCtx.worldTraversalRadiusWorld)) &&
    Number(appCtx.worldTraversalRadiusWorld) > 0
    ? Number(appCtx.worldTraversalRadiusWorld)
    : 2700;
  const allGeneralizedEndpointRecords = roads.filter((road) =>
    road?.transportRecord?.completeness === 'generalized' &&
    road?.structureSemantics?.gradeSeparated === true &&
    road?.transportStructureAssembly?.publishBody === true &&
    Array.isArray(road?.pts) && road.pts.length >= 2
  ).flatMap((road) => {
    const profile = road.transportSurfaceModel;
    const distances = profile?.distances || [];
    const heights = profile?.centerHeights || [];
    return ['start', 'end'].map((endpoint) => {
      const atStart = endpoint === 'start';
      const point = atStart ? road.pts[0] : road.pts[road.pts.length - 1];
      const surfaceY = Number(heights[atStart ? 0 : heights.length - 1]);
      const terrainY = Number(
        appCtx.terrainMeshHeightAt?.(Number(point?.x), Number(point?.z)) ??
        appCtx.elevationWorldYAtWorldXZ?.(Number(point?.x), Number(point?.z))
      );
      const endpointRef = road?.transportStructureRef?.[endpoint] || null;
      const abutmentPublished = (road?.transportStructureAssembly?.abutments || [])
        .some((abutment) => String(abutment?.endpoint || '').startsWith(endpoint));
      const terminalSupportPublished = (road?.transportStructureAssembly?.terminalSupports || [])
        .some((station) => String(station?.terminalFor || '') === endpoint);
      const supportWithinEndpointRun = (road?.transportStructureAssembly?.supportStations || [])
        .some((station) => atStart
          ? Number(station?.distance) <= 18
          : Number(road?.transportStructureAssembly?.total) - Number(station?.distance) <= 18);
      const compiledConnectionPublished = compiledEndpointConnectionPublished(road, endpoint);
      return {
        id: String(road?.sourceFeatureId || road?.transportGraphRef?.featureId || ''),
        name: String(road?.name || ''),
        type: String(road?.type || ''),
        endpoint,
        state: String(endpointRef?.state || ''),
        policy: String(endpointRef?.policy || ''),
        connectionCount: Number(endpointRef?.connectionCount || 0),
        surfaceY: numberOrNull(surfaceY),
        terrainY: numberOrNull(terrainY),
        clearance: Number.isFinite(surfaceY) && Number.isFinite(terrainY)
          ? surfaceY - terrainY
          : null,
        x: numberOrNull(Number(point?.x)),
        z: numberOrNull(Number(point?.z)),
        terrainMode: String(road?.structureSemantics?.terrainMode || ''),
        verticalOrder: Number(road?.structureSemantics?.verticalOrder || 0),
        abutmentPublished,
        terminalSupportPublished,
        supportWithinEndpointRun,
        compiledConnectionPublished
      };
    });
  });
  const generalizedEndpointRecords = allGeneralizedEndpointRecords.filter((record) =>
    Number.isFinite(record.x) && Number.isFinite(record.z) &&
    Math.hypot(record.x, record.z) <= generalizedEndpointAuditRadius
  );
  const unsupportedGeneralizedOpenBoundaries = generalizedEndpointRecords
    .filter((record) =>
      record.state === 'open_boundary' &&
      Number(record.clearance) > 1.2 &&
      record.compiledConnectionPublished !== true &&
      record.abutmentPublished !== true &&
      record.terminalSupportPublished !== true &&
      record.supportWithinEndpointRun !== true)
    .sort((left, right) => Number(right.clearance) - Number(left.clearance));
  const exactStructureSamples = roads.filter((road) =>
    road?.transportRecord?.completeness === 'lossless' &&
    road?.structureSemantics?.gradeSeparated === true &&
    Array.isArray(road?.pts) && road.pts.length >= 2
  ).map((road) => {
    const segIndex = Math.max(0, Math.min(
      road.pts.length - 2,
      Math.floor((road.pts.length - 1) * 0.5)
    ));
    const start = road.pts[segIndex];
    const end = road.pts[segIndex + 1];
    const x = (Number(start.x) + Number(end.x)) * 0.5;
    const z = (Number(start.z) + Number(end.z)) * 0.5;
    return {
      id: String(road?.sourceFeatureId || road?.transportGraphRef?.featureId || road?.id || ''),
      name: String(road?.name || ''),
      terrainMode: String(road?.structureSemantics?.terrainMode || ''),
      structureKind: String(road?.structureSemantics?.structureKind || ''),
      x,
      z,
      surfaceY: Number(appCtx.sampleFeatureSurfaceY?.(road, x, z, { segIndex, t: 0.5 }))
    };
  }).filter((sample) =>
    sample.id && [sample.x, sample.z, sample.surfaceY].every(Number.isFinite));
  const gradeProfiles = roads.map((road) => {
    const distances = road?.transportSurfaceModel?.distances || [];
    const heights = road?.transportSurfaceModel?.centerHeights || [];
    let steepestSegment = null;
    for (let index = 1; index < distances.length && index < heights.length; index += 1) {
      const run = Number(distances[index]) - Number(distances[index - 1]);
      if (!(run > 1e-6)) continue;
      const rise = Number(heights[index]) - Number(heights[index - 1]);
      const grade = Math.abs(rise / run);
      if (!steepestSegment || grade > steepestSegment.grade) {
        steepestSegment = { index, run, rise, grade };
      }
    }
    return {
      id: String(road?.sourceFeatureId || road?.transportGraphRef?.featureId || road?.id || ''),
      name: String(road?.name || ''),
      terrainMode: String(road?.structureSemantics?.terrainMode || 'at_grade'),
      verticalOrder: Number(road?.structureSemantics?.verticalOrder || 0),
      engineeredApproach: road?.transportSurfaceModel?.engineeredApproach === true,
      maximumGrade: Number(steepestSegment?.grade || 0),
      compilerReportedMaximumGrade: Number(road?.transportSurfaceModel?.stats?.maximumGrade),
      designMaximumGrade: Number(road?.transportSurfaceModel?.maximumGrade),
      profileLength: Number(distances[distances.length - 1] || 0),
      steepestSegment,
      graphAnchors: (road?.structureTransitionAnchors || [])
        .filter((anchor) => anchor?.source === 'transport_graph_node')
        .map((anchor) => ({
          distance: Number(anchor?.distance || 0),
          targetSurfaceY: Number(anchor?.targetSurfaceY),
          endpoint: anchor?.endpoint || null,
          ownerFeatureId: String(anchor?.ownerFeatureId || ''),
          continuityRepair: anchor?.continuityRepair === true,
          approachContinuation: anchor?.approachContinuation === true,
          finalNodeReconciliation: anchor?.finalNodeReconciliation === true,
          residualAtGradeReconciliation: anchor?.residualAtGradeReconciliation === true
        }))
    };
  }).filter((record) => Number.isFinite(record.maximumGrade) && Number.isFinite(record.designMaximumGrade));
  gradeProfiles.sort((left, right) => right.maximumGrade - left.maximumGrade);
  // Only grade-separated structures and their compiled approaches have a
  // product-owned design envelope. Ordinary streets follow measured terrain;
  // treating a universal 12% slope as source data created false failures in
  // naturally steep cities and hid the actual structure solver defects.
  const engineeredGradeProfiles = gradeProfiles.filter((record) =>
    record.terrainMode !== 'at_grade' || record.engineeredApproach === true);
  const gradeViolations = engineeredGradeProfiles.filter((record) =>
    record.maximumGrade > record.designMaximumGrade + 0.002);
  const atGradeRoads = roads.filter((road) =>
    road?.structureSemantics?.terrainMode === 'at_grade' &&
    road?.driveable !== false);
  const atGradeTerrainAuthority = Object.freeze({
    authority: 'compiled_transport_surface',
    roadCount: atGradeRoads.length,
    compiledSurfaceRoads: atGradeRoads.filter((road) =>
      road?.transportSurfaceModel?.authority === 'compiled_transport_surface').length,
    compiledCenterlineFitRoads: atGradeRoads.filter((road) =>
      road?.transportSurfaceModel?.endpointPolicy === 'compiled_centerline_terrain_fit').length,
    liveTerrainSamplerRoads: atGradeRoads.filter((road) =>
      typeof road?.surfaceTerrainSampler === 'function').length,
    corridorCount: Number(appCtx.transportTerrainCorridorPublication?.corridorCount || 0),
    adjustedTerrainVertices: Number(appCtx.transportTerrainCorridorStats?.adjustedVertices || 0),
    terrainMeshes: Number(appCtx.transportTerrainCorridorStats?.terrainMeshes || 0),
    heightSamplingAuthority:
      String(appCtx.transportTerrainCorridorStats?.heightSamplingAuthority || '') || null,
    terrainSeamAuthority:
      String(appCtx.transportTerrainCorridorStats?.terrainSeams?.authority || '') || null,
    sharedTerrainEdgeVertices:
      Number(appCtx.transportTerrainCorridorStats?.terrainSeams?.sharedVertices || 0),
    maximumTerrainSeamDeltaBefore:
      Number(appCtx.transportTerrainCorridorStats?.terrainSeams?.maximumDeltaBefore || 0)
  });
  const sharedPhysicalSurfaces = [...new Map(roads.map((road) => {
    const surface = road?.transportSurfacePresentation;
    return surface?.status === 'compiled' ? [surface.id, surface] : null;
  }).filter(Boolean)).values()].map((surface) => ({
    id: String(surface.id || ''),
    authority: String(surface.authority || ''),
    physicalSurfaceKind: String(surface.physicalSurfaceKind || ''),
    widthMeters: numberOrNull(surface.width),
    lanes: Number(surface?.transportRecord?.crossSection?.lanes || 0),
    memberFeatureIds: [...(surface.memberFeatureIds || [])],
    publisherFeatureId: String(surface.publisherFeatureId || ''),
    measurementStatus: String(surface.measurementStatus || ''),
    sourceUrl: String(surface.sourceUrl || ''),
    sampleCount: Number(surface.pts?.length || 0)
  }));
  const visualTypes = {};
  for (const mesh of visuals) {
    const type = String(mesh?.userData?.structureVisualType || 'unclassified');
    if (!visualTypes[type]) {
      visualTypes[type] = {
        meshes: 0,
        visibleMeshes: 0,
        instances: 0,
        vertices: 0
      };
    }
    const record = visualTypes[type];
    record.meshes += 1;
    if (mesh?.visible !== false && mesh?.parent) record.visibleMeshes += 1;
    record.instances += Number(mesh?.count || 0);
    record.vertices += Number(mesh?.geometry?.attributes?.position?.count || 0);
  }
  return {
    elevatedRoads: roads.filter((road) =>
      road?.structureSemantics?.terrainMode === 'elevated').length,
    bridgeRoads: roads.filter((road) =>
      road?.structureSemantics?.isBridge === true).length,
    engineeredApproaches: roads.filter((road) =>
      road?.transportSurfaceModel?.engineeredApproach === true).length,
    publishedBodies: roads.filter((road) =>
      road?.transportStructureAssembly?.publishBody === true).length,
    publishedVerticalControls: roads.filter((road) =>
      road?.transportSurfaceControlResolution?.status === 'resolved').map((road) => ({
        id: String(road.sourceFeatureId || ''),
        name: String(road.name || ''),
        controlId: String(road.transportSurfaceControlResolution.controlId || ''),
        authority: String(road.transportSurfaceControlResolution.authority || ''),
        minimumSurfaceY: numberOrNull(road.transportSurfaceControlResolution.minimumSurfaceY),
        mappedWaterSamples: Number(road.transportSurfaceControlResolution.mappedWaterSamples || 0),
        referenceDatum: String(road.transportSurfaceControlResolution.referenceDatum || ''),
        measurementStatus: String(road.transportSurfaceControlResolution.measurementStatus || ''),
        sourceUrl: String(road.transportSurfaceControlResolution.sourceUrl || '')
      })),
    sharedPhysicalSurfaces,
    exactStructureSamples,
    transportNetwork: {
      ...(appCtx.transportNetworkModel?.stats || {}),
      generalizedJoinToleranceMeters:
        numberOrNull(appCtx.transportNetworkModel?.generalizedJoinToleranceMeters),
      generalizedExpandedEndpointConnections:
        (appCtx.transportNetworkModel?.connections || []).filter((connection) =>
          String(connection?.provenance?.method || '').startsWith('generalized-aligned-')).length
    },
    generalizedEndpointIntegrity: {
      authority: 'compiled-generalized-structure-endpoints',
      horizontalAuditRadius: generalizedEndpointAuditRadius,
      sourceEndpoints: allGeneralizedEndpointRecords.length,
      sampledEndpoints: generalizedEndpointRecords.length,
      unsupportedOpenBoundaryCount: unsupportedGeneralizedOpenBoundaries.length,
      unsupportedOpenBoundaries: unsupportedGeneralizedOpenBoundaries.slice(0, 24)
    },
    junctionContinuity: appCtx.transportJunctionProfile?.continuity || null,
    continuityRepair: appCtx.transportJunctionProfile?.continuityRepair || null,
    gradeProfile: {
      authority: 'compiled_grade_separated_transport_surface_profile',
      sampledRoads: engineeredGradeProfiles.length,
      maximumGrade: engineeredGradeProfiles[0]?.maximumGrade || 0,
      violationCount: gradeViolations.length,
      violations: gradeViolations.slice(0, 24),
      steepest: engineeredGradeProfiles.slice(0, 24),
      allMappedRoadsObserved: gradeProfiles.length,
      allMappedRoadsSteepest: gradeProfiles.slice(0, 24)
    },
    roadSurfaceIntegrity: appCtx.transportSurfacePublication?.roadSurfaceIntegrity || null,
    atGradeTerrainAuthority,
    visualMeshes: visuals.length,
    attachedVisualMeshes: visuals.filter((mesh) => !!mesh?.parent).length,
    visibleVisualMeshes: visuals.filter((mesh) =>
      mesh?.visible !== false && !!mesh?.parent).length,
    visualTypes
  };
}

function getWorldExplorerRuntimeDiagnostics() {
  const activeActor = appCtx.activeTransportActor?.() || null;
  const interiorCandidates = !appCtx.activeInterior && activeActor?.position &&
      typeof appCtx.listSupportedInteriorsNear === 'function'
    ? appCtx.listSupportedInteriorsNear(
      Number(activeActor.position.x),
      Number(activeActor.position.z),
      650,
      80
    )
    : [];
  const activeInterior = appCtx.activeInterior;
  const interiorWallColliders = (appCtx.dynamicBuildingColliders || [])
    .filter((collider) => collider?.isInteriorCollider && collider?.buildingType === 'interior_wall')
    .slice(0, 48)
    .map((collider) => ({
      minX: Number(collider.minX),
      maxX: Number(collider.maxX),
      minZ: Number(collider.minZ),
      maxZ: Number(collider.maxZ),
      centerX: Number(collider.centerX),
      centerZ: Number(collider.centerZ),
      floorLevel: Number(collider.floorLevel || 0)
    }));
  return {
    developerDiagnostics: {
      enabled: developerDiagnosticsEnabled,
      networkWrites: false,
      capturedErrors: runtimeErrors.length
    },
    runtimeKernel: appCtx.getRuntimeKernelSnapshot?.() || null,
    performance: appCtx.perfStats ? {
      mode: appCtx.perfStats.mode || null,
      lastLoad: appCtx.perfStats.lastLoad ? { ...appCtx.perfStats.lastLoad } : null,
      live: appCtx.perfStats.live ? { ...appCtx.perfStats.live } : null
    } : null,
    runtimeErrors: [...runtimeErrors],
    sessionLifecycle: appCtx.getSessionCoordinatorDebugState?.() || null,
    account: appCtx.getAccountSnapshot?.() || null,
    platformServices: appCtx.getPlatformServicesSnapshot?.() || null,
    gameplayPlugins: appCtx.getGameplayRegistrySnapshot?.() || null,
    paintTown: appCtx.paintTownDebugSnapshot?.() || { active: false },
    blockBuilder: {
      ...(appCtx.getBlockBuilderSnapshot?.() || { enabled: false, count: 0, shared: false }),
      persistence: appCtx.getBuildPersistenceStatus?.() || null
    },
    deflock: appCtx.getDeFlockSnapshot?.() || { active: false },
    liveGps: appCtx.getLiveGpsSnapshot?.() || { active: false },
    liveEarth: appCtx.inspectLiveEarthState?.() || null,
    augmentedReality: appCtx.getArPlatformSnapshot?.() || { phase: 'idle', active: false },
    livingWorld: appCtx.livingWorldRuntimeSnapshot?.() || { active: false },
    worldDiscovery: appCtx.worldDiscoveryRuntimeSnapshot?.() || { active: false },
    fishing: appCtx.getFishingSnapshot?.() || { open: false, active: false },
    interior: activeInterior ? {
      active: true,
      key: String(activeInterior.key || ''),
      mode: String(activeInterior.mode || 'generated'),
      floorId: String(activeInterior.floorId || ''),
      floorLabel: String(activeInterior.floorLabel || 'Lobby'),
      activeLevel: Number(activeInterior.activeLevel || 0),
      floorCount: Number(activeInterior.floorPlan?.floorCount || 1),
      floorBaseY: Number(activeInterior.floorBaseY || 0),
      storyHeight: Number(activeInterior.floorPlan?.storyHeight || 0),
      loadedLevels: Array.isArray(activeInterior.loadedLevels) ? [...activeInterior.loadedLevels] : [],
      connectorsAvailable: activeInterior.connector != null,
      walkSurfaceCount: Array.isArray(activeInterior.walkSurfaces) ? activeInterior.walkSurfaces.length : 0,
      colliderCount: Number(appCtx.dynamicBuildingColliders?.length || 0),
      buildingCollisionDisabled: activeInterior.building?.collisionDisabled === true,
      groupAttached: activeInterior.group?.parent != null,
      stairs: (activeInterior.stairs || []).map((stair) => ({
        start: { x: Number(stair.start?.x), z: Number(stair.start?.z) },
        end: { x: Number(stair.end?.x), z: Number(stair.end?.z) },
        floorLevel: Number(stair.floorLevel || 0),
        targetLevel: Number(stair.targetLevel || 0)
      })),
      interactions: (activeInterior.interactions || []).map((interaction) => ({
        kind: String(interaction.kind || ''),
        label: String(interaction.label || ''),
        level: Number(interaction.level || 0),
        targetLevel: Number.isFinite(Number(interaction.targetLevel)) ? Number(interaction.targetLevel) : null,
        x: Number(interaction.x),
        z: Number(interaction.z),
        radius: Number(interaction.radius || 0)
      })),
      wallColliders: interiorWallColliders
    } : {
      active: false,
      candidates: interiorCandidates,
      promptTargetKey: String(appCtx.interiorHint?.key || ''),
      promptSourceBuildingId: String(appCtx.interiorHint?.sourceBuildingId || ''),
      colliderCount: Number(appCtx.dynamicBuildingColliders?.length || 0)
    },
    mobileControls: appCtx.getMobileTouchInputSnapshot?.() || { enabled: false },
    urbanSandbox: appCtx.urbanSandboxRuntimeSnapshot?.() || { active: false },
    aviation: appCtx.aviationRuntime?.snapshot?.() || { active: false, fleetCount: 0, playableCount: 0 },
    flightDynamics: appCtx.planeMode?.active ? {
      catalogId: String(appCtx.planeMode.transportCatalogId || ''),
      airborne: appCtx.planeMode.airborne === true,
      airspeed: numberOrNull(appCtx.planeMode.speed),
      horizontalSpeed: numberOrNull(appCtx.planeMode.horizontalSpeed),
      climbRate: numberOrNull(appCtx.planeMode.climbRate),
      pitch: numberOrNull(appCtx.planeMode.pitch),
      flightPathAngle: numberOrNull(appCtx.planeMode.flightPathAngle),
      angleOfAttack: numberOrNull(appCtx.planeMode.angleOfAttack),
      liftLoad: numberOrNull(appCtx.planeMode.liftLoad),
      turnRate: numberOrNull(appCtx.planeMode.turnRate),
      stalled: appCtx.planeMode.stalled === true,
      passengerMode: appCtx.planeMode.passengerMode === true
    } : null,
    boatDynamics: appCtx.boatMode?.active ? {
      catalogId: String(appCtx.boatMode.transportCatalogId || ''),
      steerInput: numberOrNull(appCtx.readControlActions?.('boat')?.steer),
      throttle: numberOrNull(appCtx.boat?.throttle),
      forwardSpeed: numberOrNull(appCtx.boat?.forwardSpeed),
      lateralSpeed: numberOrNull(appCtx.boat?.lateralSpeed),
      turnRate: numberOrNull(appCtx.boat?.turnRate)
    } : null,
    maritime: appCtx.maritimeRuntime?.snapshot?.() || { active: false, fleetCount: 0, playableCount: 0 },
    boatNavigation: appCtx.boatMode?.active ? {
      waterKind: String(appCtx.boatMode.waterKind || ''),
      shorelineDistance: numberOrNull(appCtx.boatMode.shorelineDistance),
      shoreVisible: appCtx.boatMode.openOceanSurfaceSuppression?.shoreVisible !== false,
      cameraFraming: appCtx.camera?.userData?.boatrig?.framing || null
    } : null,
    transportControllers: appCtx.getEarthTransportControllerSnapshot?.() || null,
    transportFacilities: transportFacilitySnapshot(),
    activeActor,
    cameraFollow: cameraFollowSnapshot(activeActor),
    surfaceChain: surfaceChainSnapshot(activeActor),
    environment: appCtx.getEnv?.() || null,
    gameStarted: !!appCtx.gameStarted,
    gameMode: String(appCtx.gameMode || 'free'),
    paused: !!appCtx.paused,
    worldLoading: !!appCtx.worldLoading,
    worldLoad: appCtx.worldLoadRuntimeState || null,
    onDemandModes: appCtx.getOnDemandModeSnapshot?.() || {
      ocean: { requested: false, active: false, rendererReady: false },
      space: { requested: false, active: false, rendererReady: false }
    },
    transportCompilation: appCtx.transportSurfacePublication ? {
      roadCount: Number(appCtx.transportSurfacePublication.roadCount || 0),
      meshCount: Number(appCtx.transportSurfacePublication.meshCount || 0),
      phaseDurationsMs: appCtx.transportSurfacePublication.phaseDurationsMs || null
    } : null,
    terrainSurfaceCompilation: appCtx.terrainSurfaceProfileStats || null,
    earthResumePending: !!appCtx.earthResumePending,
    worldDetail: appCtx.worldDetailState || null,
    modelAssets: {
      ...getModelAssetRuntimeMetrics(),
      playerAssetId: appCtx.Walk?.state?.characterMesh?.userData?.characterAssetId || null,
      playerAppearanceId: appCtx.Walk?.state?.characterMesh?.userData?.characterAppearanceId || null,
      playerCharacterAuthority: appCtx.Walk?.state?.characterMesh?.userData?.performanceProfile?.authority || null,
      playerCharacterProfile: appCtx.Walk?.state?.characterMesh?.userData?.performanceProfile || null
    },
    transportVisuals: {
      activeAircraft: appCtx.planeMode?.mesh?.userData?.performanceProfile || null
    },
    mappedTallBuildingVisuals: mappedTallBuildingVisualSnapshot(),
    modes: {
      boat: !!appCtx.boatMode?.active,
      drone: !!appCtx.droneMode,
      plane: !!appCtx.planeMode?.active,
      ocean: !!appCtx.oceanMode?.active,
      space: !!appCtx.spaceFlight?.active,
      walking: appCtx.Walk?.state?.mode === "walk"
    },
    planetary: {
      flightDestination: appCtx.spaceFlight?.destination || null,
      flightMode: appCtx.spaceFlight?.mode || null,
      flightSessionId: numberOrNull(appCtx.spaceFlight?._sessionId),
      landingTarget: appCtx.spaceFlight?._landingTarget || null,
      manualLandingTarget: appCtx.spaceFlight?._manualLandingTarget || null,
      nearestBody: appCtx.spaceFlight?._nearestBody?.name || null,
      onMars: !!appCtx.onMars,
      onMoon: !!appCtx.onMoon,
      traveling: !!appCtx.travelingToMoon
    },
    surfacePodLaunch: appCtx.surfacePodLaunchSnapshot || null,
    stagedEarthPathfinder: appCtx.getStagedEarthPodSnapshot?.() || null,
    universeNavigation: appCtx.getUniverseCourseSnapshot?.() || (appCtx.universeRuntime ? {
      currentFrameId: appCtx.universeRuntime.current?.id || null,
      selectedDestinationId: appCtx.universeRuntime.selected?.id || null,
      courseDestinationId: appCtx.universeRuntime.course?.destination?.id || null,
      courseFrameId: appCtx.universeRuntime.course?.frame?.id || null,
      courseStatus: appCtx.universeRuntime.course?.status || null,
      transitionDestinationId: appCtx.universeRuntime.transition?.destination?.id || null
    } : null),
    spaceCatalog: spaceCatalogSnapshot(),
    curatedLandmarks: appCtx.curatedLandmarkMetrics || null,
    mappedLandmarks: appCtx.mappedLandmarkMetrics || null,
    titleVisible: !!document.getElementById("titleScreen") &&
      !document.getElementById("titleScreen").classList.contains("hidden"),
    camera: appCtx.camera
      ? {
          position: vectorSnapshot(appCtx.camera.position),
          rotation: vectorSnapshot(appCtx.camera.rotation),
          up: vectorSnapshot(appCtx.camera.up),
          near: numberOrNull(appCtx.camera.near),
          far: numberOrNull(appCtx.camera.far),
          aspect: numberOrNull(appCtx.camera.aspect)
        }
      : null,
    drone: appCtx.drone
      ? {
          position: {
            x: numberOrNull(appCtx.drone.x),
            y: numberOrNull(appCtx.drone.y),
            z: numberOrNull(appCtx.drone.z)
          },
          yaw: numberOrNull(appCtx.drone.yaw),
          pitch: numberOrNull(appCtx.drone.pitch),
          roll: numberOrNull(appCtx.drone.roll)
        }
      : null,
    scene: appCtx.scene
      ? {
          children: appCtx.scene.children.length,
          background: appCtx.scene.background?.getHexString?.() || null,
          fogColor: appCtx.scene.fog?.color?.getHexString?.() || null,
          fogDensity: numberOrNull(appCtx.scene.fog?.density)
        }
      : null,
    renderer: rendererSnapshot(),
    accessibility: globalThis.getWorldExplorerAccessibilitySnapshot?.() || null,
    lastEarthWorldRelease: appCtx.lastEarthWorldRelease || null,
    composer: composerSnapshot(),
    worldComposition: worldCompositionSnapshot(),
    visualOwners: {
      atmosphere: appCtx.getEarthAtmosphereSnapshot?.() || null,
      water: {
        ...(appCtx.waterSurfaceRegistrySnapshot || appCtx.waterSurfaceRegistry?.snapshot?.() || {}),
        ...(appCtx.getWaterOpticsSnapshot?.() || {})
      }
    },
    transportStructures: transportStructureSnapshot(),
    farTerrainClipmap: appCtx.farTerrainClipmapState || null,
    quality: appCtx.renderQualityLevel || null,
    earthOrigin: {
      lat: numberOrNull(appCtx.LOC?.lat),
      lon: numberOrNull(appCtx.LOC?.lon)
    },
    terrainCache: appCtx.terrainTileCacheSnapshot?.() || null,
    mapTileCache: appCtx.mapTileCacheSnapshot?.() || null,
    minimapView: appCtx.getMinimapViewSnapshot?.() || null,
    groundProviderCatalog:
      appCtx.getGroundProviderCatalogSnapshot?.() || null,
    worldCounts: {
      buildings: appCtx.buildings?.length ?? null,
      buildingMeshes: appCtx.buildingMeshes?.length ?? null,
      landuseMeshes: appCtx.landuseMeshes?.length ?? null,
      roadMeshes: appCtx.roadMeshes?.length ?? null,
      roads: appCtx.roads?.length ?? null,
      terrainTiles: appCtx.terrainTileCache?.size ?? null,
      visibleBuildingMeshes: Array.isArray(appCtx.buildingMeshes)
        ? appCtx.buildingMeshes.filter((mesh) => mesh?.visible !== false && !!mesh?.parent).length
        : null,
      pitchedRoofMeshes: Array.isArray(appCtx.buildingMeshes)
        ? appCtx.buildingMeshes.filter((mesh) =>
            mesh?.visible !== false && !!mesh?.parent &&
            mesh?.userData?.roofShape && mesh.userData.roofShape !== 'flat'
          ).length
        : null,
      inferredPitchedRoofMeshes: Array.isArray(appCtx.buildingMeshes)
        ? appCtx.buildingMeshes.filter((mesh) =>
            mesh?.visible !== false && !!mesh?.parent && mesh?.userData?.isInferredRoof === true
          ).length
        : null,
      guardedRoads: Array.isArray(appCtx.roads)
        ? appCtx.roads.filter((road) => road?.guardrailColliders?.length > 0).length
        : null,
      guardrailColliders: Array.isArray(appCtx.buildings)
        ? appCtx.buildings.filter((building) => building?.buildingType === 'bridge_guardrail').length
        : null,
      guardrailVisualInstances: Array.isArray(appCtx.structureVisualMeshes)
        ? appCtx.structureVisualMeshes
            .filter((mesh) => mesh?.userData?.structureVisualType === 'guardrails')
            .reduce((sum, mesh) => sum + (Number(mesh?.count) || 0), 0)
        : null
    },
    groundFallback: appCtx.groundFallbackMesh
      ? {
          exists: true,
          attached: !!appCtx.groundFallbackMesh.parent,
          visible: appCtx.groundFallbackMesh.visible !== false,
          loadingPlaceholder: appCtx.groundFallbackMesh.userData?.isLoadingPlaceholder === true
        }
      : { exists: false, attached: false, visible: false, loadingPlaceholder: false }
  };
}

globalThis.getWorldExplorerRuntimeDiagnostics = getWorldExplorerRuntimeDiagnostics;
if (developerDiagnosticsEnabled) {
  const roofCandidates = () => {
    const actor = appCtx.Walk?.state?.walker || appCtx.car || { x: 0, z: 0 };
    return (appCtx.buildings || []).filter((building) => {
      const minY = Number(building?.minY ?? building?.baseY);
      const maxY = Number(building?.maxY ?? (minY + Number(building?.height)));
      const width = Number(building?.maxX) - Number(building?.minX);
      const depth = Number(building?.maxZ) - Number(building?.minZ);
      return !building?.collisionDisabled && building?.allowsPassageBelow !== true &&
        building?.collisionKind !== 'barrier' && Number.isFinite(minY) && Number.isFinite(maxY) &&
        maxY - minY >= 3 && width >= 7 && depth >= 7;
    }).map((building, index) => ({
      id: String(building.sourceBuildingId || `roof:${index}`),
      x: Number(building.centerX ?? (building.minX + building.maxX) * .5),
      z: Number(building.centerZ ?? (building.minZ + building.maxZ) * .5),
      roofY: Number(building.maxY ?? (Number(building.baseY) + Number(building.height))),
      width: Number(building.maxX) - Number(building.minX),
      depth: Number(building.maxZ) - Number(building.minZ),
      distance: Math.hypot(Number(building.centerX || 0) - Number(actor.x || 0), Number(building.centerZ || 0) - Number(actor.z || 0))
    })).filter((roof) => [roof.x, roof.z, roof.roofY].every(Number.isFinite))
      .sort((left, right) => left.distance - right.distance);
  };
  globalThis.__WE3D_ROOF_SUPPORT__ = Object.freeze({
    list: () => roofCandidates().slice(0, 24),
    landOn(roofId) {
      const roof = roofCandidates().find(({ id }) => id === String(roofId)) || roofCandidates()[0];
      const walker = appCtx.Walk?.state?.walker;
      if (!roof || !walker) return false;
      appCtx.Walk?.setModeWalk?.({ preserveResolvedSpawn: true, deferWorldSync: true });
      walker.x = roof.x;
      walker.z = roof.z;
      walker.y = roof.roofY + Number(appCtx.Walk?.CFG?.eyeHeight || 1.7) + 10;
      walker.vy = -3;
      walker.onGround = false;
      walker.onBuilding = false;
      walker._resolvedGroundState = null;
      walker.angle = 0;
      walker.yaw = 0;
      return roof;
    },
    snapshot: () => {
      const walker = appCtx.Walk?.state?.walker;
      return walker ? {
        x: Number(walker.x), y: Number(walker.y), z: Number(walker.z),
        onGround: walker.onGround === true,
        onBuilding: walker.onBuilding === true,
        vy: Number(walker.vy || 0)
      } : null;
    }
  });
}
globalThis.render_game_to_text = () => JSON.stringify({
  developerDiagnostics: {
    enabled: developerDiagnosticsEnabled,
    networkWrites: false,
    capturedErrors: runtimeErrors.length
  },
  environment: appCtx.getEnv?.() || null,
  modes: {
    boat: !!appCtx.boatMode?.active,
    drone: !!appCtx.droneMode,
    plane: !!appCtx.planeMode?.active,
    ocean: !!appCtx.oceanMode?.active,
    space: !!appCtx.spaceFlight?.active,
    walking: appCtx.Walk?.state?.mode === 'walk'
  },
  worldConditions: {
    skyMode: appCtx.skyMode || 'live',
    weatherMode: appCtx.weatherMode || 'live'
  },
  planetary: {
    flightDestination: appCtx.spaceFlight?.destination || null,
    flightMode: appCtx.spaceFlight?.mode || null,
    nearestBody: appCtx.spaceFlight?._nearestBody?.name || null
  },
  spaceFlight: spaceFlightSnapshot(),
  surfacePodLaunch: appCtx.surfacePodLaunchSnapshot || null,
  stagedEarthPathfinder: appCtx.getStagedEarthPodSnapshot?.() || null,
  universeNavigation: appCtx.getUniverseCourseSnapshot?.() || (appCtx.universeRuntime ? {
    currentFrameId: appCtx.universeRuntime.current?.id || null,
    selectedDestinationId: appCtx.universeRuntime.selected?.id || null,
    courseDestinationId: appCtx.universeRuntime.course?.destination?.id || null,
    courseFrameId: appCtx.universeRuntime.course?.frame?.id || null,
    courseStatus: appCtx.universeRuntime.course?.status || null,
    transitionDestinationId: appCtx.universeRuntime.transition?.destination?.id || null
  } : null),
  interstellarExpedition: appCtx.getInterstellarExpeditionSnapshot?.() || null,
  destinationMission: appCtx.getDestinationMissionSnapshot?.() || null,
  expeditionShipInterior: appCtx.getShipInteriorSnapshot?.() || null,
  backpack: appCtx.playerBackpackInventory?.snapshot?.() || null,
  gameStarted: !!appCtx.gameStarted,
  paused: !!appCtx.paused,
  worldLoading: !!appCtx.worldLoading,
  titleVisible: !!document.getElementById("titleScreen") &&
    !document.getElementById("titleScreen").classList.contains("hidden"),
  surfaceChain: surfaceChainSnapshot(),
  terrainCache: appCtx.terrainTileCacheSnapshot?.() || null,
  mapTileCache: appCtx.mapTileCacheSnapshot?.() || null,
  minimapView: appCtx.getMinimapViewSnapshot?.() || null,
  liveGps: appCtx.getLiveGpsSnapshot?.() || { active: false },
  liveEarth: appCtx.inspectLiveEarthState?.() || null,
  augmentedReality: appCtx.getArPlatformSnapshot?.() || { phase: 'idle', active: false },
  livingWorld: appCtx.livingWorldRuntimeSnapshot?.() || { active: false },
  urbanSandbox: appCtx.urbanSandboxRuntimeSnapshot?.() || { active: false },
  aviation: appCtx.aviationRuntime?.snapshot?.() || { active: false, fleetCount: 0, playableCount: 0 },
  maritime: appCtx.maritimeRuntime?.snapshot?.() || { active: false, fleetCount: 0, playableCount: 0 },
  transportFacilities: transportFacilitySnapshot(),
  fishing: appCtx.getFishingSnapshot?.() || { open: false, active: false, stage: 'idle' },
  blockBuilder: {
    ...(appCtx.getBlockBuilderSnapshot?.() || { enabled: false, count: 0, shared: false }),
    persistence: appCtx.getBuildPersistenceStatus?.() || null
  },
  interior: appCtx.activeInterior ? {
    active: true,
    key: String(appCtx.activeInterior.key || ''),
    floorId: String(appCtx.activeInterior.floorId || ''),
    floorLabel: String(appCtx.activeInterior.floorLabel || 'Lobby'),
    activeLevel: Number(appCtx.activeInterior.activeLevel || 0),
    floorCount: Number(appCtx.activeInterior.floorPlan?.floorCount || 1),
    loadedLevels: Array.isArray(appCtx.activeInterior.loadedLevels) ? [...appCtx.activeInterior.loadedLevels] : [],
    connectorsAvailable: appCtx.activeInterior.connector != null
  } : { active: false },
  worldDiscovery: appCtx.worldDiscoveryRuntimeSnapshot?.() || { active: false },
  editableWorld: appCtx.editableWorldRuntimeSnapshot?.() || { active: false },
  transportStructures: transportStructureSnapshot(),
  worldCounts: {
    buildings: appCtx.buildings?.length ?? null,
    roads: appCtx.roads?.length ?? null,
    terrainTiles: appCtx.terrainTileCache?.size ?? null
  }
});
globalThis.advanceTime = async (milliseconds = 0) => {
  const duration = Math.max(0, Number(milliseconds) || 0);
  if (!appCtx.gameStarted) {
    if (duration === 0) return { requestedMs: 0, simulatedMs: 0, frames: 0, mode: 'title-idle' };
    await new Promise((resolve) => {
      const startedAt = performance.now();
      const waitForTitleFrame = (now) => {
        if (now - startedAt >= duration) resolve();
        else globalThis.requestAnimationFrame(waitForTitleFrame);
      };
      globalThis.requestAnimationFrame(waitForTitleFrame);
    });
    return { requestedMs: duration, simulatedMs: 0, frames: 0, mode: 'title-idle' };
  }
  if (typeof appCtx.advanceRuntimeTime === 'function') {
    return appCtx.advanceRuntimeTime(duration);
  }
  if (duration === 0) return { requestedMs: 0, simulatedMs: 0, frames: 0 };
  await new Promise((resolve) => globalThis.setTimeout(resolve, duration));
  return { requestedMs: duration, simulatedMs: 0, frames: 0, fallback: 'wall-clock' };
};

function publishRuntimeDiagnostics() {
  if (!document?.documentElement) return;
  let output = document.getElementById("we3dRuntimeDiagnostics");
  if (!output) {
    output = document.createElement("script");
    output.id = "we3dRuntimeDiagnostics";
    output.type = "application/json";
    document.documentElement.appendChild(output);
  }
  output.textContent = JSON.stringify(getWorldExplorerRuntimeDiagnostics());
}

globalThis.publishWorldExplorerRuntimeDiagnostics = publishRuntimeDiagnostics;

export { getWorldExplorerRuntimeDiagnostics };

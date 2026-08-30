import { ctx as appCtx } from '../shared-context.js?v=55';
import { MARITIME_CATALOG } from './maritime-catalog.js?v=1';
import { createVesselVisual, updateVesselVisual } from './vessel-visual-recipe.js?v=6';

let activeRuntime = null;

function isTouchClient() {
  return globalThis.matchMedia?.('(pointer: coarse)')?.matches === true || Number(globalThis.navigator?.maxTouchPoints || 0) > 0;
}

function recordPoint(record) {
  const points = record?.geometry?.points || [];
  if (!points.length) return null;
  return points[Math.floor(points.length * .5)];
}

function recordYaw(record) {
  const points = record?.geometry?.points || [];
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points.at(-1);
  return Math.atan2(last.x - first.x, last.z - first.z);
}

function maritimeAnchors(graph) {
  const priority = ['marina', 'pier', 'ferry_terminal', 'quay', 'dock', 'berth', 'port', 'harbour', 'mooring', 'ferry_route'];
  return (graph?.byDomain?.maritime || [])
    .filter((record) => recordPoint(record))
    .sort((left, right) => priority.indexOf(left.type) - priority.indexOf(right.type));
}

function preferredAnchor(anchors, catalog, index) {
  const roleTypes = catalog.role === 'runabout' || catalog.role === 'sailboat'
    ? ['marina', 'mooring', 'pier']
    : catalog.role === 'ferry'
      ? ['ferry_terminal', 'ferry_route', 'pier']
      : catalog.role === 'cargo' || catalog.role === 'tug'
        ? ['port', 'harbour', 'quay', 'dock', 'berth']
        : ['pier', 'quay', 'dock', 'port', 'harbour'];
  return anchors.find((record) => roleTypes.includes(record.type)) || anchors[index % anchors.length];
}

function vesselFootprintFitsWater(x, z, yaw, catalog) {
  const halfLength = catalog.dimensions.length * .44;
  const halfWidth = catalog.dimensions.width * .44;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const samples = [
    [0, 0],
    [0, halfLength],
    [0, -halfLength],
    [halfWidth, halfLength * .72],
    [-halfWidth, halfLength * .72],
    [halfWidth, -halfLength * .72],
    [-halfWidth, -halfLength * .72]
  ];
  const includeWaterways = catalog.dimensions.length < 32;
  const edgeBuffer = Math.max(1.2, Math.min(8, catalog.dimensions.width * .08));
  return samples.every(([right, forward]) => appCtx.isPointInsideWaterFootprint?.(
    x + rightX * right + forwardX * forward,
    z + rightZ * right + forwardZ * forward,
    { includeWaterways, edgeBuffer }
  ) === true);
}

function findWaterPlacement(anchor, catalog, index) {
  const point = recordPoint(anchor);
  const yaw = recordYaw(anchor);
  const lateral = ((index % 3) - 1) * Math.max(12, Math.min(70, catalog.dimensions.width * 1.4));
  const along = (Math.floor(index / 3) - 1) * Math.max(18, Math.min(95, catalog.dimensions.length * .35));
  const queryX = point.x + Math.cos(yaw) * lateral + Math.sin(yaw) * along;
  const queryZ = point.z - Math.sin(yaw) * lateral + Math.cos(yaw) * along;
  const searchRadius = Math.max(180, Math.min(720, catalog.dimensions.length * 3.2));
  const points = [{ x: queryX, z: queryZ }];
  const rings = catalog.dimensions.length >= 80 ? [70, 140, 230, 340, 480, 620] : [35, 75, 130, 210];
  rings.forEach((radius) => {
    for (let step = 0; step < 12; step += 1) {
      const angle = step / 12 * Math.PI * 2;
      points.push({ x: point.x + Math.cos(angle) * radius, z: point.z + Math.sin(angle) * radius });
    }
  });
  for (const searchPoint of points) {
    const candidate = appCtx.inspectBoatCandidate?.(searchPoint.x, searchPoint.z, searchRadius, {
      allowSynthetic: false,
      requireContainment: false,
      waterKind: catalog.role === 'cargo' || catalog.role === 'research' ? 'open_ocean' : 'harbor'
    });
    if (!candidate) continue;
    const candidateYaw = candidate.tangent && Number.isFinite(candidate.tangent.x) && Number.isFinite(candidate.tangent.z)
      ? Math.atan2(candidate.tangent.x, candidate.tangent.z)
      : yaw;
    if (candidate.type === 'area' && candidate.entryPoint && Number.isFinite(candidate.centerX) && Number.isFinite(candidate.centerZ)) {
      const inwardX = Number(candidate.centerX) - Number(candidate.entryPoint.x);
      const inwardZ = Number(candidate.centerZ) - Number(candidate.entryPoint.z);
      const inwardLength = Math.hypot(inwardX, inwardZ) || 1;
      const minimumDepth = Math.max(8, catalog.dimensions.width * .72 + 3);
      const berthDepths = [minimumDepth, minimumDepth + 8, minimumDepth + 18, minimumDepth + 34, minimumDepth + 58];
      for (const depth of berthDepths) {
        const berthX = Number(candidate.entryPoint.x) + inwardX / inwardLength * depth;
        const berthZ = Number(candidate.entryPoint.z) + inwardZ / inwardLength * depth;
        if (!vesselFootprintFitsWater(berthX, berthZ, candidateYaw, catalog)) continue;
        const berthCandidate = appCtx.inspectBoatCandidate?.(berthX, berthZ, searchRadius, {
          allowSynthetic: false,
          requireContainment: true,
          waterKind: candidate.waterKind || 'harbor'
        });
        if (berthCandidate) return { x: berthX, z: berthZ, yaw: candidateYaw, candidate: berthCandidate };
      }
    }
    const x = Number(candidate.spawnX);
    const z = Number(candidate.spawnZ);
    if (![x, z].every(Number.isFinite) || !vesselFootprintFitsWater(x, z, candidateYaw, catalog)) continue;
    return { x, z, yaw: candidateYaw, candidate };
  }
  return null;
}

function derivedFleet(graph, options = {}) {
  const anchors = maritimeAnchors(graph);
  if (!anchors.length) return [];
  return MARITIME_CATALOG.map((catalog, index) => {
    const anchor = preferredAnchor(anchors, catalog, index);
    const placement = findWaterPlacement(anchor, catalog, index);
    if (!placement || ![placement.x, placement.z].every(Number.isFinite)) return null;
    return {
      id: `generated-vessel:${anchor.id}:${catalog.id}`,
      catalog,
      ...placement,
      y: 0,
      condition: 1,
      available: true,
      anchorFacilityId: anchor.id,
      anchorFacilityType: anchor.type,
      mapped: false,
      generatedActivity: true,
      provenance: Object.freeze({
        placement: 'generated-gameplay-activity',
        mappedAnchorId: anchor.id,
        mappedAnchorProvider: anchor.provenance.provider,
        mappedAnchorLicense: anchor.provenance.license
      }),
      mobile: options.mobile === true
    };
  }).filter(Boolean);
}

function waterYAt(x, z) {
  const sampled = appCtx.waterSurfaceYAt?.(x, z);
  if (Number.isFinite(sampled)) return sampled;
  return Number(appCtx.elevationWorldYAtWorldXZ?.(x, z)) || 0;
}

function placeVessel(vessel) {
  vessel.y = waterYAt(vessel.x, vessel.z) + Math.min(vessel.catalog.dimensions.draft * .5, vessel.catalog.dimensions.width * .22);
  vessel.visual.root.position.set(vessel.x, vessel.y, vessel.z);
  vessel.visual.root.rotation.order = 'YXZ';
  vessel.visual.root.rotation.set(0, vessel.yaw, 0);
  vessel.visual.root.userData.transportEntityId = vessel.id;
  vessel.visual.root.userData.anchorFacilityId = vessel.anchorFacilityId;
  vessel.visual.root.userData.generatedActivity = true;
}

function runtimeMatches(runtime) {
  return !!runtime && runtime.sequence === Number(appCtx.worldPublication?.sequence) && runtime.requestId === String(appCtx.worldPublication?.requestId || '');
}

function actorPosition() {
  if (appCtx.boatMode?.active) return appCtx.boat;
  if (appCtx.Walk?.state?.mode === 'walk') return appCtx.Walk.state.walker;
  return appCtx.car;
}

function boardingDistance(vessel) {
  return Math.max(8, Math.min(18, vessel.catalog.dimensions.width * .52 + 3));
}

function nearestVessel(runtime) {
  if (appCtx.boatMode?.active) return null;
  const actor = actorPosition();
  if (!actor) return null;
  return runtime.vessels
    .filter((vessel) => vessel.available && vessel.catalog.interaction.enterable)
    .map((vessel) => ({ vessel, distance: Math.hypot(vessel.x - actor.x, vessel.z - actor.z) }))
    .filter(({ vessel, distance }) => distance <= boardingDistance(vessel))
    .sort((left, right) => left.distance - right.distance)[0] || null;
}

function interactionCandidate(runtime) {
  if (!runtimeMatches(runtime) || appCtx.getEnv?.() !== 'EARTH' || appCtx.worldLoading || appCtx.activeInterior) return null;
  if (appCtx.boatMode?.active && runtime.activeVessel) {
    return {
      available: true,
      action: 'exit_vessel',
      label: 'Exit vessel',
      detail: `${runtime.activeVessel.catalog.label} · dock before leaving`,
      distance: 0,
      data: { vesselId: runtime.activeVessel.id }
    };
  }
  const nearest = nearestVessel(runtime);
  if (!nearest) return null;
  return {
    available: true,
    action: 'enter_vessel',
    label: `Pilot ${nearest.vessel.catalog.label}`,
    detail: `Ready near the local ${String(nearest.vessel.anchorFacilityType || 'waterfront').replaceAll('_', ' ')}`,
    distance: nearest.distance,
    data: { vesselId: nearest.vessel.id }
  };
}

function enterVessel(runtime, vessel) {
  if (!vessel?.available || !runtimeMatches(runtime)) return false;
  runtime.activeVessel = vessel;
  vessel.available = false;
  vessel.visual.root.visible = false;
  const started = appCtx.setTravelMode?.('boat', {
    source: 'maritime_boarding',
    force: true,
    spawnX: vessel.x,
    spawnZ: vessel.z,
    yaw: vessel.yaw,
    candidate: vessel.candidate,
    entryMode: appCtx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive',
    transportEntityId: vessel.id,
    transportCatalogId: vessel.catalog.id,
    condition: vessel.condition
  }) === 'boat';
  if (!started) {
    vessel.available = true;
    vessel.visual.root.visible = true;
    runtime.activeVessel = null;
    return false;
  }
  appCtx.showToast?.(`${vessel.catalog.label} ready. Use the existing Boat Mode controls to throttle, steer, brake, fish, or dive.`);
  return true;
}

function restoreActiveVessel(runtime, snapshot = {}) {
  const vessel = runtime?.activeVessel;
  if (!vessel || (snapshot.transportEntityId && snapshot.transportEntityId !== vessel.id)) return false;
  vessel.x = Number.isFinite(snapshot.x) ? snapshot.x : vessel.x;
  vessel.z = Number.isFinite(snapshot.z) ? snapshot.z : vessel.z;
  vessel.yaw = Number.isFinite(snapshot.yaw) ? snapshot.yaw : vessel.yaw;
  vessel.condition = Number.isFinite(snapshot.condition) ? snapshot.condition : vessel.condition;
  vessel.candidate = snapshot.water || vessel.candidate;
  vessel.available = vessel.condition > .05;
  placeVessel(vessel);
  updateVesselVisual(vessel.visual, vessel.condition);
  vessel.visual.root.visible = vessel.available;
  runtime.activeVessel = null;
  return true;
}

function performInteraction(runtime, candidate) {
  if (candidate?.action === 'enter_vessel') {
    return enterVessel(runtime, runtime.vessels.find(({ id }) => id === candidate.data?.vesselId));
  }
  if (candidate?.action !== 'exit_vessel') return false;
  if (appCtx.canExitBoatMode?.('walk', { source: 'boat_prompt_exit', showNotice: true }) !== true) return true;
  appCtx.setTravelMode?.('walk', { source: 'boat_prompt_exit', force: true });
  return true;
}

function disposeMaritimeRuntime(runtime, reason = 'disposed') {
  if (!runtime) return false;
  runtime.unregisterInteraction?.();
  appCtx.unregisterRuntimeSystem?.(runtime.systemId);
  if (appCtx.onVesselTripEnded === runtime.onTripEnded) delete appCtx.onVesselTripEnded;
  if (globalThis.__WE3D_MARITIME_SUPPORT__ === runtime.supportHook) delete globalThis.__WE3D_MARITIME_SUPPORT__;
  runtime.vessels.forEach((vessel) => vessel.visual.dispose());
  if (runtime.group.parent?.remove) runtime.group.parent.remove(runtime.group);
  else runtime.group.removeFromParent?.();
  runtime.vessels.length = 0;
  runtime.reason = String(reason);
  if (activeRuntime === runtime) activeRuntime = null;
  if (appCtx.maritimeRuntime === runtime) appCtx.maritimeRuntime = null;
  return true;
}

function startMaritimeRuntime(options = {}) {
  const publication = options.snapshot;
  if (!globalThis.THREE || publication?.type !== 'WorldSnapshot') return null;
  disposeMaritimeRuntime(activeRuntime, 'replacement');
  const group = new THREE.Group();
  group.name = 'Playable Maritime Fleet';
  const vessels = derivedFleet(appCtx.transportFacilityGraph, { mobile: isTouchClient() }).map((record) => {
    const visual = createVesselVisual(THREE, record.catalog, { mobile: record.mobile, state: 'berthed' });
    const vessel = { ...record, visual };
    placeVessel(vessel);
    group.add(visual.root);
    return vessel;
  });
  appCtx.addEarthWorldObject?.(group);
  const runtime = {
    requestId: String(publication.requestId || ''),
    sequence: Number(publication.sequence),
    group,
    vessels,
    activeVessel: null,
    systemId: `maritime-runtime:${publication.sequence}`,
    reason: ''
  };
  runtime.unregisterInteraction = appCtx.registerContextInteraction?.({
    id: 'maritime_vessel',
    priority: 85,
    evaluate: () => interactionCandidate(runtime),
    perform: (candidate) => performInteraction(runtime, candidate)
  });
  runtime.onTripEnded = (snapshot) => restoreActiveVessel(runtime, snapshot);
  appCtx.onVesselTripEnded = runtime.onTripEnded;
  appCtx.registerRuntimeSystem?.({
    id: runtime.systemId,
    owner: runtime.systemId,
    phase: 'simulation',
    priority: 43,
    critical: false,
    enabled: () => runtimeMatches(runtime),
    update() {
      if (runtime.activeVessel && appCtx.boatMode?.active) {
        runtime.activeVessel.condition = Number(appCtx.boatMode.condition ?? runtime.activeVessel.condition);
      }
    }
  });
  runtime.snapshot = () => Object.freeze({
    active: runtimeMatches(runtime),
    authority: 'shared-transport-maritime-adapter',
    fleetCount: runtime.vessels.length,
    playableCount: runtime.vessels.filter(({ catalog }) => catalog.playable && catalog.enterable).length,
    generatedActivityCount: runtime.vessels.filter(({ generatedActivity }) => generatedActivity).length,
    mappedAnchorCount: new Set(runtime.vessels.map(({ anchorFacilityId }) => anchorFacilityId)).size,
    activeVesselId: runtime.activeVessel?.id || '',
    activeBoat: appCtx.getBoatModeSnapshot?.() || null,
    catalogIds: Object.freeze(runtime.vessels.map(({ catalog }) => catalog.id)),
    vessels: Object.freeze(runtime.vessels.map((vessel) => Object.freeze({
      id: vessel.id,
      catalogId: vessel.catalog.id,
      label: vessel.catalog.label,
      x: Number(vessel.x.toFixed(2)),
      y: Number(vessel.y.toFixed(2)),
      z: Number(vessel.z.toFixed(2)),
      available: vessel.available === true,
      condition: Number(vessel.condition.toFixed(3)),
      anchorFacilityId: vessel.anchorFacilityId
    }))),
    interaction: interactionCandidate(runtime)
  });
  if (appCtx.developerDiagnosticsEnabled) {
    runtime.supportHook = Object.freeze({
      moveNear(vesselId = runtime.vessels[0]?.id) {
        const vessel = runtime.vessels.find(({ id }) => id === String(vesselId));
        if (!vessel) return false;
        const targetX = vessel.x + Math.cos(vessel.yaw) * Math.min(7, vessel.catalog.dimensions.width * .5 + 2);
        const targetZ = vessel.z - Math.sin(vessel.yaw) * Math.min(7, vessel.catalog.dimensions.width * .5 + 2);
        const walker = appCtx.Walk?.state?.walker;
        if (!walker) return false;
        walker.x = targetX;
        walker.z = targetZ;
        walker.y = Number(appCtx.GroundHeight?.walkSurfaceY?.(targetX, targetZ)) || vessel.y + 1.7;
        walker.angle = vessel.yaw;
        walker.yaw = vessel.yaw;
        walker.onGround = true;
        appCtx.Walk?.setModeWalk?.({ preserveResolvedSpawn: true, deferWorldSync: true });
        return true;
      },
      snapshot: runtime.snapshot
    });
    globalThis.__WE3D_MARITIME_SUPPORT__ = runtime.supportHook;
  }
  activeRuntime = runtime;
  appCtx.maritimeRuntime = runtime;
  appCtx.disposeMaritimeRuntime = (reason) => disposeMaritimeRuntime(runtime, reason);
  return runtime;
}

Object.assign(appCtx, {
  disposeMaritimeRuntime: (reason) => disposeMaritimeRuntime(activeRuntime, reason),
  startMaritimeRuntime
});

export { derivedFleet, disposeMaritimeRuntime, startMaritimeRuntime };

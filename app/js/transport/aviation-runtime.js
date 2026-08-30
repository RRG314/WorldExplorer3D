import { ctx as appCtx } from '../shared-context.js?v=55';
import { AVIATION_FLEET_CATALOG, getAviationCatalogEntry } from './aviation-catalog.js?v=3';
import { aircraftGroundOffset, createAircraftVisual, updateAircraftVisual } from './aircraft-visual-recipe.js?v=6';
import { applyTransportDamage } from './damage-model.js?v=1';
import { ENTITY_LIFECYCLE_MS, lifecycleExpired, markLifecycleStart } from '../runtime/entity-lifecycle-policy.js?v=1';
import { evaluateAircraftSkydivingExit } from '../urban-sandbox/parachute-model.js?v=3';

const BOARDING_DISTANCE = 8;
const EXIT_SPEED_LIMIT = 1.5;
let activeRuntime = null;

function isTouchClient() {
  return globalThis.matchMedia?.('(pointer: coarse)')?.matches === true || Number(globalThis.navigator?.maxTouchPoints || 0) > 0;
}

function recordPoint(record) {
  const points = record?.geometry?.points || [];
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  return points[Math.floor(points.length * .5)];
}

function recordYaw(record) {
  const points = record?.geometry?.points || [];
  if (points.length < 2) return 0;
  const start = points[0];
  const end = points.at(-1);
  return Math.atan2(end.x - start.x, end.z - start.z);
}

function aviationAnchors(graph) {
  const preferred = ['parking_position', 'apron', 'hangar', 'runway', 'taxiway', 'aerodrome', 'heliport', 'helipad'];
  return (graph?.byDomain?.aviation || [])
    .filter((record) => recordPoint(record))
    .sort((left, right) => preferred.indexOf(left.type) - preferred.indexOf(right.type));
}

function derivedFleet(graph, options = {}) {
  const anchors = aviationAnchors(graph);
  if (!anchors.length) return [];
  const mobile = options.mobile === true;
  const fixedWingAnchor = anchors.find((record) => !['heliport', 'helipad'].includes(record.type)) || anchors[0];
  const rotorAnchor = anchors.find((record) => ['heliport', 'helipad'].includes(record.type)) || fixedWingAnchor;
  const offsets = [
    { x: 11, z: 2 },
    { x: -13, z: 9 },
    { x: 32, z: -16 },
    { x: -58, z: -24 },
    { x: 112, z: 42 }
  ];
  return AVIATION_FLEET_CATALOG.map((catalog, index) => {
    const anchor = catalog.aircraftKind === 'rotorcraft' ? rotorAnchor : fixedWingAnchor;
    const point = recordPoint(anchor);
    const yaw = recordYaw(anchor);
    const offset = offsets[index];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const x = point.x + offset.x * cos + offset.z * sin;
    const z = point.z - offset.x * sin + offset.z * cos;
    return {
      id: `generated-aircraft:${anchor.id}:${catalog.id}`,
      catalog,
      x,
      z,
      y: 0,
      yaw,
      condition: 1,
      durabilityPolicy: catalog.damage.durabilityPolicy,
      resistance: catalog.damage.resistance,
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
      mobile
    };
  });
}

function groundYAt(x, z) {
  return Number(appCtx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y ?? appCtx.elevationWorldYAtWorldXZ?.(x, z)) || 0;
}

function placeVehicle(vehicle) {
  vehicle.y = groundYAt(vehicle.x, vehicle.z) + aircraftGroundOffset(vehicle.catalog);
  vehicle.visual.root.position.set(vehicle.x, vehicle.y, vehicle.z);
  vehicle.visual.root.rotation.order = 'YXZ';
  vehicle.visual.root.rotation.set(0, vehicle.yaw, 0);
  vehicle.visual.root.userData.transportEntityId = vehicle.id;
  vehicle.visual.root.userData.anchorFacilityId = vehicle.anchorFacilityId;
  vehicle.visual.root.userData.generatedActivity = true;
}

function runtimeMatches(runtime) {
  return !!runtime && runtime.sequence === Number(appCtx.worldPublication?.sequence) &&
    runtime.requestId === String(appCtx.worldPublication?.requestId || '');
}

function actorPosition() {
  if (appCtx.planeMode?.active) return appCtx.planeMode;
  if (appCtx.Walk?.state?.mode === 'walk') return appCtx.Walk.state.walker;
  return null;
}

function nearestAircraft(runtime) {
  const actor = actorPosition();
  if (!actor || appCtx.planeMode?.active) return null;
  return runtime.vehicles
    .filter((vehicle) => vehicle.available && vehicle.catalog.interaction.enterable)
    .map((vehicle) => ({ vehicle, distance: Math.hypot(vehicle.x - actor.x, vehicle.z - actor.z) }))
    .filter(({ distance }) => distance <= BOARDING_DISTANCE)
    .sort((left, right) => left.distance - right.distance)[0] || null;
}

function interactionCandidate(runtime) {
  if (!runtimeMatches(runtime) || appCtx.getEnv?.() !== 'EARTH' || appCtx.worldLoading || appCtx.activeInterior) return null;
  if (appCtx.planeMode?.active) {
    const speed = Math.abs(Number(appCtx.planeMode.speed) || 0);
    const groundY = groundYAt(appCtx.planeMode.x, appCtx.planeMode.z);
    const skydiving = evaluateAircraftSkydivingExit({
      airborne: appCtx.planeMode.airborne === true,
      aircraftY: appCtx.planeMode.y,
      groundY
    });
    const canExit = !appCtx.planeMode.airborne && speed <= EXIT_SPEED_LIMIT;
    return {
      available: true,
      action: 'exit_aircraft',
      label: skydiving.allowed || canExit ? 'Exit aircraft' : appCtx.planeMode.airborne ? 'Too low to exit safely' : 'Stop to exit',
      detail: skydiving.allowed
        ? `${getAviationCatalogEntry(appCtx.planeMode.transportCatalogId).label} · parachute ready after exit`
        : getAviationCatalogEntry(appCtx.planeMode.transportCatalogId).label,
      distance: 0,
      data: { canExit, canJump: skydiving.allowed, clearance: skydiving.clearance, autoEquip: skydiving.autoEquip }
    };
  }
  const nearest = nearestAircraft(runtime);
  if (!nearest) return null;
  return {
    available: true,
    action: 'enter_aircraft',
    label: `Fly ${nearest.vehicle.catalog.label}`,
    detail: `${nearest.vehicle.catalog.aircraftKind === 'rotorcraft' ? 'Helicopter' : 'Aircraft'} · virtual fleet at mapped ${nearest.vehicle.anchorFacilityType}`,
    distance: nearest.distance,
    data: { aircraftId: nearest.vehicle.id }
  };
}

function enterAircraft(runtime, vehicle) {
  if (!vehicle?.available || !runtimeMatches(runtime)) return false;
  runtime.activeAircraft = vehicle;
  vehicle.available = false;
  vehicle.visual.root.visible = false;
  const started = appCtx.setTravelMode?.('plane', {
    source: 'aviation_boarding',
    x: vehicle.x,
    y: vehicle.y,
    z: vehicle.z,
    yaw: vehicle.yaw,
    speed: 0,
    throttle: 0,
    airborne: false,
    transportEntityId: vehicle.id,
    transportCatalogId: vehicle.catalog.id,
    condition: vehicle.condition
  }) === 'plane';
  if (!started) {
    vehicle.available = true;
    vehicle.visual.root.visible = true;
    runtime.activeAircraft = null;
    return false;
  }
  appCtx.showToast?.(`${vehicle.catalog.label} ready. Increase throttle, steer, then pitch up for takeoff.`);
  return true;
}

function restoreActiveAircraft(runtime, snapshot = {}) {
  const vehicle = runtime?.activeAircraft;
  if (!vehicle) return false;
  vehicle.x = Number.isFinite(snapshot.x) ? snapshot.x : vehicle.x;
  vehicle.z = Number.isFinite(snapshot.z) ? snapshot.z : vehicle.z;
  vehicle.y = Number.isFinite(snapshot.y) ? snapshot.y : groundYAt(vehicle.x, vehicle.z) + aircraftGroundOffset(vehicle.catalog);
  vehicle.yaw = Number.isFinite(snapshot.yaw) ? snapshot.yaw : vehicle.yaw;
  vehicle.condition = Number.isFinite(snapshot.condition) ? snapshot.condition : vehicle.condition;
  vehicle.available = vehicle.condition > .05;
  vehicle.disabledAt = vehicle.available ? 0 : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  placeVehicle(vehicle);
  vehicle.visual.root.visible = true;
  updateAircraftVisual(vehicle.visual, vehicle.condition, 0);
  runtime.activeAircraft = null;
  return true;
}

function recoverDisabledAircraft(vehicle) {
  if (!vehicle?.home) return false;
  vehicle.x = vehicle.home.x;
  vehicle.y = vehicle.home.y;
  vehicle.z = vehicle.home.z;
  vehicle.yaw = vehicle.home.yaw;
  vehicle.condition = 1;
  vehicle.disabledAt = 0;
  vehicle.unmanned = null;
  vehicle.available = true;
  placeVehicle(vehicle);
  vehicle.visual.root.visible = true;
  updateAircraftVisual(vehicle.visual, vehicle.condition, 0);
  return true;
}

function updateAircraftLifecycle(vehicle) {
  if (!vehicle || vehicle.unmanned) return;
  if (vehicle.condition > .05) {
    vehicle.disabledAt = 0;
    return;
  }
  vehicle.available = false;
  vehicle.visual.root.visible = true;
  const current = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const disabledAt = markLifecycleStart(vehicle, 'disabledAt', current);
  if (lifecycleExpired(disabledAt, ENTITY_LIFECYCLE_MS.disabledTransport, current)) recoverDisabledAircraft(vehicle);
}

function beginUnmannedFlight(runtime, snapshot = {}) {
  const vehicle = runtime?.activeAircraft;
  if (!vehicle) return false;
  vehicle.x = Number(snapshot.x) || vehicle.x;
  vehicle.y = Number(snapshot.y) || vehicle.y;
  vehicle.z = Number(snapshot.z) || vehicle.z;
  vehicle.yaw = Number(snapshot.yaw) || vehicle.yaw;
  vehicle.condition = Number.isFinite(snapshot.condition) ? snapshot.condition : vehicle.condition;
  vehicle.available = false;
  vehicle.unmanned = {
    elapsed: 0,
    vx: Number(snapshot.vx) || Math.sin(vehicle.yaw) * Number(snapshot.speed || 0),
    vy: Number(snapshot.vy) || 0,
    vz: Number(snapshot.vz) || Math.cos(vehicle.yaw) * Number(snapshot.speed || 0),
    initialSpeed: Math.max(0, Number(snapshot.speed) || 0)
  };
  placeVehicle(vehicle);
  vehicle.y = Number(snapshot.y) || vehicle.y;
  vehicle.visual.root.position.y = vehicle.y;
  vehicle.visual.root.visible = true;
  runtime.activeAircraft = null;
  return true;
}

function beginSkydiving(runtime, candidate) {
  const snapshot = appCtx.getPlaneSnapshot?.() || {};
  const groundY = groundYAt(snapshot.x, snapshot.z);
  const eligibility = evaluateAircraftSkydivingExit({
    airborne: snapshot.airborne === true,
    aircraftY: snapshot.y,
    groundY
  });
  if (!eligibility.allowed) {
    appCtx.showToast?.('Climb higher before jumping from the aircraft.');
    return true;
  }
  appCtx.stopPlaneMode?.({ targetMode: 'skydive', suppressFlightEnded: true });
  const walker = appCtx.Walk?.state?.walker;
  if (!walker || !appCtx.Walk?.setModeWalk) return false;
  walker.x = Number(snapshot.x) || 0;
  walker.y = Number(snapshot.y) || groundY + 1.7;
  walker.z = Number(snapshot.z) || 0;
  walker.angle = Number(snapshot.yaw) || 0;
  walker.yaw = walker.angle;
  walker.lookYawOffset = 0;
  walker.vx = Number(snapshot.vx) || 0;
  walker.vy = Math.min(-1.2, Number(snapshot.vy) || -1.2);
  walker.vz = Number(snapshot.vz) || 0;
  walker.onGround = false;
  appCtx.Walk.setModeWalk({
    preserveResolvedSpawn: true,
    preserveResolvedSurface: true,
    deferWorldSync: true
  });
  walker.vy = Math.min(-1.2, Number(snapshot.vy) || -1.2);
  walker.onGround = false;
  beginUnmannedFlight(runtime, snapshot);
  appCtx.prepareAirborneParachute?.({
    autoEquip: eligibility.autoEquip,
    clearance: eligibility.clearance,
    source: 'aircraft_exit'
  });
  appCtx.updateControlsModeUI?.();
  return true;
}

function performInteraction(runtime, candidate) {
  if (candidate?.action === 'enter_aircraft') {
    return enterAircraft(runtime, runtime.vehicles.find(({ id }) => id === candidate.data?.aircraftId));
  }
  if (candidate?.action !== 'exit_aircraft') return false;
  if (candidate.data?.canJump === true) return beginSkydiving(runtime, candidate);
  if (candidate.data?.canExit !== true) {
    appCtx.showToast?.(appCtx.planeMode?.airborne ? 'Climb higher or land before leaving the aircraft.' : 'Come to a complete stop before leaving the aircraft.');
    return true;
  }
  const snapshot = appCtx.getPlaneSnapshot?.() || {};
  appCtx.setTravelMode?.('walk', { source: 'aviation_exit' });
  restoreActiveAircraft(runtime, snapshot);
  return true;
}

function updateUnmannedAircraft(vehicle, dt) {
  const flight = vehicle.unmanned;
  if (!flight) return;
  const step = Math.max(0, Math.min(.05, Number(dt) || 0));
  flight.elapsed += step;
  const rotorcraft = vehicle.catalog.aircraftKind === 'rotorcraft';
  const drag = Math.exp(-(rotorcraft ? .4 : .08) * step);
  flight.vx *= drag;
  flight.vz *= drag;
  flight.vy -= (rotorcraft ? 3.4 : flight.elapsed > 7 ? 2.2 : .35) * step;
  vehicle.x += flight.vx * step;
  vehicle.y += flight.vy * step;
  vehicle.z += flight.vz * step;
  if (Math.hypot(flight.vx, flight.vz) > .2) vehicle.yaw = Math.atan2(flight.vx, flight.vz);
  const groundY = groundYAt(vehicle.x, vehicle.z);
  const parkedY = groundY + aircraftGroundOffset(vehicle.catalog);
  if (vehicle.y <= parkedY) {
    const impactSpeed = Math.hypot(flight.vx, flight.vy, flight.vz);
    vehicle.y = parkedY;
    vehicle.unmanned = null;
    applyTransportDamage(vehicle, Math.max(0, impactSpeed - 4) * 2.8);
    vehicle.available = vehicle.condition > .05;
    vehicle.disabledAt = vehicle.available ? 0 : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  } else if (flight.elapsed >= 40) {
    vehicle.x = vehicle.home.x;
    vehicle.y = vehicle.home.y;
    vehicle.z = vehicle.home.z;
    vehicle.yaw = vehicle.home.yaw;
    vehicle.unmanned = null;
    vehicle.available = vehicle.condition > .05;
    vehicle.disabledAt = vehicle.available ? 0 : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }
  vehicle.visual.root.position.set(vehicle.x, vehicle.y, vehicle.z);
  vehicle.visual.root.rotation.set(0, vehicle.yaw, 0);
  updateAircraftVisual(vehicle.visual, vehicle.condition, step);
}

function disposeAviationRuntime(runtime, reason = 'disposed') {
  if (!runtime) return false;
  runtime.unregisterInteraction?.();
  appCtx.unregisterRuntimeSystem?.(runtime.systemId);
  if (appCtx.onAircraftFlightEnded === runtime.onFlightEnded) delete appCtx.onAircraftFlightEnded;
  if (globalThis.__WE3D_AVIATION_SUPPORT__ === runtime.supportHook) delete globalThis.__WE3D_AVIATION_SUPPORT__;
  runtime.vehicles.forEach((vehicle) => vehicle.visual.dispose());
  if (runtime.group.parent?.remove) runtime.group.parent.remove(runtime.group);
  else runtime.group.removeFromParent?.();
  runtime.vehicles.length = 0;
  runtime.reason = String(reason);
  if (activeRuntime === runtime) activeRuntime = null;
  if (appCtx.aviationRuntime === runtime) appCtx.aviationRuntime = null;
  return true;
}

function startAviationRuntime(options = {}) {
  const publication = options.snapshot;
  if (!globalThis.THREE || publication?.type !== 'WorldSnapshot') return null;
  disposeAviationRuntime(activeRuntime, 'replacement');
  const group = new THREE.Group();
  group.name = 'Playable Aviation Fleet';
  const vehicles = derivedFleet(appCtx.transportFacilityGraph, { mobile: isTouchClient() }).map((record) => {
    const visual = createAircraftVisual(THREE, record.catalog, { mobile: record.mobile, state: 'parked' });
    const vehicle = { ...record, visual, available: true, unmanned: null, disabledAt: 0 };
    placeVehicle(vehicle);
    vehicle.home = Object.freeze({ x: vehicle.x, y: vehicle.y, z: vehicle.z, yaw: vehicle.yaw });
    group.add(visual.root);
    return vehicle;
  });
  appCtx.addEarthWorldObject?.(group);
  const runtime = {
    requestId: String(publication.requestId || ''),
    sequence: Number(publication.sequence),
    group,
    vehicles,
    activeAircraft: null,
    systemId: `aviation-runtime:${publication.sequence}`,
    reason: ''
  };
  runtime.unregisterInteraction = appCtx.registerContextInteraction?.({
    id: 'aviation_vehicle',
    priority: 86,
    evaluate: () => interactionCandidate(runtime),
    perform: (candidate) => performInteraction(runtime, candidate)
  });
  runtime.onFlightEnded = (snapshot) => restoreActiveAircraft(runtime, snapshot);
  appCtx.onAircraftFlightEnded = runtime.onFlightEnded;
  appCtx.registerRuntimeSystem?.({
    id: runtime.systemId,
    owner: runtime.systemId,
    phase: 'simulation',
    priority: 42,
    critical: false,
    enabled: () => runtimeMatches(runtime),
    update(frame) {
      runtime.vehicles.forEach((vehicle) => {
        if (vehicle.unmanned) updateUnmannedAircraft(vehicle, frame.dt);
        else if (vehicle !== runtime.activeAircraft) {
          if (vehicle.available) updateAircraftVisual(vehicle.visual, vehicle.condition, frame.dt);
          updateAircraftLifecycle(vehicle);
        }
      });
      if (runtime.activeAircraft && appCtx.planeMode?.active) {
        runtime.activeAircraft.condition = Number(appCtx.planeMode.condition ?? runtime.activeAircraft.condition);
      }
    }
  });
  runtime.snapshot = () => Object.freeze({
    active: runtimeMatches(runtime),
    authority: 'shared-transport-aviation-adapter',
    fleetCount: runtime.vehicles.length,
    playableCount: runtime.vehicles.filter(({ catalog }) => catalog.playable && catalog.enterable).length,
    generatedActivityCount: runtime.vehicles.filter(({ generatedActivity }) => generatedActivity).length,
    mappedAnchorCount: new Set(runtime.vehicles.map(({ anchorFacilityId }) => anchorFacilityId)).size,
    activeAircraftId: runtime.activeAircraft?.id || '',
    unmannedAircraftCount: runtime.vehicles.filter(({ unmanned }) => unmanned).length,
    catalogIds: Object.freeze(runtime.vehicles.map(({ catalog }) => catalog.id)),
    vehicles: Object.freeze(runtime.vehicles.map((vehicle) => Object.freeze({
      id: vehicle.id,
      catalogId: vehicle.catalog.id,
      label: vehicle.catalog.label,
      x: Number(vehicle.x.toFixed(2)),
      y: Number(vehicle.y.toFixed(2)),
      z: Number(vehicle.z.toFixed(2)),
      available: vehicle.available === true,
      unmanned: vehicle.unmanned != null,
      condition: Number(vehicle.condition.toFixed(3)),
      anchorFacilityId: vehicle.anchorFacilityId
    }))),
    interaction: interactionCandidate(runtime)
  });
  if (appCtx.developerDiagnosticsEnabled) {
    runtime.supportHook = Object.freeze({
      moveNear(aircraftId = runtime.vehicles[0]?.id) {
        const vehicle = runtime.vehicles.find(({ id }) => id === String(aircraftId));
        if (!vehicle) return false;
        const targetX = vehicle.x + Math.cos(vehicle.yaw) * Math.min(3.2, vehicle.catalog.dimensions.width * .7 + 1);
        const targetZ = vehicle.z - Math.sin(vehicle.yaw) * Math.min(3.2, vehicle.catalog.dimensions.width * .7 + 1);
        const resolved = appCtx.resolveSafeWorldSpawn?.(targetX, targetZ, {
          mode: 'walk', angle: vehicle.yaw, source: 'aviation_verification', maxGroundRadius: 10
        });
        if (!resolved) return false;
        appCtx.applyResolvedWorldSpawn?.(resolved, { mode: 'walk', syncWalker: true, syncCar: false });
        return true;
      },
      snapshot: runtime.snapshot,
      ageDisabled(aircraftId = runtime.vehicles[0]?.id) {
        const vehicle = runtime.vehicles.find(({ id }) => id === String(aircraftId));
        if (!vehicle || vehicle === runtime.activeAircraft) return false;
        vehicle.condition = 0;
        vehicle.available = false;
        vehicle.disabledAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - ENTITY_LIFECYCLE_MS.disabledTransport - 1;
        updateAircraftLifecycle(vehicle);
        return vehicle.condition === 1 && vehicle.available === true;
      }
    });
    globalThis.__WE3D_AVIATION_SUPPORT__ = runtime.supportHook;
  }
  activeRuntime = runtime;
  appCtx.aviationRuntime = runtime;
  appCtx.disposeAviationRuntime = (reason) => disposeAviationRuntime(runtime, reason);
  return runtime;
}

Object.assign(appCtx, {
  disposeAviationRuntime: (reason) => disposeAviationRuntime(activeRuntime, reason),
  startAviationRuntime
});

export { derivedFleet, disposeAviationRuntime, startAviationRuntime };

import { ctx as appCtx } from '../shared-context.js?v=55';
import { AVIATION_FLEET_CATALOG, getAviationCatalogEntry } from './aviation-catalog.js?v=4';
import { aircraftGroundOffset, createAircraftVisual, updateAircraftVisual } from './aircraft-visual-recipe.js?v=11';
import { applyTransportDamage } from './damage-model.js?v=1';
import { ENTITY_LIFECYCLE_MS, lifecycleExpired, markLifecycleStart } from '../runtime/entity-lifecycle-policy.js?v=1';
import { evaluateAircraftSkydivingExit } from '../urban-sandbox/parachute-model.js?v=6';
import { advanceAmbientRouteMotion, ambientRouteSnapshot, createAmbientRouteMotion } from './ambient-route-motion.js?v=1';
import { compileAirportOperationalLayout, offsetPoint } from './airport-layout.js?v=6';
import { createAirportHub } from './airport-hub.js?v=4';

const BOARDING_DISTANCE = 8;
const EXIT_SPEED_LIMIT = 1.5;
let activeRuntime = null;

function ensureDynamicColliderList() {
  if (!Array.isArray(appCtx.dynamicBuildingColliders)) appCtx.dynamicBuildingColliders = [];
  return appCtx.dynamicBuildingColliders;
}

function updateRectCollider(collider, vehicle, halfWidth, halfLength, minYOffset, maxYOffset) {
  const cos = Math.cos(vehicle.yaw);
  const sin = Math.sin(vehicle.yaw);
  collider.pts = [[-halfWidth, -halfLength], [halfWidth, -halfLength], [halfWidth, halfLength], [-halfWidth, halfLength]].map(([right, forward]) => ({
    x: vehicle.x + right * cos + forward * sin,
    z: vehicle.z - right * sin + forward * cos
  }));
  collider.minX = Math.min(...collider.pts.map(({ x }) => x));
  collider.maxX = Math.max(...collider.pts.map(({ x }) => x));
  collider.minZ = Math.min(...collider.pts.map(({ z }) => z));
  collider.maxZ = Math.max(...collider.pts.map(({ z }) => z));
  collider.centerX = vehicle.x;
  collider.centerZ = vehicle.z;
  collider.minY = vehicle.y + minYOffset;
  collider.maxY = vehicle.y + maxYOffset;
  collider.baseY = collider.minY;
  collider.height = Math.max(.2, collider.maxY - collider.minY);
  collider.collisionDisabled = vehicle.visual?.root?.visible === false || vehicle === activeRuntime?.activeAircraft;
}

function createAircraftColliders(vehicle) {
  const entry = vehicle.catalog;
  const body = {
    sourceBuildingId: `dynamic:${vehicle.id}:body`,
    name: entry.label,
    buildingType: 'aircraft',
    collisionKind: 'solid',
    geometrySource: 'generated-gameplay-activity'
  };
  const wing = { ...body, sourceBuildingId: `dynamic:${vehicle.id}:wing`, name: `${entry.label} wings` };
  vehicle.colliders = entry.aircraftKind === 'rotorcraft' ? [body] : [body, wing];
  updateRectCollider(body, vehicle, Math.max(.7, entry.dimensions.width * .5), Math.max(1.4, entry.dimensions.length * .43), -aircraftGroundOffset(entry), entry.dimensions.height * .72);
  if (vehicle.colliders.length > 1) {
    updateRectCollider(wing, vehicle, entry.dimensions.wingspan * .49, Math.max(.7, entry.dimensions.length * .105), -entry.dimensions.height * .08, entry.dimensions.height * .19);
  }
  ensureDynamicColliderList().push(...vehicle.colliders);
}

function updateAircraftColliders(vehicle) {
  const [body, wing] = vehicle.colliders || [];
  if (!body) return;
  const entry = vehicle.catalog;
  updateRectCollider(body, vehicle, Math.max(.7, entry.dimensions.width * .5), Math.max(1.4, entry.dimensions.length * .43), -aircraftGroundOffset(entry), entry.dimensions.height * .72);
  if (wing) updateRectCollider(wing, vehicle, entry.dimensions.wingspan * .49, Math.max(.7, entry.dimensions.length * .105), -entry.dimensions.height * .08, entry.dimensions.height * .19);
}

function aircraftBoardingPoint(vehicle) {
  const side = -1;
  const right = side * (Math.max(.7, vehicle.catalog.dimensions.width * .5) + 1.05);
  const forward = Math.min(vehicle.catalog.dimensions.length * .25, 5.5);
  return {
    x: vehicle.x + Math.cos(vehicle.yaw) * right + Math.sin(vehicle.yaw) * forward,
    z: vehicle.z - Math.sin(vehicle.yaw) * right + Math.cos(vehicle.yaw) * forward
  };
}

function moveWalkerForSupport(x, z, yaw = 0) {
  const walker = appCtx.Walk?.state?.walker;
  if (!walker || ![x, z].every(Number.isFinite)) return false;
  appCtx.setTravelMode?.('walk', { source: 'aviation_verification', force: true, emitTutorial: false });
  const groundY = Number(appCtx.SurfaceQuery?.walkAt?.(x, z)?.position?.y ?? groundYAt(x, z)) || 0;
  walker.x = x;
  walker.z = z;
  walker.y = groundY + 1.7;
  walker.angle = yaw;
  walker.yaw = yaw;
  walker.vx = 0;
  walker.vy = 0;
  walker.vz = 0;
  walker.onGround = true;
  if (appCtx.Walk?.state?.characterMesh) {
    appCtx.Walk.state.characterMesh.position.set(x, groundY + .04, z);
    appCtx.Walk.state.characterMesh.rotation.y = yaw;
  }
  return true;
}

function createTicketHallCollider(layout) {
  if (!layout?.ticketCounter || layout.hasMappedTerminal) return null;
  const terminal = layout.ticketCounter;
  const halfWidth = layout.large ? 27 : 19;
  const halfLength = layout.large ? 10 : 7.5;
  const collider = {
    sourceBuildingId: 'dynamic:airport-ticket-hall',
    name: 'Airport ticket hall',
    buildingType: 'terminal',
    collisionKind: 'solid',
    geometrySource: 'generated-gameplay-activity',
    minY: groundYAt(terminal.x, terminal.z),
    height: 9,
    collisionDisabled: false
  };
  collider.maxY = collider.minY + collider.height;
  collider.baseY = collider.minY;
  const cos = Math.cos(terminal.yaw);
  const sin = Math.sin(terminal.yaw);
  collider.pts = [[-halfWidth, -halfLength], [halfWidth, -halfLength], [halfWidth, halfLength], [-halfWidth, halfLength]].map(([right, forward]) => ({
    x: terminal.x + right * cos + forward * sin,
    z: terminal.z - right * sin + forward * cos
  }));
  collider.minX = Math.min(...collider.pts.map(({ x }) => x));
  collider.maxX = Math.max(...collider.pts.map(({ x }) => x));
  collider.minZ = Math.min(...collider.pts.map(({ z }) => z));
  collider.maxZ = Math.max(...collider.pts.map(({ z }) => z));
  collider.centerX = terminal.x;
  collider.centerZ = terminal.z;
  ensureDynamicColliderList().push(collider);
  return collider;
}

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
  const layout = options.airportLayout || compileAirportOperationalLayout(graph, options);
  if (!layout?.stands?.length) return [];
  const fixedWingAnchor = anchors.find((record) => !['heliport', 'helipad'].includes(record.type)) || anchors[0];
  const rotorAnchor = anchors.find((record) => ['heliport', 'helipad'].includes(record.type)) || fixedWingAnchor;
  const catalogPatterns = Object.freeze({
    major: Object.freeze(['regional-jet', 'business-jet', 'long-range-airliner', 'expedition-prop', 'business-jet', 'regional-jet', 'utility-helicopter']),
    regional: Object.freeze(['expedition-prop', 'business-jet', 'regional-jet', 'expedition-prop', 'utility-helicopter', 'business-jet', 'regional-jet']),
    local: Object.freeze(['expedition-prop', 'expedition-prop', 'business-jet', 'expedition-prop', 'utility-helicopter', 'expedition-prop'])
  });
  const catalogPattern = catalogPatterns[layout.scale] || catalogPatterns.regional;
  const catalogById = new Map(AVIATION_FLEET_CATALOG.map((catalog) => [catalog.id, catalog]));
  return layout.stands.map((stand, index) => {
    const catalog = catalogById.get(catalogPattern[index % catalogPattern.length]) || AVIATION_FLEET_CATALOG[index % AVIATION_FLEET_CATALOG.length];
    const anchor = catalog.aircraftKind === 'rotorcraft' ? rotorAnchor : fixedWingAnchor;
    return {
      id: `generated-aircraft:${anchor.id}:${catalog.id}:${index}`,
      catalog,
      x: stand.x,
      z: stand.z,
      y: 0,
      yaw: stand.yaw,
      condition: 1,
      durabilityPolicy: catalog.damage.durabilityPolicy,
      resistance: catalog.damage.resistance,
      anchorFacilityId: anchor.id,
      anchorFacilityType: anchor.type,
      standId: stand.id,
      trafficIntent: index === 1 || index === Math.min(8, layout.stands.length - 1) ? 'circuit' : index % 6 === 3 ? 'taxi' : 'parked',
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
  const airportSurface = appCtx.transportFacilityVisual?.surfaceYAt?.(x, z);
  if (Number.isFinite(airportSurface)) return airportSurface;
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
  updateAircraftColliders(vehicle);
}

function taxiPoint(home, yaw, right, forward) {
  return {
    x: home.x + Math.cos(yaw) * right + Math.sin(yaw) * forward,
    z: home.z - Math.sin(yaw) * right + Math.cos(yaw) * forward
  };
}

function createAircraftTaxiMotion(vehicle, index = 0) {
  if (vehicle.catalog.aircraftKind !== 'fixed-wing') return null;
  if (!['business', 'regional', 'airliner'].includes(vehicle.catalog.role)) return null;
  if (vehicle.mobile && vehicle.catalog.role !== 'business') return null;
  const length = vehicle.catalog.dimensions.length;
  const span = vehicle.catalog.dimensions.wingspan;
  const forward = Math.max(34, Math.min(118, length * 1.7));
  const lane = Math.max(11, Math.min(34, span * .55));
  const direction = index % 2 === 0 ? 1 : -1;
  const home = vehicle.home;
  const points = [
    { x: home.x, z: home.z },
    taxiPoint(home, home.yaw, lane * direction, forward),
    taxiPoint(home, home.yaw, lane * direction, -forward * .72),
    taxiPoint(home, home.yaw, 0, -forward * .38),
    { x: home.x, z: home.z }
  ];
  const cruiseSpeed = vehicle.catalog.role === 'airliner' ? 3.6 : vehicle.catalog.role === 'regional' ? 4.4 : 5.2;
  return createAmbientRouteMotion(points, {
    cruiseSpeed,
    acceleration: vehicle.catalog.role === 'airliner' ? .2 : .34,
    yawRate: vehicle.catalog.role === 'airliner' ? .08 : vehicle.catalog.role === 'regional' ? .12 : .18,
    dwellSeconds: 6,
    initialDwellSeconds: 1.5 + index * 1.4
  });
}

function updateAmbientTaxi(vehicle, dt) {
  const motion = vehicle?.ambientMotion;
  if (!motion || vehicle.condition <= .05 || vehicle.unmanned) return false;
  advanceAmbientRouteMotion(vehicle, motion, dt);
  vehicle.available = vehicle.condition > .05;
  vehicle.boardable = vehicle.available;
  vehicle.y = groundYAt(vehicle.x, vehicle.z) + aircraftGroundOffset(vehicle.catalog);
  vehicle.visual.root.position.set(vehicle.x, vehicle.y, vehicle.z);
  vehicle.visual.root.rotation.set(0, vehicle.yaw, 0);
  updateAircraftVisual(vehicle.visual, vehicle.condition, dt * (.45 + motion.speed * .12));
  updateAircraftColliders(vehicle);
  return true;
}

function createAmbientFlightMotion(vehicle, layout, index = 0) {
  if (!layout || vehicle.catalog.aircraftKind !== 'fixed-wing' || vehicle.mobile) return null;
  const side = index % 2 ? -1 : 1;
  const ground = groundYAt(layout.runwayStart.x, layout.runwayStart.z) + aircraftGroundOffset(vehicle.catalog);
  const outbound = offsetPoint(layout.runwayEnd, layout.yaw, 0, 420);
  const farSide = offsetPoint(layout.runwayEnd, layout.yaw, side * 460, 320);
  const downwind = offsetPoint(layout.runwayStart, layout.yaw, side * 460, -260);
  const approach = offsetPoint(layout.runwayStart, layout.yaw, 0, -380);
  return {
    authority: 'airport-ambient-flight-circuit',
    targetIndex: 1,
    speed: 0,
    state: 'gate',
    dwell: 4 + index * 3,
    waypoints: [
      { x: vehicle.home.x, z: vehicle.home.z, y: vehicle.home.y, state: 'gate', speed: 0 },
      { x: layout.runwayStart.x, z: layout.runwayStart.z, y: ground, state: 'taxiing', speed: 8 },
      { x: layout.runwayEnd.x, z: layout.runwayEnd.z, y: ground + 34, state: 'takeoff', speed: 42 },
      { ...outbound, y: ground + 150, state: 'climbing', speed: 64 },
      { ...farSide, y: ground + 190, state: 'circuit', speed: 68 },
      { ...downwind, y: ground + 170, state: 'circuit', speed: 65 },
      { ...approach, y: ground + 78, state: 'approach', speed: 48 },
      { x: layout.runwayStart.x, z: layout.runwayStart.z, y: ground + 5, state: 'landing', speed: 36 },
      { x: layout.runwayEnd.x, z: layout.runwayEnd.z, y: ground, state: 'rollout', speed: 16 },
      { x: vehicle.home.x, z: vehicle.home.z, y: vehicle.home.y, state: 'taxiing', speed: 7 }
    ]
  };
}

function updateAmbientFlight(vehicle, dt) {
  const motion = vehicle?.ambientFlight;
  if (!motion || vehicle.condition <= .05 || vehicle.unmanned) return false;
  const step = Math.max(0, Math.min(.05, Number(dt) || 0));
  if (motion.dwell > 0) {
    motion.dwell = Math.max(0, motion.dwell - step);
    motion.state = 'gate';
    motion.speed = 0;
    vehicle.boardable = true;
    vehicle.available = true;
    return true;
  }
  const target = motion.waypoints[motion.targetIndex];
  if (!target) return false;
  const dx = target.x - vehicle.x;
  const dy = target.y - vehicle.y;
  const dz = target.z - vehicle.z;
  const horizontal = Math.hypot(dx, dz);
  const distance = Math.hypot(horizontal, dy);
  const desiredSpeed = Math.max(3, target.speed);
  motion.speed += Math.max(-10 * step, Math.min(10 * step, desiredSpeed - motion.speed));
  const desiredYaw = Math.atan2(dx, dz);
  const yawDelta = Math.atan2(Math.sin(desiredYaw - vehicle.yaw), Math.cos(desiredYaw - vehicle.yaw));
  vehicle.yaw += Math.max(-.32 * step, Math.min(.32 * step, yawDelta));
  const travel = Math.min(distance, motion.speed * step);
  if (distance > .001) {
    vehicle.x += dx / distance * travel;
    vehicle.y += dy / distance * travel;
    vehicle.z += dz / distance * travel;
  }
  motion.state = target.state;
  const ground = groundYAt(vehicle.x, vehicle.z) + aircraftGroundOffset(vehicle.catalog);
  vehicle.boardable = vehicle.y <= ground + 2.5 && !['takeoff', 'landing', 'rollout'].includes(motion.state);
  vehicle.available = vehicle.condition > .05;
  const pitch = Math.max(-.22, Math.min(.22, Math.atan2(dy, Math.max(1, horizontal))));
  vehicle.visual.root.position.set(vehicle.x, vehicle.y, vehicle.z);
  vehicle.visual.root.rotation.set(-pitch, vehicle.yaw, -Math.max(-.2, Math.min(.2, yawDelta * 1.8)));
  updateAircraftVisual(vehicle.visual, vehicle.condition, step * (.7 + motion.speed * .08));
  updateAircraftColliders(vehicle);
  if (distance < Math.max(4, motion.speed * .22)) {
    motion.targetIndex += 1;
    if (motion.targetIndex >= motion.waypoints.length) {
      motion.targetIndex = 1;
      motion.dwell = 14;
      motion.state = 'gate';
      vehicle.x = vehicle.home.x;
      vehicle.y = vehicle.home.y;
      vehicle.z = vehicle.home.z;
      vehicle.yaw = vehicle.home.yaw;
    }
  }
  return true;
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
    .filter((vehicle) => vehicle.boardable && vehicle.catalog.interaction.enterable)
    .map((vehicle) => {
      const boardingPoint = aircraftBoardingPoint(vehicle);
      return { vehicle, boardingPoint, distance: Math.hypot(boardingPoint.x - actor.x, boardingPoint.z - actor.z) };
    })
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
  if (nearest) return {
      available: true,
      action: 'aircraft_options',
      label: `Board ${nearest.vehicle.catalog.label}`,
      detail: `${nearest.vehicle.ambientFlight?.state === 'taxiing' || nearest.vehicle.ambientMotion?.state === 'underway' ? 'Taxiing · ' : ''}fly locally or choose a destination`,
      distance: nearest.distance,
      data: { aircraftId: nearest.vehicle.id }
    };
  const ticket = runtime.airportLayout?.ticketCounter;
  const actor = actorPosition();
  const ticketDistance = ticket?.entrance && actor ? Math.hypot(ticket.entrance.x - actor.x, ticket.entrance.z - actor.z) : Infinity;
  if (ticketDistance <= 7) return {
    available: true,
    action: 'airport_hub',
    label: 'Plan an airport journey',
    detail: 'Ticket hall · choose a city, place, or airport',
    distance: ticketDistance,
    data: {}
  };
  return null;
}

function enterAircraft(runtime, vehicle) {
  if (!vehicle?.boardable || !runtimeMatches(runtime)) return false;
  runtime.activeAircraft = vehicle;
  vehicle.ambientMotion = null;
  vehicle.ambientFlight = null;
  vehicle.available = false;
  vehicle.boardable = false;
  vehicle.visual.root.visible = false;
  updateAircraftColliders(vehicle);
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
    vehicle.boardable = true;
    vehicle.visual.root.visible = true;
    updateAircraftColliders(vehicle);
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
  vehicle.boardable = vehicle.available;
  vehicle.disabledAt = vehicle.available ? 0 : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  placeVehicle(vehicle);
  vehicle.visual.root.visible = true;
  updateAircraftVisual(vehicle.visual, vehicle.condition, 0);
  updateAircraftColliders(vehicle);
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
  vehicle.boardable = true;
  placeVehicle(vehicle);
  vehicle.visual.root.visible = true;
  updateAircraftVisual(vehicle.visual, vehicle.condition, 0);
  updateAircraftColliders(vehicle);
  return true;
}

function updateAircraftLifecycle(vehicle) {
  if (!vehicle || vehicle.unmanned) return;
  if (vehicle.condition > .05) {
    vehicle.disabledAt = 0;
    return;
  }
  vehicle.available = false;
  vehicle.boardable = false;
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
  if (candidate?.action === 'aircraft_options') {
    const vehicle = runtime.vehicles.find(({ id }) => id === candidate.data?.aircraftId);
    return runtime.hub?.open?.({ source: 'aircraft', vehicle }) === true;
  }
  if (candidate?.action === 'airport_hub') return runtime.hub?.open?.({ source: 'ticket_hall' }) === true;
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
    vehicle.boardable = vehicle.available;
    vehicle.disabledAt = vehicle.available ? 0 : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  } else if (flight.elapsed >= 40) {
    vehicle.x = vehicle.home.x;
    vehicle.y = vehicle.home.y;
    vehicle.z = vehicle.home.z;
    vehicle.yaw = vehicle.home.yaw;
    vehicle.unmanned = null;
    vehicle.available = vehicle.condition > .05;
    vehicle.boardable = vehicle.available;
    vehicle.disabledAt = vehicle.available ? 0 : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }
  vehicle.visual.root.position.set(vehicle.x, vehicle.y, vehicle.z);
  vehicle.visual.root.rotation.set(0, vehicle.yaw, 0);
  updateAircraftVisual(vehicle.visual, vehicle.condition, step);
  updateAircraftColliders(vehicle);
}

function disposeAviationRuntime(runtime, reason = 'disposed') {
  if (!runtime) return false;
  runtime.unregisterInteraction?.();
  appCtx.unregisterRuntimeSystem?.(runtime.systemId);
  if (appCtx.onAircraftFlightEnded === runtime.onFlightEnded) delete appCtx.onAircraftFlightEnded;
  if (globalThis.__WE3D_AVIATION_SUPPORT__ === runtime.supportHook) delete globalThis.__WE3D_AVIATION_SUPPORT__;
  const removedColliders = new Set(runtime.vehicles.flatMap((vehicle) => vehicle.colliders || []));
  (runtime.infrastructureColliders || []).forEach((collider) => removedColliders.add(collider));
  if (removedColliders.size && Array.isArray(appCtx.dynamicBuildingColliders)) {
    appCtx.dynamicBuildingColliders = appCtx.dynamicBuildingColliders.filter((collider) => !removedColliders.has(collider));
  }
  runtime.vehicles.forEach((vehicle) => vehicle.visual.dispose());
  runtime.hub?.dispose?.();
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
  const mobile = isTouchClient();
  const airportLocation = options.request?.selection || {
    ...(options.request?.location || appCtx.LOC),
    name: options.request?.name || appCtx.worldLoadRuntimeState?.location?.name || ''
  };
  const publishedLayout = appCtx.transportFacilityVisual?.airportLayout;
  const airportLayout = publishedLayout?.mobile === mobile
    ? publishedLayout
    : compileAirportOperationalLayout(appCtx.transportFacilityGraph, { location: airportLocation, mobile });
  const vehicles = derivedFleet(appCtx.transportFacilityGraph, { mobile, airportLayout, location: airportLocation }).map((record, index) => {
    const visual = createAircraftVisual(THREE, record.catalog, { mobile: record.mobile, state: 'parked' });
    const vehicle = { ...record, visual, available: true, boardable: true, unmanned: null, disabledAt: 0 };
    createAircraftColliders(vehicle);
    placeVehicle(vehicle);
    vehicle.home = Object.freeze({ x: vehicle.x, y: vehicle.y, z: vehicle.z, yaw: vehicle.yaw });
    vehicle.ambientMotion = record.trafficIntent === 'taxi' ? createAircraftTaxiMotion(vehicle, index) : null;
    vehicle.ambientFlight = record.trafficIntent === 'circuit' ? createAmbientFlightMotion(vehicle, airportLayout, index) : null;
    group.add(visual.root);
    return vehicle;
  });
  appCtx.addEarthWorldObject?.(group);
  const runtime = {
    requestId: String(publication.requestId || ''),
    sequence: Number(publication.sequence),
    group,
    vehicles,
    airportLayout,
    infrastructureColliders: [],
    hub: null,
    activeAircraft: null,
    systemId: `aviation-runtime:${publication.sequence}`,
    reason: ''
  };
  const ticketCollider = createTicketHallCollider(airportLayout);
  if (ticketCollider) runtime.infrastructureColliders.push(ticketCollider);
  runtime.hub = createAirportHub({ appCtx, runtime, enterAircraft: (vehicle) => enterAircraft(runtime, vehicle) });
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
          if (!updateAmbientFlight(vehicle, frame.dt) && !updateAmbientTaxi(vehicle, frame.dt) && vehicle.available) updateAircraftVisual(vehicle.visual, vehicle.condition, frame.dt);
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
    taxiingAircraftCount: runtime.vehicles.filter((vehicle) => vehicle.ambientMotion?.state === 'underway').length,
    airborneAircraftCount: runtime.vehicles.filter((vehicle) => ['takeoff', 'climbing', 'circuit', 'approach', 'landing'].includes(vehicle.ambientFlight?.state)).length,
    parkedAircraftCount: runtime.vehicles.filter((vehicle) => !vehicle.ambientMotion && !vehicle.ambientFlight).length,
    boardableAircraftCount: runtime.vehicles.filter((vehicle) => vehicle.boardable).length,
    airportLayoutAuthority: runtime.airportLayout?.authority || '',
    airportScale: runtime.airportLayout?.scale || '',
    airportPhysicalAuthority: runtime.airportLayout?.provenance?.physicalAuthority || '',
    mappedRunway: runtime.airportLayout?.mappedRunway === true,
    generatedRunwayFallback: runtime.airportLayout?.generatedFallback === true,
    mappedRunwayCount: Number(runtime.airportLayout?.provenance?.mappedRunwayCount || 0),
    mappedStandCount: Number(runtime.airportLayout?.provenance?.mappedStandCount || 0),
    publishedStandCount: Number(runtime.airportLayout?.stands?.length || 0),
    generatedStandCount: Number(runtime.airportLayout?.provenance?.generatedStandCount || 0),
    airportHub: runtime.hub?.snapshot?.() || null,
    catalogIds: Object.freeze(runtime.vehicles.map(({ catalog }) => catalog.id)),
    vehicles: Object.freeze(runtime.vehicles.map((vehicle) => Object.freeze({
      id: vehicle.id,
      catalogId: vehicle.catalog.id,
      label: vehicle.catalog.label,
      x: Number(vehicle.x.toFixed(2)),
      y: Number(vehicle.y.toFixed(2)),
      z: Number(vehicle.z.toFixed(2)),
      available: vehicle.available === true,
      boardable: vehicle.boardable === true,
      unmanned: vehicle.unmanned != null,
      condition: Number(vehicle.condition.toFixed(3)),
      traffic: ambientRouteSnapshot(vehicle.ambientMotion),
      flightTrafficState: vehicle.ambientFlight?.state || '',
      anchorFacilityId: vehicle.anchorFacilityId
      ,collisionColliderCount: vehicle.colliders?.length || 0
    }))),
    interaction: interactionCandidate(runtime)
  });
  if (appCtx.developerDiagnosticsEnabled) {
    runtime.supportHook = Object.freeze({
      moveNear(aircraftId = runtime.vehicles[0]?.id) {
        const vehicle = runtime.vehicles.find(({ id }) => id === String(aircraftId));
        if (!vehicle) return false;
        const boardingPoint = aircraftBoardingPoint(vehicle);
        const targetX = boardingPoint.x;
        const targetZ = boardingPoint.z;
        return moveWalkerForSupport(targetX, targetZ, vehicle.yaw);
      },
      moveNearTicket() {
        const entrance = runtime.airportLayout?.ticketCounter?.entrance;
        if (!entrance) return false;
        return moveWalkerForSupport(entrance.x, entrance.z, runtime.airportLayout?.yaw || 0);
      },
      moveNearRunway() {
        const layout = runtime.airportLayout;
        if (!layout?.runwayStart) return false;
        const point = offsetPoint(layout.runwayStart, layout.yaw, 0, Math.min(70, layout.runwayLength * .08));
        return moveWalkerForSupport(point.x, point.z, layout.yaw);
      },
      moveAlongTaxiway() {
        const taxiways = (appCtx.transportFacilityGraph?.byDomain?.aviation || [])
          .filter((record) => record.type === 'taxiway' && record.geometry?.points?.length >= 2)
          .map((record) => ({
            record,
            length: record.geometry.points.slice(1).reduce((total, point, index) => {
              const previous = record.geometry.points[index];
              return total + Math.hypot(point.x - previous.x, point.z - previous.z);
            }, 0)
          }))
          .sort((left, right) => right.length - left.length);
        const points = taxiways[0]?.record?.geometry?.points;
        if (!points?.length) return false;
        const start = points[0];
        const look = points.find((point) => Math.hypot(point.x - start.x, point.z - start.z) >= 18) || points[1];
        const yaw = Math.atan2(look.x - start.x, look.z - start.z);
        return moveWalkerForSupport(start.x, start.z, yaw);
      },
      openHub(source = 'ticket_hall', aircraftId = '') {
        const vehicle = aircraftId ? runtime.vehicles.find(({ id }) => id === String(aircraftId)) : null;
        return runtime.hub?.open?.({ source, vehicle }) === true;
      },
      snapshot: runtime.snapshot,
      dock(aircraftId) {
        const vehicle = runtime.vehicles.find(({ id }) => id === String(aircraftId));
        if (!vehicle || vehicle === runtime.activeAircraft || !vehicle.home) return false;
        vehicle.x = vehicle.home.x;
        vehicle.y = vehicle.home.y;
        vehicle.z = vehicle.home.z;
        vehicle.yaw = vehicle.home.yaw;
        if (vehicle.ambientMotion) {
          vehicle.ambientMotion.targetIndex = 1;
          vehicle.ambientMotion.speed = 0;
          vehicle.ambientMotion.state = 'docked';
          vehicle.ambientMotion.dwellRemaining = 20;
        }
        vehicle.available = vehicle.condition > .05;
        vehicle.boardable = vehicle.available;
        placeVehicle(vehicle);
        return vehicle.available;
      },
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

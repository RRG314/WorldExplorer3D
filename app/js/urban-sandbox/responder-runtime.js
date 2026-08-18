import { ctx as appCtx } from '../shared-context.js?v=55';
import { carSpeedToMph } from '../physics/vehicle-speed-units.js?v=1';
import { createUrbanVehicleVisual } from './vehicle-visuals.js?v=5';
import { createResponderResponseModel, responderAgencyProfile } from './responder-model.js?v=1';
import { vehicleDoorPosition } from './vehicle-model.js?v=2';

const RESPONDER_BASE_Y = 1.2;
const RESPONDER_DESPAWN_DISTANCE = 58;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function angleDelta(target, current) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function copyRoadAnchor(hit, fallback = {}) {
  if (!hit?.road || !hit.pt || !Number.isFinite(hit.pt.x) || !Number.isFinite(hit.pt.z)) return null;
  return {
    x: Number(hit.pt.x),
    z: Number(hit.pt.z),
    y: Number.isFinite(hit.y) ? Number(hit.y) : finite(fallback.y),
    road: hit.road,
    distance: finite(hit.dist, Infinity)
  };
}

function surfaceY(x, z, fallback = 0) {
  const driveY = appCtx.SurfaceQuery?.driveAt?.(x, z)?.position?.y;
  if (Number.isFinite(driveY)) return Number(driveY);
  const walkY = appCtx.SurfaceQuery?.walkAt?.(x, z)?.position?.y;
  if (Number.isFinite(walkY)) return Number(walkY);
  const terrain = appCtx.elevationWorldYAtWorldXZ?.(x, z);
  return Number.isFinite(terrain) ? Number(terrain) : fallback;
}

function roadAnchorNear(x, z, y, preferredRoad = null) {
  if (typeof appCtx.findNearestRoad !== 'function') return null;
  return copyRoadAnchor(appCtx.findNearestRoad(x, z, {
    y: finite(y),
    maxVerticalDelta: 24,
    preferredRoad
  }), { y });
}

function responderVariant(profile) {
  const crossover = profile.bodyStyle === 'crossover';
  return Object.freeze({
    id: `${profile.id}-response`,
    label: profile.vehicleLabel,
    bodyStyle: crossover ? 'crossover' : 'sedan',
    width: crossover ? 1.94 : 1.82,
    height: crossover ? 1.74 : 1.5,
    length: crossover ? 4.78 : 4.58,
    wheelRadius: crossover ? .42 : .37
  });
}

function createUrbanResponderRuntime(options = {}) {
  const THREE = options.THREE;
  const group = options.group;
  const model = createResponderResponseModel({ mobile: options.mobile === true });
  const responders = [];
  let disposed = false;
  let elapsed = 0;
  let lastSnapshot = model.snapshot({ activeCount: 0 });

  const active = () => !disposed && options.isActive?.() !== false;

  function spawnAnchor(actor, eventId, index) {
    const seed = [...String(eventId || 'civic')].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381);
    let best = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = ((seed % 360) * Math.PI / 180) + (attempt + index * 2) * Math.PI * .39;
      const distance = 62 + (attempt % 4) * 13 + index * 10;
      const candidate = {
        x: finite(actor?.x) + Math.sin(angle) * distance,
        z: finite(actor?.z) + Math.cos(angle) * distance,
        y: finite(actor?.y)
      };
      const road = roadAnchorNear(candidate.x, candidate.z, candidate.y);
      if (!road || road.distance > 45) continue;
      const actorDistance = Math.hypot(road.x - finite(actor?.x), road.z - finite(actor?.z));
      if (actorDistance < 48) continue;
      const score = Math.abs(actorDistance - (72 + index * 12)) + road.distance * .35;
      if (!best || score < best.score) best = { ...road, score };
    }
    if (best) return best;
    const angle = ((seed + index * 137) % 360) * Math.PI / 180;
    const x = finite(actor?.x) + Math.sin(angle) * (68 + index * 12);
    const z = finite(actor?.z) + Math.cos(angle) * (68 + index * 12);
    return { x, z, y: surfaceY(x, z, finite(actor?.y)), road: null };
  }

  function spawnResponder(civic, actor, index) {
    const profile = responderAgencyProfile(civic.agency);
    const anchor = spawnAnchor(actor || civic.searchCenter, civic.lastEvent?.id, responders.length + index);
    const variant = responderVariant(profile);
    const id = `urban-responder:${options.worldIdentity || 'world'}:${civic.lastEvent?.id || 'event'}:${responders.length + index}`;
    const definition = {
      id,
      variant,
      color: profile.color,
      serviceType: 'responder',
      serviceAccent: profile.accent
    };
    const visual = createUrbanVehicleVisual(THREE, definition);
    const toward = actor || civic.searchCenter || { x: anchor.x, z: anchor.z + 1 };
    const yaw = Math.atan2(finite(toward.x) - anchor.x, finite(toward.z) - anchor.z);
    const responder = {
      id,
      profile,
      variant,
      color: profile.color,
      serviceType: 'responder',
      serviceAccent: profile.accent,
      visual,
      x: anchor.x,
      y: anchor.y + RESPONDER_BASE_Y,
      z: anchor.z,
      yaw,
      speed: 0,
      road: anchor.road,
      origin: { x: anchor.x, y: anchor.y, z: anchor.z, road: anchor.road },
      navigationTarget: null,
      navigationElapsed: 1,
      surfaceElapsed: 1,
      returnElapsed: 0
    };
    visual.root.position.set(responder.x, responder.y, responder.z);
    visual.root.rotation.set(0, responder.yaw, 0);
    group.add(visual.root);
    responders.push(responder);
    return responder;
  }

  function movementTarget(responder, civic, actor, returning, actorWithinSearch) {
    const raw = returning
      ? responder.origin
      : actorWithinSearch ? actor : civic.searchCenter || actor;
    if (!raw) return responder.origin;
    const road = roadAnchorNear(raw.x, raw.z, raw.y, responder.road);
    if (road && road.distance <= 36) return road;
    return { x: finite(raw.x), z: finite(raw.z), y: surfaceY(raw.x, raw.z, responder.y - RESPONDER_BASE_Y), road: responder.road };
  }

  function updateMotion(responder, dt, civic, actor, returning, actorWithinSearch) {
    responder.navigationElapsed += dt;
    responder.surfaceElapsed += dt;
    if (!responder.navigationTarget || responder.navigationElapsed >= .28) {
      responder.navigationElapsed = 0;
      responder.navigationTarget = movementTarget(responder, civic, actor, returning, actorWithinSearch);
    }
    const target = responder.navigationTarget;
    const dx = target.x - responder.x;
    const dz = target.z - responder.z;
    const distance = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    responder.yaw += angleDelta(targetYaw, responder.yaw) * Math.min(1, dt * 2.8);
    const civicLevel = Math.max(1, Number(civic.level) || 1);
    const stopDistance = returning ? 4 : actorWithinSearch ? 9 : 15;
    const targetSpeed = distance <= stopDistance ? 0 : Math.min(22 + civicLevel * 2, 7 + distance * .24);
    const acceleration = targetSpeed > responder.speed ? 7.5 : 11;
    responder.speed += Math.sign(targetSpeed - responder.speed) * Math.min(Math.abs(targetSpeed - responder.speed), acceleration * dt);
    const nextX = responder.x + Math.sin(responder.yaw) * responder.speed * dt;
    const nextZ = responder.z + Math.cos(responder.yaw) * responder.speed * dt;
    const road = roadAnchorNear(nextX, nextZ, responder.y - RESPONDER_BASE_Y, responder.road);
    if (road && road.distance <= 14) {
      const roadGrip = Math.min(.72, dt * 4.5);
      responder.x = nextX + (road.x - nextX) * roadGrip;
      responder.z = nextZ + (road.z - nextZ) * roadGrip;
      responder.road = road.road;
      if (responder.surfaceElapsed >= .18) {
        responder.surfaceElapsed = 0;
        responder.y = road.y + RESPONDER_BASE_Y;
      }
    } else {
      responder.x = nextX;
      responder.z = nextZ;
      if (responder.surfaceElapsed >= .18) {
        responder.surfaceElapsed = 0;
        responder.y = surfaceY(responder.x, responder.z, responder.y - RESPONDER_BASE_Y) + RESPONDER_BASE_Y;
      }
    }
    responder.visual.root.position.set(responder.x, responder.y, responder.z);
    responder.visual.root.rotation.y = responder.yaw;
    responder.visual.wheels.forEach((wheel) => { wheel.rotation.x += responder.speed * dt / .38; });
    responder.visual.setServiceLights(elapsed, !returning);
    if (returning) responder.returnElapsed += dt;
    else responder.returnElapsed = 0;
  }

  function removeResponder(responder, disposeVisual = true) {
    const index = responders.indexOf(responder);
    if (index >= 0) responders.splice(index, 1);
    if (disposeVisual) responder.visual.dispose();
  }

  function nearestEnterable(actor, radius = 3.4) {
    if (!active() || !actor) return null;
    return responders.map((responder) => {
      if (Math.abs(finite(responder.speed)) > 2.5) return null;
      const door = vehicleDoorPosition({ ...responder, driverSide: -1 });
      const distance = Math.hypot(door.x - finite(actor.x), door.z - finite(actor.z));
      return distance <= radius ? { responderId: responder.id, responder, door, distance } : null;
    }).filter(Boolean).sort((a, b) => a.distance - b.distance)[0] || null;
  }

  function claimVehicle(responderId) {
    if (!active()) return null;
    const responder = responders.find((entry) => entry.id === String(responderId || ''));
    if (!responder || Math.abs(finite(responder.speed)) > 2.5) return null;
    removeResponder(responder, false);
    responder.visual.setServiceLights?.(0, false);
    responder.visual.root.updateMatrixWorld(true);
    return {
      id: responder.id,
      variant: responder.variant,
      color: responder.color,
      serviceType: responder.serviceType,
      serviceAccent: responder.serviceAccent,
      profile: responder.profile,
      visual: responder.visual,
      x: responder.x,
      y: responder.y,
      z: responder.z,
      yaw: responder.yaw,
      driverSide: -1,
      resistance: 185,
      condition: 1,
      source: 'civic-responder-taken',
      attachedToPlayer: false,
      occupied: false,
      driver: '',
      playerClaimed: false
    };
  }

  function update(dt, civic, actor) {
    if (!active()) return lastSnapshot;
    const step = Math.max(0, Math.min(.25, Number(dt) || 0));
    elapsed += step;
    const searchCenter = civic?.searchCenter;
    const searchRadius = Math.max(1, Number(civic?.searchRadius) || 1);
    const actorFromCenter = searchCenter && actor
      ? Math.hypot(finite(actor.x) - searchCenter.x, finite(actor.z) - searchCenter.z)
      : 0;
    const actorWithinSearch = !searchCenter || actorFromCenter <= searchRadius;
    const nearestDistance = responders.length && actor
      ? Math.min(...responders.map((entry) => Math.hypot(entry.x - finite(actor.x), entry.z - finite(actor.z))))
      : Infinity;
    const walking = appCtx.Walk?.state?.mode === 'walk';
    const mph = walking ? 0 : Math.abs(carSpeedToMph(Number(appCtx.car?.speed || 0)));
    const actorMoving = walking
      ? Math.hypot(finite(appCtx.Walk?.state?.walker?.vx), finite(appCtx.Walk?.state?.walker?.vz)) > .8
      : mph > 7;
    const response = model.update(step, {
      civic,
      activeCount: responders.length,
      nearestDistance,
      actorMoving,
      actorWithinSearch
    });
    const spawnReference = actorWithinSearch ? actor : civic?.searchCenter || actor;
    for (let index = 0; index < response.dispatchCount; index += 1) spawnResponder(civic, spawnReference, index);
    const returning = response.phase === 'returning' || civic?.phase === 'clear' || civic?.phase === 'cooling';
    responders.slice().forEach((responder) => {
      updateMotion(responder, step, civic || {}, actor, returning, actorWithinSearch);
      if (!returning) return;
      const originDistance = Math.hypot(responder.x - responder.origin.x, responder.z - responder.origin.z);
      const actorDistance = actor ? Math.hypot(responder.x - finite(actor.x), responder.z - finite(actor.z)) : Infinity;
      if ((originDistance <= 6 && actorDistance >= RESPONDER_DESPAWN_DISTANCE) || responder.returnElapsed >= 22) {
        removeResponder(responder);
      }
    });
    if (response.resolution) options.onResolution?.(response.resolution);
    lastSnapshot = Object.freeze({
      ...model.snapshot({ activeCount: responders.length }),
      agency: String(civic?.agency || ''),
      actorWithinSearch,
      responders: Object.freeze(responders.map((responder) => Object.freeze({
        id: responder.id,
        agencyType: responder.profile.id,
        label: responder.profile.vehicleLabel,
        x: Number(responder.x.toFixed(2)),
        y: Number(responder.y.toFixed(2)),
        z: Number(responder.z.toFixed(2)),
        yaw: Number(responder.yaw.toFixed(4)),
        speed: Number(responder.speed.toFixed(2)),
        distanceToActor: actor ? Number(Math.hypot(responder.x - finite(actor.x), responder.z - finite(actor.z)).toFixed(2)) : null
      })))
    });
    return lastSnapshot;
  }

  function snapshot() {
    return lastSnapshot;
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    responders.slice().forEach(removeResponder);
    lastSnapshot = Object.freeze({ ...model.snapshot({ activeCount: 0 }), responders: Object.freeze([]) });
    return true;
  }

  return Object.freeze({ claimVehicle, dispose, nearestEnterable, snapshot, update });
}

export { createUrbanResponderRuntime, responderVariant };

import { ctx as appCtx } from '../shared-context.js?v=55';
import { carSpeedToMph } from '../physics/vehicle-speed-units.js?v=2';
import { VEHICLE_ROOT_TO_GROUND_METERS, vehicleDefinitionById } from '../engine/vehicle-catalog.js?v=5';
import { createUrbanVehicleVisual } from './vehicle-visuals.js?v=8';
import { createUrbanNpcVisual } from './npc-visuals.js?v=7';
import { createResponderResponseModel, responderAgencyProfile } from './responder-model.js?v=2';
import { vehicleDoorPosition } from './vehicle-model.js?v=6';
import { applyConditionImpact } from './impact-model.js?v=1';
import { resolveVehicleRoadContactPose } from '../engine/vehicle-road-attitude.js?v=2';
import { dampCrashMotion } from './crash-physics.js?v=1';

const RESPONDER_BASE_Y = VEHICLE_ROOT_TO_GROUND_METERS;
const RESPONDER_DESPAWN_DISTANCE = 58;
const OFFICER_CONTACT_DISTANCE = 3.2;

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

function roadContactPoseAtHeading(x, z, y, yaw, variant, preferredRoad = null, fallback = {}) {
  return resolveVehicleRoadContactPose({
    x,
    y,
    z,
    yaw,
    pitch: fallback.pitch,
    roll: fallback.roll,
    variant,
    sampleSurface(sampleX, sampleZ) {
      const preferredY = Number(appCtx.sampleFeatureSurfaceY?.(preferredRoad, sampleX, sampleZ));
      if (preferredRoad && Number.isFinite(preferredY)) return preferredY;
      const road = roadAnchorNear(sampleX, sampleZ, y, preferredRoad);
      return Number.isFinite(road?.y) ? Number(road.y) : NaN;
    }
  });
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
  const base = vehicleDefinitionById(crossover ? 'suv' : 'sedan');
  return Object.freeze({
    ...base,
    id: `${profile.id}-response`,
    label: profile.vehicleLabel,
    bodyStyle: crossover ? 'suv' : 'sedan'
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
      if (responders.some((responder) => Math.hypot(responder.x - road.x, responder.z - road.z) < 12)) continue;
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
    const contactPose = roadContactPoseAtHeading(anchor.x, anchor.z, anchor.y, yaw, variant, anchor.road);
    const responder = {
      id,
      profile,
      variant,
      color: profile.color,
      serviceType: 'responder',
      serviceAccent: profile.accent,
      visual,
      x: anchor.x,
      y: contactPose.y + RESPONDER_BASE_Y,
      z: anchor.z,
      yaw,
      pitch: contactPose.pitch,
      roll: contactPose.roll,
      wheelContact: contactPose,
      speed: 0,
      road: anchor.road,
      origin: { x: anchor.x, y: anchor.y, z: anchor.z, road: anchor.road },
      navigationTarget: null,
      navigationElapsed: 1,
      surfaceElapsed: 1,
      returnElapsed: 0,
      avoidanceSide: 0,
      avoidanceRemaining: 0,
      condition: 1,
      resistance: 190,
      officer: null
    };
    visual.root.position.set(responder.x, responder.y, responder.z);
    visual.root.rotation.order = 'YXZ';
    visual.root.rotation.set(responder.pitch, responder.yaw, responder.roll);
    group.add(visual.root);
    responders.push(responder);
    return responder;
  }

  function spawnOfficer(responder) {
    if (responder.officer) return responder.officer;
    const side = responder.x <= finite(options.getActor?.()?.x) ? -1 : 1;
    const x = responder.x + Math.cos(responder.yaw) * side * 1.8;
    const z = responder.z - Math.sin(responder.yaw) * side * 1.8;
    const visual = createUrbanNpcVisual(THREE, {
      id: `${responder.id}:officer`,
      archetype: 'civic-officer',
      outfitColor: 0x253a52,
      pantsColor: 0x172334,
      hairColor: 0x2a211c,
      skinColor: 0x9a6d52,
      heldEquipment: 'responder-sidearm',
      reaction: 'armed'
    });
    visual.root.position.set(x, surfaceY(x, z, responder.y - RESPONDER_BASE_Y), z);
    group.add(visual.root);
    responder.officer = {
      id: `${responder.id}:officer`,
      visual,
      x,
      y: visual.root.position.y,
      z,
      yaw: responder.yaw,
      activeElapsed: 0,
      fireCooldown: .9,
      shotsFired: 0,
      condition: 1,
      resistance: 105,
      lootClaimed: false
    };
    return responder.officer;
  }

  function updateOfficer(responder, dt, civic, actor, returning) {
    const distanceToActor = actor ? Math.hypot(responder.x - finite(actor.x), responder.z - finite(actor.z)) : Infinity;
    if (!responder.officer && !returning && responder.speed <= 2.8 && distanceToActor <= 18) spawnOfficer(responder);
    const officer = responder.officer;
    if (!officer) return;
    if (Number(officer.condition ?? 1) <= .05) {
      officer.visual.setReaction('downed');
      return;
    }
    const current = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (officer.crashMotion) {
      const motion = dampCrashMotion(officer.crashMotion, dt, { kind: 'npc' });
      const units = Math.max(.001, Number(appCtx.METERS_PER_WORLD_UNIT || 1.11));
      officer.crashMotion = { ...officer.crashMotion, ...motion };
      officer.x += motion.velocityX / units * dt;
      officer.z += motion.velocityZ / units * dt;
      officer.yaw += motion.angularVelocity * dt;
      officer.y = surfaceY(officer.x, officer.z, officer.y);
      officer.visual.root.position.set(officer.x, officer.y, officer.z);
      officer.visual.root.rotation.y = officer.yaw;
      officer.visual.setReaction('knocked-down');
      if (Math.hypot(motion.velocityX, motion.velocityZ) < .1 && Math.abs(motion.angularVelocity) < .04) officer.crashMotion = null;
    }
    if (Number(officer.knockdownUntil || 0) > current) {
      officer.visual.setReaction('knocked-down');
      return;
    }
    officer.activeElapsed += dt;
    officer.fireCooldown = Math.max(0, officer.fireCooldown - dt);
    const dx = finite(actor?.x) - officer.x;
    const dz = finite(actor?.z) - officer.z;
    const distance = Math.hypot(dx, dz);
    officer.yaw = Math.atan2(dx, dz);
    if (!returning && distance > OFFICER_CONTACT_DISTANCE && distance < 34) {
      const speed = Math.min(3.2, Math.max(0, distance - OFFICER_CONTACT_DISTANCE + .35) * .9);
      officer.x += Math.sin(officer.yaw) * speed * dt;
      officer.z += Math.cos(officer.yaw) * speed * dt;
      officer.y = surfaceY(officer.x, officer.z, officer.y);
    }
    officer.visual.root.position.set(officer.x, officer.y, officer.z);
    officer.visual.root.rotation.y = officer.yaw;
    const armedIncident = ['weapon_discharge', 'explosive_use'].includes(String(civic?.lastEvent?.kind || ''));
    const mayFire = !returning && armedIncident && Number(civic?.level || 0) >= 2 &&
      officer.activeElapsed >= 1.25 && distance >= 4 && distance <= 32;
    officer.visual.setReaction(mayFire ? 'armed' : distance <= 7 ? 'watching' : 'armed');
    if (mayFire && officer.fireCooldown <= 0) {
      const fired = options.fireNpcProjectile?.({
        sourceId: officer.id,
        equipmentId: 'responder-sidearm',
        label: 'Responder sidearm',
        projectileKind: 'pulse',
        projectileSpeed: 66,
        range: 38,
        force: 18,
        origin: { x: officer.x, y: officer.y + 1.34, z: officer.z },
        target: { x: finite(actor?.x), y: finite(actor?.y) - .5, z: finite(actor?.z) },
        onPlayerImpact: options.onOfficerShot
      });
      if (fired) {
        officer.shotsFired += 1;
        officer.fireCooldown = 1.35;
      }
    }
    if (!returning && Number(civic?.level || 0) >= 2 && appCtx.Walk?.state?.mode === 'walk' && distance <= OFFICER_CONTACT_DISTANCE && officer.activeElapsed >= 1.2) {
      options.onArrest?.({ officerId: officer.id, responderId: responder.id });
    }
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
    if (responder.crashMotion) {
      const motion = dampCrashMotion(responder.crashMotion, dt, { kind: 'vehicle' });
      const units = Math.max(.001, Number(appCtx.METERS_PER_WORLD_UNIT || 1.11));
      responder.crashMotion = { ...responder.crashMotion, ...motion };
      responder.x += motion.velocityX / units * dt;
      responder.z += motion.velocityZ / units * dt;
      responder.yaw += motion.angularVelocity * dt;
      responder.y = surfaceY(responder.x, responder.z, responder.y - RESPONDER_BASE_Y) + RESPONDER_BASE_Y;
      responder.speed = Math.hypot(motion.velocityX, motion.velocityZ) / units;
      responder.visual.root.position.set(responder.x, responder.y, responder.z);
      responder.visual.root.rotation.y = responder.yaw;
      responder.visual.wheels.forEach((wheel) => { wheel.rotation.x += responder.speed * dt / .38; });
      responder.visual.setServiceLights(elapsed, true);
      if (responder.speed < .12 && Math.abs(motion.angularVelocity) < .04) {
        responder.crashMotion = null;
        responder.speed = 0;
        responder.navigationTarget = null;
      }
      return;
    }
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
    responder.avoidanceRemaining = Math.max(0, finite(responder.avoidanceRemaining) - dt);
    const steeringTargetYaw = targetYaw + (responder.avoidanceRemaining > 0 ? responder.avoidanceSide * .68 : 0);
    responder.yaw += angleDelta(steeringTargetYaw, responder.yaw) * Math.min(1, dt * 2.8);
    const civicLevel = Math.max(1, Number(civic.level) || 1);
    const stopDistance = returning ? 4 : actorWithinSearch ? 9 : 15;
    const targetSpeed = distance <= stopDistance ? 0 : Math.min(22 + civicLevel * 2, 7 + distance * .24);
    const acceleration = targetSpeed > responder.speed ? 7.5 : 11;
    responder.speed += Math.sign(targetSpeed - responder.speed) * Math.min(Math.abs(targetSpeed - responder.speed), acceleration * dt);
    const vehicleBlockers = [
      ...responders.filter((entry) => entry !== responder),
      ...(options.getVehicles?.() || []).filter((entry) => !entry.attachedToPlayer)
    ];
    const travelSpeed = responder.avoidanceRemaining > 0 ? Math.min(responder.speed, 5.5) : responder.speed;
    let nextX = responder.x + Math.sin(responder.yaw) * travelSpeed * dt;
    let nextZ = responder.z + Math.cos(responder.yaw) * travelSpeed * dt;
    const nearestBlocker = vehicleBlockers.map((entry) => ({
      entry,
      currentDistance: Math.hypot(finite(entry.x) - responder.x, finite(entry.z) - responder.z),
      nextDistance: Math.hypot(finite(entry.x) - nextX, finite(entry.z) - nextZ),
      clearance: Math.max(3.7, finite(entry.variant?.width, 1.8) + 1.9)
    })).filter((candidate) => candidate.nextDistance < candidate.clearance)
      .sort((left, right) => left.nextDistance - right.nextDistance)[0] || null;
    const blockedByVehicle = !!nearestBlocker && nearestBlocker.nextDistance < nearestBlocker.currentDistance - .015;
    if (blockedByVehicle) {
      const blockerYaw = Math.atan2(
        finite(nearestBlocker.entry.x) - responder.x,
        finite(nearestBlocker.entry.z) - responder.z
      );
      if (responder.avoidanceRemaining <= 0) {
        responder.avoidanceSide = angleDelta(blockerYaw, responder.yaw) >= 0 ? -1 : 1;
      }
      responder.avoidanceRemaining = 1.25;
      const bypassTargetYaw = targetYaw + responder.avoidanceSide * .82;
      responder.yaw += angleDelta(bypassTargetYaw, responder.yaw) * Math.min(1, dt * 5.5);
      const bypassSpeed = Math.min(Math.max(responder.speed, 2.2), 4.8);
      const bypassX = responder.x + Math.sin(responder.yaw) * bypassSpeed * dt;
      const bypassZ = responder.z + Math.cos(responder.yaw) * bypassSpeed * dt;
      const bypassClears = vehicleBlockers.every((entry) => {
        const currentDistance = Math.hypot(finite(entry.x) - responder.x, finite(entry.z) - responder.z);
        const bypassDistance = Math.hypot(finite(entry.x) - bypassX, finite(entry.z) - bypassZ);
        const clearance = Math.max(3.7, finite(entry.variant?.width, 1.8) + 1.9);
        return bypassDistance >= clearance || bypassDistance >= currentDistance - .015;
      });
      if (bypassClears) {
        nextX = bypassX;
        nextZ = bypassZ;
        responder.speed = bypassSpeed;
      } else {
        responder.speed = 0;
        nextX = responder.x;
        nextZ = responder.z;
      }
    }
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
    const contactPose = roadContactPoseAtHeading(
      responder.x,
      responder.z,
      responder.y - RESPONDER_BASE_Y,
      responder.yaw,
      responder.variant,
      responder.road,
      responder
    );
    responder.y = contactPose.y + RESPONDER_BASE_Y;
    responder.pitch = contactPose.pitch;
    responder.roll = contactPose.roll;
    responder.wheelContact = contactPose;
    responder.visual.root.position.set(responder.x, responder.y, responder.z);
    responder.visual.root.rotation.order = 'YXZ';
    responder.visual.root.rotation.set(responder.pitch, responder.yaw, responder.roll);
    responder.visual.wheels.forEach((wheel) => { wheel.rotation.x += responder.speed * dt / .38; });
    responder.visual.setServiceLights(elapsed, !returning);
    if (returning) responder.returnElapsed += dt;
    else responder.returnElapsed = 0;
  }

  function removeResponder(responder, disposeVisual = true) {
    const index = responders.indexOf(responder);
    if (index >= 0) responders.splice(index, 1);
    responder.officer?.visual?.dispose?.();
    responder.officer = null;
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
      pitch: responder.pitch,
      roll: responder.roll,
      wheelContact: responder.wheelContact,
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
      updateOfficer(responder, step, civic || {}, actor, returning);
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
        distanceToActor: actor ? Number(Math.hypot(responder.x - finite(actor.x), responder.z - finite(actor.z)).toFixed(2)) : null,
        officer: responder.officer ? Object.freeze({
          id: responder.officer.id,
          x: Number(responder.officer.x.toFixed(2)),
          y: Number(responder.officer.y.toFixed(2)),
          z: Number(responder.officer.z.toFixed(2)),
          armed: true,
          shotsFired: responder.officer.shotsFired
        }) : null
      })))
    });
    return lastSnapshot;
  }

  function snapshot() {
    return lastSnapshot;
  }

  function targets() {
    return Object.freeze(responders.flatMap((responder) => {
      const entries = [{
        kind: 'responder_vehicle', ref: responder, x: responder.x, y: responder.y, z: responder.z,
        yaw: responder.yaw, condition: responder.condition
      }];
      if (responder.officer) entries.push({
        kind: 'responder_officer', ref: responder.officer, x: responder.officer.x, y: responder.officer.y,
        z: responder.officer.z, yaw: responder.officer.yaw, condition: responder.officer.condition
      });
      return entries;
    }).filter((entry) => Number(entry.condition ?? 1) > .05));
  }

  function applyImpact(targetId, force) {
    for (const responder of responders) {
      if (responder.id === targetId) {
        const result = applyConditionImpact(responder, force);
        responder.condition = result.after;
        responder.visual.setCondition(result.after);
        return { kind: 'responder_vehicle', id: responder.id, ...result };
      }
      if (responder.officer?.id === targetId) {
        const result = applyConditionImpact(responder.officer, force);
        responder.officer.condition = result.after;
        responder.officer.visual.setReaction(result.destroyed ? 'downed' : 'hit');
        if (result.destroyed && !responder.officer.lootClaimed) {
          responder.officer.lootClaimed = true;
          if (responder.officer.visual?.heldEquipment) responder.officer.visual.heldEquipment.visible = false;
          options.onOfficerDowned?.({
            sourceActorId: responder.officer.id,
            weaponId: 'responder-sidearm',
            label: 'Response sidearm',
            rounds: 24,
            position: { x: responder.officer.x, y: responder.officer.y, z: responder.officer.z }
          });
        }
        return { kind: 'responder_officer', id: responder.officer.id, ...result };
      }
    }
    return null;
  }

  function nearestDownedOfficer(reference, radius = 3.2) {
    if (!reference) return null;
    return responders.map((responder) => responder.officer ? ({
      responder,
      officer: responder.officer,
      distance: Math.hypot(responder.officer.x - finite(reference.x), responder.officer.z - finite(reference.z))
    }) : null).filter((entry) => entry && Number(entry.officer.condition ?? 1) <= .05 && !entry.officer.lootClaimed && entry.distance <= radius)
      .sort((left, right) => left.distance - right.distance)[0] || null;
  }

  function lootOfficer(officerId) {
    const officer = responders.map((responder) => responder.officer).find((entry) => entry?.id === String(officerId || ''));
    if (!officer || Number(officer.condition ?? 1) > .05 || officer.lootClaimed) return null;
    officer.lootClaimed = true;
    if (officer.visual?.heldEquipment) officer.visual.heldEquipment.visible = false;
    return Object.freeze({ weaponId: 'responder-sidearm', rounds: 24 });
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    responders.slice().forEach(removeResponder);
    lastSnapshot = Object.freeze({ ...model.snapshot({ activeCount: 0 }), responders: Object.freeze([]) });
    return true;
  }

  return Object.freeze({ applyImpact, claimVehicle, dispose, lootOfficer, nearestDownedOfficer, nearestEnterable, snapshot, targets, update });
}

export { createUrbanResponderRuntime, responderVariant };

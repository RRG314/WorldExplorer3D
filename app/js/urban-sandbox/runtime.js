import { ctx as appCtx } from '../shared-context.js?v=55';
import { carSpeedToMph, mphToCarSpeed } from '../physics/vehicle-speed-units.js?v=2';
import { VEHICLE_ROOT_TO_GROUND_METERS, vehicleMassKg } from '../engine/vehicle-catalog.js?v=6';
import { applyTransportDamage } from '../transport/damage-model.js?v=1';
import { createCivicResponseModel } from './civic-response-model.js?v=3';
import { ensurePlayerBackpackInventory } from './equipment-model.js?v=10';
import { createUrbanEquipmentRuntime } from './equipment-runtime.js?v=23';
import { createEquipmentVisuals } from './equipment-visuals.js?v=9';
import {
  attachCuratedEquipmentVisual,
  disposeCuratedEquipmentVisual
} from './curated-equipment-visual.js?v=2';
import { createUrbanNpcVisual } from './npc-visuals.js?v=9';
import { nearestMappedFacility } from './facility-model.js?v=3';
import { createUrbanRoomAuthorityRuntime } from './room-authority-runtime.js?v=4';
import { createUrbanResponderRuntime } from './responder-runtime.js?v=29';
import { parkedVehicleAnchors, vehicleDoorPosition, vehicleExitCandidates } from './vehicle-model.js?v=7';
import { createUrbanVehicleVisual } from './vehicle-visuals.js?v=11';
import {
  attachCuratedTrafficVehicle,
  CURATED_TRAFFIC_ASSET_BY_VARIANT,
  disposeCuratedTrafficVehicle
} from './curated-traffic-vehicle.js?v=4';
import { applyConditionImpact } from './impact-model.js?v=1';
import { dampCrashMotion, resolveCrashImpact } from './crash-physics.js?v=1';
import { sampleSweptContact } from '../physics/swept-contact.js?v=1';
import { createLocalCommerceModel, mappedCommercePlaces } from './commerce-model.js?v=3';
import { emitProductTelemetry } from '../platform/product-telemetry.js?v=1';
import { claimLootPickup, createLootPickup } from './loot-pickup-model.js?v=1';
import { NPC_COMBAT_STATES, resolveNpcCombatState } from './npc-combat-policy.js?v=2';
import { ENTITY_LIFECYCLE_MS, lifecycleExpired, markLifecycleStart } from '../runtime/entity-lifecycle-policy.js?v=1';
import {
  attachCuratedExplorerCharacter,
  disposeCuratedCharacter,
  NEARBY_NPC_ASSET_IDS,
  updateCuratedCharacterAnimation
} from '../walking/curated-explorer-character.js?v=7';

const ENTER_DISTANCE = 3.4;
// Room clients can assemble slightly different collision envelopes when a live
// map-provider request succeeds for one player and falls back for another. A
// released authoritative vehicle keeps its shared pose, but the receiving
// player needs a bounded vicinity handoff so a fallback wall cannot make that
// vehicle permanently unclaimable. Local vehicles retain the normal range.
const ROOM_RECONCILIATION_ENTER_DISTANCE = 6.5;
const EXIT_SPEED_LIMIT = 4;
const TRANSITION_DURATION = 0.56;
const NPC_INTERACTION_DISTANCE = 3.2;
// The curated ambient population remains the single far/mid-distance owner. Promote
// the closest people before they enter conversational range so the player
// never sees the old coarse silhouette switch only after pressing Interact.
// Keep the authoritative instanced population for the long-range world, but
// promote actors while they are still visually identifiable in a normal
// street view. The previous 90 m boundary left the coarse LOD clearly visible
// for too long before the detailed actor took ownership.
const NPC_DETAIL_PRELOAD_DISTANCE = 140;
const NPC_DETAIL_RELEASE_DISTANCE = 174;
const NPC_DRIVING_PRELOAD_DISTANCE = 280;
const NPC_DRIVING_RELEASE_DISTANCE = 330;
const VEHICLE_DETAIL_PRELOAD_DISTANCE = 120;
const VEHICLE_DETAIL_RELEASE_DISTANCE = 180;
const STORE_INTERACTION_DISTANCE = 4.8;
const LOOT_INTERACTION_DISTANCE = 3.4;
let activeRuntime = null;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function formatExplorerDollars(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format(Math.max(0, Math.round(Number(value) || 0)));
}

function isTouchClient() {
  try {
    return (navigator.maxTouchPoints || 0) > 0 || matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch (_) {
    return false;
  }
}

function activeWorldMatches(state) {
  return !!(
    state && !state.disposed &&
    appCtx.worldPublication?.requestId === state.requestId &&
    appCtx.worldPublication?.sequence === state.sequence &&
    !appCtx.onMoon && !appCtx.onMars && !appCtx.oceanMode?.active && !appCtx.spaceFlight?.active
  );
}

function vehiclePose(vehicle) {
  if (vehicle.attachedToPlayer) {
    return {
      x: Number(appCtx.car?.x || 0),
      y: Number(appCtx.car?.y || 0),
      z: Number(appCtx.car?.z || 0),
      yaw: Number(appCtx.car?.angle || 0),
      pitch: Number(appCtx.car?.terrainPitch || 0),
      roll: Number(appCtx.car?.terrainRoll || 0)
    };
  }
  return {
    x: vehicle.x,
    y: vehicle.y,
    z: vehicle.z,
    yaw: vehicle.yaw,
    pitch: Number(vehicle.pitch || 0),
    roll: Number(vehicle.roll || 0)
  };
}

function syncVehiclePose(vehicle, pose) {
  vehicle.x = Number(pose.x || 0);
  vehicle.y = Number(pose.y || 0);
  vehicle.z = Number(pose.z || 0);
  vehicle.yaw = Number(pose.yaw || 0);
  vehicle.pitch = Number(pose.pitch || 0);
  vehicle.roll = Number(pose.roll || 0);
  if (pose.wheelContact) vehicle.wheelContact = pose.wheelContact;
  if (!vehicle.attachedToPlayer) {
    vehicle.visual.root.position.set(vehicle.x, vehicle.y, vehicle.z);
    vehicle.visual.root.rotation.order = 'YXZ';
    vehicle.visual.root.rotation.set(vehicle.pitch, vehicle.yaw, vehicle.roll);
    vehicle.visual.root.updateMatrixWorld(true);
  }
}

function nearestEnterableVehicle(state) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk' || state.transition || state.activeVehicle) return null;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return null;
  let nearest = null;
  for (const vehicle of state.vehicles) {
    if (vehicle.attachedToPlayer || vehicle.occupied || vehicle.roomOccupiedByOther || Number(vehicle.condition ?? 1) <= .05) continue;
    if (vehicle.ambientTraffic === true && Number(vehicle.speed || 0) > 2.5) continue;
    const door = vehicleDoorPosition(vehicle);
    const distance = Math.hypot(door.x - walker.x, door.z - walker.z);
    const enterDistance = state.authority && state.remoteEntities?.has(vehicle.id)
      ? ROOM_RECONCILIATION_ENTER_DISTANCE
      : ENTER_DISTANCE;
    if (distance > enterDistance || nearest && distance >= nearest.distance) continue;
    nearest = { vehicle, door, distance };
  }
  const traffic = state.population?.nearbyVehicles?.(walker, ENTER_DISTANCE + 2) || [];
  for (const agent of traffic) {
    if (agent.promoted || Number(agent.speed || 0) > 2.5) continue;
    const vehicle = {
      id: `traffic:${state.worldIdentity}:${agent.id}`,
      variant: agent.variant,
      color: agent.color,
      x: agent.x,
      y: agent.y + VEHICLE_ROOT_TO_GROUND_METERS,
      z: agent.z,
      yaw: agent.yaw,
      driverSide: state.driveOnLeft ? 1 : -1
    };
    const remote = state.remoteEntities?.get(vehicle.id);
    if (remote?.leaseOwnerUid && remote.leaseOwnerUid !== state.authority?.actorUid && remote.leaseExpiresMs > Date.now()) continue;
    const door = vehicleDoorPosition(vehicle);
    const distance = Math.hypot(door.x - walker.x, door.z - walker.z);
    if (distance > ENTER_DISTANCE || nearest && distance >= nearest.distance) continue;
    nearest = { vehicle, door, distance, trafficAgentId: agent.id };
  }
  const responder = state.responders?.nearestEnterable?.(walker, ENTER_DISTANCE);
  if (responder && (!nearest || responder.distance < nearest.distance)) {
    nearest = {
      vehicle: responder.responder,
      door: responder.door,
      distance: responder.distance,
      responderId: responder.responderId
    };
  }
  return nearest;
}

function npcPose(npc) {
  return {
    x: Number(npc?.visual?.root?.position?.x ?? npc?.x ?? 0),
    y: Number(npc?.visual?.root?.position?.y ?? npc?.y ?? 0),
    z: Number(npc?.visual?.root?.position?.z ?? npc?.z ?? 0),
    yaw: Number(npc?.visual?.root?.rotation?.y ?? npc?.yaw ?? 0)
  };
}

function urbanCollisionTargets(state, reference, radius = 5) {
  if (!state || !reference) return [];
  const promotedNpcIds = new Set(state.npcs.map((npc) => npc.sourceAgentId));
  const promotedVehicleIds = new Set(state.vehicles.map((vehicle) => vehicle.trafficAgentId).filter(Boolean));
  const targets = [
    ...state.npcs.filter((npc) => Number(npc.condition ?? 1) > .05).map((npc) => ({
      kind: 'npc', ref: npc, radius: .42, ...npcPose(npc)
    })),
    ...(state.population?.nearbyPedestrians?.(reference, radius) || [])
      .filter((npc) => !promotedNpcIds.has(npc.id))
      .map((npc) => ({ kind: 'ambient_npc', ref: npc, radius: .42, ...npc })),
    ...state.vehicles.filter((vehicle) => !vehicle.attachedToPlayer && Number(vehicle.condition ?? 1) > .05).map((vehicle) => ({
      kind: 'vehicle', ref: vehicle, radius: Math.max(.78, Number(vehicle.variant?.width || 1.8) * .5), ...vehiclePose(vehicle)
    })),
    ...(state.population?.nearbyVehicles?.(reference, radius) || [])
      .filter((vehicle) => !promotedVehicleIds.has(vehicle.id))
      .map((vehicle) => ({
        kind: 'ambient_vehicle',
        ref: vehicle,
        radius: Math.max(.78, Number(vehicle.variant?.width || 1.8) * .5),
        ...vehicle
      }))
  ];
  (state.responders?.targets?.() || []).forEach((target) => {
    targets.push({ ...target, radius: target.kind === 'responder_vehicle' ? 1.02 : .44 });
  });
  return targets;
}

function materializeCrashTarget(state, target) {
  if (target?.kind === 'ambient_npc') {
    const npc = promotePedestrian(state, target.ref);
    return npc ? { kind: 'npc', ref: npc, radius: .42, ...npcPose(npc) } : target;
  }
  if (target?.kind === 'ambient_vehicle') {
    const vehicle = promoteTrafficVehicle(state, target.ref?.id);
    return vehicle ? {
      kind: 'vehicle', ref: vehicle,
      radius: Math.max(.78, Number(vehicle.variant?.width || 1.8) * .5),
      ...vehiclePose(vehicle)
    } : target;
  }
  return target;
}

function crashTargetMass(target) {
  if (String(target?.kind || '').includes('npc') || target?.kind === 'responder_officer') return 82;
  return vehicleMassKg(target?.ref?.variant || 'sedan');
}

function crashTargetVelocity(target, metersPerWorldUnit) {
  const motion = target?.ref?.crashMotion;
  if (motion) return { x: Number(motion.velocityX || 0), z: Number(motion.velocityZ || 0) };
  const speedWorld = Number(target?.ref?.speed || 0);
  const yaw = Number(target?.yaw ?? target?.ref?.yaw ?? 0);
  return {
    x: Math.sin(yaw) * speedWorld * metersPerWorldUnit,
    z: Math.cos(yaw) * speedWorld * metersPerWorldUnit
  };
}

function applyPlayerCrashResponse(state, response, metersPerWorldUnit) {
  const angle = Number(appCtx.car?.angle || 0);
  const forwardX = Math.sin(angle);
  const forwardZ = Math.cos(angle);
  const lateralX = Math.cos(angle);
  const lateralZ = -Math.sin(angle);
  const forwardMps = response.moverVelocity.x * forwardX + response.moverVelocity.z * forwardZ;
  const lateralMps = response.moverVelocity.x * lateralX + response.moverVelocity.z * lateralZ;
  const toSimulationSpeed = (mps) => mphToCarSpeed(mps * 2.2369362921);
  appCtx.car.speed = toSimulationSpeed(forwardMps);
  appCtx.car.vFwd = appCtx.car.speed;
  appCtx.car.vLat = toSimulationSpeed(lateralMps);
  appCtx.car.vx = response.moverVelocity.x / metersPerWorldUnit;
  appCtx.car.vz = response.moverVelocity.z / metersPerWorldUnit;
  appCtx.car.yawRate = Number(appCtx.car.yawRate || 0) + response.moverYawImpulse;
  appCtx.car.rearSlip = Number(appCtx.car.rearSlip || 0) + response.moverYawImpulse * .48;
  if (response.moverDamageForce > 0) {
    const target = state.activeVehicle || appCtx.car;
    const result = applyTransportDamage(target, response.moverDamageForce);
    appCtx.car.condition = result.after;
    if (state.activeVehicle) {
      state.activeVehicle.condition = result.after;
      state.activeVehicle.visual?.setCondition?.(result.after);
    }
  }
}

function applyCrashTargetMotion(target, response, at) {
  if (!target?.ref || response.severity === 'contact') return;
  target.ref.crashMotion = {
    velocityX: response.targetVelocity.x,
    velocityZ: response.targetVelocity.z,
    angularVelocity: response.targetYawImpulse,
    startedAt: at,
    severity: response.severity
  };
  if (target.kind === 'npc' || target.kind === 'responder_officer') {
    const downed = Number(target.ref.condition ?? 1) <= .05;
    target.ref.knockdownUntil = downed ? Infinity : at + response.knockdownSeconds * 1000;
    target.ref.reaction = downed ? 'downed' : 'knocked-down';
    target.ref.combatState = downed ? NPC_COMBAT_STATES.DOWN : NPC_COMBAT_STATES.RECOVER;
    target.ref.combatStateUntil = target.ref.knockdownUntil;
    target.ref.reactionUntil = target.ref.knockdownUntil;
    target.ref.visual?.setReaction?.(target.ref.reaction);
  } else if ('speed' in target.ref) {
    target.ref.speed = 0;
  }
}

function showCrashFeedback(state, severity) {
  const root = state.crashFeedback;
  if (!root) return;
  root.classList.remove('show');
  void root.offsetWidth;
  root.dataset.severity = String(severity || 'minor');
  root.classList.add('show');
  state.crashFeedbackUntil = now() + 360;
}

function sweptBuildingContact(from, to, radius, options = {}) {
  if (typeof appCtx.checkBuildingCollision !== 'function') return null;
  const spacing = Math.max(.22, Math.min(.65, Number(radius) * .6));
  return sampleSweptContact(from, to, spacing, (position) => {
    const collision = appCtx.checkBuildingCollision(position.x, position.z, radius, options);
    return collision?.collision ? collision : null;
  });
}

function reflectedCrashVelocity(motion, collision, restitution = .18) {
  const normalX = Number(collision?.pushX || 0);
  const normalZ = Number(collision?.pushZ || 0);
  const length = Math.hypot(normalX, normalZ);
  if (!(length > .0001)) {
    return { velocityX: -Number(motion.velocityX || 0) * restitution, velocityZ: -Number(motion.velocityZ || 0) * restitution };
  }
  const nx = normalX / length;
  const nz = normalZ / length;
  const vx = Number(motion.velocityX || 0);
  const vz = Number(motion.velocityZ || 0);
  const inwardSpeed = vx * nx + vz * nz;
  if (inwardSpeed >= 0) return { velocityX: vx, velocityZ: vz };
  return {
    velocityX: (vx - (1 + restitution) * inwardSpeed * nx) * .62,
    velocityZ: (vz - (1 + restitution) * inwardSpeed * nz) * .62
  };
}

function updateCrashBodies(state, dt) {
  const step = Math.max(0, Math.min(.1, Number(dt) || 0));
  const metersPerWorldUnit = Math.max(.001, Number(appCtx.METERS_PER_WORLD_UNIT || 1.11));
  const at = now();
  if (state.activeVehicle?.attachedToPlayer) {
    state.activeVehicle.condition = Math.max(0, Math.min(1, Number(appCtx.car?.condition ?? state.activeVehicle.condition ?? 1)));
    state.activeVehicle.visual?.setCondition?.(state.activeVehicle.condition);
  }
  if (state.crashFeedbackUntil > 0 && state.crashFeedbackUntil <= at) {
    state.crashFeedback?.classList.remove('show');
    state.crashFeedbackUntil = 0;
  }
  state.vehicles.forEach((vehicle) => {
    if (!vehicle.crashMotion || vehicle.attachedToPlayer) return;
    const motion = dampCrashMotion(vehicle.crashMotion, step, { kind: 'vehicle' });
    const nextX = vehicle.x + motion.velocityX / metersPerWorldUnit * step;
    const nextZ = vehicle.z + motion.velocityZ / metersPerWorldUnit * step;
    const secondaryTarget = [
      ...state.vehicles.filter((entry) => entry !== vehicle && !entry.attachedToPlayer && Number(entry.condition ?? 1) > .05).map((entry) => ({
        kind: 'vehicle', ref: entry, x: entry.x, z: entry.z,
        radius: Math.max(.78, Number(entry.variant?.width || 1.8) * .5)
      })),
      ...state.npcs.filter((entry) => Number(entry.condition ?? 1) > .05).map((entry) => ({
        kind: 'npc', ref: entry, x: entry.x, z: entry.z, radius: .42
      }))
    ].find((target) => Math.hypot(Number(target.x) - nextX, Number(target.z) - nextZ) < target.radius + Math.max(.78, Number(vehicle.variant?.width || 1.8) * .5));
    const secondaryKey = secondaryTarget ? `${vehicle.id}:${secondaryTarget.kind}:${secondaryTarget.ref.id}` : '';
    const lastSecondary = Number(state.secondaryCrashCooldowns.get(secondaryKey) || 0);
    if (secondaryTarget && at - lastSecondary > 700) {
      const response = resolveCrashImpact({
        moverMassKg: vehicleMassKg(vehicle.variant),
        targetMassKg: crashTargetMass(secondaryTarget),
        moverVelocity: { x: motion.velocityX, z: motion.velocityZ },
        targetVelocity: crashTargetVelocity(secondaryTarget, metersPerWorldUnit),
        normal: { x: Number(secondaryTarget.x) - vehicle.x, z: Number(secondaryTarget.z) - vehicle.z },
        targetKind: secondaryTarget.kind
      });
      if (response.applied && response.severity !== 'contact') {
        state.secondaryCrashCooldowns.set(secondaryKey, at);
        vehicle.crashMotion = {
          ...vehicle.crashMotion,
          velocityX: response.moverVelocity.x,
          velocityZ: response.moverVelocity.z,
          angularVelocity: response.moverYawImpulse,
          severity: response.severity
        };
        const damage = applyTransportDamage(vehicle, response.moverDamageForce);
        vehicle.condition = damage.after;
        vehicle.visual?.setCondition?.(damage.after);
        state.equipmentRuntime?.applyCollisionImpact?.(secondaryTarget, response.targetDamageForce);
        applyCrashTargetMotion(secondaryTarget, response, at);
        state.lastCrashAction = Object.freeze({
          targetId: String(secondaryTarget.ref.id || ''), targetKind: secondaryTarget.kind,
          severity: response.severity, closingMph: Number(response.closingMph.toFixed(1)),
          energyJoules: Math.round(response.energyJoules), secondary: true, at
        });
        showCrashFeedback(state, response.severity);
        return;
      }
    }
    const collisionRadius = Math.max(.72, Number(vehicle.variant?.width || 1.8) * .46);
    const buildingContact = sweptBuildingContact(vehicle, { x: nextX, z: nextZ }, collisionRadius, {
      actorBaseY: Number(vehicle.y || 0) - VEHICLE_ROOT_TO_GROUND_METERS,
      actorHeight: Number(vehicle.variant?.height || 1.5)
    });
    if (buildingContact) {
      const reflected = reflectedCrashVelocity(motion, buildingContact.contact);
      vehicle.crashMotion = {
        ...motion,
        ...reflected,
        angularVelocity: motion.angularVelocity * .35
      };
      vehicle.x = buildingContact.lastSafe.x;
      vehicle.z = buildingContact.lastSafe.z;
      vehicle.yaw += motion.angularVelocity * step;
      syncVehiclePose(vehicle, vehicle);
      const damage = applyTransportDamage(vehicle, Math.min(42, Math.hypot(motion.velocityX, motion.velocityZ) * 3.1));
      vehicle.condition = damage.after;
      vehicle.visual?.setCondition?.(damage.after);
    } else {
      vehicle.crashMotion = { ...vehicle.crashMotion, ...motion };
      vehicle.x = nextX;
      vehicle.z = nextZ;
      vehicle.yaw += motion.angularVelocity * step;
      syncVehiclePose(vehicle, vehicle);
    }
    if (Math.hypot(motion.velocityX, motion.velocityZ) < .12 && Math.abs(motion.angularVelocity) < .04) {
      vehicle.crashMotion = null;
    }
  });
  state.npcs.forEach((npc) => {
    if (!npc.crashMotion) {
      if (npc.reaction === 'knocked-down' && Number(npc.condition ?? 1) > .05 && Number(npc.knockdownUntil || 0) <= at) {
        npc.reaction = '';
        npc.reactionUntil = 0;
        npc.combatState = NPC_COMBAT_STATES.NORMAL;
        npc.combatStateUntil = 0;
        npc.visual.setReaction('');
      }
      return;
    }
    const motion = dampCrashMotion(npc.crashMotion, step, { kind: 'npc' });
    const nextX = npc.x + motion.velocityX / metersPerWorldUnit * step;
    const nextZ = npc.z + motion.velocityZ / metersPerWorldUnit * step;
    const buildingContact = sweptBuildingContact(npc, { x: nextX, z: nextZ }, .34, {
      actorBaseY: Number(npc.y || 0),
      actorHeight: 1.8
    });
    if (buildingContact) {
      const reflected = reflectedCrashVelocity(motion, buildingContact.contact, .08);
      npc.crashMotion = { ...npc.crashMotion, ...motion, ...reflected };
      npc.x = buildingContact.lastSafe.x;
      npc.z = buildingContact.lastSafe.z;
    } else {
      npc.crashMotion = { ...npc.crashMotion, ...motion };
      npc.x = nextX;
      npc.z = nextZ;
    }
    npc.y = Number(appCtx.SurfaceQuery?.walkAt?.(npc.x, npc.z)?.position?.y ?? npc.y);
    npc.yaw += motion.angularVelocity * step;
    npc.visual.root.position.set(npc.x, npc.y, npc.z);
    npc.visual.root.rotation.y = npc.yaw;
    const stopped = Math.hypot(motion.velocityX, motion.velocityZ) < .1 && Math.abs(motion.angularVelocity) < .04;
    if (!stopped) return;
    npc.crashMotion = null;
    if (Number(npc.condition ?? 1) > .05 && Number(npc.knockdownUntil || 0) <= at) {
      npc.reaction = '';
      npc.reactionUntil = 0;
      npc.combatState = NPC_COMBAT_STATES.NORMAL;
      npc.combatStateUntil = 0;
      npc.visual.setReaction('');
    }
  });
}

function prepareCrashScenarioForSupport(state, targetKind = 'vehicle', speedMph = 30, lateralOffset = 0) {
  if (!appCtx.developerDiagnosticsEnabled || !state.activeVehicle || appCtx.Walk?.state?.mode !== 'drive') return null;
  state.actorCollisionCooldowns.clear();
  state.secondaryCrashCooldowns.clear();
  state.vehicles.forEach((vehicle) => {
    if (!vehicle.attachedToPlayer) vehicle.crashMotion = null;
  });
  const angle = Number(appCtx.car.angle || 0);
  const forward = { x: Math.sin(angle), z: Math.cos(angle) };
  const side = { x: Math.cos(angle), z: -Math.sin(angle) };
  const speedMps = Math.max(0, Math.min(80, Number(speedMph) || 0)) * .44704;
  const units = Math.max(.001, Number(appCtx.METERS_PER_WORLD_UNIT || 1.11));
  let target;
  if (targetKind === 'npc') {
    state.vehicles.filter((vehicle) => !vehicle.attachedToPlayer).forEach((vehicle, index) => {
      vehicle.x = appCtx.car.x - forward.x * 18 + side.x * (8 + index * 4);
      vehicle.z = appCtx.car.z - forward.z * 18 + side.z * (8 + index * 4);
      syncVehiclePose(vehicle, vehicle);
    });
    let npc = state.npcs.find((entry) => Number(entry.condition ?? 1) > .05);
    if (!npc) {
      const nearby = state.population?.nearbyPedestrians?.(appCtx.car, 80) || [];
      npc = nearby.length ? promotePedestrian(state, nearby[0]) : null;
    }
    if (!npc) return null;
    npc.x = appCtx.car.x + forward.x * 3 + side.x * Number(lateralOffset || 0);
    npc.z = appCtx.car.z + forward.z * 3 + side.z * Number(lateralOffset || 0);
    npc.y = Number(appCtx.SurfaceQuery?.walkAt?.(npc.x, npc.z)?.position?.y ?? npc.y);
    npc.condition = 1;
    npc.crashMotion = null;
    npc.reaction = '';
    npc.combatState = NPC_COMBAT_STATES.NORMAL;
    npc.combatStateUntil = 0;
    npc.visual.root.position.set(npc.x, npc.y, npc.z);
    npc.visual.setReaction('');
    target = { id: npc.id, kind: 'npc', x: npc.x, z: npc.z };
  } else {
    const vehicle = state.vehicles.find((entry) => entry !== state.activeVehicle && !entry.attachedToPlayer);
    if (!vehicle) return null;
    state.vehicles.filter((entry) => entry !== state.activeVehicle && entry !== vehicle && !entry.attachedToPlayer).forEach((entry, index) => {
      entry.x = appCtx.car.x - forward.x * 18 + side.x * (8 + index * 4);
      entry.z = appCtx.car.z - forward.z * 18 + side.z * (8 + index * 4);
      syncVehiclePose(entry, entry);
    });
    vehicle.condition = 1;
    vehicle.crashMotion = null;
    vehicle.x = appCtx.car.x + forward.x * 4.1 + side.x * Number(lateralOffset || 0);
    vehicle.z = appCtx.car.z + forward.z * 4.1 + side.z * Number(lateralOffset || 0);
    vehicle.yaw = angle;
    vehicle.visual.setCondition?.(1);
    syncVehiclePose(vehicle, vehicle);
    target = { id: vehicle.id, kind: 'vehicle', x: vehicle.x, z: vehicle.z };
  }
  appCtx.car.speed = mphToCarSpeed(speedMph);
  appCtx.car.vFwd = appCtx.car.speed;
  appCtx.car.vLat = 0;
  appCtx.car.vx = forward.x * speedMps / units;
  appCtx.car.vz = forward.z * speedMps / units;
  appCtx.car.yawRate = 0;
  return Object.freeze({ ...target, speedMph: Number(speedMph), lateralOffset: Number(lateralOffset || 0) });
}

function resolveUrbanActorCollision(from = {}, to = {}, options = {}) {
  const state = activeRuntime;
  if (!activeWorldMatches(state)) return Object.freeze({ x: Number(to.x) || 0, z: Number(to.z) || 0, collision: false });
  const mode = options.mode === 'drive' ? 'drive' : 'walk';
  const actorRadius = mode === 'drive' ? Math.max(.78, Number(options.radius) || .9) : Math.max(.2, Number(options.radius) || .3);
  const source = { x: Number(from.x) || 0, z: Number(from.z) || 0 };
  const destination = { x: Number(to.x) || 0, z: Number(to.z) || 0 };
  const travelDistance = Math.hypot(destination.x - source.x, destination.z - source.z);
  const targets = urbanCollisionTargets(state, destination, Math.max(mode === 'drive' ? 12 : 5, travelDistance + 3));
  const blockerAlong = (start, end) => {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    return targets.map((target) => {
      const targetX = Number(target.x || 0);
      const targetZ = Number(target.z || 0);
      const t = lengthSquared > .000001
        ? Math.max(0, Math.min(1, ((targetX - start.x) * dx + (targetZ - start.z) * dz) / lengthSquared))
        : 1;
      const closestX = start.x + dx * t;
      const closestZ = start.z + dz * t;
      return {
        target,
        t,
        distance: Math.hypot(closestX - targetX, closestZ - targetZ),
        sourceDistance: Math.hypot(start.x - targetX, start.z - targetZ),
        endDistance: Math.hypot(end.x - targetX, end.z - targetZ)
      };
    }).filter((entry) => {
      const combinedRadius = actorRadius + entry.target.radius;
      if (entry.distance >= combinedRadius) return false;
      // If a prior frame left the actor overlapping, permit motion that
      // increases separation instead of trapping both actors together.
      if (entry.sourceDistance < combinedRadius) return entry.endDistance < entry.sourceDistance - .005;
      return entry.t > .0001;
    }).sort((left, right) => left.t - right.t || left.distance - right.distance)[0] || null;
  };
  const direct = blockerAlong(source, destination);
  if (!direct) return Object.freeze({ ...destination, collision: false });

  if (mode === 'drive') {
    const speedMph = Math.abs(Number(options.speedMph || 0));
    const collisionKey = `${direct.target.kind}:${direct.target.ref?.id || ''}`;
    const lastImpact = Number(state.actorCollisionCooldowns.get(collisionKey) || 0);
    if (speedMph >= 3 && now() - lastImpact > 650) {
      state.actorCollisionCooldowns.set(collisionKey, now());
      const target = materializeCrashTarget(state, direct.target);
      const metersPerWorldUnit = Math.max(.001, Number(appCtx.METERS_PER_WORLD_UNIT || 1.11));
      const normal = {
        x: Number(target.x || 0) - (source.x + (destination.x - source.x) * direct.t),
        z: Number(target.z || 0) - (source.z + (destination.z - source.z) * direct.t)
      };
      const response = resolveCrashImpact({
        moverMassKg: Number(appCtx.car?.handlingProfile?.massKg || 1520),
        targetMassKg: crashTargetMass(target),
        moverVelocity: {
          x: Number(options.velocityX || 0) * metersPerWorldUnit,
          z: Number(options.velocityZ || 0) * metersPerWorldUnit
        },
        targetVelocity: crashTargetVelocity(target, metersPerWorldUnit),
        normal,
        targetKind: target.kind
      });
      if (response.applied && response.severity !== 'contact') {
        applyPlayerCrashResponse(state, response, metersPerWorldUnit);
        state.equipmentRuntime?.applyCollisionImpact?.(target, response.targetDamageForce);
        applyCrashTargetMotion(target, response, now());
        state.lastCrashAction = Object.freeze({
          targetId: String(target.ref?.id || ''), targetKind: target.kind,
          severity: response.severity,
          closingMph: Number(response.closingMph.toFixed(1)),
          energyJoules: Math.round(response.energyJoules),
          at: now()
        });
        showCrashFeedback(state, response.severity);
        setStatus(state, `${response.severity === 'minor' ? 'Impact' : 'Crash'} · ${Math.round(response.closingMph)} mph closing speed`, 1800);
        reportCivicEvent(state, {
          kind: 'collision',
          severity: response.severity === 'severe' ? 3 : response.severity === 'major' ? 2 : 1,
          radius: 38,
          audibleRadius: 24,
          maximumWitnesses: 3,
          forceWitness: true
        });
      }
      direct.crashResponse = response;
    } else if (speedMph >= 3 && lastImpact > 0) {
      direct.responseSuppressed = true;
    }
  }

  const slideX = blockerAlong(source, { x: destination.x, z: source.z });
  const slideZ = blockerAlong(source, { x: source.x, z: destination.z });
  const responseApplied = direct.responseSuppressed === true || direct.crashResponse?.applied === true && direct.crashResponse?.severity !== 'contact';
  if (!slideX) return Object.freeze({ x: destination.x, z: source.z, collision: true, responseApplied, targetKind: direct.target.kind });
  if (!slideZ) return Object.freeze({ x: source.x, z: destination.z, collision: true, responseApplied, targetKind: direct.target.kind });
  return Object.freeze({ x: source.x, z: source.z, collision: true, responseApplied, targetKind: direct.target.kind });
}

function nearestNpcCandidate(state, radius = NPC_INTERACTION_DISTANCE) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk' || state.transition) return null;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return null;
  const promoted = state.npcs.map((npc) => {
    const pose = npcPose(npc);
    return { npc, distance: Math.hypot(pose.x - walker.x, pose.z - walker.z), sourceAgentId: npc.sourceAgentId };
  }).filter((entry) => entry.distance <= radius && !(
    Number(entry.npc.condition ?? 1) <= .05 && entry.npc.lootClaimed === true
  ));
  const ambient = (state.population?.nearbyPedestrians?.(walker, radius) || []).map((pedestrian) => ({
    pedestrian,
    distance: Math.hypot(pedestrian.x - walker.x, pedestrian.z - walker.z),
    sourceAgentId: pedestrian.id
  }));
  return [...promoted, ...ambient].sort((a, b) => a.distance - b.distance)[0] || null;
}

function nearestFurnitureCandidate(state, radius = 3.2) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk') return null;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return null;
  return (appCtx.streetFurnitureMeshes || []).map((object) => ({
    object,
    distance: Math.hypot(object.position.x - walker.x, object.position.z - walker.z)
  })).filter((entry) => entry.object?.userData?.interactiveWorldObject && entry.distance <= radius)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function nearestResponderLootCandidate(state, radius = 3.2) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk') return null;
  return state.responders?.nearestDownedOfficer?.(appCtx.Walk?.state?.walker, radius) || null;
}

function nearestLootPickupCandidate(state, radius = LOOT_INTERACTION_DISTANCE) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk') return null;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return null;
  return state.pickups.map((pickup) => ({
    pickup,
    distance: Math.hypot(pickup.position.x - walker.x, pickup.position.z - walker.z)
  })).filter((entry) => !entry.pickup.claimed && entry.distance <= radius)
    .sort((left, right) => left.distance - right.distance)[0] || null;
}

function createLootPickupVisual(THREE, pickup) {
  const root = new THREE.Group();
  root.name = `World loot pickup ${pickup.catalogId}`;
  root.userData.worldLootPickupId = pickup.id;
  root.userData.equipmentPresentation = 'curated-only-local-model';
  root.userData.proceduralEquipmentMeshCount = 0;
  root.position.set(pickup.position.x, pickup.position.y + .12, pickup.position.z);
  root.rotation.set(0, 0, Math.PI * .5);
  void attachCuratedEquipmentVisual(THREE, root, pickup.catalogId);
  return Object.freeze({
    root,
    dispose() {
      disposeCuratedEquipmentVisual(root);
      root.removeFromParent?.();
    }
  });
}

function spawnLootPickup(state, details = {}) {
  if (appCtx.getCurrentMultiplayerRoom?.()) return null;
  const pickup = createLootPickup({
    sourceActorId: details.sourceActorId,
    catalogId: details.weaponId,
    label: details.label,
    rounds: details.rounds,
    position: details.position,
    authority: 'anonymous-local'
  });
  if (!pickup) return null;
  const existing = state.pickups.find((entry) => entry.id === pickup.id);
  if (existing) return existing;
  pickup.visual = createLootPickupVisual(THREE, pickup);
  pickup.spawnedAt = now();
  state.group.add(pickup.visual.root);
  state.pickups.push(pickup);
  return pickup;
}

function dropNpcLoot(state, npc) {
  if (!npc || npc.lootDropped || Number(npc.condition ?? 1) > .05) return null;
  const weaponId = String(npc.heldEquipment || '');
  if (!weaponId) {
    npc.lootDropped = true;
    npc.lootClaimed = true;
    return null;
  }
  const definition = state.equipment.backpack?.definition?.(weaponId);
  const pickup = spawnLootPickup(state, {
    sourceActorId: npc.id,
    weaponId,
    label: definition?.label || 'Recovered equipment',
    rounds: npc.lootRounds,
    position: npcPose(npc)
  });
  if (!pickup) return null;
  npc.lootDropped = true;
  npc.lootClaimed = true;
  if (npc.visual?.heldEquipment) npc.visual.heldEquipment.visible = false;
  return pickup;
}

function collectLootPickup(state, pickupId) {
  if (appCtx.getCurrentMultiplayerRoom?.()) {
    setStatus(state, 'Shared loot is unavailable until the room can validate the pickup.', 2400);
    return true;
  }
  const pickup = state.pickups.find((entry) => entry.id === String(pickupId || ''));
  if (!pickup) return false;
  const result = claimLootPickup(pickup, state.equipment, Date.now());
  if (!result.ok) {
    setStatus(state, result.reason === 'already_claimed' ? 'That gear was already collected.' : 'The Backpack could not collect that gear.', 1800);
    return true;
  }
  pickup.visual?.dispose?.();
  state.pickups.splice(state.pickups.indexOf(pickup), 1);
  setStatus(state, `${result.label} collected · ${result.rounds} rounds added to Backpack`, 2400);
  state.lastNpcAction = Object.freeze({ type: 'loot_collected', pickupId: pickup.id, weaponId: result.catalogId, rounds: result.rounds, at: now() });
  emitProductTelemetry('loot_collected', { equipment_type: result.catalogId, rounds_band: result.rounds >= 20 ? 'high' : result.rounds > 0 ? 'standard' : 'none' });
  renderEquipment(state);
  return true;
}

function disposeLootPickup(state, pickup) {
  const index = state.pickups.indexOf(pickup);
  if (index < 0) return false;
  pickup.visual?.dispose?.();
  state.pickups.splice(index, 1);
  return true;
}

function updateLootPickups(state, dt) {
  const step = Math.max(0, Number(dt) || 0);
  state.lootElapsed += step;
  const current = now();
  state.pickups.slice().forEach((pickup, index) => {
    if (lifecycleExpired(pickup.spawnedAt, ENTITY_LIFECYCLE_MS.lootPickup, current)) {
      disposeLootPickup(state, pickup);
      return;
    }
    if (!pickup.visual?.root) return;
    pickup.visual.root.rotation.y += step * .9;
    pickup.visual.root.position.y = pickup.position.y + .12 + Math.sin(state.lootElapsed * 2.2 + index) * .035;
  });
}

function nearestStoreCandidate(state, radius = STORE_INTERACTION_DISTANCE) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk' || state.storeOpen) return null;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return null;
  // A mapped shop can sit inside its building footprint. Resolving every shop
  // against every collider during world startup made dense cities wait more
  // than a minute before becoming playable. Resolve only stores close enough
  // to interact with and retain that result for the publication lifetime.
  return state.stores
    .filter((store) => Math.hypot(store.x - walker.x, store.z - walker.z) <= radius + 14)
    .map((store) => {
      const resolved = resolvedStoreApproach(state, store);
      return {
        store: resolved,
        distance: Math.hypot(resolved.interactionX - walker.x, resolved.interactionZ - walker.z)
      };
    })
    .filter((entry) => entry.distance <= radius)
    .sort((left, right) => left.distance - right.distance)[0] || null;
}

function storeInteractionCandidate(state) {
  if (!activeWorldMatches(state) || state.transition || appCtx.activeInterior || state.storeOpen) return null;
  const nearestStore = nearestStoreCandidate(state);
  if (!nearestStore) return null;
  return {
    available: true,
    action: 'visit_store',
    label: 'Visit store',
    detail: `${nearestStore.store.name} · today’s game stock`,
    distance: nearestStore.distance,
    data: { storeId: nearestStore.store.id }
  };
}

function activeStore(state) {
  const store = state.stores.find((entry) => entry.id === state.activeStoreId) || null;
  return store ? resolvedStoreApproach(state, store) : null;
}

function stableStoreApproachAngle(storeId) {
  let hash = 2166136261;
  for (const character of String(storeId || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function resolveStoreApproach(state, store) {
  const nearbyStoreCount = state.stores.filter((candidate) => (
    candidate.id !== store.id && Math.hypot(candidate.x - store.x, candidate.z - store.z) < STORE_INTERACTION_DISTANCE * 1.5
  )).length;
  const candidates = nearbyStoreCount === 0 ? [{ x: store.x, z: store.z }] : [];
  const angleOffset = stableStoreApproachAngle(store.id);
  [3, 5, 7, 9, 12, 16, 22, 30, 42, 60].forEach((radius) => {
    const sampleCount = radius >= 16 ? 24 : 12;
    for (let index = 0; index < sampleCount; index += 1) {
      const angle = angleOffset + index / sampleCount * Math.PI * 2;
      candidates.push({ x: store.x + Math.cos(angle) * radius, z: store.z + Math.sin(angle) * radius });
    }
  });
  for (const candidate of candidates) {
    const groundY = Number(appCtx.elevationWorldYAtWorldXZ?.(candidate.x, candidate.z) || 0);
    if (appCtx.checkBuildingCollision?.(candidate.x, candidate.z, .35, { actorBaseY: groundY, actorHeight: 1.8 })?.collision) continue;
    if (appCtx.isInsideWaterArea?.(candidate.x, candidate.z) === true) continue;
    const resolved = appCtx.resolveSafeWorldSpawn?.(candidate.x, candidate.z, {
      mode: 'walk',
      feetY: groundY,
      source: 'mapped_commerce_place_approach',
      maxGroundRadius: 2
    });
    if (resolved?.valid === false) continue;
    return Object.freeze({ ...store, interactionX: Number(resolved?.x ?? candidate.x), interactionZ: Number(resolved?.z ?? candidate.z) });
  }
  return Object.freeze({ ...store, interactionX: store.x, interactionZ: store.z });
}

function resolvedStoreApproach(state, store) {
  if (!store) return null;
  const cached = state.storeApproaches.get(store.id);
  if (cached) return cached;
  const resolved = resolveStoreApproach(state, store);
  state.storeApproaches.set(store.id, resolved);
  return resolved;
}

function moveNearStoreForSupport(state, storeId) {
  if (!appCtx.developerDiagnosticsEnabled || appCtx.Walk?.state?.mode !== 'walk') return null;
  const mappedStore = state.stores.find((entry) => entry.id === String(storeId || ''));
  const store = mappedStore ? resolvedStoreApproach(state, mappedStore) : null;
  if (!store) return null;
  const resolved = appCtx.resolveSafeWorldSpawn?.(store.interactionX, store.interactionZ, {
    mode: 'walk',
    feetY: appCtx.elevationWorldYAtWorldXZ?.(store.interactionX, store.interactionZ),
    source: 'store_verification_setup',
    maxGroundRadius: 2
  });
  if (!resolved || resolved.valid === false) return null;
  appCtx.applyResolvedWorldSpawn?.(resolved, { mode: 'walk', syncCar: false, syncWalker: true });
  return Object.freeze({ storeId: store.id, x: resolved.x, z: resolved.z });
}

function commerceFailureMessage(reason) {
  return {
    not_in_today_stock: 'That item is not in today’s stock.',
    sold_out: 'That item is sold out here today.',
    not_enough_credits: 'Not enough money in your Explorer wallet.',
    not_sellable: 'That Backpack item cannot be sold here.',
    store_not_authorized_for_item: 'This business does not trade that type of item.',
    already_traded_today: 'This store’s rare trade is complete for today.',
    missing_trade_items: 'The Backpack does not have the requested trade items.',
    inventory_unavailable: 'The Backpack could not complete that exchange.'
  }[String(reason || '')] || 'That exchange could not be completed.';
}

function renderStore(state) {
  const ui = state.storeUi;
  const store = activeStore(state);
  const visible = state.storeOpen && !!store && activeWorldMatches(state);
  ui?.root?.classList.toggle('show', visible);
  ui?.root?.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (!visible) return;
  const view = state.commerce.snapshot(store);
  ui.name.textContent = store.name;
  ui.source.textContent = `${store.label} · game stock · ${store.attribution} · ${store.license}`;
  ui.credits.textContent = formatExplorerDollars(view.credits);
  ui.stock.innerHTML = view.standard.map((item) => `
    <article class="urbanStoreCard">
      <strong>${escapeHtml(item.label)}</strong>
      <small>${escapeHtml(item.description)} · ${item.remaining} left today</small>
      <button type="button" data-store-action="buy" data-store-item="${escapeHtml(item.id)}"${item.remaining <= 0 || view.credits < item.buyPrice ? ' disabled' : ''}>Buy · ${formatExplorerDollars(item.buyPrice)}</button>
    </article>`).join('');
  ui.sell.innerHTML = view.sellable.length ? view.sellable.map((item) => `
    <article class="urbanStoreCard">
      <strong>${escapeHtml(item.label)}</strong>
      <small>${item.quantity} in Backpack</small>
      <button type="button" data-store-action="sell" data-store-item="${escapeHtml(item.instanceId)}">Sell one · ${formatExplorerDollars(item.sellPrice)}</button>
    </article>`).join('') : '<div class="urbanBackpackEmpty">No store goods available to sell</div>';
  const rare = view.rare;
  ui.rare.innerHTML = `<article class="urbanStoreCard rare">
    <strong>${escapeHtml(rare.item.label)}</strong>
    <small>One trade per store today · ${rare.requirementQuantity} ${escapeHtml(rare.requirement.label)} + ${formatExplorerDollars(rare.credits)} · carrying ${rare.requirementCarried}</small>
    <button type="button" data-store-action="trade"${rare.available ? '' : ' disabled'}>${rare.claimed ? 'Trade complete today' : 'Make rare trade'}</button>
  </article>`;
  ui.status.textContent = state.storeStatus;
}

function openStore(state, storeId) {
  const store = state.stores.find((entry) => entry.id === String(storeId || ''));
  if (!store || appCtx.Walk?.state?.mode !== 'walk') return false;
  state.equipmentRuntime?.toggle?.(false);
  state.activeStoreId = store.id;
  state.storeOpen = true;
  state.storeStatus = '';
  appCtx.screenLayout?.setPanelLayer?.('store', true);
  appCtx.setPauseReason?.('urban_store', true);
  renderStore(state);
  return true;
}

function closeStore(state) {
  if (!state.storeOpen) return false;
  state.storeOpen = false;
  state.activeStoreId = '';
  state.storeStatus = '';
  state.storeUi?.root?.classList.remove('show');
  state.storeUi?.root?.setAttribute('aria-hidden', 'true');
  appCtx.screenLayout?.setPanelLayer?.('store', false);
  appCtx.setPauseReason?.('urban_store', false);
  return true;
}

function handleStoreAction(state, event) {
  const button = event.target?.closest?.('[data-store-action]');
  const store = activeStore(state);
  if (!button || !store) return false;
  const action = button.dataset.storeAction;
  const result = action === 'buy'
    ? state.commerce.buy(store, button.dataset.storeItem)
    : action === 'sell'
      ? state.commerce.sell(store, button.dataset.storeItem)
      : action === 'trade' ? state.commerce.trade(store) : null;
  if (!result) return false;
  state.storeStatus = result.ok
    ? action === 'sell'
      ? `${result.item.label} sold · ${formatExplorerDollars(result.credits)} available`
      : action === 'trade'
        ? `${result.item.label} added to Backpack · rare trade complete`
        : `${result.item.label} added to Backpack · ${formatExplorerDollars(result.credits)} available`
    : commerceFailureMessage(result.reason);
  if (result.ok) {
    emitProductTelemetry('local_store_exchange', {
      exchange_type: action,
      item_type: result.item?.category || result.item?.id || 'store_item'
    });
  }
  renderStore(state);
  renderEquipment(state);
  return true;
}

function releasePromotedNpc(state, npc, options = {}) {
  const index = state.npcs.indexOf(npc);
  if (index < 0) return false;
  if (options.retire === true) state.population?.retirePedestrian?.(npc.sourceAgentId);
  else state.population?.releasePedestrian?.(npc.sourceAgentId);
  npc.visual.dispose();
  state.curatedNpcAssetOwners.delete(npc.id);
  state.npcs.splice(index, 1);
  return true;
}

function selectCuratedNpcAsset(state) {
  const start = state.curatedNpcAssetCursor % NEARBY_NPC_ASSET_IDS.length;
  state.curatedNpcAssetCursor = (start + 1) % NEARBY_NPC_ASSET_IDS.length;
  return NEARBY_NPC_ASSET_IDS[start] || null;
}

function promotePedestrian(state, source) {
  if (!source?.id) return null;
  const existing = state.npcs.find((npc) => npc.sourceAgentId === source.id);
  if (existing) return existing;
  if (state.npcs.length >= state.npcBudget) {
    const actor = civicActorPosition(state);
    const recyclable = state.npcs.filter((npc) => npc.reaction !== 'reporting' && npc.condition > 0).sort((a, b) => {
      const ap = npcPose(a);
      const bp = npcPose(b);
      return Math.hypot(bp.x - actor.x, bp.z - actor.z) - Math.hypot(ap.x - actor.x, ap.z - actor.z);
    })[0];
    if (!recyclable || Math.hypot(npcPose(recyclable).x - actor.x, npcPose(recyclable).z - actor.z) < 24) return null;
    releasePromotedNpc(state, recyclable);
  }
  const promoted = state.population?.promotePedestrian?.(source.id);
  if (!promoted) return null;
  const promotedId = `urban-npc:${state.worldIdentity}:${promoted.id}`;
  const possessionSeed = [...promotedId].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381);
  const heldEquipment = possessionSeed % 13 === 0
    ? 'compact-sidearm'
    : possessionSeed % 17 === 0 ? 'laser-gun' : possessionSeed % 11 === 0 ? 'paintball-gun' : '';
  const definition = {
    ...promoted,
    id: promotedId,
    sourceAgentId: promoted.id,
    source: 'living-world-promoted-interaction',
    combatRole: heldEquipment ? 'armed-local' : 'civilian',
    heldEquipment
  };
  const visual = createUrbanNpcVisual(THREE, definition);
  const npc = {
    ...definition,
    visual,
    reaction: promoted.reaction,
    condition: 1,
    resistance: 100,
    possessionAvailable: possessionSeed % 5 !== 0,
    lootClaimed: false,
    lootDropped: false,
    lootRounds: definition.heldEquipment ? 12 + possessionSeed % 25 : 0,
    hostileUntil: 0,
    nextShotAt: 0,
    shotsFired: 0,
    combatState: NPC_COMBAT_STATES.NORMAL,
    combatStateUntil: 0
  };
  visual.root.position.set(promoted.x, promoted.y, promoted.z);
  visual.root.rotation.set(0, promoted.yaw, 0);
  state.group.add(visual.root);
  state.npcs.push(npc);
  const curatedAssetId = selectCuratedNpcAsset(state);
  if (curatedAssetId) {
    state.curatedNpcAssetOwners.set(npc.id, curatedAssetId);
    visual.root.userData.disposeCuratedCharacter = () => disposeCuratedCharacter(visual.root);
    visual.root.userData.updateCuratedCharacterAnimation = (moving, deltaTime, running) =>
      updateCuratedCharacterAnimation(visual.root, moving, deltaTime, running);
    void attachCuratedExplorerCharacter(THREE, visual.root, {
      assetId: curatedAssetId,
      role: 'nearby-npc-character',
      variation: 'nearby-npc',
      failClosed: true,
      isCurrent: () => activeWorldMatches(state) && state.npcs.includes(npc)
    }).then((attached) => {
      if (!attached && state.curatedNpcAssetOwners.get(npc.id) === curatedAssetId) {
        state.curatedNpcAssetOwners.delete(npc.id);
      }
    });
  }
  return npc;
}

function maintainNearbyNpcDetails(state) {
  if (!activeWorldMatches(state) || state.transition) return;
  const actor = civicActorPosition(state);
  if (!actor) return;
  const driving = state.activeVehicle && appCtx.Walk?.state?.mode !== 'walk';
  const preloadDistance = driving ? NPC_DRIVING_PRELOAD_DISTANCE : NPC_DETAIL_PRELOAD_DISTANCE;
  const releaseDistance = driving ? NPC_DRIVING_RELEASE_DISTANCE : NPC_DETAIL_RELEASE_DISTANCE;
  const nearby = (state.population?.nearbyPedestrians?.(actor, preloadDistance) || [])
    .map((pedestrian) => ({
      pedestrian,
      distance: Math.hypot(pedestrian.x - actor.x, pedestrian.z - actor.z)
    }))
    .sort((a, b) => a.distance - b.distance);
  // Promoted agents are intentionally hidden from the instanced population's
  // nearby query, so include their current poses when selecting the nearest
  // stable detail set. Otherwise actors would alternate LOD every update.
  const detailCandidates = state.npcs.map((npc) => {
    const pose = npcPose(npc);
    return { id: npc.sourceAgentId, distance: Math.hypot(pose.x - actor.x, pose.z - actor.z) };
  }).filter((entry) => entry.distance <= releaseDistance);
  const desiredIds = new Set([
    ...detailCandidates,
    ...nearby.map((entry) => ({ id: entry.pedestrian.id, distance: entry.distance }))
  ].sort((a, b) => a.distance - b.distance).slice(0, state.npcBudget).map((entry) => entry.id));
  state.npcs.slice().forEach((npc) => {
    if (npc.reaction || npc.reactionUntil === Infinity) return;
    const pose = npcPose(npc);
    const distance = Math.hypot(pose.x - actor.x, pose.z - actor.z);
    if (distance > releaseDistance || !desiredIds.has(npc.sourceAgentId)) {
      releasePromotedNpc(state, npc);
    }
  });
  for (const entry of nearby.filter((candidate) => desiredIds.has(candidate.pedestrian.id))) {
    if (state.npcs.length >= state.npcBudget) break;
    promotePedestrian(state, entry.pedestrian);
  }
}

function releaseDetailedTrafficVehicle(state, vehicle) {
  if (!vehicle?.ambientTraffic || vehicle.attachedToPlayer || vehicle.occupied) return false;
  const index = state.vehicles.indexOf(vehicle);
  if (index < 0) return false;
  state.population?.releaseVehicleDetail?.(vehicle.trafficAgentId);
  vehicle.visual.dispose();
  state.vehicles.splice(index, 1);
  return true;
}

function attachCuratedTrafficDetail(state, vehicle) {
  if (!vehicle?.visual?.root || vehicle.serviceType === 'responder' || vehicle.playerClaimed) return false;
  const assetId = CURATED_TRAFFIC_ASSET_BY_VARIANT[String(vehicle.variant?.id || '')];
  if (!assetId) return false;
  const root = vehicle.visual.root;
  root.userData.disposeCuratedTrafficVehicle = () => disposeCuratedTrafficVehicle(root);
  void attachCuratedTrafficVehicle(THREE, root, {
    assetId,
    variantId: vehicle.variant.id,
    color: vehicle.color,
    dimensionsMeters: vehicle.variant,
    isCurrent: () => activeWorldMatches(state) && state.vehicles.includes(vehicle)
  });
  return true;
}

function retireDetailedTrafficVehicle(state, vehicle) {
  if (!vehicle?.ambientTraffic || vehicle.attachedToPlayer || vehicle.occupied) return false;
  const index = state.vehicles.indexOf(vehicle);
  if (index < 0) return false;
  state.population?.retireVehicleDetail?.(vehicle.trafficAgentId);
  vehicle.visual.dispose();
  state.vehicles.splice(index, 1);
  return true;
}

function retireDisabledRoadVehicle(state, vehicle) {
  if (!vehicle || vehicle.attachedToPlayer || vehicle.occupied || vehicle.playerClaimed) return false;
  if (state.remoteEntities?.has(vehicle.id)) return false;
  if (vehicle.ambientTraffic) return retireDetailedTrafficVehicle(state, vehicle);
  const index = state.vehicles.indexOf(vehicle);
  if (index < 0) return false;
  vehicle.visual?.dispose?.();
  state.vehicles.splice(index, 1);
  return true;
}

function updateEntityLifecycle(state) {
  if (!activeWorldMatches(state)) return;
  const current = now();
  state.npcs.slice().forEach((npc) => {
    if (Number(npc.condition ?? 1) > .05) {
      npc.downedAt = 0;
      return;
    }
    const downedAt = markLifecycleStart(npc, 'downedAt', current);
    if (state.remoteEntities?.has(npc.id)) return;
    if (lifecycleExpired(downedAt, ENTITY_LIFECYCLE_MS.downedActor, current)) {
      releasePromotedNpc(state, npc, { retire: true });
    }
  });
  state.vehicles.slice().forEach((vehicle) => {
    if (Number(vehicle.condition ?? 1) > .05) {
      vehicle.disabledAt = 0;
      return;
    }
    const disabledAt = markLifecycleStart(vehicle, 'disabledAt', current);
    if (lifecycleExpired(disabledAt, ENTITY_LIFECYCLE_MS.disabledRoadVehicle, current)) {
      retireDisabledRoadVehicle(state, vehicle);
    }
  });
}

function verifyEntityLifecycleForSupport(state) {
  if (!appCtx.developerDiagnosticsEnabled || appCtx.getCurrentMultiplayerRoom?.()) return null;
  const current = now();
  const actor = civicActorPosition(state);
  const nearby = state.population?.nearbyPedestrians?.(actor, NPC_DETAIL_PRELOAD_DISTANCE) || [];
  const populationFallback = (state.population?.pedestrianSnapshots?.() || []).find((entry) => !entry.promoted);
  const npc = state.npcs[0] || promotePedestrian(state, nearby[0] || populationFallback);
  const vehicle = state.vehicles.find((entry) => !entry.attachedToPlayer && !entry.occupied && !entry.playerClaimed);
  const pickup = spawnLootPickup(state, {
    sourceActorId: 'lifecycle-verification',
    weaponId: 'compact-sidearm',
    label: 'Recovered equipment',
    rounds: 1,
    position: actor
  });
  const before = Object.freeze({
    npcId: npc?.id || '',
    vehicleId: vehicle?.id || '',
    pickupId: pickup?.id || ''
  });
  if (npc) {
    npc.condition = 0;
    npc.reaction = 'downed';
    npc.reactionUntil = Infinity;
    npc.downedAt = current - ENTITY_LIFECYCLE_MS.downedActor - 1;
    npc.visual?.setReaction?.('downed');
  }
  if (vehicle) {
    vehicle.condition = 0;
    vehicle.disabledAt = current - ENTITY_LIFECYCLE_MS.disabledRoadVehicle - 1;
    vehicle.visual?.setCondition?.(0);
  }
  if (pickup) pickup.spawnedAt = current - ENTITY_LIFECYCLE_MS.lootPickup - 1;
  updateLootPickups(state, 0);
  updateEntityLifecycle(state);
  return Object.freeze({
    before,
    after: Object.freeze({
      npcPresent: npc ? state.npcs.includes(npc) : false,
      vehiclePresent: vehicle ? state.vehicles.includes(vehicle) : false,
      pickupPresent: pickup ? state.pickups.includes(pickup) : false
    })
  });
}

function reserveInteractiveVehicleSlot(state) {
  const interactiveCount = state.vehicles.filter((vehicle) => vehicle.ambientTraffic !== true).length;
  if (interactiveCount < state.budget) return true;
  const actor = civicActorPosition(state);
  const recyclable = state.vehicles.filter((vehicle) =>
    vehicle.ambientTraffic === true && !vehicle.attachedToPlayer && !vehicle.occupied
  ).sort((left, right) => {
    const leftPose = vehiclePose(left);
    const rightPose = vehiclePose(right);
    return Math.hypot(rightPose.x - Number(actor?.x || 0), rightPose.z - Number(actor?.z || 0)) -
      Math.hypot(leftPose.x - Number(actor?.x || 0), leftPose.z - Number(actor?.z || 0));
  })[0];
  if (recyclable) releaseDetailedTrafficVehicle(state, recyclable);
  return state.vehicles.filter((vehicle) => vehicle.ambientTraffic !== true).length < state.budget;
}

function promoteTrafficVehicleDetail(state, trafficAgentId) {
  const existing = state.vehicles.find((vehicle) => vehicle.trafficAgentId === trafficAgentId);
  if (existing) return existing;
  if (state.vehicles.filter((vehicle) => vehicle.ambientTraffic === true).length >= state.vehicleDetailBudget) return null;
  const promoted = state.population?.promoteVehicleDetail?.(trafficAgentId);
  if (!promoted) return null;
  const definition = {
    id: `traffic:${state.worldIdentity}:${promoted.id}`,
    variant: promoted.variant,
    color: promoted.color,
    condition: 1,
    durabilityPolicy: promoted.variant.durabilityPolicy,
    resistance: promoted.variant.resistance,
    playable: promoted.variant.playable,
    enterable: promoted.variant.enterable,
    source: 'living-world-detailed-traffic',
    trafficAgentId,
    ambientTraffic: true,
    speed: promoted.speed,
    x: promoted.x,
    y: promoted.y + VEHICLE_ROOT_TO_GROUND_METERS,
    z: promoted.z,
    yaw: promoted.yaw,
    pitch: promoted.pitch,
    roll: promoted.roll,
    wheelContact: promoted.wheelContact,
    driverSide: state.driveOnLeft ? 1 : -1
  };
  const visual = createUrbanVehicleVisual(THREE, definition);
  const vehicle = { ...definition, visual, attachedToPlayer: false, occupied: false, driver: 'ambient' };
  syncVehiclePose(vehicle, definition);
  state.group.add(visual.root);
  state.vehicles.push(vehicle);
  attachCuratedTrafficDetail(state, vehicle);
  return vehicle;
}

function maintainNearbyVehicleDetails(state) {
  if (!activeWorldMatches(state) || state.transition) return;
  const actor = civicActorPosition(state);
  if (!actor) return;
  const snapshots = state.population?.vehicleSnapshots?.() || [];
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const existingDetails = state.vehicles.filter((vehicle) => vehicle.ambientTraffic === true);
  for (const vehicle of existingDetails) {
    const snapshot = byId.get(vehicle.trafficAgentId);
    if (!snapshot) {
      releaseDetailedTrafficVehicle(state, vehicle);
      continue;
    }
    vehicle.speed = Number(snapshot.speed || 0);
    syncVehiclePose(vehicle, {
      x: snapshot.x,
      y: snapshot.y + VEHICLE_ROOT_TO_GROUND_METERS,
      z: snapshot.z,
      yaw: snapshot.yaw,
      pitch: snapshot.pitch,
      roll: snapshot.roll,
      wheelContact: snapshot.wheelContact
    });
  }
  const availableSlots = state.vehicleDetailBudget;
  const candidates = snapshots
    .filter((snapshot) => snapshot.visible && (!snapshot.promoted || snapshot.detailPromoted))
    .map((snapshot) => ({
      snapshot,
      distance: Math.hypot(snapshot.x - actor.x, snapshot.z - actor.z)
    }))
    .filter((entry) => entry.distance <= VEHICLE_DETAIL_RELEASE_DISTANCE)
    .sort((left, right) => left.distance - right.distance);
  const desiredIds = new Set(candidates.slice(0, availableSlots).map((entry) => entry.snapshot.id));
  for (const vehicle of state.vehicles.slice()) {
    if (!vehicle.ambientTraffic) continue;
    const snapshot = byId.get(vehicle.trafficAgentId);
    const distance = snapshot ? Math.hypot(snapshot.x - actor.x, snapshot.z - actor.z) : Infinity;
    if (distance > VEHICLE_DETAIL_RELEASE_DISTANCE || !desiredIds.has(vehicle.trafficAgentId)) {
      releaseDetailedTrafficVehicle(state, vehicle);
    }
  }
  for (const entry of candidates) {
    if (entry.distance > VEHICLE_DETAIL_PRELOAD_DISTANCE) continue;
    if (!desiredIds.has(entry.snapshot.id)) continue;
    promoteTrafficVehicleDetail(state, entry.snapshot.id);
  }
}

function resolveNpcFromCandidate(state, candidate) {
  const sourceAgentId = String(candidate?.data?.sourceAgentId || '');
  if (!sourceAgentId) return null;
  return state.npcs.find((npc) => npc.sourceAgentId === sourceAgentId) ||
    promotePedestrian(state, candidate?.data?.pedestrian || { id: sourceAgentId });
}

function resolveExitSpawn(vehicle) {
  const pose = vehiclePose(vehicle);
  const model = { ...vehicle, ...pose };
  for (const candidate of vehicleExitCandidates(model)) {
    const resolved = appCtx.resolveSafeWorldSpawn?.(candidate.x, candidate.z, {
      mode: 'walk',
      angle: pose.yaw,
      feetY: pose.y - 1.2,
      preserveElevatedSurface: true,
      source: 'urban_vehicle_exit',
      maxGroundRadius: 8
    });
    if (!resolved || resolved.valid === false) continue;
    if (Math.hypot(resolved.x - pose.x, resolved.z - pose.z) > 6) continue;
    return resolved;
  }
  return null;
}

function interactionCandidate(state) {
  if (!activeWorldMatches(state) || state.transition || appCtx.activeInterior || state.storeOpen) return null;
  if (state.activeVehicle && appCtx.Walk?.state?.mode !== 'walk') {
    const speed = Math.abs(Number(appCtx.car?.speed || 0));
    return {
      available: true,
      action: 'exit_vehicle',
      label: speed <= EXIT_SPEED_LIMIT ? 'Exit vehicle' : 'Stop to exit',
      detail: state.activeVehicle.variant.label,
      distance: 0,
      data: { vehicleId: state.activeVehicle.id, speed }
    };
  }
  const nearestVehicle = nearestEnterableVehicle(state);
  const nearestNpc = nearestNpcCandidate(state);
  const nearestFurniture = nearestFurnitureCandidate(state);
  const nearestResponderLoot = nearestResponderLootCandidate(state);
  const nearestLoot = nearestLootPickupCandidate(state);
  const nearestStore = nearestStoreCandidate(state);
  if (!nearestVehicle && !nearestNpc && !nearestFurniture && !nearestResponderLoot && !nearestLoot && !nearestStore) return null;
  const nearestOtherDistance = Math.min(
    nearestVehicle?.distance ?? Infinity,
    nearestNpc?.distance ?? Infinity,
    nearestFurniture?.distance ?? Infinity,
    nearestLoot?.distance ?? Infinity,
    nearestStore?.distance ?? Infinity
  );
  if (nearestResponderLoot && nearestResponderLoot.distance <= nearestOtherDistance) {
    return {
      available: true,
      action: 'loot_responder',
      label: 'Collect gear',
      detail: 'Downed responder',
      distance: nearestResponderLoot.distance,
      takeLabel: 'Collect gear',
      data: { officerId: nearestResponderLoot.officer.id }
    };
  }
  if (nearestLoot && nearestLoot.distance <= Math.min(
    nearestVehicle?.distance ?? Infinity,
    nearestNpc?.distance ?? Infinity,
    nearestFurniture?.distance ?? Infinity,
    nearestStore?.distance ?? Infinity
  )) {
    return {
      available: true,
      action: 'collect_loot',
      label: 'Collect gear',
      detail: `${nearestLoot.pickup.label} · ${nearestLoot.pickup.rounds} rounds`,
      distance: nearestLoot.distance,
      data: { pickupId: nearestLoot.pickup.id }
    };
  }
  if (nearestStore && nearestStore.distance <= Math.min(
    nearestVehicle?.distance ?? Infinity,
    nearestNpc?.distance ?? Infinity,
    nearestFurniture?.distance ?? Infinity
  )) {
    return {
      available: true,
      action: 'visit_store',
      label: 'Visit store',
      detail: `${nearestStore.store.name} · today’s game stock`,
      distance: nearestStore.distance,
      data: { storeId: nearestStore.store.id }
    };
  }
  if (nearestFurniture && (!nearestVehicle || nearestFurniture.distance < nearestVehicle.distance) && (!nearestNpc || nearestFurniture.distance < nearestNpc.distance)) {
    return {
      available: true,
      action: 'inspect_object',
      label: 'Inspect',
      detail: String(nearestFurniture.object.userData.furnitureKind || 'street object').replaceAll('_', ' '),
      distance: nearestFurniture.distance,
      secondaryLabel: state.equipment?.equipped?.()?.actionLabel || 'Use',
      data: { objectUuid: nearestFurniture.object.uuid }
    };
  }
  if (nearestNpc && (!nearestVehicle || nearestNpc.distance <= nearestVehicle.distance)) {
    const downed = Number(nearestNpc.npc?.condition ?? 1) <= .05;
    const equipped = state.equipment?.equipped?.();
    return {
      available: true,
      action: downed ? 'loot_npc' : 'talk_npc',
      label: downed ? 'Search' : 'Talk',
      detail: String(nearestNpc.npc?.archetype || nearestNpc.pedestrian?.archetype || 'Local').replaceAll('-', ' '),
      distance: nearestNpc.distance,
      secondaryLabel: downed ? '' : equipped?.actionLabel || 'Use',
      takeLabel: downed ? 'Collect gear' : 'Take item',
      data: {
        sourceAgentId: nearestNpc.sourceAgentId,
        pedestrian: nearestNpc.pedestrian || null
      }
    };
  }
  return {
    available: true,
    action: 'enter_vehicle',
    label: `Enter ${nearestVehicle.vehicle.variant.label}`,
    detail: nearestVehicle.responderId
      ? 'Emergency vehicle · taking it escalates pursuit'
      : nearestVehicle.trafficAgentId ? 'Take driver seat' : 'Driver seat',
    distance: nearestVehicle.distance,
    secondaryLabel: state.equipment?.equipped?.()?.actionLabel || 'Use',
    data: {
      vehicleId: nearestVehicle.vehicle.id,
      trafficAgentId: nearestVehicle.trafficAgentId || '',
      responderId: nearestVehicle.responderId || ''
    }
  };
}

function doorForVehicle(vehicle) {
  return vehicle.driverSide < 0 ? vehicle.visual.doors.left : vehicle.visual.doors.right;
}

function setDoorProgress(vehicle, progress) {
  const door = doorForVehicle(vehicle);
  if (!door) return;
  const direction = vehicle.driverSide < 0 ? 1 : -1;
  door.rotation.y = direction * Math.max(0, Math.min(1, progress)) * 1.04;
}

function resetPlayerVehicleVisual(state) {
  state.defaultCarChildren.forEach((child) => {
    child.visible = true;
  });
  if (appCtx.carMesh?.userData?.curatedVehicleVisual) {
    appCtx.carMesh.userData.curatedVehicleVisual.visible = true;
  }
  appCtx.wheelMeshes = state.defaultWheelMeshes;
  if (appCtx.carMesh?.userData) {
    delete appCtx.carMesh.userData.activeUrbanVehicleId;
    appCtx.carMesh.userData.vehicleStyle = state.defaultVehicleStyle;
  }
  appCtx.car.vehicleVariantId = 'sedan';
  appCtx.car.vehicleServiceType = '';
  appCtx.car.vehicleServiceLightsActive = false;
  appCtx.car.condition = state.defaultCarCondition;
  appCtx.car.durabilityPolicy = state.defaultCarDurabilityPolicy;
  appCtx.car.resistance = state.defaultCarResistance;
  appCtx.car.transportCatalogId = 'sedan';
}

function stopServiceSiren(state) {
  const audio = state.sirenAudio;
  if (!audio) return false;
  state.sirenAudio = null;
  try {
    const at = audio.context.currentTime;
    audio.gain.gain.cancelScheduledValues(at);
    audio.gain.gain.setValueAtTime(audio.gain.gain.value, at);
    audio.gain.gain.linearRampToValueAtTime(0, at + .08);
    audio.oscillator.stop(at + .1);
  } catch (_) {
    try { audio.oscillator.stop(); } catch (_) {}
  }
  return true;
}

function startServiceSiren(state) {
  stopServiceSiren(state);
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) return false;
  try {
    const context = state.serviceAudioContext || new AudioContext();
    state.serviceAudioContext = context;
    void context.resume?.();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 680;
    gain.gain.value = .028;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    state.sirenAudio = { context, oscillator, gain };
    return true;
  } catch (_) {
    state.sirenAudio = null;
    return false;
  }
}

function setActiveServiceEquipment(state, active) {
  const vehicle = state.activeVehicle;
  if (!vehicle?.attachedToPlayer || vehicle.serviceType !== 'responder') return false;
  vehicle.serviceEquipmentActive = active === true;
  appCtx.car.vehicleServiceLightsActive = vehicle.serviceEquipmentActive;
  vehicle.visual?.setServiceLights?.(state.serviceLightElapsed, vehicle.serviceEquipmentActive);
  if (vehicle.serviceEquipmentActive) startServiceSiren(state);
  else stopServiceSiren(state);
  setStatus(state, vehicle.serviceEquipmentActive
    ? 'Emergency lights and siren on.'
    : 'Emergency lights and siren off.', 1600);
  state.lastAction = Object.freeze({
    type: 'service_equipment_toggled',
    vehicleId: vehicle.id,
    active: vehicle.serviceEquipmentActive,
    at: now()
  });
  emitProductTelemetry('responder_equipment_toggled', {
    active: vehicle.serviceEquipmentActive,
    vehicle_type: vehicle.variant?.id || 'responder'
  });
  appCtx.updateControlsModeUI?.();
  return true;
}

function toggleActiveServiceEquipment(state) {
  return setActiveServiceEquipment(state, !state.activeVehicle?.serviceEquipmentActive);
}

function updateServiceEquipment(state, dt) {
  state.serviceLightElapsed += Math.max(0, Number(dt) || 0);
  const keyDown = appCtx.keys?.KeyH === true;
  if (keyDown && !state.serviceEquipmentKeyHeld) toggleActiveServiceEquipment(state);
  state.serviceEquipmentKeyHeld = keyDown;
  for (const vehicle of state.vehicles) {
    vehicle.visual?.updateDamageVisual?.(state.serviceLightElapsed);
    if (vehicle.serviceType !== 'responder' || !vehicle.playerClaimed) continue;
    vehicle.visual?.setServiceLights?.(state.serviceLightElapsed, vehicle.serviceEquipmentActive === true);
  }
  if (state.sirenAudio && state.activeVehicle?.serviceEquipmentActive) {
    const frequency = 680 + Math.sin(state.serviceLightElapsed * 3.25) * 190;
    state.sirenAudio.oscillator.frequency.setTargetAtTime(frequency, state.sirenAudio.context.currentTime, .025);
  }
}

function mountVehicleForDriving(state, vehicle) {
  const pose = vehiclePose(vehicle);
  state.defaultCarChildren.forEach((child) => { child.visible = false; });
  if (appCtx.carMesh?.userData?.curatedVehicleVisual) {
    appCtx.carMesh.userData.curatedVehicleVisual.visible = false;
  }
  vehicle.visual.root.removeFromParent?.();
  vehicle.visual.root.position.set(0, 0, 0);
  vehicle.visual.root.rotation.set(0, 0, 0);
  appCtx.carMesh.add(vehicle.visual.root);
  vehicle.attachedToPlayer = true;
  vehicle.occupied = true;
  vehicle.driver = 'player';
  appCtx.wheelMeshes = vehicle.visual.wheels;
  appCtx.carMesh.userData.activeUrbanVehicleId = vehicle.id;
  appCtx.carMesh.userData.vehicleStyle = `urban-${vehicle.variant.bodyStyle}`;
  appCtx.car.vehicleVariantId = vehicle.variant.id;
  appCtx.car.vehicleServiceType = vehicle.serviceType || '';
  appCtx.car.vehicleServiceLightsActive = vehicle.serviceEquipmentActive === true;
  appCtx.car.condition = Math.max(0, Math.min(1, Number(vehicle.condition ?? 1)));
  appCtx.car.durabilityPolicy = vehicle.durabilityPolicy || vehicle.variant?.durabilityPolicy || 'standard';
  appCtx.car.resistance = Number(vehicle.resistance || vehicle.variant?.resistance || 160);
  appCtx.car.transportCatalogId = vehicle.variant.id;
  appCtx.car.x = pose.x;
  appCtx.car.y = pose.y;
  appCtx.car.z = pose.z;
  appCtx.car.angle = pose.yaw;
  appCtx.car.terrainPitch = Number(pose.pitch || 0);
  appCtx.car.terrainRoll = Number(pose.roll || 0);
  appCtx.car.speed = 0;
  appCtx.car.vFwd = 0;
  appCtx.car.vLat = 0;
  appCtx.car.yawRate = 0;
  appCtx.carMesh.position.set(pose.x, pose.y, pose.z);
  appCtx.carMesh.rotation.order = 'YXZ';
  appCtx.carMesh.rotation.set(appCtx.car.terrainPitch, pose.yaw, appCtx.car.terrainRoll);
  appCtx.carMesh.visible = true;
  appCtx.invalidateRoadCache?.();
  state.activeVehicle = vehicle;
}

function parkActiveVehicle(state, vehicle) {
  const pose = vehiclePose(vehicle);
  appCtx.carMesh.remove(vehicle.visual.root);
  state.group.add(vehicle.visual.root);
  vehicle.attachedToPlayer = false;
  vehicle.occupied = false;
  vehicle.driver = '';
  syncVehiclePose(vehicle, pose);
  state.activeVehicle = null;
  resetPlayerVehicleVisual(state);
  return pose;
}

function handoffEnter(state, transition) {
  const vehicle = transition.vehicle;
  state.equipmentOpen = false;
  appCtx.screenLayout?.setPanelLayer?.('backpack', false);
  appCtx.Walk?.setModeDrive?.();
  mountVehicleForDriving(state, vehicle);
  appCtx.updateControlsModeUI?.();
  renderEquipment(state);
}

function handoffExit(state, transition) {
  const vehicle = transition.vehicle;
  const exitSpawn = transition.exitSpawn;
  if (vehicle.serviceEquipmentActive) setActiveServiceEquipment(state, false);
  parkActiveVehicle(state, vehicle);
  appCtx.applyResolvedWorldSpawn?.(exitSpawn, { mode: 'walk', syncCar: false, syncWalker: true });
  appCtx.Walk?.setModeWalk?.({ preserveResolvedSpawn: true, preserveResolvedSurface: true });
  appCtx.updateControlsModeUI?.();
  renderEquipment(state);
}

function updateTransition(state, dt) {
  const transition = state.transition;
  if (!transition) return;
  transition.elapsed += Math.max(0, Number(dt) || 0);
  const t = Math.min(1, transition.elapsed / transition.duration);
  const doorProgress = t < 0.46 ? t / 0.46 : Math.max(0, 1 - (t - 0.46) / 0.54);
  setDoorProgress(transition.vehicle, doorProgress);
  if (!transition.handoffComplete && t >= 0.46) {
    transition.handoffComplete = true;
    if (transition.kind === 'enter') handoffEnter(state, transition);
    else handoffExit(state, transition);
  }
  if (t >= 1) {
    setDoorProgress(transition.vehicle, 0);
    if (transition.kind === 'exit' && state.authority) {
      state.authority.releaseVehicle(transition.vehicle, vehiclePose(transition.vehicle)).then((result) => {
        if (!result?.accepted && activeWorldMatches(state)) setStatus(state, 'Vehicle release is still synchronizing with the room.', 1800);
      }).catch(() => {
        if (activeWorldMatches(state)) setStatus(state, 'Vehicle release is reconnecting; the lease will expire safely.', 2200);
      });
    }
    state.lastAction = Object.freeze({
      type: transition.kind === 'enter' ? 'entered' : 'exited',
      vehicleId: transition.vehicle.id,
      at: now()
    });
    emitProductTelemetry(transition.kind === 'enter' ? 'vehicle_entered' : 'vehicle_exited', {
      vehicle_type: transition.vehicle.variant?.id || 'road_vehicle',
      service_type: transition.vehicle.serviceType || 'civilian'
    });
    state.transition = null;
  }
}

function beginEnter(state, vehicle) {
  if (!vehicle || state.transition || state.activeVehicle || appCtx.Walk?.state?.mode !== 'walk') return false;
  if (vehicle.ambientTraffic === true && vehicle.trafficAgentId) {
    const promoted = state.population?.promoteVehicle?.(vehicle.trafficAgentId);
    if (!promoted) return false;
    vehicle.ambientTraffic = false;
    vehicle.driver = '';
    vehicle.speed = 0;
    vehicle.source = 'living-world-promoted-traffic';
    syncVehiclePose(vehicle, {
      x: promoted.x,
      y: promoted.y + VEHICLE_ROOT_TO_GROUND_METERS,
      z: promoted.z,
      yaw: promoted.yaw,
      pitch: promoted.pitch,
      roll: promoted.roll,
      wheelContact: promoted.wheelContact
    });
  }
  state.transition = { kind: 'enter', vehicle, elapsed: 0, duration: TRANSITION_DURATION, handoffComplete: false };
  appCtx.clearControlInputState?.('urban_vehicle_enter');
  return true;
}

function beginExit(state) {
  const vehicle = state.activeVehicle;
  if (!vehicle || state.transition || appCtx.Walk?.state?.mode === 'walk') return false;
  if (Math.abs(Number(appCtx.car?.speed || 0)) > EXIT_SPEED_LIMIT) {
    state.statusMessage = 'Stop the vehicle before exiting.';
    state.statusUntil = now() + 1800;
    return false;
  }
  const exitSpawn = resolveExitSpawn(vehicle);
  if (!exitSpawn) {
    state.statusMessage = 'There is not enough room to exit here.';
    state.statusUntil = now() + 2200;
    return false;
  }
  state.transition = { kind: 'exit', vehicle, exitSpawn, elapsed: 0, duration: TRANSITION_DURATION, handoffComplete: false };
  appCtx.clearControlInputState?.('urban_vehicle_exit');
  return true;
}

function civicActorPosition(state) {
  if (state.activeVehicle) return vehiclePose(state.activeVehicle);
  return appCtx.Walk?.state?.walker || appCtx.car || null;
}

function mappedFacilitySpawnFor(state, type, origin = civicActorPosition(state)) {
  const facility = nearestMappedFacility(appCtx.pois, origin, type);
  if (!facility) return null;
  const resolved = appCtx.resolveSafeWorldSpawn?.(facility.x, facility.z, {
    mode: 'walk',
    angle: 0,
    feetY: appCtx.elevationWorldYAtWorldXZ?.(facility.x, facility.z),
    preserveElevatedSurface: false,
    source: `mapped_${type}_facility`,
    maxGroundRadius: 18
  });
  if (!resolved || resolved.valid === false) return null;
  return Object.freeze({ facility, resolved });
}

function placePlayerAtMappedFacility(state, type, reason) {
  if (state.custody?.active || appCtx.Walk?.state?.mode !== 'walk') return false;
  const destination = mappedFacilitySpawnFor(state, type);
  if (!destination) {
    const label = type === 'hospital' ? 'hospital' : 'police facility';
    setStatus(state, `No mapped ${label} is loaded nearby; relocation was not fabricated.`, 3600);
    return false;
  }
  state.custody = {
    active: true,
    type,
    reason,
    facility: destination.facility,
    resolved: destination.resolved,
    at: now()
  };
  appCtx.applyResolvedWorldSpawn?.(destination.resolved, { mode: 'walk', syncCar: false, syncWalker: true });
  const caught = document.getElementById('caughtScreen');
  const title = caught?.querySelector?.('.caughtTitle');
  const message = caught?.querySelector?.('.caughtText');
  const button = document.getElementById('caughtBtn');
  if (title) title.textContent = type === 'hospital' ? '🏥 RECOVERING' : '🚔 IN CUSTODY';
  if (message) message.textContent = type === 'hospital'
    ? `Recovering at ${destination.facility.name} · mapped hospital`
    : `Taken to ${destination.facility.name} · mapped police facility`;
  if (button) button.textContent = type === 'hospital' ? 'Leave Hospital' : 'Continue';
  caught?.classList.add('show');
  appCtx.setPauseReason?.('caught', true);
  state.playerCondition = 1;
  renderEquipment(state);
  state.civic?.clear?.();
  state.responders?.clearIncident?.();
  state.actorCollisionCooldowns?.clear?.();
  state.secondaryCrashCooldowns?.clear?.();
  state.recklessElapsed = 0;
  state.recklessEventCooldown = 4;
  appCtx.clearControlInputState?.('urban_custody');
  return true;
}

function placePlayerInCustody(state, reason = 'arrested') {
  return placePlayerAtMappedFacility(state, 'police', reason);
}

function placePlayerInMedicalRecovery(state, reason = 'incapacitated') {
  return placePlayerAtMappedFacility(state, 'hospital', reason);
}

function applyOfficerImpact(state, impact = {}) {
  if (!activeWorldMatches(state) || state.custody?.active) return false;
  const force = Math.max(0, Number(impact.force) || 0);
  state.playerCondition = Math.max(0, Number(state.playerCondition ?? 1) - force / 100);
  setStatus(state, `Responder hit · ${Math.round(state.playerCondition * 100)}% condition`, 1500);
  renderEquipment(state);
  if (state.playerCondition <= .05 && !placePlayerInMedicalRecovery(state, 'incapacitated')) {
    // A missing mapped hospital must not strand the session or invent a place.
    state.playerCondition = .2;
    renderEquipment(state);
  }
  return true;
}

function applyArmedNpcImpact(state, impact = {}) {
  if (!activeWorldMatches(state) || state.custody?.active) return false;
  const force = Math.max(0, Number(impact.force) || 0);
  state.playerCondition = Math.max(0, Number(state.playerCondition ?? 1) - force / 100);
  setStatus(state, `Incoming fire · ${Math.round(state.playerCondition * 100)}% condition`, 1500);
  renderEquipment(state);
  if (state.playerCondition <= .05 && !placePlayerInMedicalRecovery(state, 'incapacitated')) {
    state.playerCondition = .2;
    renderEquipment(state);
  }
  return true;
}

function civicSnapshot(state) {
  const authorityMode = state.roomAuthorityRuntime?.snapshot?.()?.mode || 'local';
  if (authorityMode !== 'local') return state.roomAuthorityRuntime?.civicSnapshot?.() || null;
  return state.civic?.snapshot?.() || null;
}

function updateCivicStatus(state) {
  const root = state.civicUi?.root;
  if (!root) return;
  const snapshot = civicSnapshot(state);
  const responderStatus = state.responders?.snapshot?.()?.status;
  const status = responderStatus?.visible === true ? responderStatus : snapshot?.status;
  root.classList.toggle('show', status?.visible === true);
  root.setAttribute('aria-hidden', status?.visible === true ? 'false' : 'true');
  root.dataset.level = String(snapshot?.level || 0);
  if (status?.visible) {
    state.civicUi.title.textContent = status.title;
    state.civicUi.detail.textContent = status.detail;
    state.civicUi.meter.textContent = '●'.repeat(snapshot.level) + '○'.repeat(Math.max(0, 3 - snapshot.level));
  }
}

function promoteCivicWitness(state, witness) {
  if (!witness?.id) return null;
  const npc = promotePedestrian(state, witness);
  if (!npc) return null;
  if (Number(npc.condition ?? 1) <= .05 || Number(npc.knockdownUntil || 0) > now() || npc.reaction === 'knocked-down') {
    return npc;
  }
  npc.reaction = witness.reaction;
  npc.combatState = NPC_COMBAT_STATES.ALERT;
  npc.visual.setReaction(witness.reaction);
  return npc;
}

function reportCivicEvent(state, event = {}) {
  const position = event.position || civicActorPosition(state);
  const witnesses = [...(state.population?.witnessEvent?.({
    kind: event.kind,
    position,
    radius: event.radius,
    audibleRadius: event.audibleRadius,
    maximumWitnesses: event.maximumWitnesses
  }) || [])];
  const maximumWitnesses = Math.max(1, Number(event.maximumWitnesses) || 3);
  const knownWitnessIds = new Set(witnesses.map((witness) => witness.id));
  state.npcs.map((npc) => {
    const pose = npcPose(npc);
    return { npc, pose, distance: Math.hypot(pose.x - position.x, pose.z - position.z) };
  }).filter((entry) => entry.npc.condition > .05 && Number(entry.npc.knockdownUntil || 0) <= now() && entry.distance <= Math.max(0, Number(event.radius) || 0))
    .sort((a, b) => a.distance - b.distance)
    .forEach((entry) => {
      if (witnesses.length >= maximumWitnesses || knownWitnessIds.has(entry.npc.sourceAgentId)) return;
      witnesses.push({ id: entry.npc.sourceAgentId, distance: entry.distance, reaction: 'reporting' });
      knownWitnessIds.add(entry.npc.sourceAgentId);
    });
  if (event.forceWitness && !witnesses.length) {
    witnesses.push({ id: `responder-witness:${event.vehicleId || 'incident'}`, reaction: 'reporting', synthetic: true });
  }
  const authorityMode = state.roomAuthorityRuntime?.snapshot?.()?.mode || 'local';
  if (authorityMode !== 'local') {
    if (!witnesses.length) return Object.freeze({ accepted: false, reason: 'unwitnessed' });
    promoteCivicWitness(state, witnesses[0]);
    const pending = Object.freeze({
      accepted: true,
      pending: true,
      event: Object.freeze({
        id: 'room-authority-pending',
        kind: event.kind,
        witnessCount: witnesses.length
      })
    });
    state.lastCivicAction = Object.freeze({
      type: event.kind,
      eventId: pending.event.id,
      witnessCount: witnesses.length,
      authority: 'room',
      at: now()
    });
    state.roomAuthorityRuntime.reportCivicEvent({ ...event, position }, witnesses).then((result) => {
      if (!activeWorldMatches(state)) return;
      if (!result?.accepted) {
        setStatus(state, result?.reason === 'cooldown'
          ? 'The current room incident is already being reported.'
          : 'Shared civic response is reconnecting.', 2200);
        return;
      }
      state.lastCivicAction = Object.freeze({
        type: event.kind,
        eventId: result.state?.eventId || '',
        witnessCount: result.state?.witnessCount || witnesses.length,
        authority: 'room',
        at: now()
      });
      updateCivicStatus(state);
    }).catch(() => {
      if (activeWorldMatches(state)) setStatus(state, 'Shared civic response is reconnecting.', 2200);
    });
    return pending;
  }
  const result = state.civic.observe({ ...event, position }, witnesses);
  if (result.accepted) {
    promoteCivicWitness(state, witnesses[0]);
    state.lastCivicAction = Object.freeze({
      type: event.kind,
      eventId: result.event.id,
      witnessCount: result.event.witnessCount,
      at: now()
    });
  }
  updateCivicStatus(state);
  return result;
}

function updateCivicResponse(state, dt) {
  const step = Math.max(0, Number(dt) || 0);
  const authorityMode = state.roomAuthorityRuntime?.snapshot?.()?.mode || 'local';
  if (authorityMode === 'local') {
    const responderSnapshot = state.responders?.snapshot?.();
    const detected = (responderSnapshot?.responders || []).some((responder) =>
      Number(responder.distanceToActor) <= (responder.officer ? 46 : 58)
    );
    const responseEnRoute = Number(responderSnapshot?.activeCount || 0) > 0 &&
      ['dispatched', 'pursuit', 'searching'].includes(String(responderSnapshot?.phase || ''));
    state.civic.update(step, civicActorPosition(state), { detected, responseEnRoute });
  }
  state.recklessEventCooldown = Math.max(0, state.recklessEventCooldown - step);
  if (state.activeVehicle?.attachedToPlayer && appCtx.Walk?.state?.mode !== 'walk') {
    const mph = Math.abs(carSpeedToMph(Number(appCtx.car?.speed || 0)));
    const roadLimit = Math.max(15, Number(appCtx.car?.road?.limit || 25));
    const reckless = mph >= Math.max(45, roadLimit + 18);
    state.recklessElapsed = reckless
      ? Math.min(4, state.recklessElapsed + step)
      : Math.max(0, state.recklessElapsed - step * 2);
    if (state.recklessElapsed >= 2 && state.recklessEventCooldown <= 0) {
      const result = reportCivicEvent(state, {
        kind: 'reckless_driving',
        vehicleId: state.activeVehicle.id,
        severity: 1,
        radius: 34,
        audibleRadius: 18,
        maximumWitnesses: 3
      });
      state.recklessEventCooldown = result.accepted ? 14 : 4;
      state.recklessElapsed = 0;
    }
  } else {
    state.recklessElapsed = 0;
  }
  const currentCivic = civicSnapshot(state);
  state.responders?.update?.(step, currentCivic, civicActorPosition(state));
  const witnessReaction = currentCivic?.phase === 'observed' || currentCivic?.phase === 'reporting'
    ? 'reporting'
    : currentCivic?.phase === 'searching' ? 'watching' : '';
  const actor = civicActorPosition(state);
  const current = now();
  state.npcs.forEach((npc) => {
    const combatState = resolveNpcCombatState(npc, current, { alert: !!witnessReaction });
    npc.combatState = combatState;
    if (combatState === NPC_COMBAT_STATES.FLEE && actor) {
      const pose = npcPose(npc);
      const dx = pose.x - Number(actor.x || 0);
      const dz = pose.z - Number(actor.z || 0);
      const distance = Math.max(.001, Math.hypot(dx, dz));
      const stepDistance = Math.min(.22, step * 2.25);
      const nextX = pose.x + dx / distance * stepDistance;
      const nextZ = pose.z + dz / distance * stepDistance;
      const groundY = Number(appCtx.SurfaceQuery?.walkAt?.(nextX, nextZ)?.position?.y ?? pose.y);
      const blocked = appCtx.checkBuildingCollision?.(nextX, nextZ, .34, { actorBaseY: groundY, actorHeight: 1.8 })?.collision === true;
      if (!blocked) {
        npc.x = nextX;
        npc.z = nextZ;
        npc.y = groundY;
        npc.yaw = Math.atan2(dx, dz);
        npc.visual.root.position.set(npc.x, npc.y, npc.z);
        npc.visual.root.rotation.y = npc.yaw;
      }
      npc.reaction = 'fleeing';
      npc.visual.setReaction('fleeing');
      return;
    }
    if (combatState === NPC_COMBAT_STATES.DOWN) {
      npc.reaction = 'downed';
      npc.visual.setReaction('downed');
      return;
    }
    if (combatState === NPC_COMBAT_STATES.RECOVER) {
      npc.reaction = 'knocked-down';
      npc.visual.setReaction('knocked-down');
      return;
    }
    if ([NPC_COMBAT_STATES.DEFEND, NPC_COMBAT_STATES.COMBAT].includes(combatState)) return;
    if (combatState === NPC_COMBAT_STATES.ALERT) {
      npc.reaction = witnessReaction;
      npc.visual.setReaction(witnessReaction);
      return;
    }
    if (npc.reaction === 'talking' && Number(npc.reactionUntil || 0) > current) return;
    npc.reaction = '';
    npc.reactionUntil = 0;
    npc.visual.setReaction('');
  });
  state.civicUiElapsed += step;
  if (state.civicUiElapsed >= .1) {
    state.civicUiElapsed = 0;
    updateCivicStatus(state);
  }
}

function setStatus(state, message, duration = 1800) {
  state.statusMessage = String(message || '');
  state.statusUntil = now() + duration;
}

function promoteTrafficVehicle(state, trafficAgentId, vehicleId = '') {
  const existing = state.vehicles.find((vehicle) => vehicle.trafficAgentId === trafficAgentId);
  if (!existing && !reserveInteractiveVehicleSlot(state)) return null;
  const promoted = state.population?.promoteVehicle?.(trafficAgentId);
  if (!promoted) return null;
  if (existing) {
    existing.ambientTraffic = false;
    existing.driver = '';
    existing.speed = 0;
    existing.source = 'living-world-promoted-traffic';
    syncVehiclePose(existing, {
      x: promoted.x,
      y: promoted.y + VEHICLE_ROOT_TO_GROUND_METERS,
      z: promoted.z,
      yaw: promoted.yaw,
      pitch: promoted.pitch,
      roll: promoted.roll,
      wheelContact: promoted.wheelContact
    });
    return existing;
  }
  const definition = {
    id: vehicleId || `traffic:${state.worldIdentity}:${promoted.id}`,
    variant: promoted.variant,
    color: promoted.color,
    condition: 1,
    durabilityPolicy: promoted.variant.durabilityPolicy,
    resistance: promoted.variant.resistance,
    playable: promoted.variant.playable,
    enterable: promoted.variant.enterable,
    source: 'living-world-promoted-traffic',
    trafficAgentId,
    x: promoted.x,
    y: promoted.y + VEHICLE_ROOT_TO_GROUND_METERS,
    z: promoted.z,
    yaw: promoted.yaw,
    pitch: promoted.pitch,
    roll: promoted.roll,
    wheelContact: promoted.wheelContact,
    driverSide: state.driveOnLeft ? 1 : -1
  };
  const visual = createUrbanVehicleVisual(THREE, definition);
  const vehicle = { ...definition, visual, attachedToPlayer: false, occupied: false, driver: '' };
  syncVehiclePose(vehicle, definition);
  state.group.add(visual.root);
  state.vehicles.push(vehicle);
  attachCuratedTrafficDetail(state, vehicle);
  return vehicle;
}

function performNpcTalk(state, candidate) {
  const npc = resolveNpcFromCandidate(state, candidate);
  if (!npc) {
    setStatus(state, 'That person has moved on.');
    return true;
  }
  const lines = {
    'service-worker': 'Busy shift today. Watch the crossing ahead.',
    'office-worker': 'The quickest way downtown is along the main road.',
    student: 'I keep finding new places around here.',
    traveler: 'I am still learning this neighborhood.',
    commuter: 'Traffic changes fast around this time.',
    'field-walker': 'There are good discoveries away from the busiest blocks.',
    'weekend-explorer': 'Try the quieter streets if you are looking for something new.',
    'local-runner': 'The park route is better before it gets crowded.'
  };
  npc.reaction = 'talking';
  npc.reactionUntil = now() + 2600;
  npc.visual.setReaction('talking');
  setStatus(state, lines[npc.archetype] || 'Good to see another explorer out here.', 2800);
  state.lastNpcAction = Object.freeze({ type: 'talked', npcId: npc.id, at: now() });
  return true;
}

function performNpcTake(state, candidate) {
  if (appCtx.getCurrentMultiplayerRoom?.()) {
    setStatus(state, 'Taking items is locked in rooms until shared-world authority is enabled.', 2600);
    return true;
  }
  const npc = resolveNpcFromCandidate(state, candidate);
  if (!npc) return false;
  if (Number(npc.condition ?? 1) <= .05) {
    const existing = state.pickups.find((entry) => entry.sourceActorId === npc.id && !entry.claimed);
    const pickup = existing || dropNpcLoot(state, npc);
    setStatus(state, pickup
      ? `${pickup.label} dropped nearby. Walk over and collect it.`
      : 'No recoverable equipment found.', 2400);
    state.lastNpcAction = Object.freeze({ type: pickup ? 'loot_dropped' : 'no_loot', npcId: npc.id, pickupId: pickup?.id || '', at: now() });
    return true;
  }
  if (!npc.possessionAvailable) {
    setStatus(state, 'Nothing available to take.');
    return true;
  }
  npc.possessionAvailable = false;
  const instanceId = `npc-possession:${npc.id}`;
  state.equipment.upsertItem({
    instanceId,
    catalogId: 'found-personal-item',
    quantity: 1,
    authority: 'anonymous-local',
    provenance: 'npc-interaction',
    sourceEventId: `take:${npc.id}`,
    acquiredAt: Date.now(),
    tradeable: false,
    metadata: { label: 'Found personal item', category: 'trade-good', icon: 'FIND', verbs: ['inspect', 'trade', 'quest'] }
  }, {
    definition: { id: 'found-personal-item', label: 'Found personal item', category: 'trade-good', icon: 'FIND', verbs: ['inspect', 'trade', 'quest'] }
  });
  const count = state.equipment.snapshot().items.length;
  npc.reaction = 'reporting';
  npc.reactionUntil = now() + 4200;
  npc.visual.setReaction('reporting');
  setStatus(state, `Found personal item added to Backpack · ${count} carried`, 2200);
  reportCivicEvent(state, {
    kind: 'theft_from_person',
    position: npcPose(npc),
    severity: 1,
    radius: 26,
    audibleRadius: 4,
    maximumWitnesses: 3
  });
  state.lastNpcAction = Object.freeze({ type: 'took_item', npcId: npc.id, at: now() });
  renderEquipment(state);
  return true;
}

function performResponderLoot(state, candidate) {
  const loot = state.responders?.lootOfficer?.(candidate?.data?.officerId);
  if (!loot) {
    setStatus(state, 'No equipment or ammunition remains.');
    return true;
  }
  const officer = state.responders?.snapshot?.()?.responders?.map((entry) => entry.officer).find((entry) => entry?.id === candidate?.data?.officerId);
  const pickup = spawnLootPickup(state, {
    sourceActorId: candidate?.data?.officerId,
    weaponId: loot.weaponId,
    label: 'Response sidearm',
    rounds: loot.rounds,
    position: officer || appCtx.Walk?.state?.walker
  });
  setStatus(state, pickup ? 'Response gear dropped nearby. Walk over and collect it.' : 'No recoverable equipment found.', 2400);
  return true;
}

function renderEquipment(state) {
  state.equipmentRuntime?.render();
  const propertyWallet = appCtx.getExplorerPropertySnapshot?.();
  const walletAmount = propertyWallet?.authRequired === false && Number.isFinite(Number(propertyWallet.credits))
    ? Number(propertyWallet.credits)
    : Number(state.commerce?.wallet?.().credits || 0);
  if (state.equipmentUi?.wallet) {
    state.equipmentUi.wallet.textContent = formatExplorerDollars(walletAmount);
  }
  const condition = Math.max(0, Math.min(1, Number(state.playerCondition ?? 1)));
  if (state.equipmentUi?.conditionText) {
    state.equipmentUi.conditionText.textContent = `${Math.round(condition * 100)}%`;
  }
  if (state.equipmentUi?.conditionFill) {
    state.equipmentUi.conditionFill.style.width = `${Math.round(condition * 100)}%`;
    state.equipmentUi.conditionFill.dataset.state = condition <= .25 ? 'critical' : condition <= .6 ? 'injured' : 'healthy';
  }
}

function toggleEquipment(state, force) {
  return state.equipmentRuntime?.toggle(force) === true;
}

function equipSlot(state, slot) {
  return state.equipmentRuntime?.equipSlot(slot) === true;
}

function useEquipped(state) {
  return state.equipmentRuntime?.use() === true;
}

function updateEquipmentEffects(state, dt) {
  state.equipmentRuntime?.update(dt);
}

function enterVehicleAfterClaim(state, vehicle) {
  if (!vehicle) return false;
  if (!beginEnter(state, vehicle)) return false;
  if (!vehicle.playerClaimed) {
    vehicle.playerClaimed = true;
    if (vehicle.serviceType === 'responder' && (state.roomAuthorityRuntime?.snapshot?.()?.mode || 'local') === 'local') {
      state.civic.clear();
    }
    reportCivicEvent(state, {
      kind: 'vehicle_taken',
      vehicleId: vehicle.id,
      position: vehiclePose(vehicle),
      severity: vehicle.serviceType === 'responder' ? 3 : 1,
      radius: vehicle.serviceType === 'responder' ? 52 : 32,
      audibleRadius: vehicle.serviceType === 'responder' ? 52 : 7,
      maximumWitnesses: 3,
      forceWitness: vehicle.serviceType === 'responder'
    });
  }
  return true;
}

function performInteraction(state, candidate) {
  if (candidate?.action === 'exit_vehicle') {
    beginExit(state);
    return true;
  }
  if (candidate?.action === 'talk_npc') return performNpcTalk(state, candidate);
  if (candidate?.action === 'loot_npc') return performNpcTake(state, candidate);
  if (candidate?.action === 'loot_responder') return performResponderLoot(state, candidate);
  if (candidate?.action === 'collect_loot') return collectLootPickup(state, candidate?.data?.pickupId);
  if (candidate?.action === 'visit_store') return openStore(state, candidate?.data?.storeId);
  if (candidate?.action === 'inspect_object') {
    const object = (appCtx.streetFurnitureMeshes || []).find((entry) => entry.uuid === candidate?.data?.objectUuid);
    if (!object) return false;
    const kind = String(object.userData.furnitureKind || 'street object').replaceAll('_', ' ');
    const source = object.userData.provenance === 'mapped' ? 'mapped location' : 'world placement';
    setStatus(state, `${kind} · ${source} · ${Math.round(Number(object.userData.condition ?? 1) * 100)}% condition`, 2400);
    return true;
  }
  const vehicleId = String(candidate?.data?.vehicleId || '');
  let vehicle = state.vehicles.find((entry) => entry.id === vehicleId);
  const responderId = String(candidate?.data?.responderId || '');
  if (!vehicle && responderId) {
    if (appCtx.getCurrentMultiplayerRoom?.()) {
      setStatus(state, 'Emergency vehicle takeover is locked until room authority confirms it.', 2400);
      return true;
    }
    if (!reserveInteractiveVehicleSlot(state)) {
      setStatus(state, 'No vehicle interaction capacity is available nearby.', 1800);
      return true;
    }
    vehicle = state.responders?.claimVehicle?.(responderId);
    if (!vehicle) {
      setStatus(state, 'That responder vehicle is still moving.', 1500);
      return true;
    }
    state.vehicles.push(vehicle);
    return enterVehicleAfterClaim(state, vehicle);
  }
  const trafficAgentId = String(candidate?.data?.trafficAgentId || '');
  if (!vehicle && trafficAgentId) {
    if (!reserveInteractiveVehicleSlot(state)) {
      state.statusMessage = 'No vehicle interaction capacity is available nearby.';
      state.statusUntil = now() + 1800;
      return true;
    }
    vehicle = promoteTrafficVehicle(state, trafficAgentId, vehicleId);
    if (!vehicle) return false;
  }
  return state.roomAuthorityRuntime?.requestVehicleEntry(vehicle) === true;
}

function updatePrompt(state) {
  const prompt = state.prompt;
  if (!prompt?.root) return;
  if (appCtx.getEnv?.() !== 'EARTH' || appCtx.oceanMode?.active || appCtx.spaceFlight?.active || appCtx.activePlanetaryBodyId) {
    prompt.secondaryKey.hidden = true;
    prompt.secondaryButton.hidden = true;
    prompt.takeKey.hidden = true;
    prompt.takeButton.hidden = true;
    prompt.root.classList.remove('show');
    prompt.root.setAttribute('aria-hidden', 'true');
    return;
  }
  const candidate = appCtx.resolvePrimaryContextInteraction?.() || interactionCandidate(state);
  const transientStatus = state.statusUntil > now() ? state.statusMessage : '';
  if (!candidate && !transientStatus) {
    prompt.secondaryKey.hidden = true;
    prompt.secondaryButton.hidden = true;
    prompt.takeKey.hidden = true;
    prompt.takeButton.hidden = true;
    prompt.root.classList.remove('show');
    prompt.root.setAttribute('aria-hidden', 'true');
    return;
  }
  prompt.root.classList.add('show');
  prompt.root.setAttribute('aria-hidden', 'false');
  prompt.title.textContent = transientStatus || candidate.label;
  prompt.meta.textContent = transientStatus
    ? ''
    : `${candidate.detail}${candidate.distance ? ` • ${candidate.distance.toFixed(1)} m` : ''}`;
  prompt.key.textContent = candidate?.action === 'exit_vehicle' ? 'E' : 'E';
  prompt.button.textContent = candidate?.label || (candidate?.action === 'exit_vehicle' ? 'Exit' : 'Enter');
  if (candidate?.action === 'talk_npc') prompt.button.textContent = 'Talk';
  if (candidate?.action === 'loot_npc') prompt.button.textContent = 'Search';
  if (candidate?.action === 'loot_responder') prompt.button.textContent = 'Collect gear';
  if (candidate?.action === 'collect_loot') prompt.button.textContent = 'Collect';
  if (candidate?.action === 'inspect_object') prompt.button.textContent = 'Inspect';
  if (candidate?.action === 'visit_store') prompt.button.textContent = 'Visit';
  prompt.button.disabled = !candidate?.available;
  prompt.button.hidden = !!transientStatus;
  const showSecondary = !transientStatus && !!candidate?.secondaryLabel && appCtx.Walk?.state?.mode === 'walk';
  prompt.secondaryKey.hidden = !showSecondary;
  prompt.secondaryButton.hidden = !showSecondary;
  prompt.secondaryButton.textContent = candidate?.secondaryLabel || 'Use';
  const showTake = !transientStatus && (candidate?.action === 'talk_npc' || candidate?.action === 'loot_npc' || candidate?.action === 'loot_responder');
  prompt.takeKey.hidden = !showTake;
  prompt.takeButton.hidden = !showTake;
}

function snapshot(state) {
  if (!state) return Object.freeze({ active: false });
  const candidate = interactionCandidate(state);
  const actor = civicActorPosition(state);
  const ambientPedestrians = (state.population?.pedestrianSnapshots?.() || [])
    .filter((pedestrian) => pedestrian?.visible && !pedestrian.promoted)
    .map((pedestrian) => Object.freeze({
      id: String(pedestrian.id || ''),
      x: Number(Number(pedestrian.x || 0).toFixed(2)),
      y: Number(Number(pedestrian.y || 0).toFixed(2)),
      z: Number(Number(pedestrian.z || 0).toFixed(2)),
      yaw: Number(Number(pedestrian.yaw || 0).toFixed(4)),
      distance: Number(Math.hypot(
        Number(pedestrian.x || 0) - Number(actor?.x || 0),
        Number(pedestrian.z || 0) - Number(actor?.z || 0)
      ).toFixed(2))
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 24);
  return Object.freeze({
    active: activeWorldMatches(state),
    requestId: state.requestId,
    sequence: state.sequence,
    phase: state.transition?.kind || (state.activeVehicle ? 'driving' : 'walking'),
    vehicleCount: state.vehicles.length,
    vehiclePresentation: 'curated-only-local-models',
    proceduralVehicleMeshes: state.vehicles.reduce((sum, vehicle) => (
      sum + Number(vehicle.visual?.root?.userData?.proceduralVehicleMeshCount || 0)
    ), Number(appCtx.carMesh?.userData?.proceduralVehicleMeshCount || 0)),
    defaultPlayerVehicle: Object.freeze({
      curatedAssetId: String(appCtx.carMesh?.userData?.curatedVehicleAssetId || ''),
      presentation: String(appCtx.carMesh?.userData?.vehiclePresentation || ''),
      proceduralVehicleMeshes: Number(appCtx.carMesh?.userData?.proceduralVehicleMeshCount || 0)
    }),
    activeVehicleId: state.activeVehicle?.id || '',
    playerVehicle: state.activeVehicle ? Object.freeze({
      id: state.activeVehicle.id,
      speedMph: Number(Math.abs(carSpeedToMph(Number(appCtx.car?.speed || 0))).toFixed(1)),
      serviceType: String(state.activeVehicle.serviceType || ''),
      serviceEquipmentActive: state.activeVehicle.serviceEquipmentActive === true,
      condition: Number(Number(state.activeVehicle.condition ?? appCtx.car?.condition ?? 1).toFixed(3)),
      worldVelocityMps: Number((Math.hypot(Number(appCtx.car?.vx || 0), Number(appCtx.car?.vz || 0)) * Math.max(.001, Number(appCtx.METERS_PER_WORLD_UNIT || 1.11))).toFixed(2))
    }) : null,
    nearbyVehicleId: candidate?.data?.vehicleId || '',
    interaction: candidate ? Object.freeze({ action: candidate.action, label: candidate.label, distance: candidate.distance }) : null,
    vehicles: Object.freeze(state.vehicles.map((vehicle) => {
      const pose = vehiclePose(vehicle);
      const door = vehicleDoorPosition(vehicle);
      const visualDoor = doorForVehicle(vehicle);
      return Object.freeze({
        id: vehicle.id,
        label: vehicle.variant.label,
        style: vehicle.variant.bodyStyle,
        color: vehicle.color,
        condition: vehicle.condition,
        x: Number(pose.x.toFixed(2)),
        y: Number(pose.y.toFixed(2)),
        z: Number(pose.z.toFixed(2)),
        yaw: Number(pose.yaw.toFixed(4)),
        curatedAssetId: String(vehicle.visual?.root?.userData?.curatedTrafficAssetId || ''),
        vehiclePresentation: String(vehicle.visual?.root?.userData?.vehiclePresentation || ''),
        proceduralVehicleMeshes: Number(vehicle.visual?.root?.userData?.proceduralVehicleMeshCount || 0),
        pitch: Number(Number(pose.pitch || 0).toFixed(4)),
        roll: Number(Number(pose.roll || 0).toFixed(4)),
        renderedPitch: Number(Number(vehicle.visual?.root?.rotation?.x || 0).toFixed(4)),
        renderedRoll: Number(Number(vehicle.visual?.root?.rotation?.z || 0).toFixed(4)),
        wheelContact: vehicle.wheelContact || null,
        source: vehicle.source || 'parked-world-vehicle',
        playerClaimed: vehicle.playerClaimed === true,
        trafficAgentId: vehicle.trafficAgentId || '',
        ambientTraffic: vehicle.ambientTraffic === true,
        occupied: vehicle.occupied,
        attachedToPlayer: vehicle.attachedToPlayer,
        crashMotion: vehicle.crashMotion ? Object.freeze({
          velocityMps: Number(Math.hypot(vehicle.crashMotion.velocityX, vehicle.crashMotion.velocityZ).toFixed(2)),
          angularVelocity: Number(Number(vehicle.crashMotion.angularVelocity || 0).toFixed(3)),
          severity: String(vehicle.crashMotion.severity || '')
        }) : null,
        roomOccupiedByOther: vehicle.roomOccupiedByOther === true,
        roomLeaseOwnerUid: String(vehicle.roomLeaseOwnerUid || ''),
        driverSide: Number(vehicle.driverSide || -1),
        driverDoor: Object.freeze({
          x: Number(door.x.toFixed(2)),
          z: Number(door.z.toFixed(2)),
          openRadians: Number(Number(visualDoor?.rotation?.y || 0).toFixed(4))
        }),
        dimensionsMeters: vehicle.visual?.root?.userData?.vehicleDimensionsMeters || null,
        visualEnvelopeMeters: vehicle.visual?.root?.userData?.vehicleVisualEnvelopeMeters || null,
        parking: vehicle.source === 'deterministic-parked-vehicle' ? Object.freeze({
          roadHalfWidth: Number(vehicle.roadHalfWidth || 0),
          laneOffset: Number(vehicle.laneOffset || 0),
          curbOffset: Number(vehicle.curbOffset || 0),
          curbNormalX: Number(vehicle.curbNormalX || 0),
          curbNormalZ: Number(vehicle.curbNormalZ || 0),
          fullyOutsideTravelLane: Number(vehicle.curbOffset || 0) - Number(vehicle.variant?.width || 0) * .5 >= Number(vehicle.laneOffset || 0) - .001
        }) : null
      });
    })),
    interactiveNpcs: Object.freeze(state.npcs.map((npc) => Object.freeze({
      id: npc.id,
      sourceAgentId: npc.sourceAgentId,
      archetype: npc.archetype,
      combatRole: npc.combatRole,
      reaction: npc.reaction,
      combatState: String(npc.combatState || NPC_COMBAT_STATES.NORMAL),
      condition: Number(Number(npc.condition ?? 1).toFixed(3)),
      heldEquipment: String(npc.heldEquipment || ''),
      defending: Number(npc.hostileUntil || 0) > now() && Number(npc.condition ?? 1) > .05,
      shotsFired: Number(npc.shotsFired || 0),
      knockedDown: npc.reaction === 'knocked-down',
      crashVelocityMps: Number(Math.hypot(Number(npc.crashMotion?.velocityX || 0), Number(npc.crashMotion?.velocityZ || 0)).toFixed(2)),
      possessionAvailable: npc.possessionAvailable === true,
      x: Number(npc.x.toFixed(2)),
      y: Number(npc.y.toFixed(2)),
      z: Number(npc.z.toFixed(2)),
      yaw: Number(npc.yaw.toFixed(4)),
      curatedAssetId: String(npc.visual?.root?.userData?.curatedCharacterAssetId || ''),
      characterPresentation: String(npc.visual?.root?.userData?.characterStyle || ''),
      proceduralCharacterMeshes: Number(npc.visual?.root?.userData?.proceduralCharacterMeshCount || 0),
      curatedEquipmentAssetId: String(npc.visual?.heldEquipment?.userData?.curatedEquipmentAssetId || ''),
      equipmentAttachment: String(npc.visual?.heldEquipment?.userData?.attachment || ''),
      proceduralEquipmentMeshes: Number(npc.visual?.heldEquipment?.userData?.proceduralEquipmentMeshCount || 0),
      renderedMeshCount: (() => {
        let count = 0;
        npc.visual?.root?.traverse?.((object) => { if (object?.isMesh) count += 1; });
        return count;
      })()
    }))),
    ambientPedestrians: Object.freeze(ambientPedestrians),
    lootPickups: Object.freeze(state.pickups.map((pickup) => Object.freeze({
      id: pickup.id,
      sourceActorId: pickup.sourceActorId,
      catalogId: pickup.catalogId,
      label: pickup.label,
      rounds: pickup.rounds,
      x: Number(pickup.position.x.toFixed(2)),
      y: Number(pickup.position.y.toFixed(2)),
      z: Number(pickup.position.z.toFixed(2))
    }))),
    lastAction: state.lastAction,
    lastCivicAction: state.lastCivicAction,
    lastCivicOutcome: state.lastCivicOutcome,
    lastNpcAction: state.lastNpcAction,
    lastImpactAction: state.lastImpactAction,
    lastCrashAction: state.lastCrashAction,
    projectileRuntime: state.equipmentRuntime?.snapshot?.() || Object.freeze({ activeProjectiles: 0, lastProjectileAction: null }),
    playerCondition: Number(Number(state.playerCondition ?? 1).toFixed(3)),
    custody: state.custody ? Object.freeze({
      active: state.custody.active === true,
      type: String(state.custody.type || ''),
      reason: state.custody.reason,
      facility: state.custody.facility
    }) : null,
    authority: state.roomAuthorityRuntime?.snapshot?.() || Object.freeze({ mode: 'local' }),
    equipment: state.equipment?.snapshot?.() || null,
    equipmentPresentation: state.equipmentVisual?.equipmentSnapshot?.() || null,
    backpackMigration: state.backpackStore?.migrationSnapshot?.() || null,
    commerce: Object.freeze({
      mappedStoreCount: state.stores.length,
      stores: Object.freeze(state.stores.map((store) => Object.freeze({
        ...store,
        ...(state.storeApproaches.get(store.id) || {
          interactionX: store.x,
          interactionZ: store.z
        })
      }))),
      open: state.storeOpen === true,
      activeStoreId: state.activeStoreId,
      current: activeStore(state) ? state.commerce.snapshot(activeStore(state)) : null,
      placeAuthority: 'loaded-map-poi',
      inventoryAuthority: 'world-explorer-gameplay',
      plainFuelStationsAreStores: false
    }),
    parachute: Object.freeze({
      deployed: state.parachute?.deployed === true,
      deployedAt: Number(state.parachute?.deployedAt || 0),
      landedAt: Number(state.parachute?.landedAt || 0),
      skydiving: state.parachute?.skydiving === true,
      automaticEquip: state.parachute?.automaticEquip === true,
      phase: appCtx.Walk?.state?.walker?.skydivingFlight?.phase || '',
      heading: Number(appCtx.Walk?.state?.walker?.skydivingFlight?.heading || 0),
      bank: Number(appCtx.Walk?.state?.walker?.skydivingFlight?.bank || 0),
      horizontalSpeed: Number(appCtx.Walk?.state?.walker?.skydivingFlight?.horizontalSpeed || 0),
      verticalSpeed: Number(appCtx.Walk?.state?.walker?.skydivingFlight?.verticalSpeed || 0),
      profileId: String(appCtx.Walk?.state?.walker?.skydivingFlight?.profileId || ''),
      handoffSource: String(state.parachute?.handoffSource || ''),
      handoffDistance: Number.isFinite(state.parachute?.handoffDistance)
        ? Number(state.parachute.handoffDistance)
        : null,
      visuals: state.equipmentVisual?.parachuteSnapshot?.() || Object.freeze({
        ready: false,
        packVisible: false,
        canopyVisible: false
      })
    }),
    civicResponse: civicSnapshot(state),
    responders: state.responders?.snapshot?.() || null,
    worldLoadSequence: Number(appCtx._worldLoadSequence || 0),
    budgets: Object.freeze({ interactiveVehicles: state.budget, interactiveNpcs: state.npcBudget, mobile: state.mobile }),
    lodPolicy: Object.freeze({
      npcInteractionDistance: NPC_INTERACTION_DISTANCE,
      npcPreloadDistance: state.activeVehicle ? NPC_DRIVING_PRELOAD_DISTANCE : NPC_DETAIL_PRELOAD_DISTANCE,
      npcReleaseDistance: state.activeVehicle ? NPC_DRIVING_RELEASE_DISTANCE : NPC_DETAIL_RELEASE_DISTANCE,
      vehiclePreloadDistance: VEHICLE_DETAIL_PRELOAD_DISTANCE,
      vehicleReleaseDistance: VEHICLE_DETAIL_RELEASE_DISTANCE
    }),
    collisionPolicy: Object.freeze({
      actorResolver: 'urban-actor-swept-collision',
      segmentContinuous: true,
      peopleAndVehiclesCollidable: true,
      vehicleImpactsApplyCondition: true
    }),
    recoveryPolicy: Object.freeze({
      arrestDestination: 'nearest-mapped-police-facility',
      incapacitationDestination: 'nearest-mapped-hospital',
      fabricatedFacilitiesAllowed: false,
      caughtScreenAuthority: 'urban-sandbox-runtime'
    }),
    ammunitionPolicy: Object.freeze({
      inventoryAuthority: 'character-backpack',
      reloadFromReserve: true,
      recoverFromFallenActors: true
    }),
    playerCharacter: Object.freeze({
      gender: String(appCtx.getPlayerCharacterGender?.() || 'man'),
      assetId: String(appCtx.Walk?.state?.characterMesh?.userData?.curatedCharacterAssetId || ''),
      choiceAvailable: !!state.equipmentUi?.characterChoice
    })
  });
}

function disposeRuntime(state, reason = 'disposed') {
  if (!state || state.disposed) return false;
  state.roomAuthorityRuntime?.dispose?.();
  state.disposed = true;
  stopServiceSiren(state);
  try { void state.serviceAudioContext?.close?.(); } catch (_) {}
  closeStore(state);
  state.unregisterStoreInteraction?.();
  state.unregisterInteraction?.();
  appCtx.unregisterRuntimeOwner?.(state.owner);
  state.prompt?.button?.removeEventListener('click', state.onPromptClick);
  state.prompt?.secondaryButton?.removeEventListener('click', state.onSecondaryClick);
  state.prompt?.takeButton?.removeEventListener('click', state.onTakeClick);
  state.equipmentUi?.toggle?.removeEventListener('click', state.onEquipmentToggle);
  state.equipmentUi?.close?.removeEventListener('click', state.onEquipmentClose);
  state.equipmentUi?.slots?.removeEventListener('click', state.onEquipmentSlotClick);
  state.equipmentUi?.contents?.removeEventListener('click', state.onEquipmentSlotClick);
  state.equipmentUi?.filters?.removeEventListener('click', state.onBackpackFilterClick);
  state.equipmentUi?.detail?.removeEventListener('click', state.onBackpackDetailClick);
  state.storeUi?.close?.removeEventListener('click', state.onStoreClose);
  state.storeUi?.root?.removeEventListener('click', state.onStoreAction);
  document.removeEventListener('keydown', state.onStoreKeyDown);
  document.getElementById('caughtBtn')?.removeEventListener('click', state.onCustodyContinue);
  if (appCtx.handleUrbanCustodyContinue === state.onCustodyContinue) delete appCtx.handleUrbanCustodyContinue;
  if (appCtx.toggleUrbanResponderEquipment === state.toggleServiceEquipment) delete appCtx.toggleUrbanResponderEquipment;
  const caughtMessage = document.getElementById('caughtScreen')?.querySelector?.('.caughtText');
  if (caughtMessage) caughtMessage.textContent = 'You were caught. Continue from the nearest safe location.';
  const caughtTitle = document.getElementById('caughtScreen')?.querySelector?.('.caughtTitle');
  if (caughtTitle) caughtTitle.textContent = '🚔 BUSTED!';
  const caughtButton = document.getElementById('caughtBtn');
  if (caughtButton) caughtButton.textContent = 'Try Again';
  state.unsubscribeBackpack?.();
  appCtx.screenLayout?.setPanelLayer?.('backpack', false);
  state.prompt?.root?.classList.remove('show');
  state.equipmentUi?.root?.classList.remove('show');
  if (state.equipmentUi?.toggle) state.equipmentUi.toggle.hidden = true;
  state.civicUi?.root?.classList.remove('show');
  if (state.activeVehicle?.attachedToPlayer) {
    appCtx.carMesh?.remove?.(state.activeVehicle.visual.root);
    state.activeVehicle.attachedToPlayer = false;
  }
  resetPlayerVehicleVisual(state);
  state.vehicles.forEach((vehicle) => {
    if (vehicle.ambientTraffic && vehicle.trafficAgentId) {
      state.population?.releaseVehicleDetail?.(vehicle.trafficAgentId);
    }
    vehicle.visual.dispose();
  });
  state.npcs.forEach((npc) => {
    state.population?.releasePedestrian?.(npc.sourceAgentId);
    npc.visual.dispose();
  });
  state.pickups.forEach((pickup) => pickup.visual?.dispose?.());
  state.equipmentVisual?.dispose?.();
  state.equipmentRuntime?.dispose?.();
  state.responders?.dispose?.();
  state.group.removeFromParent?.();
  state.vehicles.length = 0;
  state.npcs.length = 0;
  state.curatedNpcAssetOwners.clear();
  state.pickups.length = 0;
  state.activeVehicle = null;
  state.civic?.clear?.();
  if (appCtx.isUrbanParachuteDeployed === state.isParachuteDeployed) delete appCtx.isUrbanParachuteDeployed;
  if (appCtx.onUrbanParachuteLanded === state.onParachuteLanded) delete appCtx.onUrbanParachuteLanded;
  if (appCtx.prepareAirborneParachute === state.prepareAirborneParachute) delete appCtx.prepareAirborneParachute;
  if (globalThis.__WE3D_URBAN_CRASH_SUPPORT__ === state.crashSupportHook) {
    delete globalThis.__WE3D_URBAN_CRASH_SUPPORT__;
  }
  if (globalThis.__WE3D_STORE_SUPPORT__ === state.storeSupportHook) {
    delete globalThis.__WE3D_STORE_SUPPORT__;
  }
  state.reason = String(reason || 'disposed');
  if (activeRuntime === state) activeRuntime = null;
  if (appCtx.urbanSandboxRuntime === state) appCtx.urbanSandboxRuntime = null;
  return true;
}

function startUrbanSandboxRuntime(options = {}) {
  const publication = options.snapshot;
  const livingWorld = options.livingWorld;
  if (!globalThis.THREE || publication?.type !== 'WorldSnapshot' || !livingWorld?.publication?.trafficGraph) return null;
  disposeRuntime(activeRuntime, 'replacement');
  const mobile = isTouchClient();
  const budget = mobile ? 4 : 7;
  const vehicleDetailBudget = mobile ? 5 : 10;
  const reference = appCtx.Walk?.state?.walker || appCtx.car || { x: 0, z: 0 };
  const graph = livingWorld.publication.trafficGraph;
  const worldIdentity = livingWorld.publication.worldIdentity?.id || publication.requestId;
  // Traffic graph publication owns jurisdictional lane side. Interactive and
  // ambient vehicles must never derive a competing answer from a city name.
  const driveOnLeft = livingWorld.publication.trafficGraph.provenance?.driveOnLeft === true;
  const anchors = parkedVehicleAnchors(graph, reference, {
    count: mobile ? 2 : 3,
    minDistance: 12,
    maxDistance: 68,
    worldIdentity,
    driveOnLeft,
    sampleVehicleSurface: livingWorld.sampleVehicleSurface,
    isBlocked(x, y, z, variant) {
      const collision = appCtx.checkBuildingCollision?.(x, z, Math.max(0.9, variant.width * 0.48), {
        actorBaseY: y,
        actorHeight: variant.height
      });
      return collision?.collision === true || appCtx.isInsideWaterArea?.(x, z) === true;
    }
  });
  const group = new THREE.Group();
  group.name = 'Urban Sandbox Interactive Vehicles';
  const vehicles = anchors.map((anchor) => {
    const visual = createUrbanVehicleVisual(THREE, anchor);
    const vehicle = {
      ...anchor,
      durabilityPolicy: anchor.durabilityPolicy || anchor.variant?.durabilityPolicy,
      resistance: anchor.resistance || anchor.variant?.resistance,
      playable: anchor.playable !== false,
      enterable: anchor.enterable !== false,
      visual,
      attachedToPlayer: false,
      occupied: false,
      driver: ''
    };
    syncVehiclePose(vehicle, anchor);
    group.add(visual.root);
    return vehicle;
  });
  appCtx.addEarthWorldObject?.(group);
  const prompt = {
    root: document.getElementById('urbanVehiclePrompt'),
    title: document.getElementById('urbanVehiclePromptTitle'),
    meta: document.getElementById('urbanVehiclePromptMeta'),
    key: document.getElementById('urbanVehiclePromptKey'),
    button: document.getElementById('urbanVehiclePromptButton'),
    secondaryKey: document.getElementById('urbanVehiclePromptSecondaryKey'),
    secondaryButton: document.getElementById('urbanVehiclePromptSecondaryButton'),
    takeKey: document.getElementById('urbanVehiclePromptTakeKey'),
    takeButton: document.getElementById('urbanVehiclePromptTakeButton')
  };
  const equipmentUi = {
    root: document.getElementById('urbanEquipment'),
    slots: document.getElementById('urbanEquipmentSlots'),
    contents: document.getElementById('urbanBackpackContents'),
    filters: document.getElementById('urbanBackpackFilters'),
    detail: document.getElementById('urbanBackpackDetail'),
    status: document.getElementById('urbanEquipmentStatus'),
    conditionText: document.getElementById('urbanPlayerConditionText'),
    conditionFill: document.getElementById('urbanPlayerConditionFill'),
    wallet: document.getElementById('urbanBackpackWallet'),
    toggle: document.getElementById('urbanEquipmentToggle'),
    close: document.getElementById('urbanEquipmentCloseBtn'),
    reticle: document.getElementById('urbanWeaponReticle')
  };
  const equipment = ensurePlayerBackpackInventory(appCtx);
  const backpackStore = appCtx.playerBackpackStore;
  const stores = mappedCommercePlaces(appCtx.pois);
  const commerce = appCtx.worldEconomy || appCtx.localConvenienceStoreCommerce || createLocalCommerceModel({ inventory: equipment });
  appCtx.worldEconomy = commerce;
  appCtx.localConvenienceStoreCommerce = commerce;
  const storeUi = {
    root: document.getElementById('urbanStore'),
    name: document.getElementById('urbanStoreName'),
    source: document.getElementById('urbanStoreSource'),
    credits: document.getElementById('urbanStoreCredits'),
    stock: document.getElementById('urbanStoreStock'),
    sell: document.getElementById('urbanStoreSell'),
    rare: document.getElementById('urbanStoreRare'),
    status: document.getElementById('urbanStoreStatus'),
    close: document.getElementById('urbanStoreCloseBtn')
  };
  const civicUi = {
    root: document.getElementById('urbanCivicStatus'),
    title: document.getElementById('urbanCivicStatusTitle'),
    detail: document.getElementById('urbanCivicStatusDetail'),
    meter: document.getElementById('urbanCivicStatusMeter')
  };
  const owner = `urban-sandbox:${publication.sequence}`;
  const flashlight = new THREE.SpotLight(0xe8f2ff, 38, 28, Math.PI * .16, .45, 1.3);
  flashlight.name = 'Urban equipment field light';
  flashlight.visible = false;
  flashlight.castShadow = false;
  group.add(flashlight, flashlight.target);
  const state = {
    owner,
    requestId: publication.requestId,
    sequence: publication.sequence,
    group,
    vehicles,
    npcs: [],
    pickups: [],
    prompt,
    equipmentUi,
    storeUi,
    civicUi,
    budget,
    vehicleDetailBudget,
    actorCollisionCooldowns: new Map(),
    secondaryCrashCooldowns: new Map(),
    // Keep every close/conversational pedestrian on the detailed character
    // path. Four slots allowed a fifth person in a normal sidewalk cluster to
    // remain an instanced silhouette until interaction, which is the visible
    // block-to-character swap this runtime is meant to prevent.
    npcBudget: mobile ? 10 : 20,
    curatedNpcAssetOwners: new Map(),
    curatedNpcAssetCursor: 0,
    mobile,
    population: livingWorld.population,
    worldIdentity,
    driveOnLeft,
    activeVehicle: null,
    transition: null,
    disposed: false,
    reason: '',
    defaultCarChildren: [...(appCtx.carMesh?.children || [])],
    backpackFilter: 'all',
    backpackSelectedId: '',
    defaultWheelMeshes: [...(appCtx.wheelMeshes || [])],
    defaultVehicleStyle: String(appCtx.carMesh?.userData?.vehicleStyle || 'curated-bmw-e34'),
    defaultCarCondition: Math.max(0, Math.min(1, Number(appCtx.car?.condition ?? 1))),
    defaultCarDurabilityPolicy: String(appCtx.car?.durabilityPolicy || 'exploration_unlimited'),
    defaultCarResistance: Number(appCtx.car?.resistance || 175),
    crashSupportHook: null,
    storeSupportHook: null,
    lastAction: null,
    lastCivicAction: null,
    lastCivicOutcome: null,
    lastNpcAction: null,
    lastImpactAction: null,
    lastPlayerProjectileAction: null,
    lastPlayerProjectileLaunch: null,
    lastCrashAction: null,
    crashFeedback: document.getElementById('urbanCrashFeedback'),
    crashFeedbackUntil: 0,
    statusMessage: '',
    statusUntil: 0,
    lootElapsed: 0,
    serviceLightElapsed: 0,
    serviceEquipmentKeyHeld: false,
    serviceAudioContext: null,
    sirenAudio: null,
    promptElapsed: 0,
    npcPromotionElapsed: 0,
    vehiclePromotionElapsed: 0,
    recklessElapsed: 0,
    recklessEventCooldown: 0,
    civicUiElapsed: 0,
    civicResolutionPending: false,
    civic: null,
    responders: null,
    equipment,
    backpackStore,
    stores,
    storeApproaches: new Map(),
    commerce,
    storeOpen: false,
    activeStoreId: '',
    storeStatus: '',
    equipmentVisual: createEquipmentVisuals(THREE, appCtx.Walk?.state?.characterMesh),
    equipmentRuntime: null,
    equipmentOpen: false,
    parachute: {
      deployed: false,
      deployedAt: 0,
      landedAt: 0,
      skydiving: false,
      automaticEquip: false,
      handoffSource: '',
      handoffDistance: null
    },
    playerCondition: 1,
    custody: null,
    flashlight,
    authority: null,
    authorityImpactPending: false,
    remoteEntities: new Map(),
    roomAuthorityRuntime: null
  };
  state.civic = createCivicResponseModel({
    request: options.request,
    getActorPosition: () => civicActorPosition(state)
  });
  state.responders = createUrbanResponderRuntime({
    THREE,
    group,
    mobile,
    worldIdentity,
    isActive: () => activeWorldMatches(state),
    getActor: () => civicActorPosition(state),
    getVehicles: () => state.vehicles,
    isBlockedPoint: (x, z, variant) => {
      const y = appCtx.SurfaceQuery?.driveAt?.(x, z)?.position?.y
        ?? appCtx.elevationWorldYAtWorldXZ?.(x, z)
        ?? 0;
      const collision = appCtx.checkBuildingCollision?.(x, z, Math.max(.9, Number(variant?.width || 1.9) * .48), {
        actorBaseY: Number(y),
        actorHeight: Number(variant?.height || 1.6)
      });
      return collision?.collision === true || appCtx.isInsideWaterArea?.(x, z) === true;
    },
    fireNpcProjectile: (settings) => state.equipmentRuntime?.fireNpcProjectile?.(settings) === true,
    onOfficerShot: (impact) => applyOfficerImpact(state, impact),
    onArrest: () => {
      // Enter/exit handoffs are atomic gameplay transitions. Applying custody
      // midway through the door animation leaves the interaction reported as
      // handled but silently returns the player to walking mode.
      if (state.transition) return;
      const civic = civicSnapshot(state);
      if (Number(civic?.level || 0) < 2) return;
      const authorityMode = state.roomAuthorityRuntime?.snapshot?.()?.mode || 'local';
      if (authorityMode === 'local') {
        placePlayerInCustody(state, 'arrested');
        return;
      }
      // Shared incidents must be resolved by the room authority before local
      // custody is applied. Teleporting first left the shared event active, so
      // the same officer contact could arrest the player again after Continue.
      if (state.civicResolutionPending) return;
      state.civicResolutionPending = true;
      state.roomAuthorityRuntime.resolveCivicOutcome().then((result) => {
        if (!activeWorldMatches(state) || !result?.accepted) return;
        state.lastCivicOutcome = Object.freeze({ ...result.outcome, authority: 'room', at: now() });
        if (result.outcome?.type === 'arrest') placePlayerInCustody(state, 'shared_responder_contact');
      }).catch(() => {
        if (activeWorldMatches(state)) setStatus(state, 'Shared civic outcome is reconnecting.', 2200);
      }).finally(() => { state.civicResolutionPending = false; });
    },
    onOfficerDowned: (details) => spawnLootPickup(state, details),
    onResolution(outcome) {
      const authorityMode = state.roomAuthorityRuntime?.snapshot?.()?.mode || 'local';
      if (authorityMode === 'local') {
        state.lastCivicOutcome = Object.freeze({ ...outcome, at: now() });
        const placedInCustody = outcome.type === 'arrest' && placePlayerInCustody(state, 'responder_contact');
        if (!placedInCustody) {
          state.civic.clear();
          setStatus(state, `${outcome.label}. Civic attention is clearing.`, 3200);
        }
        return;
      }
      if (state.civicResolutionPending) return;
      state.civicResolutionPending = true;
      state.roomAuthorityRuntime.resolveCivicOutcome().then((result) => {
        if (!activeWorldMatches(state)) return;
        if (result?.accepted) {
          state.lastCivicOutcome = Object.freeze({ ...result.outcome, authority: 'room', at: now() });
          const placedInCustody = result.outcome?.type === 'arrest' && placePlayerInCustody(state, 'shared_responder_contact');
          if (!placedInCustody) setStatus(state, `${result.outcome.label}. Shared civic attention is clearing.`, 3200);
        }
      }).catch(() => {
        if (activeWorldMatches(state)) setStatus(state, 'Shared civic outcome is reconnecting.', 2200);
      }).finally(() => { state.civicResolutionPending = false; });
    }
  });
  state.equipmentRuntime = createUrbanEquipmentRuntime({
    state,
    THREE,
    isActive: () => activeWorldMatches(state),
    npcPose,
    vehiclePose,
    promoteNpc: (source) => promotePedestrian(state, source),
    promoteVehicle: (agentId) => promoteTrafficVehicle(state, agentId),
    reportCivicEvent: (event) => reportCivicEvent(state, event),
    onNpcShot: (impact) => applyArmedNpcImpact(state, impact),
    onNpcDowned: (npc) => dropNpcLoot(state, npc),
    setStatus: (message, duration) => setStatus(state, message, duration),
    now
  });
  state.roomAuthorityRuntime = createUrbanRoomAuthorityRuntime({
    state,
    isActive: () => activeWorldMatches(state),
    vehiclePose,
    syncVehiclePose,
    setStatus: (message, duration) => setStatus(state, message, duration),
    enterVehicle: (vehicle) => enterVehicleAfterClaim(state, vehicle),
    beginExit: () => beginExit(state)
  });
  state.reportCivicEvent = (event) => reportCivicEvent(state, event);
  state.unregisterStoreInteraction = appCtx.registerContextInteraction?.({
    id: 'urban_store',
    priority: 90,
    evaluate: () => storeInteractionCandidate(state),
    perform: (candidate) => performInteraction(state, candidate)
  });
  state.unregisterInteraction = appCtx.registerContextInteraction?.({
    id: 'urban_vehicle',
    priority: 80,
    evaluate: () => {
      const candidate = interactionCandidate(state);
      return candidate?.action === 'visit_store' ? null : candidate;
    },
    perform: (candidate) => performInteraction(state, candidate)
  });
  state.onPromptClick = () => {
    void appCtx.handlePrimaryContextInteraction?.();
  };
  state.onSecondaryClick = () => useEquipped(state);
  state.onTakeClick = () => {
    const candidate = appCtx.resolvePrimaryContextInteraction?.() || interactionCandidate(state);
    if (candidate?.action === 'loot_responder') performResponderLoot(state, candidate);
    else if (candidate?.action === 'talk_npc' || candidate?.action === 'loot_npc') performNpcTake(state, candidate);
  };
  state.onEquipmentToggle = () => toggleEquipment(state);
  state.onEquipmentClose = () => toggleEquipment(state, false);
  state.onCustodyContinue = () => {
    if (!state.custody?.resolved) return false;
    const resolved = state.custody.resolved;
    state.custody = null;
    state.civic?.clear?.();
    state.responders?.clearIncident?.();
    state.actorCollisionCooldowns.clear();
    state.secondaryCrashCooldowns.clear();
    state.recklessElapsed = 0;
    state.recklessEventCooldown = 4;
    appCtx.clearControlInputState?.('urban_custody_release');
    appCtx.applyResolvedWorldSpawn?.(resolved, { mode: 'walk', syncCar: false, syncWalker: true });
    state.playerCondition = 1;
    renderEquipment(state);
    return true;
  };
  state.onEquipmentSlotClick = (event) => {
    const button = event.target?.closest?.('[data-equipment-id]');
    if (!button || !state.equipmentUi.root.contains(button)) return;
    state.equipmentRuntime?.inspectItem?.(button.dataset.equipmentId);
  };
  state.onBackpackFilterClick = (event) => {
    const button = event.target?.closest?.('[data-backpack-filter]');
    if (button) state.equipmentRuntime?.setFilter?.(button.dataset.backpackFilter);
  };
  state.onBackpackDetailClick = (event) => {
    const button = event.target?.closest?.('[data-equipment-id]');
    if (!button) return;
    state.equipmentRuntime?.handleBackpackAction?.(
      button.dataset.backpackAction || '',
      button.dataset.equipmentId,
      button.dataset.backpackSlot || null
    );
  };
  state.onStoreClose = () => closeStore(state);
  state.onStoreAction = (event) => handleStoreAction(state, event);
  state.onStoreKeyDown = (event) => {
    if (event.key === 'Escape' && state.storeOpen) {
      event.preventDefault();
      closeStore(state);
    }
  };
  prompt.button?.addEventListener('click', state.onPromptClick);
  prompt.secondaryButton?.addEventListener('click', state.onSecondaryClick);
  prompt.takeButton?.addEventListener('click', state.onTakeClick);
  equipmentUi.toggle?.addEventListener('click', state.onEquipmentToggle);
  equipmentUi.close?.addEventListener('click', state.onEquipmentClose);
  appCtx.handleUrbanCustodyContinue = state.onCustodyContinue;
  equipmentUi.slots?.addEventListener('click', state.onEquipmentSlotClick);
  equipmentUi.contents?.addEventListener('click', state.onEquipmentSlotClick);
  equipmentUi.filters?.addEventListener('click', state.onBackpackFilterClick);
  equipmentUi.detail?.addEventListener('click', state.onBackpackDetailClick);
  storeUi.close?.addEventListener('click', state.onStoreClose);
  storeUi.root?.addEventListener('click', state.onStoreAction);
  document.addEventListener('keydown', state.onStoreKeyDown);
  state.unsubscribeBackpack = state.equipment.subscribe(() => {
    backpackStore.save(state.equipment.exportState());
    if (activeWorldMatches(state)) renderEquipment(state);
  });
  backpackStore.save(state.equipment.exportState());
  appCtx.registerRuntimeSystem?.({
    id: `${owner}:interaction`,
    owner,
    phase: 'simulation',
    priority: 45,
    critical: false,
    enabled: () => activeWorldMatches(state),
    update(frame) {
      state.roomAuthorityRuntime?.update?.(frame.dt);
      updateTransition(state, frame.dt);
      updateServiceEquipment(state, frame.dt);
      updateCivicResponse(state, frame.dt);
      updateEquipmentEffects(state, frame.dt);
      updateLootPickups(state, frame.dt);
      updateCrashBodies(state, frame.dt);
      state.npcs.forEach((npc) => npc.visual.updateAnimation(
        frame.dt,
        npc.reaction === 'fleeing' || !!npc.crashMotion,
        npc.reaction === 'fleeing'
      ));
      updateEntityLifecycle(state);
      state.npcPromotionElapsed += frame.dt;
      if (state.npcPromotionElapsed >= .25) {
        state.npcPromotionElapsed = 0;
        maintainNearbyNpcDetails(state);
      }
      state.vehiclePromotionElapsed += frame.dt;
      if (state.vehiclePromotionElapsed >= 1 / 30) {
        state.vehiclePromotionElapsed = 0;
        maintainNearbyVehicleDetails(state);
      }
      state.promptElapsed += frame.dt;
      if (state.promptElapsed >= 0.08) {
        state.promptElapsed = 0;
        updatePrompt(state);
      }
    }
  });
  activeRuntime = state;
  appCtx.urbanSandboxRuntime = state;
  state.vehicles.forEach((vehicle) => attachCuratedTrafficDetail(state, vehicle));
  appCtx.disposeUrbanSandboxRuntime = (reason = 'world-reload') => disposeRuntime(activeRuntime, reason);
  appCtx.urbanSandboxRuntimeSnapshot = () => snapshot(activeRuntime);
  appCtx.resolveUrbanActorCollision = resolveUrbanActorCollision;
  appCtx.enterUrbanVehicleByIdForSupport = (vehicleId) => beginEnter(state, vehicles.find((vehicle) => vehicle.id === vehicleId));
  appCtx.exitUrbanVehicleForSupport = () => beginExit(state);
  appCtx.toggleUrbanEquipment = (force) => toggleEquipment(state, force);
  appCtx.equipUrbanEquipmentSlot = (slot) => equipSlot(state, slot);
  appCtx.handleUrbanEquipmentUse = () => useEquipped(state);
  state.prepareAirborneParachute = (options = {}) => {
    const sourcePosition = options.sourcePosition;
    const walker = appCtx.Walk?.state?.walker;
    state.parachute.handoffSource = String(options.source || '');
    state.parachute.handoffDistance = sourcePosition && walker
      ? Math.hypot(
        Number(walker.x || 0) - Number(sourcePosition.x || 0),
        Number(walker.y || 0) - Number(sourcePosition.y || 0),
        Number(walker.z || 0) - Number(sourcePosition.z || 0)
      )
      : null;
    state.parachute.skydiving = true;
    state.parachute.automaticEquip = options.autoEquip === true;
    if (options.autoEquip === true && state.equipment.has?.('parachute')) {
      state.equipment.equip?.('parachute');
      state.backpackStore.save(state.equipment.exportState());
      state.equipmentRuntime?.render?.();
      setStatus(state, 'Parachute ready · press Space while descending to deploy.', 2600);
    } else {
      setStatus(state, 'Freefall · select the parachute and press Space to deploy.', 2600);
    }
    state.equipmentVisual?.setParachuteReady?.(true);
    return state.equipment.equipped?.()?.id === 'parachute';
  };
  appCtx.prepareAirborneParachute = state.prepareAirborneParachute;
  state.toggleServiceEquipment = () => toggleActiveServiceEquipment(state);
  appCtx.toggleUrbanResponderEquipment = state.toggleServiceEquipment;
  if (appCtx.developerDiagnosticsEnabled) {
    state.crashSupportHook = Object.freeze({
      enterVehicle: (vehicleId) => enterVehicleAfterClaim(state, state.vehicles.find((vehicle) => vehicle.id === String(vehicleId || ''))),
      prepare: (targetKind, speedMph, lateralOffset) => prepareCrashScenarioForSupport(state, targetKind, speedMph, lateralOffset),
      verifyEntityLifecycle: () => verifyEntityLifecycleForSupport(state),
      snapshot: () => snapshot(state)
    });
    globalThis.__WE3D_URBAN_CRASH_SUPPORT__ = state.crashSupportHook;
    state.storeSupportHook = Object.freeze({
      context: () => appCtx.contextInteractionSnapshot?.() || null,
      moveNear: (storeId) => moveNearStoreForSupport(state, storeId),
      perform: () => appCtx.handlePrimaryContextInteraction?.(),
      snapshot: () => snapshot(state)
    });
    globalThis.__WE3D_STORE_SUPPORT__ = state.storeSupportHook;
  }
  state.isParachuteDeployed = () => activeWorldMatches(state) && state.parachute.deployed === true;
  state.onParachuteLanded = () => {
    if (!state.parachute.deployed && !state.parachute.skydiving) return false;
    state.parachute.deployed = false;
    state.parachute.skydiving = false;
    state.parachute.automaticEquip = false;
    state.parachute.landedAt = now();
    state.equipmentVisual?.setParachuteReady?.(false);
    state.equipmentVisual?.setParachuteDeployed?.(false);
    setStatus(state, 'Landed safely · parachute repacked.', 1800);
    state.equipmentRuntime?.render?.();
    return true;
  };
  appCtx.isUrbanParachuteDeployed = state.isParachuteDeployed;
  appCtx.onUrbanParachuteLanded = state.onParachuteLanded;
  appCtx.handleUrbanNpcTake = () => {
    const candidate = interactionCandidate(state);
    if (candidate?.action === 'loot_responder') return performResponderLoot(state, candidate);
    return candidate?.action === 'talk_npc' || candidate?.action === 'loot_npc' ? performNpcTake(state, candidate) : false;
  };
  updatePrompt(state);
  updateCivicStatus(state);
  renderEquipment(state);
  return state;
}

Object.assign(appCtx, {
  disposeUrbanSandboxRuntime: (reason = 'world-reload') => disposeRuntime(activeRuntime, reason),
  startUrbanSandboxRuntime,
  urbanSandboxRuntimeSnapshot: () => snapshot(activeRuntime)
});

export { disposeRuntime as disposeUrbanSandboxRuntime, startUrbanSandboxRuntime };

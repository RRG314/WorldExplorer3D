import { ctx as appCtx } from '../shared-context.js?v=55';
import { createLocalBackpackStore } from '../player/backpack-store.js?v=2';
import { carSpeedToMph } from '../physics/vehicle-speed-units.js?v=2';
import { VEHICLE_ROOT_TO_GROUND_METERS } from '../engine/vehicle-catalog.js?v=2';
import { createCivicResponseModel } from './civic-response-model.js?v=2';
import { createEquipmentInventory } from './equipment-model.js?v=5';
import { createUrbanEquipmentRuntime } from './equipment-runtime.js?v=8';
import { createEquipmentVisuals } from './equipment-visuals.js?v=3';
import { createUrbanNpcVisual } from './npc-visuals.js?v=4';
import { nearestMappedFacility } from './facility-model.js?v=3';
import { createUrbanRoomAuthorityRuntime } from './room-authority-runtime.js?v=2';
import { createUrbanResponderRuntime } from './responder-runtime.js?v=10';
import { parkedVehicleAnchors, vehicleDoorPosition, vehicleExitCandidates } from './vehicle-model.js?v=6';
import { createUrbanVehicleVisual } from './vehicle-visuals.js?v=8';

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
// The instanced population remains the single far/mid-distance owner. Promote
// the closest people before they enter conversational range so the player
// never sees the old coarse silhouette switch only after pressing Interact.
// Keep the authoritative instanced population for the long-range world, but
// promote actors while they are still visually identifiable in a normal
// street view. The previous 90 m boundary left the coarse LOD clearly visible
// for too long before the detailed actor took ownership.
const NPC_DETAIL_PRELOAD_DISTANCE = 140;
const NPC_DETAIL_RELEASE_DISTANCE = 174;
const VEHICLE_DETAIL_PRELOAD_DISTANCE = 120;
const VEHICLE_DETAIL_RELEASE_DISTANCE = 180;
let activeRuntime = null;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
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
  const responders = state.responders?.snapshot?.()?.responders || [];
  responders.forEach((responder) => {
    targets.push({ kind: 'responder_vehicle', ref: responder, radius: 1.02, ...responder });
    if (responder.officer) targets.push({ kind: 'responder_officer', ref: responder.officer, radius: .44, ...responder.officer });
  });
  return targets;
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
    if (speedMph >= 7 && now() - lastImpact > 900 && !direct.target.kind.startsWith('responder_')) {
      state.actorCollisionCooldowns.set(collisionKey, now());
      const force = Math.min(120, 14 + speedMph * 1.7);
      state.equipmentRuntime?.applyCollisionImpact?.(direct.target, force);
      reportCivicEvent(state, {
        kind: 'vehicle_collision',
        severity: speedMph >= 25 ? 2 : 1,
        radius: 38,
        audibleRadius: 24,
        maximumWitnesses: 3,
        forceWitness: true
      });
    }
  }

  const slideX = blockerAlong(source, { x: destination.x, z: source.z });
  const slideZ = blockerAlong(source, { x: source.x, z: destination.z });
  if (!slideX) return Object.freeze({ x: destination.x, z: source.z, collision: true, targetKind: direct.target.kind });
  if (!slideZ) return Object.freeze({ x: source.x, z: destination.z, collision: true, targetKind: direct.target.kind });
  return Object.freeze({ x: source.x, z: source.z, collision: true, targetKind: direct.target.kind });
}

function nearestNpcCandidate(state, radius = NPC_INTERACTION_DISTANCE) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk' || state.transition) return null;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return null;
  const promoted = state.npcs.map((npc) => {
    const pose = npcPose(npc);
    return { npc, distance: Math.hypot(pose.x - walker.x, pose.z - walker.z), sourceAgentId: npc.sourceAgentId };
  }).filter((entry) => entry.distance <= radius);
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

function releasePromotedNpc(state, npc) {
  const index = state.npcs.indexOf(npc);
  if (index < 0) return false;
  state.population?.releasePedestrian?.(npc.sourceAgentId);
  npc.visual.dispose();
  state.npcs.splice(index, 1);
  return true;
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
  const definition = {
    ...promoted,
    id: promotedId,
    sourceAgentId: promoted.id,
    source: 'living-world-promoted-interaction',
    heldEquipment: possessionSeed % 17 === 0 ? 'laser-gun' : possessionSeed % 11 === 0 ? 'paintball-gun' : ''
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
    lootRounds: definition.heldEquipment ? 12 + possessionSeed % 25 : 0
  };
  visual.root.position.set(promoted.x, promoted.y, promoted.z);
  visual.root.rotation.set(0, promoted.yaw, 0);
  state.group.add(visual.root);
  state.npcs.push(npc);
  return npc;
}

function maintainNearbyNpcDetails(state) {
  if (!activeWorldMatches(state) || state.transition) return;
  const actor = civicActorPosition(state);
  if (!actor) return;
  const nearby = (state.population?.nearbyPedestrians?.(actor, NPC_DETAIL_PRELOAD_DISTANCE) || [])
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
  }).filter((entry) => entry.distance <= NPC_DETAIL_RELEASE_DISTANCE);
  const desiredIds = new Set([
    ...detailCandidates,
    ...nearby.map((entry) => ({ id: entry.pedestrian.id, distance: entry.distance }))
  ].sort((a, b) => a.distance - b.distance).slice(0, state.npcBudget).map((entry) => entry.id));
  state.npcs.slice().forEach((npc) => {
    if (npc.reaction || npc.reactionUntil === Infinity) return;
    const pose = npcPose(npc);
    const distance = Math.hypot(pose.x - actor.x, pose.z - actor.z);
    if (distance > NPC_DETAIL_RELEASE_DISTANCE || !desiredIds.has(npc.sourceAgentId)) {
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
    resistance: 160,
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
  if (!activeWorldMatches(state) || state.transition || appCtx.activeInterior) return null;
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
  if (!nearestVehicle && !nearestNpc && !nearestFurniture && !nearestResponderLoot) return null;
  const nearestOtherDistance = Math.min(
    nearestVehicle?.distance ?? Infinity,
    nearestNpc?.distance ?? Infinity,
    nearestFurniture?.distance ?? Infinity
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
  state.defaultCarChildren.forEach((child) => { child.visible = true; });
  appCtx.wheelMeshes = state.defaultWheelMeshes;
  if (appCtx.carMesh?.userData) {
    delete appCtx.carMesh.userData.activeUrbanVehicleId;
    appCtx.carMesh.userData.vehicleStyle = state.defaultVehicleStyle;
  }
}

function mountVehicleForDriving(state, vehicle) {
  const pose = vehiclePose(vehicle);
  state.defaultCarChildren.forEach((child) => { child.visible = false; });
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
  npc.reaction = witness.reaction;
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
  }).filter((entry) => entry.npc.condition > 0 && entry.distance <= Math.max(0, Number(event.radius) || 0))
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
  if (authorityMode === 'local') state.civic.update(step, civicActorPosition(state));
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
  state.npcs.forEach((npc) => {
    if (npc.reaction === witnessReaction) return;
    npc.reaction = witnessReaction;
    npc.visual.setReaction(witnessReaction);
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
    resistance: 160,
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
    if (npc.lootClaimed) {
      setStatus(state, 'No equipment or ammunition remains.');
      return true;
    }
    npc.lootClaimed = true;
    const weaponId = String(npc.heldEquipment || '');
    if (weaponId && !state.equipment.has(weaponId)) {
      state.equipment.upsertItem({
        instanceId: `recovered:${npc.id}:${weaponId}`,
        catalogId: weaponId,
        quantity: 1,
        authority: 'anonymous-local',
        provenance: 'recovered-equipment',
        sourceEventId: `downed:${npc.id}`,
        acquiredAt: Date.now()
      });
    }
    const rounds = weaponId ? state.equipment.grantAmmo(weaponId, npc.lootRounds) : 0;
    setStatus(state, weaponId
      ? `${state.equipment.snapshot().items.find((item) => item.id === weaponId)?.label || 'Weapon'} recovered · ${rounds} rounds added`
      : 'No recoverable equipment found.', 2400);
    state.lastNpcAction = Object.freeze({ type: 'recovered_equipment', npcId: npc.id, weaponId, rounds, at: now() });
    renderEquipment(state);
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
  const rounds = state.equipment.grantAmmo(loot.weaponId, loot.rounds);
  setStatus(state, `Pulse sidearm ammunition recovered · ${rounds} rounds added`, 2400);
  renderEquipment(state);
  return true;
}

function renderEquipment(state) {
  state.equipmentRuntime?.render();
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
  if (candidate?.action === 'inspect_object') prompt.button.textContent = 'Inspect';
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
    activeVehicleId: state.activeVehicle?.id || '',
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
      reaction: npc.reaction,
      condition: Number(Number(npc.condition ?? 1).toFixed(3)),
      possessionAvailable: npc.possessionAvailable === true,
      x: Number(npc.x.toFixed(2)),
      y: Number(npc.y.toFixed(2)),
      z: Number(npc.z.toFixed(2)),
      yaw: Number(npc.yaw.toFixed(4)),
      renderedMeshCount: (() => {
        let count = 0;
        npc.visual?.root?.traverse?.((object) => { if (object?.isMesh) count += 1; });
        return count;
      })()
    }))),
    ambientPedestrians: Object.freeze(ambientPedestrians),
    lastAction: state.lastAction,
    lastCivicAction: state.lastCivicAction,
    lastCivicOutcome: state.lastCivicOutcome,
    lastNpcAction: state.lastNpcAction,
    lastImpactAction: state.lastImpactAction,
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
    backpackMigration: state.backpackStore?.migrationSnapshot?.() || null,
    parachute: Object.freeze({
      deployed: state.parachute?.deployed === true,
      deployedAt: Number(state.parachute?.deployedAt || 0),
      landedAt: Number(state.parachute?.landedAt || 0)
    }),
    civicResponse: civicSnapshot(state),
    responders: state.responders?.snapshot?.() || null,
    worldLoadSequence: Number(appCtx._worldLoadSequence || 0),
    budgets: Object.freeze({ interactiveVehicles: state.budget, interactiveNpcs: state.npcBudget, mobile: state.mobile }),
    lodPolicy: Object.freeze({
      npcInteractionDistance: NPC_INTERACTION_DISTANCE,
      npcPreloadDistance: NPC_DETAIL_PRELOAD_DISTANCE,
      npcReleaseDistance: NPC_DETAIL_RELEASE_DISTANCE,
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
    })
  });
}

function disposeRuntime(state, reason = 'disposed') {
  if (!state || state.disposed) return false;
  state.roomAuthorityRuntime?.dispose?.();
  state.disposed = true;
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
  document.getElementById('caughtBtn')?.removeEventListener('click', state.onCustodyContinue);
  if (appCtx.handleUrbanCustodyContinue === state.onCustodyContinue) delete appCtx.handleUrbanCustodyContinue;
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
  state.vehicles.forEach((vehicle) => vehicle.visual.dispose());
  state.npcs.forEach((npc) => npc.visual.dispose());
  state.equipmentVisual?.dispose?.();
  state.equipmentRuntime?.dispose?.();
  state.responders?.dispose?.();
  state.group.removeFromParent?.();
  state.vehicles.length = 0;
  state.npcs.length = 0;
  state.activeVehicle = null;
  state.civic?.clear?.();
  if (appCtx.isUrbanParachuteDeployed === state.isParachuteDeployed) delete appCtx.isUrbanParachuteDeployed;
  if (appCtx.onUrbanParachuteLanded === state.onParachuteLanded) delete appCtx.onUrbanParachuteLanded;
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
      resistance: 160,
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
    toggle: document.getElementById('urbanEquipmentToggle'),
    close: document.getElementById('urbanEquipmentCloseBtn')
  };
  const backpackStore = appCtx.playerBackpackStore || createLocalBackpackStore();
  appCtx.playerBackpackStore = backpackStore;
  const equipment = appCtx.playerBackpackInventory || createEquipmentInventory({ persistedState: backpackStore.load() });
  appCtx.playerBackpackInventory = equipment;
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
    prompt,
    equipmentUi,
    civicUi,
    budget,
    vehicleDetailBudget,
    actorCollisionCooldowns: new Map(),
    // Keep every close/conversational pedestrian on the detailed character
    // path. Four slots allowed a fifth person in a normal sidewalk cluster to
    // remain an instanced silhouette until interaction, which is the visible
    // block-to-character swap this runtime is meant to prevent.
    npcBudget: mobile ? 9 : 16,
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
    defaultVehicleStyle: String(appCtx.carMesh?.userData?.vehicleStyle || 'classic-utility-d'),
    lastAction: null,
    lastCivicAction: null,
    lastCivicOutcome: null,
    lastNpcAction: null,
    lastImpactAction: null,
    statusMessage: '',
    statusUntil: 0,
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
    equipmentVisual: createEquipmentVisuals(THREE, appCtx.Walk?.state?.characterMesh),
    equipmentRuntime: null,
    equipmentOpen: false,
    parachute: { deployed: false, deployedAt: 0, landedAt: 0 },
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
    fireNpcProjectile: (settings) => state.equipmentRuntime?.fireNpcProjectile?.(settings) === true,
    onOfficerShot: (impact) => applyOfficerImpact(state, impact),
    onArrest: () => {
      // Enter/exit handoffs are atomic gameplay transitions. Applying custody
      // midway through the door animation leaves the interaction reported as
      // handled but silently returns the player to walking mode.
      if (state.transition) return;
      const civic = civicSnapshot(state);
      if (Number(civic?.level || 0) >= 2) placePlayerInCustody(state, 'arrested');
    },
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
  state.unregisterInteraction = appCtx.registerContextInteraction?.({
    id: 'urban_vehicle',
    priority: 80,
    evaluate: () => interactionCandidate(state),
    perform: (candidate) => performInteraction(state, candidate)
  });
  state.onPromptClick = () => {
    void appCtx.handlePrimaryContextInteraction?.();
  };
  state.onSecondaryClick = () => useEquipped(state);
  state.onTakeClick = () => {
    const candidate = appCtx.resolvePrimaryContextInteraction?.() || interactionCandidate(state);
    if (candidate?.action === 'talk_npc') performNpcTake(state, candidate);
  };
  state.onEquipmentToggle = () => toggleEquipment(state);
  state.onEquipmentClose = () => toggleEquipment(state, false);
  state.onCustodyContinue = () => {
    if (!state.custody?.resolved) return false;
    appCtx.applyResolvedWorldSpawn?.(state.custody.resolved, { mode: 'walk', syncCar: false, syncWalker: true });
    state.custody = null;
    state.playerCondition = 1;
    renderEquipment(state);
    return true;
  };
  state.onEquipmentSlotClick = (event) => {
    const button = event.target?.closest?.('[data-equipment-id]');
    if (!button || !state.equipmentUi.root.contains(button)) return;
    if (button.dataset.backpackInspect === 'true') {
      state.equipmentRuntime?.inspectItem?.(button.dataset.equipmentId);
      return;
    }
    if (state.equipment.equip(button.dataset.equipmentId)) {
      setStatus(state, `${state.equipment.equipped().label} equipped.`, 1200);
      renderEquipment(state);
    }
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
      updateCivicResponse(state, frame.dt);
      updateEquipmentEffects(state, frame.dt);
      state.npcPromotionElapsed += frame.dt;
      if (state.npcPromotionElapsed >= .25) {
        state.npcPromotionElapsed = 0;
        maintainNearbyNpcDetails(state);
      }
      state.vehiclePromotionElapsed += frame.dt;
      if (state.vehiclePromotionElapsed >= .1) {
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
  appCtx.disposeUrbanSandboxRuntime = (reason = 'world-reload') => disposeRuntime(activeRuntime, reason);
  appCtx.urbanSandboxRuntimeSnapshot = () => snapshot(activeRuntime);
  appCtx.resolveUrbanActorCollision = resolveUrbanActorCollision;
  appCtx.enterUrbanVehicleByIdForSupport = (vehicleId) => beginEnter(state, vehicles.find((vehicle) => vehicle.id === vehicleId));
  appCtx.exitUrbanVehicleForSupport = () => beginExit(state);
  appCtx.toggleUrbanEquipment = (force) => toggleEquipment(state, force);
  appCtx.equipUrbanEquipmentSlot = (slot) => equipSlot(state, slot);
  appCtx.handleUrbanEquipmentUse = () => useEquipped(state);
  state.isParachuteDeployed = () => activeWorldMatches(state) && state.parachute.deployed === true;
  state.onParachuteLanded = () => {
    if (!state.parachute.deployed) return false;
    state.parachute.deployed = false;
    state.parachute.landedAt = now();
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

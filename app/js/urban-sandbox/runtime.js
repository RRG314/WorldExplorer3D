import { ctx as appCtx } from '../shared-context.js?v=55';
import { carSpeedToMph } from '../physics/vehicle-speed-units.js?v=1';
import { createCivicResponseModel } from './civic-response-model.js?v=2';
import { createEquipmentInventory } from './equipment-model.js?v=1';
import { createUrbanEquipmentRuntime } from './equipment-runtime.js?v=2';
import { createEquipmentVisuals } from './equipment-visuals.js?v=1';
import { createUrbanNpcVisual } from './npc-visuals.js?v=2';
import { createUrbanRoomAuthorityRuntime } from './room-authority-runtime.js?v=1';
import { parkedVehicleAnchors, vehicleDoorPosition, vehicleExitCandidates } from './vehicle-model.js?v=2';
import { createUrbanVehicleVisual } from './vehicle-visuals.js?v=4';

const ENTER_DISTANCE = 3.4;
const EXIT_SPEED_LIMIT = 4;
const TRANSITION_DURATION = 0.56;
const NPC_INTERACTION_DISTANCE = 3.2;
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
      yaw: Number(appCtx.car?.angle || 0)
    };
  }
  return { x: vehicle.x, y: vehicle.y, z: vehicle.z, yaw: vehicle.yaw };
}

function syncVehiclePose(vehicle, pose) {
  vehicle.x = Number(pose.x || 0);
  vehicle.y = Number(pose.y || 0);
  vehicle.z = Number(pose.z || 0);
  vehicle.yaw = Number(pose.yaw || 0);
  if (!vehicle.attachedToPlayer) {
    vehicle.visual.root.position.set(vehicle.x, vehicle.y, vehicle.z);
    vehicle.visual.root.rotation.set(0, vehicle.yaw, 0);
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
    const door = vehicleDoorPosition(vehicle);
    const distance = Math.hypot(door.x - walker.x, door.z - walker.z);
    if (distance > ENTER_DISTANCE || nearest && distance >= nearest.distance) continue;
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
      y: agent.y + 1.2,
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

function nearestNpcCandidate(state, radius = NPC_INTERACTION_DISTANCE) {
  if (!activeWorldMatches(state) || appCtx.Walk?.state?.mode !== 'walk' || state.transition) return null;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return null;
  const promoted = state.npcs.map((npc) => {
    const pose = npcPose(npc);
    return { npc, distance: Math.hypot(pose.x - walker.x, pose.z - walker.z), sourceAgentId: npc.sourceAgentId };
  }).filter((entry) => entry.npc.condition > 0 && entry.distance <= radius);
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
  const definition = {
    ...promoted,
    id: `urban-npc:${state.worldIdentity}:${promoted.id}`,
    sourceAgentId: promoted.id,
    source: 'living-world-promoted-interaction'
  };
  const visual = createUrbanNpcVisual(THREE, definition);
  const possessionSeed = [...definition.id].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381);
  const npc = { ...definition, visual, reaction: promoted.reaction, condition: 1, resistance: 100, possessionAvailable: possessionSeed % 5 !== 0 };
  visual.root.position.set(promoted.x, promoted.y, promoted.z);
  visual.root.rotation.set(0, promoted.yaw, 0);
  state.group.add(visual.root);
  state.npcs.push(npc);
  return npc;
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
  if (!activeWorldMatches(state) || state.transition) return null;
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
  if (!nearestVehicle && !nearestNpc && !nearestFurniture) return null;
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
    const equipped = state.equipment?.equipped?.();
    return {
      available: true,
      action: 'talk_npc',
      label: 'Talk',
      detail: String(nearestNpc.npc?.archetype || nearestNpc.pedestrian?.archetype || 'Local').replaceAll('-', ' '),
      distance: nearestNpc.distance,
      secondaryLabel: equipped?.actionLabel || 'Use',
      takeLabel: 'Take item',
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
    detail: nearestVehicle.trafficAgentId ? 'Take driver seat' : 'Driver seat',
    distance: nearestVehicle.distance,
    secondaryLabel: state.equipment?.equipped?.()?.actionLabel || 'Use',
    data: { vehicleId: nearestVehicle.vehicle.id, trafficAgentId: nearestVehicle.trafficAgentId || '' }
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
  appCtx.car.speed = 0;
  appCtx.car.vFwd = 0;
  appCtx.car.vLat = 0;
  appCtx.car.yawRate = 0;
  appCtx.carMesh.position.set(pose.x, pose.y, pose.z);
  appCtx.carMesh.rotation.set(0, pose.yaw, 0);
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

function updateCivicStatus(state) {
  const root = state.civicUi?.root;
  if (!root) return;
  const snapshot = state.civic?.snapshot?.();
  const status = snapshot?.status;
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
  const witnesses = state.population?.witnessEvent?.({
    kind: event.kind,
    position,
    radius: event.radius,
    audibleRadius: event.audibleRadius,
    maximumWitnesses: event.maximumWitnesses
  }) || [];
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
  const civicSnapshot = state.civic.update(step, civicActorPosition(state));
  const witnessReaction = civicSnapshot.phase === 'observed' || civicSnapshot.phase === 'reporting'
    ? 'reporting'
    : civicSnapshot.phase === 'searching' ? 'watching' : '';
  state.npcs.forEach((npc) => {
    if (npc.reaction === witnessReaction) return;
    npc.reaction = witnessReaction;
    npc.visual.setReaction(witnessReaction);
  });
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
  if (state.vehicles.length >= state.budget) return null;
  const promoted = state.population?.promoteVehicle?.(trafficAgentId);
  if (!promoted) return null;
  const definition = {
    id: vehicleId || `traffic:${state.worldIdentity}:${promoted.id}`,
    variant: promoted.variant,
    color: promoted.color,
    condition: 1,
    resistance: 160,
    source: 'living-world-promoted-traffic',
    trafficAgentId,
    x: promoted.x,
    y: promoted.y + 1.2,
    z: promoted.z,
    yaw: promoted.yaw,
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
  if (!npc.possessionAvailable) {
    setStatus(state, 'Nothing available to take.');
    return true;
  }
  npc.possessionAvailable = false;
  const count = state.equipment.addSandboxItem(1);
  npc.reaction = 'reporting';
  npc.reactionUntil = now() + 4200;
  npc.visual.setReaction('reporting');
  setStatus(state, `Took a sandbox item · carried ${count}`, 2200);
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

function renderEquipment(state) {
  state.equipmentRuntime?.render();
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
  if (!vehicle.playerClaimed) {
    vehicle.playerClaimed = true;
    reportCivicEvent(state, {
      kind: 'vehicle_taken',
      vehicleId: vehicle.id,
      position: vehiclePose(vehicle),
      severity: 1,
      radius: 32,
      audibleRadius: 7,
      maximumWitnesses: 3
    });
  }
  return beginEnter(state, vehicle);
}

function performInteraction(state, candidate) {
  if (candidate?.action === 'exit_vehicle') {
    beginExit(state);
    return true;
  }
  if (candidate?.action === 'talk_npc') return performNpcTalk(state, candidate);
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
  const trafficAgentId = String(candidate?.data?.trafficAgentId || '');
  if (!vehicle && trafficAgentId) {
    if (state.vehicles.length >= state.budget) {
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
  const candidate = interactionCandidate(state);
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
  prompt.button.textContent = candidate?.action === 'exit_vehicle' ? 'Exit' : 'Enter';
  if (candidate?.action === 'talk_npc') prompt.button.textContent = 'Talk';
  if (candidate?.action === 'inspect_object') prompt.button.textContent = 'Inspect';
  prompt.button.disabled = !candidate?.available;
  prompt.button.hidden = !!transientStatus;
  const showSecondary = !transientStatus && !!candidate?.secondaryLabel && appCtx.Walk?.state?.mode === 'walk';
  prompt.secondaryKey.hidden = !showSecondary;
  prompt.secondaryButton.hidden = !showSecondary;
  prompt.secondaryButton.textContent = candidate?.secondaryLabel || 'Use';
  const showTake = !transientStatus && candidate?.action === 'talk_npc';
  prompt.takeKey.hidden = !showTake;
  prompt.takeButton.hidden = !showTake;
}

function snapshot(state) {
  if (!state) return Object.freeze({ active: false });
  const candidate = interactionCandidate(state);
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
        source: vehicle.source || 'parked-world-vehicle',
        playerClaimed: vehicle.playerClaimed === true,
        trafficAgentId: vehicle.trafficAgentId || '',
        occupied: vehicle.occupied,
        attachedToPlayer: vehicle.attachedToPlayer
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
      yaw: Number(npc.yaw.toFixed(4))
    }))),
    lastAction: state.lastAction,
    lastCivicAction: state.lastCivicAction,
    lastNpcAction: state.lastNpcAction,
    lastImpactAction: state.lastImpactAction,
    authority: state.roomAuthorityRuntime?.snapshot?.() || Object.freeze({ mode: 'local' }),
    equipment: state.equipment?.snapshot?.() || null,
    civicResponse: state.civic?.snapshot?.() || null,
    worldLoadSequence: Number(appCtx._worldLoadSequence || 0),
    budgets: Object.freeze({ interactiveVehicles: state.budget, interactiveNpcs: state.npcBudget, mobile: state.mobile })
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
  state.equipmentUi?.slots?.removeEventListener('click', state.onEquipmentSlotClick);
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
  state.group.removeFromParent?.();
  state.vehicles.length = 0;
  state.npcs.length = 0;
  state.activeVehicle = null;
  state.civic?.clear?.();
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
  const budget = mobile ? 3 : 6;
  const reference = appCtx.Walk?.state?.walker || appCtx.car || { x: 0, z: 0 };
  const graph = livingWorld.publication.trafficGraph;
  const worldIdentity = livingWorld.publication.worldIdentity?.id || publication.requestId;
  const driveOnLeft = String(options.request?.location?.name || options.request?.selection?.name || '').match(/london|england|united kingdom|australia|japan|new zealand|singapore/i) !== null;
  const anchors = parkedVehicleAnchors(graph, reference, {
    count: mobile ? 2 : 3,
    minDistance: 12,
    maxDistance: 68,
    worldIdentity,
    driveOnLeft,
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
    status: document.getElementById('urbanEquipmentStatus'),
    toggle: document.getElementById('urbanEquipmentToggle')
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
    prompt,
    equipmentUi,
    civicUi,
    budget,
    npcBudget: mobile ? 2 : 3,
    mobile,
    population: livingWorld.population,
    worldIdentity,
    driveOnLeft,
    activeVehicle: null,
    transition: null,
    disposed: false,
    reason: '',
    defaultCarChildren: [...(appCtx.carMesh?.children || [])],
    defaultWheelMeshes: [...(appCtx.wheelMeshes || [])],
    defaultVehicleStyle: String(appCtx.carMesh?.userData?.vehicleStyle || 'classic-utility-d'),
    lastAction: null,
    lastCivicAction: null,
    lastNpcAction: null,
    lastImpactAction: null,
    statusMessage: '',
    statusUntil: 0,
    promptElapsed: 0,
    recklessElapsed: 0,
    recklessEventCooldown: 0,
    civicUiElapsed: 0,
    civic: null,
    equipment: createEquipmentInventory(),
    equipmentVisual: createEquipmentVisuals(THREE, appCtx.Walk?.state?.characterMesh),
    equipmentRuntime: null,
    equipmentOpen: false,
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
    const candidate = interactionCandidate(state);
    if (candidate) performInteraction(state, candidate);
  };
  state.onSecondaryClick = () => useEquipped(state);
  state.onTakeClick = () => {
    const candidate = interactionCandidate(state);
    if (candidate?.action === 'talk_npc') performNpcTake(state, candidate);
  };
  state.onEquipmentToggle = () => toggleEquipment(state);
  state.onEquipmentSlotClick = (event) => {
    const button = event.target?.closest?.('[data-equipment-id]');
    if (!button || !state.equipmentUi.slots.contains(button)) return;
    if (state.equipment.equip(button.dataset.equipmentId)) {
      setStatus(state, `${state.equipment.equipped().label} equipped.`, 1200);
      renderEquipment(state);
    }
  };
  prompt.button?.addEventListener('click', state.onPromptClick);
  prompt.secondaryButton?.addEventListener('click', state.onSecondaryClick);
  prompt.takeButton?.addEventListener('click', state.onTakeClick);
  equipmentUi.toggle?.addEventListener('click', state.onEquipmentToggle);
  equipmentUi.slots?.addEventListener('click', state.onEquipmentSlotClick);
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
  appCtx.enterUrbanVehicleByIdForSupport = (vehicleId) => beginEnter(state, vehicles.find((vehicle) => vehicle.id === vehicleId));
  appCtx.exitUrbanVehicleForSupport = () => beginExit(state);
  appCtx.toggleUrbanEquipment = () => toggleEquipment(state);
  appCtx.equipUrbanEquipmentSlot = (slot) => equipSlot(state, slot);
  appCtx.handleUrbanEquipmentUse = () => useEquipped(state);
  appCtx.handleUrbanNpcTake = () => {
    const candidate = interactionCandidate(state);
    return candidate?.action === 'talk_npc' ? performNpcTake(state, candidate) : false;
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

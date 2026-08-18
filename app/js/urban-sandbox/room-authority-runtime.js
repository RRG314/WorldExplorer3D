import { ctx as appCtx } from '../shared-context.js?v=55';

function roomIdentity(room) {
  return room ? `${String(room.code || room.id || '')}:${String(room.world?.seed || '')}` : '';
}

function createUrbanRoomAuthorityRuntime(options = {}) {
  const state = options.state;
  let disposed = false;
  let roomKey = '';
  let syncGeneration = 0;
  let pendingVehicleId = '';
  let impactPending = false;
  let poseElapsed = 0;

  const active = () => !disposed && options.isActive();
  const currentRoom = () => appCtx.getCurrentMultiplayerRoom?.() || null;

  function applyEntities(entities = []) {
    if (!active()) return;
    state.remoteEntities = new Map(entities.map((entity) => [entity.entityId, entity]));
    const currentTime = Date.now();
    for (const vehicle of state.vehicles) {
      const remote = state.remoteEntities.get(vehicle.id);
      if (!remote || remote.kind !== 'vehicle') {
        vehicle.roomOccupiedByOther = false;
        continue;
      }
      vehicle.condition = remote.condition;
      vehicle.visual.setCondition(remote.condition);
      const occupiedByOther = !!remote.leaseOwnerUid && remote.leaseOwnerUid !== state.authority?.actorUid && remote.leaseExpiresMs > currentTime;
      vehicle.roomOccupiedByOther = occupiedByOther;
      vehicle.roomLeaseOwnerUid = remote.leaseOwnerUid;
      if (!vehicle.attachedToPlayer && !occupiedByOther) options.syncVehiclePose(vehicle, remote.pose);
      vehicle.visual.root.visible = !occupiedByOther || vehicle.attachedToPlayer;
    }
    for (const npc of state.npcs) {
      const remote = state.remoteEntities.get(npc.id);
      if (!remote || remote.kind !== 'npc') continue;
      npc.condition = remote.condition;
      npc.visual.setReaction(remote.condition <= .001 ? 'downed' : npc.reaction);
    }
    for (const object of appCtx.streetFurnitureMeshes || []) {
      const remote = state.remoteEntities.get(String(object?.userData?.urbanEntityId || ''));
      if (!remote || remote.kind !== 'furniture') continue;
      object.userData.condition = remote.condition;
      object.rotation.z = remote.condition <= .001 ? .72 : Math.min(.18, (1 - remote.condition) * .2);
    }
  }

  async function sync() {
    if (!active()) return null;
    const room = currentRoom();
    const nextKey = roomIdentity(room);
    if (nextKey === roomKey && (state.authority || !room)) return state.authority;
    const generation = ++syncGeneration;
    if (state.activeVehicle && state.authority) {
      state.authority.releaseVehicle(state.activeVehicle, options.vehiclePose(state.activeVehicle)).catch(() => {});
    }
    state.authority?.dispose?.();
    state.authority = null;
    roomKey = nextKey;
    state.remoteEntities.clear();
    if (!room) return null;
    try {
      const { createUrbanRoomAuthority } = await import('../multiplayer/urban-sandbox.js?v=1');
      if (!active() || generation !== syncGeneration) return null;
      state.authority = createUrbanRoomAuthority({
        room,
        onEntities: applyEntities,
        onError: () => options.setStatus('Shared vehicle state is reconnecting. Local room mutations remain locked.', 2600)
      });
      if (!state.authority) options.setStatus('Sign in and establish room presence to use shared urban interactions.', 2600);
      return state.authority;
    } catch (error) {
      console.warn('[urban-sandbox] room authority unavailable:', error);
      options.setStatus('Shared urban authority is unavailable. Room mutations remain locked.', 2600);
      return null;
    }
  }

  function requestVehicleEntry(vehicle) {
    if (!currentRoom()) return options.enterVehicle(vehicle);
    if (pendingVehicleId) {
      options.setStatus('Vehicle ownership is already being checked.', 1400);
      return true;
    }
    if (!state.authority) {
      sync();
      options.setStatus('Shared vehicle authority is connecting. Try again in a moment.', 2200);
      return true;
    }
    pendingVehicleId = vehicle.id;
    options.setStatus('Claiming this vehicle for your room session…', 2600);
    state.authority.claimVehicle(vehicle, options.vehiclePose(vehicle)).then((result) => {
      if (!active() || pendingVehicleId !== vehicle.id) return;
      pendingVehicleId = '';
      if (!result?.accepted) {
        options.setStatus(result?.reason === 'occupied' ? 'Another player is using this vehicle.' : 'The room did not authorize this vehicle.', 2400);
        return;
      }
      vehicle.roomLeaseOwnerUid = state.authority.actorUid;
      vehicle.roomOccupiedByOther = false;
      options.enterVehicle(vehicle);
    }).catch((error) => {
      if (!active()) return;
      pendingVehicleId = '';
      options.setStatus(String(error?.message || 'Vehicle authority is unavailable.'), 2800);
    });
    return true;
  }

  function update(dt) {
    impactPending = state.authorityImpactPending === true;
    if (!state.activeVehicle?.attachedToPlayer) {
      poseElapsed = 0;
      return;
    }
    options.syncVehiclePose(state.activeVehicle, options.vehiclePose(state.activeVehicle));
    poseElapsed += dt;
    if (!state.authority || poseElapsed < .9) return;
    poseElapsed = 0;
    const vehicle = state.activeVehicle;
    state.authority.updateVehicle(vehicle, options.vehiclePose(vehicle)).then((result) => {
      if (!active() || !state.activeVehicle || result?.accepted !== false) return;
      appCtx.car.speed = 0;
      appCtx.car.vFwd = 0;
      appCtx.car.vLat = 0;
      options.beginExit();
      options.setStatus('This room vehicle lease ended. Control was released safely.', 2600);
    }).catch(() => {
      if (active()) options.setStatus('Vehicle synchronization is reconnecting.', 1600);
    });
  }

  function snapshot() {
    return Object.freeze({
      mode: state.authority ? 'room' : currentRoom() ? 'room_locked' : 'local',
      roomCode: state.authority?.roomCode || '',
      actorUid: state.authority?.actorUid || '',
      pendingVehicleId,
      impactPending,
      synchronizedEntities: state.remoteEntities?.size || 0
    });
  }

  function dispose() {
    if (disposed) return false;
    if (state.activeVehicle && state.authority) {
      state.authority.releaseVehicle(state.activeVehicle, options.vehiclePose(state.activeVehicle)).catch(() => {});
    }
    disposed = true;
    syncGeneration += 1;
    globalThis.removeEventListener('we3d-room-changed', sync);
    state.authority?.dispose?.();
    state.authority = null;
    state.remoteEntities.clear();
    return true;
  }

  globalThis.addEventListener('we3d-room-changed', sync);
  sync();
  return Object.freeze({ dispose, requestVehicleEntry, snapshot, sync, update });
}

export { createUrbanRoomAuthorityRuntime };

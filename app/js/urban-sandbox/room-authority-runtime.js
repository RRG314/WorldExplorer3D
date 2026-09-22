import { ctx as appCtx } from '../shared-context.js?v=55';

function roomIdentity(room) {
  return room ? `${String(room.code || room.id || '')}:${String(room.world?.seed || '')}` : '';
}

function resolveRoomVehicleLease(remote, actorUid, currentTime = Date.now()) {
  const leaseOwnerUid = String(remote?.leaseOwnerUid || '');
  const leaseActive = !!leaseOwnerUid && Number(remote?.leaseExpiresMs || 0) > Number(currentTime || 0);
  return Object.freeze({
    occupiedByOther: leaseActive && leaseOwnerUid !== String(actorUid || ''),
    leaseOwnerUid: leaseActive ? leaseOwnerUid : ''
  });
}

// Lease liveness follows wall time, not animation progress. A slow entry or
// paused rendering must not consume the server lease before a pose is sent.
function createVehicleLeaseHeartbeat(options) {
  let timer = null;
  let generation = 0;
  let inFlight = null;
  const schedule = options.setInterval || globalThis.setInterval;
  const unschedule = options.clearInterval || globalThis.clearInterval;
  function stop() {
    generation += 1;
    if (timer !== null) unschedule(timer);
    timer = null;
    inFlight = null;
  }
  async function tick() {
    if (timer === null || inFlight) return;
    const lease = options.getLease();
    if (!lease) { stop(); return; }
    const run = { generation, lease };
    inFlight = run;
    const stillCurrent = () => {
      const current = options.getLease();
      return timer !== null && generation === run.generation &&
        current?.authority === lease.authority && current?.vehicle === lease.vehicle;
    };
    try {
      const result = await lease.authority.updateVehicle(lease.vehicle, options.vehiclePose(lease.vehicle));
      if (stillCurrent() && result?.accepted === false) {
        stop();
        options.onRejected(lease.vehicle, result);
      }
    } catch (error) {
      if (stillCurrent()) options.onError?.(error);
    } finally {
      if (inFlight === run) inFlight = null;
    }
  }
  function start() {
    stop();
    timer = schedule(() => { void tick(); }, 1000);
    void tick();
  }
  return Object.freeze({ start, stop, tick });
}

function createUrbanRoomAuthorityRuntime(options = {}) {
  const state = options.state;
  let disposed = false;
  let roomKey = '';
  let syncGeneration = 0;
  let pendingVehicleId = '';
  let impactPending = false;
  let leaseSweepElapsed = 0;

  const active = () => !disposed && options.isActive();
  const currentRoom = () => appCtx.getCurrentMultiplayerRoom?.() || null;
  const leasedVehicle = () => state.transition?.vehicle || state.activeVehicle;
  function revokeVehicleControl(vehicle) {
    options.cancelVehicleEntry?.(vehicle);
    if (state.activeVehicle === vehicle) {
      appCtx.car.speed = 0;
      appCtx.car.vFwd = 0;
      appCtx.car.vLat = 0;
      options.beginExit();
    }
  }
  const heartbeat = createVehicleLeaseHeartbeat({
    getLease: () => active() && state.authority && leasedVehicle()
      ? { authority: state.authority, vehicle: leasedVehicle() } : null,
    vehiclePose: options.vehiclePose,
    onRejected(vehicle) {
      revokeVehicleControl(vehicle);
      options.setStatus('This room vehicle lease ended. Control was released safely.', 2600);
    },
    onError: () => options.setStatus('Vehicle synchronization is reconnecting.', 1600)
  });

  function applyEntities(entities = []) {
    if (!active()) return;
    state.remoteEntities = new Map(entities.map((entity) => [entity.entityId, entity]));
    const currentTime = Date.now();
    for (const vehicle of state.vehicles) {
      const remote = state.remoteEntities.get(vehicle.id);
      if (!remote || remote.kind !== 'vehicle') {
        vehicle.roomOccupiedByOther = false;
        vehicle.roomLeaseOwnerUid = '';
        if (!vehicle.attachedToPlayer) vehicle.visual.root.visible = true;
        continue;
      }
      vehicle.condition = remote.condition;
      vehicle.visual.setCondition(remote.condition);
      const lease = resolveRoomVehicleLease(remote, state.authority?.actorUid, currentTime);
      const occupiedByOther = lease.occupiedByOther;
      vehicle.roomOccupiedByOther = occupiedByOther;
      vehicle.roomLeaseOwnerUid = lease.leaseOwnerUid;
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
    heartbeat.stop();
    pendingVehicleId = '';
    const previousVehicle = leasedVehicle();
    if (previousVehicle && state.authority) {
      state.authority.releaseVehicle(previousVehicle, options.vehiclePose(previousVehicle)).catch(() => {});
    }
    if (room && previousVehicle) revokeVehicleControl(previousVehicle);
    state.authority?.dispose?.();
    state.authority = null;
    roomKey = nextKey;
    state.remoteEntities.clear();
    if (!room) return null;
    try {
      const { createUrbanRoomAuthority } = await import('../multiplayer/urban-sandbox.js?v=3');
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
    const authority = state.authority;
    const generation = syncGeneration;
    authority.claimVehicle(vehicle, options.vehiclePose(vehicle)).then((result) => {
      if (!active() || generation !== syncGeneration || state.authority !== authority || pendingVehicleId !== vehicle.id) return;
      pendingVehicleId = '';
      if (!result?.accepted) {
        options.setStatus(result?.reason === 'occupied' ? 'Another player is using this vehicle.' : 'The room did not authorize this vehicle.', 2400);
        return;
      }
      vehicle.roomLeaseOwnerUid = authority.actorUid;
      vehicle.roomOccupiedByOther = false;
      if (options.enterVehicle(vehicle) === false) {
        authority.releaseVehicle(vehicle, options.vehiclePose(vehicle)).catch(() => {});
        return;
      }
      heartbeat.start();
    }).catch((error) => {
      if (!active() || generation !== syncGeneration || state.authority !== authority || pendingVehicleId !== vehicle.id) return;
      pendingVehicleId = '';
      options.setStatus(String(error?.message || 'Vehicle authority is unavailable.'), 2800);
    });
    return true;
  }

  function update(dt) {
    leaseSweepElapsed += Math.max(0, Number(dt) || 0);
    if (leaseSweepElapsed >= .5) {
      leaseSweepElapsed = 0;
      const currentTime = Date.now();
      for (const vehicle of state.vehicles) {
        const remote = state.remoteEntities.get(vehicle.id);
        if (!remote || remote.kind !== 'vehicle') {
          vehicle.roomOccupiedByOther = false;
          vehicle.roomLeaseOwnerUid = '';
          if (!vehicle.attachedToPlayer) vehicle.visual.root.visible = true;
          continue;
        }
        const lease = resolveRoomVehicleLease(remote, state.authority?.actorUid, currentTime);
        vehicle.roomOccupiedByOther = lease.occupiedByOther;
        vehicle.roomLeaseOwnerUid = lease.leaseOwnerUid;
        vehicle.visual.root.visible = !lease.occupiedByOther || vehicle.attachedToPlayer;
      }
    }
    impactPending = state.authorityImpactPending === true;
    if (state.activeVehicle?.attachedToPlayer) {
      options.syncVehiclePose(state.activeVehicle, options.vehiclePose(state.activeVehicle));
    }
  }

  function snapshot() {
    const civic = state.authority?.civicSnapshot?.() || null;
    return Object.freeze({
      mode: state.authority ? 'room' : currentRoom() ? 'room_locked' : 'local',
      roomCode: state.authority?.roomCode || '',
      actorUid: state.authority?.actorUid || '',
      pendingVehicleId,
      impactPending,
      synchronizedEntities: state.remoteEntities?.size || 0,
      civicEventId: civic?.lastEvent?.id || '',
      civicShared: civic?.shared === true
    });
  }

  function civicSnapshot() {
    return state.authority?.civicSnapshot?.() || null;
  }

  function reportCivicEvent(event, witnesses) {
    if (!currentRoom()) return Promise.resolve({ accepted: false, reason: 'local_session' });
    if (!state.authority) {
      sync();
      return Promise.resolve({ accepted: false, reason: 'authority_connecting' });
    }
    return state.authority.reportCivicEvent(event, witnesses);
  }

  function resolveCivicOutcome() {
    if (!state.authority) return Promise.resolve({ accepted: false, reason: 'authority_connecting' });
    return state.authority.resolveCivicOutcome();
  }

  function dispose() {
    if (disposed) return false;
    heartbeat.stop();
    const vehicle = leasedVehicle();
    if (vehicle && state.authority) {
      state.authority.releaseVehicle(vehicle, options.vehiclePose(vehicle)).catch(() => {});
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
  return Object.freeze({ civicSnapshot, dispose, reportCivicEvent, requestVehicleEntry, resolveCivicOutcome, snapshot, sync, update });
}

export { createUrbanRoomAuthorityRuntime, createVehicleLeaseHeartbeat, resolveRoomVehicleLease };

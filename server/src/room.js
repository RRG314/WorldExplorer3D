import { Room } from '@colyseus/core';
import {
  COMMAND_TYPES,
  DURABLE_COMMANDS,
  roleHasCapability,
  CAPABILITIES,
  worldAtLocalOffset,
  worldCellKey
} from '@we3d/mmo-contracts';
import {
  MODERATION_COMMANDS,
  ROLE_RANK,
  RoomCommandProcessor
} from './authority/command-processor.js';
import { WorldInterestManager } from './interest-manager.js';
import { AuthoritativeGamePlatform } from './game/platform.js';
import { PlayerState, createWorldRoomState } from './state.js';

const SIMULATION_HZ = 20;
const RECONNECT_SECONDS = 20;
const PLAYER_SNAPSHOT_VERSION = 1;
const MODE_SPEEDS = Object.freeze({
  walk: 6,
  car: 42,
  boat: 24,
  drone: 28,
  plane: 90,
  rover: 16
});
const VEHICLE_HANDLING = Object.freeze({
  'vehicle.compact': { mode: 'car', maxForward: 42, maxReverse: 12, acceleration: 18, drag: 5, turnRate: 1.7 },
  'vehicle.boat': { mode: 'boat', maxForward: 24, maxReverse: 7, acceleration: 7, drag: 2, turnRate: 0.8 },
  'vehicle.rover': { mode: 'rover', maxForward: 16, maxReverse: 6, acceleration: 8, drag: 4, turnRate: 1.2 }
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value)));
}

function errorPayload(error, commandId = '') {
  return {
    ok: false,
    commandId: String(commandId || ''),
    code: String(error?.code || 'command_failed'),
    message: String(error?.message || 'Command failed.').slice(0, 240),
    retryAfterMs: Math.max(0, Number(error?.retryAfterMs) || 0)
  };
}

function createPlayer(identity, role) {
  const player = new PlayerState();
  player.uid = identity.uid;
  player.displayName = identity.displayName;
  player.role = role;
  player.mode = 'walk';
  player.x = 0;
  player.y = 0;
  player.z = 0;
  player.yaw = 0;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.inputX = 0;
  player.inputZ = 0;
  player.inputSequence = 0;
  player.vehicleId = '';
  player.connected = true;
  return player;
}

function restorePlayer(player, snapshot) {
  if (!snapshot || Number(snapshot.version) !== PLAYER_SNAPSHOT_VERSION) return player;
  player.mode = 'walk';
  player.x = finite(snapshot.position?.x);
  player.y = finite(snapshot.position?.y);
  player.z = finite(snapshot.position?.z);
  player.yaw = finite(snapshot.yaw);
  return player;
}

function playerSnapshot(player, roomRevision) {
  return {
    version: PLAYER_SNAPSHOT_VERSION,
    roomRevision: Math.max(0, Number(roomRevision) || 0),
    mode: 'walk',
    position: {
      x: finite(player.x),
      y: finite(player.y),
      z: finite(player.z)
    },
    yaw: finite(player.yaw),
    savedAtMs: Date.now()
  };
}

class WorldRoom extends Room {
  async onCreate(options) {
    this.store = options.store;
    this.verifyIdentity = options.verifyIdentity;
    this.commandProcessor = new RoomCommandProcessor({
      store: this.store,
      assetCatalog: options.assetCatalog,
      inventoryPolicy: options.inventoryPolicy
    });
    this.inventoryPolicy = options.inventoryPolicy;
    this.manifest = await this.store.loadRoom(options.roomKey);
    if (!this.manifest) throw Object.assign(new Error('Room does not exist.'), { code: 'room_not_found' });

    this.maxClients = this.manifest.budget.maxPlayers;
    this.maxMessagesPerSecond = this.manifest.budget.maxCommandsPerSecond + 10;
    this.patchRate = 50;
    this.autoDispose = true;
    this.state = createWorldRoomState(this.manifest);
    this.interest = new WorldInterestManager({
      roomId: this.manifest.id,
      world: this.manifest.world,
      radius: this.manifest.budget.interestRadiusCells,
      store: this.store,
      state: this.state
    });
    this.game = new AuthoritativeGamePlatform({
      state: this.state,
      store: this.store,
      manifest: this.manifest,
      emit: (event) => this.broadcast('game.event', event),
      cellKeyForPosition: (position) => worldCellKey(this.interest.worldForPlayer(position)),
      onProjectileAdded: (projectile) => this.interest.addTransient(projectile),
      onProjectileMoved: (projectile) => this.interest.moveTransient(projectile),
      onProjectileRemoved: (projectile) => this.interest.removeTransient(projectile)
    });
    this.snapshotIntervalMs = this.manifest.budget.recoverySnapshotIntervalSec * 1000;
    this.snapshotElapsedMs = 0;
    this.snapshotDirty = new Set();
    this.vehicleSnapshotDirty = new Set();

    this.onMessage('command', (client, rawCommand) => {
      this.handleCommand(client, rawCommand).catch((error) => {
        client.send('command.result', errorPayload(error, rawCommand?.commandId));
      });
    });
    this.onMessage('input', (client, rawCommand) => {
      this.handleInput(client, rawCommand).catch((error) => {
        client.send('input.error', errorPayload(error, rawCommand?.commandId));
      });
    });
    this.onMessage('inventory.get', (client) => {
      this.sendInventory(client).catch((error) => client.send('inventory.error', errorPayload(error)));
    });
    this.onMessage('progression.get', (client) => {
      client.send('progression.snapshot', this.game.snapshot(client.userData?.uid));
    });
    this.onMessage('platform.get', (client) => {
      client.send('platform.catalog', this.game.catalog(client.userData?.uid));
    });
    this.onMessage('leaderboard.get', (client) => {
      this.game.leaderboard().then(
        (rows) => client.send('leaderboard.snapshot', rows),
        (error) => client.send('leaderboard.error', errorPayload(error))
      );
    });
    this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), 1000 / SIMULATION_HZ);
    await this.setMetadata({ roomKey: this.manifest.id, worldKind: this.manifest.world.kind });
  }

  async onAuth(_client, _options, context) {
    const identity = await this.verifyIdentity(context.token);
    if (await this.store.isBanned(this.manifest.id, identity.uid)) {
      throw Object.assign(new Error('This account is banned from the room.'), { code: 'room_banned' });
    }
    const role = await this.store.loadActorRole(this.manifest.id, identity.uid);
    if (!role || !roleHasCapability(role, CAPABILITIES.ENTER)) {
      throw Object.assign(new Error('This account cannot enter the room.'), { code: 'permission_denied' });
    }
    return { identity, role };
  }

  async onJoin(client) {
    const { identity, role } = client.auth;
    const existing = this.state.players.get(identity.uid);
    const player = existing || restorePlayer(
      createPlayer(identity, role),
      await this.store.loadPlayerSnapshot(this.manifest.id, identity.uid)
    );
    player.uid = identity.uid;
    player.displayName = identity.displayName;
    player.role = role;
    player.mode = player.mode || 'walk';
    player.vehicleId = player.vehicleId || '';
    player.connected = true;
    await this.game.addPlayer(player);
    this.state.players.set(identity.uid, player);
    client.userData = { uid: identity.uid, role };
    await this.interest.addClient(client, player);
  }

  async sendInventory(client) {
    const uid = client.userData?.uid;
    const role = client.userData?.role;
    if (!uid || !role) return;
    client.send('inventory.snapshot', await this.store.loadInventory(
      this.manifest.id,
      uid,
      this.inventoryPolicy.initialForRole(role)
    ));
  }

  async onDrop(client) {
    if (client.userData?.forcedLeave) {
      await this.removePlayer(client);
      return;
    }
    const player = this.state.players.get(client.userData?.uid);
    if (player) player.connected = false;
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  onReconnect(client) {
    const player = this.state.players.get(client.userData?.uid);
    if (player) player.connected = true;
  }

  async onLeave(client) {
    await this.removePlayer(client);
  }

  async removePlayer(client) {
    if (client.userData?.removed) return;
    if (client.userData) client.userData.removed = true;
    const uid = client.userData?.uid;
    const player = this.state.players.get(uid);
    if (player?.vehicleId) await this.exitVehicle(player);
    if (uid && player) await this.persistPlayer(player);
    if (uid && player) await this.game.removePlayer(player);
    if (uid) this.state.players.delete(uid);
    if (uid) this.commandProcessor.rateLimiter.clearPrefix(`${this.manifest.id}:${uid}:`);
    await this.interest.removeClient(client);
  }

  async onDispose() {
    const activePlayers = Array.from(this.state.players.values());
    const players = activePlayers.flatMap((player) => [
      this.persistPlayer(player),
      this.game.savePlayer(player.uid)
    ]);
    const vehicles = Array.from(this.vehicleSnapshotDirty)
      .map((id) => this.state.vehicles.get(id))
      .filter(Boolean)
      .map((vehicle) => this.persistVehicle(vehicle));
    await Promise.allSettled([...players, ...vehicles]);
  }

  persistPlayer(player) {
    this.snapshotDirty.delete(player.uid);
    return this.store.savePlayerSnapshot(
      this.manifest.id,
      player.uid,
      playerSnapshot(player, this.state.revision)
    );
  }

  flushDirtySnapshots() {
    const dirty = Array.from(this.snapshotDirty);
    this.snapshotDirty.clear();
    for (const uid of dirty) {
      const player = this.state.players.get(uid);
      if (!player) continue;
      this.persistPlayer(player).catch(() => this.snapshotDirty.add(uid));
    }
    const vehicleIds = Array.from(this.vehicleSnapshotDirty);
    this.vehicleSnapshotDirty.clear();
    for (const vehicleId of vehicleIds) {
      const vehicle = this.state.vehicles.get(vehicleId);
      if (!vehicle) continue;
      this.persistVehicle(vehicle).catch(() => this.vehicleSnapshotDirty.add(vehicleId));
    }
  }

  persistVehicle(vehicle) {
    this.vehicleSnapshotDirty.delete(vehicle.id);
    return this.store.saveVehicleSnapshot(this.manifest.id, vehicle.id, {
      cellKey: vehicle.cellKey,
      position: { x: finite(vehicle.x), y: finite(vehicle.y), z: finite(vehicle.z) },
      rotation: { x: 0, y: finite(vehicle.yaw), z: 0 }
    });
  }

  prepareCommand(client, player, rawCommand) {
    if (!DURABLE_COMMANDS.has(rawCommand?.type) || MODERATION_COMMANDS.has(rawCommand?.type)) return rawCommand;
    let cellKey = String(rawCommand?.cellKey || '');
    const positioned = rawCommand.type === COMMAND_TYPES.PLACE_OBJECT || rawCommand.type === COMMAND_TYPES.SPAWN_VEHICLE;
    if (positioned) {
      const position = rawCommand.position && typeof rawCommand.position === 'object' ? rawCommand.position : {};
      const distance = Math.hypot(
        finite(position.x) - player.x,
        finite(position.y) - player.y,
        finite(position.z) - player.z
      );
      const reach = rawCommand.type === COMMAND_TYPES.PLACE_OBJECT ? 64 : 32;
      if (distance > reach) {
        throw Object.assign(new Error('The requested placement is outside player reach.'), { code: 'out_of_range' });
      }
      const positionCell = worldCellKey(worldAtLocalOffset(
        this.manifest.world,
        finite(position.x),
        finite(position.z)
      ));
      if (cellKey && cellKey !== positionCell) {
        throw Object.assign(new Error('Placement coordinates do not match the requested world cell.'), { code: 'cell_mismatch' });
      }
      cellKey = positionCell;
    }
    if (rawCommand.type === COMMAND_TYPES.REMOVE_OBJECT && rawCommand.targetId) {
      cellKey = this.state.objects.get(rawCommand.targetId)?.cellKey || cellKey;
    } else if (rawCommand.type === COMMAND_TYPES.RESTORE_BASE && rawCommand.targetId) {
      for (const suppression of this.state.suppressions.values()) {
        if (suppression.sourceId === rawCommand.targetId) cellKey = suppression.cellKey;
      }
    }
    if (!cellKey) cellKey = worldCellKey(this.interest.worldForPlayer(player));
    if (!this.interest.isCellActive(client, cellKey)) {
      throw Object.assign(new Error('Durable changes are limited to the player active area.'), {
        code: 'outside_interest'
      });
    }
    return { ...rawCommand, cellKey };
  }

  async handleCommand(client, rawCommand) {
    const uid = client.userData?.uid;
    const player = this.state.players.get(uid);
    if (!player) throw Object.assign(new Error('Player is not active in this room.'), { code: 'not_joined' });
    const preparedCommand = this.prepareCommand(client, player, rawCommand);
    const result = await this.commandProcessor.process({
      manifest: { ...this.manifest, revision: this.state.revision },
      actor: { uid, role: client.userData.role },
      rawCommand: preparedCommand
    });

    if (result.transient) Object.assign(result, await this.applyTransientCommand(player, result.command) || {});
    else if (result.patch) {
      this.interest.applyPatch(result.patch);
      this.state.revision = result.revision;
      this.manifest.revision = result.revision;
      if (preparedCommand.type === COMMAND_TYPES.PLACE_OBJECT && !result.duplicate) {
        this.game.recordObjectPlaced(uid);
        client.send('progression.snapshot', this.game.snapshot(uid));
      }
    } else if (result.moderation) {
      this.state.revision = result.revision;
      this.manifest.revision = result.revision;
      if (result.moderation.banned) {
        this.disconnectTarget(result.moderation.targetUid, 'Banned by a room moderator.', null, false);
      }
    }
    client.send('command.result', result);
  }

  async handleInput(client, rawCommand) {
    const uid = client.userData?.uid;
    const player = this.state.players.get(uid);
    if (!player) throw Object.assign(new Error('Player is not active in this room.'), { code: 'not_joined' });
    const result = await this.commandProcessor.process({
      manifest: { ...this.manifest, revision: this.state.revision },
      actor: { uid, role: client.userData.role },
      rawCommand
    });
    if (!result.transient || result.command.type !== COMMAND_TYPES.INPUT) {
      throw Object.assign(new Error('Only player input is accepted on this channel.'), { code: 'invalid_command' });
    }
    this.applyInput(player, result.command);
  }

  applyInput(player, command) {
    const payload = command.payload;
    const sequence = Math.max(0, Math.floor(finite(payload.sequence)));
    if (sequence <= player.inputSequence) return;
    player.inputSequence = sequence;
    this.snapshotDirty.add(player.uid);
    player.inputX = clamp(payload.x, -1, 1);
    player.inputZ = clamp(payload.z, -1, 1);
    player.yaw = finite(payload.yaw, player.yaw);
    if (!player.vehicleId) player.mode = 'walk';
  }

  async applyTransientCommand(player, command) {
    if (command.type === COMMAND_TYPES.INPUT) {
      this.applyInput(player, command);
      return;
    }
    if (command.type === COMMAND_TYPES.ENTER_VEHICLE) {
      return { interaction: this.enterVehicle(player, command.targetId) };
    }
    if (command.type === COMMAND_TYPES.EXIT_VEHICLE) {
      return { interaction: await this.exitVehicle(player) };
    }
    if (command.type === COMMAND_TYPES.INTERACT) {
      return { interaction: await this.interact(player, command.targetId) };
    }
    if (command.type === COMMAND_TYPES.KICK_PLAYER) {
      this.disconnectTarget(command.targetId, 'Removed by a room moderator.', player);
      return;
    }
    const gameResult = this.game.execute(player, command);
    if (gameResult) return { ...gameResult, progression: this.game.snapshot(player.uid) };
    throw Object.assign(new Error('This realtime command is not implemented.'), { code: 'not_implemented' });
  }

  disconnectTarget(targetUid, reason, actor = null, required = true) {
    const target = this.clients.find((client) => client.userData?.uid === targetUid);
    if (!target) {
      if (required) throw Object.assign(new Error('Target player is not connected.'), { code: 'not_found' });
      return false;
    }
    if (actor && ROLE_RANK[actor.role] <= ROLE_RANK[target.userData?.role]) {
      throw Object.assign(new Error('Moderators can only target lower-ranked room members.'), { code: 'permission_denied' });
    }
    target.userData.forcedLeave = true;
    target.leave(4001, reason);
    return true;
  }

  enterVehicle(player, vehicleId) {
    if (player.vehicleId) throw Object.assign(new Error('Exit the current vehicle first.'), { code: 'already_in_vehicle' });
    const vehicle = this.state.vehicles.get(String(vehicleId || ''));
    if (!vehicle) throw Object.assign(new Error('Vehicle was not found in the active area.'), { code: 'not_found' });
    if (vehicle.driverUid) throw Object.assign(new Error('Vehicle already has a driver.'), { code: 'vehicle_occupied' });
    const distance = Math.hypot(vehicle.x - player.x, vehicle.y - player.y, vehicle.z - player.z);
    if (distance > 12) throw Object.assign(new Error('Move closer to enter this vehicle.'), { code: 'out_of_range' });
    const handling = VEHICLE_HANDLING[vehicle.assetId];
    if (!handling) throw Object.assign(new Error('Vehicle handling is unavailable.'), { code: 'invalid_vehicle' });
    vehicle.driverUid = player.uid;
    player.vehicleId = vehicle.id;
    player.mode = handling.mode;
    player.x = vehicle.x;
    player.y = vehicle.y;
    player.z = vehicle.z;
    player.yaw = vehicle.yaw;
    this.snapshotDirty.add(player.uid);
    return { kind: 'vehicle', action: 'entered', targetId: vehicle.id, assetId: vehicle.assetId };
  }

  async exitVehicle(player) {
    const vehicleId = player.vehicleId;
    const vehicle = this.state.vehicles.get(player.vehicleId);
    if (!vehicle || vehicle.driverUid !== player.uid) {
      player.vehicleId = '';
      player.mode = 'walk';
      return { kind: 'vehicle', action: 'exited', targetId: vehicleId };
    }
    vehicle.driverUid = '';
    player.x = vehicle.x + Math.cos(vehicle.yaw) * 2.5;
    player.y = vehicle.y;
    player.z = vehicle.z - Math.sin(vehicle.yaw) * 2.5;
    player.vehicleId = '';
    player.mode = 'walk';
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    this.snapshotDirty.add(player.uid);
    await this.persistVehicle(vehicle);
    return { kind: 'vehicle', action: 'exited', targetId: vehicle.id, assetId: vehicle.assetId };
  }

  async interact(player, targetId = '') {
    if (player.vehicleId) return this.exitVehicle(player);
    if (!roleHasCapability(player.role, CAPABILITIES.DRIVE)) {
      throw Object.assign(new Error('This room role cannot drive vehicles.'), { code: 'permission_denied' });
    }
    let vehicle = targetId ? this.state.vehicles.get(String(targetId)) : null;
    if (!vehicle) {
      vehicle = Array.from(this.state.vehicles.values())
        .filter((entry) => !entry.driverUid)
        .map((entry) => ({
          entry,
          distance: Math.hypot(entry.x - player.x, entry.y - player.y, entry.z - player.z)
        }))
        .filter(({ distance }) => distance <= 12)
        .sort((a, b) => a.distance - b.distance || a.entry.id.localeCompare(b.entry.id))[0]?.entry || null;
    }
    if (!vehicle) {
      throw Object.assign(new Error('No available vehicle is within reach.'), { code: 'not_found' });
    }
    return this.enterVehicle(player, vehicle.id);
  }

  simulateVehicle(vehicle, player, dt) {
    const handling = VEHICLE_HANDLING[vehicle.assetId];
    if (!handling) {
      vehicle.driverUid = '';
      player.vehicleId = '';
      player.mode = 'walk';
      return;
    }
    const forwardX = Math.sin(vehicle.yaw);
    const forwardZ = Math.cos(vehicle.yaw);
    let speed = vehicle.vx * forwardX + vehicle.vz * forwardZ;
    const throttle = clamp(player.inputZ, -1, 1);
    const targetSpeed = throttle >= 0
      ? throttle * handling.maxForward
      : throttle * handling.maxReverse;
    const response = throttle === 0 ? handling.drag : handling.acceleration;
    const delta = clamp(targetSpeed - speed, -response * dt, response * dt);
    speed += delta;
    if (Math.abs(speed) < 0.02 && throttle === 0) speed = 0;
    const steeringScale = clamp(Math.abs(speed) / 6, 0.2, 1);
    const direction = speed < 0 ? -1 : 1;
    vehicle.yaw += clamp(player.inputX, -1, 1) * handling.turnRate * steeringScale * direction * dt;
    vehicle.vx = Math.sin(vehicle.yaw) * speed;
    vehicle.vz = Math.cos(vehicle.yaw) * speed;
    vehicle.x += vehicle.vx * dt;
    vehicle.z += vehicle.vz * dt;
    this.vehicleSnapshotDirty.add(vehicle.id);
    player.x = vehicle.x;
    player.y = vehicle.y;
    player.z = vehicle.z;
    player.yaw = vehicle.yaw;
    player.vx = vehicle.vx;
    player.vy = vehicle.vy;
    player.vz = vehicle.vz;
    const nextCell = worldCellKey(this.interest.worldForPlayer(vehicle));
    if (nextCell !== vehicle.cellKey) {
      vehicle.cellKey = nextCell;
      this.interest.refreshAllViews();
    }
  }

  simulate(deltaMs) {
    const dt = clamp(deltaMs / 1000, 0, 0.1);
    for (const player of this.state.players.values()) {
      if (!player.connected) continue;
      player.inputX = clamp(player.inputX, -1, 1);
      player.inputZ = clamp(player.inputZ, -1, 1);
      player.vx = finite(player.vx);
      player.vz = finite(player.vz);
      player.x = finite(player.x);
      player.z = finite(player.z);
      const vehicle = player.vehicleId ? this.state.vehicles.get(player.vehicleId) : null;
      if (vehicle && vehicle.driverUid === player.uid) {
        const previousX = player.x;
        const previousZ = player.z;
        this.simulateVehicle(vehicle, player, dt);
        this.game.recordMovement(player, Math.hypot(player.x - previousX, player.z - previousZ), true);
        const client = this.clients.find((candidate) => candidate.userData?.uid === player.uid);
        if (client) this.interest.scheduleClientUpdate(client, player);
        continue;
      }
      if (player.vehicleId) {
        player.vehicleId = '';
        player.mode = 'walk';
      }
      const magnitude = Math.hypot(player.inputX, player.inputZ);
      const inputScale = magnitude > 1 ? 1 / magnitude : 1;
      const speed = MODE_SPEEDS[player.mode] || MODE_SPEEDS.walk;
      const targetVx = player.inputX * inputScale * speed;
      const targetVz = player.inputZ * inputScale * speed;
      const response = Math.min(1, dt * 8);
      player.vx += (targetVx - player.vx) * response;
      player.vz += (targetVz - player.vz) * response;
      const previousX = player.x;
      const previousZ = player.z;
      player.x += player.vx * dt;
      player.z += player.vz * dt;
      this.game.recordMovement(player, Math.hypot(player.x - previousX, player.z - previousZ), false);
      const client = this.clients.find((candidate) => candidate.userData?.uid === player.uid);
      if (client) this.interest.scheduleClientUpdate(client, player);
    }
    this.game.tick(dt);
    this.state.tick = (this.state.tick + 1) >>> 0;
    this.state.serverTimeMs = Date.now();
    this.snapshotElapsedMs += Math.max(0, finite(deltaMs));
    if (this.snapshotElapsedMs >= this.snapshotIntervalMs) {
      this.snapshotElapsedMs %= this.snapshotIntervalMs;
      this.flushDirtySnapshots();
      this.game.flushDirty();
    }
  }
}

export {
  MODE_SPEEDS,
  PLAYER_SNAPSHOT_VERSION,
  RECONNECT_SECONDS,
  SIMULATION_HZ,
  VEHICLE_HANDLING,
  WorldRoom,
  createPlayer,
  errorPayload,
  playerSnapshot,
  restorePlayer
};

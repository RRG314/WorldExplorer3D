import { getCurrentUser } from '../../../js/auth-ui.js';

const COMMAND_TIMEOUT_MS = 8000;
const INPUT_INTERVAL_MS = 40;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const COLYSEUS_SDK_URL = '/app/vendor/colyseus-sdk.js?v=1';
let colyseusSdkPromise = null;

function ensureColyseusSdk() {
  if (globalThis.Colyseus?.Client) return Promise.resolve(globalThis.Colyseus);
  if (colyseusSdkPromise) return colyseusSdkPromise;
  colyseusSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${COLYSEUS_SDK_URL}"]`);
    const script = existing || document.createElement('script');
    const finish = () => {
      if (globalThis.Colyseus?.Client) resolve(globalThis.Colyseus);
      else reject(new Error('Authoritative multiplayer SDK loaded without a Client export.'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => {
      colyseusSdkPromise = null;
      reject(new Error('Authoritative multiplayer SDK failed to load.'));
    }, { once: true });
    if (!existing) {
      script.src = COLYSEUS_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return colyseusSdkPromise;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function configuredEndpoint() {
  const configured = String(globalThis.WORLD_EXPLORER_MMO_ENDPOINT || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  if (!LOCAL_HOSTS.has(globalThis.location?.hostname)) return '';
  const local = new URLSearchParams(globalThis.location?.search || '').get('mmoEndpoint');
  return String(local || '').trim().replace(/\/$/, '');
}

function configuredLocalTestToken() {
  if (!LOCAL_HOSTS.has(globalThis.location?.hostname)) return '';
  const token = new URLSearchParams(globalThis.location?.search || '').get('mmoTestToken');
  return String(token || '').trim().slice(0, 240);
}

function commandId(prefix = 'command') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`.slice(0, 80);
}

function playerSnapshot(player, world = {}) {
  return {
    uid: String(player.uid || ''),
    displayName: String(player.displayName || 'Explorer').slice(0, 48),
    role: String(player.role || 'visitor'),
    mode: String(player.mode || 'walk'),
    vehicleId: String(player.vehicleId || ''),
    connected: player.connected === true,
    health: finite(player.health),
    maxHealth: finite(player.maxHealth),
    level: Math.max(1, finite(player.level, 1)),
    xp: Math.max(0, finite(player.xp)),
    credits: Math.max(0, finite(player.credits)),
    equippedWeapon: String(player.equippedWeapon || 'weapon.sword'),
    activeMissionId: String(player.activeMissionId || ''),
    missionProgress: Math.max(0, finite(player.missionProgress)),
    frame: {
      kind: String(world.kind || 'earth'),
      locLat: finite(world.lat),
      locLon: finite(world.lon)
    },
    pose: {
      x: finite(player.x),
      y: finite(player.y),
      z: finite(player.z),
      yaw: finite(player.yaw),
      pitch: 0,
      vx: finite(player.vx),
      vy: finite(player.vy),
      vz: finite(player.vz)
    }
  };
}

function mapValues(collection, mapper) {
  const values = [];
  collection?.forEach?.((value) => values.push(mapper(value)));
  return values;
}

class AuthoritativeRoomClient {
  constructor(options = {}) {
    this.endpoint = String(options.endpoint || configuredEndpoint()).replace(/\/$/, '');
    this.room = null;
    this.sdk = null;
    this.roomWorld = null;
    this.uid = '';
    this.revision = 0;
    this.inputSequence = 0;
    this.lastInputAt = 0;
    this.pending = new Map();
    this.inventory = {};
    this.progression = null;
    this.leaderboard = [];
    this.catalog = null;
    this.gameEventListeners = new Set();
    this.progressionRequestTimer = null;
    this.leaderboardRequestTimer = null;
    this.catalogRequestTimer = null;
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.releaseRoomListeners = [];
  }

  get enabled() {
    return Boolean(this.endpoint);
  }

  get connected() {
    return Boolean(this.room?.connection?.isOpen);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    if (this.room) listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener) {
    if (typeof listener !== 'function') return () => {};
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  subscribeGameEvents(listener) {
    if (typeof listener !== 'function') return () => {};
    this.gameEventListeners.add(listener);
    return () => this.gameEventListeners.delete(listener);
  }

  publishStatus(status, detail = '') {
    const event = { status, detail: String(detail || ''), at: Date.now() };
    this.statusListeners.forEach((listener) => listener(event));
  }

  publishState() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  applyProgression(profile) {
    if (!profile || typeof profile !== 'object') return false;
    const incomingAt = finite(profile.updatedAtMs);
    const currentAt = finite(this.progression?.updatedAtMs);
    if (this.progression && incomingAt < currentAt) return false;
    this.progression = structuredClone(profile);
    return true;
  }

  requestProgression() {
    if (!this.room || !this.connected || this.progressionRequestTimer) return;
    this.progressionRequestTimer = globalThis.setTimeout(() => {
      this.progressionRequestTimer = null;
      if (this.room && this.connected) this.room.send('progression.get');
    }, 50);
  }

  requestLeaderboard() {
    if (!this.room || !this.connected || this.leaderboardRequestTimer) return;
    this.leaderboardRequestTimer = globalThis.setTimeout(() => {
      this.leaderboardRequestTimer = null;
      if (this.room && this.connected) this.room.send('leaderboard.get');
    }, 80);
  }

  requestCatalog() {
    if (!this.room || !this.connected || this.catalogRequestTimer) return;
    this.catalogRequestTimer = globalThis.setTimeout(() => {
      this.catalogRequestTimer = null;
      if (this.room && this.connected) this.room.send('platform.get');
    }, 80);
  }

  snapshot() {
    const state = this.room?.state;
    return {
      connected: this.connected,
      selfUid: this.uid,
      roomId: String(state?.roomId || ''),
      revision: Math.max(this.revision, finite(state?.revision)),
      worldKind: String(state?.worldKind || this.roomWorld?.kind || 'earth'),
      bodyId: String(state?.bodyId || this.roomWorld?.bodyId || ''),
      worldProfile: {
        gravityMps2: finite(state?.gravityMps2),
        radiusMeters: finite(state?.radiusMeters),
        atmosphereRelative: finite(state?.atmosphereRelative),
        dayLengthSeconds: finite(state?.dayLengthSeconds),
        terrainSource: String(state?.terrainSource || '')
      },
      tick: Math.max(0, finite(state?.tick)),
      serverTimeMs: finite(state?.serverTimeMs),
      inventory: { ...this.inventory },
      progression: this.progression ? structuredClone(this.progression) : null,
      leaderboard: this.leaderboard.map((row) => ({ ...row })),
      catalog: this.catalog ? structuredClone(this.catalog) : null,
      players: mapValues(state?.players, (player) => playerSnapshot(player, this.roomWorld)),
      objects: mapValues(state?.objects, (object) => ({
        id: String(object.id || ''),
        assetId: String(object.assetId || ''),
        cellKey: String(object.cellKey || ''),
        ownerUid: String(object.ownerUid || ''),
        shape: String(object.shape || 'cube'),
        color: String(object.color || 'red'),
        position: { x: finite(object.x), y: finite(object.y), z: finite(object.z) },
        rotation: { x: finite(object.rx), y: finite(object.ry), z: finite(object.rz) },
        revision: finite(object.revision)
      })),
      vehicles: mapValues(state?.vehicles, (vehicle) => ({
        id: String(vehicle.id || ''),
        assetId: String(vehicle.assetId || ''),
        cellKey: String(vehicle.cellKey || ''),
        ownerUid: String(vehicle.ownerUid || ''),
        driverUid: String(vehicle.driverUid || ''),
        position: { x: finite(vehicle.x), y: finite(vehicle.y), z: finite(vehicle.z) },
        yaw: finite(vehicle.yaw),
        velocity: { x: finite(vehicle.vx), y: finite(vehicle.vy), z: finite(vehicle.vz) },
        revision: finite(vehicle.revision)
      })),
      suppressions: mapValues(state?.suppressions, (entry) => ({
        id: String(entry.id || ''),
        sourceId: String(entry.sourceId || ''),
        cellKey: String(entry.cellKey || ''),
        actorUid: String(entry.actorUid || ''),
        revision: finite(entry.revision)
      })),
      claims: mapValues(state?.claims, (claim) => ({
        id: String(claim.id || ''),
        cellKey: String(claim.cellKey || ''),
        ownerUid: String(claim.ownerUid || ''),
        access: String(claim.access || 'private'),
        revision: finite(claim.revision)
      })),
      projectiles: mapValues(state?.projectiles, (projectile) => ({
        id: String(projectile.id || ''),
        weaponId: String(projectile.weaponId || ''),
        ownerUid: String(projectile.ownerUid || ''),
        cellKey: String(projectile.cellKey || ''),
        position: { x: finite(projectile.x), y: finite(projectile.y), z: finite(projectile.z) },
        velocity: { x: finite(projectile.vx), y: finite(projectile.vy), z: finite(projectile.vz) },
        ttl: Math.max(0, finite(projectile.ttl))
      }))
    };
  }

  async connect(roomLike) {
    if (!this.enabled) return false;
    const roomKey = String(roomLike?.code || roomLike?.id || '').trim().toUpperCase();
    if (!roomKey) throw new Error('A room code is required.');
    const user = getCurrentUser();
    const localTestToken = configuredLocalTestToken();
    if ((!user?.uid || typeof user.getIdToken !== 'function') && !localTestToken) {
      throw new Error('Sign in is required for authoritative multiplayer.');
    }

    await this.disconnect();
    await ensureColyseusSdk();
    this.uid = String(user?.uid || (localTestToken.startsWith('test:') ? localTestToken.split(':')[1] : ''));
    this.roomWorld = { ...(roomLike.world || {}) };
    this.sdk = new globalThis.Colyseus.Client(this.endpoint);
    this.sdk.auth.token = localTestToken || await user.getIdToken();
    this.publishStatus('connecting', roomKey);
    this.room = await this.sdk.joinOrCreate('world', { roomKey });
    this.revision = finite(this.room.state?.revision);
    this.releaseRoomListeners = [
      this.room.onStateChange(() => {
        this.revision = Math.max(this.revision, finite(this.room?.state?.revision));
        this.publishState();
      }),
      this.room.onDrop((_code, reason) => this.publishStatus('reconnecting', reason)),
      this.room.onReconnect(() => this.publishStatus('connected', 'reconnected')),
      this.room.onLeave((_code, reason) => {
        this.rejectPending(new Error(reason || 'Authoritative room connection closed.'));
        this.publishStatus('disconnected', reason);
      }),
      this.room.onMessage('command.result', (result) => this.resolveCommand(result)),
      this.room.onMessage('inventory.snapshot', (inventory) => {
        this.inventory = { ...(inventory || {}) };
        this.publishState();
      }),
      this.room.onMessage('progression.snapshot', (profile) => {
        if (this.applyProgression(profile)) this.publishState();
      }),
      this.room.onMessage('leaderboard.snapshot', (rows) => {
        this.leaderboard = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
        this.publishState();
      }),
      this.room.onMessage('platform.catalog', (catalog) => {
        this.catalog = catalog && typeof catalog === 'object' ? structuredClone(catalog) : null;
        this.publishState();
      }),
      this.room.onMessage('game.event', (event) => {
        this.gameEventListeners.forEach((listener) => listener(structuredClone(event || {})));
        const type = String(event?.type || '');
        if (type.startsWith('mission.') || type.startsWith('progression.')) {
          this.requestProgression();
          this.requestLeaderboard();
          this.requestCatalog();
        }
      })
    ].filter((release) => typeof release === 'function');
    this.room.send('inventory.get');
    this.room.send('progression.get');
    this.room.send('leaderboard.get');
    this.room.send('platform.get');
    if (!this.room.state?.players) {
      await Promise.race([
        new Promise((resolve) => this.room.onStateChange.once(resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Authoritative room state timed out.')), COMMAND_TIMEOUT_MS))
      ]);
    }
    this.publishStatus('connected', roomKey);
    this.publishState();
    return true;
  }

  resolveCommand(result = {}) {
    const id = String(result.commandId || '');
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    if (result.ok === false) {
      const error = new Error(String(result.message || 'Room command failed.'));
      error.code = String(result.code || 'command_failed');
      error.retryAfterMs = finite(result.retryAfterMs);
      pending.reject(error);
      return;
    }
    this.revision = Math.max(this.revision, finite(result.revision));
    if (result.inventory && typeof result.inventory === 'object') {
      this.inventory = { ...result.inventory };
    }
    if (result.progression && typeof result.progression === 'object') {
      this.applyProgression(result.progression);
    }
    pending.resolve(result);
  }

  rejectPending(error) {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timeout);
      entry.reject(error);
    });
    this.pending.clear();
  }

  send(type, values = {}) {
    if (!this.room || !this.connected) return Promise.reject(new Error('Authoritative room is not connected.'));
    const id = String(values.commandId || commandId(type.split('.').pop())).slice(0, 80);
    const payload = {
      ...values,
      type,
      commandId: id,
      expectedRevision: Number.isFinite(values.expectedRevision) ? values.expectedRevision : this.revision,
      world: values.world || this.roomWorld || { kind: 'earth' }
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Authoritative room command timed out.'));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      this.room.send('command', payload);
    });
  }

  sendInput(input = {}) {
    if (!this.room || !this.connected) return false;
    const now = Date.now();
    if (now - this.lastInputAt < INPUT_INTERVAL_MS) return false;
    this.lastInputAt = now;
    this.inputSequence += 1;
    this.room.send('input', {
      type: 'player.input',
      commandId: commandId('input'),
      expectedRevision: this.revision,
      world: this.roomWorld || { kind: 'earth' },
      payload: {
        sequence: this.inputSequence,
        x: finite(input.x),
        z: finite(input.z),
        yaw: finite(input.yaw),
        mode: String(input.mode || 'walk')
      }
    });
    return true;
  }

  async disconnect() {
    const room = this.room;
    this.room = null;
    this.uid = '';
    this.releaseRoomListeners.splice(0).forEach((release) => release());
    this.rejectPending(new Error('Authoritative room disconnected.'));
    if (room) await room.leave().catch(() => {});
    if (this.progressionRequestTimer) globalThis.clearTimeout(this.progressionRequestTimer);
    this.progressionRequestTimer = null;
    if (this.leaderboardRequestTimer) globalThis.clearTimeout(this.leaderboardRequestTimer);
    this.leaderboardRequestTimer = null;
    if (this.catalogRequestTimer) globalThis.clearTimeout(this.catalogRequestTimer);
    this.catalogRequestTimer = null;
    this.publishStatus('disconnected');
  }
}

function createAuthoritativeRoomClient(options) {
  return new AuthoritativeRoomClient(options);
}

export {
  AuthoritativeRoomClient,
  configuredEndpoint,
  configuredLocalTestToken,
  createAuthoritativeRoomClient,
  playerSnapshot
};

import { createHash } from 'node:crypto';
import {
  COMMAND_TYPES,
  normalizeRoomBudget,
  normalizeRoomRole,
  normalizeWorldProfile,
  normalizeWorldRef
} from '@we3d/mmo-contracts';

function clone(value) {
  return structuredClone(value);
}

function patchIdForCommand(commandId) {
  return createHash('sha256').update(String(commandId)).digest('hex').slice(0, 24);
}

function createManifest(input = {}) {
  const id = String(input.id || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,80}$/.test(id)) throw new Error('A valid room id is required.');
  const ownerUid = String(input.ownerUid || '').trim();
  if (!ownerUid) throw new Error('A room owner is required.');
  const members = { ...(input.members || {}) };
  members[ownerUid] = 'owner';
  const world = normalizeWorldRef(input.world);
  return {
    id,
    name: String(input.name || id).trim().slice(0, 80),
    visibility: input.visibility === 'public' ? 'public' : 'private',
    ownerUid,
    world,
    worldProfile: normalizeWorldProfile({ ...input.world, kind: world.kind }),
    budget: normalizeRoomBudget(input.budget),
    rules: {
      allowChat: input.rules?.allowChat !== false,
      allowCombat: input.rules?.allowCombat !== false,
      allowBuilding: input.rules?.allowBuilding !== false,
      allowDemolition: input.rules?.allowDemolition === true,
      persistence: input.rules?.persistence !== false
    },
    members: Object.fromEntries(Object.entries(members).map(([uid, role]) => [uid, normalizeRoomRole(role, 'visitor')])),
    revision: Math.max(0, Math.floor(Number(input.revision) || 0)),
    createdAtMs: Number(input.createdAtMs) || Date.now(),
    updatedAtMs: Number(input.updatedAtMs) || Date.now()
  };
}

class MemoryRoomStore {
  constructor() {
    this.rooms = new Map();
    this.patches = new Map();
    this.commandReceipts = new Map();
    this.auditEvents = new Map();
    this.playerSnapshots = new Map();
    this.inventories = new Map();
    this.progression = new Map();
    this.bans = new Map();
    this.roomLocks = new Map();
  }

  seedRoom(input) {
    const manifest = createManifest(input);
    this.rooms.set(manifest.id, manifest);
    this.patches.set(manifest.id, new Map());
    this.commandReceipts.set(manifest.id, new Map());
    this.auditEvents.set(manifest.id, []);
    this.playerSnapshots.set(manifest.id, new Map());
    this.inventories.set(manifest.id, new Map());
    this.progression.set(manifest.id, new Map());
    this.bans.set(manifest.id, new Map());
    return clone(manifest);
  }

  async loadRoom(roomId) {
    const manifest = this.rooms.get(String(roomId || '').trim().toUpperCase());
    return manifest ? clone(manifest) : null;
  }

  async loadActorRole(roomId, uid) {
    const manifest = this.rooms.get(String(roomId || '').trim().toUpperCase());
    if (!manifest) return null;
    if (manifest.ownerUid === uid) return 'owner';
    if (manifest.members[uid]) return normalizeRoomRole(manifest.members[uid], 'visitor');
    return manifest.visibility === 'public' ? 'visitor' : null;
  }

  async isBanned(roomId, uid) {
    return this.bans.get(String(roomId || '').trim().toUpperCase())?.has(String(uid || '')) === true;
  }

  async loadCells(roomId, cellKeys = []) {
    const requested = new Set(cellKeys.map(String));
    return Array.from(this.patches.get(String(roomId || '').trim().toUpperCase())?.values() || [])
      .filter((patch) => requested.size === 0 || requested.has(patch.cellKey))
      .map(clone);
  }

  async loadPlayerSnapshot(roomId, uid) {
    const snapshot = this.playerSnapshots
      .get(String(roomId || '').trim().toUpperCase())
      ?.get(String(uid || ''));
    return snapshot ? clone(snapshot) : null;
  }

  async savePlayerSnapshot(roomId, uid, snapshot) {
    const room = this.playerSnapshots.get(String(roomId || '').trim().toUpperCase());
    if (!room) throw new Error('Room does not exist.');
    room.set(String(uid || ''), clone(snapshot));
  }

  async saveVehicleSnapshot(roomId, vehicleId, snapshot) {
    return this.withRoomLock(roomId, async () => {
      const patches = this.patches.get(String(roomId || '').trim().toUpperCase());
      const patch = patches?.get(String(vehicleId || ''));
      if (!patch || patch.kind !== 'vehicle') {
        throw Object.assign(new Error('Persistent vehicle was not found.'), { code: 'not_found' });
      }
      patch.cellKey = String(snapshot.cellKey || patch.cellKey);
      patch.position = clone(snapshot.position);
      patch.rotation = clone(snapshot.rotation);
      patch.updatedAtMs = Date.now();
      return clone(patch);
    });
  }

  inventoryFor(roomId, uid, initial = {}) {
    const room = this.inventories.get(String(roomId || '').trim().toUpperCase());
    if (!room) throw new Error('Room does not exist.');
    if (!room.has(uid)) room.set(uid, clone(initial));
    return room.get(uid);
  }

  async loadInventory(roomId, uid, initial = {}) {
    return clone(this.inventoryFor(roomId, String(uid || ''), initial));
  }

  async loadPlayerProgression(roomId, uid) {
    const profile = this.progression
      .get(String(roomId || '').trim().toUpperCase())
      ?.get(String(uid || ''));
    return profile ? clone(profile) : null;
  }

  async savePlayerProgression(roomId, uid, profile) {
    const room = this.progression.get(String(roomId || '').trim().toUpperCase());
    if (!room) throw new Error('Room does not exist.');
    room.set(String(uid || ''), clone(profile));
  }

  async loadProgressionLeaderboard(roomId, limit = 25) {
    const room = this.progression.get(String(roomId || '').trim().toUpperCase());
    return Array.from(room?.values() || [])
      .sort((a, b) => (Number(b.xp) || 0) - (Number(a.xp) || 0))
      .slice(0, Math.max(1, Math.min(100, Math.floor(Number(limit) || 25))))
      .map((profile) => ({
        uid: profile.uid,
        displayName: profile.displayName || profile.uid,
        level: profile.level,
        xp: profile.xp,
        credits: profile.credits,
        eliminations: Math.floor(Number(profile.stats?.eliminations) || 0),
        missionsCompleted: Math.floor(Number(profile.stats?.missionsCompleted) || 0)
      }));
  }

  withRoomLock(roomId, operation) {
    const id = String(roomId || '').trim().toUpperCase();
    const previous = this.roomLocks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    const release = () => {
      if (this.roomLocks.get(id) === tracked) this.roomLocks.delete(id);
    };
    const tracked = next.then(release, release);
    this.roomLocks.set(id, tracked);
    return next;
  }

  async applyDurableCommand(context) {
    return this.withRoomLock(context.roomId, async () => {
      const roomId = String(context.roomId || '').trim().toUpperCase();
      const manifest = this.rooms.get(roomId);
      if (!manifest) throw new Error('Room does not exist.');
      const receipts = this.commandReceipts.get(roomId);
      const duplicate = receipts.get(context.command.commandId);
      if (duplicate) return { ...clone(duplicate), duplicate: true };
      if (context.command.expectedRevision !== manifest.revision) {
        const error = new Error(`Room revision conflict: expected ${context.command.expectedRevision}, current ${manifest.revision}.`);
        error.code = 'revision_conflict';
        throw error;
      }

      const patches = this.patches.get(roomId);
      const existingPatch = context.command.targetId ? patches.get(context.command.targetId) : null;
      const addsAsset = context.command.type === COMMAND_TYPES.PLACE_OBJECT || context.command.type === COMMAND_TYPES.SPAWN_VEHICLE;
      const removesAsset = context.command.type === COMMAND_TYPES.REMOVE_OBJECT && existingPatch;
      const inventoryOwner = removesAsset ? existingPatch.ownerUid : context.actor.uid;
      const inventoryAssetId = removesAsset ? existingPatch.assetId : context.command.assetId;
      const inventory = (addsAsset || removesAsset)
        ? this.inventoryFor(roomId, inventoryOwner, context.initialInventory)
        : null;
      if (addsAsset && (inventory[inventoryAssetId] || 0) < 1) {
        throw Object.assign(new Error('This asset is not available in the player inventory.'), { code: 'inventory_empty' });
      }
      const patchId = context.patchId || patchIdForCommand(context.command.commandId);
      const currentCellPatches = Array.from(patches.values()).filter((patch) => patch.cellKey === context.command.cellKey);
      context.validateBudget?.({ manifest: clone(manifest), currentCellPatches: currentCellPatches.map(clone), patches: Array.from(patches.values()).map(clone) });

      const nextRevision = manifest.revision + 1;
      const resultPatch = context.apply({ patches, patchId, nextRevision, manifest });
      if (addsAsset) inventory[inventoryAssetId] -= 1;
      if (removesAsset) inventory[inventoryAssetId] = (inventory[inventoryAssetId] || 0) + 1;
      manifest.revision = nextRevision;
      manifest.updatedAtMs = Date.now();
      const result = {
        ok: true,
        duplicate: false,
        commandId: context.command.commandId,
        revision: nextRevision,
        patch: resultPatch ? clone(resultPatch) : null,
        inventory: clone(this.inventoryFor(roomId, context.actor.uid, context.initialInventory))
      };
      receipts.set(context.command.commandId, clone(result));
      this.auditEvents.get(roomId).push({
        commandId: context.command.commandId,
        type: context.command.type,
        actorUid: context.actor.uid,
        revision: nextRevision,
        cellKey: context.command.cellKey,
        createdAtMs: Date.now()
      });
      return result;
    });
  }

  async applyModerationCommand(context) {
    return this.withRoomLock(context.roomId, async () => {
      const roomId = String(context.roomId || '').trim().toUpperCase();
      const manifest = this.rooms.get(roomId);
      if (!manifest) throw Object.assign(new Error('Room does not exist.'), { code: 'room_not_found' });
      const receipts = this.commandReceipts.get(roomId);
      const duplicate = receipts.get(context.command.commandId);
      if (duplicate) return { ...clone(duplicate), duplicate: true };
      if (context.command.expectedRevision !== manifest.revision) {
        throw Object.assign(new Error('Room revision conflict.'), { code: 'revision_conflict' });
      }
      if (context.command.targetId === manifest.ownerUid) {
        throw Object.assign(new Error('The room owner cannot be moderated.'), { code: 'permission_denied' });
      }
      const bans = this.bans.get(roomId);
      const banned = context.command.type === COMMAND_TYPES.BAN_PLAYER;
      if (banned) {
        bans.set(context.command.targetId, {
          uid: context.command.targetId,
          actorUid: context.actor.uid,
          reason: String(context.command.payload?.reason || '').slice(0, 240),
          createdAtMs: Date.now()
        });
      } else {
        bans.delete(context.command.targetId);
      }
      const revision = manifest.revision + 1;
      manifest.revision = revision;
      manifest.updatedAtMs = Date.now();
      const result = {
        ok: true,
        duplicate: false,
        commandId: context.command.commandId,
        revision,
        moderation: {
          type: context.command.type,
          targetUid: context.command.targetId,
          banned
        }
      };
      receipts.set(context.command.commandId, clone(result));
      this.auditEvents.get(roomId).push({
        commandId: context.command.commandId,
        type: context.command.type,
        actorUid: context.actor.uid,
        targetUid: context.command.targetId,
        revision,
        createdAtMs: Date.now()
      });
      return result;
    });
  }

  async getAuditEvents(roomId) {
    return clone(this.auditEvents.get(String(roomId || '').trim().toUpperCase()) || []);
  }
}

export { MemoryRoomStore, createManifest, patchIdForCommand };

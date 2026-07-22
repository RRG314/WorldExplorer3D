import { createHash } from 'node:crypto';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  COMMAND_TYPES,
  normalizeRoomBudget,
  normalizeWorldProfile,
  normalizeWorldRef
} from '@we3d/mmo-contracts';
import {
  CLAIMED_MUTATIONS,
  buildPatch,
  claimAllows,
  stableId
} from '../authority/command-processor.js';

function normalizeRoomId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80);
}

function docKey(prefix, value) {
  const digest = createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
  return `${prefix}-${digest}`;
}

function timestampMs(value, fallback = Date.now()) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function storedPatch(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function legacyRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'owner') return 'owner';
  if (role === 'administrator' || role === 'admin' || role === 'mod') return 'administrator';
  if (role === 'builder') return 'builder';
  if (role === 'player' || role === 'member') return 'player';
  if (role === 'visitor') return 'visitor';
  return null;
}

function manifestFromLegacy(roomId, roomData, revision = 0) {
  const ownerUid = String(roomData.ownerUid || roomData.createdBy || '').trim();
  if (!ownerUid) throw new Error(`Room ${roomId} has no owner.`);
  const members = { [ownerUid]: 'owner' };
  for (const [uid, enabled] of Object.entries(roomData.mods || {})) {
    if (enabled === true && uid !== ownerUid) members[uid] = 'administrator';
  }
  const kind = String(roomData.world?.kind || 'earth').toLowerCase();
  const world = normalizeWorldRef({
    kind,
    bodyId: roomData.world?.bodyId || kind,
    lat: roomData.world?.lat,
    lon: roomData.world?.lon,
    x: roomData.world?.x,
    y: roomData.world?.y,
    z: roomData.world?.z
  });
  return {
    id: roomId,
    name: String(roomData.name || roomId).trim().slice(0, 80),
    visibility: roomData.visibility === 'public' ? 'public' : 'private',
    ownerUid,
    members,
    world,
    worldProfile: normalizeWorldProfile({ ...roomData.worldProfile, kind: world.kind }),
    budget: normalizeRoomBudget({ maxPlayers: roomData.maxPlayers }),
    rules: {
      allowChat: roomData.rules?.allowChat !== false,
      allowCombat: roomData.rules?.allowCombat !== false,
      allowBuilding: roomData.rules?.allowBuilding !== false,
      allowDemolition: roomData.rules?.allowDemolition === true,
      persistence: true
    },
    revision: Math.max(0, Math.floor(Number(revision) || 0)),
    createdAtMs: timestampMs(roomData.createdAt),
    updatedAtMs: timestampMs(roomData.updatedAt || roomData.createdAt)
  };
}

function count(snapshot, field) {
  return Math.max(0, Math.floor(Number(snapshot?.exists ? snapshot.data()?.[field] : 0) || 0));
}

function inventoryAssets(snapshot, initial = {}) {
  const source = snapshot?.exists ? snapshot.data()?.assets : initial;
  return Object.fromEntries(Object.entries(source || {}).map(([assetId, quantity]) => [
    assetId,
    Math.max(0, Math.floor(Number(quantity) || 0))
  ]));
}

class FirestoreRoomStore {
  constructor(db) {
    if (!db) throw new Error('A Firestore instance is required.');
    this.db = db;
  }

  roomRef(roomId) {
    const id = normalizeRoomId(roomId);
    if (!id) throw new Error('A valid room id is required.');
    return this.db.collection('rooms').doc(id);
  }

  async loadRoom(roomId) {
    const roomRef = this.roomRef(roomId);
    const [roomSnap, authoritySnap] = await Promise.all([
      roomRef.get(),
      roomRef.collection('mmo').doc('authority').get()
    ]);
    if (!roomSnap.exists) return null;
    return manifestFromLegacy(roomRef.id, roomSnap.data() || {}, authoritySnap.data()?.revision);
  }

  async loadActorRole(roomId, uidInput) {
    const uid = String(uidInput || '').trim();
    if (!uid) return null;
    const roomRef = this.roomRef(roomId);
    const [roomSnap, playerSnap] = await Promise.all([
      roomRef.get(),
      roomRef.collection('players').doc(uid).get()
    ]);
    if (!roomSnap.exists) return null;
    const room = roomSnap.data() || {};
    if (String(room.ownerUid || room.createdBy || '') === uid) return 'owner';
    if (room.mods?.[uid] === true) return 'administrator';
    if (playerSnap.exists) return legacyRole(playerSnap.data()?.mmoRole || playerSnap.data()?.role) || 'player';
    return room.visibility === 'public' ? 'visitor' : null;
  }

  async isBanned(roomId, uidInput) {
    const uid = String(uidInput || '').trim();
    if (!uid) return false;
    return (await this.roomRef(roomId).collection('mmoBans').doc(uid).get()).exists;
  }

  async loadCells(roomId, cellKeys = []) {
    let query = this.roomRef(roomId).collection('mmoPatches');
    const keys = Array.from(new Set(cellKeys.map(String).filter(Boolean)));
    if (keys.length > 0) {
      if (keys.length > 30) throw new Error('At most 30 world cells can be loaded at once.');
      query = query.where('cellKey', 'in', keys);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  }

  async loadPlayerSnapshot(roomId, uidInput) {
    const uid = String(uidInput || '').trim();
    if (!uid) return null;
    const snapshot = await this.roomRef(roomId).collection('mmoPlayers').doc(uid).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async savePlayerSnapshot(roomId, uidInput, snapshot) {
    const uid = String(uidInput || '').trim();
    if (!uid) throw new Error('A player uid is required.');
    await this.roomRef(roomId).collection('mmoPlayers').doc(uid).set(storedPatch(snapshot));
  }

  async loadInventory(roomId, uidInput, initial = {}) {
    const uid = String(uidInput || '').trim();
    if (!uid) return {};
    const snapshot = await this.roomRef(roomId).collection('mmoInventory').doc(uid).get();
    return inventoryAssets(snapshot, initial);
  }

  async loadPlayerProgression(roomId, uidInput) {
    const uid = String(uidInput || '').trim();
    if (!uid) return null;
    const snapshot = await this.roomRef(roomId).collection('mmoProgression').doc(uid).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async savePlayerProgression(roomId, uidInput, profile) {
    const uid = String(uidInput || '').trim();
    if (!uid) throw new Error('A player uid is required.');
    await this.roomRef(roomId).collection('mmoProgression').doc(uid).set(storedPatch(profile));
  }

  async loadProgressionLeaderboard(roomId, limitInput = 25) {
    const limit = Math.max(1, Math.min(100, Math.floor(Number(limitInput) || 25)));
    const snapshot = await this.roomRef(roomId)
      .collection('mmoProgression')
      .orderBy('xp', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => {
      const profile = doc.data() || {};
      return {
        uid: doc.id,
        displayName: String(profile.displayName || doc.id),
        level: Math.max(1, Math.floor(Number(profile.level) || 1)),
        xp: Math.max(0, Math.floor(Number(profile.xp) || 0)),
        credits: Math.max(0, Math.floor(Number(profile.credits) || 0)),
        eliminations: Math.max(0, Math.floor(Number(profile.stats?.eliminations) || 0)),
        missionsCompleted: Math.max(0, Math.floor(Number(profile.stats?.missionsCompleted) || 0))
      };
    });
  }

  async saveVehicleSnapshot(roomId, vehicleIdInput, snapshot) {
    const vehicleId = String(vehicleIdInput || '').trim();
    if (!vehicleId) throw new Error('A vehicle id is required.');
    const roomRef = this.roomRef(roomId);
    const vehicleRef = roomRef.collection('mmoPatches').doc(vehicleId);
    return this.db.runTransaction(async (transaction) => {
      const [roomSnap, vehicleSnap] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(vehicleRef)
      ]);
      if (!roomSnap.exists) throw Object.assign(new Error('Room does not exist.'), { code: 'room_not_found' });
      if (!vehicleSnap.exists || vehicleSnap.data()?.kind !== 'vehicle') {
        throw Object.assign(new Error('Persistent vehicle was not found.'), { code: 'not_found' });
      }
      const vehicle = vehicleSnap.data() || {};
      const oldCellKey = String(vehicle.cellKey || '');
      const nextCellKey = String(snapshot.cellKey || oldCellKey);
      if (nextCellKey !== oldCellKey) {
        const oldCellRef = roomRef.collection('mmoCounters').doc(docKey('cell', oldCellKey));
        const nextCellRef = roomRef.collection('mmoCounters').doc(docKey('cell', nextCellKey));
        const [oldCellSnap, nextCellSnap] = await Promise.all([
          transaction.get(oldCellRef),
          transaction.get(nextCellRef)
        ]);
        const manifest = manifestFromLegacy(roomRef.id, roomSnap.data() || {});
        const nextCount = count(nextCellSnap, 'objectCount');
        if (nextCount >= manifest.budget.maxPersistentObjectsPerCell) {
          throw Object.assign(new Error('Destination cell object budget reached.'), { code: 'cell_budget_reached' });
        }
        transaction.set(oldCellRef, { objectCount: Math.max(0, count(oldCellSnap, 'objectCount') - 1) }, { merge: true });
        transaction.set(nextCellRef, { objectCount: nextCount + 1 }, { merge: true });
      }
      const update = {
        cellKey: nextCellKey,
        position: storedPatch(snapshot.position),
        rotation: storedPatch(snapshot.rotation),
        updatedAtMs: Date.now()
      };
      transaction.update(vehicleRef, update);
      return { id: vehicleId, ...vehicle, ...update };
    });
  }

  async applyDurableCommand(context) {
    const roomRef = this.roomRef(context.roomId);
    const { actor, command } = context;
    const authorityRef = roomRef.collection('mmo').doc('authority');
    const receiptRef = roomRef.collection('mmoCommands').doc(docKey('command', command.commandId));
    const auditRef = roomRef.collection('mmoAudit').doc(docKey('audit', command.commandId));
    const claimRef = roomRef.collection('mmoPatches').doc(stableId('claim', command.cellKey));

    return this.db.runTransaction(async (transaction) => {
      const [roomSnap, authoritySnap, receiptSnap, claimSnap] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(authorityRef),
        transaction.get(receiptRef),
        transaction.get(claimRef)
      ]);
      if (!roomSnap.exists) throw Object.assign(new Error('Room does not exist.'), { code: 'room_not_found' });
      if (receiptSnap.exists) return { ...receiptSnap.data(), duplicate: true };

      const manifest = manifestFromLegacy(roomRef.id, roomSnap.data() || {}, authoritySnap.data()?.revision);
      if (command.expectedRevision !== manifest.revision) {
        throw Object.assign(
          new Error(`Room revision conflict: expected ${command.expectedRevision}, current ${manifest.revision}.`),
          { code: 'revision_conflict' }
        );
      }

      const nextRevision = manifest.revision + 1;
      const addsObject = command.type === COMMAND_TYPES.PLACE_OBJECT || command.type === COMMAND_TYPES.SPAWN_VEHICLE;
      const removesObject = command.type === COMMAND_TYPES.REMOVE_OBJECT;
      const addsSuppression = command.type === COMMAND_TYPES.SUPPRESS_BASE;
      const removesSuppression = command.type === COMMAND_TYPES.RESTORE_BASE;
      const addsClaim = command.type === COMMAND_TYPES.CLAIM_CELL;
      const removesClaim = command.type === COMMAND_TYPES.RELEASE_CLAIM;
      const existingClaim = claimSnap.exists ? { id: claimSnap.id, ...(claimSnap.data() || {}) } : null;
      if (CLAIMED_MUTATIONS.has(command.type) && !claimAllows(existingClaim, actor)) {
        throw Object.assign(new Error('This world cell is protected by a room claim.'), { code: 'claim_denied' });
      }
      let patch = null;
      let patchRef = null;
      let cellRef = null;
      let userRef = null;
      let cellSnap = null;
      let userSnap = null;
      let removedAsset = null;
      let occupiedPatchSnap = null;

      if (addsObject || addsSuppression) {
        patch = buildPatch(command, actor, nextRevision);
        patchRef = roomRef.collection('mmoPatches').doc(patch.id);
        cellRef = roomRef.collection('mmoCounters').doc(docKey('cell', patch.cellKey));
        userRef = roomRef.collection('mmoCounters').doc(docKey('user', actor.uid));
        [cellSnap, userSnap, occupiedPatchSnap] = await Promise.all([
          transaction.get(cellRef),
          transaction.get(userRef),
          command.type === COMMAND_TYPES.PLACE_OBJECT ? transaction.get(patchRef) : Promise.resolve(null)
        ]);
        if (occupiedPatchSnap?.exists) {
          throw Object.assign(new Error('That build grid position is already occupied.'), { code: 'position_occupied' });
        }
      } else if (addsClaim) {
        if (existingClaim) throw Object.assign(new Error('This world cell is already claimed.'), { code: 'claim_exists' });
        patch = buildPatch(command, actor, nextRevision);
        patchRef = claimRef;
      } else if (removesClaim) {
        if (!existingClaim) throw Object.assign(new Error('This world cell is not claimed.'), { code: 'not_found' });
        if (!claimAllows({ ...existingClaim, access: 'private' }, actor)) {
          throw Object.assign(new Error('Only the claim owner or a room moderator can release this claim.'), { code: 'permission_denied' });
        }
        patchRef = claimRef;
        patch = {
          id: existingClaim.id,
          kind: 'claim_released',
          cellKey: existingClaim.cellKey,
          revision: nextRevision
        };
      } else if (removesObject) {
        patchRef = roomRef.collection('mmoPatches').doc(command.targetId);
        const existingSnap = await transaction.get(patchRef);
        if (!existingSnap.exists || !['object', 'vehicle'].includes(existingSnap.data()?.kind)) {
          throw Object.assign(new Error('Placed object was not found.'), { code: 'not_found' });
        }
        const existing = { id: existingSnap.id, ...(existingSnap.data() || {}) };
        removedAsset = existing;
        if (existing.ownerUid !== actor.uid && actor.role !== 'owner' && actor.role !== 'administrator') {
          throw Object.assign(new Error('Only the owner or a room moderator can remove this object.'), { code: 'permission_denied' });
        }
        cellRef = roomRef.collection('mmoCounters').doc(docKey('cell', existing.cellKey));
        userRef = roomRef.collection('mmoCounters').doc(docKey('user', existing.ownerUid));
        [cellSnap, userSnap] = await Promise.all([
          transaction.get(cellRef),
          transaction.get(userRef)
        ]);
        patch = {
          id: existing.id,
          kind: 'removed',
          revision: nextRevision,
          cellKey: existing.cellKey,
          assetId: existing.assetId,
          ownerUid: existing.ownerUid
        };
      } else if (removesSuppression) {
        const suppressionId = stableId('suppression', command.targetId);
        patchRef = roomRef.collection('mmoPatches').doc(suppressionId);
        const existingSnap = await transaction.get(patchRef);
        if (!existingSnap.exists || existingSnap.data()?.kind !== 'suppression') {
          throw Object.assign(new Error('Suppression was not found.'), { code: 'not_found' });
        }
        const existing = { id: existingSnap.id, ...(existingSnap.data() || {}) };
        cellRef = roomRef.collection('mmoCounters').doc(docKey('cell', existing.cellKey));
        cellSnap = await transaction.get(cellRef);
        patch = { id: existing.id, kind: 'restored', revision: nextRevision, cellKey: existing.cellKey };
      } else {
        throw Object.assign(new Error('Unsupported durable command.'), { code: 'invalid_command' });
      }


      const addsInventoryAsset = addsObject;
      const removesInventoryAsset = removesObject && removedAsset;
      const inventoryOwner = removesInventoryAsset ? removedAsset.ownerUid : actor.uid;
      const inventoryAssetId = removesInventoryAsset ? removedAsset.assetId : command.assetId;
      let nextInventory = null;
      let inventoryRef = null;
      if (addsInventoryAsset || removesInventoryAsset) {
        inventoryRef = roomRef.collection('mmoInventory').doc(inventoryOwner);
        const inventorySnap = await transaction.get(inventoryRef);
        nextInventory = inventoryAssets(inventorySnap, context.initialInventory);
        if (addsInventoryAsset && (nextInventory[inventoryAssetId] || 0) < 1) {
          throw Object.assign(new Error('This asset is not available in the player inventory.'), { code: 'inventory_empty' });
        }
        if (addsInventoryAsset) nextInventory[inventoryAssetId] -= 1;
        if (removesInventoryAsset) nextInventory[inventoryAssetId] = (nextInventory[inventoryAssetId] || 0) + 1;
      }

      const roomObjectCount = count(authoritySnap, 'objectCount');
      const cellObjectCount = count(cellSnap, 'objectCount');
      const userObjectCount = count(userSnap, 'objectCount');
      const cellSuppressionCount = count(cellSnap, 'suppressionCount');
      if (addsObject && cellObjectCount >= manifest.budget.maxPersistentObjectsPerCell) throw Object.assign(new Error('Cell object budget reached.'), { code: 'cell_budget_reached' });
      if (addsObject && roomObjectCount >= manifest.budget.maxPersistentObjects) throw Object.assign(new Error('Room object budget reached.'), { code: 'room_budget_reached' });
      if (addsObject && userObjectCount >= manifest.budget.maxPersistentObjectsPerUser) throw Object.assign(new Error('Player object budget reached.'), { code: 'player_budget_reached' });
      if (addsSuppression && cellSuppressionCount >= manifest.budget.maxSuppressedBaseFeaturesPerCell) throw Object.assign(new Error('Cell suppression budget reached.'), { code: 'cell_budget_reached' });

      if (addsObject || addsSuppression || addsClaim) transaction.set(patchRef, storedPatch(patch));
      if (removesObject || removesSuppression || removesClaim) transaction.delete(patchRef);
      if (inventoryRef) transaction.set(inventoryRef, { assets: nextInventory, updatedAtMs: Date.now() });
      if (addsObject || removesObject) {
        const delta = addsObject ? 1 : -1;
        transaction.set(authorityRef, {
          revision: nextRevision,
          objectCount: Math.max(0, roomObjectCount + delta),
          updatedAtMs: Date.now()
        }, { merge: true });
        transaction.set(userRef, { objectCount: Math.max(0, userObjectCount + delta) }, { merge: true });
        transaction.set(cellRef, { objectCount: Math.max(0, cellObjectCount + delta) }, { merge: true });
      } else if (addsSuppression || removesSuppression) {
        const delta = addsSuppression ? 1 : -1;
        transaction.set(authorityRef, { revision: nextRevision, updatedAtMs: Date.now() }, { merge: true });
        transaction.set(cellRef, { suppressionCount: Math.max(0, cellSuppressionCount + delta) }, { merge: true });
      } else {
        transaction.set(authorityRef, { revision: nextRevision, updatedAtMs: Date.now() }, { merge: true });
      }

      const result = {
        ok: true,
        duplicate: false,
        commandId: command.commandId,
        revision: nextRevision,
        patch: storedPatch(patch),
        inventory: inventoryOwner === actor.uid ? storedPatch(nextInventory) : null
      };
      transaction.create(receiptRef, { ...result, createdAtMs: Date.now() });
      transaction.create(auditRef, {
        commandId: command.commandId,
        type: command.type,
        actorUid: actor.uid,
        revision: nextRevision,
        cellKey: patch.cellKey,
        createdAtMs: Date.now()
      });
      return result;
    });
  }

  async applyModerationCommand(context) {
    const roomRef = this.roomRef(context.roomId);
    const { actor, command } = context;
    const authorityRef = roomRef.collection('mmo').doc('authority');
    const receiptRef = roomRef.collection('mmoCommands').doc(docKey('command', command.commandId));
    const auditRef = roomRef.collection('mmoAudit').doc(docKey('audit', command.commandId));
    const banRef = roomRef.collection('mmoBans').doc(command.targetId);
    return this.db.runTransaction(async (transaction) => {
      const [roomSnap, authoritySnap, receiptSnap] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(authorityRef),
        transaction.get(receiptRef)
      ]);
      if (!roomSnap.exists) throw Object.assign(new Error('Room does not exist.'), { code: 'room_not_found' });
      if (receiptSnap.exists) return { ...receiptSnap.data(), duplicate: true };
      const manifest = manifestFromLegacy(roomRef.id, roomSnap.data() || {}, authoritySnap.data()?.revision);
      if (command.expectedRevision !== manifest.revision) {
        throw Object.assign(new Error('Room revision conflict.'), { code: 'revision_conflict' });
      }
      if (command.targetId === manifest.ownerUid) {
        throw Object.assign(new Error('The room owner cannot be moderated.'), { code: 'permission_denied' });
      }
      const banned = command.type === COMMAND_TYPES.BAN_PLAYER;
      const revision = manifest.revision + 1;
      if (banned) {
        transaction.set(banRef, {
          uid: command.targetId,
          actorUid: actor.uid,
          reason: String(command.payload?.reason || '').slice(0, 240),
          createdAtMs: Date.now()
        });
      } else {
        transaction.delete(banRef);
      }
      transaction.set(authorityRef, { revision, updatedAtMs: Date.now() }, { merge: true });
      const result = {
        ok: true,
        duplicate: false,
        commandId: command.commandId,
        revision,
        moderation: { type: command.type, targetUid: command.targetId, banned }
      };
      transaction.create(receiptRef, { ...result, createdAtMs: Date.now() });
      transaction.create(auditRef, {
        commandId: command.commandId,
        type: command.type,
        actorUid: actor.uid,
        targetUid: command.targetId,
        revision,
        createdAtMs: Date.now()
      });
      return result;
    });
  }

  async getAuditEvents(roomId) {
    const snapshot = await this.roomRef(roomId).collection('mmoAudit').orderBy('revision', 'asc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  }
}

function createFirestoreRoomStore(options = {}) {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: options.projectId || process.env.GOOGLE_CLOUD_PROJECT
    });
  }
  return new FirestoreRoomStore(options.db || getFirestore());
}

export { FirestoreRoomStore, createFirestoreRoomStore, docKey, legacyRole, manifestFromLegacy };

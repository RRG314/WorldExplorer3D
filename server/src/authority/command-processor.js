import { createHash } from 'node:crypto';
import {
  COMMAND_TYPES,
  normalizeRoomCommand,
  roleHasCapability
} from '@we3d/mmo-contracts';
import { SlidingWindowRateLimiter } from './rate-limiter.js';
import { assetMatchesCommand, normalizeAssetMetadata } from '../content/catalog.js';
import { buildOccupancyKey, snapBuildPosition } from '../content/placement-grid.js';

function stableId(prefix, commandId) {
  const digest = createHash('sha256').update(String(commandId)).digest('hex').slice(0, 20);
  return `${prefix}-${digest}`;
}

function commandByteLength(input) {
  return Buffer.byteLength(JSON.stringify(input || {}), 'utf8');
}

function countPatchKind(patches, kind) {
  return patches.reduce((total, patch) => total + (patch.kind === kind ? 1 : 0), 0);
}

const CLAIMED_MUTATIONS = new Set([
  COMMAND_TYPES.PLACE_OBJECT,
  COMMAND_TYPES.REMOVE_OBJECT,
  COMMAND_TYPES.SPAWN_VEHICLE,
  COMMAND_TYPES.SUPPRESS_BASE,
  COMMAND_TYPES.RESTORE_BASE
]);
const MODERATION_COMMANDS = new Set([
  COMMAND_TYPES.KICK_PLAYER,
  COMMAND_TYPES.BAN_PLAYER,
  COMMAND_TYPES.UNBAN_PLAYER
]);
const ROLE_RANK = Object.freeze({ visitor: 0, player: 1, builder: 2, administrator: 3, owner: 4 });

function claimAccess(value) {
  return ['private', 'builders', 'public'].includes(value) ? value : 'private';
}

function claimAllows(claim, actor) {
  if (!claim) return true;
  if (claim.ownerUid === actor.uid || actor.role === 'owner' || actor.role === 'administrator') return true;
  if (claim.access === 'public') return true;
  return claim.access === 'builders' && actor.role === 'builder';
}

function buildPatch(command, actor, revision) {
  const common = {
    cellKey: command.cellKey,
    actorUid: actor.uid,
    revision,
    updatedAtMs: Date.now()
  };
  if (command.type === COMMAND_TYPES.PLACE_OBJECT || command.type === COMMAND_TYPES.SPAWN_VEHICLE) {
    const isPlacedObject = command.type === COMMAND_TYPES.PLACE_OBJECT;
    return {
      ...common,
      id: stableId(
        isPlacedObject ? 'object' : 'vehicle',
        isPlacedObject ? buildOccupancyKey(command.cellKey, command.position) : command.commandId
      ),
      kind: isPlacedObject ? 'object' : 'vehicle',
      assetId: command.assetId,
      ownerUid: actor.uid,
      position: command.position,
      rotation: command.rotation,
      metadata: command.payload?.metadata && typeof command.payload.metadata === 'object'
        ? structuredClone(command.payload.metadata)
        : {}
    };
  }
  if (command.type === COMMAND_TYPES.SUPPRESS_BASE) {
    return {
      ...common,
      id: stableId('suppression', command.targetId),
      kind: 'suppression',
      sourceId: command.targetId
    };
  }
  if (command.type === COMMAND_TYPES.CLAIM_CELL) {
    return {
      ...common,
      id: stableId('claim', command.cellKey),
      kind: 'claim',
      ownerUid: actor.uid,
      access: claimAccess(command.payload?.access)
    };
  }
  return null;
}

class RoomCommandProcessor {
  constructor(options) {
    this.store = options.store;
    this.rateLimiter = options.rateLimiter || new SlidingWindowRateLimiter();
    this.assetCatalog = options.assetCatalog || null;
    this.inventoryPolicy = options.inventoryPolicy || null;
  }

  async process(context) {
    const manifest = context.manifest;
    const actor = context.actor;
    let command = normalizeRoomCommand(context.rawCommand);
    if (commandByteLength(context.rawCommand) > manifest.budget.maxCommandBytes) {
      const error = new Error('Command payload exceeds the room budget.');
      error.code = 'payload_too_large';
      throw error;
    }
    if (!roleHasCapability(actor.role, command.requiredCapability)) {
      const error = new Error(`Role ${actor.role} cannot execute ${command.type}.`);
      error.code = 'permission_denied';
      throw error;
    }
    if (command.type === COMMAND_TYPES.SUPPRESS_BASE && !manifest.rules.allowDemolition) {
      const error = new Error('Demolition is disabled in this room.');
      error.code = 'room_rule_denied';
      throw error;
    }
    if (command.type === COMMAND_TYPES.PLACE_OBJECT && !manifest.rules.allowBuilding) {
      const error = new Error('Building is disabled in this room.');
      error.code = 'room_rule_denied';
      throw error;
    }

    this.rateLimiter.consume(`${manifest.id}:${actor.uid}:all`, {
      limit: manifest.budget.maxCommandsPerSecond,
      windowMs: 1000
    });
    if (command.durable) {
      this.rateLimiter.consume(`${manifest.id}:${actor.uid}:durable`, {
        limit: manifest.budget.maxDurableCommandsPerMinute,
        windowMs: 60000
      });
    }

    if (MODERATION_COMMANDS.has(command.type)) {
      if (!/^[a-zA-Z0-9._-]{3,128}$/.test(command.targetId)) {
        throw Object.assign(new Error('A valid target account is required.'), { code: 'invalid_command' });
      }
      if (command.targetId === actor.uid) {
        throw Object.assign(new Error('Moderators cannot target their own account.'), { code: 'permission_denied' });
      }
      const targetRole = await this.store.loadActorRole(manifest.id, command.targetId);
      if (targetRole && ROLE_RANK[actor.role] <= ROLE_RANK[targetRole]) {
        throw Object.assign(new Error('Moderators can only target lower-ranked room members.'), { code: 'permission_denied' });
      }
      if (command.type === COMMAND_TYPES.KICK_PLAYER) return { ok: true, command, transient: true };
      return this.store.applyModerationCommand({
        roomId: manifest.id,
        actor,
        command
      });
    }

    if (!command.durable) {
      return {
        ok: true,
        commandId: command.commandId,
        revision: manifest.revision,
        command,
        transient: true
      };
    }
    if ((command.type === COMMAND_TYPES.PLACE_OBJECT || command.type === COMMAND_TYPES.SPAWN_VEHICLE) && !command.assetId) {
      const error = new Error('A catalog assetId is required.');
      error.code = 'invalid_command';
      throw error;
    }
    const asset = this.assetCatalog?.get(command.assetId);
    if ((command.type === COMMAND_TYPES.PLACE_OBJECT || command.type === COMMAND_TYPES.SPAWN_VEHICLE) && this.assetCatalog && !asset) {
      const error = new Error('The requested asset is not in the server catalog.');
      error.code = 'unknown_asset';
      throw error;
    }
    if (asset && !assetMatchesCommand(asset, command.type)) {
      const error = new Error('The requested asset cannot be used for this command.');
      error.code = 'asset_kind_mismatch';
      throw error;
    }
    if (asset) {
      const position = asset.kind === 'object' ? snapBuildPosition(command.position) : command.position;
      command = Object.freeze({
        ...command,
        position,
        payload: {
          ...command.payload,
          metadata: normalizeAssetMetadata(asset, command.payload?.metadata)
        }
      });
    }
    if (command.type === COMMAND_TYPES.SUPPRESS_BASE && !command.targetId) {
      const error = new Error('A mapped source feature id is required.');
      error.code = 'invalid_command';
      throw error;
    }
    if ((command.type === COMMAND_TYPES.SUPPRESS_BASE || command.type === COMMAND_TYPES.RESTORE_BASE) && !/^(osm|overture|we3d):[a-zA-Z0-9._:/-]{3,160}$/.test(command.targetId)) {
      const error = new Error('A source-provenance feature id is required.');
      error.code = 'invalid_source_id';
      throw error;
    }

    return this.store.applyDurableCommand({
      roomId: manifest.id,
      actor,
      command,
      initialInventory: this.inventoryPolicy?.initialForRole(actor.role) || {},
      validateBudget: ({ manifest: current, currentCellPatches, patches }) => {
        const addsObject = command.type === COMMAND_TYPES.PLACE_OBJECT || command.type === COMMAND_TYPES.SPAWN_VEHICLE;
        if (addsObject) {
          const persistentInCell = countPatchKind(currentCellPatches, 'object') + countPatchKind(currentCellPatches, 'vehicle');
          const persistentTotal = countPatchKind(patches, 'object') + countPatchKind(patches, 'vehicle');
          const actorTotal = patches.filter((patch) => patch.ownerUid === actor.uid && (patch.kind === 'object' || patch.kind === 'vehicle')).length;
          if (persistentInCell >= current.budget.maxPersistentObjectsPerCell) throw Object.assign(new Error('Cell object budget reached.'), { code: 'cell_budget_reached' });
          if (persistentTotal >= current.budget.maxPersistentObjects) throw Object.assign(new Error('Room object budget reached.'), { code: 'room_budget_reached' });
          if (actorTotal >= current.budget.maxPersistentObjectsPerUser) throw Object.assign(new Error('Player object budget reached.'), { code: 'player_budget_reached' });
        }
        if (command.type === COMMAND_TYPES.SUPPRESS_BASE && countPatchKind(currentCellPatches, 'suppression') >= current.budget.maxSuppressedBaseFeaturesPerCell) {
          throw Object.assign(new Error('Cell suppression budget reached.'), { code: 'cell_budget_reached' });
        }
      },
      apply: ({ patches, nextRevision }) => {
        const cellClaimId = stableId('claim', command.cellKey);
        const cellClaim = patches.get(cellClaimId);
        if (CLAIMED_MUTATIONS.has(command.type) && !claimAllows(cellClaim, actor)) {
          throw Object.assign(new Error('This world cell is protected by a room claim.'), { code: 'claim_denied' });
        }
        if (command.type === COMMAND_TYPES.CLAIM_CELL) {
          if (cellClaim) throw Object.assign(new Error('This world cell is already claimed.'), { code: 'claim_exists' });
          const patch = buildPatch(command, actor, nextRevision);
          patches.set(patch.id, patch);
          return patch;
        }
        if (command.type === COMMAND_TYPES.RELEASE_CLAIM) {
          if (!cellClaim) throw Object.assign(new Error('This world cell is not claimed.'), { code: 'not_found' });
          if (!claimAllows({ ...cellClaim, access: 'private' }, actor)) {
            throw Object.assign(new Error('Only the claim owner or a room moderator can release this claim.'), { code: 'permission_denied' });
          }
          patches.delete(cellClaimId);
          return { id: cellClaimId, kind: 'claim_released', cellKey: command.cellKey, revision: nextRevision };
        }
        if (command.type === COMMAND_TYPES.REMOVE_OBJECT) {
          const existing = patches.get(command.targetId);
          if (!existing || (existing.kind !== 'object' && existing.kind !== 'vehicle')) {
            throw Object.assign(new Error('Placed object was not found.'), { code: 'not_found' });
          }
          if (existing.ownerUid !== actor.uid && actor.role !== 'owner' && actor.role !== 'administrator') {
            throw Object.assign(new Error('Only the owner or a room moderator can remove this object.'), { code: 'permission_denied' });
          }
          patches.delete(command.targetId);
          return { id: command.targetId, kind: 'removed', revision: nextRevision, cellKey: existing.cellKey };
        }
        if (command.type === COMMAND_TYPES.RESTORE_BASE) {
          const suppressionId = stableId('suppression', command.targetId);
          const existing = patches.get(suppressionId);
          if (!existing) throw Object.assign(new Error('Suppression was not found.'), { code: 'not_found' });
          patches.delete(suppressionId);
          return { id: suppressionId, kind: 'restored', revision: nextRevision, cellKey: existing.cellKey };
        }
        const patch = buildPatch(command, actor, nextRevision);
        if (patch.kind === 'object' && patches.has(patch.id)) {
          throw Object.assign(new Error('That build grid position is already occupied.'), { code: 'position_occupied' });
        }
        patches.set(patch.id, patch);
        return patch;
      }
    });
  }
}

export {
  CLAIMED_MUTATIONS,
  MODERATION_COMMANDS,
  ROLE_RANK,
  RoomCommandProcessor,
  buildPatch,
  claimAllows,
  stableId
};

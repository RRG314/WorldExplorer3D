import { StateView } from '@colyseus/schema';
import {
  worldAtLocalOffset,
  worldCellKey,
  worldCellNeighborhood
} from '@we3d/mmo-contracts';
import { patchIntoState } from './state.js';

class WorldInterestManager {
  constructor(options) {
    this.roomId = options.roomId;
    this.world = options.world;
    this.radius = options.radius;
    this.store = options.store;
    this.state = options.state;
    this.clients = new Map();
    this.cellReferences = new Map();
    this.loadedCells = new Set();
    this.cellLoads = new Map();
  }

  worldForPlayer(player) {
    return worldAtLocalOffset(this.world, player?.x, player?.z);
  }

  centerCell(player) {
    return worldCellKey(this.worldForPlayer(player));
  }

  cellsForPlayer(player) {
    return new Set(worldCellNeighborhood(this.worldForPlayer(player), this.radius));
  }

  activeCells(client) {
    return this.clients.get(client.sessionId)?.cells || new Set();
  }

  isCellActive(client, cellKey) {
    return this.activeCells(client).has(String(cellKey || ''));
  }

  async addClient(client, player) {
    const view = new StateView();
    client.view = view;
    this.clients.set(client.sessionId, {
      client,
      view,
      center: '',
      cells: new Set()
    });
    await this.updateClient(client, player, true);
  }

  async removeClient(client) {
    const entry = this.clients.get(client.sessionId);
    if (!entry) return;
    this.clients.delete(client.sessionId);
    for (const cellKey of entry.cells) this.releaseCell(cellKey);
  }

  scheduleClientUpdate(client, player) {
    const entry = this.clients.get(client.sessionId);
    if (!entry || entry.updating) return;
    const center = this.centerCell(player);
    if (center === entry.center) return;
    entry.updating = this.updateClient(client, player)
      .catch((error) => client.send('interest.error', {
        code: 'interest_update_failed',
        message: String(error?.message || 'Interest update failed.').slice(0, 240)
      }))
      .finally(() => {
        entry.updating = null;
      });
  }

  async updateClient(client, player, force = false) {
    const entry = this.clients.get(client.sessionId);
    if (!entry) return;
    const center = this.centerCell(player);
    if (!force && center === entry.center) return;
    const nextCells = this.cellsForPlayer(player);
    const added = Array.from(nextCells).filter((cellKey) => !entry.cells.has(cellKey));
    const removed = Array.from(entry.cells).filter((cellKey) => !nextCells.has(cellKey));
    for (const cellKey of added) await this.retainCell(cellKey);
    entry.cells = nextCells;
    entry.center = center;
    this.refreshView(entry);
    for (const cellKey of removed) this.releaseCell(cellKey);
  }

  async retainCell(cellKey) {
    this.cellReferences.set(cellKey, (this.cellReferences.get(cellKey) || 0) + 1);
    if (this.loadedCells.has(cellKey)) return;
    let pending = this.cellLoads.get(cellKey);
    if (!pending) {
      pending = this.loadCell(cellKey).finally(() => this.cellLoads.delete(cellKey));
      this.cellLoads.set(cellKey, pending);
    }
    await pending;
  }

  async loadCell(cellKey) {
    const patches = await this.store.loadCells(this.roomId, [cellKey]);
    if (!this.cellReferences.has(cellKey)) return;
    for (const patch of patches) patchIntoState(this.state, patch);
    this.loadedCells.add(cellKey);
    for (const entry of this.clients.values()) this.refreshView(entry);
  }

  releaseCell(cellKey) {
    const count = (this.cellReferences.get(cellKey) || 0) - 1;
    if (count > 0) {
      this.cellReferences.set(cellKey, count);
      return;
    }
    this.cellReferences.delete(cellKey);
    this.loadedCells.delete(cellKey);
    for (const [id, item] of this.state.objects) {
      if (item.cellKey !== cellKey) continue;
      for (const entry of this.clients.values()) {
        if (entry.view.has(item)) entry.view.remove(item);
      }
      this.state.objects.delete(id);
    }
    for (const [id, item] of this.state.suppressions) {
      if (item.cellKey !== cellKey) continue;
      for (const entry of this.clients.values()) {
        if (entry.view.has(item)) entry.view.remove(item);
      }
      this.state.suppressions.delete(id);
    }
    for (const [id, item] of this.state.vehicles) {
      if (item.cellKey !== cellKey || item.driverUid) continue;
      for (const entry of this.clients.values()) {
        if (entry.view.has(item)) entry.view.remove(item);
      }
      this.state.vehicles.delete(id);
    }
    for (const [id, item] of this.state.claims) {
      if (item.cellKey !== cellKey) continue;
      for (const entry of this.clients.values()) {
        if (entry.view.has(item)) entry.view.remove(item);
      }
      this.state.claims.delete(id);
    }
  }

  addTransient(item) {
    for (const entry of this.clients.values()) {
      if (entry.cells.has(item.cellKey) && !entry.view.has(item)) entry.view.add(item);
    }
  }

  moveTransient(item) {
    for (const entry of this.clients.values()) {
      const visible = entry.cells.has(item.cellKey);
      if (visible && !entry.view.has(item)) entry.view.add(item);
      else if (!visible && entry.view.has(item)) entry.view.remove(item);
    }
  }

  removeTransient(item) {
    for (const entry of this.clients.values()) {
      if (entry.view.has(item)) entry.view.remove(item);
    }
  }

  refreshView(entry) {
    for (const item of this.state.objects.values()) {
      const visible = entry.cells.has(item.cellKey);
      if (visible && !entry.view.has(item)) entry.view.add(item);
      else if (!visible && entry.view.has(item)) entry.view.remove(item);
    }
    for (const item of this.state.suppressions.values()) {
      const visible = entry.cells.has(item.cellKey);
      if (visible && !entry.view.has(item)) entry.view.add(item);
      else if (!visible && entry.view.has(item)) entry.view.remove(item);
    }
    for (const item of this.state.vehicles.values()) {
      const visible = entry.cells.has(item.cellKey);
      if (visible && !entry.view.has(item)) entry.view.add(item);
      else if (!visible && entry.view.has(item)) entry.view.remove(item);
    }
    for (const item of this.state.claims.values()) {
      const visible = entry.cells.has(item.cellKey);
      if (visible && !entry.view.has(item)) entry.view.add(item);
      else if (!visible && entry.view.has(item)) entry.view.remove(item);
    }
    for (const item of this.state.projectiles.values()) {
      const visible = entry.cells.has(item.cellKey);
      if (visible && !entry.view.has(item)) entry.view.add(item);
      else if (!visible && entry.view.has(item)) entry.view.remove(item);
    }
  }

  refreshAllViews() {
    for (const entry of this.clients.values()) this.refreshView(entry);
  }

  applyPatch(patch) {
    const existing = patch?.kind === 'restored'
      ? this.state.suppressions.get(patch.id)
      : patch?.kind === 'claim_released'
        ? this.state.claims.get(patch.id)
        : this.state.objects.get(patch?.id) || this.state.vehicles.get(patch?.id) || this.state.claims.get(patch?.id);
    const cellKey = patch?.cellKey || existing?.cellKey || '';
    if (existing) {
      for (const entry of this.clients.values()) {
        if (entry.view.has(existing)) entry.view.remove(existing);
      }
    }
    patchIntoState(this.state, patch);
    for (const entry of this.clients.values()) {
      if (patch?.kind !== 'removed' && patch?.kind !== 'restored' && patch?.kind !== 'claim_released') {
        const current = patch?.kind === 'suppression'
          ? this.state.suppressions.get(patch.id)
          : patch?.kind === 'claim'
            ? this.state.claims.get(patch.id)
          : patch?.kind === 'vehicle'
            ? this.state.vehicles.get(patch.id)
            : this.state.objects.get(patch.id);
        if (current && entry.cells.has(cellKey) && !entry.view.has(current)) entry.view.add(current);
      }
    }
  }
}

export { WorldInterestManager };

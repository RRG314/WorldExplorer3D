// Server receipts own charges. This journal owns only the unacknowledged intent
// and its delivery checkpoint. The existing local-possessions Web Lock excludes
// other tabs before dispatch; this guard also excludes duplicate same-page owners.
const active = new WeakMap();
export function createConnectedCommerceRecovery({storage, wallet, backpackStore}) {
  const uid = wallet.uid;
  const key = `world-explorer:commerce-pending:v1:${uid}`;
  const current = () => wallet.isCurrent?.() !== false;
  const failed = reason => ({ok:false, reason, credits:wallet.snapshot().credits});
  function read() {
    const raw = storage.getItem(key);
    if (raw == null) return null;
    const row = JSON.parse(raw);
    if (row?.schemaVersion !== 1 || row.uid !== uid || !row.command?.requestId || !row.store?.id) throw Error('Unreadable commerce receipt');
    return row;
  }
  function write(row) { storage.setItem(key, JSON.stringify(row)); }
  async function guarded(task) {
    if (!uid || !storage || !current()) return failed('commerce_recovery_required');
    await backpackStore.ready;
    if (!current() || !backpackStore.writable()) return failed('save_failed');
    let accounts = active.get(storage);
    if (!accounts) { accounts = new Set(); active.set(storage, accounts); }
    if (accounts.has(uid)) return failed('commerce_recovery_required');
    accounts.add(uid);
    try { return await task(); }
    catch { return failed('commerce_recovery_required'); }
    finally { accounts.delete(uid); }
  }
  async function deliver(row, apply, recovery) {
    if (!current()) return failed('commerce_recovery_required');
    if (!row.receipt) {
      const c = row.command;
      try {
        const receipt = await wallet.transact(c.action, row.store, c.catalogId, c);
        if (!current()) return failed('commerce_recovery_required');
        if (!receipt?.accepted) {
          storage.removeItem(key);
          return failed(receipt?.reason || 'wallet_unavailable');
        }
        if (receipt.requestId !== c.requestId) throw Error('Mismatched commerce receipt');
        row.receipt = receipt;
        write(row);
      } catch (error) {
        // Only a proven pre-dispatch/rejected operation is safe to forget.
        if (error.outcomeUnknown === false) storage.removeItem(key);
        return failed('commerce_recovery_required');
      }
    }
    if (!current()) return failed('commerce_recovery_required');
    const checkpoint = phase => {
      if (!current()) throw Error('Account changed');
      row.phase = phase; write(row);
    };
    const result = await apply(row, {recovery, checkpoint, current});
    if (!current()) return failed('commerce_recovery_required');
    if (result?.complete) storage.removeItem(key);
    const {complete, ...publicResult} = result || failed('commerce_recovery_required');
    return publicResult;
  }
  return Object.freeze({
    perform(command, store, apply) {
      return guarded(async () => {
        if (read()) return failed('commerce_recovery_required');
        const row = {schemaVersion:1, uid, command:{...command, requestId:`commerce:${crypto.randomUUID()}`}, store:{id:store.id,name:store.name}, phase:'request_pending'};
        write(row); // No network or gameplay mutation before this durable write.
        return deliver(row, apply, false);
      });
    },
    async recover(apply) {
      let recovered = 0;
      await guarded(async () => {
        const row = read();
        if (!row) return;
        await deliver(row, apply, true);
        if (!read()) recovered = 1;
      });
      let remaining = 1;
      try { remaining = read() ? 1 : 0; } catch { /* Preserve unreadable bytes. */ }
      return Object.freeze({recovered,remaining});
    }
  });
}

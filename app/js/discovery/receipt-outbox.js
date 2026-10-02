export function pendingDiscoveryReceipt(record, ownerUid, catalogVersion) {
  if (!ownerUid || record.receiptRestore === true) return null;
  const payload = {expectedOwnerUid:ownerUid};
  for (const key of ['claimId','catalogId','worldIdentity','activityId','evidenceClass','name','family','rarityBand','qualityBand']) {
    if (record[key] != null) payload[key] = record[key];
  }
  payload.catalogVersion = catalogVersion || '2026.08.16.1';
  return {id:JSON.stringify([ownerUid,record.claimId]),ownerUid,instanceId:record.instanceId,payload,attempts:0,nextAttemptAt:0,status:'pending'};
}

export function createDiscoveryReceiptSync({store, getOwnerUid, send, now = Date.now, isAvailable = () => true}) {
  let running = null;
  let disposed = false;
  async function run() {
    const ownerUid = getOwnerUid();
    if (disposed || !ownerUid || !isAvailable() || !store.listPendingReceipts) return 0;
    const entries = await store.listPendingReceipts(ownerUid, now());
    let completed = 0;
    for (const entry of entries) {
      if (disposed || getOwnerUid() !== ownerUid || !isAvailable()) break;
      try {
        const receipt = await send(entry.payload);
        if (disposed || getOwnerUid() !== ownerUid) break;
        if (receipt?.ownerUid !== ownerUid || receipt.claimId !== entry.payload.claimId || receipt.catalogId !== entry.payload.catalogId) {
          throw Object.assign(new Error('Receipt identity mismatch.'), {status:422});
        }
        if (await store.completePendingReceipt(entry.id, receipt)) completed++;
      } catch (error) {
        if (disposed || getOwnerUid() !== ownerUid) break;
        const status = Number(error?.status) || 0;
        // Keep invalid claims for diagnosis; do not repeatedly send them. Auth,
        // connectivity, rate limits and ambiguous outcomes retain bounded retries.
        await store.deferPendingReceipt(entry.id, {
          attempts:entry.attempts + 1,
          status:[400,422].includes(status) ? 'blocked' : 'pending',
          lastStatus:status,
          nextAttemptAt:now() + Math.min(3600000, 30000 * 2 ** Math.min(7,entry.attempts))
        });
      }
    }
    return completed;
  }
  return Object.freeze({
    flush() {
      if (!running) running = run().finally(() => {running = null;});
      return running;
    },
    dispose() {disposed = true;}
  });
}

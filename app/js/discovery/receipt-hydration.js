// Read server pages sequentially and retain stable local claim identities.
// This is receipt restoration, not a full Journal or character cloud backup.
export async function hydrateDiscoveryReceipts({ownerUid, isCurrentOwner, listPage, profileStore, claimedIds = new Set()}) {
  if (!ownerUid || !isCurrentOwner()) return {imported:0, complete:false, reason:'account-changed'};
  let cursor = null;
  let imported = 0;
  const seen = new Set();
  do {
    if (!isCurrentOwner()) return {imported, complete:false, reason:'account-changed'};
    const page = await listPage({cursor, expectedOwnerUid:ownerUid});
    if (!isCurrentOwner()) return {imported, complete:false, reason:'account-changed'};
    if (page?.ownerUid !== ownerUid || !Array.isArray(page.items)) throw new Error('Receipt page does not match the signed-in account.');
    for (const receipt of page.items) {
      if (!isCurrentOwner()) return {imported, complete:false, reason:'account-changed'};
      if (!receipt?.claimId || !receipt.catalogId || !receipt.itemId || receipt.ownerUid !== ownerUid) throw new Error('Invalid discovery receipt identity.');
      const result = await profileStore.recordDiscovery({
        receiptRestore:true, instanceId:`item:${receipt.itemId}`, claimId:receipt.claimId, catalogId:receipt.catalogId,
        name:receipt.name || receipt.catalogId, family:receipt.family || 'discovery',
        rarityBand:receipt.rarityBand || 'common', qualityBand:receipt.qualityBand || 'observed',
        discipline:'exploration', activityId:receipt.activityId || 'inspect',
        regionId:receipt.worldIdentity || 'server-region', worldIdentity:receipt.worldIdentity || 'server-region',
        evidenceClass:receipt.evidenceClass || 'virtual-field-record', collectedAt:receipt.createdAtMs || Date.now()
      }, {collection:receipt.recordKind === 'collection'});
      if (!isCurrentOwner()) return {imported, complete:false, reason:'account-changed'};
      if (result.item?.instanceId) await profileStore.applyTrustedReceipt(result.item.instanceId, receipt);
      claimedIds.add(receipt.claimId);
      if (result.recorded) imported++;
    }
    const next = page.nextCursor ?? null;
    if (next !== null && (typeof next !== 'string' || !next || seen.has(next))) throw new Error('Receipt pagination did not advance.');
    if (next) seen.add(next);
    cursor = next;
  } while (cursor);
  return {imported, complete:true};
}

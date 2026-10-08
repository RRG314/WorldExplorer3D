import { persistBackpackProjection } from './save-status.js?v=1';

function discoveryItemBackpackRecord(item) {
  if (!item?.instanceId || !item?.catalogId) return null;
  return {
    instanceId: item.instanceId,
    catalogId: item.catalogId,
    quantity: Number(item.quantity) || 1,
    authority: item.authority || 'anonymous-local',
    provenance: item.provenance || 'field-discovery',
    sourceEventId: item.sourceEventId || item.eventId || item.claimId || '',
    acquiredAt: Number(item.collectedAt) || 0,
    tradeable: item.tradeable === true,
    metadata: {
      discoveryJournalProjection: true,
      label: item.name || item.catalogId,
      category: 'specimen',
      icon: 'FIND',
      verbs: ['inspect'],
      description: item.description || `${item.name || item.catalogId} was added through ${'fieldwork'}.`,
      regionLabel: item.regionLabel || '',
      evidenceClass: item.evidenceClass || ''
    }
  };
}

function projectDiscoveryItemsToBackpack(appCtx, items = [], options = {}) {
  const inventory = appCtx.playerBackpackInventory;
  if (!inventory) return 0;
  if (options.reconcile === true) {
    const ids = new Set(items.map(item=>item.instanceId));
    const events = new Set(items.map(item=>item.sourceEventId || item.eventId || item.claimId).filter(Boolean));
    for (const existing of inventory.snapshot().items) {
      if ((existing.metadata?.discoveryJournalProjection || existing.provenance === 'field-discovery') && !ids.has(existing.instanceId) && !events.has(existing.sourceEventId)) inventory.consume(existing.instanceId,existing.quantity,{silent:true});
    }
  }
  let projected = 0;
  for (const item of items) {
    const record = discoveryItemBackpackRecord(item);
    if (!record) continue;
    inventory.upsertItem(record, {
      definition: {
        id: record.catalogId,
        label: record.metadata.label,
        category: record.metadata.category,
        icon: record.metadata.icon,
        verbs: record.metadata.verbs,
        description: record.metadata.description
      },
      silent: true
    });
    projected += 1;
  }
  persistBackpackProjection(appCtx);
  return projected;
}

export { projectDiscoveryItemsToBackpack };

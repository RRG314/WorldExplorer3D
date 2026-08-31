const TRANSFERABLE_MATERIAL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'reclaimed-aluminum-stock', label: 'Reclaimed aluminum stock', category: 'material', icon: 'METAL', verbs: ['inspect'],
    stackLimit: 12, buyPrice: 34, sellPrice: 14, description: 'Clean game-world metal stock suitable for fabrication.',
    resourceClass: 'metal-feedstock', unitMassKg: 2, expeditionTransfer: Object.freeze({ resourceKey: 'feedstockKg', kgPerUnit: 2 })
  }),
  Object.freeze({
    id: 'ceramic-repair-stock', label: 'Ceramic repair stock', category: 'material', icon: 'CERAMIC', verbs: ['inspect'],
    stackLimit: 12, buyPrice: 28, sellPrice: 12, description: 'Heat-tolerant game-world stock for a fabrication load.',
    resourceClass: 'ceramic-feedstock', unitMassKg: 1.5, expeditionTransfer: Object.freeze({ resourceKey: 'feedstockKg', kgPerUnit: 1.5 })
  }),
  Object.freeze({
    id: 'copper-wire-coil', label: 'Copper wire coil', category: 'material', icon: 'WIRE', verbs: ['inspect'],
    stackLimit: 12, buyPrice: 24, sellPrice: 10, description: 'A compact game-world electrical material bundle.',
    resourceClass: 'electrical-feedstock', unitMassKg: 1, expeditionTransfer: Object.freeze({ resourceKey: 'feedstockKg', kgPerUnit: 1 })
  }),
  Object.freeze({
    id: 'sealed-bearing-kit', label: 'Sealed bearing kit', category: 'repair-supply', icon: 'PARTS', verbs: ['inspect'],
    stackLimit: 8, buyPrice: 46, sellPrice: 19, description: 'Inspected game-world mechanical spares ready for cargo.',
    resourceClass: 'maintenance-parts', unitMassKg: 2, expeditionTransfer: Object.freeze({ resourceKey: 'maintenanceKg', kgPerUnit: 2 })
  }),
  Object.freeze({
    id: 'repair-sealant-case', label: 'Repair sealant case', category: 'repair-supply', icon: 'SEAL', verbs: ['inspect'],
    stackLimit: 8, buyPrice: 38, sellPrice: 16, description: 'A sealed case of game-world repair consumables.',
    resourceClass: 'maintenance-parts', unitMassKg: 1.5, expeditionTransfer: Object.freeze({ resourceKey: 'maintenanceKg', kgPerUnit: 1.5 })
  })
]);

const MATERIAL_BY_ID = new Map(TRANSFERABLE_MATERIAL_DEFINITIONS.map((entry) => [entry.id, entry]));

function transferableMaterial(catalogId) {
  return MATERIAL_BY_ID.get(String(catalogId || '')) || null;
}

function summarizeExpeditionTransfers(items = []) {
  const transfers = [];
  const resources = {};
  let totalMassKg = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const definition = transferableMaterial(item?.catalogId);
    const quantity = Math.max(0, Math.floor(Number(item?.quantity) || 0));
    if (!definition?.expeditionTransfer || quantity <= 0) continue;
    const massKg = definition.expeditionTransfer.kgPerUnit * quantity;
    totalMassKg += massKg;
    resources[definition.expeditionTransfer.resourceKey] = Number(resources[definition.expeditionTransfer.resourceKey] || 0) + massKg;
    transfers.push(Object.freeze({
      instanceId: String(item.instanceId || ''),
      catalogId: definition.id,
      label: definition.label,
      quantity,
      massKg,
      resourceKey: definition.expeditionTransfer.resourceKey
    }));
  }
  return Object.freeze({ transfers: Object.freeze(transfers), resources: Object.freeze(resources), totalMassKg });
}

export { summarizeExpeditionTransfers, transferableMaterial, TRANSFERABLE_MATERIAL_DEFINITIONS };

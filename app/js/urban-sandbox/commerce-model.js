import { TRANSFERABLE_MATERIAL_DEFINITIONS } from '../resources/material-catalog.js?v=2';
import { normalizePoi } from '../poi/semantic-authority.js?v=3';
import { associatePoiToBuilding } from '../poi/building-association.js?v=1';
import { VEHICLE_UPGRADE_SERVICES } from '../transport/vehicle-upgrades.js?v=1';

const COMMERCE_SCHEMA_VERSION = 4;
const COMMERCE_STORAGE_KEY = 'world-explorer:local-commerce:v1';
const STARTING_EXPLORER_CREDITS = 1000000;
const LEGACY_CURRENCY_SCALE = 2000;
const STANDARD_DAILY_QUANTITY = 3;
const POI_SERVICE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'vehicle-full-repair', capability: 'service.vehicleRepair', label: 'Full vehicle repair', price: 3800, description: 'Restore the current road vehicle to full condition.' }),
  Object.freeze({ id: 'companion-wellness', capability: 'service.companionCare', label: 'Companion wellness visit', price: 180, description: 'Care for the active companion and record a wellness visit.' }),
  Object.freeze({ id: 'player-treatment', capability: 'service.playerCare', label: 'Explorer treatment', price: 450, description: 'Restore the explorer’s condition at this mapped medical place.' }),
  Object.freeze({ id: 'vessel-full-repair', capability: 'service.vesselRepair', label: 'Full vessel repair', price: 4200, description: 'Restore the current surface vessel to full condition.' }),
  ...VEHICLE_UPGRADE_SERVICES
]);
const SERVICE_BY_ID = new Map(POI_SERVICE_DEFINITIONS.map((service) => [service.id, service]));

const COMMERCE_ITEM_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'trail-water', label: 'Trail water', category: 'consumable', icon: 'WATER', verbs: ['consume', 'inspect'], consumeLabel: 'Drink', conditionRestore: .05, buyPrice: 4, sellPrice: 2, description: 'A sealed drink that restores 5% explorer health.' }),
  Object.freeze({ id: 'route-snack', label: 'Route snack', category: 'consumable', icon: 'SNACK', verbs: ['consume', 'inspect'], consumeLabel: 'Eat', conditionRestore: .12, buyPrice: 6, sellPrice: 3, description: 'A compact snack that restores 12% explorer health.' }),
  Object.freeze({ id: 'battery-pack', label: 'Battery pack', category: 'trade-good', icon: 'POWER', verbs: ['inspect'], buyPrice: 14, sellPrice: 7, description: 'Spare power for field gear.' }),
  Object.freeze({ id: 'first-aid-pouch', label: 'First-aid pouch', category: 'consumable', icon: 'AID', verbs: ['consume', 'inspect'], consumeLabel: 'Use first aid', conditionRestore: .35, buyPrice: 18, sellPrice: 9, description: 'Basic first aid that restores 35% explorer health.' }),
  Object.freeze({ id: 'field-medicine', label: 'Field medicine', category: 'consumable', icon: 'MED', verbs: ['consume', 'inspect'], consumeLabel: 'Take medicine', conditionRestore: .55, buyPrice: 34, sellPrice: 17, description: 'Medical supplies that restore 55% explorer health.' }),
  Object.freeze({ id: 'city-postcard', label: 'City postcard', category: 'trade-good', icon: 'CARD', verbs: ['inspect'], buyPrice: 10, sellPrice: 5, description: 'A game keepsake from the current stop.' }),
  Object.freeze({ id: 'field-notebook', label: 'Pocket field notebook', category: 'trade-good', icon: 'NOTES', verbs: ['inspect'], buyPrice: 12, sellPrice: 6, description: 'A small notebook for an explorer loadout.' }),
  Object.freeze({ id: 'route-patch', label: 'Route patch', category: 'rare-find', icon: 'PATCH', verbs: ['inspect'], sellPrice: 28, description: 'A rare counter find from a local store visit.' }),
  Object.freeze({ id: 'transit-token', label: 'Explorer transit token', category: 'rare-find', icon: 'TOKEN', verbs: ['inspect'], sellPrice: 32, description: 'A collectible game token inspired by city travel.' }),
  Object.freeze({ id: 'night-walk-pin', label: 'Night walk pin', category: 'rare-find', icon: 'PIN', verbs: ['inspect'], sellPrice: 30, description: 'A rare pin for evening explorer kits.' }),
  Object.freeze({ id: 'harbor-compass-charm', label: 'Compass charm', category: 'rare-find', icon: 'CHARM', verbs: ['inspect'], sellPrice: 35, description: 'A small rare find for a travel pack.' }),
  ...TRANSFERABLE_MATERIAL_DEFINITIONS
]);

const STOCK_IDS_BY_KIND = Object.freeze({
  convenience: Object.freeze(['trail-water', 'route-snack', 'battery-pack', 'first-aid-pouch', 'city-postcard', 'field-notebook']),
  market: Object.freeze(['trail-water', 'route-snack', 'first-aid-pouch', 'field-medicine', 'city-postcard', 'field-notebook']),
  fuel: Object.freeze(['trail-water', 'route-snack', 'battery-pack', 'copper-wire-coil', 'repair-sealant-case']),
  hardware: Object.freeze(['battery-pack', 'field-notebook', 'reclaimed-aluminum-stock', 'ceramic-repair-stock', 'copper-wire-coil', 'repair-sealant-case']),
  mechanic: Object.freeze(['battery-pack', 'reclaimed-aluminum-stock', 'copper-wire-coil', 'sealed-bearing-kit', 'repair-sealant-case']),
  pawn: Object.freeze(['city-postcard', 'field-notebook', 'reclaimed-aluminum-stock', 'copper-wire-coil', 'sealed-bearing-kit']),
  outdoor: Object.freeze(['trail-water', 'route-snack', 'battery-pack', 'first-aid-pouch', 'field-notebook']),
  pet: Object.freeze(['trail-water', 'first-aid-pouch', 'field-notebook']),
  medical: Object.freeze(['field-medicine', 'first-aid-pouch', 'trail-water', 'battery-pack']),
  marine: Object.freeze(['trail-water', 'battery-pack', 'first-aid-pouch', 'copper-wire-coil', 'sealed-bearing-kit', 'repair-sealant-case'])
});
const RARE_TRADES = Object.freeze([
  Object.freeze({ itemId: 'route-patch', credits: 20, requirementId: 'city-postcard', requirementQuantity: 2 }),
  Object.freeze({ itemId: 'transit-token', credits: 18, requirementId: 'field-notebook', requirementQuantity: 2 }),
  Object.freeze({ itemId: 'night-walk-pin', credits: 22, requirementId: 'battery-pack', requirementQuantity: 1 }),
  Object.freeze({ itemId: 'harbor-compass-charm', credits: 24, requirementId: 'first-aid-pouch', requirementQuantity: 1 })
]);
const ITEM_BY_ID = new Map(COMMERCE_ITEM_DEFINITIONS.map((item) => [item.id, item]));

function hashText(value = '') {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function commerceDayKey(at = Date.now()) {
  const date = new Date(Number(at) || Date.now());
  return date.toISOString().slice(0, 10);
}

function commercePresentation(record) {
  const capabilities = new Set(record?.semantic?.capabilities || []);
  const tags = record?.source?.tags || {};
  if (capabilities.has('service.vehicleRepair') || capabilities.has('service.vehicleUpgrade') || capabilities.has('retail.vehicleParts')) {
    return Object.freeze({ kind: 'mechanic', label: 'Automotive service' });
  }
  if (capabilities.has('retail.vehicleSupplies')) return Object.freeze({ kind: 'fuel', label: 'Vehicle supplies' });
  if (capabilities.has('service.companionCare') || capabilities.has('retail.petSupplies')) return Object.freeze({ kind: 'pet', label: 'Pet and veterinary' });
  if (capabilities.has('service.playerCare') || capabilities.has('retail.medicalSupplies')) return Object.freeze({ kind: 'medical', label: 'Medical care' });
  if (capabilities.has('service.vesselRepair') || capabilities.has('retail.marineSupplies')) return Object.freeze({ kind: 'marine', label: 'Marine service' });
  if (capabilities.has('retail.fieldSupplies')) {
    return ['hardware', 'doityourself'].includes(tags.shop)
      ? Object.freeze({ kind: 'hardware', label: 'Hardware and field supply' })
      : Object.freeze({ kind: 'outdoor', label: 'Outdoor and field supply' });
  }
  if (capabilities.has('retail.general')) {
    if (['supermarket', 'general', 'department_store'].includes(tags.shop) || tags.amenity === 'marketplace') {
      return Object.freeze({ kind: 'market', label: 'General market' });
    }
    if (['pawnbroker', 'second_hand'].includes(tags.shop)) return Object.freeze({ kind: 'pawn', label: 'Second-hand store' });
    return Object.freeze({ kind: 'convenience', label: 'Convenience store' });
  }
  return null;
}

function mappedCommercePlaces(pois = [], options = {}) {
  return (Array.isArray(pois) ? pois : []).map((poi) => {
    const record = poi?.type === 'WorldExplorerPoi' ? poi : normalizePoi(poi);
    const presentation = commercePresentation(record);
    const sourceTags = record.source?.tags || {};
    const mappedType = String(poi?.mappedType || (poi?.type === 'WorldExplorerPoi' ? '' : poi?.type) || (
      sourceTags.shop ? `shop=${sourceTags.shop}` :
        sourceTags.amenity ? `amenity=${sourceTags.amenity}` :
          sourceTags.healthcare ? `healthcare=${sourceTags.healthcare}` :
            sourceTags.leisure ? `leisure=${sourceTags.leisure}` : ''
    )).toLowerCase();
    if (!presentation || !record.stable || !record.position || !record.semantic.functional) return null;
    return Object.freeze({
      ...presentation,
      id: record.id,
      poiId: record.id,
      sourceFeatureId: record.source.featureId,
      name: String(record.source.name || poi.name || presentation.label),
      mappedType,
      x: record.position.x,
      z: record.position.z,
      provider: String(poi.provider || record.source.provider || 'OpenStreetMap'),
      license: record.source.license,
      attribution: record.source.attribution,
      sourceElementType: record.source.elementType,
      sourceElementId: record.source.elementId,
      semantic: record.semantic,
      sourceFacts: record.source,
      buildingAssociation: record.buildingAssociation || associatePoiToBuilding(record, options.buildings || [], options),
      provenance: 'loaded-map-poi'
    });
  }).filter(Boolean);
}

function mappedConvenienceStores(pois = []) {
  return mappedCommercePlaces(pois).filter((place) => place.kind === 'convenience');
}

function stockForStore(store = {}, dayKey = commerceDayKey()) {
  const seed = hashText(`${store.id || 'store'}:${dayKey}`);
  const storeKind = STOCK_IDS_BY_KIND[store.kind] ? store.kind : 'convenience';
  const stockIds = STOCK_IDS_BY_KIND[storeKind];
  const standardItems = stockIds.map((id) => ITEM_BY_ID.get(id)).filter(Boolean);
  const start = seed % standardItems.length;
  const rare = RARE_TRADES[(seed >>> 8) % RARE_TRADES.length];
  const standard = Array.from({ length: Math.min(4, standardItems.length) }, (_, index) => standardItems[(start + index) % standardItems.length]);
  const essentialId = ['convenience', 'market'].includes(storeKind)
    ? 'route-snack'
    : storeKind === 'medical' ? 'field-medicine' : '';
  if (essentialId && !standard.some((item) => item.id === essentialId)) {
    standard[standard.length - 1] = ITEM_BY_ID.get(essentialId);
  }
  if (!standard.some((item) => item.id === rare.requirementId)) {
    const replacementIndex = Math.max(0, standard.findIndex((item) => item.id !== essentialId));
    standard[replacementIndex] = ITEM_BY_ID.get(rare.requirementId);
  }
  return Object.freeze({
    dayKey,
    standard: Object.freeze(standard),
    rare: Object.freeze({
      ...rare,
      item: ITEM_BY_ID.get(rare.itemId),
      requirement: ITEM_BY_ID.get(rare.requirementId)
    })
  });
}

function parseState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(COMMERCE_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const legacyScale = Number(parsed.schemaVersion || 1) < COMMERCE_SCHEMA_VERSION ? LEGACY_CURRENCY_SCALE : 1;
    return {
      schemaVersion: COMMERCE_SCHEMA_VERSION,
      credits: Math.max(0, Math.floor((Number(parsed.credits) || 0) * legacyScale)),
      purchases: parsed.purchases && typeof parsed.purchases === 'object' ? { ...parsed.purchases } : {},
      claimedTrades: parsed.claimedTrades && typeof parsed.claimedTrades === 'object' ? { ...parsed.claimedTrades } : {},
      pendingSettlements: parsed.pendingSettlements && typeof parsed.pendingSettlements === 'object' ? { ...parsed.pendingSettlements } : {},
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions.slice(-60) : []
    };
  } catch (_) {
    return null;
  }
}

function createLocalCommerceModel(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const inventory = options.inventory;
  const transactionAuthority = options.transactionAuthority || null;
  const clock = options.now || (() => Date.now());
  let state = parseState(storage) || {
    schemaVersion: COMMERCE_SCHEMA_VERSION,
    credits: STARTING_EXPLORER_CREDITS,
    purchases: {},
    claimedTrades: {},
    pendingSettlements: {},
    transactions: []
  };
  inventory?.registerDefinitions?.(COMMERCE_ITEM_DEFINITIONS);

  function save() {
    try {
      storage?.setItem?.(COMMERCE_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  function record(type, detail = {}) {
    state.transactions.push({ type, ...detail, at: Number(clock()) || Date.now() });
    state.transactions = state.transactions.slice(-60);
    save();
  }

  function wallet() {
    const connected = transactionAuthority?.snapshot?.();
    if (connected) return Object.freeze({ type: 'ExplorerWallet', schemaVersion: COMMERCE_SCHEMA_VERSION, ...connected, transactions: Object.freeze(state.transactions.slice()) });
    return Object.freeze({
      type: 'ExplorerWallet',
      schemaVersion: COMMERCE_SCHEMA_VERSION,
      credits: state.credits,
      transactions: Object.freeze(state.transactions.slice())
    });
  }

  function debit(amount, detail = {}) {
    if (transactionAuthority) return Object.freeze({ ok: false, reason: 'connected_wallet_action_required', credits: wallet().credits });
    const credits = Math.max(0, Math.floor(Number(amount) || 0));
    if (credits <= 0) return Object.freeze({ ok: false, reason: 'invalid_amount', credits: state.credits });
    if (state.credits < credits) return Object.freeze({ ok: false, reason: 'not_enough_credits', credits: state.credits });
    const { type = 'debit', ...transactionDetail } = detail;
    state.credits -= credits;
    record(String(type), { ...transactionDetail, credits });
    return Object.freeze({ ok: true, amount: credits, credits: state.credits });
  }

  function credit(amount, detail = {}) {
    if (transactionAuthority) return Object.freeze({ ok: false, reason: 'connected_wallet_action_required', credits: wallet().credits });
    const credits = Math.max(0, Math.floor(Number(amount) || 0));
    if (credits <= 0) return Object.freeze({ ok: false, reason: 'invalid_amount', credits: state.credits });
    const { type = 'credit', ...transactionDetail } = detail;
    state.credits += credits;
    record(String(type), { ...transactionDetail, credits });
    return Object.freeze({ ok: true, amount: credits, credits: state.credits });
  }

  function inventoryItem(catalogId) {
    return inventory?.snapshot?.().items?.find((item) => item.catalogId === catalogId) || null;
  }

  function grant(catalogId, store, provenance, authorityReceipt = null) {
    const definition = ITEM_BY_ID.get(catalogId);
    if (!definition) return false;
    const existing = inventoryItem(catalogId);
    const authoritativeQuantity = Number(authorityReceipt?.itemQuantity);
    inventory?.upsertItem?.({
      instanceId: existing?.instanceId || `commerce:${catalogId}`,
      catalogId,
      quantity: Number.isFinite(authoritativeQuantity) ? Math.max(1, authoritativeQuantity) : Number(existing?.quantity || 0) + 1,
      authority: 'anonymous-local',
      provenance,
      sourceEventId: '',
      tradeable: true,
      acquiredAt: Number(clock()) || Date.now(),
      metadata: {
        label: definition.label,
        category: definition.category,
        icon: definition.icon,
        verbs: definition.verbs,
        description: definition.description,
        conditionRestore: Number(definition.conditionRestore || 0),
        consumeLabel: String(definition.consumeLabel || ''),
        commerceSellValue: definition.sellPrice,
        explorerWalletItem: authorityReceipt?.itemId || '',
        explorerWalletReceipt: authorityReceipt?.requestId || '',
        storeId: store.id,
        storeName: store.name
      }
    }, { definition });
    return true;
  }

  function reconcileSale(catalogId, receipt) {
    const item = inventoryItem(catalogId);
    const quantity = Math.max(0, Number(receipt?.itemQuantity) || 0);
    if (!item) return quantity === 0;
    if (quantity === 0) {
      return inventory?.consumeItem?.(item.instanceId, Math.max(1, Number(item.quantity || 1))) === true;
    }
    return Boolean(inventory?.upsertItem?.({ ...item, quantity }, { definition: ITEM_BY_ID.get(catalogId) }));
  }

  function storeSnapshot(store, at = clock()) {
    const stock = stockForStore(store, commerceDayKey(at));
    const inventorySnapshot = inventory?.snapshot?.() || { items: [] };
    const standard = stock.standard.map((item) => {
      const key = `${stock.dayKey}:${store.id}:${item.id}`;
      const purchased = Math.max(0, Number(state.purchases[key]) || 0);
      return Object.freeze({ ...item, remaining: Math.max(0, STANDARD_DAILY_QUANTITY - purchased) });
    });
    const claimKey = `${stock.dayKey}:${store.id}:${stock.rare.itemId}`;
    const requirementCarried = inventorySnapshot.items
      .filter((item) => item.catalogId === stock.rare.requirementId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const sellable = inventorySnapshot.items.filter((item) =>
      item.tradeable === true && Number(item.metadata?.commerceSellValue || 0) > 0 && (
        !Array.isArray(item.metadata?.allowedCommerceKinds) || item.metadata.allowedCommerceKinds.includes(store.kind)
      )
    ).map((item) => Object.freeze({
      instanceId: item.instanceId,
      catalogId: item.catalogId,
      label: item.label,
      quantity: Number(item.quantity || 0),
      sellPrice: Number(item.metadata.commerceSellValue)
    }));
    return Object.freeze({
      type: 'LocalStoreSnapshot',
      schemaVersion: COMMERCE_SCHEMA_VERSION,
      credits: wallet().credits,
      store,
      dayKey: stock.dayKey,
      standard: Object.freeze(standard),
      services: Object.freeze(POI_SERVICE_DEFINITIONS.filter((service) => store.semantic?.capabilities?.includes(service.capability))),
      rare: Object.freeze({
        ...stock.rare,
        claimed: state.claimedTrades[claimKey] === true,
        requirementCarried,
        available: !transactionAuthority && state.claimedTrades[claimKey] !== true &&
          wallet().credits >= stock.rare.credits && requirementCarried >= stock.rare.requirementQuantity
      }),
      sellable: Object.freeze(sellable),
      inventoryAuthority: 'world-explorer-gameplay',
      placeAuthority: store.provenance
    });
  }

  function buy(store, catalogId) {
    const snapshot = storeSnapshot(store);
    const item = snapshot.standard.find((entry) => entry.id === String(catalogId || ''));
    if (!item) return Object.freeze({ ok: false, reason: 'not_in_today_stock' });
    if (item.remaining <= 0) return Object.freeze({ ok: false, reason: 'sold_out' });
    if (snapshot.credits < item.buyPrice) return Object.freeze({ ok: false, reason: 'not_enough_credits' });
    if (transactionAuthority?.transact) {
      return transactionAuthority.transact('buy', store, item.id, { dayKey: snapshot.dayKey }).then((receipt) => {
        if (!receipt?.accepted) return Object.freeze({ ok: false, reason: receipt?.reason || 'wallet_unavailable', credits: receipt?.credits });
        if (!grant(item.id, store, 'connected-store-purchase', receipt)) return Object.freeze({ ok: false, reason: 'inventory_unavailable', credits: receipt.credits });
        const key = `${snapshot.dayKey}:${store.id}:${item.id}`;
        state.purchases[key] = Math.max(Number(receipt.storePurchased || 0), Math.max(0, Number(state.purchases[key]) || 0) + 1);
        record('buy', { storeId: store.id, catalogId: item.id, credits: item.buyPrice, receiptId: receipt.requestId, authority: 'explorer-wallet-v2' });
        return Object.freeze({ ok: true, item, credits: receipt.credits, receiptId: receipt.requestId });
      }).catch(() => Object.freeze({ ok: false, reason: 'wallet_unavailable', credits: wallet().credits }));
    }
    if (!grant(item.id, store, 'local-store-purchase')) return Object.freeze({ ok: false, reason: 'inventory_unavailable' });
    const key = `${snapshot.dayKey}:${store.id}:${item.id}`;
    state.purchases[key] = Math.max(0, Number(state.purchases[key]) || 0) + 1;
    state.credits -= item.buyPrice;
    record('buy', { storeId: store.id, catalogId: item.id, credits: item.buyPrice });
    return Object.freeze({ ok: true, item, credits: state.credits });
  }

  function sell(store, instanceId) {
    const item = inventory?.snapshot?.().items?.find((entry) => entry.instanceId === String(instanceId || ''));
    const sellPrice = Number(item?.metadata?.commerceSellValue || 0);
    if (!item || item.tradeable !== true || sellPrice <= 0) return Object.freeze({ ok: false, reason: 'not_sellable' });
    if (Array.isArray(item.metadata?.allowedCommerceKinds) && !item.metadata.allowedCommerceKinds.includes(store.kind)) {
      return Object.freeze({ ok: false, reason: 'store_not_authorized_for_item' });
    }
    if (transactionAuthority?.transact) {
      if (!item.metadata?.explorerWalletItem) return Object.freeze({ ok: false, reason: 'item_not_wallet_verified' });
      return transactionAuthority.transact('sell', store, item.catalogId, { dayKey: commerceDayKey(clock()) }).then((receipt) => {
        if (!receipt?.accepted) return Object.freeze({ ok: false, reason: receipt?.reason || 'wallet_unavailable', credits: receipt?.credits });
        if (!reconcileSale(item.catalogId, receipt)) return Object.freeze({ ok: false, reason: 'delivery_recovery_required', credits: receipt.credits });
        record('sell', { storeId: store.id, catalogId: item.catalogId, credits: sellPrice, receiptId: receipt.requestId, authority: 'explorer-wallet-v2' });
        return Object.freeze({ ok: true, item, credits: receipt.credits, receiptId: receipt.requestId });
      }).catch(() => Object.freeze({ ok: false, reason: 'wallet_unavailable', credits: wallet().credits }));
    }
    if (!inventory?.consumeItem?.(item.instanceId, 1)) return Object.freeze({ ok: false, reason: 'inventory_unavailable' });
    state.credits += sellPrice;
    record('sell', { storeId: store.id, catalogId: item.catalogId, credits: sellPrice });
    return Object.freeze({ ok: true, item, credits: state.credits });
  }

  function trade(store) {
    if (transactionAuthority?.transact) return Object.freeze({ ok: false, reason: 'connected_trade_unavailable' });
    const snapshot = storeSnapshot(store);
    if (snapshot.rare.claimed) return Object.freeze({ ok: false, reason: 'already_traded_today' });
    if (state.credits < snapshot.rare.credits) return Object.freeze({ ok: false, reason: 'not_enough_credits' });
    if (snapshot.rare.requirementCarried < snapshot.rare.requirementQuantity) return Object.freeze({ ok: false, reason: 'missing_trade_items' });
    if (!inventory?.consumeItem?.(snapshot.rare.requirementId, snapshot.rare.requirementQuantity)) {
      return Object.freeze({ ok: false, reason: 'inventory_unavailable' });
    }
    if (!grant(snapshot.rare.itemId, store, 'local-store-rare-trade')) return Object.freeze({ ok: false, reason: 'inventory_unavailable' });
    const claimKey = `${snapshot.dayKey}:${store.id}:${snapshot.rare.itemId}`;
    state.claimedTrades[claimKey] = true;
    state.credits -= snapshot.rare.credits;
    record('rare-trade', {
      storeId: store.id,
      catalogId: snapshot.rare.itemId,
      requirementId: snapshot.rare.requirementId,
      requirementQuantity: snapshot.rare.requirementQuantity,
      credits: snapshot.rare.credits
    });
    return Object.freeze({ ok: true, item: snapshot.rare.item, credits: state.credits });
  }

  async function service(store, serviceId, applyEffect = null, serviceContext = {}) {
    const snapshot = storeSnapshot(store);
    const definition = SERVICE_BY_ID.get(String(serviceId || ''));
    if (!definition || !snapshot.services.some((entry) => entry.id === definition.id)) {
      return Object.freeze({ ok: false, reason: 'service_not_available' });
    }
    if (snapshot.credits < definition.price) return Object.freeze({ ok: false, reason: 'not_enough_credits', credits: snapshot.credits });
    if (transactionAuthority?.transact) {
      try {
        const receipt = await transactionAuthority.transact('service', store, definition.id, {
          dayKey: snapshot.dayKey,
          targetId: String(serviceContext.targetId || '')
        });
        if (!receipt?.accepted) return Object.freeze({ ok: false, reason: receipt?.reason || 'wallet_unavailable', credits: receipt?.credits });
        state.pendingSettlements[receipt.requestId] = {
          receipt,
          storeId: store.id,
          serviceId: definition.id,
          phase: 'effect_pending'
        };
        save();
        let applied = false;
        try {
          applied = typeof applyEffect === 'function' && await applyEffect(definition, receipt.requestId) === true;
        } catch (_) {
          applied = false;
        }
        if (applied) {
          state.pendingSettlements[receipt.requestId].phase = 'effect_applied';
          save();
          const settled = await transactionAuthority.settle(receipt, 'applied');
          if (settled?.settlementStatus !== 'complete') {
            return Object.freeze({ ok: false, reason: 'settlement_recovery_required', credits: settled?.credits ?? receipt.credits });
          }
          delete state.pendingSettlements[receipt.requestId];
          record('service', {
            storeId: store.id,
            catalogId: definition.id,
            credits: definition.price,
            receiptId: receipt.requestId,
            authority: 'explorer-wallet-v2'
          });
          return Object.freeze({ ok: true, service: definition, credits: settled.credits, receiptId: receipt.requestId });
        }
        const compensated = await transactionAuthority.settle(receipt, 'failed', 'gameplay_effect_unavailable');
        if (compensated?.settlementStatus === 'compensated') delete state.pendingSettlements[receipt.requestId];
        save();
        return Object.freeze({
          ok: false,
          reason: compensated?.settlementStatus === 'compensated' ? 'service_effect_failed_refunded' : 'settlement_recovery_required',
          credits: compensated?.credits ?? receipt.credits
        });
      } catch (_) {
        return Object.freeze({
          ok: false,
          reason: Object.keys(state.pendingSettlements).length ? 'settlement_recovery_required' : 'wallet_unavailable',
          credits: wallet().credits
        });
      }
    }
    let applied = false;
    try {
      applied = typeof applyEffect === 'function' && await applyEffect(
        definition,
        `local:${snapshot.dayKey}:${store.id}:${definition.id}`
      ) === true;
    } catch (_) {
      applied = false;
    }
    if (!applied) return Object.freeze({ ok: false, reason: 'service_effect_failed_refunded', credits: state.credits });
    state.credits -= definition.price;
    record('service', { storeId: store.id, catalogId: definition.id, credits: definition.price });
    return Object.freeze({ ok: true, service: definition, credits: state.credits, receiptId: `local:${snapshot.dayKey}:${store.id}:${definition.id}` });
  }

  async function recoverPending(applyEffect = null) {
    if (!transactionAuthority?.settle) return Object.freeze({ recovered: 0, remaining: 0 });
    let recovered = 0;
    for (const [requestId, pending] of Object.entries(state.pendingSettlements)) {
      const definition = SERVICE_BY_ID.get(pending.serviceId);
      let applied = pending.phase === 'effect_applied';
      if (!applied && definition && typeof applyEffect === 'function') {
        try { applied = await applyEffect(definition, requestId) === true; } catch (_) { applied = false; }
      }
      try {
        const settled = await transactionAuthority.settle(
          pending.receipt,
          applied ? 'applied' : 'failed',
          applied ? '' : 'recovery_effect_unavailable'
        );
        if (['complete', 'compensated'].includes(settled?.settlementStatus)) {
          delete state.pendingSettlements[requestId];
          recovered += 1;
        }
      } catch (_) {
        // The durable entry remains for the next signed-in recovery attempt.
      }
    }
    save();
    return Object.freeze({ recovered, remaining: Object.keys(state.pendingSettlements).length });
  }

  save();
  return Object.freeze({
    type: 'WorldExplorerEconomy',
    buy,
    credit,
    debit,
    recoverPending,
    sell,
    service,
    snapshot: storeSnapshot,
    trade,
    wallet
  });
}

export {
  COMMERCE_ITEM_DEFINITIONS,
  COMMERCE_SCHEMA_VERSION,
  COMMERCE_STORAGE_KEY,
  POI_SERVICE_DEFINITIONS,
  STARTING_EXPLORER_CREDITS,
  commerceDayKey,
  createLocalCommerceModel,
  mappedCommercePlaces,
  mappedConvenienceStores,
  commercePresentation,
  stockForStore
};

import { TRANSFERABLE_MATERIAL_DEFINITIONS } from '../resources/material-catalog.js?v=2';

const COMMERCE_SCHEMA_VERSION = 2;
const COMMERCE_STORAGE_KEY = 'world-explorer:local-commerce:v1';
const STARTING_EXPLORER_CREDITS = 120;
const STANDARD_DAILY_QUANTITY = 3;

const COMMERCE_ITEM_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'trail-water', label: 'Trail water', category: 'trade-good', icon: 'WATER', verbs: ['inspect'], buyPrice: 4, sellPrice: 2, description: 'A sealed drink for the next walk.' }),
  Object.freeze({ id: 'route-snack', label: 'Route snack', category: 'trade-good', icon: 'SNACK', verbs: ['inspect'], buyPrice: 6, sellPrice: 3, description: 'A compact snack from today’s game stock.' }),
  Object.freeze({ id: 'battery-pack', label: 'Battery pack', category: 'trade-good', icon: 'POWER', verbs: ['inspect'], buyPrice: 14, sellPrice: 7, description: 'Spare power for field gear.' }),
  Object.freeze({ id: 'first-aid-pouch', label: 'First-aid pouch', category: 'trade-good', icon: 'AID', verbs: ['inspect'], buyPrice: 18, sellPrice: 9, description: 'Basic supplies carried as Backpack gear.' }),
  Object.freeze({ id: 'city-postcard', label: 'City postcard', category: 'trade-good', icon: 'CARD', verbs: ['inspect'], buyPrice: 10, sellPrice: 5, description: 'A game keepsake from the current stop.' }),
  Object.freeze({ id: 'field-notebook', label: 'Pocket field notebook', category: 'trade-good', icon: 'NOTES', verbs: ['inspect'], buyPrice: 12, sellPrice: 6, description: 'A small notebook for an explorer loadout.' }),
  Object.freeze({ id: 'route-patch', label: 'Route patch', category: 'rare-find', icon: 'PATCH', verbs: ['inspect'], sellPrice: 28, description: 'A rare counter find from a local store visit.' }),
  Object.freeze({ id: 'transit-token', label: 'Explorer transit token', category: 'rare-find', icon: 'TOKEN', verbs: ['inspect'], sellPrice: 32, description: 'A collectible game token inspired by city travel.' }),
  Object.freeze({ id: 'night-walk-pin', label: 'Night walk pin', category: 'rare-find', icon: 'PIN', verbs: ['inspect'], sellPrice: 30, description: 'A rare pin for evening explorer kits.' }),
  Object.freeze({ id: 'harbor-compass-charm', label: 'Compass charm', category: 'rare-find', icon: 'CHARM', verbs: ['inspect'], sellPrice: 35, description: 'A small rare find for a travel pack.' }),
  ...TRANSFERABLE_MATERIAL_DEFINITIONS
]);

const MAPPED_COMMERCE_PLACE_TYPES = Object.freeze({
  'shop=convenience': Object.freeze({ kind: 'convenience', label: 'Convenience store' }),
  'shop=supermarket': Object.freeze({ kind: 'market', label: 'Market' }),
  'amenity=fuel': Object.freeze({ kind: 'fuel', label: 'Fuel station' }),
  'amenity=charging_station': Object.freeze({ kind: 'fuel', label: 'Charging station' }),
  'shop=hardware': Object.freeze({ kind: 'hardware', label: 'Hardware store' }),
  'shop=doityourself': Object.freeze({ kind: 'hardware', label: 'Home and building supply' }),
  'shop=pawnbroker': Object.freeze({ kind: 'pawn', label: 'Pawn shop' }),
  'shop=second_hand': Object.freeze({ kind: 'pawn', label: 'Second-hand shop' }),
  'shop=car_repair': Object.freeze({ kind: 'mechanic', label: 'Repair shop' }),
  'shop=car_parts': Object.freeze({ kind: 'mechanic', label: 'Vehicle parts shop' }),
  'shop=outdoor': Object.freeze({ kind: 'outdoor', label: 'Outdoor shop' }),
  'shop=fishing': Object.freeze({ kind: 'outdoor', label: 'Fishing shop' }),
  'shop=boat': Object.freeze({ kind: 'outdoor', label: 'Boat shop' }),
  'shop=aviation': Object.freeze({ kind: 'outdoor', label: 'Aviation shop' })
});
const STOCK_IDS_BY_KIND = Object.freeze({
  convenience: Object.freeze(['trail-water', 'route-snack', 'battery-pack', 'first-aid-pouch', 'city-postcard', 'field-notebook']),
  market: Object.freeze(['trail-water', 'route-snack', 'first-aid-pouch', 'city-postcard', 'field-notebook']),
  fuel: Object.freeze(['trail-water', 'route-snack', 'battery-pack', 'copper-wire-coil', 'repair-sealant-case']),
  hardware: Object.freeze(['battery-pack', 'field-notebook', 'reclaimed-aluminum-stock', 'ceramic-repair-stock', 'copper-wire-coil', 'repair-sealant-case']),
  mechanic: Object.freeze(['battery-pack', 'reclaimed-aluminum-stock', 'copper-wire-coil', 'sealed-bearing-kit', 'repair-sealant-case']),
  pawn: Object.freeze(['city-postcard', 'field-notebook', 'reclaimed-aluminum-stock', 'copper-wire-coil', 'sealed-bearing-kit']),
  outdoor: Object.freeze(['trail-water', 'route-snack', 'battery-pack', 'first-aid-pouch', 'field-notebook'])
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

function mappedCommercePlaces(pois = []) {
  return (Array.isArray(pois) ? pois : []).filter((poi) =>
    MAPPED_COMMERCE_PLACE_TYPES[String(poi?.type || '').toLowerCase()] &&
    Number.isFinite(Number(poi?.x)) && Number.isFinite(Number(poi?.z))
  ).map((poi) => Object.freeze({
    ...MAPPED_COMMERCE_PLACE_TYPES[String(poi.type).toLowerCase()],
    id: String(poi.sourceFeatureId || `${poi.sourceElementType || 'poi'}:${poi.sourceElementId || `${poi.x}:${poi.z}`}`),
    name: String(poi.name || MAPPED_COMMERCE_PLACE_TYPES[String(poi.type).toLowerCase()].label),
    mappedType: String(poi.type).toLowerCase(),
    x: Number(poi.x),
    z: Number(poi.z),
    provider: String(poi.provider || 'OpenStreetMap'),
    license: String(poi.license || 'ODbL-1.0'),
    attribution: String(poi.attribution || '© OpenStreetMap contributors'),
    sourceElementType: String(poi.sourceElementType || ''),
    sourceElementId: String(poi.sourceElementId || ''),
    provenance: 'loaded-map-poi'
  }));
}

function mappedConvenienceStores(pois = []) {
  return mappedCommercePlaces(pois).filter((place) => place.kind === 'convenience');
}

function stockForStore(store = {}, dayKey = commerceDayKey()) {
  const seed = hashText(`${store.id || 'store'}:${dayKey}`);
  const stockIds = STOCK_IDS_BY_KIND[store.kind] || STOCK_IDS_BY_KIND.convenience;
  const standardItems = stockIds.map((id) => ITEM_BY_ID.get(id)).filter(Boolean);
  const start = seed % standardItems.length;
  const rare = RARE_TRADES[(seed >>> 8) % RARE_TRADES.length];
  const standard = Array.from({ length: Math.min(4, standardItems.length) }, (_, index) => standardItems[(start + index) % standardItems.length]);
  if (!standard.some((item) => item.id === rare.requirementId)) {
    standard[standard.length - 1] = ITEM_BY_ID.get(rare.requirementId);
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
    return {
      schemaVersion: COMMERCE_SCHEMA_VERSION,
      credits: Math.max(0, Math.floor(Number(parsed.credits) || 0)),
      purchases: parsed.purchases && typeof parsed.purchases === 'object' ? { ...parsed.purchases } : {},
      claimedTrades: parsed.claimedTrades && typeof parsed.claimedTrades === 'object' ? { ...parsed.claimedTrades } : {},
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions.slice(-60) : []
    };
  } catch (_) {
    return null;
  }
}

function createLocalCommerceModel(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const inventory = options.inventory;
  const clock = options.now || (() => Date.now());
  let state = parseState(storage) || {
    schemaVersion: COMMERCE_SCHEMA_VERSION,
    credits: STARTING_EXPLORER_CREDITS,
    purchases: {},
    claimedTrades: {},
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
    return Object.freeze({
      type: 'ExplorerWallet',
      schemaVersion: COMMERCE_SCHEMA_VERSION,
      credits: state.credits,
      transactions: Object.freeze(state.transactions.slice())
    });
  }

  function debit(amount, detail = {}) {
    const credits = Math.max(0, Math.floor(Number(amount) || 0));
    if (credits <= 0) return Object.freeze({ ok: false, reason: 'invalid_amount', credits: state.credits });
    if (state.credits < credits) return Object.freeze({ ok: false, reason: 'not_enough_credits', credits: state.credits });
    const { type = 'debit', ...transactionDetail } = detail;
    state.credits -= credits;
    record(String(type), { ...transactionDetail, credits });
    return Object.freeze({ ok: true, amount: credits, credits: state.credits });
  }

  function credit(amount, detail = {}) {
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

  function grant(catalogId, store, provenance) {
    const definition = ITEM_BY_ID.get(catalogId);
    if (!definition) return false;
    const existing = inventoryItem(catalogId);
    inventory?.upsertItem?.({
      instanceId: existing?.instanceId || `commerce:${catalogId}`,
      catalogId,
      quantity: Number(existing?.quantity || 0) + 1,
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
        commerceSellValue: definition.sellPrice,
        storeId: store.id,
        storeName: store.name
      }
    }, { definition });
    return true;
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
      credits: state.credits,
      store,
      dayKey: stock.dayKey,
      standard: Object.freeze(standard),
      rare: Object.freeze({
        ...stock.rare,
        claimed: state.claimedTrades[claimKey] === true,
        requirementCarried,
        available: state.claimedTrades[claimKey] !== true &&
          state.credits >= stock.rare.credits && requirementCarried >= stock.rare.requirementQuantity
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
    if (state.credits < item.buyPrice) return Object.freeze({ ok: false, reason: 'not_enough_credits' });
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
    if (!inventory?.consumeItem?.(item.instanceId, 1)) return Object.freeze({ ok: false, reason: 'inventory_unavailable' });
    state.credits += sellPrice;
    record('sell', { storeId: store.id, catalogId: item.catalogId, credits: sellPrice });
    return Object.freeze({ ok: true, item, credits: state.credits });
  }

  function trade(store) {
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

  save();
  return Object.freeze({
    type: 'WorldExplorerEconomy',
    buy,
    credit,
    debit,
    sell,
    snapshot: storeSnapshot,
    trade,
    wallet
  });
}

export {
  COMMERCE_ITEM_DEFINITIONS,
  COMMERCE_SCHEMA_VERSION,
  COMMERCE_STORAGE_KEY,
  STARTING_EXPLORER_CREDITS,
  commerceDayKey,
  createLocalCommerceModel,
  mappedCommercePlaces,
  mappedConvenienceStores,
  MAPPED_COMMERCE_PLACE_TYPES,
  stockForStore
};

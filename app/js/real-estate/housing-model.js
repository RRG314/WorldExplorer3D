const HOUSING_SCHEMA_VERSION = 2;
const HOUSING_STORAGE_KEY = 'world-explorer:homes:v1';

const RESIDENTIAL_TYPES = /house|residential|apartments|terrace|townhouse|detached|semidetached|bungalow|dormitory/;
const EXCLUDED_TYPES = /bridge|guardrail|roof|canopy|carport|aircraft|ship|transport|runway|taxiway/;
const NON_OWNABLE_SOURCE = /^(fallback-|dynamic:|overlay:|inferred(?::|-)|interior[-:]|generated:)|:guardrail:|structure-collider/i;
const MAPPED_SOURCE_PATTERNS = Object.freeze([
  /^overture:[0-9a-f-]{8,}$/i,
  /^shortbread:buildings:\d+:\d+:\d+:[^:]+:\d+$/i,
  /^(?:osm:)?(?:node|way|relation)[:/]\d+$/i,
  /^\d+$/
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function hasStableMappedIdentity(value) {
  const identity = clean(value);
  return !!identity && !NON_OWNABLE_SOURCE.test(identity) && MAPPED_SOURCE_PATTERNS.some((pattern) => pattern.test(identity));
}

function mappedSourceAuthority(value) {
  const identity = clean(value).toLowerCase();
  if (identity.startsWith('overture:')) return 'overture';
  if (identity.startsWith('shortbread:')) return 'shortbread';
  return hasStableMappedIdentity(identity) ? 'openstreetmap' : '';
}

function hashText(value = '') {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function polygonArea(points = []) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += finite(current?.x) * finite(next?.z) - finite(next?.x) * finite(current?.z);
  }
  return Math.abs(area) * 0.5;
}

function polygonCenter(points = []) {
  if (!points.length) return { x: 0, z: 0 };
  return points.reduce((sum, point) => ({ x: sum.x + finite(point?.x), z: sum.z + finite(point?.z) }), { x: 0, z: 0 });
}

function homeKind(buildingType = '') {
  const type = clean(buildingType, 'building').toLowerCase();
  if (/apartments|dormitory/.test(type)) return 'Apartment home';
  if (/terrace|townhouse|semidetached/.test(type)) return 'Townhouse';
  if (/house|detached|bungalow|residential/.test(type)) return 'House';
  if (/retail|commercial|supermarket|shop|kiosk/.test(type)) return 'Shop property';
  if (/office/.test(type)) return 'Office property';
  if (/industrial|warehouse|factory|hangar/.test(type)) return 'Industrial property';
  if (/farm|barn|stable|agricultural/.test(type)) return 'Rural property';
  if (/school|hospital|church|civic|government|public/.test(type)) return 'Community property';
  return 'Building property';
}

function gamePrice(area, levels, identity, buildingType) {
  const type = String(buildingType || '').toLowerCase();
  const category = RESIDENTIAL_TYPES.test(type) ? 'residential'
    : /retail|commercial|supermarket|shop|kiosk/.test(type) ? 'retail'
      : /office/.test(type) ? 'office'
        : /industrial|warehouse|factory|hangar/.test(type) ? 'industrial'
          : /farm|barn|stable|agricultural/.test(type) ? 'agricultural'
            : /civic|school|hospital|church|government|public/.test(type) ? 'civic' : 'mixed';
  const floorArea = Math.max(16, area) * Math.max(1, levels);
  const rate = { residential: 2300, retail: 3100, office: 3600, industrial: 1400, agricultural: 900, civic: 2800, mixed: 2600 }[category];
  const minimum = { residential: 120000, retail: 180000, office: 240000, industrial: 160000, agricultural: 90000, civic: 250000, mixed: 160000 }[category];
  const locationFactor = .82 + (hashText(identity) % 37) / 100;
  const sizePremium = floorArea > 5000 ? 1.12 + Math.min(.28, Math.log10(floorArea / 5000) * .12) : 1;
  const estimate = Math.max(minimum, (floorArea * rate + Math.max(16, area) * 350) * locationFactor * sizePremium);
  const rounding = estimate >= 10000000 ? 100000 : estimate >= 1000000 ? 25000 : 5000;
  return Math.max(minimum, Math.min(1500000000, Math.round(estimate / rounding) * rounding));
}

function storageCapacity(area, levels) {
  return Math.max(12, Math.min(72, 10 + Math.floor(area / 32) + Math.max(1, levels) * 2));
}

function normalizeCandidate(building, options = {}, index = 0) {
  const explicitPoints = Array.isArray(building?.pts) ? building.pts.filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z))) : [];
  const points = explicitPoints.length >= 3 ? explicitPoints : [
    { x: finite(building?.minX, NaN), z: finite(building?.minZ, NaN) },
    { x: finite(building?.maxX, NaN), z: finite(building?.minZ, NaN) },
    { x: finite(building?.maxX, NaN), z: finite(building?.maxZ, NaN) },
    { x: finite(building?.minX, NaN), z: finite(building?.maxZ, NaN) }
  ].filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  if (points.length < 3 || building?.collisionKind === 'barrier' || building?.collisionDisabled === true) return null;
  const buildingType = clean(building?.buildingType, 'building').toLowerCase();
  if (EXCLUDED_TYPES.test(buildingType)) return null;
  const explicitSourceId = clean(building?.sourceBuildingId || building?.sourceFeatureId || building?.id);
  const sourceId = explicitSourceId || `building-${index}`;
  const centerSum = polygonCenter(points);
  const x = centerSum.x / points.length;
  const z = centerSum.z / points.length;
  const actor = options.actor || { x: 0, z: 0 };
  const distance = Math.hypot(x - finite(actor.x), z - finite(actor.z));
  if (distance > finite(options.radius, 1800)) return null;
  const area = Math.max(16, polygonArea(points));
  const levels = Math.max(1, Math.round(finite(building?.levels, finite(building?.height, finite(building?.maxY) - finite(building?.minY, building?.baseY)) / 3.2 || 1)));
  const locationId = clean(options.locationId, 'current-place');
  const id = `home:${locationId}:${sourceId}`;
  const coordinates = typeof options.worldToGeo === 'function' ? options.worldToGeo(x, z) : { lat: null, lon: null };
  const kind = homeKind(buildingType);
  const locationLabel = clean(options.locationLabel, 'this place');
  return Object.freeze({
    id,
    worldPropertyId: `world:${sourceId}`,
    sharedEligible: hasStableMappedIdentity(explicitSourceId),
    sourceBuildingId: sourceId,
    sourceAuthority: mappedSourceAuthority(explicitSourceId),
    locationId,
    locationLabel,
    label: clean(building?.name, `${kind} in ${locationLabel}`),
    address: building?.address && typeof building.address === 'object' ? {
      line1: clean(building.address.line1),
      locality: clean(building.address.locality),
      region: clean(building.address.region),
      postalCode: clean(building.address.postalCode),
      country: clean(building.address.country),
      formatted: clean(building.address.formatted),
      source: 'mapped-building-tags'
    } : null,
    kind,
    buildingType,
    x,
    z,
    y: finite(building?.baseY, finite(building?.minY)),
    lat: Number.isFinite(Number(coordinates?.lat)) ? Number(coordinates.lat) : null,
    lon: Number.isFinite(Number(coordinates?.lon)) ? Number(coordinates.lon) : null,
    area: Math.round(area),
    levels,
    distance,
    price: gamePrice(area, levels, `world:${sourceId}`, buildingType),
    storageCapacity: storageCapacity(area, levels),
    mappedResidential: RESIDENTIAL_TYPES.test(buildingType),
    entryAnchor: null,
    provenance: 'loaded-world-building'
  });
}

function makeHomeCandidates(buildings = [], options = {}) {
  const candidates = (Array.isArray(buildings) ? buildings : [])
    .map((building, index) => normalizeCandidate(building, options, index))
    .filter(Boolean)
    .sort((left, right) => {
      const distanceDelta = left.distance - right.distance;
      if (Math.abs(distanceDelta) > 20) return distanceDelta;
      if (left.mappedResidential !== right.mappedResidential) return left.mappedResidential ? -1 : 1;
      return distanceDelta || left.price - right.price;
    });
  const seen = new Set();
  return Object.freeze(candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  }).slice(0, Math.max(1, Math.min(320, finite(options.limit, 120)))));
}

function normalizeStoredItem(item = {}) {
  return {
    instanceId: clean(item.instanceId),
    catalogId: clean(item.catalogId),
    quantity: Math.max(1, Math.floor(finite(item.quantity, 1))),
    condition: item.condition == null ? null : Math.max(0, Math.min(1, finite(item.condition))),
    authority: clean(item.authority, 'anonymous-local'),
    provenance: clean(item.provenance, 'home-storage'),
    sourceEventId: clean(item.sourceEventId),
    tradeable: item.tradeable === true,
    acquiredAt: Math.max(0, finite(item.acquiredAt)),
    metadata: item.metadata && typeof item.metadata === 'object' ? { ...item.metadata } : {},
    label: clean(item.label || item.metadata?.label || item.catalogId, 'Stored item'),
    category: clean(item.category || item.metadata?.category, 'object'),
    icon: clean(item.icon || item.metadata?.icon, 'ITEM'),
    verbs: Array.isArray(item.verbs || item.metadata?.verbs) ? [...(item.verbs || item.metadata?.verbs)] : ['inspect']
  };
}

function normalizeHome(home = {}) {
  return {
    id: clean(home.id),
    sourceBuildingId: clean(home.sourceBuildingId),
    locationId: clean(home.locationId, 'unknown-place'),
    locationLabel: clean(home.locationLabel, 'Saved location'),
    label: clean(home.label, 'Explorer home'),
    address: home.address && typeof home.address === 'object' ? { ...home.address, source: 'mapped-building-tags' } : null,
    kind: clean(home.kind, 'Home'),
    buildingType: clean(home.buildingType, 'building'),
    x: finite(home.x), z: finite(home.z), y: finite(home.y),
    lat: Number.isFinite(Number(home.lat)) ? Number(home.lat) : null,
    lon: Number.isFinite(Number(home.lon)) ? Number(home.lon) : null,
    area: Math.max(16, Math.round(finite(home.area, 16))),
    levels: Math.max(1, Math.round(finite(home.levels, 1))),
    purchasePrice: Math.max(1, Math.round(finite(home.purchasePrice || home.price, 1))),
    currentValue: Math.max(1, Math.round(finite(home.currentValue || home.price || home.purchasePrice, 1))),
    storageCapacity: Math.max(12, Math.round(finite(home.storageCapacity, 12))),
    purchasedAt: Math.max(1, finite(home.purchasedAt, Date.now())),
    storage: (Array.isArray(home.storage) ? home.storage : []).map(normalizeStoredItem).filter((item) => item.instanceId && item.catalogId)
  };
}

function parseState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(HOUSING_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const legacy = Number(parsed.schemaVersion || 1) < HOUSING_SCHEMA_VERSION;
    const homes = (Array.isArray(parsed.homes) ? parsed.homes : []).map((home) => {
      if (!legacy) return normalizeHome(home);
      const migratedValue = gamePrice(finite(home.area, 16), finite(home.levels, 1), clean(home.id), clean(home.buildingType, 'building'));
      return normalizeHome({ ...home, purchasePrice: migratedValue, currentValue: migratedValue });
    }).filter((home) => home.id);
    return {
      schemaVersion: HOUSING_SCHEMA_VERSION,
      primaryHomeId: homes.some((home) => home.id === parsed.primaryHomeId) ? parsed.primaryHomeId : homes[0]?.id || '',
      homes,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions.slice(-80) : []
    };
  } catch (_) {
    return null;
  }
}

function createHousingModel(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const economy = options.economy;
  const inventory = options.inventory;
  const now = options.now || (() => Date.now());
  let state = parseState(storage) || { schemaVersion: HOUSING_SCHEMA_VERSION, primaryHomeId: '', homes: [], transactions: [] };

  function save() {
    try {
      storage?.setItem?.(HOUSING_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  function notify(action, home, detail = {}) {
    const event = { action, homeId: home?.id || '', label: home?.label || '', at: Number(now()) || Date.now(), ...detail };
    state.transactions.push(event);
    state.transactions = state.transactions.slice(-80);
    save();
    if (typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent?.(new CustomEvent('we3d:property-change', { detail: event }));
    }
    return event;
  }

  function findHome(homeId) {
    return state.homes.find((home) => home.id === String(homeId || '')) || null;
  }

  function accessFor(home) {
    if (!home) return { available: false, distance: Infinity, reason: 'not_owned' };
    const activeLocationId = typeof options.getActiveLocationId === 'function' ? clean(options.getActiveLocationId()) : '';
    if (activeLocationId && home.locationId !== activeLocationId) {
      return { available: false, distance: Infinity, reason: 'home_in_another_place' };
    }
    const actor = typeof options.getActorPosition === 'function' ? options.getActorPosition() : null;
    if (!actor) return { available: true, distance: 0, reason: '' };
    const distance = Math.hypot(finite(actor.x) - home.x, finite(actor.z) - home.z);
    const available = distance <= Math.max(10, finite(options.storageAccessRadius, 45));
    return { available, distance, reason: available ? '' : 'home_too_far' };
  }

  function buy(candidate) {
    if (!candidate?.id) return Object.freeze({ ok: false, reason: 'home_unavailable' });
    if (findHome(candidate.id)) return Object.freeze({ ok: false, reason: 'already_owned' });
    const charge = economy?.debit?.(candidate.price, { type: 'home-purchase', homeId: candidate.id });
    if (!charge?.ok) return Object.freeze({ ok: false, reason: charge?.reason || 'wallet_unavailable', credits: charge?.credits });
    const home = normalizeHome({ ...candidate, purchasePrice: candidate.price, currentValue: candidate.price, purchasedAt: now(), storage: [] });
    state.homes.push(home);
    if (!state.primaryHomeId) state.primaryHomeId = home.id;
    if (!save()) {
      state.homes = state.homes.filter((entry) => entry.id !== home.id);
      if (state.primaryHomeId === home.id) state.primaryHomeId = state.homes[0]?.id || '';
      economy?.credit?.(candidate.price, { type: 'home-purchase-refund', homeId: candidate.id });
      return Object.freeze({ ok: false, reason: 'save_failed' });
    }
    notify('bought', home, { credits: candidate.price });
    return Object.freeze({ ok: true, home: { ...home }, credits: economy.wallet?.().credits ?? charge.credits });
  }

  function sell(homeId) {
    const home = findHome(homeId);
    if (!home) return Object.freeze({ ok: false, reason: 'not_owned' });
    if (home.storage.length) return Object.freeze({ ok: false, reason: 'storage_not_empty' });
    const salePrice = Math.max(1, Math.floor(Math.min(home.purchasePrice, home.currentValue) * 0.85));
    const priorIndex = state.homes.indexOf(home);
    state.homes.splice(priorIndex, 1);
    if (state.primaryHomeId === home.id) state.primaryHomeId = state.homes[0]?.id || '';
    if (!save()) {
      state.homes.splice(priorIndex, 0, home);
      if (!state.primaryHomeId) state.primaryHomeId = home.id;
      return Object.freeze({ ok: false, reason: 'save_failed' });
    }
    const payment = economy?.credit?.(salePrice, { type: 'home-sale', homeId: home.id });
    if (!payment?.ok) {
      state.homes.splice(priorIndex, 0, home);
      if (!state.primaryHomeId) state.primaryHomeId = home.id;
      save();
      return Object.freeze({ ok: false, reason: payment?.reason || 'wallet_unavailable' });
    }
    notify('sold', home, { credits: salePrice });
    return Object.freeze({ ok: true, home: { ...home }, salePrice, credits: payment.credits });
  }

  function setPrimary(homeId) {
    const home = findHome(homeId);
    if (!home) return Object.freeze({ ok: false, reason: 'not_owned' });
    state.primaryHomeId = home.id;
    notify('primary-set', home);
    return Object.freeze({ ok: true, home: { ...home } });
  }

  function storedUnits(home) {
    return home.storage.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  }

  function storeItem(homeId, instanceId, quantity = 1) {
    const home = findHome(homeId);
    const item = inventory?.snapshot?.().items?.find((entry) => entry.instanceId === String(instanceId || ''));
    const amount = Math.max(1, Math.floor(finite(quantity, 1)));
    if (!home) return Object.freeze({ ok: false, reason: 'not_owned' });
    const access = accessFor(home);
    if (!access.available) return Object.freeze({ ok: false, reason: access.reason, distance: access.distance });
    if (!item || item.catalogId === 'hands') return Object.freeze({ ok: false, reason: 'item_unavailable' });
    if (item.equipped) return Object.freeze({ ok: false, reason: 'item_equipped' });
    if (item.quantity < amount) return Object.freeze({ ok: false, reason: 'item_unavailable' });
    if (storedUnits(home) + amount > home.storageCapacity) return Object.freeze({ ok: false, reason: 'storage_full' });
    const existing = home.storage.find((entry) => entry.instanceId === item.instanceId);
    if (existing) existing.quantity += amount;
    else home.storage.push(normalizeStoredItem({ ...item, quantity: amount }));
    if (!inventory.consumeItem?.(item.instanceId, amount)) {
      if (existing) existing.quantity -= amount;
      else home.storage = home.storage.filter((entry) => entry.instanceId !== item.instanceId);
      return Object.freeze({ ok: false, reason: 'inventory_unavailable' });
    }
    options.saveInventory?.();
    notify('stored', home, { catalogId: item.catalogId, quantity: amount });
    return Object.freeze({ ok: true, home: { ...home }, item: normalizeStoredItem(item) });
  }

  function withdrawItem(homeId, instanceId, quantity = 1) {
    const home = findHome(homeId);
    const stored = home?.storage.find((entry) => entry.instanceId === String(instanceId || ''));
    const amount = Math.max(1, Math.floor(finite(quantity, 1)));
    if (!home) return Object.freeze({ ok: false, reason: 'not_owned' });
    const access = accessFor(home);
    if (!access.available) return Object.freeze({ ok: false, reason: access.reason, distance: access.distance });
    if (!stored || stored.quantity < amount) return Object.freeze({ ok: false, reason: 'item_unavailable' });
    const carried = inventory?.snapshot?.().items?.find((entry) => entry.instanceId === stored.instanceId);
    inventory?.registerDefinitions?.([{ id: stored.catalogId, label: stored.label, category: stored.category, icon: stored.icon, verbs: stored.verbs }]);
    const restoredId = inventory?.upsertItem?.({
      ...stored,
      quantity: Math.max(0, Number(carried?.quantity) || 0) + amount,
      provenance: stored.provenance || 'home-storage'
    });
    if (!restoredId) return Object.freeze({ ok: false, reason: 'inventory_unavailable' });
    stored.quantity -= amount;
    if (stored.quantity <= 0) home.storage = home.storage.filter((entry) => entry !== stored);
    options.saveInventory?.();
    notify('withdrew', home, { catalogId: stored.catalogId, quantity: amount });
    return Object.freeze({ ok: true, home: { ...home }, item: { ...stored } });
  }

  function snapshot(candidates = []) {
    const homes = state.homes.map((home) => {
      const access = accessFor(home);
      return Object.freeze({ ...home, distance: access.distance, storageAccessible: access.available, accessReason: access.reason, storage: Object.freeze(home.storage.map((item) => Object.freeze({ ...item }))) });
    });
    return Object.freeze({
      type: 'ExplorerHousing',
      schemaVersion: HOUSING_SCHEMA_VERSION,
      credits: economy?.wallet?.().credits ?? 0,
      primaryHomeId: state.primaryHomeId,
      primaryHome: homes.find((home) => home.id === state.primaryHomeId) || null,
      homes: Object.freeze(homes),
      candidates: Object.freeze((Array.isArray(candidates) ? candidates : []).map((candidate) => Object.freeze({ ...candidate, owned: !!findHome(candidate.id) }))),
      transactions: Object.freeze(state.transactions.slice())
    });
  }

  save();
  return Object.freeze({ buy, sell, setPrimary, snapshot, storeItem, withdrawItem });
}

export {
  HOUSING_SCHEMA_VERSION,
  HOUSING_STORAGE_KEY,
  createHousingModel,
  hasStableMappedIdentity,
  makeHomeCandidates
};

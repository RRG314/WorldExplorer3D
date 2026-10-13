import { createLocalBackpackStore } from '../player/backpack-store.js?v=2';
import { normalizeWorkspace, transitionWorkspace } from '../campaign/personal-workspace.js';
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
    personalStarter: home.personalStarter === true,
    workspace: home.workspace ? normalizeWorkspace(home.workspace) : null,
    journey: home.journey && typeof home.journey==='object' ? {...home.journey} : {},
    storage: (Array.isArray(home.storage) ? home.storage : []).map(normalizeStoredItem).filter((item) => item.instanceId && item.catalogId)
  };
}

function parseState(parsed) {
  try {
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
      starterHomeId: clean(parsed.starterHomeId,homes.find(home=>home.personalStarter)?.id||''),
      homes,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions.slice(-80) : []
    };
  } catch (_) {
    return null;
  }
}

export function mergeInteriorHomeSnapshots(connected={},personal={}) {
  const ids=new Set((connected.homes||[]).map(home=>home.id));
  return {...connected,homes:[...(connected.homes||[]),...(personal.homes||[]).filter(home=>!ids.has(home.id))]};
}

function createHousingModel(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const economy = options.economy;
  const inventory = options.inventory;
  const now = options.now || (() => Date.now());
  const backpackStore = options.backpackStore || economy?.localBackpackStore || createLocalBackpackStore(storage);
  let state = parseState(backpackStore.loadHousing()) || { schemaVersion: HOUSING_SCHEMA_VERSION, primaryHomeId: '', homes: [], transactions: [] };
  let savedHousing = JSON.stringify(backpackStore.loadHousing());

  function persist(next,raw) {
    if (!backpackStore.saveHousing(next,raw,savedHousing)) return false;
    savedHousing=JSON.stringify(backpackStore.loadHousing());return true;
  }

  function save() {
    return persist(state, inventory?.exportState?.() || backpackStore.load() || {items:[]});
  }

  function notify(action, home, detail = {}) {
    const event = { action, homeId: home?.id || '', label: home?.label || '', at: Number(now()) || Date.now(), ...detail };
    const previousTransactions = state.transactions;
    state.transactions = [...previousTransactions.slice(-79), event];
    if (!save()) { state.transactions = previousTransactions; return null; }
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

  function mutationFailure() {
    if (backpackStore.writable()) return null;
    return Object.freeze({ok:false,reason:backpackStore.saveStatus()==='another-tab'?'save_in_another_tab':'save_failed'});
  }

  function buy(candidate) {
    const blocked=mutationFailure(); if (blocked) return blocked;
    if (!candidate?.id) return Object.freeze({ ok: false, reason: 'home_unavailable' });
    if (findHome(candidate.id)) return Object.freeze({ ok: false, reason: 'already_owned' });
    if (!Number.isSafeInteger(candidate.price) || candidate.price < 1) return Object.freeze({ok:false,reason:'invalid_amount'});
    if (!economy?.commitHomeChange || economy.localBackpackStore!==backpackStore) return Object.freeze({ok:false,reason:'wallet_unavailable'});
    const home = normalizeHome({ ...candidate, purchasePrice: candidate.price, currentValue: candidate.price, purchasedAt: now(), storage: [] });
    const event={action:'bought',homeId:home.id,label:home.label,at:Number(now()),credits:candidate.price};
    const next={...state,homes:[...state.homes,home],primaryHomeId:state.primaryHomeId||home.id,transactions:[...state.transactions.slice(-79),event]};
    const charge=economy.commitHomeChange(-candidate.price,next,{type:'home-purchase',homeId:home.id},savedHousing);
    if (!charge.ok) return charge;
    savedHousing=JSON.stringify(backpackStore.loadHousing());
    state=next;dispatch(event);
    return Object.freeze({ok:true,home:{...home},credits:charge.credits});
  }

  function sell(homeId) {
    const blocked=mutationFailure(); if (blocked) return blocked;
    const home = findHome(homeId);
    if (!home) return Object.freeze({ ok: false, reason: 'not_owned' });
    if (home.personalStarter) return Object.freeze({ok:false,reason:'personal_home_not_for_sale'});
    if (home.storage.length) return Object.freeze({ ok: false, reason: 'storage_not_empty' });
    const salePrice = Math.max(1, Math.floor(Math.min(home.purchasePrice, home.currentValue) * 0.85));
    if (!economy?.commitHomeChange || economy.localBackpackStore!==backpackStore) return Object.freeze({ok:false,reason:'wallet_unavailable'});
    const homes=state.homes.filter(entry=>entry.id!==home.id);
    const event={action:'sold',homeId:home.id,label:home.label,at:Number(now()),credits:salePrice};
    const next={...state,homes,primaryHomeId:state.primaryHomeId===home.id?homes[0]?.id||'':state.primaryHomeId,transactions:[...state.transactions.slice(-79),event]};
    const payment=economy.commitHomeChange(salePrice,next,{type:'home-sale',homeId:home.id},savedHousing);
    if (!payment.ok) return payment;
    savedHousing=JSON.stringify(backpackStore.loadHousing());
    state=next;dispatch(event);
    return Object.freeze({ ok: true, home: { ...home }, salePrice, credits: payment.credits });
  }

  function dispatch(event) {
    if (typeof globalThis.CustomEvent === 'function') globalThis.dispatchEvent?.(new CustomEvent('we3d:property-change',{detail:event}));
  }

  function commitHomeState(next,action,home) {
    const event={action,homeId:home.id,label:home.label,at:Number(now())};
    next.transactions=[...next.transactions.slice(-79),event];
    if (!persist(next,inventory?.exportState?.()||backpackStore.load()||{items:[]})) return Object.freeze({ok:false,reason:'save_failed'});
    state=next;dispatch(event);return Object.freeze({ok:true,home:structuredClone(home)});
  }

  function claimStarter(candidate) {
    const blocked=mutationFailure();if(blocked)return blocked;
    if (state.starterHomeId) return Object.freeze({ok:false,reason:'starter_already_claimed',home:findHome(state.starterHomeId)});
    if (!candidate?.mappedResidential || !candidate.sharedEligible || !candidate.id || findHome(candidate.id)) return Object.freeze({ok:false,reason:'home_unavailable'});
    const home=normalizeHome({...candidate,personalStarter:true,purchasedAt:now(),storage:[],journey:{claimedAt:Number(now())}});
    const access=accessFor(home);if(!access.available)return Object.freeze({ok:false,reason:access.reason});
    const next={...state,homes:[...state.homes,home],starterHomeId:home.id,primaryHomeId:state.primaryHomeId||home.id};
    return commitHomeState(next,'personal-home-claimed',home);
  }

  function updateWorkspace(homeId,command) {
    const blocked=mutationFailure();if(blocked)return blocked;
    const home=findHome(homeId);if(!home)return Object.freeze({ok:false,reason:'not_owned'});
    if(!accessFor(home).available)return Object.freeze({ok:false,reason:accessFor(home).reason});
    let workspace;
    try{workspace=transitionWorkspace(home.workspace,command,now());}catch(error){return Object.freeze({ok:false,reason:'workspace_invalid',message:error.message});}
    const next=structuredClone(state),updated=next.homes.find(h=>h.id===home.id);updated.workspace=workspace;
    return commitHomeState(next,'workspace-updated',updated);
  }

  function recordHomeVisit(homeId,action) {
    const blocked=mutationFailure();if(blocked)return blocked;
    const home=findHome(homeId);if(!home)return Object.freeze({ok:false,reason:'not_owned'});
    if(!['entered','displayed','departed','returned'].includes(action))return Object.freeze({ok:false,reason:'invalid_action'});
    if(action!=='departed'&&!accessFor(home).available)return Object.freeze({ok:false,reason:accessFor(home).reason});
    if(home.journey[action])return Object.freeze({ok:true,home:structuredClone(home)});
    if(action==='returned'&&(!home.journey.departed||state.primaryHomeId!==home.id))return Object.freeze({ok:false,reason:'return_not_ready'});
    const next=structuredClone(state),updated=next.homes.find(h=>h.id===home.id);updated.journey[action]=Number(now())||1;
    return commitHomeState(next,'home-'+action,updated);
  }

  function setPrimary(homeId) {
    const blocked=mutationFailure(); if (blocked) return blocked;
    const home = findHome(homeId);
    if (!home) return Object.freeze({ ok: false, reason: 'not_owned' });
    const previous = state.primaryHomeId;
    state.primaryHomeId = home.id;
    if (!notify('primary-set', home)) {
      state.primaryHomeId = previous;
      return Object.freeze({ ok: false, reason: 'save_failed' });
    }
    return Object.freeze({ ok: true, home: { ...home } });
  }

  function storedUnits(home) {
    return home.storage.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  }

  function storeItem(homeId, instanceId, quantity = 1) {
    const blocked=mutationFailure(); if (blocked) return blocked;
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
    // Items with separate ammunition/equipment state remain in the Backpack.
    // Plain supplies and specimens can move without creating a second authority.
    const raw = inventory?.exportState?.();
    const carried = raw?.items?.find(entry => entry.instanceId === item.instanceId);
    if (!carried || carried.quantity < amount) return Object.freeze({ok:false, reason:'item_unavailable'});
    if (item.verbs?.includes('equip') || item.category === 'field-tool') return Object.freeze({ok:false, reason:'item_attached'});
    const next = JSON.parse(JSON.stringify(state));
    const nextHome = next.homes.find(entry => entry.id === home.id);
    const existing = nextHome.storage.find(entry => entry.instanceId === item.instanceId);
    if (existing) existing.quantity += amount;
    else nextHome.storage.push(normalizeStoredItem({...item, quantity: amount}));
    const remaining = carried.quantity - amount;
    const nextInventory = {...raw, revision:raw.revision+1,
      items:raw.items.flatMap(entry => entry.instanceId === item.instanceId ? remaining ? [{...entry, quantity:remaining}] : [] : [entry]),
      hotbar:raw.hotbar.map(id=>!remaining && id===item.instanceId ? null : id)};
    return commitTransfer('stored', next, nextHome, nextInventory, item, amount);
  }

  function commitTransfer(action, next, home, nextInventory, item, amount) {
    if (!inventory?.applySavedState) return Object.freeze({ok:false, reason:'inventory_unavailable'});
    const event = {action, homeId:home.id, label:home.label, at:Number(now()) || Date.now(), catalogId:item.catalogId, quantity:amount};
    next.transactions = [...next.transactions.slice(-79), event];
    // No inventory mutation or listener runs before the single durable commit.
    if (!persist(next, nextInventory)) return Object.freeze({ok:false, reason:'save_failed'});
    state = next;
    inventory.applySavedState({...nextInventory, housing:next});
    if (typeof globalThis.CustomEvent === 'function') globalThis.dispatchEvent?.(new CustomEvent('we3d:property-change', {detail:event}));
    return Object.freeze({ok:true, home:{...home}, item:normalizeStoredItem({...item,quantity:amount})});
  }

  function withdrawItem(homeId, instanceId, quantity = 1) {
    const blocked=mutationFailure(); if (blocked) return blocked;
    const home = findHome(homeId);
    const stored = home?.storage.find(entry => entry.instanceId === String(instanceId || ''));
    const amount = Math.max(1, Math.floor(finite(quantity, 1)));
    if (!home) return Object.freeze({ok:false, reason:'not_owned'});
    const access = accessFor(home);
    if (!access.available) return Object.freeze({ok:false, reason:access.reason, distance:access.distance});
    if (!stored || stored.quantity < amount) return Object.freeze({ok:false, reason:'item_unavailable'});
    const raw = inventory?.exportState?.();
    if (!raw) return Object.freeze({ok:false, reason:'inventory_unavailable'});
    const carried = raw.items.find(entry => entry.instanceId === stored.instanceId ||
      (stored.sourceEventId && entry.sourceEventId === stored.sourceEventId && entry.catalogId === stored.catalogId));
    const nextInventory = {...raw, revision:raw.revision+1, items:raw.items.filter(entry=>entry!==carried)};
    nextInventory.items.push({...stored, instanceId:carried?.instanceId || stored.instanceId, quantity:(carried?.quantity || 0)+amount});
    const next = JSON.parse(JSON.stringify(state));
    const nextHome = next.homes.find(entry => entry.id === home.id);
    nextHome.storage = nextHome.storage.flatMap(entry => entry.instanceId !== stored.instanceId ? [entry]
      : entry.quantity > amount ? [{...entry,quantity:entry.quantity-amount}] : []);
    const result = commitTransfer('withdrew', next, nextHome, nextInventory, stored, amount);
    if (result.ok) inventory.registerDefinitions?.([{id:stored.catalogId,label:stored.label,category:stored.category,icon:stored.icon,verbs:stored.verbs}]);
    return result;
  }

  function snapshot(candidates = []) {
    const homes = state.homes.map((home) => {
      const access = accessFor(home);
      return Object.freeze({ ...home, workspace: home.workspace ? structuredClone(home.workspace) : null, journey: {...home.journey}, distance: access.distance, storageAccessible: access.available, accessReason: access.reason, storage: Object.freeze(home.storage.map((item) => Object.freeze({ ...item }))) });
    });
    return Object.freeze({
      type: 'ExplorerHousing',
      schemaVersion: HOUSING_SCHEMA_VERSION,
      credits: economy?.wallet?.().credits ?? 0,
      primaryHomeId: state.primaryHomeId,
      starterHomeId: state.starterHomeId || '',
      primaryHome: homes.find((home) => home.id === state.primaryHomeId) || null,
      homes: Object.freeze(homes),
      candidates: Object.freeze((Array.isArray(candidates) ? candidates : []).map((candidate) => Object.freeze({ ...candidate, owned: !!findHome(candidate.id) }))),
      transactions: Object.freeze(state.transactions.slice())
    });
  }

  return Object.freeze({ buy, sell, setPrimary, snapshot, storeItem, withdrawItem,claimStarter,updateWorkspace,recordHomeVisit });
}

export {
  HOUSING_SCHEMA_VERSION,
  HOUSING_STORAGE_KEY,
  createHousingModel,
  hasStableMappedIdentity,
  makeHomeCandidates
};

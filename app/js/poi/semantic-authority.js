const POI_SCHEMA_VERSION = 1;
const POI_GENERATOR_VERSION = 1;

const CAPABILITY_REGISTRY = Object.freeze({
  'retail.general': Object.freeze({ family: 'general', interiorArchetype: 'general-retail', dependency: 'Backpack + Explorer Wallet' }),
  'service.vehicleRepair': Object.freeze({ family: 'automotive', interiorArchetype: 'automotive-service', dependency: 'vehicle condition + Explorer Wallet' }),
  'service.vehicleUpgrade': Object.freeze({ family: 'automotive', interiorArchetype: 'automotive-service', dependency: 'vehicle upgrades + Explorer Wallet' }),
  'retail.vehicleParts': Object.freeze({ family: 'automotive', interiorArchetype: 'automotive-service', dependency: 'Backpack + Explorer Wallet' }),
  'retail.vehicleSupplies': Object.freeze({ family: 'automotive', interiorArchetype: 'automotive-service', dependency: 'Backpack + Explorer Wallet' }),
  'retail.petSupplies': Object.freeze({ family: 'pet', interiorArchetype: 'pet-retail', dependency: 'Backpack + companion progression + Explorer Wallet' }),
  'service.companionCare': Object.freeze({ family: 'pet', interiorArchetype: 'pet-care', dependency: 'companion progression + Explorer Wallet' }),
  'retail.fieldSupplies': Object.freeze({ family: 'field', interiorArchetype: 'field-supply', dependency: 'Backpack + field equipment + Explorer Wallet' }),
  'service.playerCare': Object.freeze({ family: 'medical', interiorArchetype: 'medical-service', dependency: 'player condition + Explorer Wallet' }),
  'retail.medicalSupplies': Object.freeze({ family: 'medical', interiorArchetype: 'medical-service', dependency: 'Backpack + Explorer Wallet' }),
  'retail.marineSupplies': Object.freeze({ family: 'marine', interiorArchetype: 'marine-retail', dependency: 'Backpack + marine exploration + Explorer Wallet' }),
  'service.vesselRepair': Object.freeze({ family: 'marine', interiorArchetype: 'marine-service', dependency: 'vessel condition + Explorer Wallet' })
});

const FAMILY_LABELS = Object.freeze({
  general: 'General supplies',
  automotive: 'Automotive',
  pet: 'Pet and veterinary',
  field: 'Outdoor and field supplies',
  medical: 'Medical',
  marine: 'Marine'
});

const GENERAL_SHOPS = new Set(['convenience', 'supermarket', 'general', 'kiosk', 'department_store', 'pawnbroker', 'second_hand']);
const VEHICLE_REPAIR_SHOPS = new Set(['car_repair', 'tyres']);
const VEHICLE_PART_SHOPS = new Set(['car_parts', 'tyres']);
const VEHICLE_ENERGY_AMENITIES = new Set(['fuel', 'charging_station']);
const PET_SHOPS = new Set(['pet']);
const PET_CARE_AMENITIES = new Set(['veterinary', 'veterinary_pharmacy']);
const FIELD_SHOPS = new Set(['hardware', 'doityourself', 'outdoor', 'sports', 'fishing', 'hunting', 'scuba_diving', 'aviation']);
const CLOTHING_INFORMATIONAL_SHOPS = new Set(['clothes', 'shoes']);
const MEDICAL_AMENITIES = new Set(['hospital', 'clinic', 'doctors', 'pharmacy']);
const MEDICAL_HEALTHCARE = new Set(['hospital', 'clinic', 'doctor', 'doctors', 'pharmacy']);
const MARINE_SHOPS = new Set(['boat', 'fishing', 'scuba_diving']);
const MARINE_AMENITIES = new Set(['dive_centre']);
const MARINE_LEISURE = new Set(['marina']);

function text(value, fallback = '') {
  const result = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return result || fallback;
}

function lower(value) {
  return text(value).toLowerCase();
}

function freezeRecord(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeRecord));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.entries(value).forEach(([key, entry]) => { out[key] = freezeRecord(entry); });
  return Object.freeze(out);
}

function sourceIdentity(input = {}) {
  const tags = input.tags && typeof input.tags === 'object' ? input.tags : {};
  const explicit = text(input.sourceFeatureId || tags._sourceFeatureId);
  if (explicit) return explicit;
  const elementType = text(input.sourceElementType || tags._sourceElementType || input.elementType || input.type);
  const elementId = text(input.sourceElementId || tags._sourceElementId || input.elementId || input.id);
  return elementType && elementId ? `${elementType}:${elementId}` : '';
}

function providerNamespace(input = {}, identity = sourceIdentity(input)) {
  const declared = lower(input.provider || input.source?.provider);
  const source = lower(identity);
  if (source.startsWith('shortbread:')) return 'shortbread';
  if (source.startsWith('overture:')) return 'overture';
  if (source.startsWith('osm:') || /^(node|way|relation)[:/]/.test(source) || /^\d+$/.test(source)) return 'openstreetmap';
  if (declared.includes('overture')) return 'overture';
  if (declared.includes('shortbread')) return 'shortbread';
  if (declared.includes('openstreetmap') || declared === 'osm') return 'openstreetmap';
  return declared.replace(/[^a-z0-9._-]+/g, '-') || 'unknown';
}

function canonicalPoiId(input = {}) {
  const identity = sourceIdentity(input);
  if (!identity) return '';
  return `poi:v${POI_SCHEMA_VERSION}:${providerNamespace(input, identity)}:${identity}`;
}

function sourceTags(input = {}) {
  const tags = input.tags && typeof input.tags === 'object' ? input.tags : {};
  const mappedType = lower(input.mappedType || input.type);
  const [mappedKey, mappedValue] = mappedType.includes('=') ? mappedType.split('=', 2) : [];
  const normalized = {
    amenity: lower(tags.amenity || (mappedKey === 'amenity' ? mappedValue : '')),
    shop: lower(tags.shop || (mappedKey === 'shop' ? mappedValue : '')),
    healthcare: lower(tags.healthcare || input.healthcare),
    leisure: lower(tags.leisure || (mappedKey === 'leisure' ? mappedValue : '')),
    tourism: lower(tags.tourism || (mappedKey === 'tourism' ? mappedValue : '')),
    emergency: lower(tags.emergency || (mappedKey === 'emergency' ? mappedValue : '')),
    openingHours: text(tags.opening_hours || input.openingHours),
    name: text(input.name || tags.name || tags['name:en'])
  };
  return Object.freeze(normalized);
}

function classifyPoi(input = {}) {
  const tags = sourceTags(input);
  const capabilities = new Set();
  const families = new Set();
  const add = (capabilityId) => {
    const definition = CAPABILITY_REGISTRY[capabilityId];
    if (!definition) return;
    capabilities.add(capabilityId);
    families.add(definition.family);
  };

  if (GENERAL_SHOPS.has(tags.shop) || tags.amenity === 'marketplace') add('retail.general');
  if (VEHICLE_REPAIR_SHOPS.has(tags.shop)) add('service.vehicleRepair');
  if (VEHICLE_REPAIR_SHOPS.has(tags.shop) || VEHICLE_PART_SHOPS.has(tags.shop)) add('service.vehicleUpgrade');
  if (VEHICLE_PART_SHOPS.has(tags.shop)) add('retail.vehicleParts');
  if (VEHICLE_ENERGY_AMENITIES.has(tags.amenity)) add('retail.vehicleSupplies');
  if (PET_SHOPS.has(tags.shop)) add('retail.petSupplies');
  if (PET_CARE_AMENITIES.has(tags.amenity)) add('service.companionCare');
  if (FIELD_SHOPS.has(tags.shop)) add('retail.fieldSupplies');
  if (MEDICAL_AMENITIES.has(tags.amenity) || MEDICAL_HEALTHCARE.has(tags.healthcare)) add('service.playerCare');
  if (tags.amenity === 'pharmacy' || tags.healthcare === 'pharmacy') add('retail.medicalSupplies');
  if (MARINE_SHOPS.has(tags.shop)) add('retail.marineSupplies');
  if (tags.shop === 'boat' || MARINE_AMENITIES.has(tags.amenity) || MARINE_LEISURE.has(tags.leisure)) add('service.vesselRepair');

  const informationalReason = capabilities.size === 0 && CLOTHING_INFORMATIONAL_SHOPS.has(tags.shop)
    ? 'Clothing customization is intentionally unsupported; the mapped place remains informational.'
    : capabilities.size === 0 ? 'No released World Explorer capability matches this mapped place.' : '';
  const primaryCapability = [...capabilities][0] || '';
  return freezeRecord({
    families: [...families],
    familyLabels: [...families].map((family) => FAMILY_LABELS[family]),
    capabilities: [...capabilities],
    primaryCapability,
    interiorArchetype: primaryCapability ? CAPABILITY_REGISTRY[primaryCapability].interiorArchetype : '',
    functional: capabilities.size > 0,
    informationalReason
  });
}

function normalizePoi(input = {}) {
  const id = canonicalPoiId(input);
  const tags = sourceTags(input);
  const x = Number(input.x);
  const z = Number(input.z);
  const semantic = classifyPoi(input);
  const source = freezeRecord({
    identity: sourceIdentity(input),
    provider: providerNamespace(input),
    featureId: sourceIdentity(input),
    elementType: text(input.sourceElementType || input.tags?._sourceElementType || input.elementType),
    elementId: text(input.sourceElementId || input.tags?._sourceElementId || input.elementId),
    name: tags.name,
    tags,
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : null,
    operatingStatus: lower(input.operatingStatus || input.operating_status),
    license: text(input.license, providerNamespace(input) === 'openstreetmap' || providerNamespace(input) === 'shortbread' ? 'ODbL-1.0' : ''),
    attribution: text(input.attribution, providerNamespace(input) === 'openstreetmap' || providerNamespace(input) === 'shortbread' ? '© OpenStreetMap contributors' : '')
  });
  return freezeRecord({
    type: 'WorldExplorerPoi',
    schemaVersion: POI_SCHEMA_VERSION,
    generatorVersion: POI_GENERATOR_VERSION,
    id,
    stable: Boolean(id),
    position: Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null,
    source,
    semantic,
    buildingAssociation: null,
    lifecycle: 'indexed',
    truth: {
      mapped: Boolean(id),
      gameplayDerived: semantic.functional,
      interiorIsRepresentative: true
    }
  });
}

function normalizePois(inputs = []) {
  const records = new Map();
  (Array.isArray(inputs) ? inputs : []).forEach((input) => {
    const record = normalizePoi(input);
    if (!record.id || !record.position) return;
    const existing = records.get(record.id);
    if (!existing || (!existing.semantic.functional && record.semantic.functional)) records.set(record.id, record);
  });
  return Object.freeze([...records.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function activateNearbyPois(records = [], actor = {}, options = {}) {
  const radius = Math.max(1, Number(options.radiusMeters) || 240);
  const limit = Math.max(1, Math.min(64, Math.floor(Number(options.limit) || 12)));
  return Object.freeze((Array.isArray(records) ? records : [])
    .filter((record) => record?.position && record.semantic?.functional)
    .map((record) => ({ record, distance: Math.hypot(record.position.x - Number(actor.x || 0), record.position.z - Number(actor.z || 0)) }))
    .filter((entry) => entry.distance <= radius)
    .sort((left, right) => left.distance - right.distance || left.record.id.localeCompare(right.record.id))
    .slice(0, limit)
    .map(({ record, distance }) => freezeRecord({ ...record, lifecycle: distance <= 70 ? 'active' : 'nearby', distance })));
}

export {
  CAPABILITY_REGISTRY,
  FAMILY_LABELS,
  POI_GENERATOR_VERSION,
  POI_SCHEMA_VERSION,
  activateNearbyPois,
  canonicalPoiId,
  classifyPoi,
  normalizePoi,
  normalizePois,
  providerNamespace,
  sourceIdentity
};

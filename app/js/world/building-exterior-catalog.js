const BUILDING_EXTERIOR_GENERATOR_VERSION = 'building-exterior-v2';

const MATERIAL_VARIANTS = Object.freeze({
  red_brick: Object.freeze({ texture: 'brick_wall_001', color: 0x9b5f4d, roughness: 0.91, metalness: 0 }),
  warm_red_brick: Object.freeze({ texture: 'brick_wall_07', color: 0xa96850, roughness: 0.93, metalness: 0 }),
  brown_brick: Object.freeze({ texture: 'brick_wall_12', color: 0x8d6d58, roughness: 0.92, metalness: 0 }),
  tan_brick: Object.freeze({ texture: 'brick_wall_12', color: 0xc09a70, roughness: 0.9, metalness: 0 }),
  dark_brick: Object.freeze({ texture: 'brick_wall_10', color: 0x51443f, roughness: 0.94, metalness: 0 }),
  painted_brick_light: Object.freeze({ texture: 'brick_wall_001', color: 0xc9c5b9, roughness: 0.9, metalness: 0 }),
  painted_brick_dark: Object.freeze({ texture: 'brick_wall_10', color: 0x596066, roughness: 0.92, metalness: 0 }),
  limestone: Object.freeze({ texture: 'facade_tiles', color: 0xc8c0ad, roughness: 0.86, metalness: 0 }),
  light_stone: Object.freeze({ texture: 'facade_tiles', color: 0xd4c9b2, roughness: 0.88, metalness: 0 }),
  dark_stone: Object.freeze({ texture: 'facade_tiles', color: 0x77736d, roughness: 0.91, metalness: 0 }),
  concrete_light: Object.freeze({ texture: 'concrete', color: 0xb8b7b1, roughness: 0.9, metalness: 0 }),
  concrete_dark: Object.freeze({ texture: 'concrete', color: 0x74797b, roughness: 0.93, metalness: 0 }),
  concrete_panel: Object.freeze({ texture: 'facade_tiles', color: 0xa7a49b, roughness: 0.88, metalness: 0 }),
  stucco_cream: Object.freeze({ texture: 'plastered_wall_02', color: 0xd0bd9e, roughness: 0.91, metalness: 0 }),
  stucco_white: Object.freeze({ texture: 'plastered_wall_02', color: 0xd3d1c8, roughness: 0.9, metalness: 0 }),
  stucco_earth: Object.freeze({ texture: 'plastered_wall_02', color: 0xad8e72, roughness: 0.93, metalness: 0 }),
  siding_light: Object.freeze({ texture: 'plastered_wall_02', color: 0xc4c7c1, roughness: 0.86, metalness: 0, surfacePattern: 'horizontal_siding' }),
  siding_dark: Object.freeze({ texture: 'plastered_wall_02', color: 0x667476, roughness: 0.88, metalness: 0, surfacePattern: 'horizontal_siding' }),
  metal_silver: Object.freeze({ texture: 'corrugated_iron', color: 0x9ca7aa, roughness: 0.66, metalness: 0.38 }),
  metal_dark: Object.freeze({ texture: 'corrugated_iron', color: 0x4f5a5f, roughness: 0.68, metalness: 0.44 }),
  industrial_panel: Object.freeze({ texture: 'facade_tiles', color: 0x7f898c, roughness: 0.78, metalness: 0.18 }),
  glass_blue: Object.freeze({ texture: 'glass_curtain', color: 0x708c9f, roughness: 0.32, metalness: 0.14, surfacePattern: 'glass' }),
  glass_neutral: Object.freeze({ texture: 'glass_curtain', color: 0x89979e, roughness: 0.3, metalness: 0.16, surfacePattern: 'glass' }),
  glass_dark: Object.freeze({ texture: 'glass_curtain', color: 0x405560, roughness: 0.28, metalness: 0.18, surfacePattern: 'glass' })
});

const WINDOW_STYLES = Object.freeze({
  sash_single: Object.freeze({ code: 0, bayWidth: 3.05, floorHeight: 3.15, width: 0.46, height: 0.58, frame: 0.055 }),
  sash_double: Object.freeze({ code: 1, bayWidth: 3.55, floorHeight: 3.2, width: 0.58, height: 0.57, frame: 0.05 }),
  townhouse_narrow: Object.freeze({ code: 2, bayWidth: 2.65, floorHeight: 3.0, width: 0.42, height: 0.6, frame: 0.06 }),
  residential_modern: Object.freeze({ code: 3, bayWidth: 3.7, floorHeight: 3.05, width: 0.64, height: 0.58, frame: 0.045 }),
  apartment_wide: Object.freeze({ code: 4, bayWidth: 4.15, floorHeight: 3.0, width: 0.68, height: 0.54, frame: 0.04 }),
  apartment_paired: Object.freeze({ code: 5, bayWidth: 4.55, floorHeight: 3.05, width: 0.7, height: 0.58, frame: 0.045 }),
  bay_window: Object.freeze({ code: 6, bayWidth: 3.65, floorHeight: 3.15, width: 0.72, height: 0.62, frame: 0.065 }),
  historic_tall: Object.freeze({ code: 7, bayWidth: 3.35, floorHeight: 3.65, width: 0.48, height: 0.62, frame: 0.065 }),
  office_grid: Object.freeze({ code: 8, bayWidth: 3.25, floorHeight: 3.55, width: 0.72, height: 0.56, frame: 0.038 }),
  curtain_panel: Object.freeze({ code: 9, bayWidth: 2.35, floorHeight: 3.7, width: 0.83, height: 0.74, frame: 0.025 }),
  industrial_high: Object.freeze({ code: 10, bayWidth: 5.2, floorHeight: 5.4, width: 0.56, height: 0.36, frame: 0.06 }),
  clerestory: Object.freeze({ code: 11, bayWidth: 4.7, floorHeight: 4.8, width: 0.72, height: 0.24, frame: 0.05 })
});

const DOOR_STYLES = Object.freeze({
  townhouse_panel: Object.freeze({ atlasCell: 0, width: 1.2, height: 2.5 }),
  residential_glass: Object.freeze({ atlasCell: 1, width: 1.25, height: 2.55 }),
  residential_double: Object.freeze({ atlasCell: 0, width: 1.8, height: 2.55 }),
  apartment_lobby: Object.freeze({ atlasCell: 3, width: 2.0, height: 2.7 }),
  commercial_glass: Object.freeze({ atlasCell: 2, width: 1.65, height: 2.7 }),
  commercial_double: Object.freeze({ atlasCell: 3, width: 2.25, height: 2.75 }),
  office_metal_glass: Object.freeze({ atlasCell: 2, width: 1.75, height: 2.7 }),
  institutional_double: Object.freeze({ atlasCell: 4, width: 2.15, height: 2.75 }),
  civic_transom: Object.freeze({ atlasCell: 4, width: 1.85, height: 2.78 }),
  industrial_steel: Object.freeze({ atlasCell: 5, width: 1.4, height: 2.6 }),
  garage_rollup: Object.freeze({ atlasCell: 5, width: 2.8, height: 2.55 }),
  loading_dock: Object.freeze({ atlasCell: 5, width: 3.2, height: 3.15 })
});

const STOREFRONT_STYLES = Object.freeze({
  none: Object.freeze({ code: 0, glazing: 0 }),
  large_glazing: Object.freeze({ code: 1, glazing: 0.78 }),
  divided_glazing: Object.freeze({ code: 2, glazing: 0.68 }),
  recessed_entry: Object.freeze({ code: 3, glazing: 0.62 }),
  corner_storefront: Object.freeze({ code: 4, glazing: 0.82 }),
  canvas_awning: Object.freeze({ code: 5, glazing: 0.68 }),
  masonry_shopfront: Object.freeze({ code: 6, glazing: 0.55 }),
  modern_retail: Object.freeze({ code: 7, glazing: 0.86 }),
  metal_canopy: Object.freeze({ code: 8, glazing: 0.74 })
});

const DETAIL_MODULES = Object.freeze([
  'entry_step', 'townhouse_stoop', 'stoop_railing', 'small_porch',
  'storefront_awning', 'balcony', 'fire_escape', 'masonry_cornice',
  'modern_parapet', 'loading_canopy', 'garage_surround', 'roof_vent',
  'rooftop_hvac', 'chimney'
]);

function family(definition) {
  const storefronts = definition.storefronts || ['none'];
  const details = definition.details || [];
  return Object.freeze({
    ...definition,
    materials: Object.freeze([...definition.materials]),
    windows: Object.freeze([...definition.windows]),
    doors: Object.freeze([...definition.doors]),
    storefronts: Object.freeze([...storefronts]),
    details: Object.freeze([...details])
  });
}

const BUILDING_EXTERIOR_FAMILIES = Object.freeze({
  narrow_urban_rowhouse: family({ category: 'residential', materials: ['red_brick', 'warm_red_brick', 'brown_brick', 'painted_brick_light', 'painted_brick_dark', 'stucco_white', 'concrete_light'], windows: ['townhouse_narrow', 'sash_single', 'bay_window'], doors: ['townhouse_panel', 'residential_glass'], details: ['entry_step', 'townhouse_stoop', 'stoop_railing', 'masonry_cornice'] }),
  wide_urban_townhouse: family({ category: 'residential', materials: ['red_brick', 'brown_brick', 'tan_brick', 'limestone', 'stucco_cream', 'stucco_white', 'concrete_light'], windows: ['sash_double', 'historic_tall', 'bay_window'], doors: ['townhouse_panel', 'residential_double'], details: ['townhouse_stoop', 'stoop_railing', 'small_porch', 'masonry_cornice'] }),
  attached_brick_residential: family({ category: 'residential', materials: ['red_brick', 'warm_red_brick', 'dark_brick', 'painted_brick_light', 'stucco_white', 'concrete_light'], windows: ['sash_single', 'sash_double', 'townhouse_narrow'], doors: ['townhouse_panel', 'residential_glass'], details: ['entry_step', 'townhouse_stoop', 'masonry_cornice'] }),
  detached_suburban_house: family({ category: 'residential', materials: ['siding_light', 'siding_dark', 'red_brick', 'stucco_cream', 'stucco_white'], windows: ['residential_modern', 'sash_double', 'sash_single'], doors: ['residential_glass', 'residential_double', 'townhouse_panel'], details: ['entry_step', 'small_porch', 'chimney'] }),
  small_multifamily: family({ category: 'residential', materials: ['red_brick', 'tan_brick', 'stucco_cream', 'concrete_light'], windows: ['apartment_paired', 'sash_double', 'residential_modern'], doors: ['apartment_lobby', 'residential_double'], details: ['entry_step', 'small_porch', 'masonry_cornice'] }),
  apartment_walkup: family({ category: 'residential', materials: ['red_brick', 'brown_brick', 'painted_brick_light', 'stucco_cream'], windows: ['sash_single', 'sash_double', 'apartment_paired'], doors: ['apartment_lobby', 'residential_double'], details: ['entry_step', 'masonry_cornice', 'fire_escape'] }),
  apartment_midrise: family({ category: 'residential', materials: ['tan_brick', 'concrete_light', 'concrete_panel', 'red_brick'], windows: ['apartment_wide', 'apartment_paired', 'office_grid'], doors: ['apartment_lobby', 'commercial_double'], details: ['balcony', 'modern_parapet'] }),
  apartment_masonry: family({ category: 'residential', materials: ['red_brick', 'brown_brick', 'dark_brick', 'limestone'], windows: ['historic_tall', 'sash_double', 'apartment_paired'], doors: ['apartment_lobby', 'civic_transom'], details: ['masonry_cornice', 'fire_escape'] }),
  apartment_modern: family({ category: 'residential', materials: ['concrete_panel', 'stucco_white', 'glass_neutral', 'glass_blue'], windows: ['apartment_wide', 'residential_modern', 'curtain_panel'], doors: ['apartment_lobby', 'office_metal_glass'], details: ['balcony', 'modern_parapet'] }),
  small_urban_storefront: family({ category: 'commercial', materials: ['red_brick', 'brown_brick', 'painted_brick_light', 'stucco_cream'], windows: ['sash_single', 'sash_double'], doors: ['commercial_glass', 'commercial_double'], storefronts: ['large_glazing', 'divided_glazing', 'canvas_awning', 'masonry_shopfront'], details: ['storefront_awning', 'masonry_cornice'] }),
  mixed_use_storefront: family({ category: 'commercial', materials: ['red_brick', 'brown_brick', 'tan_brick', 'limestone', 'stucco_cream'], windows: ['sash_double', 'apartment_paired', 'historic_tall'], doors: ['commercial_glass', 'commercial_double'], storefronts: ['large_glazing', 'divided_glazing', 'recessed_entry', 'canvas_awning', 'masonry_shopfront'], details: ['storefront_awning', 'masonry_cornice'] }),
  strip_commercial: family({ category: 'commercial', materials: ['stucco_cream', 'stucco_white', 'painted_brick_light', 'concrete_panel'], windows: ['office_grid', 'residential_modern'], doors: ['commercial_glass', 'commercial_double'], storefronts: ['large_glazing', 'divided_glazing', 'modern_retail'], details: ['storefront_awning', 'modern_parapet'] }),
  standalone_retail: family({ category: 'commercial', materials: ['red_brick', 'painted_brick_light', 'concrete_panel', 'industrial_panel'], windows: ['office_grid', 'clerestory'], doors: ['commercial_double', 'institutional_double'], storefronts: ['large_glazing', 'corner_storefront', 'modern_retail', 'metal_canopy'], details: ['storefront_awning', 'modern_parapet'] }),
  small_office: family({ category: 'office', materials: ['red_brick', 'limestone', 'concrete_light', 'stucco_white'], windows: ['office_grid', 'sash_double', 'residential_modern'], doors: ['office_metal_glass', 'commercial_double'], details: ['entry_step', 'modern_parapet'] }),
  masonry_office: family({ category: 'office', materials: ['red_brick', 'brown_brick', 'limestone', 'dark_stone'], windows: ['office_grid', 'historic_tall'], doors: ['office_metal_glass', 'civic_transom'], details: ['masonry_cornice', 'modern_parapet'] }),
  modern_office: family({ category: 'office', materials: ['concrete_panel', 'concrete_light', 'glass_neutral', 'glass_blue'], windows: ['office_grid', 'curtain_panel'], doors: ['office_metal_glass', 'commercial_double'], details: ['modern_parapet'] }),
  glass_office_highrise: family({ category: 'office', materials: ['glass_blue', 'glass_neutral', 'glass_dark'], windows: ['curtain_panel', 'office_grid'], doors: ['commercial_double', 'office_metal_glass'], details: ['modern_parapet', 'rooftop_hvac'] }),
  brick_warehouse: family({ category: 'industrial', materials: ['red_brick', 'warm_red_brick', 'dark_brick'], windows: ['industrial_high', 'clerestory'], doors: ['industrial_steel', 'loading_dock'], details: ['loading_canopy', 'masonry_cornice', 'roof_vent'] }),
  metal_warehouse: family({ category: 'industrial', materials: ['metal_silver', 'metal_dark', 'industrial_panel'], windows: ['clerestory', 'industrial_high'], doors: ['loading_dock', 'industrial_steel'], details: ['loading_canopy', 'modern_parapet', 'roof_vent'] }),
  industrial_factory: family({ category: 'industrial', materials: ['dark_brick', 'industrial_panel', 'metal_dark', 'concrete_dark'], windows: ['industrial_high', 'clerestory'], doors: ['loading_dock', 'industrial_steel'], details: ['loading_canopy', 'roof_vent', 'rooftop_hvac'] }),
  distribution_loading: family({ category: 'industrial', materials: ['concrete_panel', 'industrial_panel', 'metal_silver'], windows: ['clerestory'], doors: ['loading_dock', 'garage_rollup'], details: ['loading_canopy', 'modern_parapet', 'rooftop_hvac'] }),
  school: family({ category: 'institutional', materials: ['red_brick', 'tan_brick', 'concrete_light', 'limestone'], windows: ['office_grid', 'sash_double'], doors: ['institutional_double', 'civic_transom'], details: ['entry_step', 'masonry_cornice', 'modern_parapet'] }),
  hospital_medical: family({ category: 'institutional', materials: ['stucco_white', 'concrete_light', 'concrete_panel', 'glass_neutral'], windows: ['office_grid', 'curtain_panel'], doors: ['institutional_double', 'commercial_double'], details: ['modern_parapet', 'rooftop_hvac'] }),
  civic_government: family({ category: 'institutional', materials: ['limestone', 'light_stone', 'red_brick', 'concrete_light'], windows: ['historic_tall', 'office_grid'], doors: ['civic_transom', 'institutional_double'], details: ['entry_step', 'masonry_cornice'] }),
  religious: family({ category: 'institutional', materials: ['limestone', 'light_stone', 'red_brick', 'stucco_cream'], windows: ['historic_tall', 'sash_single'], doors: ['civic_transom', 'institutional_double'], details: ['entry_step', 'masonry_cornice'] }),
  hotel: family({ category: 'commercial', materials: ['red_brick', 'limestone', 'concrete_panel', 'glass_neutral'], windows: ['historic_tall', 'apartment_wide', 'curtain_panel'], doors: ['commercial_double', 'civic_transom'], storefronts: ['recessed_entry', 'large_glazing', 'modern_retail'], details: ['storefront_awning', 'balcony', 'masonry_cornice', 'modern_parapet'] }),
  parking_structure: family({ category: 'transport', materials: ['concrete_light', 'concrete_dark', 'concrete_panel'], windows: ['clerestory'], doors: ['garage_rollup', 'industrial_steel'], details: ['garage_surround', 'modern_parapet'] }),
  agricultural_farm: family({ category: 'agricultural', materials: ['warm_red_brick', 'metal_silver', 'metal_dark', 'siding_light'], windows: ['clerestory', 'sash_single'], doors: ['garage_rollup', 'industrial_steel'], details: ['garage_surround', 'roof_vent'] }),
  garage_service: family({ category: 'industrial', materials: ['red_brick', 'concrete_panel', 'industrial_panel', 'metal_silver'], windows: ['clerestory', 'office_grid'], doors: ['garage_rollup', 'industrial_steel'], details: ['garage_surround', 'loading_canopy', 'modern_parapet'] }),
  transit_transport: family({ category: 'transport', materials: ['red_brick', 'limestone', 'concrete_panel', 'glass_neutral'], windows: ['historic_tall', 'office_grid', 'curtain_panel'], doors: ['institutional_double', 'commercial_double'], storefronts: ['large_glazing', 'modern_retail'], details: ['entry_step', 'modern_parapet', 'masonry_cornice'] }),
  generic_unknown: family({ category: 'fallback', materials: ['red_brick', 'tan_brick', 'concrete_light', 'stucco_cream', 'painted_brick_light'], windows: ['sash_double', 'residential_modern', 'office_grid'], doors: ['residential_glass', 'commercial_glass'], details: ['entry_step', 'modern_parapet'] })
});

function stableStringHash(value = '') {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function choose(values, seed) {
  return values[Math.abs(Number(seed) || 0) % values.length];
}

function normalizedContext(options = {}) {
  const tags = options.tags && typeof options.tags === 'object' ? options.tags : {};
  const buildingType = String(options.buildingType || tags.building || tags['building:part'] || 'yes').trim().toLowerCase();
  const usage = [buildingType, tags['building:use'], tags.use, tags.shop, tags.office, tags.amenity, tags.industrial, tags.tourism, tags.leisure]
    .filter(Boolean).join(' ').toLowerCase();
  const height = Math.max(0, Number(options.heightMeters || 0));
  const levels = Math.max(1, Math.round(Number(options.levels || height / 3.2 || 1)));
  const width = Math.max(0, Number(options.footprintWidth || 0));
  const depth = Math.max(0, Number(options.footprintDepth || 0));
  const area = Math.max(0, Number(options.footprintArea || 0));
  return { tags, buildingType, usage, height, levels, width, depth, area, denseUrban: options.denseUrban === true };
}

function inferFamilyId(context, seed) {
  seed = Number(seed) >>> 0;
  const { buildingType: type, usage, height, levels, width, depth, area, denseUrban, tags } = context;
  if (/hospital|clinic|doctors|medical|healthcare/.test(usage)) return 'hospital_medical';
  if (/school|college|university|kindergarten|education/.test(usage)) return 'school';
  if (/church|cathedral|chapel|mosque|synagogue|temple|religious/.test(usage)) return 'religious';
  if (/government|civic|public|courthouse|townhall|library|fire_station|police/.test(usage)) return 'civic_government';
  if (/hotel|motel|hostel|guest_house/.test(usage)) return 'hotel';
  if (/train_station|transportation|terminal|station/.test(usage)) return 'transit_transport';
  if (/parking|parking_garage/.test(usage)) return 'parking_structure';
  if (/barn|farm|agricultural|stable|cowshed|farm_auxiliary/.test(usage)) return 'agricultural_farm';
  if (/garage|garages|service/.test(type) || /car_repair|vehicle/.test(usage)) return 'garage_service';
  if (/warehouse/.test(usage)) return area >= 900 ? 'distribution_loading' : (seed & 1) ? 'metal_warehouse' : 'brick_warehouse';
  if (/industrial|factory|manufacture|plant/.test(usage)) return area >= 1200 ? 'distribution_loading' : 'industrial_factory';
  if (/office|skyscraper|central_office/.test(usage)) {
    if (height >= 48 || levels >= 14) return 'glass_office_highrise';
    if (height >= 24 || levels >= 7) return (seed & 1) ? 'modern_office' : 'masonry_office';
    return 'small_office';
  }
  const commerce = /retail|commercial|supermarket|mall|kiosk|shop|marketplace/.test(usage) || Boolean(tags.shop);
  if (commerce) {
    if (area >= 850) return 'standalone_retail';
    if (!denseUrban && width >= 24 && height <= 12) return 'strip_commercial';
    if (height >= 9 || levels >= 3) return 'mixed_use_storefront';
    return 'small_urban_storefront';
  }
  if (/apartments|dormitory|multifamily|condominium/.test(usage)) {
    if (height >= 34 || levels >= 10) return (seed & 1) ? 'apartment_modern' : 'apartment_midrise';
    if (height >= 17 || levels >= 5) return seed % 3 === 0 ? 'apartment_masonry' : 'apartment_midrise';
    return seed % 3 === 0 ? 'apartment_walkup' : 'small_multifamily';
  }
  if (/terrace|townhouse|semidetached/.test(usage)) {
    if (width <= 8.5 || Math.min(width, depth) <= 7.5) return 'narrow_urban_rowhouse';
    return (seed & 1) ? 'wide_urban_townhouse' : 'attached_brick_residential';
  }
  if (/house|detached|bungalow|residential/.test(usage)) {
    if (denseUrban && Math.min(width, depth) <= 8.2) return 'narrow_urban_rowhouse';
    if (levels >= 3 || height >= 11.5) return 'small_multifamily';
    return 'detached_suburban_house';
  }
  if (height >= 48 || levels >= 14) return seed % 3 === 0 ? 'glass_office_highrise' : 'apartment_modern';
  if (area >= 1400 && height <= 18) return 'distribution_loading';
  if (area >= 650 && height <= 14) return seed % 3 === 0 ? 'standalone_retail' : 'metal_warehouse';
  if (denseUrban && height >= 18) return ['apartment_masonry', 'apartment_midrise', 'modern_office'][seed % 3];
  if (denseUrban && height >= 9) return seed % 4 === 0 ? 'mixed_use_storefront' : 'apartment_walkup';
  if (area <= 180 && Math.min(width, depth) <= 8.5) return 'narrow_urban_rowhouse';
  if (area <= 320 && height <= 13) return 'detached_suburban_house';
  return 'generic_unknown';
}

function regionalMaterialBias(location = {}) {
  const code = String(location.countryCode || location.country_code || '').toUpperCase();
  const name = String(location.name || '').toLowerCase();
  if (code === 'JP') return ['concrete_light', 'concrete_panel', 'stucco_white', 'metal_dark'];
  if (code === 'AE' || /dubai/.test(name)) return ['stucco_cream', 'limestone', 'light_stone', 'glass_blue'];
  if (['GB', 'FR', 'NL', 'BE', 'DE', 'MC'].includes(code)) return ['brown_brick', 'limestone', 'stucco_cream', 'light_stone'];
  if (code === 'US' && /baltimore|new york|philadelphia|boston|chicago/.test(name)) return ['red_brick', 'warm_red_brick', 'brown_brick', 'limestone'];
  if (code === 'US') return ['red_brick', 'stucco_cream', 'siding_light', 'concrete_light'];
  return [];
}

function compatibleRegionalMaterials(familyDefinition, location) {
  const familyMaterials = new Set(familyDefinition.materials);
  return regionalMaterialBias(location).filter((material) => familyMaterials.has(material));
}

function detailTier(options = {}) {
  const tier = String(options.qualityTier || 'balanced').toLowerCase();
  if (tier === 'low') return 'low';
  if (tier === 'performance') return 'performance';
  if (tier === 'quality' || tier === 'high') return 'quality';
  return 'balanced';
}

function selectBuildingExteriorProfile(options = {}) {
  const context = normalizedContext(options);
  const stableIdentity = String(options.buildingIdentity || options.sourceBuildingId || `${context.buildingType}:${options.buildingSeed || 0}`);
  const buildingSeed = (Number(options.buildingSeed) || stableStringHash(stableIdentity)) >>> 0;
  // Local X/Z move when the world origin changes. District variation must be
  // anchored to geography; callers without it fall back to stable identity.
  const geo = options.geographicCenter;
  const districtKey = Number.isFinite(geo?.lat) && Number.isFinite(geo?.lon)
    ? `${Math.floor(geo.lat * 1000)}:${Math.floor(geo.lon * 1000)}`
    : stableIdentity;
  const districtSeed = stableStringHash(districtKey);
  const familyId = inferFamilyId(context, buildingSeed ^ districtSeed);
  const definition = BUILDING_EXTERIOR_FAMILIES[familyId] || BUILDING_EXTERIOR_FAMILIES.generic_unknown;
  const regional = compatibleRegionalMaterials(definition, options.location || {});
  const materials = regional.length > 0 && ((buildingSeed >>> 3) % 4 !== 0)
    ? [...regional, ...definition.materials]
    : definition.materials;
  const materialId = choose(materials, buildingSeed ^ (districtSeed >>> 2));
  const windowStyle = choose(definition.windows, buildingSeed >>> 3);
  const doorStyle = choose(definition.doors, buildingSeed >>> 7);
  const storefrontStyle = choose(definition.storefronts, buildingSeed >>> 11);
  const tier = detailTier(options);
  const enabledDetails = tier === 'low'
    ? []
    : tier === 'performance'
      ? definition.details.filter((detail) => ['entry_step', 'storefront_awning', 'masonry_cornice', 'modern_parapet', 'garage_surround'].includes(detail))
      : definition.details;
  return Object.freeze({
    generatorVersion: BUILDING_EXTERIOR_GENERATOR_VERSION,
    familyId,
    category: definition.category,
    materialId,
    material: MATERIAL_VARIANTS[materialId],
    windowStyle,
    window: WINDOW_STYLES[windowStyle],
    doorStyle,
    door: DOOR_STYLES[doorStyle],
    storefrontStyle,
    storefront: STOREFRONT_STYLES[storefrontStyle],
    details: Object.freeze([...enabledDetails]),
    detailTier: tier,
    districtKey,
    sourceClaim: 'generated-visual-representation',
    selectionBasis: Object.freeze({
      buildingType: context.buildingType,
      metadata: context.buildingType !== 'yes' || context.usage !== 'yes',
      denseUrban: context.denseUrban,
      regionalBiasApplied: regional.includes(materialId)
    })
  });
}

function buildingExteriorCatalogSnapshot() {
  return Object.freeze({
    generatorVersion: BUILDING_EXTERIOR_GENERATOR_VERSION,
    familyCount: Object.keys(BUILDING_EXTERIOR_FAMILIES).length,
    materialCount: Object.keys(MATERIAL_VARIANTS).length,
    windowCount: Object.keys(WINDOW_STYLES).length,
    doorCount: Object.keys(DOOR_STYLES).length,
    storefrontCount: Object.keys(STOREFRONT_STYLES).length - 1,
    detailModuleCount: DETAIL_MODULES.length
  });
}

export {
  BUILDING_EXTERIOR_FAMILIES,
  BUILDING_EXTERIOR_GENERATOR_VERSION,
  DETAIL_MODULES,
  DOOR_STYLES,
  MATERIAL_VARIANTS,
  STOREFRONT_STYLES,
  WINDOW_STYLES,
  buildingExteriorCatalogSnapshot,
  selectBuildingExteriorProfile,
  stableStringHash
};

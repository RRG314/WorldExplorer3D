import { ctx as appCtx } from "../shared-context.js?v=55";

const DRIVEABLE_HIGHWAY_TYPES = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'service'
]);

const LINEAR_FEATURE_STYLE_PRESETS = {
  railway: {
    width: 3.2,
    bias: 0.02,
    color: 0x53545a,
    emissive: 0x111317,
    emissiveIntensity: 0.08,
    roughness: 0.9,
    metalness: 0.07,
    opacity: 1
  },
  footway: {
    width: 1.8,
    bias: 0.018,
    color: 0xbfb8ad,
    emissive: 0x1c1a17,
    emissiveIntensity: 0.03,
    roughness: 0.98,
    metalness: 0.01,
    opacity: 1
  },
  cycleway: {
    width: 3.0,
    bias: 0.018,
    color: 0x6f847a,
    emissive: 0x131916,
    emissiveIntensity: 0.03,
    roughness: 0.95,
    metalness: 0.02,
    opacity: 1
  }
};

function clampLinearFeatureWidth(width, fallback) {
  if (!Number.isFinite(width)) return fallback;
  return Math.max(0.9, Math.min(7.5, width));
}

function buildingPaletteForType(buildingType = 'yes') {
  switch (buildingType) {
  case 'house':
  case 'residential':
  case 'detached':
    return ['#d4c7b5', '#c7aa8a', '#b99176', '#a8826d', '#c9beb0'];
  case 'apartments':
    return ['#c5c1b8', '#b6b6ae', '#8f99a4', '#cbb4a4', '#9da7b3'];
  case 'commercial':
  case 'office':
    return ['#acb4bd', '#8e99a5', '#d0c1b2', '#b7afa4', '#8a949f'];
  case 'industrial':
  case 'warehouse':
    return ['#9ba0a4', '#898b8f', '#7d858c', '#aca79a', '#8d8d84'];
  case 'church':
  case 'cathedral':
    return ['#9d8d7c', '#b19b85', '#85796e', '#c0b1a0', '#8d745f'];
  default:
    return ['#a8b0b7', '#95897b', '#76828e', '#c3bbb0', '#8d7364', '#b3bcc4'];
  }
}

export function roadTypePriority(type) {
  if (!type) return 0;
  if (type.includes('motorway')) return 6;
  if (type.includes('trunk')) return 5;
  if (type.includes('primary')) return 4;
  if (type.includes('secondary')) return 3;
  if (type.includes('tertiary')) return 2;
  if (type.includes('residential') || type.includes('unclassified') || type.includes('living_street')) return 2;
  if (type.includes('service')) return 1;
  return 1;
}

function parseRoadWidthMeters(rawValue, fallback = NaN) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
  const raw = String(rawValue ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  const first = raw.split(/[;,]/)[0]?.trim() || '';
  if (!first) return fallback;

  const numeric = Number.parseFloat(first);
  if (!Number.isFinite(numeric)) return fallback;
  if (/(^|\s)(ft|feet|foot)\b|\'/.test(first)) return numeric * 0.3048;
  if (/(^|\s)in\b|\"/.test(first)) return numeric * 0.0254;
  return numeric;
}

function parseLaneCount(rawValue, fallback = NaN) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return Math.max(1, Math.round(rawValue));
  const raw = String(rawValue ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  const first = raw.split(/[;,]/)[0]?.trim() || '';
  const parsed = Number.parseFloat(first);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
}

function defaultRoadWidthMeters(highway = '', service = '') {
  const type = String(highway || '').toLowerCase();
  const serviceKind = String(service || '').toLowerCase();

  if (type.includes('motorway')) return 10.8;
  if (type.includes('trunk')) return 9.3;
  if (type.includes('primary')) return 7.9;
  if (type.includes('secondary')) return 6.9;
  if (type.includes('tertiary')) return 6.2;
  if (type.includes('living_street')) return 4.3;
  if (type.includes('service')) {
    if (serviceKind === 'parking_aisle') return 3.0;
    if (serviceKind === 'driveway') return 2.9;
    return 3.8;
  }
  if (type.includes('residential') || type.includes('unclassified')) return 5.0;
  return 4.8;
}

function estimatedLaneWidthMeters(highway = '', service = '') {
  const type = String(highway || '').toLowerCase();
  const serviceKind = String(service || '').toLowerCase();

  if (type.includes('motorway')) return 3.45;
  if (type.includes('trunk') || type.includes('primary')) return 3.2;
  if (type.includes('secondary') || type.includes('tertiary')) return 3.0;
  if (type.includes('service')) {
    if (serviceKind === 'parking_aisle') return 2.45;
    if (serviceKind === 'driveway') return 2.55;
    return 2.7;
  }
  if (type.includes('living_street')) return 2.7;
  return 2.9;
}

export function estimateDriveableRoadWidth(tags = {}) {
  const highway = String(tags?.highway || '').toLowerCase();
  const service = String(tags?.service || '').toLowerCase();
  const widthTag = parseRoadWidthMeters(tags?.width);
  if (Number.isFinite(widthTag)) {
    return Math.max(2.8, Math.min(18, widthTag));
  }

  const lanes = parseLaneCount(tags?.lanes);
  if (Number.isFinite(lanes)) {
    const laneWidth = estimatedLaneWidthMeters(highway, service);
    const shoulderAllowance =
      highway.includes('motorway') ? 1.0 :
      highway.includes('trunk') || highway.includes('primary') ? 0.6 :
      lanes >= 3 ? 0.45 :
      0.2;
    const estimated = lanes * laneWidth + shoulderAllowance;
    return Math.max(3.0, Math.min(18, estimated));
  }

  return defaultRoadWidthMeters(highway, service);
}

export function isDriveableHighwayTag(highway = '') {
  return DRIVEABLE_HIGHWAY_TYPES.has(String(highway || '').toLowerCase());
}

export function classifyLinearFeatureTags(tags = {}, options = {}) {
  if (options.linearFeaturesEnabled !== true && options.force !== true) return null;
  const highway = String(tags?.highway || '').toLowerCase();
  const railway = String(tags?.railway || '').toLowerCase();
  const bicycle = String(tags?.bicycle || '').toLowerCase();
  const footway = String(tags?.footway || '').toLowerCase();
  const generalizedVectorFeature = Number(tags?.sourceFeatureId) < 0;

  if (tags?.area === 'yes' && options.force !== true) return null;

  if (/^(rail|light_rail|tram|subway|narrow_gauge)$/.test(railway)) {
    return { kind: 'railway', subtype: railway };
  }
  if (highway === 'cycleway') {
    return { kind: 'cycleway', subtype: highway };
  }
  if (highway === 'path' && bicycle === 'designated') {
    return { kind: 'cycleway', subtype: 'shared_path' };
  }
  if (generalizedVectorFeature && /^(footway|path)$/.test(highway) && !/^(sidewalk|crossing)$/.test(footway)) {
    return null;
  }
  if (/^(footway|pedestrian|steps|path)$/.test(highway)) {
    const subtype = highway === 'footway' && /^(sidewalk|crossing)$/.test(footway) ? footway : highway;
    return { kind: 'footway', subtype: subtype || 'footway' };
  }
  return null;
}

export function linearFeaturePriority(kind, subtype = '') {
  if (kind === 'railway') {
    if (subtype === 'rail') return 4;
    if (subtype === 'light_rail' || subtype === 'tram') return 3;
    return 2;
  }
  if (kind === 'cycleway') return subtype === 'cycleway' ? 3 : 2;
  if (kind === 'footway') {
    if (subtype === 'pedestrian') return 3;
    if (subtype === 'sidewalk' || subtype === 'crossing') return 3;
    if (subtype === 'footway') return 2;
    return 1;
  }
  return 0;
}

export function linearFeatureVisualSpec(classification, tags = {}) {
  const kind = classification?.kind;
  const preset = LINEAR_FEATURE_STYLE_PRESETS[kind] || LINEAR_FEATURE_STYLE_PRESETS.footway;
  const parsedWidth = Number.parseFloat(tags?.width);
  let width = preset.width;

  if (kind === 'railway') {
    if (classification?.subtype === 'tram') width = 2.4;
    if (classification?.subtype === 'subway') width = 2.2;
  } else if (kind === 'footway') {
    if (classification?.subtype === 'pedestrian') width = 2.6;
    if (classification?.subtype === 'sidewalk') width = 1.8;
    if (classification?.subtype === 'crossing') width = 2.2;
    if (classification?.subtype === 'footway') width = 1.8;
    if (classification?.subtype === 'path') width = 1.4;
    if (classification?.subtype === 'steps') width = 1.3;
  } else if (kind === 'cycleway' && classification?.subtype === 'shared_path') {
    width = 2.5;
  }

  return {
    ...preset,
    width: clampLinearFeatureWidth(parsedWidth, width)
  };
}

export function pickBuildingBaseColor(buildingType, bSeed) {
  const palette = buildingPaletteForType(buildingType);
  const baseIdx = Math.floor(appCtx.rand01FromInt(bSeed ^ 0x514e2d3b) * palette.length) % palette.length;
  const baseColor = new THREE.Color(palette[baseIdx]);
  const hueShift = (appCtx.rand01FromInt(bSeed ^ 0x9e3779b9) - 0.5) * 0.015;
  const satShift = (appCtx.rand01FromInt(bSeed ^ 0x85ebca6b) - 0.5) * 0.035;
  const lightShift = (appCtx.rand01FromInt(bSeed ^ 0xc2b2ae35) - 0.5) * 0.06;
  baseColor.offsetHSL(hueShift, satShift, lightShift);
  return `#${baseColor.getHexString()}`;
}

export function pickRoofColor(bSeed) {
  const palette = ['#5b5f66', '#6b6258', '#7b7469', '#4d5661', '#7b6e60'];
  const idx = Math.floor(appCtx.rand01FromInt(bSeed ^ 0x7f4a7c15) * palette.length) % palette.length;
  const color = new THREE.Color(palette[idx]);
  color.offsetHSL(
    (appCtx.rand01FromInt(bSeed ^ 0x165667b1) - 0.5) * 0.02,
    (appCtx.rand01FromInt(bSeed ^ 0xd3a2646c) - 0.5) * 0.05,
    (appCtx.rand01FromInt(bSeed ^ 0x27d4eb2f) - 0.5) * 0.08
  );
  return `#${color.getHexString()}`;
}

export function getPerfModeValue() {
  const mode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode;
  return mode === 'baseline' ? 'baseline' : 'rdt';
}

export function decimateRoadCenterlineByDepth(pts, roadType, tileDepth, mode = getPerfModeValue()) {
  if (!Array.isArray(pts) || pts.length < 3) return pts;
  if (mode === 'baseline') return pts;

  const depth = Math.max(0, tileDepth | 0);
  if (depth < 4) return pts;

  let minSpacing =
    depth >= 6 ? 16 :
    depth === 5 ? 12 :
    8;
  if (roadType?.includes('motorway') || roadType?.includes('trunk')) {
    minSpacing *= 0.75;
  } else if (roadType?.includes('service') || roadType?.includes('residential')) {
    minSpacing *= 1.15;
  }

  const maxStraightTurn =
    depth >= 6 ? 0.20 :
    depth === 5 ? 0.24 :
    0.28;

  const out = [pts[0]];
  let lastKept = pts[0];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const dLast = Math.hypot(curr.x - lastKept.x, curr.z - lastKept.z);
    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const al = Math.hypot(ax, az);
    const bl = Math.hypot(bx, bz);
    let turn = 0;

    if (al > 1e-6 && bl > 1e-6) {
      const dot = (ax * bx + az * bz) / (al * bl);
      turn = Math.acos(Math.max(-1, Math.min(1, dot)));
    }
    if (!(turn > maxStraightTurn) && dLast < minSpacing) continue;
    out.push(curr);
    lastKept = curr;
  }

  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function poiKeyFromTags(tags = {}) {
  if (!tags || typeof tags !== 'object') return null;
  if (tags.amenity) return `amenity=${tags.amenity}`;
  if (tags.shop === 'supermarket') return 'shop=supermarket';
  if (tags.shop === 'mall') return 'shop=mall';
  if (tags.shop === 'convenience') return 'shop=convenience';
  if (tags.tourism) return `tourism=${tags.tourism}`;
  if (tags.historic) return tags.historic === 'monument' ? 'historic=monument' : 'historic=memorial';
  if (tags.leisure) return `leisure=${tags.leisure}`;
  return null;
}

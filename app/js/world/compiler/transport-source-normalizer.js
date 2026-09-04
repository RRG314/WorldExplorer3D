// Pure transport-source normalization. This module deliberately keeps the
// original strings beside parsed values so later compilers never need to
// reconstruct source meaning from renderer-friendly booleans.

const TRANSPORT_SOURCE_SCHEMA_VERSION = 1;
const TRANSPORT_RAW_TAG_KEYS = Object.freeze([
  'highway',
  'service',
  'bridge',
  'tunnel',
  'covered',
  'layer',
  'level',
  'location',
  'cutting',
  'embankment',
  'incline',
  'lanes',
  'placement',
  'width',
  'surface',
  'access',
  'vehicle',
  'motor_vehicle',
  'motorcar',
  'foot',
  'bicycle',
  'horse',
  'maxheight',
  'destination',
  'junction',
  'oneway',
  'indoor',
  'building_passage',
  'min_height',
  'man_made',
  'ramp',
  'lit',
  'sidewalk'
]);

const IMPASSABLE_ACCESS = new Set(['no', 'private']);
const RESTRICTED_ACCESS = new Set(['destination', 'customers', 'delivery', 'permit']);

function sourceString(value) {
  return value == null ? '' : String(value);
}

function parseFirstNumber(value) {
  const match = sourceString(value).trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function parseMeters(value) {
  const raw = sourceString(value).trim().toLowerCase();
  const number = parseFirstNumber(raw);
  if (!Number.isFinite(number)) return null;
  if (/\b(?:ft|feet|foot)\b|['′]/.test(raw)) {
    const inchesMatch = raw.match(/(?:ft|feet|foot|['′])\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|["″])/);
    const inches = inchesMatch ? Number(inchesMatch[1]) : 0;
    return number * 0.3048 + (Number.isFinite(inches) ? inches * 0.0254 : 0);
  }
  if (/\bcm\b/.test(raw)) return number / 100;
  if (/\bmm\b/.test(raw)) return number / 1000;
  return number;
}

function parseLaneCount(value) {
  const number = parseFirstNumber(sourceString(value).split(/[;|]/)[0]);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.round(number)) : null;
}

function normalizedDirection(tags = {}) {
  const raw = sourceString(tags.oneway).trim().toLowerCase();
  const junction = sourceString(tags.junction).trim().toLowerCase();
  const highway = sourceString(tags.highway).trim().toLowerCase();
  if (raw === '-1' || raw === 'reverse') return 'reverse';
  if (['yes', '1', 'true'].includes(raw) || junction === 'roundabout') return 'forward';
  if (['reversible', 'alternating'].includes(raw)) return 'controlled';
  // OSM defines motorway carriageways as one-way even when the optional
  // oneway=yes tag is omitted. An explicit oneway=no still wins because it
  // reaches the ordinary two-way fallback below.
  if (!raw && highway === 'motorway') return 'forward';
  return 'both';
}

function accessValue(tags = {}, keys = []) {
  for (const key of keys) {
    const value = sourceString(tags[key]).trim().toLowerCase();
    if (value) return { key, value };
  }
  return { key: '', value: '' };
}

function normalizedAccess(tags = {}) {
  const highway = sourceString(tags.highway).trim().toLowerCase();
  const motor = accessValue(tags, ['motor_vehicle', 'motorcar', 'vehicle', 'access']);
  const foot = accessValue(tags, ['foot', 'access']);
  const motorImpassable = IMPASSABLE_ACCESS.has(motor.value);
  const footImpassable = IMPASSABLE_ACCESS.has(foot.value);
  const motorwayDefault = !foot.key && /^(?:motorway|motorway_link)$/.test(highway);
  const separatelyMappedSidewalk = !foot.key && sourceString(tags.sidewalk).trim().toLowerCase() === 'separate';
  return Object.freeze({
    motorVehicle: motorImpassable ? 'prohibited' :
      RESTRICTED_ACCESS.has(motor.value) ? 'restricted' : 'allowed',
    pedestrian: footImpassable ? 'prohibited' :
      RESTRICTED_ACCESS.has(foot.value) ? 'restricted' :
        motorwayDefault || separatelyMappedSidewalk ? 'prohibited' : 'allowed',
    motorSource: motor.key || null,
    pedestrianSource: foot.key || (
      motorwayDefault ? 'default:highway=motorway' :
        separatelyMappedSidewalk ? 'sidewalk=separate' : null
    )
  });
}

function defaultLaneCount(highway = '', tags = {}) {
  const kind = sourceString(highway).toLowerCase();
  if (normalizedDirection(tags) === 'forward' || normalizedDirection(tags) === 'reverse') return 1;
  if (/^(motorway|trunk)(?:_link)?$/.test(kind)) return kind.endsWith('_link') ? 1 : 2;
  if (/^(primary|secondary|tertiary)(?:_link)?$/.test(kind)) return kind.endsWith('_link') ? 1 : 2;
  return kind.endsWith('_link') ? 1 : 2;
}

function defaultWidthMeters(highway = '', service = '') {
  const kind = sourceString(highway).toLowerCase();
  const serviceKind = sourceString(service).toLowerCase();
  // Link roads need a complete drivable cross-section, not only the nominal
  // lane stripe. The previous 4.2 m catch-all left less than a metre of usable
  // recovery room beside the vehicle once bridge barriers were installed.
  if (kind === 'motorway_link') return 6.2;
  if (kind === 'trunk_link') return 5.8;
  if (kind === 'primary_link') return 5.5;
  if (/^(secondary|tertiary)_link$/.test(kind)) return 5.2;
  if (kind === 'motorway') return 10.8;
  if (kind === 'trunk') return 9.3;
  if (kind === 'primary') return 7.9;
  if (kind === 'secondary') return 6.9;
  if (kind === 'tertiary') return 6.2;
  if (kind === 'living_street') return 4.3;
  if (kind === 'service') {
    if (serviceKind === 'parking_aisle') return 3;
    if (serviceKind === 'driveway') return 2.9;
    return 3.8;
  }
  if (kind === 'residential' || kind === 'unclassified') return 5;
  if (kind.endsWith('_link')) return 4.2;
  return 4.8;
}

function laneWidthMeters(highway = '') {
  const kind = sourceString(highway).toLowerCase();
  if (/^(motorway|trunk)/.test(kind)) return 3.35;
  if (/^(primary|secondary|tertiary)/.test(kind)) return 3.05;
  return 2.9;
}

function normalizedPlacement(tags, lanes, widthMeters) {
  const raw = sourceString(tags.placement).trim().toLowerCase();
  const match = raw.match(/^(middle_of|left_of|right_of):(\d+)$/);
  if (!match) {
    return Object.freeze({
      raw,
      centerlineOffsetMeters: 0,
      status: raw ? 'explicit-unshifted' : 'absent'
    });
  }
  const lane = Math.max(1, Math.min(lanes, Number(match[2])));
  const nominalLaneWidth = widthMeters / Math.max(1, lanes);
  const laneCoordinate =
    match[1] === 'middle_of' ? lane - 0.5 :
    match[1] === 'left_of' ? lane - 1 :
    lane;
  return Object.freeze({
    raw,
    centerlineOffsetMeters: (lanes * 0.5 - laneCoordinate) * nominalLaneWidth,
    status: 'source:placement'
  });
}

function normalizedCrossSection(tags = {}) {
  const highway = sourceString(tags.highway).toLowerCase();
  const explicitWidth = parseMeters(tags.width);
  const explicitLanes = parseLaneCount(tags.lanes);
  const lanes = explicitLanes ?? defaultLaneCount(highway, tags);
  let widthMeters;
  let widthSource;
  if (Number.isFinite(explicitWidth) && explicitWidth > 0) {
    widthMeters = explicitWidth;
    widthSource = 'source:width';
  } else if (Number.isFinite(explicitLanes)) {
    const linkShoulders = highway.endsWith('_link') ? 1.8 : 0;
    const laneDerivedWidth = lanes * laneWidthMeters(highway) + linkShoulders;
    // A lane count is not a measured edge-to-edge width. Keep the complete
    // road-class cross-section when that is wider, especially on one-lane
    // motorway ramps where barriers otherwise consume the recovery shoulder.
    widthMeters = highway.endsWith('_link')
      ? Math.max(defaultWidthMeters(highway, tags.service), laneDerivedWidth)
      : laneDerivedWidth;
    widthSource = linkShoulders > 0 ? 'derived:lanes+link-shoulders' : 'derived:lanes';
  } else {
    widthMeters = defaultWidthMeters(highway, tags.service);
    widthSource = 'fallback:road-class';
  }
  const boundedWidth = Math.max(2.5, Math.min(24, widthMeters));
  return Object.freeze({
    lanes,
    lanesSource: Number.isFinite(explicitLanes) ? 'source:lanes' : 'fallback:road-class',
    widthMeters: boundedWidth,
    widthSource,
    inferredLanes: !Number.isFinite(explicitLanes),
    inferredWidth: !(Number.isFinite(explicitWidth) && explicitWidth > 0),
    placement: normalizedPlacement(tags, lanes, boundedWidth)
  });
}

function stableSourceIdentity(source = {}, tags = {}) {
  const explicit = source.sourceId || tags._sourceFeatureId;
  if (explicit) return String(explicit);
  const namespace = source.providerNamespace || 'osm';
  const type = source.type || 'way';
  if (source.id == null) throw new TypeError('Transport records require a stable source identity');
  return `${String(namespace)}:${String(type)}:${String(source.id)}`;
}

export function normalizeTransportSource(source = {}, tags = {}) {
  const rawTags = {};
  for (const key of TRANSPORT_RAW_TAG_KEYS) rawTags[key] = sourceString(tags[key]);
  const sourceTags = {};
  for (const key of Object.keys(tags).sort()) {
    if (tags[key] == null) continue;
    sourceTags[String(key)] = String(tags[key]);
  }
  const sourceCompleteness = source.completeness === 'generalized' ||
    tags._sourceCompleteness === 'generalized'
    ? 'generalized'
    : 'lossless';
  const crossSection = normalizedCrossSection(tags);
  const access = normalizedAccess(tags);
  const explicitlyIncomplete = source.incomplete === true || tags._sourceTruncated === 'yes';
  // Attribute generalization is not missing route geometry. Shortbread's
  // complete tile coverage preserves mapped road centerlines and explicit
  // bridge/tunnel/layer fields, so it remains a valid drive surface. Only an
  // actually truncated feature or prohibited access makes the route unsafe.
  const safeForDriving = access.motorVehicle !== 'prohibited' && !explicitlyIncomplete;

  return Object.freeze({
    schemaVersion: TRANSPORT_SOURCE_SCHEMA_VERSION,
    identity: stableSourceIdentity(source, tags),
    providerNamespace: String(source.providerNamespace || 'osm'),
    sourceType: String(source.type || 'way'),
    sourceId: source.id == null ? null : String(source.id),
    completeness: sourceCompleteness,
    sourceTags: Object.freeze(sourceTags),
    rawTags: Object.freeze(rawTags),
    direction: normalizedDirection(tags),
    access,
    crossSection,
    maxHeightMeters: parseMeters(tags.maxheight),
    routeState: explicitlyIncomplete ? 'incomplete' : 'complete',
    safeForDriving,
    provenance: Object.freeze({
      geometry: String(source.geometryProvenance || source.retrieval || 'osm'),
      semantics: sourceCompleteness === 'lossless' ? 'source-tags' : 'generalized-schema'
    })
  });
}

export {
  TRANSPORT_RAW_TAG_KEYS,
  TRANSPORT_SOURCE_SCHEMA_VERSION,
  parseLaneCount,
  parseMeters
};

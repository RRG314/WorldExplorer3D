import { classifyStructureSemantics } from '../structure-semantics/classification.js';
import { createRoadNameResolver } from './streaming-road-labels.js';
import { createWorldTile, deepFreeze } from './world-tile-contract.js';
import { adaptShortbreadTransportTile } from './shortbread-tile-adapter.js';

const DRIVEABLE_HIGHWAYS = new Set([
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
const WALKABLE_HIGHWAYS = new Set([
  'residential',
  'unclassified',
  'living_street',
  'service',
  'pedestrian',
  'footway',
  'path',
  'steps',
  'cycleway'
]);

function normalizedText(value = '') {
  return String(value ?? '').trim().toLowerCase();
}

function parseFirstNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const first = String(value ?? '').trim().toLowerCase().split(/[;,]/)[0]?.trim();
  if (!first) return NaN;
  const number = Number.parseFloat(first);
  return Number.isFinite(number) ? number : NaN;
}

function parseWidthMeters(value) {
  const raw = String(value ?? '').trim().toLowerCase().split(/[;,]/)[0]?.trim() || '';
  const number = parseFirstNumber(value);
  if (!Number.isFinite(number)) return NaN;
  if (/(^|\s)(ft|feet|foot)\b|'/.test(raw)) return number * 0.3048;
  if (/(^|\s)in\b|"/.test(raw)) return number * 0.0254;
  return number;
}

function defaultRoadWidth(highway, service) {
  if (highway.includes('motorway')) return 10.8;
  if (highway.includes('trunk')) return 9.3;
  if (highway.includes('primary')) return 7.9;
  if (highway.includes('secondary')) return 6.9;
  if (highway.includes('tertiary')) return 6.2;
  if (highway.includes('living_street')) return 4.3;
  if (highway.includes('service')) {
    if (service === 'parking_aisle') return 3;
    if (service === 'driveway') return 2.9;
    return 3.8;
  }
  if (highway.includes('residential') || highway.includes('unclassified')) return 5;
  return 4.8;
}

function estimatedLaneWidth(highway, service) {
  if (highway.includes('motorway')) return 3.45;
  if (highway.includes('trunk') || highway.includes('primary')) return 3.2;
  if (highway.includes('secondary') || highway.includes('tertiary')) return 3;
  if (highway.includes('service')) {
    if (service === 'parking_aisle') return 2.45;
    if (service === 'driveway') return 2.55;
    return 2.7;
  }
  if (highway.includes('living_street')) return 2.7;
  return 2.9;
}

function transportClassification(tags) {
  const highway = normalizedText(tags.highway);
  const railway = normalizedText(tags.railway);
  if (railway) return { featureKind: 'railway', subtype: railway };
  if (highway === 'cycleway') return { featureKind: 'cycleway', subtype: highway };
  if (highway === 'path' && normalizedText(tags.bicycle) === 'designated') {
    return { featureKind: 'cycleway', subtype: 'shared_path' };
  }
  if (/^(footway|pedestrian|steps|path|corridor)$/.test(highway)) {
    const footway = normalizedText(tags.footway);
    return {
      featureKind: 'footway',
      subtype: highway === 'footway' && /^(sidewalk|crossing)$/.test(footway) ? footway : highway
    };
  }
  if (DRIVEABLE_HIGHWAYS.has(highway)) return { featureKind: 'road', subtype: highway };
  return null;
}

function transportWidthMeters(classification, tags) {
  const explicit = parseWidthMeters(tags.width);
  if (Number.isFinite(explicit)) {
    const minimum = classification.featureKind === 'road' ? 2.8 : 0.9;
    const maximum = classification.featureKind === 'road' ? 18 : 7.5;
    return Math.max(minimum, Math.min(maximum, explicit));
  }
  if (classification.featureKind === 'railway') return 3.2;
  if (classification.featureKind === 'cycleway') return 3;
  if (classification.featureKind === 'footway') return classification.subtype === 'steps' ? 1.6 : 1.8;

  const highway = normalizedText(tags.highway);
  const service = normalizedText(tags.service);
  const lanes = parseFirstNumber(tags.lanes);
  if (Number.isFinite(lanes)) {
    const laneCount = Math.max(1, Math.round(lanes));
    const shoulder =
      highway.includes('motorway') ? 1 :
      highway.includes('trunk') || highway.includes('primary') ? 0.6 :
      laneCount >= 3 ? 0.45 :
      0.2;
    return Math.max(3, Math.min(18, laneCount * estimatedLaneWidth(highway, service) + shoulder));
  }
  return defaultRoadWidth(highway, service);
}

function defaultSpeedKph(highway) {
  if (highway.includes('motorway')) return 105;
  if (highway.includes('trunk')) return 90;
  if (highway.includes('primary')) return 65;
  if (highway.includes('secondary')) return 55;
  if (highway.includes('tertiary')) return 50;
  if (highway.includes('living_street')) return 20;
  if (highway.includes('service')) return 25;
  return 40;
}

function speedLimitKph(tags, classification) {
  if (classification.featureKind !== 'road') return null;
  const raw = String(tags.maxspeed ?? '').trim().toLowerCase();
  const explicit = parseFirstNumber(raw);
  if (Number.isFinite(explicit)) {
    const kph = /\b(mph|mp\/h)\b/.test(raw) ? explicit * 1.609344 : explicit;
    return Math.max(5, Math.min(140, Math.round(kph)));
  }
  return defaultSpeedKph(normalizedText(tags.highway));
}

function geometryParts(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates || [];
  return [];
}

function localPoints(coordinates, project) {
  const points = [];
  for (const coordinate of coordinates || []) {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const projected = project(lat, lon);
    const x = Number(projected?.x);
    const z = Number(projected?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const point = { x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 };
    const previous = points.at(-1);
    if (!previous || previous.x !== point.x || previous.z !== point.z) points.push(point);
  }
  return points;
}

function pointBounds(points) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, minZ, maxX, maxZ };
}

function normalizeTags(tags = {}) {
  return Object.fromEntries(
    Object.entries(tags)
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value).trim()])
  );
}

function accessContract(tags, classification) {
  const highway = normalizedText(tags.highway);
  const access = normalizedText(tags.access);
  const foot = normalizedText(tags.foot);
  const bicycle = normalizedText(tags.bicycle);
  const denied = /^(no|private)$/.test(access);
  return {
    driveable: classification.featureKind === 'road' && !denied,
    walkable: foot !== 'no' && !denied && WALKABLE_HIGHWAYS.has(highway),
    bicycle: bicycle !== 'no' && !denied && (
      classification.featureKind === 'cycleway' ||
      /^(yes|designated|permissive)$/.test(bicycle)
    ),
    oneway: /^(yes|1|-1|true)$/.test(normalizedText(tags.oneway)),
    reverse: normalizedText(tags.oneway) === '-1'
  };
}

function compileTransportRecords(options = {}) {
  const { address, features, project } = options;
  const resolveName = typeof options.resolveName === 'function' ? options.resolveName : () => '';
  if (!address?.key || typeof project !== 'function' || !Array.isArray(features)) {
    throw new TypeError('Transport compilation requires a tile address, feature array, and projection function.');
  }

  const records = [];
  for (const feature of features) {
    const tags = normalizeTags(feature?.tags);
    const classification = transportClassification(tags);
    if (!classification) continue;
    const parts = geometryParts(feature.geometry);
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const points = localPoints(parts[partIndex], project);
      if (points.length < 2) continue;
      const sourceFeatureId = String(feature.sourceFeatureId || '').trim();
      if (!sourceFeatureId) throw new TypeError('Transport source feature id is required.');
      const structure = classifyStructureSemantics(tags, {
        featureKind: classification.featureKind,
        subtype: classification.subtype
      });
      records.push({
        id: `osm:${address.key}:transport:${sourceFeatureId}:${partIndex}`,
        source: {
          authority: 'openstreetmap',
          adapter: 'shortbread-v1',
          tileKey: address.key,
          featureId: sourceFeatureId,
          partIndex
        },
        featureKind: classification.featureKind,
        subtype: classification.subtype,
        name: String(tags.name || tags.ref || resolveName(points, classification.subtype, feature) || '').trim(),
        tags,
        geometry: {
          type: 'polyline',
          units: 'metres',
          points,
          bounds: pointBounds(points)
        },
        dimensions: {
          widthMeters: transportWidthMeters(classification, tags)
        },
        access: accessContract(tags, classification),
        mobility: {
          speedLimitKph: speedLimitKph(tags, classification)
        },
        surface: normalizedText(tags.surface) || 'unspecified',
        structure
      });
    }
  }
  records.sort((left, right) => left.id.localeCompare(right.id));
  return deepFreeze(records);
}

function compileShortbreadTransportTile(options = {}) {
  const { tileRecord, project, origin, generation = 0, revision = 'live' } = options;
  const address = {
    z: tileRecord?.z,
    x: tileRecord?.x,
    y: tileRecord?.y,
    key: `${tileRecord?.z}/${tileRecord?.x}/${tileRecord?.y}`
  };
  const features = adaptShortbreadTransportTile(tileRecord);
  const resolveName = createRoadNameResolver(tileRecord, (coordinates) => localPoints(coordinates, project));
  const transport = compileTransportRecords({ address, features, project, resolveName });
  return createWorldTile({
    address,
    generation,
    origin,
    source: {
      authority: 'openstreetmap',
      adapter: 'shortbread-v1',
      revision
    },
    records: { transport }
  });
}

export {
  compileShortbreadTransportTile,
  compileTransportRecords,
  parseWidthMeters,
  transportClassification,
  transportWidthMeters
};

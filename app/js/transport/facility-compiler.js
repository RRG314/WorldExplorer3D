const TRANSPORT_FACILITY_SCHEMA_VERSION = 1;

const AVIATION_TYPES = new Set([
  'aerodrome', 'heliport', 'runway', 'taxiway', 'apron', 'terminal',
  'helipad', 'hangar', 'parking_position', 'gate'
]);
const MARITIME_TYPES = new Set([
  'harbour', 'marina', 'port', 'pier', 'quay', 'dock', 'berth',
  'ferry_terminal', 'ferry_route', 'mooring'
]);

function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function facilityClassification(tags = {}) {
  const aeroway = String(tags.aeroway || '').toLowerCase();
  if (AVIATION_TYPES.has(aeroway)) return { domain: 'aviation', type: aeroway };
  if (String(tags.route || '').toLowerCase() === 'ferry') return { domain: 'maritime', type: 'ferry_route' };
  if (String(tags.amenity || '').toLowerCase() === 'ferry_terminal') return { domain: 'maritime', type: 'ferry_terminal' };
  if (String(tags.leisure || '').toLowerCase() === 'marina') return { domain: 'maritime', type: 'marina' };
  if (['port', 'harbour'].includes(String(tags.landuse || '').toLowerCase())) {
    return { domain: 'maritime', type: String(tags.landuse).toLowerCase() };
  }
  if (['pier', 'quay'].includes(String(tags.man_made || '').toLowerCase())) {
    return { domain: 'maritime', type: String(tags.man_made).toLowerCase() };
  }
  if (String(tags.waterway || '').toLowerCase() === 'dock') return { domain: 'maritime', type: 'dock' };
  if (String(tags.harbour || '').toLowerCase() === 'yes') return { domain: 'maritime', type: 'harbour' };
  if (String(tags.mooring || '').toLowerCase() && String(tags.mooring).toLowerCase() !== 'no') {
    return { domain: 'maritime', type: 'mooring' };
  }
  const seamarkType = String(tags['seamark:type'] || '').toLowerCase();
  if (['harbour', 'berth'].includes(seamarkType)) return { domain: 'maritime', type: seamarkType };
  return null;
}

function latLonOf(element = {}) {
  const lat = finite(element.lat ?? element.center?.lat);
  const lon = finite(element.lon ?? element.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function projectLatLon(lat, lon, location, scale) {
  const latitude = finite(lat);
  const longitude = finite(lon);
  if (![latitude, longitude].every(Number.isFinite)) return null;
  const cosLat = Math.max(.01, Math.cos(finite(location?.lat, 0) * Math.PI / 180));
  return Object.freeze({
    x: (longitude - finite(location?.lon, 0)) * scale * cosLat,
    z: -(latitude - finite(location?.lat, 0)) * scale,
    lat: latitude,
    lon: longitude
  });
}

function geometryForElement(element, nodeById, location, scale) {
  const nodes = Array.isArray(element.nodes) ? element.nodes : [];
  const path = nodes.map((id) => nodeById.get(String(id)))
    .map((node) => node ? projectLatLon(node.lat, node.lon, location, scale) : null)
    .filter(Boolean);
  const center = latLonOf(element);
  if (path.length >= 2) {
    const closed = path.length >= 4 && nodes[0] === nodes.at(-1);
    return Object.freeze({ kind: closed ? 'polygon' : 'path', points: Object.freeze(path), complete: path.length === nodes.length });
  }
  const point = center ? projectLatLon(center.lat, center.lon, location, scale) : null;
  return point ? Object.freeze({ kind: 'point', points: Object.freeze([point]), complete: element.type === 'node' }) : null;
}

function compileTransportFacilityGraph(data = {}, options = {}) {
  const location = options.location || { lat: 0, lon: 0 };
  const scale = Math.max(1, finite(options.scale, 100000));
  const elements = Array.isArray(data.elements) ? data.elements : [];
  const nodeById = new Map(elements.filter(({ type }) => type === 'node').map((node) => [String(node.id), node]));
  const records = [];
  for (const element of elements) {
    const classification = facilityClassification(element.tags);
    if (!classification) continue;
    const geometry = geometryForElement(element, nodeById, location, scale);
    if (!geometry) continue;
    const tags = element.tags || {};
    records.push(Object.freeze({
      id: `osm:${element.type}:${element.id}`,
      sourceElementType: String(element.type || ''),
      sourceElementId: String(element.id || ''),
      domain: classification.domain,
      type: classification.type,
      name: String(tags.name || tags.ref || '').trim(),
      geometry,
      mapped: true,
      generatedActivity: false,
      access: tags.access == null ? 'unknown' : String(tags.access),
      surface: tags.surface == null ? 'unknown' : String(tags.surface),
      completeness: geometry.complete ? 'mapped-geometry' : 'mapped-center-only',
      provenance: Object.freeze({
        provider: 'OpenStreetMap',
        license: 'ODbL-1.0',
        attribution: '© OpenStreetMap contributors',
        retrieval: String(data._overpassSource || 'network'),
        endpoint: String(data._overpassEndpoint || '')
      })
    }));
  }
  const byDomain = Object.freeze({
    aviation: Object.freeze(records.filter(({ domain }) => domain === 'aviation')),
    maritime: Object.freeze(records.filter(({ domain }) => domain === 'maritime'))
  });
  const typeCounts = Object.freeze(Object.fromEntries([...new Set(records.map(({ type }) => type))]
    .sort().map((type) => [type, records.filter((record) => record.type === type).length])));
  return Object.freeze({
    type: 'TransportFacilityGraph',
    schemaVersion: TRANSPORT_FACILITY_SCHEMA_VERSION,
    authority: 'compiled-mapped-transport-facilities',
    coverage: Object.freeze({ center: Object.freeze({ lat: finite(location.lat, 0), lon: finite(location.lon, 0) }), bounded: true }),
    records: Object.freeze(records),
    byDomain,
    diagnostics: Object.freeze({ recordCount: records.length, typeCounts })
  });
}

export {
  AVIATION_TYPES,
  MARITIME_TYPES,
  TRANSPORT_FACILITY_SCHEMA_VERSION,
  compileTransportFacilityGraph,
  facilityClassification
};

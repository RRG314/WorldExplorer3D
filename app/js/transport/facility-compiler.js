const TRANSPORT_FACILITY_SCHEMA_VERSION = 1;

const AVIATION_TYPES = new Set([
  'aerodrome', 'heliport', 'runway', 'taxiway', 'apron', 'terminal',
  'helipad', 'hangar', 'parking_position', 'gate', 'control_tower'
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
  if (String(tags.barrier || '').toLowerCase() === 'fence') return { domain: 'site', type: 'fence' };
  if (['gate', 'lift_gate', 'swing_gate', 'sliding_gate', 'kissing_gate', 'entrance'].includes(String(tags.barrier || '').toLowerCase())) return { domain: 'site', type: 'access_gate' };
  return null;
}

// Keep mapped access paths alongside boundaries so their openings survive both
// Overpass and the exact airport fallback. They never become new road surfaces.
function selectFacilitySourceElements(elements = []) {
  const retained = element => facilityClassification(element.tags) || element.tags?.highway;
  const wayIds = new Set(elements.filter(retained).flatMap(element => element.members || []).filter(m=>m.type==='way').map(m=>String(m.ref)));
  const selected=element=>retained(element)||(element.type==='way'&&wayIds.has(String(element.id)));
  const nodeIds = new Set(elements.filter(selected).flatMap(element => element.nodes || []).map(String));
  return elements.filter(element => selected(element) || (element.type === 'node' && nodeIds.has(String(element.id))));
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

function siteRelationGeometry(element, wayById, nodeById, location, scale) {
  const members=(element.members || []).filter(m=>m.type==='way');
  if (!members.length || members.length>2000) return null;
  function rings(role) {
    const ways=members.filter(m=>(m.role || 'outer')===role).map(m=>wayById.get(String(m.ref)));
    if(ways.some(w=>!w?.nodes?.length))return null;
    const unused=new Set(ways),endpoints=new Map(),result=[];
    for(const way of ways)for(const id of [way.nodes[0],way.nodes.at(-1)]){const key=String(id);if(!endpoints.has(key))endpoints.set(key,[]);endpoints.get(key).push(way);}
    while(unused.size) {
      const first=unused.values().next().value;unused.delete(first);const nodes=[...first.nodes];
      while(nodes[0]!==nodes.at(-1)) {
        const next=(endpoints.get(String(nodes.at(-1)))||[]).find(w=>unused.has(w));
        if(!next)return null;unused.delete(next);
        const chain=next.nodes[0]===nodes.at(-1)?next.nodes:[...next.nodes].reverse();nodes.push(...chain.slice(1));
      }
      const geometry=geometryForElement({type:'way',nodes},nodeById,location,scale);
      if(geometry?.kind!=='polygon'||!geometry.complete)return null;
      result.push(geometry.points);
    }
    return result;
  }
  const outer=rings('outer'),holes=rings('inner');if(!outer?.length||!holes)return null;
  const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0));
  outer.sort((a,b)=>area(b)-area(a));
  return Object.freeze({kind:'polygon',complete:true,points:outer[0],outerRings:Object.freeze(outer),holes:Object.freeze(holes)});
}

function compileTransportFacilityGraph(data = {}, options = {}) {
  const location = options.location || { lat: 0, lon: 0 };
  const scale = Math.max(1, finite(options.scale, 100000));
  const elements = Array.isArray(data.elements) ? data.elements : [];
  const nodeById = new Map(elements.filter(({ type }) => type === 'node').map((node) => [String(node.id), node]));
  const wayById = new Map(elements.filter(({type})=>type==='way').map(way=>[String(way.id),way]));
  const records = [];
  for (const element of elements) {
    const classification = facilityClassification(element.tags);
    if (!classification) continue;
    const geometry = (element.type==='relation' && ['aerodrome','heliport','port','harbour','marina'].includes(classification.type)
      ? siteRelationGeometry(element,wayById,nodeById,location,scale) : null) || geometryForElement(element, nodeById, location, scale);
    if (!geometry) continue;
    const tags = element.tags || {};
    const generalizedVector = String(tags._sourceCompleteness || '').toLowerCase() === 'generalized' ||
      String(tags._sourceFeatureId || '').startsWith('shortbread:');
    const exactPhysicalGeometry = !generalizedVector && geometry.complete &&
      ['path', 'polygon'].includes(geometry.kind);
    records.push(Object.freeze({
      id: `osm:${element.type}:${element.id}`,
      sourceElementType: String(element.type || ''),
      sourceElementId: String(element.id || ''),
      domain: classification.domain,
      type: classification.type,
      name: String(tags.name || tags.ref || '').trim(),
      geometry,
      mapped: true,
      geometryAuthority: generalizedVector ? 'generalized-vector' : 'exact-openstreetmap',
      exactPhysicalGeometry,
      generatedActivity: false,
      access: tags.access == null ? 'unknown' : String(tags.access),
      surface: tags.surface == null ? 'unknown' : String(tags.surface),
      attributes: Object.freeze({
        ref: String(tags.ref || '').trim(),
        iata: String(tags.iata || '').trim().toUpperCase(),
        icao: String(tags.icao || '').trim().toUpperCase(),
        width: Number.isFinite(Number(tags.width)) ? Number(tags.width) : null,
        height: Number.isFinite(Number(tags.height)) ? Number(tags.height) : null,
        buildingLevels: Number.isFinite(Number(tags['building:levels'])) ? Number(tags['building:levels']) : null,
        fenceType: String(tags.fence_type || tags['fence:type'] || '').trim().toLowerCase(),
        airportClass: String(tags.aerodrome || tags['aerodrome:type'] || tags.passenger || '').trim().toLowerCase()
      }),
      completeness: generalizedVector
        ? 'generalized-mapped-geometry'
        : geometry.complete ? 'mapped-geometry' : 'mapped-center-only',
      provenance: Object.freeze({
        provider: 'OpenStreetMap',
        license: 'ODbL-1.0',
        attribution: '© OpenStreetMap contributors',
        retrieval: String(data._overpassSource || 'network'),
        endpoint: String(data._overpassEndpoint || '')
      })
    }));
  }
  const accessCorridors = elements.filter(element => element.tags?.highway && !['yes','viaduct'].includes(element.tags.bridge) && element.tags.tunnel !== 'yes').map(element => {
    const geometry = geometryForElement(element, nodeById, location, scale);
    if (!geometry?.complete || geometry.kind === 'point') return null;
    return Object.freeze({ id: `osm:${element.type}:${element.id}`, geometry, width: finite(element.tags.width, ['footway','path','steps','cycleway'].includes(element.tags.highway) ? 3 : 9) });
  }).filter(Boolean);
  const byDomain = Object.freeze({
    aviation: Object.freeze(records.filter(({ domain }) => domain === 'aviation')),
    maritime: Object.freeze(records.filter(({ domain }) => domain === 'maritime')),
    site: Object.freeze(records.filter(({ domain }) => domain === 'site'))
  });
  const typeCounts = Object.freeze(Object.fromEntries([...new Set(records.map(({ type }) => type))]
    .sort().map((type) => [type, records.filter((record) => record.type === type).length])));
  return Object.freeze({
    type: 'TransportFacilityGraph',
    schemaVersion: TRANSPORT_FACILITY_SCHEMA_VERSION,
    authority: 'compiled-mapped-transport-facilities',
    coverage: Object.freeze({ center: Object.freeze({ lat: finite(location.lat, 0), lon: finite(location.lon, 0) }), bounded: true }),
    records: Object.freeze(records),
    accessCorridors: Object.freeze(accessCorridors),
    byDomain,
    diagnostics: Object.freeze({ recordCount: records.length, typeCounts })
  });
}

export {
  AVIATION_TYPES,
  MARITIME_TYPES,
  TRANSPORT_FACILITY_SCHEMA_VERSION,
  compileTransportFacilityGraph,
  facilityClassification,
  selectFacilitySourceElements
};

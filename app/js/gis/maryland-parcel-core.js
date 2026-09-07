const MARYLAND_PARCEL_SOURCE = Object.freeze({
  id: 'maryland-imap-parcels',
  label: 'Maryland Parcel Boundaries',
  operator: 'Maryland Department of Planning / MD iMAP / SDAT',
  itemId: 'b33e5f03d50844b8819a4046ecfe0d97',
  layerUrl: 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0',
  truthType: 'authoritative',
  attribution: 'MD iMAP, MDP, SDAT',
  metadataUrl: 'https://www.arcgis.com/home/item.html?id=b33e5f03d50844b8819a4046ecfe0d97'
});

const MARYLAND_JURISDICTIONS = Object.freeze({
  ALLE: 'Allegany County', ANNE: 'Anne Arundel County', BACI: 'Baltimore City',
  BACO: 'Baltimore County', CALV: 'Calvert County', CARO: 'Caroline County',
  CARR: 'Carroll County', CECI: 'Cecil County', CHAR: 'Charles County',
  DORC: 'Dorchester County', FRED: 'Frederick County', GARR: 'Garrett County',
  HARF: 'Harford County', HOWA: 'Howard County', KENT: 'Kent County',
  MONT: 'Montgomery County', PRIN: "Prince George's County", QUEE: "Queen Anne's County",
  SOME: 'Somerset County', STMA: "St. Mary's County", TALB: 'Talbot County',
  WASH: 'Washington County', WICO: 'Wicomico County', WORC: 'Worcester County'
});

const QUERY_FIELDS = Object.freeze([
  'OBJECTID', 'JURSCODE', 'ADDRESS', 'CITY', 'ZIPCODE', 'LU', 'DESCLU',
  'ACRES', 'POLYACRES', 'POLYID', 'POLYDATE', 'SDATDATE', 'NFMTTLVL',
  'SQFTSTRC', 'YEARBLT', 'BLDG_STORY', 'ZONING', 'PFLW', 'PFUW', 'PFUS'
]);

const MARYLAND_BOUNDS = Object.freeze({ south: 37.86, west: -79.49, north: 39.73, east: -74.98 });
const ACRES_TO_SQUARE_METERS = 4046.8564224;

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clean(value, fallback = '') {
  const result = String(value ?? '').replace(/\s+/g, ' ').trim();
  return result || fallback;
}

function rounded(value, decimals = 7) {
  const scale = 10 ** decimals;
  return Math.round(Number(value) * scale) / scale;
}

function hashText(value = '') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isLikelyMarylandCoordinate(lat, lon) {
  const y = finite(lat);
  const x = finite(lon);
  return y !== null && x !== null && y >= MARYLAND_BOUNDS.south && y <= MARYLAND_BOUNDS.north &&
    x >= MARYLAND_BOUNDS.west && x <= MARYLAND_BOUNDS.east;
}

function closeRing(ring = []) {
  const points = ring
    .map((point) => [finite(point?.[0]), finite(point?.[1])])
    .filter(([lon, lat]) => lon !== null && lat !== null && isLikelyMarylandCoordinate(lat, lon));
  if (points.length < 3) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
  return points.length >= 4 ? points.map(([lon, lat]) => [rounded(lon), rounded(lat)]) : null;
}

function normalizeGeometry(geometry = {}) {
  const polygons = geometry?.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  const normalized = polygons.map((polygon) => (Array.isArray(polygon) ? polygon.map(closeRing).filter(Boolean) : []))
    .filter((polygon) => polygon.length > 0);
  const vertexCount = normalized.reduce((sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0), 0);
  if (!normalized.length || vertexCount > 12000) return null;
  return Object.freeze({ type: 'MultiPolygon', coordinates: normalized, vertexCount });
}

function ringSignedArea(ring = []) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function ringCentroid(ring = []) {
  const signed = ringSignedArea(ring);
  if (Math.abs(signed) < 1e-14) {
    const usable = ring.slice(0, -1);
    if (!usable.length) return null;
    const sums = usable.reduce((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
    return { lon: sums[0] / usable.length, lat: sums[1] / usable.length, weight: 1 };
  }
  let lon = 0;
  let lat = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    lon += (x1 + x2) * cross;
    lat += (y1 + y2) * cross;
  }
  const factor = 1 / (6 * signed);
  return { lon: lon * factor, lat: lat * factor, weight: Math.abs(signed) };
}

function geometryCentroid(geometry) {
  const parts = geometry?.coordinates || [];
  const centroids = parts.map((polygon) => ringCentroid(polygon[0])).filter(Boolean);
  const weight = centroids.reduce((sum, item) => sum + item.weight, 0) || 1;
  return Object.freeze({
    lat: centroids.reduce((sum, item) => sum + item.lat * item.weight, 0) / weight,
    lon: centroids.reduce((sum, item) => sum + item.lon * item.weight, 0) / weight
  });
}

function pointInRing(lon, lat, ring = []) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const xi = ring[current][0]; const yi = ring[current][1];
    const xj = ring[previous][0]; const yj = ring[previous][1];
    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  return (geometry?.coordinates || []).some((polygon) => {
    if (!pointInRing(lon, lat, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
  });
}

function publicAddress(properties = {}) {
  const line1 = clean(properties.ADDRESS);
  const locality = clean(properties.CITY);
  const postalCode = clean(properties.ZIPCODE);
  const region = 'Maryland';
  const formatted = [line1, locality, region, postalCode].filter(Boolean).join(', ');
  return formatted ? Object.freeze({ line1, locality, region, postalCode, country: 'United States', formatted, source: MARYLAND_PARCEL_SOURCE.id }) : null;
}

function normalizeMarylandParcelFeature(feature = {}) {
  const properties = feature?.properties || {};
  const jurisdictionCode = clean(properties.JURSCODE).toUpperCase();
  const sourceParcelId = clean(properties.POLYID);
  const geometry = normalizeGeometry(feature?.geometry);
  if (!MARYLAND_JURISDICTIONS[jurisdictionCode] || !sourceParcelId || !geometry) return null;
  const acres = finite(properties.ACRES, finite(properties.POLYACRES));
  const parcelAreaSqM = acres !== null && acres > 0 ? acres * ACRES_TO_SQUARE_METERS : null;
  const sourceAssessment = finite(properties.NFMTTLVL);
  const centroid = geometryCentroid(geometry);
  const parcelId = `md:${jurisdictionCode.toLowerCase()}:${hashText(sourceParcelId)}`;
  return Object.freeze({
    parcelId,
    worldPropertyId: `parcel:${parcelId}`,
    sourceParcelId,
    sourceAuthority: MARYLAND_PARCEL_SOURCE.id,
    jurisdictionCode,
    jurisdictionName: MARYLAND_JURISDICTIONS[jurisdictionCode],
    address: publicAddress(properties),
    landUseCode: clean(properties.LU),
    landUseDescription: clean(properties.DESCLU),
    zoning: clean(properties.ZONING),
    parcelAreaSqM: parcelAreaSqM === null ? null : Math.round(parcelAreaSqM),
    reportedAcres: acres === null || acres <= 0 ? null : acres,
    sourceAssessment: sourceAssessment !== null && sourceAssessment > 0 ? Math.round(sourceAssessment) : null,
    structureAreaSqFt: Math.max(0, finite(properties.SQFTSTRC, 0)),
    yearBuilt: clean(properties.YEARBLT),
    stories: Math.max(0, finite(properties.BLDG_STORY, 0)),
    waterfront: clean(properties.PFLW),
    publicWater: clean(properties.PFUW),
    publicSewer: clean(properties.PFUS),
    geometryDate: clean(properties.POLYDATE),
    assessmentDate: clean(properties.SDATDATE),
    centroid,
    geometry,
    provenance: Object.freeze({
      sourceId: MARYLAND_PARCEL_SOURCE.id,
      sourceLabel: MARYLAND_PARCEL_SOURCE.label,
      attribution: MARYLAND_PARCEL_SOURCE.attribution,
      truthType: 'authoritative',
      sourceFeatureId: sourceParcelId,
      geometryDate: clean(properties.POLYDATE),
      assessmentDate: clean(properties.SDATDATE)
    })
  });
}

function queryEnvelope(lat, lon, radiusM) {
  const radius = Math.max(80, Math.min(900, finite(radiusM, 450)));
  const latDelta = radius / 111320;
  const lonDelta = radius / (111320 * Math.max(0.2, Math.cos(Number(lat) * Math.PI / 180)));
  return [Number(lon) - lonDelta, Number(lat) - latDelta, Number(lon) + lonDelta, Number(lat) + latDelta]
    .map((value) => rounded(value, 7));
}

function buildMarylandParcelQueryUrl({ lat, lon, radiusM = 450, offset = 0, limit = 250 } = {}) {
  if (!isLikelyMarylandCoordinate(lat, lon)) throw new RangeError('Location is outside the Maryland parcel service extent.');
  const params = new URLSearchParams({
    f: 'geojson',
    where: "POLYID IS NOT NULL AND JURSCODE IS NOT NULL AND (ACCTID IS NULL OR ACCTID <> 'ROW')",
    geometry: queryEnvelope(lat, lon, radiusM).join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: QUERY_FIELDS.join(','), returnGeometry: 'true', returnZ: 'false', returnM: 'false',
    geometryPrecision: '7', maxAllowableOffset: '0.0000015',
    orderByFields: 'OBJECTID ASC', resultOffset: String(Math.max(0, Math.floor(offset))),
    resultRecordCount: String(Math.max(1, Math.min(250, Math.floor(limit))))
  });
  return `${MARYLAND_PARCEL_SOURCE.layerUrl}/query?${params}`;
}

function parcelGameValue(parcel = {}, buildings = []) {
  const parcelArea = Math.max(0, finite(parcel.parcelAreaSqM, 0));
  const structuredFloorArea = buildings.reduce((sum, building) => sum + Math.max(16, finite(building.area, 16)) * Math.max(1, finite(building.levels, 1)), 0);
  const use = `${parcel.landUseCode || ''} ${parcel.landUseDescription || ''}`.toLowerCase();
  const landRate = /agric|farm|resource|forest/.test(use) ? 12 : /commercial|industrial|office|retail/.test(use) ? 180 : /residential|town|condo|apartment/.test(use) ? 105 : 55;
  const structureRate = /commercial|office|retail/.test(use) ? 3200 : /industrial|warehouse/.test(use) ? 1550 : 2350;
  const modelValue = Math.max(25000, parcelArea * landRate + structuredFloorArea * structureRate);
  const assessment = Math.max(0, finite(parcel.sourceAssessment, 0));
  const estimate = assessment >= 1000 ? assessment * 0.82 + modelValue * 0.18 : modelValue;
  const rounding = estimate >= 10000000 ? 100000 : estimate >= 1000000 ? 25000 : 5000;
  return Math.max(25000, Math.min(1500000000, Math.round(estimate / rounding) * rounding));
}

export {
  ACRES_TO_SQUARE_METERS,
  MARYLAND_BOUNDS,
  MARYLAND_JURISDICTIONS,
  MARYLAND_PARCEL_SOURCE,
  QUERY_FIELDS,
  buildMarylandParcelQueryUrl,
  geometryCentroid,
  isLikelyMarylandCoordinate,
  normalizeMarylandParcelFeature,
  parcelGameValue,
  pointInGeometry
};

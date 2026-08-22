function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function facilityType(poi = {}) {
  const type = String(poi.type || '').toLowerCase();
  const category = String(poi.category || '').toLowerCase();
  if (type === 'amenity=police' || type === 'police' || category === 'police') return 'police';
  if (type === 'amenity=hospital' || type === 'hospital' || category === 'healthcare') return 'hospital';
  return '';
}

function nearestMappedFacility(pois = [], origin = {}, requestedType = 'police') {
  const type = String(requestedType || '').toLowerCase();
  const candidates = (Array.isArray(pois) ? pois : []).map((poi) => {
    if (facilityType(poi) !== type || !Number.isFinite(Number(poi.x)) || !Number.isFinite(Number(poi.z))) return null;
    return {
      poi,
      distance: Math.hypot(finite(poi.x) - finite(origin.x), finite(poi.z) - finite(origin.z))
    };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
  const selected = candidates[0];
  if (!selected) return null;
  return Object.freeze({
    type,
    name: String(selected.poi.name || (type === 'police' ? 'Mapped police facility' : 'Mapped hospital')),
    x: finite(selected.poi.x),
    z: finite(selected.poi.z),
    distance: selected.distance,
    sourceFeatureId: String(selected.poi.sourceFeatureId || ''),
    provenance: 'loaded-map-poi'
  });
}

export { facilityType, nearestMappedFacility };

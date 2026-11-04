import { fieldCoordinate, fieldDistance } from './field-study-contract.js';
// Geographic reference for an opt-in authored exhibit, not a real quarry,
// mineral occurrence, property authorization or permission to excavate.
export const MINING_YARD = Object.freeze({
  id: 'quarry-exhibit-01',
  name: 'Quarry training yard · fictional exhibit',
  lat: 39.27,
  lon: -76.5891854,
  radiusMeters: 250,
});
export function validateMiningAdmission(site, admission) {
  if (
    admission?.kind !== 'authored-quarry-training-yard' ||
    admission.yardId !== MINING_YARD.id ||
    admission.siteId !== site.id ||
    !fieldCoordinate(site.location) ||
    fieldDistance(site.location, MINING_YARD) > MINING_YARD.radiusMeters
  )
    throw Error('Use the admitted authored quarry training yard.');
}
export function miningPlaces({ profile, variantId = 'campaign' } = {}) {
  const s = profile?.researchCareers?.mining,
    a = s?.active,
    record = a && a.phase !== 'complete' ? a : s?.records?.[variantId],
    saved = record?.site?.location;
  if (saved && fieldCoordinate(saved))
    return [
      {
        ...saved,
        id: 'saved-mining-yard',
        name: saved.name || record.site.name,
        environment: 'earth',
      },
    ];
  return [
    {
      id: MINING_YARD.id,
      name: MINING_YARD.name,
      lat: MINING_YARD.lat,
      lon: MINING_YARD.lon,
      environment: 'earth',
    },
  ];
}
export function miningSiteDescriptor(place) {
  if (!fieldCoordinate(place) || fieldDistance(place, MINING_YARD) > MINING_YARD.radiusMeters)
    throw Error(
      'Choose the authored quarry exhibit; selected real places do not grant mining access.'
    );
  return {
    id: 'virtual-mining:' + place.lat.toFixed(5) + ',' + place.lon.toFixed(5),
    name: MINING_YARD.name,
    location: place,
  };
}
export function miningYardAdmission(runtime, qualified) {
  if (!Array.isArray(runtime.landuses) || typeof runtime.pointInPolygon !== 'function')
    throw Error('Wait for the mapped land-use checks before opening the quarry exhibit.');
  const locations = Object.values(qualified.points),
    contains = (feature, p) => {
      const points = feature.pts || feature.points;
      return (
        Array.isArray(points) &&
        points.length >= 3 &&
        typeof runtime.pointInPolygon === 'function' &&
        runtime.pointInPolygon(p.x, p.z, points)
      );
    };
  const forbidden =
    /(park|garden|recreation|residential|protected|nature_reserve|cemetery|grave_yard)/i;
  for (const feature of runtime.landuses || []) {
    const tags = [
      feature.type,
      feature.kind,
      feature.tags?.landuse,
      feature.tags?.leisure,
      feature.tags?.boundary,
      feature.tags?.amenity,
    ]
      .filter(Boolean)
      .join(' ');
    if (forbidden.test(tags) && locations.some((p) => contains(feature, p)))
      throw Error('The exhibit cannot occupy a mapped home area, park or protected site.');
  }
  const result = {
    kind: 'authored-quarry-training-yard',
    yardId: MINING_YARD.id,
    siteId: qualified.site.id,
  };
  validateMiningAdmission(qualified.site, result);
  return result;
}

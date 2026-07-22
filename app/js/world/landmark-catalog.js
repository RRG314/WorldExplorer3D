const CURATED_LANDMARKS = [
  {
    id: 'eiffel-tower',
    name: 'Eiffel Tower',
    lat: 48.8582602,
    lon: 2.2944991,
    matchRadiusMeters: 6200,
    builder: 'measured-eiffel-tower',
    preserveMaterials: true,
    modelHeightMeters: 330,
    totalHeightMeters: 330,
    rotation: { x: 0, y: -0.08, z: 0 },
    color: 0x6f5948,
    hideRadiusMeters: 74,
    wikidata: 'Q243'
  },
  {
    id: 'elizabeth-tower',
    name: 'Elizabeth Tower',
    lat: 51.5007292,
    lon: -0.1246254,
    matchRadiusMeters: 4200,
    builder: 'measured-elizabeth-tower',
    preserveMaterials: true,
    modelHeightMeters: 96,
    totalHeightMeters: 96,
    rotation: { x: 0, y: 0.1, z: 0 },
    color: 0xb6a477,
    hideRadiusMeters: 18,
    wikidata: 'Q41225'
  }
];

function distanceMeters(aLat, aLon, bLat, bLon) {
  const latScale = 111320;
  const meanLat = (Number(aLat) + Number(bLat)) * Math.PI / 360;
  const dx = (Number(aLon) - Number(bLon)) * latScale * Math.cos(meanLat);
  const dz = (Number(aLat) - Number(bLat)) * latScale;
  return Math.hypot(dx, dz);
}

export function curatedLandmarksNear(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  return CURATED_LANDMARKS
    .map((landmark) => ({ ...landmark, distanceMeters: distanceMeters(lat, lon, landmark.lat, landmark.lon) }))
    .filter((landmark) => landmark.distanceMeters <= landmark.matchRadiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export { CURATED_LANDMARKS };

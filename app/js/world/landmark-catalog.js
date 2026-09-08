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
  },
  {
    id: 'pyramid-khufu',
    name: 'Great Pyramid of Giza',
    lat: 29.9792345,
    lon: 31.1342019,
    matchRadiusMeters: 5000,
    builder: 'measured-khufu-pyramid',
    preserveMaterials: true,
    modelHeightMeters: 138.5,
    totalHeightMeters: 138.5,
    modelWidthMeters: 230.3,
    modelDepthMeters: 230.3,
    rotation: { x: 0, y: 0.02, z: 0 },
    color: 0xc39b59,
    hideRadiusMeters: 126,
    wikidata: 'Q37200'
  },
  {
    id: 'ten-light-street',
    name: '10 Light Street',
    lat: 39.289194,
    lon: -76.614111,
    matchRadiusMeters: 4200,
    builder: 'measured-ten-light-street',
    preserveMaterials: true,
    modelHeightMeters: 155.2,
    totalHeightMeters: 155.2,
    modelWidthMeters: 48,
    modelDepthMeters: 37,
    rotation: { x: 0, y: 0.035, z: 0 },
    color: 0xb88a68,
    hideRadiusMeters: 38,
    wikidata: 'Q2882640'
  },
  {
    id: 'commerce-place-baltimore',
    name: 'Commerce Place',
    lat: 39.289352,
    lon: -76.610606,
    matchRadiusMeters: 4200,
    builder: 'measured-commerce-place',
    preserveMaterials: true,
    modelHeightMeters: 138.4,
    totalHeightMeters: 138.4,
    modelWidthMeters: 48,
    modelDepthMeters: 36,
    rotation: { x: 0, y: -0.045, z: 0 },
    color: 0xcfc4aa,
    hideRadiusMeters: 48,
    wikidata: null
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

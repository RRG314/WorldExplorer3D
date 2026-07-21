const FEATURED_ARRIVALS = [
  {
    id: 'giza-pyramid-complex',
    match: { lat: 29.9792, lon: 31.1342, radiusMeters: 190 },
    viewpoint: { lat: 29.9792, lon: 31.1238 },
    lookAt: { lat: 29.9792345, lon: 31.1342019 }
  },
  {
    id: 'great-wall-mutianyu',
    match: { lat: 40.4319, lon: 116.5704, radiusMeters: 190 },
    viewpoint: { lat: 40.4334, lon: 116.5736 },
    lookAt: { lat: 40.4338583, lon: 116.5743061 }
  }
];

function distanceMeters(aLat, aLon, bLat, bLon) {
  const latScale = 111320;
  const meanLat = (Number(aLat) + Number(bLat)) * Math.PI / 360;
  const dx = (Number(aLon) - Number(bLon)) * latScale * Math.cos(meanLat);
  const dz = (Number(aLat) - Number(bLat)) * latScale;
  return Math.hypot(dx, dz);
}

export function featuredArrivalNear(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return FEATURED_ARRIVALS.find((arrival) => (
    distanceMeters(lat, lon, arrival.match.lat, arrival.match.lon) <= arrival.match.radiusMeters
  )) || null;
}

export { FEATURED_ARRIVALS };

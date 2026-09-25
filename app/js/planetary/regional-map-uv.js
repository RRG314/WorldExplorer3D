// Body-fixed tangent patch: +x east, -z north, positions and radius in metres.
// Exponential-map projection keeps polar regions finite without flattening the globe.
export function regionalMapUv({ latitudeDeg, longitudeDegPositiveEast, radiusM }, x, z) {
  if (!(radiusM > 0) || ![latitudeDeg, longitudeDegPositiveEast, x, z].every(Number.isFinite)) {
    throw new Error('Regional imagery requires finite body-fixed coordinates and a positive radius');
  }
  const lat = latitudeDeg * Math.PI / 180;
  const lon = longitudeDegPositiveEast * Math.PI / 180;
  const distance = Math.hypot(x, z);
  const angle = distance / radiusM;
  const east = distance ? x / distance : 0;
  const north = distance ? -z / distance : 0;
  const c = Math.cos(angle), s = Math.sin(angle);
  const px = c * Math.cos(lat) * Math.cos(lon) + s * (-east * Math.sin(lon) - north * Math.sin(lat) * Math.cos(lon));
  const py = c * Math.sin(lat) + s * north * Math.cos(lat);
  const pz = c * Math.cos(lat) * Math.sin(lon) + s * (east * Math.cos(lon) - north * Math.sin(lat) * Math.sin(lon));
  const delta = Math.atan2(Math.sin(Math.atan2(pz, px) - lon), Math.cos(Math.atan2(pz, px) - lon));
  return { u: (lon + delta) / (2 * Math.PI), v: 0.5 + Math.asin(Math.max(-1, Math.min(1, py))) / Math.PI };
}

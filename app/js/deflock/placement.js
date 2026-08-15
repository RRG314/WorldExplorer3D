function computeCameraPlacement(feature, authorities = {}) {
  const point = authorities.geoToWorld?.(Number(feature?.lat), Number(feature?.lon));
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return null;
  const groundSample = authorities.terrainAt?.(point.x, point.z);
  const groundY = Number(groundSample?.position?.y);
  const direction = Number(feature?.direction);
  return {
    x: point.x,
    z: point.z,
    groundY: Number.isFinite(groundY) ? groundY : 0,
    bearingDegrees: Number.isFinite(direction) ? ((direction % 360) + 360) % 360 : null,
    bearingRadians: Number.isFinite(direction) ? (((direction % 360) + 360) % 360) * Math.PI / 180 : 0
  };
}

export { computeCameraPlacement };

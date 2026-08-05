const GRAVITATIONAL_CONSTANT = 6.67430e-11;
const METERS_PER_KILOMETER = 1000;

export function surfaceGravityMps2(body) {
  const massKg = Number(body?.massKg);
  const physicalRadiusMeters = Number(body?.physicalRadiusKm) * METERS_PER_KILOMETER;
  if (!(massKg > 0) || !(physicalRadiusMeters > 0)) return 0;
  return GRAVITATIONAL_CONSTANT * massKg / (physicalRadiusMeters * physicalRadiusMeters);
}

export function displayScaledGravityMu(body, accelerationScale = 0.001) {
  const displayRadius = Number(body?.radius);
  const surfaceGravity = surfaceGravityMps2(body);
  if (!(displayRadius > 0) || !(surfaceGravity > 0)) return 0;
  // Celestial radii are enlarged for visibility. Preserve measured surface
  // gravity and inverse-square falloff in multiples of each displayed radius.
  return surfaceGravity * displayRadius * displayRadius * accelerationScale;
}

export function inverseSquareGravityAcceleration(body, distanceScene, accelerationScale = 0.001) {
  const distance = Number(distanceScene);
  if (!(distance > 0)) return 0;
  return displayScaledGravityMu(body, accelerationScale) / (distance * distance);
}

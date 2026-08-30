function pointToSegmentDistance(x, z, start, end) {
  const dx = Number(end?.x) - Number(start?.x);
  const dz = Number(end?.z) - Number(start?.z);
  const lengthSquared = dx * dx + dz * dz;
  if (!(lengthSquared > 0.001)) return Infinity;
  const t = Math.max(0, Math.min(1, (
    (Number(x) - Number(start.x)) * dx + (Number(z) - Number(start.z)) * dz
  ) / lengthSquared));
  return Math.hypot(Number(x) - (Number(start.x) + dx * t), Number(z) - (Number(start.z) + dz * t));
}

function insideInteriorStairOpening(activeInterior, x, z) {
  const connector = activeInterior?.connector;
  if (!connector?.start || !connector?.end) return false;
  return pointToSegmentDistance(x, z, connector.start, connector.end) <=
    Math.max(0.8, Number(connector.rampWidth) * 0.78 || 0.8);
}

function resolveInteriorCeiling(input = {}) {
  const activeInterior = input.activeInterior;
  const eyeY = Number(input.eyeY);
  const verticalVelocity = Number(input.verticalVelocity) || 0;
  if (!activeInterior?.floorPlan || !Number.isFinite(eyeY)) {
    return Object.freeze({ eyeY, verticalVelocity, collided: false, ceilingY: null });
  }
  if (insideInteriorStairOpening(activeInterior, input.x, input.z)) {
    return Object.freeze({ eyeY, verticalVelocity, collided: false, ceilingY: null, opening: 'stairs' });
  }
  const storyHeight = Math.max(2.7, Number(activeInterior.floorPlan.storyHeight) || 3.4);
  const activeLevel = Math.max(0, Math.round(Number(activeInterior.activeLevel) || 0));
  const floorBaseY = Number(activeInterior.floorBaseY) || 0;
  const ceilingY = floorBaseY + activeLevel * storyHeight + storyHeight - 0.12;
  const maximumEyeY = ceilingY - Math.max(0.12, Number(input.headClearance) || 0.18);
  if (eyeY <= maximumEyeY) {
    return Object.freeze({ eyeY, verticalVelocity, collided: false, ceilingY });
  }
  return Object.freeze({
    eyeY: maximumEyeY,
    verticalVelocity: Math.min(0, verticalVelocity),
    collided: true,
    ceilingY
  });
}

export { insideInteriorStairOpening, resolveInteriorCeiling };

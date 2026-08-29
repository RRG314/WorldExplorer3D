function finiteVector(input, label) {
  const vector = {
    x: Number(input?.x),
    y: Number(input?.y),
    z: Number(input?.z)
  };
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.z)) {
    throw new TypeError(`${label} must contain finite coordinates.`);
  }
  return vector;
}

function normalizedOffset(point, center, fallback = { x: 0, y: 1, z: 0 }) {
  const offset = {
    x: point.x - center.x,
    y: point.y - center.y,
    z: point.z - center.z
  };
  const length = Math.hypot(offset.x, offset.y, offset.z);
  if (length > 1e-9) {
    return { x: offset.x / length, y: offset.y / length, z: offset.z / length };
  }
  const fallbackLength = Math.hypot(fallback.x, fallback.y, fallback.z) || 1;
  return {
    x: fallback.x / fallbackLength,
    y: fallback.y / fallbackLength,
    z: fallback.z / fallbackLength
  };
}

function segmentSphereContact(startInput, endInput, centerInput, radiusInput) {
  const start = finiteVector(startInput, 'Segment start');
  const end = finiteVector(endInput, 'Segment end');
  const center = finiteVector(centerInput, 'Sphere center');
  const radius = Number(radiusInput);
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('Sphere radius must be positive.');

  const movement = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const fromCenter = { x: start.x - center.x, y: start.y - center.y, z: start.z - center.z };
  const startDistance = Math.hypot(fromCenter.x, fromCenter.y, fromCenter.z);
  if (startDistance <= radius) {
    return Object.freeze({
      hit: true,
      startedInside: true,
      t: 0,
      normal: Object.freeze(normalizedOffset(start, center, movement))
    });
  }

  const a = movement.x ** 2 + movement.y ** 2 + movement.z ** 2;
  if (a <= 1e-18) return Object.freeze({ hit: false });
  const b = 2 * (
    fromCenter.x * movement.x +
    fromCenter.y * movement.y +
    fromCenter.z * movement.z
  );
  const c = fromCenter.x ** 2 + fromCenter.y ** 2 + fromCenter.z ** 2 - radius ** 2;
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < 0) return Object.freeze({ hit: false });
  const root = Math.sqrt(discriminant);
  const contacts = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((value) => value >= 0 && value <= 1)
    .sort((left, right) => left - right);
  if (contacts.length === 0) return Object.freeze({ hit: false });
  const t = contacts[0];
  const point = {
    x: start.x + movement.x * t,
    y: start.y + movement.y * t,
    z: start.z + movement.z * t
  };
  return Object.freeze({
    hit: true,
    startedInside: false,
    t,
    normal: Object.freeze(normalizedOffset(point, center, movement))
  });
}

function resolveCelestialSceneCollision(startInput, endInput, bodiesInput = [], options = {}) {
  const start = finiteVector(startInput, 'Previous spacecraft position');
  const end = finiteVector(endInput, 'Next spacecraft position');
  const clearance = Math.max(0, Number(options.clearance) || 0);
  let earliest = null;

  for (const candidate of bodiesInput || []) {
    const radius = Number(candidate?.radius);
    if (!candidate?.position || !Number.isFinite(radius) || radius <= 0) continue;
    const center = finiteVector(candidate.position, 'Celestial body position');
    const expandedRadius = radius + clearance;
    const contact = segmentSphereContact(start, end, center, expandedRadius);
    if (contact.startedInside && options.allowOutwardEscape === true) {
      const startDistance = Math.hypot(start.x - center.x, start.y - center.y, start.z - center.z);
      const endDistance = Math.hypot(end.x - center.x, end.y - center.y, end.z - center.z);
      if (endDistance > startDistance + 1e-6) continue;
    }
    if (!contact.hit || (earliest && contact.t >= earliest.contact.t)) continue;
    earliest = { body: candidate, center, expandedRadius, contact };
  }

  if (!earliest) return Object.freeze({ collided: false, position: Object.freeze(end) });
  const padding = Math.max(0.001, Number(options.padding) || 0.02);
  const correctedRadius = earliest.expandedRadius + padding;
  const position = Object.freeze({
    x: earliest.center.x + earliest.contact.normal.x * correctedRadius,
    y: earliest.center.y + earliest.contact.normal.y * correctedRadius,
    z: earliest.center.z + earliest.contact.normal.z * correctedRadius
  });
  return Object.freeze({
    collided: true,
    position,
    bodyId: earliest.body.bodyId || null,
    bodyName: String(earliest.body.name || earliest.body.bodyId || 'celestial body'),
    contactT: earliest.contact.t,
    startedInside: earliest.contact.startedInside,
    normal: earliest.contact.normal
  });
}

export {
  resolveCelestialSceneCollision,
  segmentSphereContact
};

import { vehicleWheelContactLayout } from './vehicle-catalog.js?v=6';

// Sampling metadata is immutable; each solve keeps its own height buffer so a
// surface callback can safely invoke another contact solve.
const WHEEL_CONTACTS = Object.freeze([
  Object.freeze({front: -1, side: -1}), Object.freeze({front: -1, side: 1}),
  Object.freeze({front: 1, side: -1}), Object.freeze({front: 1, side: 1})
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function directedSurfacePitch(p1 = {}, p2 = {}, maximumPitch = 0.55) {
  const dx = finiteNumber(p2.x) - finiteNumber(p1.x);
  const dz = finiteNumber(p2.z) - finiteNumber(p1.z);
  const run = Math.hypot(dx, dz);
  if (!(run > 1e-6)) return 0;
  const rise = finiteNumber(p2.y) - finiteNumber(p1.y);
  const limit = Math.max(0, finiteNumber(maximumPitch, 0.55));
  return Math.max(-limit, Math.min(limit, -Math.atan2(rise, run)));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Resolve the ground-contact plane from the same four wheel locations used by
// vehicle presentation. The final published road surface remains authoritative;
// endpoint pitch is only a fail-safe when that surface cannot be sampled.
function resolveVehicleRoadContactPose(options = {}) {
  const x = finiteNumber(options.x);
  const y = finiteNumber(options.y);
  const z = finiteNumber(options.z);
  const yaw = finiteNumber(options.yaw);
  const fallbackPitch = finiteNumber(options.pitch);
  const fallbackRoll = finiteNumber(options.roll);
  const sampleSurface = typeof options.sampleSurface === 'function' ? options.sampleSurface : null;
  const layout = vehicleWheelContactLayout(options.variant);
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  // Wheel positions change in X/Z when the chassis pitches and rolls. Sampling
  // the unrotated footprint then rotating only Y made long vehicles float on
  // grades even when the published road was a perfectly planar surface.
  const heights = new Float64Array(4);
  const footprint = (pitch, roll) => {
    let valid = true;
    for (let index = 0; index < 4; index += 1) {
      const contact = WHEEL_CONTACTS[index];
      const {front, side} = contact;
      const localX = side * layout.halfTrack;
      const localZ = front * layout.halfWheelbase;
      const lateral = Math.cos(roll) * localX;
      const longitudinal = Math.sin(pitch) * Math.sin(roll) * localX + Math.cos(pitch) * localZ;
      const contactX = x + rightX * lateral + forwardX * longitudinal;
      const contactZ = z + rightZ * lateral + forwardZ * longitudinal;
      const sample = sampleSurface?.(contactX, contactZ, contact);
      heights[index] = sample == null ? NaN : Number(sample);
      if (!Number.isFinite(heights[index])) valid = false;
    }
    return valid;
  };
  const fallback = () => Object.freeze({
    x, y, z, yaw, pitch: fallbackPitch, roll: fallbackRoll,
    sampledWheelContacts: 0, maximumWheelPenetration: 0, maximumWheelGap: 0,
    previousMaximumWheelPenetration: 0, authority: 'edge-plane-fallback'
  });
  const poseDelta = (pitch, roll, contact) =>
    Math.cos(pitch) * Math.sin(roll) * contact.side * layout.halfTrack -
    Math.sin(pitch) * contact.front * layout.halfWheelbase;
  let pitch = clamp(fallbackPitch, -.55, .55);
  let roll = clamp(fallbackRoll, -.55, .55);
  if (!footprint(pitch, roll) || !sampleSurface) return fallback();
  let previousMaximumWheelPenetration = 0;
  for (let index = 0; index < 4; index += 1) {
    previousMaximumWheelPenetration = Math.max(previousMaximumWheelPenetration,
      heights[index] - (y + poseDelta(fallbackPitch, fallbackRoll, WHEEL_CONTACTS[index])));
  }
  for (let iteration = 0; iteration < 3; iteration += 1) {
    // footprint order is rear-left, rear-right, front-left, front-right.
    // Avoid allocating four filtered arrays for every contact iteration.
    const rearHeight = (heights[0] + heights[1]) * .5;
    const frontHeight = (heights[2] + heights[3]) * .5;
    const leftHeight = (heights[0] + heights[2]) * .5;
    const rightHeight = (heights[1] + heights[3]) * .5;
    const forwardSlope = (frontHeight - rearHeight) /
      (2 * layout.halfWheelbase * Math.cos(pitch));
    const rightSlope = ((rightHeight - leftHeight) / (2 * layout.halfTrack) -
      forwardSlope * Math.sin(pitch) * Math.sin(roll)) / Math.cos(roll);
    const nextPitch = clamp(-Math.atan(forwardSlope), -.55, .55);
    const nextRoll = clamp(Math.atan(rightSlope * Math.cos(nextPitch)), -.55, .55);
    if (Math.abs(nextPitch - pitch) + Math.abs(nextRoll - roll) < 1e-7) break;
    pitch = nextPitch;
    roll = nextRoll;
    if (!footprint(pitch, roll)) return fallback();
  }
  // A rigid chassis cannot fit an arbitrarily twisted surface. Preserve actual
  // residuals and lift only to prevent penetration; never clamp reported gaps.
  let resolvedY = -Infinity;
  for (let index = 0; index < 4; index += 1) {
    resolvedY = Math.max(resolvedY, heights[index] - poseDelta(pitch, roll, WHEEL_CONTACTS[index]));
  }
  let maximumWheelPenetration = 0, maximumWheelGap = 0;
  for (let index = 0; index < 4; index += 1) {
    const gap = resolvedY + poseDelta(pitch, roll, WHEEL_CONTACTS[index]) - heights[index];
    maximumWheelPenetration = Math.max(maximumWheelPenetration, -gap);
    maximumWheelGap = Math.max(maximumWheelGap, gap);
  }
  // Detailed coordinates are only published for a real contact anomaly.
  const contactAnomaly = maximumWheelGap > .22 ? WHEEL_CONTACTS.map((contact, index) => {
    const localX = contact.side * layout.halfTrack;
    const localZ = contact.front * layout.halfWheelbase;
    const lateral = Math.cos(roll) * localX;
    const longitudinal = Math.sin(pitch) * Math.sin(roll) * localX + Math.cos(pitch) * localZ;
    return {...contact, x: x + rightX * lateral + forwardX * longitudinal,
      z: z + rightZ * lateral + forwardZ * longitudinal, y: heights[index],
      gap: resolvedY + poseDelta(pitch, roll, contact) - heights[index]};
  }) : null;

  return Object.freeze({
    x, y: resolvedY, z, yaw, pitch, roll,
    sampledWheelContacts: 4,
    maximumWheelPenetration,
    maximumWheelGap,
    previousMaximumWheelPenetration,
    contactAnomaly,
    authority: 'published-road-four-wheel-contact'
  });
}

export { directedSurfacePitch, resolveVehicleRoadContactPose };

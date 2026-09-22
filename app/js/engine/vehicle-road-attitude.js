import { vehicleWheelContactLayout } from './vehicle-catalog.js?v=6';

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
  const footprint = (pitch, roll) => {
    const contacts = [];
    for (const front of [-1, 1]) for (const side of [-1, 1]) {
      const localX = side * layout.halfTrack;
      const localZ = front * layout.halfWheelbase;
      const lateral = Math.cos(roll) * localX;
      const longitudinal = Math.sin(pitch) * Math.sin(roll) * localX + Math.cos(pitch) * localZ;
      const contactX = x + rightX * lateral + forwardX * longitudinal;
      const contactZ = z + rightZ * lateral + forwardZ * longitudinal;
      const sample = sampleSurface?.(contactX, contactZ, { front, side });
      contacts.push({ front, side, x: contactX, z: contactZ, y: sample == null ? NaN : Number(sample) });
    }
    return contacts;
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
  let contacts = footprint(pitch, roll);
  if (!sampleSurface || contacts.some(contact => !Number.isFinite(contact.y))) return fallback();
  const previousMaximumWheelPenetration = Math.max(0, ...contacts.map(contact =>
    contact.y - (y + poseDelta(fallbackPitch, fallbackRoll, contact))));
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const average = (axis, sign) => contacts.filter(contact => contact[axis] === sign)
      .reduce((sum, contact) => sum + contact.y, 0) * .5;
    const forwardSlope = (average('front', 1) - average('front', -1)) /
      (2 * layout.halfWheelbase * Math.cos(pitch));
    const rightSlope = ((average('side', 1) - average('side', -1)) / (2 * layout.halfTrack) -
      forwardSlope * Math.sin(pitch) * Math.sin(roll)) / Math.cos(roll);
    const nextPitch = clamp(-Math.atan(forwardSlope), -.55, .55);
    const nextRoll = clamp(Math.atan(rightSlope * Math.cos(nextPitch)), -.55, .55);
    if (Math.abs(nextPitch - pitch) + Math.abs(nextRoll - roll) < 1e-7) break;
    pitch = nextPitch;
    roll = nextRoll;
    contacts = footprint(pitch, roll);
    if (contacts.some(contact => !Number.isFinite(contact.y))) return fallback();
  }
  // A rigid chassis cannot fit an arbitrarily twisted surface. Preserve actual
  // residuals and lift only to prevent penetration; never clamp reported gaps.
  const resolvedY = Math.max(...contacts.map(contact => contact.y - poseDelta(pitch, roll, contact)));
  const gaps = contacts.map(contact => resolvedY + poseDelta(pitch, roll, contact) - contact.y);

  return Object.freeze({
    x, y: resolvedY, z, yaw, pitch, roll,
    sampledWheelContacts: contacts.length,
    maximumWheelPenetration: Math.max(0, ...gaps.map((gap) => -gap)),
    maximumWheelGap: Math.max(0, ...gaps),
    previousMaximumWheelPenetration,
    contactAnomaly: Math.max(0, ...gaps) > .22 ? contacts.map((contact, index) => ({ ...contact, gap: gaps[index] })) : null,
    authority: 'published-road-four-wheel-contact'
  });
}

export { directedSurfacePitch, resolveVehicleRoadContactPose };

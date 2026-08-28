import { vehicleWheelContactLayout } from './vehicle-catalog.js?v=5';

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
  const contacts = [];

  for (const front of [-1, 1]) {
    for (const side of [-1, 1]) {
      const contactX = x + forwardX * front * layout.halfWheelbase + rightX * side * layout.halfTrack;
      const contactZ = z + forwardZ * front * layout.halfWheelbase + rightZ * side * layout.halfTrack;
      const surfaceY = Number(sampleSurface?.(contactX, contactZ, { front, side }));
      contacts.push({ front, side, x: contactX, z: contactZ, y: surfaceY });
    }
  }

  if (!sampleSurface || contacts.some((contact) => !Number.isFinite(contact.y))) {
    return Object.freeze({
      x, y, z, yaw,
      pitch: fallbackPitch,
      roll: fallbackRoll,
      sampledWheelContacts: 0,
      maximumWheelPenetration: 0,
      maximumWheelGap: 0,
      previousMaximumWheelPenetration: 0,
      authority: 'edge-plane-fallback'
    });
  }

  const frontAverage = contacts.filter((contact) => contact.front > 0)
    .reduce((sum, contact) => sum + contact.y, 0) * 0.5;
  const rearAverage = contacts.filter((contact) => contact.front < 0)
    .reduce((sum, contact) => sum + contact.y, 0) * 0.5;
  const rightAverage = contacts.filter((contact) => contact.side > 0)
    .reduce((sum, contact) => sum + contact.y, 0) * 0.5;
  const leftAverage = contacts.filter((contact) => contact.side < 0)
    .reduce((sum, contact) => sum + contact.y, 0) * 0.5;
  const track = layout.halfTrack * 2;
  const pitch = directedSurfacePitch(
    { x: 0, y: rearAverage, z: -layout.halfWheelbase },
    { x: 0, y: frontAverage, z: layout.halfWheelbase }
  );
  const rollDenominator = Math.max(1e-6, track * Math.cos(pitch));
  const roll = Math.asin(clamp((rightAverage - leftAverage) / rollDenominator, -0.5227, 0.5227));
  const averageY = contacts.reduce((sum, contact) => sum + contact.y, 0) / contacts.length;
  const poseDelta = (posePitch, poseRoll, contact) =>
    Math.cos(posePitch) * Math.sin(poseRoll) * contact.side * layout.halfTrack -
    Math.sin(posePitch) * contact.front * layout.halfWheelbase;
  const previousMaximumWheelPenetration = Math.max(0, ...contacts.map((contact) =>
    contact.y - (y + poseDelta(fallbackPitch, fallbackRoll, contact))
  ));
  const predictedDelta = (contact) =>
    poseDelta(pitch, roll, contact);
  const baseY = averageY - contacts.reduce((sum, contact) => sum + predictedDelta(contact), 0) / contacts.length;
  // A mildly twisted/crowned surface cannot be represented by one rigid plane.
  // Lift only enough to keep every visible wheel at or above its road contact;
  // the remaining positive clearance is suspension travel, never penetration.
  const lift = Math.max(0, ...contacts.map((contact) => contact.y - (baseY + predictedDelta(contact))));
  const resolvedY = baseY + lift;
  const gaps = contacts.map((contact) => resolvedY + predictedDelta(contact) - contact.y);

  return Object.freeze({
    x, y: resolvedY, z, yaw, pitch, roll,
    sampledWheelContacts: contacts.length,
    maximumWheelPenetration: Math.max(0, ...gaps.map((gap) => -gap)),
    maximumWheelGap: Math.max(0, ...gaps),
    previousMaximumWheelPenetration,
    authority: 'published-road-four-wheel-contact'
  });
}

export { directedSurfacePitch, resolveVehicleRoadContactPose };

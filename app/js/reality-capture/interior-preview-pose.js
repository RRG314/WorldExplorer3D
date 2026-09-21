import {roomInteriorPoint} from '../../../functions/interior-layout.mjs';

// Face into the room's longest clear view instead of opening on a nearby wall.
// Stop each ray at its first wall so concave rooms cannot aim through a recess.
export function interiorPreviewPose(ring, elevation = 0, height = 2.7) {
  const center = roomInteriorPoint(ring);
  if (!center) return null;
  let longest = 0, direction = {x: 0, y: -.2, z: -1};
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (const target of [a, {x: (a.x + b.x) / 2, z: (a.z + b.z) / 2}]) {
      const length = Math.hypot(target.x - center.x, target.z - center.z);
      if (length < 1e-8) continue;
      const dx = (target.x - center.x) / length, dz = (target.z - center.z) / length;
      let clearance = Infinity;
      for (let j = 0; j < ring.length; j++) {
        const u = ring[j], v = ring[(j + 1) % ring.length];
        const ex = v.x - u.x, ez = v.z - u.z, denominator = dx * ez - dz * ex;
        if (Math.abs(denominator) < 1e-10) continue;
        const ox = u.x - center.x, oz = u.z - center.z;
        const distance = (ox * ez - oz * ex) / denominator;
        const along = (ox * dz - oz * dx) / denominator;
        if (distance > 1e-8 && along >= -1e-9 && along <= 1 + 1e-9) clearance = Math.min(clearance, distance);
      }
      if (Number.isFinite(clearance) && clearance > longest) {
        longest = clearance;
        direction = {x: dx, y: -.2, z: dz};
      }
    }
  }
  return {position: {x: center.x, y: elevation + Math.min(1.6, height * .65), z: center.z}, direction};
}

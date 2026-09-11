function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sampleSweptContact(from = {}, to = {}, spacing = .5, query = () => null) {
  const start = {
    x: finite(from.x),
    y: finite(from.y),
    z: finite(from.z)
  };
  const end = {
    x: finite(to.x),
    y: finite(to.y, start.y),
    z: finite(to.z)
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!(distance > 1e-6)) return null;
  const sampleSpacing = Math.max(.01, finite(spacing, .5));
  const steps = Math.max(1, Math.ceil(distance / sampleSpacing));
  let lastSafe = start;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const position = {
      x: start.x + dx * t,
      y: start.y + dy * t,
      z: start.z + dz * t
    };
    const contact = query(position, t);
    if (contact) return Object.freeze({ contact, position: Object.freeze(position), lastSafe: Object.freeze(lastSafe), t });
    lastSafe = position;
  }
  return null;
}

export { sampleSweptContact };

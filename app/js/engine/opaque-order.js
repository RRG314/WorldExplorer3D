// Populate depth with nearby opaque surfaces before shading surfaces behind
// them. Authored layers (roads, markings, sky) retain their explicit order.
// Transparent objects continue using Three's separate back-to-front sort.
export function opaqueFrontToBack(a, b) {
  // Array.sort only needs the sign. Returning a fractional depth boxes a
  // temporary Number at the native sort callback boundary on current V8.
  // Preserve explicit layers, NaN/tie fallback and the exact depth ordering.
  const depth = a.z - b.z;
  return a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder ||
    (depth ? depth < 0 ? -1 : 1 : 0) || a.material.id - b.material.id || a.id - b.id;
}

// Populate depth with nearby opaque surfaces before shading surfaces behind
// them. Authored layers (roads, markings, sky) retain their explicit order.
// Transparent objects continue using Three's separate back-to-front sort.
export function opaqueFrontToBack(a, b) {
  return a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder ||
    a.z - b.z || a.material.id - b.material.id || a.id - b.id;
}

// Scene lighting produces linear values. Every screen renderer must encode
// those values once for the display. Keep tone mapping/exposure with the scene
// owner; the r128 composer has its own final encoding pass for render targets.
export function applyDisplayColorPolicy(renderer, THREE) {
  if (!renderer || !THREE) return false;
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace !== undefined) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if (THREE.sRGBEncoding !== undefined) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  } else {
    return false;
  }
  return true;
}

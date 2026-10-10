// Three r128 has parent.remove(child), but not Object3D.removeFromParent().
// Optional-calling the latter silently retained disposed objects in the scene.
// Prefer the API shared by our bundled renderer and auxiliary newer renderers.
export function detachSceneObject(object) {
  if (!object) return false;
  if (object.parent?.remove) {object.parent.remove(object);return true;}
  if (typeof object.removeFromParent==='function') {object.removeFromParent();return true;}
  return false;
}

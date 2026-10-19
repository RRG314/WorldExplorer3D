// A publication owns these exact GPU objects and its contact entry. Releasing
// an obsolete publication must not depend on which world is current now.
export function createRoadRegionLease(meshes, contact, key) {
  let owned = meshes.slice();
  return Object.freeze({
    dispose() {
      if (!owned) return false;
      const retired = owned;
      owned = null;
      contact.remove(key);
      for (const mesh of retired) {
        mesh.parent?.remove(mesh);
        mesh.geometry?.dispose();
      }
      // Road/marking materials belong to the world material pool, not this cell.
      return true;
    }
  });
}

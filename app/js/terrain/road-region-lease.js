// A publication owns these exact GPU objects and its contact entry. Releasing
// an obsolete publication must not depend on which world is current now.
export function createRoadRegionLease(meshes, contact, key, publication = {}) {
  let owned = meshes.slice();
  const lease = Object.freeze({
    dispose() {
      if (!owned) return false;
      const retired = owned;
      owned = null;
      contact.remove(key);
      for (const mesh of retired) {
        mesh.parent?.remove(mesh);
        mesh.geometry?.dispose();
      }
      publication.onRetire?.();
      // Road/marking materials belong to the world material pool, not this cell.
      return true;
    }
  });
  return publication.store ? publication.store.ownRegion({ key: `transport:${key}`,
    layers: ['transport', 'contact'], bounds: publication.bounds, facts: publication.facts,
    expectedRequestId: publication.requestId, retire: () => lease.dispose() }) : lease;
}

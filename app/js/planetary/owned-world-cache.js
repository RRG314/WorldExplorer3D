// Only for worlds whose terrain/detail meshes and textures are created by
// solid-world-runtime. Never use this disposer for shared curated asset clones.
export function disposeOwnedPlanetaryWorld(world) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const root of [world.surface, ...(world.objects || [])]) {
    root?.parent?.remove(root);
    root?.traverse?.(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
      // InstancedMesh owns GPU instance buffers in addition to its geometry.
      if (object.isInstancedMesh) object.dispose?.();
    });
  }
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  for (const texture of textures) texture.dispose?.();
}

export function createOwnedPlanetaryWorldCache({ capacity = 2, releasePublication = () => {} } = {}) {
  const entries = new Map();
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('World cache capacity must be positive');
  return Object.freeze({
    get(id) {
      const world = entries.get(id);
      if (world) { entries.delete(id); entries.set(id, world); }
      return world;
    },
    set(id, world) {
      if (entries.has(id) && entries.get(id) !== world) throw new Error('Dispose a world before replacing it');
      entries.delete(id); entries.set(id, world);
      while (entries.size > capacity) {
        const [oldId, oldWorld] = entries.entries().next().value;
        releasePublication(oldWorld.pack.manifest.regionId);
        entries.delete(oldId);
        disposeOwnedPlanetaryWorld(oldWorld);
      }
      return world;
    },
    snapshot: () => ({ capacity, size: entries.size, bodyIds: [...entries.keys()],
      attachedBodyIds: [...entries].filter(([, world]) =>
        [world.surface, ...(world.objects || [])].some(root => root?.parent)
      ).map(([id]) => id)
    })
  });
}

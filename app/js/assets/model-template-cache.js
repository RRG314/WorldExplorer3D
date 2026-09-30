// Templates share textures with every live instance. Only idle templates may
// be evicted; a pending acquisition is a lease even before decoding completes.
export function modelTemplateResources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), buffers = new Set();
  root?.traverse?.(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  let bytes = 0;
  for (const geometry of geometries) {
    for (const attribute of [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes || {}).flat(), geometry.index].filter(Boolean)) {
      const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
      if (array && !buffers.has(array.buffer)) { buffers.add(array.buffer); bytes += array.buffer.byteLength; }
    }
  }
  for (const texture of textures) {
    if (texture.isCompressedTexture) bytes += (texture.mipmaps || []).reduce((sum, mip) => sum + (mip.data?.byteLength || 0), 0);
    else {
      const image = texture.image;
      const width = Number(image?.width || image?.naturalWidth || 0);
      const height = Number(image?.height || image?.naturalHeight || 0);
      bytes += width * height * 4 * (texture.generateMipmaps === false ? 1 : 4 / 3);
    }
  }
  return {bytes:Math.ceil(bytes), geometries, materials, textures};
}

export function createModelTemplateCache({idleByteLimit = 64 * 1024 * 1024} = {}) {
  const entries = new Map();
  let clock = 0;
  function trim() {
    const idle = [...entries.values()].filter(entry => entry.value && entry.leases === 0).sort((a,b) => a.used - b.used);
    let bytes = idle.reduce((sum, entry) => sum + entry.resources.bytes, 0);
    for (const entry of idle) {
      if (bytes <= idleByteLimit) break;
      entries.delete(entry.id);
      bytes -= entry.resources.bytes;
      entry.resources.geometries.forEach(resource => resource.dispose());
      entry.resources.materials.forEach(resource => resource.dispose());
      entry.resources.textures.forEach(resource => resource.dispose());
    }
  }
  return Object.freeze({
    async acquire(id, load) {
      let entry = entries.get(id);
      if (!entry) {
        entry = {id, leases:0, used:++clock, value:null, resources:null};
        entries.set(id, entry);
        entry.promise = Promise.resolve().then(load).then(value => {
          entry.value = value;
          entry.resources = modelTemplateResources(value.root);
          return value;
        }).catch(error => {
          if (entries.get(id) === entry) entries.delete(id);
          throw error;
        });
      }
      const makeLease = () => {
        entry.leases++;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          entry.leases--;
          entry.used = ++clock;
          trim();
        };
        return {release, retain() {
          if (released) throw new Error('Cannot retain a released model template');
          return makeLease();
        }};
      };
      const lease = makeLease();
      try { return {value:await entry.promise, ...lease}; }
      catch (error) { lease.release(); throw error; }
    },
    snapshot() {
      return {idleByteLimit, entries:[...entries.values()].map(entry => ({
        id:entry.id, leases:entry.leases, ready:!!entry.value, estimatedResourceBytes:entry.resources?.bytes || 0
      }))};
    }
  });
}

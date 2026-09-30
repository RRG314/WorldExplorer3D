// Moving emitters do not add/remove scene lights. Three specializes every lit
// material by light count, so spawning a response must only change uniforms.
export function createServiceLightPool(THREE, parent, capacity = 4) {
  const emitters = new Set();
  const slots = Array.from({length: capacity}, (_, index) => {
    const light = new THREE.PointLight(0xffffff, 0, 7, 2);
    light.name = `Vehicle service light ${index + 1}`;
    light.castShadow = false;
    parent.add(light);
    return light;
  });
  const position = new THREE.Vector3();
  let disposed = false;
  return {
    createEmitter(color) {
      const emitter = new THREE.Object3D();
      emitter.color = new THREE.Color(color);
      emitter.intensity = 0;
      emitters.add(emitter);
      return emitter;
    },
    release(emitter) { emitters.delete(emitter); },
    update(focus) {
      if (disposed) return;
      const candidates = [];
      for (const emitter of emitters) {
        if (!(emitter.intensity > 0) || !emitter.parent) continue;
        let visible = true;
        for (let object = emitter; object; object = object.parent) {
          if (!object.visible) { visible = false; break; }
        }
        if (!visible) continue;
        emitter.getWorldPosition(position);
        const distance = focus ? position.distanceToSquared(focus) : 0;
        candidates.push({emitter, distance, position: position.clone()});
      }
      candidates.sort((a, b) => a.distance - b.distance);
      for (let index = 0; index < slots.length; index++) {
        const light = slots[index], source = candidates[index];
        light.intensity = source?.emitter.intensity || 0;
        if (!source) continue;
        light.color.copy(source.emitter.color);
        light.position.copy(source.position);
        parent.worldToLocal(light.position);
      }
    },
    dispose() {
      disposed = true;
      emitters.clear();
      for (const light of slots) { light.parent?.remove(light); light.dispose?.(); }
    }
  };
}

import { createFieldCourseScene } from './field-course-scene.js';
import { createFieldOpacitySampler } from './field-opacity-sampler.js';
import { cartographyTarget } from './cartography-career.js';
export async function createCartographyPresentation(runtime, qualified, study, options = {}) {
  const scene = createFieldCourseScene(runtime, qualified, 'cartography', options),
    { T, u, root, resource, material, mesh, at, label } = scene,
    opacity = createFieldOpacitySampler(),
    markers = {},
    rings = {};
  let disposed = false;
  try {
    const gold = material(0xf1cf78, { emissive: 0x30230b }),
      teal = material(0x48c5bc),
      dark = material(0x183c3b);
    for (const [key, text] of Object.entries({ origin: 'O', a: 'A', b: 'B', entry: 'E' })) {
      const group = at(key),
        ring = mesh(group, new T.RingGeometry(0.64 / u, 0.72 / u, 40), teal, 0, 0.03, 0);
      ring.rotation.x = -Math.PI / 2;
      rings[key] = ring;
      // Virtual survey annotations do not add obstacles to an existing street.
      const rod = mesh(
          group,
          new T.CylinderGeometry(0.025 / u, 0.025 / u, 1.45 / u, 8),
          dark,
          0,
          0.75,
          0
        ),
        ball = mesh(group, new T.SphereGeometry(0.09 / u, 12, 8), gold, 0, 1.5, 0);
      rod.name = 'Virtual survey annotation ' + text;
      ball.name = 'Survey control ' + text;
      markers[key] = ball;
      label(group, text, 0, 1.82, 0, 0.44, 0.44);
    }
    scene.attach();
    root.updateMatrixWorld(true);
    function controls(a) {
      runtime.scene.updateMatrixWorld(true);
      const origin = markers.origin.getWorldPosition(new T.Vector3()),
        ray = new T.Raycaster(),
        objects = [];
      runtime.scene.traverseVisible((o) => {
        if (o.isMesh) {
          for (let p = o; p; p = p.parent)
            if (p === root || p === runtime.Walk?.state?.characterMesh) return;
          objects.push(o);
        }
      });
      return {
        siteId: a.site.id,
        runId: a.runId,
        at: Date.now(),
        sights: ['a', 'b'].map((id) => {
          const target = markers[id].getWorldPosition(new T.Vector3()),
            delta = target.clone().sub(origin);
          ray.set(origin, delta.clone().normalize());
          ray.near = 0.12 / u;
          ray.far = delta.length() - 0.12 / u;
          const blocked = ray.intersectObjects(objects, false).some((h) => opacity.accepts(h));
          return {
            id,
            clear: !blocked,
            rangeMeters: Math.hypot(delta.x, delta.z) * u,
            from: { x: origin.x, y: origin.y, z: origin.z },
            to: { x: target.x, y: target.y, z: target.z },
          };
        }),
      };
    }
    return {
      controls,
      markers,
      budget: scene.budget(),
      update(a) {
        const target = cartographyTarget(a);
        for (const [id, ring] of Object.entries(rings)) ring.material = id === target ? gold : teal;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        opacity.dispose();
        scene.dispose();
      },
    };
  } catch (error) {
    opacity.dispose();
    scene.dispose();
    throw error;
  }
}

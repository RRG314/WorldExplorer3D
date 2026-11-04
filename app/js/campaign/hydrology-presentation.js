import { createFieldCourseScene } from './field-course-scene.js';
import { createFieldOpacitySampler } from './field-opacity-sampler.js';
// Full furniture footprint admission, including the space between stations.
export function hydrologySiteEligibility(runtime, { points, metersPerUnit: u, ground }) {
  const a = points.a,
    b = points.b,
    dx = b.x - a.x,
    dz = b.z - a.z,
    length = Math.hypot(dx, dz),
    axis = { x: dx / length, z: dz / length },
    across = { x: -axis.z, z: axis.x },
    heights = [];
  for (let x = -1.4; x <= length * u + 1.4; x += 0.7)
    for (const z of [-2.3, -1.6, -0.9]) {
      const p = {
          x: a.x + (axis.x * x + across.x * z) / u,
          z: a.z + (axis.z * x + across.z * z) / u,
        },
        g = ground(p.x, p.z, 0.2);
      if (!g) return 'The entire training reach needs clear dry support ground.';
      heights.push(g.y);
    }
  // The side-mounted racks leave the observation lane open. Admit their whole
  // footprint, rather than borrowing the support check at the bank marker.
  for (const station of [a, b])
    for (const x of [0.7, 1.2, 1.7])
      for (const z of [-0.5, -0.15, 0.2]) {
        const g = ground(
          station.x + (axis.x * x + across.x * z) / u,
          station.z + (axis.z * x + across.z * z) / u,
          0.2
        );
        if (!g) return 'The bank instruments need clear dry support ground.';
        heights.push(g.y);
      }
  if ((Math.max(...heights) - Math.min(...heights)) * u > 0.6)
    return 'Choose gentler ground for the supported training reach.';
  return true;
}
export async function createHydrologyPresentation(runtime, qualified, study, options = {}) {
  const opacity = createFieldOpacitySampler();
  const scene = createFieldCourseScene(runtime, qualified, 'hydrology', options),
    { T, u, root, material, mesh, box, at, label, collider } = scene;
  const a = qualified.points.a,
    b = qualified.points.b,
    axis = new T.Vector3(b.x - a.x, 0, b.z - a.z).normalize(),
    across = new T.Vector3(-axis.z, 0, axis.x),
    length = Math.hypot(b.x - a.x, b.z - a.z) * u + 2.8,
    yaw = -Math.atan2(axis.z, axis.x),
    footings = [];
  const groundY = (x, z) => {
    const value = runtime.SurfaceQuery.driveAt(x, z, { preferRoad: false })?.position?.y;
    if (!Number.isFinite(value))
      throw Error('Support ground is unavailable. Reopen the saved course when it is ready.');
    return value;
  };
  let lastView = -Infinity,
    viewClear = false;
  let disposed = false,
    condition = 'baseline',
    mode = null,
    motion = 0;
  const frames = {},
    ray = new T.Raycaster();
  function dispose() {
    if (disposed) return;
    disposed = true;
    mode = null;
    opacity.dispose();
    scene.dispose();
    options.signal?.removeEventListener('abort', dispose);
  }
  options.signal?.addEventListener('abort', dispose, { once: true });
  try {
    const wood = material(0x6e5945),
      steel = material(0x8caaa8, { metalness: 0.55, roughness: 0.35 }),
      dark = material(0x253f43),
      stone = material(0x787c72),
      gold = material(0xefd17a),
      water = material(0x427d87, { transparent: true, opacity: 0.58, roughness: 0.25 }),
      glass = material(0xc2e4df, { transparent: true, opacity: 0.15, roughness: 0.15 });
    const center = new T.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2).addScaledVector(
        across,
        -1.6 / u
      ),
      supportCorners = [];
    for (const x of [-length / 2, length / 2])
      for (const z of [-0.57, 0.57]) {
        const p = center
          .clone()
          .addScaledVector(axis, x / u)
          .addScaledVector(across, z / u);
        supportCorners.push({ ...p, groundY: groundY(p.x, p.z) });
      }
    const supportGround = [...supportCorners.map((p) => p.groundY)];
    for (let x = -length / 2; x <= length / 2; x += 0.5)
      for (const z of [-0.56, 0, 0.56]) {
        const p = center
          .clone()
          .addScaledVector(axis, x / u)
          .addScaledVector(across, z / u);
        supportGround.push(groundY(p.x, p.z));
      }
    const top = Math.max(...supportGround) + 0.18 / u,
      stream = new T.Group();
    stream.name = 'Visible virtual training stream';
    stream.position.set(center.x, top, center.z);
    stream.rotation.y = yaw;
    root.add(stream);
    box(stream, length, 0.12, 1.15, stone, 0, 0.06, 0);
    const bed = box(stream, length - 0.1, 0.06, 0.9, wood, 0, 0.15, 0),
      surface = box(stream, length - 0.1, 0.012, 0.9, water, 0, 0.43, 0);
    surface.name = 'Hydrology water surface';
    surface.castShadow = false;
    for (const z of [-0.53, 0.53]) box(stream, length, 0.5, 0.11, steel, 0, 0.31, z);
    for (const x of [-length / 2, length / 2]) box(stream, 0.1, 0.5, 1.15, steel, x, 0.31, 0);
    function support(parent, x, z, topMeters) {
      parent.updateWorldMatrix(true, false);
      const p = parent.localToWorld(new T.Vector3(x / u, 0, z / u)),
        bottom = groundY(p.x, p.z),
        topY = parent.position.y + topMeters / u,
        h = (topY - bottom) * u;
      if (h < 0) throw Error('The support would intersect terrain. Choose gentler ground.');
      const object = box(parent, 0.11, h, 0.11, steel, x, topMeters - h / 2, z);
      footings.push({ object, x: p.x, z: p.z, groundY: bottom, bottomY: bottom, topY });
    }
    for (const x of [-length / 2 + 0.2, -length / 4, 0, length / 4, length / 2 - 0.2])
      for (const z of [-0.5, 0.5]) support(stream, x, z, 0);
    const minGround = Math.min(...supportGround);
    // Several short conservative proxies follow the existing solid-furniture owner.
    for (let x = -length / 2 + 0.5; x < length / 2; x += 1) {
      const p = center.clone().addScaledVector(axis, x / u);
      collider('reach-' + x, 0.65, 0.63, (top + 0.61 / u - minGround) * u, {
        x: p.x,
        y: minGround,
        z: p.z,
      });
    }
    const floats = [0, 1, 2].map((i) =>
      mesh(
        stream,
        new T.SphereGeometry(0.055 / u, 10, 6),
        i === 1 ? gold : material(i ? 0xeb8e5e : 0xeff3df),
        0,
        0.46,
        (i - 1) * 0.3
      )
    );
    floats.forEach((f, i) => (f.name = 'Hydrology float lane ' + (i + 1)));
    const gateWorld = (id, offset, lane) => {
      const station = qualified.points[id],
        p = new T.Vector3(station.x, top + 0.46 / u, station.z)
          .addScaledVector(across, -1.6 / u + ((lane - 1) * 0.3) / u)
          .addScaledVector(axis, offset / u);
      return { x: p.x, y: p.y, z: p.z };
    };
    const inStream = (p) => stream.worldToLocal(new T.Vector3(p.x, p.y, p.z));
    for (const id of ['a', 'b']) {
      const group = at(id);
      group.rotation.y = yaw;
      group.position.addScaledVector(axis, 1.2 / u);
      group.name = 'Dry bank ' + id.toUpperCase();
      const corners = [
        [-0.45, -0.45],
        [0.45, -0.45],
        [-0.45, 0.15],
        [0.45, 0.15],
      ].map(([x, z]) => {
        const p = new T.Vector3(x / u, 0, z / u)
          .applyAxisAngle(new T.Vector3(0, 1, 0), yaw)
          .add(group.position);
        return groundY(p.x, p.z);
      });
      group.position.y = Math.max(...corners) + 0.03 / u;
      box(group, 0.85, 0.08, 0.6, wood, 0, 0.8, -0.15);
      for (const x of [-0.36, 0.36]) for (const z of [-0.39, 0.09]) support(group, x, z, 0.76);
      collider(
        'instrument-' + id,
        0.5,
        0.5,
        (group.position.y + 1.2 / u - Math.min(...corners)) * u,
        { x: group.position.x, z: group.position.z, y: Math.min(...corners) }
      );
      label(group, id.toUpperCase(), 0.6, 1.15, -0.2, 0.36, 0.36);
      box(group, 0.035, 1.1, 0.035, steel, 0.6, 0.55, -0.2);
      const tube = new T.Group();
      tube.position.set(0, 0.84 / u, -0.15 / u);
      group.add(tube);
      box(tube, 0.32, 0.29, 0.26, glass, 0, 0.145, 0);
      box(tube, 0.012, 0.29, 0.26, dark, 0.18, 0.145, 0);
      box(tube, 0.012, 0.29, 0.26, steel, -0.18, 0.145, 0);
      const beads = new T.Group();
      tube.add(beads);
      const lights = [];
      for (let i = 0; i < 9; i++) {
        const y = 0.07 + Math.floor(i / 3) * 0.075,
          z = ((i % 3) - 1) * 0.075;
        const bead = mesh(beads, new T.SphereGeometry(0.026 / u, 8, 6), dark, 0, y, z);
        const light = mesh(tube, new T.SphereGeometry(0.009 / u, 6, 4), gold, -0.19, y, z);
        light.castShadow = false;
        lights.push({ bead, light, y, z });
      }
      const gates = [];
      for (const offset of [-0.5, 0.5]) {
        const p = inStream(gateWorld(id, offset, 1));
        const gate = box(stream, 0.04, 0.012, 0.11, gold, p.x * u, 0.566, 0.53);
        box(stream, 0.04, 0.012, 0.11, gold, p.x * u, 0.566, -0.53);
        gate.name = `Metre gate ${id} ${offset < 0 ? 'start' : 'finish'}`;
        gates.push(gate);
      }
      frames[id] = { group, tube, beads, lights, gates };
    }
    const bench = at('bench');
    box(bench, 2.1, 0.12, 1.2, wood, 0, 0.82, 0);
    for (const x of [-0.9, 0.9]) for (const z of [-0.45, 0.45]) support(bench, x, z, 0.76);
    collider('bench', 1.1, 0.65, 1.0);
    box(bench, 1.7, 0.05, 0.85, stone, 0, 0.91, 0);
    const greens = [material(0x547148), material(0x8c936d), material(0x777b7d)];
    for (let i = 0; i < 3; i++) box(bench, 0.49, 0.06, 0.68, greens[i], (i - 1) * 0.51, 0.96, 0);
    box(bench, 1.6, 0.025, 0.055, water, 0, 1.01, 0);
    label(bench, 'Virtual catchment\nSeparate from the real gauge', 0, 1.35, -0.4, 1.7, 0.45);
    function configure() {
      const setting = study[condition === 'baseline' ? 'before' : 'after'];
      for (const [id, f] of Object.entries(frames)) {
        const n = setting.blocked[id === 'a' ? 0 : 1];
        f.lights.forEach((p, i) => (p.bead.visible = i < n));
      }
    }
    function update(a) {
      const next = a.declaredCondition ? study.condition : 'baseline';
      if (next !== condition) {
        condition = next;
        mode = null;
      }
      configure();
    }
    function begin(kind, id) {
      if (disposed) throw Error('The stream instruments are closed.');
      mode = { kind, id };
      motion = 0;
      lastView = -Infinity;
      for (let i = 0; i < 3; i++) {
        const p = gateWorld(id, -0.5, i);
        floats[i].position.copy(inStream(p));
        floats[i].visible = true;
      }
    }
    function stepInstrument(dt) {
      if (!mode || disposed) return;
      motion += dt;
      const setting = study[condition === 'baseline' ? 'before' : 'after'];
      floats.forEach((f, i) => {
        const p = gateWorld(mode.id, -0.5, i),
          distance = Math.min(1.15, motion * setting.speeds[i]);
        p.x += (axis.x * distance) / u;
        p.z += (axis.z * distance) / u;
        f.position.copy(inStream(p));
      });
      root.updateWorldMatrix(true, true);
    }
    function optical(id) {
      const f = frames[id];
      return f.lights.map(({ y, z }, index) => {
        const from = f.tube.localToWorld(new T.Vector3(-0.16 / u, y / u, z / u)),
          to = f.tube.localToWorld(new T.Vector3(0.16 / u, y / u, z / u)),
          direction = to.clone().sub(from);
        ray.set(from, direction.clone().normalize());
        ray.far = direction.length();
        const hit = ray.intersectObject(f.beads, true).find((h) => h.object.visible);
        return {
          index,
          from: { x: from.x, y: from.y, z: from.z },
          to: { x: to.x, y: to.y, z: to.z },
          blocked: !!hit,
          ...(hit ? { hitMeters: hit.distance * u } : {}),
        };
      });
    }
    function clearReachView() {
      if (performance.now() - lastView < 200) return viewClear;
      lastView = performance.now();
      const camera = runtime.camera;
      if (!camera) return (viewClear = false);
      camera.updateMatrixWorld(true);
      const probes = [gateWorld(mode?.id || 'a', -0.5, 1), gateWorld(mode?.id || 'a', 0.5, 1)];
      if (
        !probes.every((p) => {
          const v = new T.Vector3(p.x, p.y, p.z).project(camera);
          return v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
        })
      )
        return (viewClear = false);
      const target = floats[1].getWorldPosition(new T.Vector3()),
        eye = camera.getWorldPosition(new T.Vector3()),
        d = target.clone().sub(eye);
      ray.set(eye, d.clone().normalize());
      ray.camera = camera;
      ray.far = d.length() + 0.1 / u;
      try {
        const hit = ray.intersectObjects(runtime.scene.children, true).find((h) => {
          for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
          // Match the rendered clipping planes. A first-person head inside
          // the near plane cannot occlude what the observer actually sees.
          const depth = h.point.clone().project(camera).z;
          return depth >= -1 && depth <= 1 && opacity.accepts(h);
        });
        return (viewClear = hit?.object === floats[1]);
      } catch {
        return (viewClear = false);
      }
    }
    function read() {
      if (!mode || disposed) throw Error('Release the floats before reading their motion.');
      root.updateWorldMatrix(true, true);
      surface.geometry.computeBoundingBox();
      const bounds = surface.geometry.boundingBox,
        mid = gateWorld(mode.id, 0, 1),
        surfacePosition = surface.getWorldPosition(new T.Vector3()),
        bedBox = new T.Box3().setFromObject(bed),
        along = (mid.x - surfacePosition.x) * axis.x + (mid.z - surfacePosition.z) * axis.z,
        left = surface.localToWorld(new T.Vector3(0, 0, bounds.min.z)).addScaledVector(axis, along),
        right = surface
          .localToWorld(new T.Vector3(0, 0, bounds.max.z))
          .addScaledVector(axis, along),
        positions = floats.map((f) => f.getWorldPosition(new T.Vector3()));
      return {
        position: { ...positions[1] },
        clearView: mode.kind === 'trace' ? clearReachView() : null,
        section: {
          left: { ...left },
          right: { ...right },
          surface: { x: mid.x, y: surfacePosition.y, z: mid.z },
          bed: { x: mid.x, y: bedBox.max.y, z: mid.z },
        },
        lanes: positions.map((p, i) => {
          const projected = frames[mode.id].gates.map((gate) => {
              const g = gate.getWorldPosition(new T.Vector3()),
                d = (p.x - g.x) * axis.x + (p.z - g.z) * axis.z;
              return p.clone().addScaledVector(axis, -d);
            }),
            start = { ...projected[0] },
            end = { ...projected[1] };
          return {
            start,
            end,
            progress: ((p.x - start.x) * axis.x + (p.z - start.z) * axis.z) * u,
          };
        }),
        paths: optical(mode.id),
      };
    }

    configure();
    root.updateWorldMatrix(true, true);
    scene.attach();
    return {
      root,
      update,
      begin,
      stepInstrument,
      read,
      footings,
      frames,
      stream,
      floats,
      get budget() {
        return scene.budget();
      },
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}

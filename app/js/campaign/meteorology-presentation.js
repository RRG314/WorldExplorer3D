import { createFieldCourseScene } from './field-course-scene.js';
import { METEOROLOGY_CALIBRATION } from './meteorology-career.js';
export function meteorologySiteEligibility(runtime, { points, metersPerUnit: u, ground }) {
  for (const id of ['a', 'b']) {
    const ys = [];
    for (const x of [-0.4, 0.6, 1.6])
      for (const z of [-0.6, 0, 0.6]) {
        const g = ground(points[id].x + x / u, points[id].z + z / u, 0.2);
        if (!g) return 'The whole weather instrument footprint needs clear dry ground.';
        ys.push(g.y);
      }
    if (id === 'b')
      for (const z of [-1.3, 0, 1.3]) {
        const g = ground(points.b.x - 1.2 / u, points.b.z + z / u, 0.2);
        if (!g) return 'The shelter screen needs clear dry support ground.';
        ys.push(g.y);
      }
    if ((Math.max(...ys) - Math.min(...ys)) * u > 0.45)
      return 'Choose gentler ground for the supported weather instruments.';
  }
  return true;
}
export async function createMeteorologyPresentation(runtime, qualified, study, options = {}) {
  const scene = createFieldCourseScene(runtime, qualified, 'meteorology', options),
    { T, u, root, material, mesh, box, at, label, collider } = scene,
    frames = {},
    footings = [],
    exposureSurfaces = [],
    screens = new T.Group(),
    ray = new T.Raycaster();
  root.add(screens);
  screens.name = 'Authored weather shelter screen';
  let disposed = false,
    verification = false,
    mode = null;
  const groundY = (x, z) => {
    const y = runtime.SurfaceQuery.driveAt(x, z, { preferRoad: false })?.position?.y;
    if (!Number.isFinite(y)) throw Error('Wait for supported weather-station ground.');
    return y;
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    mode = null;
    scene.dispose();
    options.signal?.removeEventListener('abort', dispose);
  }
  options.signal?.addEventListener('abort', dispose, { once: true });
  try {
    const steel = material(0xa4b8b4, { metalness: 0.6, roughness: 0.4 }),
      dark = material(0x253b41),
      gold = material(0xf2d080),
      wood = material(0x79664d),
      white = material(0xf0f3f1),
      sky = material(0x527d92),
      green = material(0x477260);
    function support(parent, x, z, topY) {
      parent.updateWorldMatrix(true, false);
      const p = parent.localToWorld(new T.Vector3(x / u, 0, z / u)),
        bottom = groundY(p.x, p.z),
        height = (topY - bottom) * u;
      if (height <= 0) throw Error('The instrument support intersects terrain.');
      const object = box(
        parent,
        0.06,
        height,
        0.06,
        steel,
        x,
        (topY - parent.position.y) * u - height / 2,
        z
      );
      footings.push({ object, groundY: bottom, x: p.x, z: p.z });
    }
    for (const id of ['a', 'b']) {
      const p = qualified.points[id],
        group = at(id),
        rotor = new T.Group(),
        vane = new T.Group(),
        tip = new T.Object3D(),
        clouds = new T.Group();
      group.name = 'Weather station ' + id.toUpperCase();
      box(group, 0.07, 2.17, 0.07, steel, 0, 1.085, 0);
      const feet = [
          [-0.28, 0],
          [0.28, 0],
          [0, -0.28],
          [0, 0.28],
        ],
        braceTop = Math.max(...feet.map(([x, z]) => groundY(p.x + x / u, p.z + z / u))) + 0.1 / u,
        braceY = (braceTop - p.y) * u;
      box(group, 0.65, 0.045, 0.07, steel, 0, braceY, 0);
      box(group, 0.07, 0.045, 0.65, steel, 0, braceY, 0);
      for (const [x, z] of feet) support(group, x, z, braceTop);
      rotor.position.set(0, 2 / u, 0);
      rotor.name = 'Working anemometer ' + id;
      group.add(rotor);
      for (let i = 0; i < 3; i++) {
        const arm = new T.Group();
        arm.rotation.y = (i * 2 * Math.PI) / 3;
        rotor.add(arm);
        box(arm, 0.035, 0.025, 0.25, steel, 0, 0, -0.125);
        const cup = mesh(
          arm,
          new T.SphereGeometry(0.07 / u, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          i === 0 ? gold : dark,
          0,
          0,
          -0.27
        );
        cup.rotation.z = Math.PI / 2;
      }
      vane.position.set(0, 2.16 / u, 0);
      vane.name = 'Working wind vane ' + id;
      group.add(vane);
      box(vane, 0.025, 0.035, 0.65, steel, 0, 0, -0.05);
      const arrow = mesh(vane, new T.ConeGeometry(0.075 / u, 0.18 / u, 8), gold, 0, 0, -0.4);
      arrow.rotation.x = -Math.PI / 2;
      box(vane, 0.18, 0.04, 0.13, dark, 0, 0, 0.28);
      tip.position.set(0, 0, -0.45 / u);
      vane.add(tip);
      const tray = at(id);
      tray.position.x += 1 / u;
      tray.name = 'Replay sky instrument ' + id;
      const cornerGround = [];
      for (const x of [-0.43, 0.43])
        for (const z of [-0.43, 0.43])
          cornerGround.push(groundY(tray.position.x + x / u, tray.position.z + z / u));
      const trayTop = Math.max(...cornerGround) + 0.95 / u;
      tray.position.y = trayTop - 0.95 / u;
      box(tray, 0.88, 0.07, 0.88, wood, 0, 0.91, 0);
      box(tray, 0.78, 0.02, 0.78, sky, 0, 0.96, 0);
      for (const x of [-0.38, 0.38])
        for (const z of [-0.38, 0.38]) support(tray, x, z, trayTop - 0.075 / u);
      tray.add(clouds);
      clouds.position.y = 0.98 / u;
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const x = ((i % 3) - 1) * 0.23,
          z = (Math.floor(i / 3) - 1) * 0.23;
        box(tray, 0.19, 0.012, 0.19, green, x, 0.979, z);
        const puff = mesh(clouds, new T.SphereGeometry(0.095 / u, 10, 6), white, x, 0.14, z);
        puff.name = 'Replay cloud cell ' + i;
        mesh(tray, new T.SphereGeometry(0.006 / u, 6, 4), gold, x + 0.017, 0.99, z + 0.011);
        cells.push({ x, z, sampleX: x + 0.017, sampleZ: z + 0.011, puff });
      }
      label(group, id.toUpperCase(), 0, 2.5, 0, 0.3, 0.3);
      label(tray, 'Replay sky\nNot local cloud observations', 0, 0.65, 0.48, 1.25, 0.35);
      collider(
        'station-' + id,
        0.95,
        0.65,
        (trayTop + 1.55 / u - Math.min(p.y, ...cornerGround)) * u,
        { x: p.x + 0.6 / u, z: p.z, y: Math.min(p.y, ...cornerGround) }
      );
      frames[id] = { group, rotor, vane, tip, tray, clouds, cells };
    }
    const p = qualified.points.b,
      x = p.x - 1.2 / u,
      z = p.z,
      ys = [groundY(x, z - 1.25 / u), groundY(x, z + 1.25 / u)],
      base = Math.max(...ys),
      screen = new T.Group();
    screen.position.set(x, base, z);
    screens.add(screen);
    exposureSurfaces.push(box(screen, 0.08, 2.4, 2.5, wood, 0, 1.2, 0));
    for (const dz of [-1.15, 1.15]) {
      const g = groundY(x, z + dz / u),
        height = (base + 2.4 / u - g) * u,
        object = box(screen, 0.1, height, 0.1, steel, 0, 2.4 - height / 2, dz);
      footings.push({ object, groundY: g, x, z: z + dz / u });
    }
    collider('shelter-screen', 0.1, 1.3, (base + 2.45 / u - Math.min(...ys)) * u, {
      x,
      y: Math.min(...ys),
      z,
    });
    label(screen, 'Training\nshelter', 0, 2.6, 0, 0.9, 0.35);
    const bench = at('bench'),
      corners = [];
    for (const x of [-0.8, 0.8])
      for (const z of [-0.4, 0.4])
        corners.push(groundY(bench.position.x + x / u, bench.position.z + z / u));
    bench.position.y = Math.max(...corners);
    box(bench, 1.8, 0.1, 1, wood, 0, 0.88, 0);
    for (const x of [-0.75, 0.75])
      for (const z of [-0.38, 0.38]) support(bench, x, z, bench.position.y + 0.83 / u);
    box(bench, 1.6, 0.03, 0.8, dark, 0, 0.96, 0);
    label(bench, 'Forecast bench\nRecord before replay', 0, 1.25, -0.25, 1.7, 0.45);
    collider('bench', 1, 0.6, 1.1, { ...qualified.points.bench, y: Math.min(...corners) });
    const setting = () => study[verification ? 'after' : 'before'];
    function update(a) {
      const next = !!a.forecast;
      if (next !== verification) {
        verification = next;
        mode = null;
      }
      const s = setting();
      for (const f of Object.values(frames)) {
        f.vane.rotation.y = (-s.from * Math.PI) / 180;
        f.cells.forEach((c, i) => (c.puff.visible = i < s.clouds));
      }
      root.updateWorldMatrix(true, true);
    }
    function begin(id) {
      if (disposed) throw Error('The weather instruments are closed.');
      if (!frames[id]) throw Error('Use a marked weather station.');
      mode = { id };
      frames[id].rotor.rotation.y = 0;
      root.updateWorldMatrix(true, true);
    }
    function exposure(id) {
      const f = frames[id],
        s = setting(),
        d = new T.Vector3(
          Math.sin((s.from * Math.PI) / 180),
          0,
          -Math.cos((s.from * Math.PI) / 180)
        ),
        across = new T.Vector3(-d.z, 0, d.x),
        center = f.rotor.getWorldPosition(new T.Vector3());
      return [-0.06, -0.02, 0.02, 0.06].map((offset, index) => {
        const from = center.clone().addScaledVector(across, offset / u),
          to = from.clone().addScaledVector(d, 3 / u);
        ray.set(from, d);
        ray.near = 0;
        ray.far = 3 / u;
        return {
          index,
          from: { ...from },
          to: { ...to },
          blocked: ray.intersectObjects(exposureSurfaces, false).length > 0,
        };
      });
    }
    function stepInstrument(seconds) {
      if (!mode || disposed) return;
      const f = frames[mode.id],
        paths = exposure(mode.id),
        factor = 0.35 + (0.65 * paths.filter((p) => !p.blocked).length) / 4;
      f.rotor.rotation.y +=
        ((setting().speed * factor) / METEOROLOGY_CALIBRATION) * 2 * Math.PI * seconds;
      root.updateWorldMatrix(true, true);
    }
    function read() {
      if (!mode || disposed) throw Error('Deploy the weather sensor before taking a reading.');
      root.updateWorldMatrix(true, true);
      const f = frames[mode.id],
        sensor = f.rotor.getWorldPosition(new T.Vector3()),
        ground = { x: sensor.x, y: groundY(sensor.x, sensor.z), z: sensor.z },
        base = f.vane.getWorldPosition(new T.Vector3()),
        tip = f.tip.getWorldPosition(new T.Vector3()),
        cloudPaths = f.cells.map(({ sampleX: x, sampleZ: z }, index) => {
          const from = f.tray.localToWorld(new T.Vector3(x / u, 1 / u, z / u)),
            to = from.clone().add(new T.Vector3(0, 0.5 / u, 0));
          ray.set(from, new T.Vector3(0, 1, 0));
          ray.near = 0;
          ray.far = 0.5 / u;
          return {
            index,
            from: { ...from },
            to: { ...to },
            covered: ray.intersectObject(f.clouds, true).some((h) => h.object.visible),
          };
        });
      return {
        sensorPosition: { ...sensor },
        groundPosition: ground,
        heightMeters: (sensor.y - ground.y) * u,
        sample: {
          rotorAngle: f.rotor.rotation.y,
          vaneBase: { ...base },
          vaneTip: { ...tip },
          cloudPaths,
          exposurePaths: exposure(mode.id),
        },
      };
    }
    update({ forecast: null });
    scene.attach();
    return {
      root,
      frames,
      footings,
      screens,
      update,
      begin,
      stepInstrument,
      read,
      get budget() {
        return scene.budget();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

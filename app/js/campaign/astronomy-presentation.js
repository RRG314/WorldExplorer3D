import { createFieldCourseScene } from './field-course-scene.js';
import { wildlifeOccluders } from './wildlife-sight.js';
import { astronomyExposurePlan } from './astronomy-career.js';
import { decodeDetectorFrame } from './astronomy-instrument.js';

export function astronomySiteEligibility(runtime, { points, metersPerUnit: u, ground }) {
  for (const id of ['a', 'b', 'bench']) {
    const heights = [];
    for (const x of [-0.85, 0, 0.85])
      for (const z of [-0.65, 0, 0.9]) {
        const p = ground(points[id].x + x / u, points[id].z + z / u, 0.2);
        if (!p) return 'The whole observatory footprint needs clear, supported dry ground.';
        heights.push(p.y);
      }
    if ((Math.max(...heights) - Math.min(...heights)) * u > 0.25)
      return 'Choose gentler ground for the telescope and detector benches.';
  }
  return true;
}
export async function createAstronomyPresentation(runtime, qualified, study, options = {}) {
  const scene = createFieldCourseScene(runtime, qualified, 'astronomy', options),
    { T, u, root, resource, material, mesh, box, at, collider } = scene,
    feet = [],
    ray = new T.Raycaster();
  let disposed = false,
    active = null,
    phaseKey = '',
    probeAge = Infinity,
    cached = null,
    occluders = [],
    imageKey = '';
  const rad = Math.PI / 180,
    steel = material(0x7e939a, { metalness: 0.7, roughness: 0.36 }),
    dark = material(0x1d3039),
    white = material(0xe1e8e3),
    gold = material(0xe7c46e),
    glass = material(0x315564, { metalness: 0.25, roughness: 0.18 }),
    green = material(0x5dbe9b, { emissive: 0x163b30, emissiveIntensity: 0.35 });
  const station = at('a'),
    yaw = new T.Group(),
    elevation = new T.Group(),
    lens = new T.Object3D(),
    axisTip = new T.Object3D();
  station.name = 'Catalog observatory · working telescope';
  yaw.name = 'Telescope azimuth mount';
  elevation.name = 'Telescope elevation mount';
  lens.name = 'Telescope optical origin';
  axisTip.name = 'Telescope axis marker';
  station.add(yaw);
  yaw.add(elevation);
  elevation.add(lens, axisTip);
  const groundY = (x, z) => {
    const s = runtime.SurfaceQuery.walkAt?.(x, z),
      y =
        s?.position?.y ?? runtime.SurfaceQuery.driveAt?.(x, z, { preferRoad: false })?.position?.y;
    if (!Number.isFinite(y)) throw Error('Wait for supported observatory ground.');
    return y;
  };
  function brace(parent, start, end, radius, mat, name) {
    const d = new T.Vector3().subVectors(end, start),
      o = mesh(parent, new T.CylinderGeometry(radius / u, radius / u, d.length(), 12), mat);
    o.name = name;
    o.position.copy(start).add(end).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return o;
  }
  function setPointing(azimuth, altitude) {
    if (disposed) return;
    yaw.rotation.y = -(((azimuth % 360) + 360) % 360) * rad;
    elevation.rotation.x = Math.max(5, Math.min(85, altitude)) * rad;
    root.updateWorldMatrix(true, true);
    probeAge = Infinity;
  }
  const cap = mesh(
    elevation,
    new T.CylinderGeometry(0.205 / u, 0.205 / u, 0.04 / u, 24),
    dark,
    0,
    0,
    -0.995
  );
  cap.name = 'Working detector shutter cap';
  cap.rotation.x = Math.PI / 2;
  const capLinks = [-0.08, 0.08].map((y) => {
    const link = mesh(elevation, new T.CylinderGeometry(0.012 / u, 0.012 / u, 1, 10), steel);
    link.name = 'Lens cover support';
    return { link, y };
  });
  function shutter(closed) {
    cap.position.x = closed ? 0 : 0.48 / u;
    for (const { link, y } of capLinks) {
      const start = new T.Vector3(0.17 / u, y / u, -0.91 / u),
        end = new T.Vector3(cap.position.x + (closed ? 0.18 : -0.18) / u, y / u, -0.995 / u),
        d = end.clone().sub(start);
      link.position.copy(start).add(end).multiplyScalar(0.5);
      link.scale.y = d.length();
      link.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    }
    root.updateWorldMatrix(true, true);
    probeAge = Infinity;
  }
  function readOptics(force = false) {
    root.updateWorldMatrix(true, true);
    const origin = lens.getWorldPosition(new T.Vector3()),
      axis = axisTip.getWorldPosition(new T.Vector3()).sub(origin).normalize(),
      azimuth = (((Math.atan2(axis.x, -axis.z) / rad) % 360) + 360) % 360,
      altitude = Math.asin(Math.max(-1, Math.min(1, axis.y))) / rad;
    if (force || probeAge >= 0.2 || !cached) {
      occluders = wildlifeOccluders(runtime);
      ray.set(origin, axis);
      ray.near = 0.005 / u;
      ray.far = 500 / u;
      const hit = ray.intersectObjects(occluders, false).find((h) => {
        for (let p = h.object; p; p = p.parent) if (p.visible === false) return false;
        return true;
      });
      cached = {
        covered: hit?.object === cap && hit.distance < 0.15 / u,
        blocked: !!hit && hit.object !== cap,
        firstHit: hit?.object.name || null,
      };
      probeAge = 0;
    }
    return {
      instrumentId: active?.site?.id || qualified.site.id,
      axis: { x: axis.x, y: axis.y, z: axis.z },
      origin: { x: origin.x, y: origin.y, z: origin.z },
      azimuth,
      altitude,
      clear: !cached.covered && !cached.blocked,
      covered: cached.covered,
      blocked: cached.blocked,
      firstHit: cached.firstHit,
    };
  }
  function badge(parent, text, x, y, z) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#18312f';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#f1d17e';
    g.font = 'bold 48px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 33);
    const map = resource(new T.CanvasTexture(c));
    map.encoding = T.sRGBEncoding;
    const m = resource(new T.MeshBasicMaterial({ map }));
    return mesh(parent, new T.PlaneGeometry(0.22 / u, 0.11 / u), m, x, y, z);
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d'),
    texture = resource(new T.CanvasTexture(canvas));
  texture.encoding = T.sRGBEncoding;
  texture.magFilter = T.NearestFilter;
  texture.minFilter = T.NearestFilter;
  const displayMaterial = resource(new T.MeshBasicMaterial({ map: texture }));
  function showFrame(record) {
    if (!record) {
      if (imageKey === 'empty') return;
      context.fillStyle = '#101820';
      context.fillRect(0, 0, 64, 64);
      texture.needsUpdate = true;
      imageKey = 'empty';
      return;
    }
    const f = record.pixels ? record : decodeDetectorFrame(record),
      key = [f.seed, f.seconds, f.shutter, f.pointing.azimuth, f.pointing.altitude].join(':');
    if (key === imageKey) return;
    const image = context.createImageData(64, 64);
    f.pixels.forEach((v, i) => {
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
      image.data[i * 4 + 3] = 255;
    });
    context.putImageData(image, 0, 0);
    texture.needsUpdate = true;
    imageKey = key;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.dispose();
    options.signal?.removeEventListener('abort', dispose);
  }
  options.signal?.addEventListener('abort', dispose, { once: true });
  try {
    const p = qualified.points.a,
      legs = [
        [-0.8, -0.55],
        [0.8, -0.55],
        [0, 0.85],
      ],
      samples = legs.map(([x, z]) => ({ x, z, y: groundY(p.x + x / u, p.z + z / u) })),
      top = Math.max(...samples.map((s) => s.y)) + 1.3 / u;
    yaw.position.y = top - p.y;
    for (const [index, s] of samples.entries()) {
      const low = new T.Vector3(s.x / u, s.y - p.y + 0.025 / u, s.z / u),
        high = new T.Vector3(0, top - p.y - 0.14 / u, 0);
      brace(station, low, high, 0.045, steel, 'Telescope tripod leg ' + index);
      const foot = box(station, 0.1, 0.05, 0.1, dark, s.x, (s.y - p.y) * u + 0.025, s.z);
      foot.name = 'Grounded telescope foot ' + index;
      feet.push({ object: foot, groundY: s.y });
    }
    const mount = mesh(
      yaw,
      new T.CylinderGeometry(0.22 / u, 0.28 / u, 0.26 / u, 24),
      steel,
      0,
      -0.13,
      0
    );
    mount.name = 'Azimuth bearing';
    const tube = mesh(
      elevation,
      new T.CylinderGeometry(0.17 / u, 0.2 / u, 1.2 / u, 32),
      white,
      0,
      0,
      -0.3
    );
    tube.rotation.x = Math.PI / 2;
    tube.name = 'Optical telescope tube';
    const rim = mesh(
      elevation,
      new T.TorusGeometry(0.17 / u, 0.025 / u, 12, 32),
      dark,
      0,
      0,
      -0.91
    );
    rim.name = 'Telescope aperture rim';
    const lensGlass = mesh(
      elevation,
      new T.CylinderGeometry(0.148 / u, 0.148 / u, 0.015 / u, 32),
      glass,
      0,
      0,
      -0.925
    );
    lensGlass.rotation.x = Math.PI / 2;
    lensGlass.name = 'Telescope objective glass';
    mesh(elevation, new T.BoxGeometry(0.16 / u, 0.16 / u, 0.24 / u), dark, 0, 0, 0.42).name =
      'Monochrome detector housing';
    lens.position.set(0, 0, -0.965 / u);
    axisTip.position.set(0, 0, -1.3 / u);
    const indicator = mesh(
      yaw,
      new T.BoxGeometry(0.05 / u, 0.05 / u, 0.5 / u),
      gold,
      0,
      -0.24,
      -0.3
    );
    indicator.name = 'Azimuth indicator';
    badge(station, 'A', 0, 0.95, 0.2);
    collider('a', 1.0, 1.0, 2.45);
    await scene.table('b');
    await scene.table('bench');
    for (const id of ['b', 'bench']) {
      const g = at(id);
      box(g, 0.8, 0.55, 0.09, dark, 0, 1.14, 0);
      const display = mesh(
        g,
        new T.PlaneGeometry(0.48 / u, 0.48 / u),
        displayMaterial,
        0,
        1.14,
        0.051
      );
      display.name = 'Synthetic detector monitor ' + id;
      for (const x of [-0.28, 0.28]) box(g, 0.06, 0.14, 0.06, steel, x, 0.87, 0);
      badge(g, id === 'b' ? 'B' : 'C', -0.29, 1.34, 0.053);
      box(g, 0.14, 0.05, 0.18, green, 0.48, 0.85, 0);
      box(g, 0.07, 0.04, 0.25, gold, -0.46, 0.85, 0);
    }
    const pa = qualified.points.a,
      pb = qualified.points.b,
      vertices = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16,
        x = pa.x + (pb.x - pa.x) * t,
        z = pa.z + (pb.z - pa.z) * t;
      vertices.push(x, groundY(x, z) + 0.02 / u, z);
    }
    const cableGeometry = resource(new T.BufferGeometry());
    cableGeometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    const cable = new T.Line(cableGeometry, resource(new T.LineBasicMaterial({ color: 0x354f51 })));
    cable.name = 'Same-instrument detector connection';
    root.add(cable);
    scene.attach();
    showFrame(null);
    return {
      root,
      feet,
      budget: scene.budget,
      dispose,
      readOptics,
      showFrame,
      turn(azimuthDelta, altitudeDelta) {
        if (!active || active.phase !== 'align')
          throw Error('The alignment is saved for this observing study.');
        const p = readOptics();
        setPointing(p.azimuth + azimuthDelta, p.altitude + altitudeDelta);
        return readOptics(true);
      },
      prepare(role) {
        if (!active) throw Error('The observing instrument is not ready.');
        const plan = astronomyExposurePlan(active, role);
        if (!plan.pointing) throw Error('Align the telescope first.');
        setPointing(plan.pointing.azimuth, plan.pointing.altitude);
        shutter(plan.shutter === 'closed');
        return readOptics(true);
      },
      update(a) {
        active = a;
        const key = [a.runId, a.phase, Object.keys(a.frames).length].join(':');
        if (key === phaseKey) return;
        phaseKey = key;
        if (a.phase === 'align') {
          setPointing(
            a.catalogDirection.azimuth + 1.5,
            Math.min(84, a.catalogDirection.altitude + 1)
          );
          shutter(false);
        } else if (a.pointing) {
          const role = ['configure', 'primary'].includes(a.phase)
              ? 'primary'
              : a.phase === 'controls'
                ? a.frames.comparison
                  ? 'dark'
                  : 'comparison'
                : 'dark',
            plan = astronomyExposurePlan(a, role);
          setPointing(plan.pointing.azimuth, plan.pointing.altitude);
          shutter(plan.shutter === 'closed');
        }
        const last = a.frames.dark || a.frames.comparison || a.frames.primary;
        if (last) showFrame(last.image);
      },
      tick(dt) {
        probeAge += Math.max(0, Number(dt) || 0);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

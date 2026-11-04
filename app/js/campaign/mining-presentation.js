import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { wildlifeOccluders } from './wildlife-sight.js';
import { createFieldCourseScene } from './field-course-scene.js';
import { miningFormation, MINING_LIMITS } from './mining-formation.js';
export function miningSiteEligibility(runtime, { points, metersPerUnit: u, ground }) {
  for (const id of Object.keys(points)) {
    const heights = [];
    for (const x of [-1.6, 0, 1.6])
      for (const z of id === 'dispatch'
        ? [-0.7, 0, 0.7, 1.8]
        : id === 'bench'
          ? [-2.2, -1.4, -0.7, 0, 0.7]
          : [-0.7, 0, 0.7]) {
        const p = ground(points[id].x + x / u, points[id].z + z / u, 0.3);
        if (!p) return 'The whole quarry exhibit and carrier route need clear supported ground.';
        heights.push(p.y);
      }
    if ((Math.max(...heights) - Math.min(...heights)) * u > 0.2)
      return 'Choose a level supported quarry training yard.';
  }
  for (const x of [1.4, 2, 2.6])
    for (const z of [1.5, 2, 2.5])
      if (!ground(points.b.x + x / u, points.b.z + z / u, 0.3))
        return 'The parked carrier needs a clear supported bay beside the working face.';
  return true;
}
// Native exhibit geometry and instruments; the existing field owner supplies
// updates and the profile ledger decides when material changes are accepted.
export async function createMiningPresentation(runtime, qualified, study, options = {}) {
  const scene = createFieldCourseScene(runtime, qualified, 'mining', options),
    { T, u, root, resource, material, mesh, box, at, collider } = scene,
    formation = miningFormation(study.variantId || study.id || 'campaign'),
    cells = new Map(),
    faces = new Map(),
    feet = [],
    ray = new T.Raycaster();
  let disposed = false,
    active = null,
    stateKey = '',
    probeAge = Infinity,
    cachedProbe = null,
    selectedFace = 'b',
    selectedColumn = 2,
    cutIds = [],
    cutSeconds = 0,
    cutDuration = 1;
  const cutOutlines = new Map(),
    outlineGeometry = resource(
      new T.EdgesGeometry(resource(new T.BoxGeometry(0.206 / u, 0.206 / u, 0.206 / u)))
    ),
    outlineMaterial = resource(new T.LineBasicMaterial({ color: 0x7edddb }));
  const rockMap = resource(
    new T.TextureLoader().load('/app/assets/textures/earth/rock_ground_diffuse.jpg', (t) => {
      if (disposed || options.isCurrent?.() === false) {
        t.dispose();
        return;
      }
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(2, 2);
      t.encoding = T.sRGBEncoding;
    })
  );
  const host = material(0x9b9b86, { map: rockMap }),
    darkRock = material(0x4b4e49, { map: rockMap }),
    copper = material(0xb07d48, { roughness: 0.6, metalness: 0.5 }),
    streak = material(0x5c8d70, { map: rockMap }),
    steel = material(0x6d8285, { metalness: 0.65, roughness: 0.4 }),
    gold = material(0xe7c46e),
    black = material(0x223234),
    green = material(0x426f53);
  const pointVector = (o) => o.getWorldPosition(new T.Vector3());
  function ground(x, z) {
    const y = runtime.SurfaceQuery.walkAt?.(x, z)?.position?.y;
    if (!Number.isFinite(y)) throw Error('Wait for supported quarry footing.');
    return y;
  }
  function badge(parent, text, w, h, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    g.fillStyle = '#16302d';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#f0d27c';
    g.textAlign = 'center';
    const lines = String(text).split('\n');
    g.font = lines.length > 1 ? 'bold 36px system-ui' : 'bold 46px system-ui';
    lines.forEach((line, i) => g.fillText(line, 256, lines.length > 1 ? 48 + i * 54 : 84, 492));
    const map = resource(new T.CanvasTexture(canvas));
    map.encoding = T.sRGBEncoding;
    return mesh(
      parent,
      new T.PlaneGeometry(w / u, h / u),
      resource(new T.MeshBasicMaterial({ map })),
      x,
      y,
      z
    );
  }
  function footing(parent, p, x, z) {
    const y = ground(p.x + x / u, p.z + z / u),
      o = box(parent, 0.22, 0.08, 0.22, steel, x, (y - p.y) * u + 0.04, z);
    feet.push({ object: o, groundY: y });
    return o;
  }
  const probe = new T.Group(),
    probeTip = new T.Object3D(),
    probeAxis = new T.Object3D(),
    probeRail = new T.Group(),
    cutter = new T.Group(),
    cutterTip = new T.Object3D(),
    cutterMotor = new T.Group();
  probe.name = 'Working quarry assay probe';
  probeTip.name = 'Assay probe tip';
  probeAxis.name = 'Assay ray axis';
  probe.add(probeTip, probeAxis);
  probeTip.position.z = 0.105 / u;
  probeAxis.position.z = -0.15 / u;
  box(probe, 0.12, 0.1, 0.15, steel, 0, 0, 0.23);
  mesh(
    probe,
    new T.CylinderGeometry(0.018 / u, 0.018 / u, 0.08 / u, 12),
    copper,
    0,
    0,
    0.15
  ).rotation.x = Math.PI / 2;
  box(probeRail, 1.16, 0.04, 0.04, steel, 0, 1.02, 0.38);
  for (const x of [-0.55, 0.55]) box(probeRail, 0.04, 0.23, 0.04, steel, x, 0.9, 0.38);
  probeRail.add(probe);
  probe.position.y = 1.0 / u;
  probe.position.z = 0.04 / u;
  cutter.name = 'Working quarry cutter';
  cutterTip.name = 'Cutter contact tip';
  cutter.add(cutterMotor, cutterTip);
  cutterTip.position.z = -0.13 / u;
  box(cutter, 0.17, 0.16, 0.34, black, 0, 0, 0.12);
  const spindle = mesh(
    cutterMotor,
    new T.CylinderGeometry(0.027 / u, 0.027 / u, 0.08 / u, 12),
    steel,
    0,
    0,
    -0.09
  );
  spindle.rotation.x = Math.PI / 2;
  for (const x of [-0.1, 0.1]) box(cutter, 0.025, 0.18, 0.025, gold, x, -0.07, 0.18);
  box(cutter, 0.22, 0.03, 0.035, black, 0, -0.16, 0.18);
  const blade = mesh(
    cutterMotor,
    new T.CylinderGeometry(0.085 / u, 0.085 / u, 0.03 / u, 24),
    steel,
    0,
    0,
    -0.05
  );
  blade.rotation.x = Math.PI / 2;
  cutterMotor.add(box(new T.Group(), 0.018, 0.17, 0.035, gold));
  function mount(faceId) {
    const face = faces.get(faceId);
    if (!face) throw Error('Select an existing quarry face.');
    face.add(probeRail, cutter);
    selectedFace = faceId;
    moveProbe(selectedColumn);
  }
  function moveProbe(column) {
    if (!Number.isInteger(column) || column < 0 || column > 4)
      throw Error('Place the probe on one of the five line points.');
    selectedColumn = column;
    probe.position.x = ((column - 2) * 0.2) / u;
    root.updateWorldMatrix(true, true);
  }
  function cellVolume(o) {
    o.geometry.computeBoundingBox();
    const size = o.geometry.boundingBox.getSize(new T.Vector3());
    return size.x * size.y * size.z * Math.abs(o.matrixWorld.determinant()) * u ** 3;
  }
  function assayCell(o) {
    const definition = o.userData.miningCell,
      massGrams = Math.round(cellVolume(o) * MINING_LIMITS.bulkDensityKgM3 * 1000),
      copperGrams = Math.round((massGrams * definition.copperGrams) / definition.massGrams);
    return {
      cellId: definition.id,
      massGrams,
      copperGrams,
      gradePermille: massGrams ? (copperGrams / massGrams) * 1000 : 0,
      magnetic: definition.magnetic,
      features: definition.features,
    };
  }
  function readProbe(force = true) {
    root.updateWorldMatrix(true, true);
    const origin = pointVector(probeTip),
      axis = pointVector(probeAxis).sub(origin).normalize();
    ray.set(origin, axis);
    ray.near = 0;
    ray.far = 0.25 / u;
    // A five-hertz alignment sensor; explicit core captures always probe fresh.
    const changed =
      !cachedProbe ||
      origin.distanceToSquared(cachedProbe.origin) > 1e-12 ||
      axis.distanceToSquared(cachedProbe.axis) > 1e-12;
    if (force || changed || probeAge >= 0.2) {
      const hit = ray.intersectObjects(wildlifeOccluders(runtime), false).find((h) => {
        for (let p = h.object; p; p = p.parent) if (p.visible === false) return false;
        return true;
      });
      cachedProbe = { origin: origin.clone(), axis: axis.clone(), hit };
      probeAge = 0;
    }
    const hit = cachedProbe.hit;
    let sample = hit?.object;
    while (sample && !sample.userData.miningCell) sample = sample.parent;
    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      axis: { x: axis.x, y: axis.y, z: axis.z },
      faceId: selectedFace,
      column: selectedColumn,
      tipMeters: (() => {
        const p = faces.get(selectedFace).worldToLocal(origin.clone()).multiplyScalar(u);
        return { x: p.x, y: p.y, z: p.z };
      })(),
      contact: !!sample,
      firstHit: hit?.object.name || null,
      assay: sample && !sample.userData.restoredFill ? assayCell(sample) : null,
    };
  }
  function stepCut(seconds, duration) {
    cutSeconds = Math.max(0, seconds);
    cutDuration = Math.max(0.01, duration);
    if (!cutIds.length) return;
    const progress = Math.min(0.999999, cutSeconds / cutDuration),
      index = Math.floor(progress * cutIds.length),
      part = progress * cutIds.length - index,
      target = cells.get(cutIds[index]);
    if (!target) return;
    mount(target.userData.miningCell.faceId);
    cutter.position.set(target.position.x, target.position.y, (0.23 - part * 0.18) / u);
    cutterMotor.rotation.z = cutSeconds * 8 * Math.PI;
    root.updateWorldMatrix(true, true);
  }
  function readCutter() {
    root.updateWorldMatrix(true, true);
    const tip = pointVector(cutterTip),
      index = Math.min(
        cutIds.length - 1,
        Math.floor(Math.min(0.999999, cutSeconds / cutDuration) * cutIds.length)
      ),
      target = cells.get(cutIds[index]),
      bounds = target && new T.Box3().setFromObject(target);
    const local = target
      ? faces.get(target.userData.miningCell.faceId).worldToLocal(tip.clone()).multiplyScalar(u)
      : null;
    return {
      cellId: target?.userData.miningCell.id || null,
      tipMeters: local ? { x: local.x, y: local.y, z: local.z } : null,
      tip: { x: tip.x, y: tip.y, z: tip.z },
      motorAngle: cutterMotor.rotation.z,
      contact: !!target && target.visible && bounds.expandByScalar(0.003 / u).containsPoint(tip),
    };
  }
  let cartProxy = null;
  const cart = new T.Group(),
    cargo = new T.Group(),
    wheels = [];
  root.add(cart);
  const cp = qualified.points.b;
  cart.position.set(cp.x + 2 / u, ground(cp.x + 2 / u, cp.z + 2 / u), cp.z + 2 / u);
  cart.name = 'Quarry weighed carrier';
  cart.add(cargo);
  box(cart, 0.9, 0.08, 0.65, steel, 0, 0.42, 0);
  for (const x of [-0.37, 0.37])
    for (const z of [-0.24, 0.24]) {
      const w = mesh(
        cart,
        new T.CylinderGeometry(0.13 / u, 0.13 / u, 0.055 / u, 16),
        black,
        x,
        0.14,
        z
      );
      w.rotation.z = Math.PI / 2;
      wheels.push(w);
    }
  for (const z of [-0.24, 0.24]) {
    const axle = mesh(
      cart,
      new T.CylinderGeometry(0.025 / u, 0.025 / u, 0.8 / u, 12),
      steel,
      0,
      0.14,
      z
    );
    axle.rotation.z = Math.PI / 2;
    for (const x of [-0.34, 0.34]) box(cart, 0.04, 0.28, 0.05, steel, x, 0.28, z);
  }
  for (const x of [-0.35, 0.35]) box(cart, 0.04, 0.65, 0.04, steel, x, 0.68, -0.29);
  box(cart, 0.75, 0.04, 0.04, steel, 0, 1, -0.29);
  const scaleGroup = at('bench'),
    scalePlate = box(scaleGroup, 1.2, 0.04, 0.9, steel, 0, 0.02, 0),
    scaleMarker = new T.Object3D();
  const sp = qualified.points.bench,
    panFeet = [
      [-0.5, -0.35],
      [0.5, -0.35],
      [-0.5, 0.35],
      [0.5, 0.35],
    ].map(([x, z]) => ({ x, z, y: ground(sp.x + x / u, sp.z + z / u) })),
    panTop = Math.max(...panFeet.map((p) => p.y)) + 0.04 / u;
  scalePlate.position.y = panTop - sp.y - 0.02 / u;
  for (const p of panFeet) {
    const h = (panTop - 0.02 / u - p.y) * u;
    if (h > 0) {
      const foot = box(scaleGroup, 0.12, h, 0.12, steel, p.x, (p.y - sp.y) * u + h / 2, p.z);
      feet.push({ object: foot, groundY: p.y });
    }
  }
  scaleMarker.name = 'Receiving scale pan';
  scaleMarker.position.y = panTop - sp.y;
  scaleGroup.add(scaleMarker);
  for (const x of [-0.45, 0.45]) box(scaleGroup, 0.025, 0.25, 0.025, steel, x, 0.165, -0.4);
  badge(scaleGroup, 'RECEIVING SCALE', 1.2, 0.2, 0, 0.32, -0.4);
  const orderGroup = at('dispatch');
  orderGroup.position.z += 1.5 / u;
  orderGroup.position.y = ground(orderGroup.position.x, orderGroup.position.z);
  orderGroup.name = 'Fabricated survey marker base';
  let markerProxy = null;
  const orderBase = mesh(
    orderGroup,
    new T.CylinderGeometry(0.1 / u, 0.12 / u, 0.003 / u, 24),
    copper,
    0,
    0.0015,
    0
  );
  box(orderGroup, 0.04, 0.9, 0.04, steel, 0, 0.54, 0);
  badge(orderGroup, 'RETURN ROUTE', 0.65, 0.16, 0, 1, 0.025);
  orderGroup.visible = false;
  function readScale() {
    root.updateWorldMatrix(true, true);
    const p = pointVector(scaleMarker),
      bounds = new T.Box3().setFromObject(cart),
      center = bounds.getCenter(new T.Vector3()),
      wheelClearancesMeters = wheels.map((w) => {
        const positions = w.geometry.attributes.position,
          v = new T.Vector3();
        let low = Infinity;
        for (let i = 0; i < positions.count; i++) {
          v.fromBufferAttribute(positions, i).applyMatrix4(w.matrixWorld);
          low = Math.min(low, v.y);
        }
        return (low - p.y) * u;
      }),
      onPan =
        Math.hypot(center.x - p.x, center.z - p.z) * u < 0.35 &&
        wheelClearancesMeters.every((d) => Math.abs(d) < 0.01);
    const lots = cargo.children.map(assayCell);
    return {
      onPan,
      wheelClearancesMeters,
      scalePosition: { x: p.x, y: p.y, z: p.z },
      massGrams: onPan ? lots.reduce((n, c) => n + c.massGrams, 0) : null,
      lots,
    };
  }
  function syncCarrierProxy() {
    if (!cartProxy) return;
    cart.updateWorldMatrix(true, true);
    const b = new T.Box3().setFromObject(cart);
    Object.assign(cartProxy, {
      minX: b.min.x,
      maxX: b.max.x,
      minZ: b.min.z,
      maxZ: b.max.z,
      minY: b.min.y,
      maxY: b.max.y,
      baseY: b.min.y,
      height: b.max.y - b.min.y,
    });
  }
  function loadCarrier(ids) {
    cargo.clear();
    ids.forEach((id, index) => {
      const source = cells.get(id);
      if (!source) throw Error('The cut cell is missing.');
      const o = source.clone(true);
      o.visible = true;
      o.userData.miningCell = { ...source.userData.miningCell };
      o.position.set(((index - 1) * 0.23) / u, 0.56 / u, 0);
      cargo.add(o);
    });
    root.updateWorldMatrix(true, true);
  }

  const finishedFill = material(0x706a59, { map: rockMap }),
    processGroup = new T.Group(),
    bins = new Map();
  root.add(processGroup);
  processGroup.name = 'Conserved processing and fabrication lots';
  const processPoint = { x: sp.x, y: ground(sp.x, sp.z - 1.6 / u), z: sp.z - 1.6 / u };
  processGroup.position.set(processPoint.x, processPoint.y, processPoint.z);
  processGroup.visible = false;
  function processingDisplay(a) {
    processGroup.visible = !!a.processing;
    if (!a.processing) return;
    for (const child of [...processGroup.children]) processGroup.remove(child);
    bins.clear();
    const rows = [
      ['material', a.processing.materialGrams, copper],
      [
        'retained waste',
        a.processing.wasteGrams + a.processing.tailingsGrams + a.processing.refiningResidueGrams,
        finishedFill,
      ],
      ['yard order', a.fabrication?.productGrams || 0, gold],
    ];
    rows.forEach(([name, grams, mat], index) => {
      const g = new T.Group();
      g.position.x = ((index - 1) * 0.42) / u;
      processGroup.add(g);
      box(g, 0.34, 0.035, 0.28, steel, 0, 0.8375, 0);
      const h = Math.max(0.004, Math.min(0.25, (grams / a.processing.inputGrams) * 0.25)),
        fill = box(g, 0.25, h, 0.2, mat, 0, 0.855 + h / 2, 0);
      fill.name = 'Retained ' + name + ' grams';
      fill.userData.trainingGrams = grams;
      box(g, 0.02, 0.32, 0.02, steel, 0, 1.02, 0.1);
      badge(g, name + '\n' + (grams / 1000).toFixed(3) + ' kg', 0.4, 0.1, 0, 1.22, 0.12);
      bins.set(name, fill);
    });
  }
  function restoreCells(a) {
    const restored = new Set(a.restoration?.backfilledCellIds || []),
      removed = new Set(a.cut?.cellIds || []);
    for (const [id, o] of cells) {
      o.visible = !removed.has(id) || restored.has(id);
      o.userData.restoredFill = restored.has(id);
      o.material = restored.has(id)
        ? finishedFill
        : o.userData.miningCell.magnetic
          ? darkRock
          : host;
      for (const child of o.children) child.visible = !restored.has(id);
    }
  }
  function prepareRestoration(a) {
    if (!a.processing || !a.fabrication)
      throw Error('Process the delivered batch and complete the yard order first.');
    const value = {
      truthType: 'restored-authored-quarry-cell',
      supportsIntact: [...cells.values()]
        .filter((o) => o.userData.miningCell.protected)
        .every((o) => o.visible),
      returnRouteClear: true,
      orderInstalled: orderGroup.visible,
      backfillGrams: a.processing.inputGrams - a.processing.materialGrams,
      backfilledCellIds: [...a.plan.cellIds],
    };
    restoreCells({ ...a, restoration: value });
    const residue = bins.get('retained waste');
    if (residue) residue.visible = false;
    return value;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.dispose();
    options.signal?.removeEventListener('abort', dispose);
  }
  options.signal?.addEventListener('abort', dispose, { once: true });
  try {
    for (const faceId of ['a', 'b', 'c']) {
      const g = at(faceId),
        p = qualified.points[faceId];
      g.name = 'Authored quarry face ' + faceId;
      faces.set(faceId, g);
      const footHeights = [];
      for (const x of [-1.1, 1.1]) {
        const foot = footing(g, p, x, 0);
        footHeights.push((foot.position.y + 0.04 / u) * u);
      }
      const base = Math.max(...footHeights);
      for (const [i, x] of [-1.1, 1.1].entries()) {
        const h = base - footHeights[i];
        if (h > 0.0001) box(g, 0.1, h, 0.1, steel, x, footHeights[i] + h / 2, 0);
      }
      box(g, 2.8, 0.18, 0.95, steel, 0, base + 0.09, -0.25);
      const outline = new T.Shape(),
        vertices = [
          [-1.3, 0],
          [-1.42, 0.53],
          [-1.29, 1.22],
          [-0.91, 1.91],
          [-0.3, 2.15],
          [0.43, 2.05],
          [1.17, 1.52],
          [1.39, 0.78],
          [1.22, 0],
        ];
      vertices.forEach(([x, y], i) =>
        i ? outline.lineTo(x / u, y / u) : outline.moveTo(x / u, y / u)
      );
      outline.closePath();
      const rockGeometry = new T.ExtrudeGeometry(outline, {
        depth: 0.7 / u,
        steps: 1,
        bevelEnabled: true,
        bevelThickness: 0.025 / u,
        bevelSize: 0.025 / u,
        bevelSegments: 2,
      });
      rockGeometry.translate(0, 0, -0.835 / u);
      mesh(g, rockGeometry, faceId === 'c' ? darkRock : host, 0, base + 0.18, 0).name =
        'Rough authored quarry outcrop ' + faceId;
      box(g, 1.2, 0.9, 0.24, faceId === 'c' ? darkRock : host, 0, 1.05, -0.23);
      for (const c of formation.cells.filter((c) => c.faceId === faceId)) {
        const o = box(
          g,
          0.2,
          0.2,
          0.2,
          c.magnetic ? darkRock : host,
          (c.column - 2) * 0.2,
          0.8 + c.row * 0.2,
          0
        );
        o.userData.miningCell = { ...c };
        o.name = 'Quarry cell ' + c.id;
        cells.set(c.id, o);
        if (c.features === 'visible-copper-bearing-streak')
          for (let k = 0; k < 3; k++) {
            const phase = (c.column * 7 + c.row * 3 + k) * 2.399,
              band = box(
                o,
                0.018,
                0.055,
                0.006,
                streak,
                Math.sin(phase) * 0.065,
                Math.cos(phase * 1.3) * 0.06,
                0.103
              );
            band.rotation.z = Math.sin(phase) * 0.8;
          }
        if (c.features === 'visible-copper-bearing-streak')
          for (let k = 0; k < 2; k++) {
            const phase = (c.column * 5 + c.row + k) * 1.71;
            box(
              o,
              0.009,
              0.013,
              0.006,
              copper,
              Math.cos(phase) * 0.07,
              Math.sin(phase) * 0.065,
              0.104
            );
          }
        if (c.protected) box(o, 0.19, 0.014, 0.008, gold, 0, -0.09, 0.105);
        else {
          const line = new T.LineSegments(outlineGeometry, outlineMaterial);
          line.visible = false;
          line.name = 'Marked extraction boundary ' + c.id;
          o.add(line);
          cutOutlines.set(c.id, line);
        }
      }
      badge(g, 'FACE ' + faceId.toUpperCase(), 0.48, 0.18, -0.9, base + 1.8, -0.08);
      collider(faceId, 1.55, 0.95, 2.6, { x: p.x, y: p.y, z: p.z - 0.35 / u });
    }
    const control = at('dispatch'),
      dp = qualified.points.dispatch,
      stakeX = -1.2,
      stakeZ = 1.0,
      stakeY = ground(dp.x + stakeX / u, dp.z + stakeZ / u),
      offsetY = (stakeY - dp.y) * u;
    box(control, 0.24, 0.05, 0.24, black, stakeX, offsetY + 0.025, stakeZ);
    box(control, 0.035, 1.0, 0.035, steel, stakeX, offsetY + 0.55, stakeZ);
    badge(control, 'RETURN CONTROL', 0.7, 0.18, stakeX, offsetY + 0.97, stakeZ + 0.025);
    collider('return-control-stake', 0.16, 0.16, 1.1, {
      x: dp.x + stakeX / u,
      y: stakeY,
      z: dp.z + stakeZ / u,
    });
    const ringPoints = [];
    for (let i = 0; i <= 48; i++) {
      const angle = (i / 48) * Math.PI * 2,
        x = dp.x + (Math.cos(angle) * 0.7) / u,
        z = dp.z + (Math.sin(angle) * 0.7) / u;
      ringPoints.push(new T.Vector3(x, ground(x, z) + 0.006 / u, z));
    }
    const ringGeometry = resource(new T.BufferGeometry().setFromPoints(ringPoints)),
      ringMaterial = resource(new T.LineBasicMaterial({ color: 0x7edddb })),
      ring = new T.Line(ringGeometry, ringMaterial);
    ring.name = 'Visible carrier return control';
    root.add(ring);
    // Physical sampling line: all five probe positions share the same visible rail.
    mount('b');
    probeRail.visible = true;
    cutter.visible = false;
    collider('carrier', 0.55, 0.45, 1.1, {
      x: cart.position.x,
      y: cart.position.y,
      z: cart.position.z,
    });
    cartProxy = runtime.dynamicBuildingColliders.find(
      (p) => p.sourceBuildingId === 'research-mining:carrier'
    );
    await scene.asset('workspace-table', processPoint, 0.82);
    collider('processing-bench', 0.7, 0.55, 0.92, processPoint);
    scene.attach();
    return {
      root,
      formation,
      cells,
      faces,
      feet,
      cart,
      cargo,
      wheels,
      cartProxy,
      scaleGroup,
      scaleTopY: () => pointVector(scaleMarker).y,
      probe,
      probeTip,
      cutter,
      cutterTip,
      budget: scene.budget,
      dispose,
      readProbe,
      readCutter,
      readScale,
      placeLine(faceId) {
        mount(faceId);
        probeRail.visible = true;
        return {
          faceId,
          endpoints: [0, 4].map((column) => {
            const p = pointVector(cells.get(faceId + ':1:' + column));
            return { x: p.x, y: p.y, z: p.z };
          }),
        };
      },
      setProbe: moveProbe,
      beginCut(ids, duration = 4) {
        cutIds = [...ids];
        if (!cutIds.length || cutIds.some((id) => !cells.has(id)))
          throw Error('Mark the actual extraction cells first.');
        cutter.visible = true;
        probeRail.visible = false;
        stepCut(0.01, duration);
        return readCutter();
      },
      stepCut,
      processingDisplay,
      prepareRestoration,
      orderGroup,
      bins,
      loadCarrier,
      syncCarrierProxy,
      highlightCut(ids) {
        for (const [id, line] of cutOutlines) line.visible = ids.includes(id);
      },
      alignCarrierOnPan() {
        if (
          Math.hypot(
            cart.position.x - scaleGroup.position.x,
            cart.position.z - scaleGroup.position.z
          ) *
            u >
          0.35
        )
          throw Error('Roll the actual carrier onto the receiving pan first.');
        cart.quaternion.identity();
        cart.position.y = pointVector(scaleMarker).y - 0.01 / u;
        return readScale();
      },
      update(a) {
        active = a;
        const key = [a.runId, a.phase, a.phaseAt].join(':');
        if (key === stateKey) return;
        stateKey = key;
        restoreCells(a);
        for (const [id, line] of cutOutlines)
          line.visible = !a.restoration && !!a.plan?.cellIds.includes(id);
        orderGroup.visible = !!a.fabrication;
        if (orderGroup.visible && !markerProxy) {
          collider('fabricated-marker', 0.16, 0.16, 1.15, {
            x: orderGroup.position.x,
            y: orderGroup.position.y,
            z: orderGroup.position.z,
          });
          markerProxy = runtime.dynamicBuildingColliders.at(-1);
        }
        if (a.separation && !a.processing) loadCarrier(a.plan.cellIds);
        if (a.processing) cargo.clear();
        if (a.delivery) {
          const last = a.delivery.route.at(-1).position,
            p = earthCoordinateFrame(runtime.LOC, runtime.SCALE).toWorld(last.lat, last.lon);
          cart.position.x = p.x;
          cart.position.z = p.z;
          if (Math.hypot(p.x - scaleGroup.position.x, p.z - scaleGroup.position.z) * u < 0.35) {
            cart.quaternion.identity();
            cart.position.y = pointVector(scaleMarker).y - 0.01 / u;
          }
        }
        syncCarrierProxy();
        processingDisplay(a);
        if (a.restoration) {
          const residue = bins.get('retained waste');
          if (residue) residue.visible = false;
        }
      },
      tick(dt) {
        probeAge += Math.max(0, Number(dt) || 0);
      },
    };
  } catch (e) {
    dispose();
    throw e;
  }
}

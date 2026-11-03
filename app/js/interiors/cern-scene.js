import { createCernPlan } from './cern-layout.js';
import { buildAuthoredInterior } from './authored-geometry.js';
import { createWallCollider, estimateInteriorFloorBaseY, ringAreaAbs } from './core.js?v=4';
import { batchOwnedStaticStructure } from '../world/static-structure-batching.js';

export function buildCernInterior(T, ctx, definition) {
  const p = createCernPlan(ctx, definition),
    u = p.metersPerUnit,
    k = 1 / u,
    footprint = p.building.pts,
    base = estimateInteriorFloorBaseY(p.building, footprint, p.center, [], null) + 0.06;
  const authored = buildAuthoredInterior(T, p.layout),
    root = authored.group;
  root.name = p.source.label + ' · interpretive training visit';
  root.position.set(p.center.x, base, p.center.z);
  root.rotation.y = p.yaw;
  root.scale.setScalar(k);
  const converted = new Set();
  root.traverse((o) => {
    if (o.material)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (converted.has(m)) continue;
        converted.add(m);
        m.fog = false;
        if (o.userData.kind === 'floor') m.color.setHex(0x8d9e9d);
        m.color?.convertSRGBToLinear();
      }
  });
  const colliders = authored.compiled.solids
      .map((s) =>
        createWallCollider(
          p.world(s.a),
          p.world(s.b),
          base + s.bottom * k,
          (s.top - s.bottom) * k,
          s.thickness * k,
          0.000001
        )
      )
      .filter(Boolean),
    interactions = [];
  const material = (color, metalness = 0) => {
      const m = new T.MeshStandardMaterial({ color, roughness: 0.55, metalness, fog: false });
      m.color.convertSRGBToLinear();
      return m;
    },
    blue = material(0x274b61),
    steel = material(0xa5b3b8, 0.5),
    accent = material(0xe2c27a),
    dark = material(0x102d37);
  const box = (m, x, y, z, w, h, d, solid = false) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    root.add(o);
    if (solid)
      colliders.push(
        createWallCollider(
          p.world({ x: x - w / 2, z }),
          p.world({ x: x + w / 2, z }),
          base + (y - h / 2) * k,
          h * k,
          d * k,
          0.000001
        )
      );
    return o;
  };
  const sign = (text, x, y, z, w = 2.8) => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 192;
    const c = canvas.getContext('2d');
    c.fillStyle = '#143744';
    c.fillRect(0, 0, 768, 192);
    c.fillStyle = '#eed59c';
    c.font = 'bold 36px system-ui';
    c.fillText(text, 24, 70, 720);
    c.fillStyle = '#dfeceb';
    c.font = '26px system-ui';
    c.fillText('Virtual training · interpretive rooms', 24, 130, 720);
    const t = new T.CanvasTexture(canvas);
    t.encoding = T.sRGBEncoding;
    const o = new T.Mesh(
      new T.PlaneGeometry(w, w / 4),
      new T.MeshBasicMaterial({ map: t, side: T.FrontSide, fog: false })
    );
    o.position.set(x, y, z);
    root.add(o);
    const back = new T.Mesh(o.geometry.clone(), o.material.clone());
    back.position.copy(o.position);
    back.rotation.y = Math.PI;
    back.position.z -= 0.015;
    root.add(back);
    o.userData.ownedInteriorTextures = [t];
  };
  const cms = p.source.id === 'cms-point-five',
    stationMeshes = {};
  for (const [id, s] of Object.entries(p.stations)) {
    const elevation = p.layout.floors[s.level].elevation;
    box(blue, s.x, elevation + 0.58, s.z, 2.8, 1.16, 1.3, true);
    for (const dx of [-1.1, 1.1]) box(steel, s.x + dx, elevation + 0.25, s.z, 0.12, 0.5, 1.1);
    sign(s.label, s.x, elevation + 1.9, s.z - 0.45);
    const group = new T.Group();
    group.position.set(s.x, elevation + 1.25, s.z);
    root.add(group);
    stationMeshes[id] = { group, station: s };
  }
  if (cms) {
    // Persistent physical machine enclosure; layer selection never removes it.
    box(dark, 0, -100 + 7.4, 0, 17.6, 14.8, 23, true);
    // The collider owns the closed machine volume; only its rendered placeholder
    // is hidden when the independently leased, full-scale detector attaches.
    const placeholder = root.children.at(-1);
    placeholder.name = 'cms-loading-envelope';
    const glass = new T.MeshStandardMaterial({
      color: 0x7eb8c6,
      roughness: 0.2,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: T.DoubleSide,
      fog: false,
    });
    for (const x of [-8.9, 8.9]) box(glass, x, -98.7, 0, 0.1, 2.6, 23.2, true);
    for (const z of [-11.6, 11.6]) box(glass, 0, -98.7, z, 17.8, 2.6, 0.1, true);
    for (const x of [-9, 9]) {
      box(accent, x, -98.8, 0, 0.08, 0.08, 23.5);
      box(steel, x, -99.5, 0, 0.08, 1, 23.5);
    }
    for (let z = -24; z <= 24; z += 6) {
      box(steel, -13.15, -88, z, 0.45, 24, 0.45);
      box(steel, 13.15, -88, z, 0.45, 24, 0.45);
      box(steel, 0, -76.4, z, 26, 0.5, 0.5);
    }
    sign('CMS · event-display geometry', 0, -96.7, -24, 5);
    sign('Recorded events · 2010B', 0, -97, 17.2, 5);
    const lift = p.layout.lifts[0];
    for (const stop of lift.stops)
      sign(
        'Visitor lift · ' + (stop.floorId === 'cms-surface' ? '−100 m' : 'surface'),
        stop.x,
        p.layout.floors.find((f) => f.id === stop.floorId).elevation + 2.8,
        stop.z - 1,
        3.5
      );
  } else {
    for (const z of [-15, -5, 5]) box(accent, 6, 0.025, z, 2, 0.03, 0.9);
    sign('Beam → RF → Focus → Travel to CMS', 6, 2.8, 7, 6);
  }
  batchOwnedStaticStructure(T, root);
  // Instruments remain individually addressable after static architecture is batched.
  for (const [id, s] of Object.entries(stationMeshes)) {
    const knobs = {};
    for (const [i, key] of (id === 'focus'
      ? ['k1', 'k2']
      : id === 'bend'
        ? ['fieldTesla']
        : id === 'rf'
          ? ['phaseDegrees']
          : id === 'mass'
            ? ['beta']
            : []
    ).entries()) {
      const knob = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.09, 24), accent);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(-0.55 + i * 0.55, 0.12, 0.45);
      s.group.add(knob);
      knobs[key] = knob;
    }
    s.knobs = knobs;
    if (id === 'focus') {
      s.quadrupoles = [];
      for (let i = 0; i < 4; i++) {
        const magnet = new T.Group();
        magnet.position.set(-0.9 + i * 0.6, 0.2, 0);
        s.group.add(magnet);
        for (const [dy, dz, w, h, d, m] of [
          [0.22, 0, 0.18, 0.1, 0.5, accent],
          [-0.22, 0, 0.18, 0.1, 0.5, accent],
          [0, 0.22, 0.18, 0.5, 0.1, blue],
          [0, -0.22, 0.18, 0.5, 0.1, blue],
        ]) {
          const pole = new T.Mesh(new T.BoxGeometry(w, h, d), m);
          pole.position.set(0, dy, dz);
          magnet.add(pole);
        }
        s.quadrupoles.push(magnet);
      }
    }
  }
  root.add(new T.HemisphereLight(0xf0f6ff, 0x66777a, 1));
  for (const [y, z] of cms
    ? [
        [-90, -18],
        [-90, 18],
        [6, 0],
      ]
    : [
        [3, 0],
        [3, -20],
        [3, 15],
      ]) {
    const l = new T.PointLight(0xffefd2, 0.75, 80);
    l.position.set(0, y, z);
    root.add(l);
  }
  const walkSurfaces = authored.compiled.floors.flatMap((f) =>
    f.polygons.map((poly) => ({
      kind: 'polygon',
      pts: poly[0].map(([x, z]) => p.world({ x, z })),
      holes: poly.slice(1).map((r) => r.map(([x, z]) => p.world({ x, z }))),
      y: base + f.y * k,
      floorLevel: p.layout.floors.findIndex((v) => v.id === f.floorId),
    }))
  );
  const floorPlan = {
    authored: true,
    floorCount: p.layout.floors.length,
    storyHeight: 4.2 * k,
    floors: p.layout.floors.map((f, level) => ({
      id: f.id,
      label: f.label,
      level,
      elevation: f.elevation * k,
      height: f.height * k,
    })),
    connectorEligible: cms,
  };
  for (const lift of p.layout.lifts)
    for (const stop of lift.stops)
      interactions.push({
        kind: 'elevator',
        liftId: lift.id,
        level: p.layout.floors.findIndex((f) => f.id === stop.floorId),
        ...p.world(stop),
        radius: 1.5 * k,
        label: lift.label,
      });
  const entry = { ...p.world(p.spawn), y: base + (ctx.Walk?.CFG?.eyeHeight || 1.7) + 0.03 },
    entryYaw = p.yaw + Math.atan2(p.entrance.inward.x, p.entrance.inward.z),
    entryFloor = floorPlan.floors[p.entryLevel];
  interactions.push({
    kind: 'exit',
    level: p.entryLevel,
    x: entry.x,
    z: entry.z,
    radius: 2.3 * k,
    label: 'Return outside',
  });
  root.userData.cernVisit = {
    plan: p,
    stationMeshes,
    base,
    placeholder: root.getObjectByName('cms-loading-envelope'),
    station(id) {
      const s = p.stations[id];
      return s
        ? {
            ...p.world(s),
            y: base + p.layout.floors[s.level].elevation * k,
            level: s.level,
            label: s.label,
          }
        : null;
    },
  };
  return {
    group: root,
    mode: 'authored',
    layoutKind: 'cern-training-visit',
    dynamicColliders: colliders,
    walkSurfaces,
    placementTargets: [],
    floorPlan,
    authoredLifts: p.layout.lifts.map((l) => ({
      ...l,
      stops: l.stops.map((s) => ({
        ...s,
        ...p.world(s),
        yaw: s.yaw + p.yaw,
        level: p.layout.floors.findIndex((f) => f.id === s.floorId),
      })),
    })),
    floorId: entryFloor.id,
    floorLabel: entryFloor.label,
    activeLevel: p.entryLevel,
    loadedLevels: floorPlan.floors.map((f) => f.level),
    connector: null,
    stairs: [],
    center: p.center,
    floorBaseY: base,
    floorY: base,
    wallHeight: entryFloor.height,
    entryPoint: entry,
    entryYaw,
    lobbyEntryPoint: entry,
    exteriorFootprint: footprint,
    usableFootprint: p.usable.map(p.world),
    exteriorArea: ringAreaAbs(footprint),
    usableArea: ringAreaAbs(p.usable) * k * k,
    shellClearanceMin: 0.05 * k,
    requiredShellClearance: 0.05 * k,
    partitionCount: colliders.length,
    interactions,
    authoredCeilings: authored.compiled.surfaces
      .filter((s) => s.kind === 'ceiling')
      .map((s) => ({
        y: base + s.y * k,
        polygons: s.polygons.map((poly) => poly.map((r) => r.map(([x, z]) => p.world({ x, z })))),
      })),
  };
}

import { CERN_SITE_REFERENCE } from './cern-site-reference.js';
import { cernCoordinateFrame, CERN_STATIONS } from '../campaign/cern-study-sites.js';
import { footprintFullyContained, polygonEdgeClearance } from './planner.js?v=6';
import {
  polygons,
  validateRing,
  containsRegion,
  roomRing,
  floorWalls,
  wallKey,
  assertPlayableLayout,
  layoutEntrance,
  liftShaftGeometry,
} from '../../../functions/interior-layout.mjs';

// Curated, fixed interpretive facilities. This does not expand the user-home
// authoring contract or permit arbitrary negative storeys or deep lift shafts.
export function createCernPlan(ctx, definition) {
  const source = CERN_SITE_REFERENCE.find((s) => s.id === definition.cernContent?.siteId);
  if (!source || definition.contentAssociation?.accuracy !== 'interpretive')
    throw Error('CERN needs reviewed mapped entry admission.');
  const building = definition.support?.building || definition.building,
    u = ctx.METERS_PER_WORLD_UNIT;
  if (!(u > 0) || !building?.pts?.length)
    throw Error('The mapped facility envelope is unavailable.');
  const outline = building.pts,
    { center, yaw, local, world } = cernCoordinateFrame(
      source,
      (lat, lon) => ctx.geoToWorld(lat, lon),
      u
    );
  const shell = validateRing(outline.map(local));
  // Fixed campus wings have narrow projections. The generic home's fallback
  // rectangle intentionally discards those wings; retain this admitted shell
  // with a checked 35 cm inward wall offset instead.
  const orientation = Math.sign(
    shell.reduce((sum, p, i) => {
      const q = shell[(i + 1) % shell.length];
      return sum + p.x * q.z - q.x * p.z;
    }, 0)
  );
  const edges = shell.map((a, i) => {
    const b = shell[(i + 1) % shell.length],
      dx = b.x - a.x,
      dz = b.z - a.z,
      l = Math.hypot(dx, dz);
    return {
      a: { x: a.x - (dz / l) * 0.35 * orientation, z: a.z + (dx / l) * 0.35 * orientation },
      dx,
      dz,
    };
  });
  const usable = validateRing(
    edges.map((e, i) => {
      const prev = edges[(i + edges.length - 1) % edges.length],
        cross = prev.dx * e.dz - prev.dz * e.dx;
      if (Math.abs(cross) < 1e-8) return e.a;
      const t = ((e.a.x - prev.a.x) * e.dz - (e.a.z - prev.a.z) * e.dx) / cross;
      return { x: prev.a.x + t * prev.dx, z: prev.a.z + t * prev.dz };
    })
  );
  if (!footprintFullyContained(usable, shell, 0.05))
    throw Error('The training rooms do not fit the mapped shell.');
  const cms = source.id === 'cms-point-five',
    layout = {
      schemaVersion: 1,
      id: source.id + '-training-v1',
      unitLabel: source.label,
      floors: [],
      stairs: [],
      lifts: [],
    };
  function floor(id, label, elevation, height, ring, bands) {
    const f = {
      id,
      label,
      elevation,
      height,
      slab: 0.16,
      wallThickness: 0.22,
      vertices: {},
      rooms: [],
      doors: [],
      boundaries: [],
    };
    layout.floors.push(f);
    const vertex = ([x, z]) => {
      const existing = Object.entries(f.vertices).find(
        ([, p]) => Math.hypot(p.x - x, p.z - z) < 1e-6
      );
      if (existing) return existing[0];
      const id = 'v' + Object.keys(f.vertices).length;
      f.vertices[id] = { x, z };
      return id;
    };
    for (const [roomId, name, min, max] of bands) {
      const clipped = polygons.intersection(
        [ring.map((p) => [p.x, p.z])],
        [
          [
            [-1000, min],
            [1000, min],
            [1000, max],
            [-1000, max],
          ],
        ]
      );
      if (clipped.length !== 1 || clipped[0].length !== 1)
        throw Error('The fixed training room is disconnected: ' + roomId);
      const points = clipped[0][0].slice();
      if (Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1e-6)
        points.pop();
      validateRing(points.map(([x, z]) => ({ x, z })));
      f.rooms.push({ id: roomId, label: name, type: 'visitor', vertices: points.map(vertex) });
    }
    // Register collinear seam vertices in both adjacent rooms, exactly as the
    // shared authored-layout compiler requires for a real connected doorway.
    for (const r of f.rooms)
      r.vertices = r.vertices.flatMap((id, i) => {
        const next = r.vertices[(i + 1) % r.vertices.length],
          a = f.vertices[id],
          b = f.vertices[next],
          dx = b.x - a.x,
          dz = b.z - a.z,
          d2 = dx * dx + dz * dz;
        return [
          id,
          ...Object.entries(f.vertices)
            .filter(
              ([key, p]) =>
                key !== id && key !== next && Math.abs(dx * (p.z - a.z) - dz * (p.x - a.x)) < 1e-6
            )
            .map(([key, p]) => ({ key, t: ((p.x - a.x) * dx + (p.z - a.z) * dz) / d2 }))
            .filter((p) => p.t > 1e-6 && p.t < 1 - 1e-6)
            .sort((a, b) => a.t - b.t)
            .map((p) => p.key),
        ];
      });
    for (const w of floorWalls(f).filter((w) => w.rooms.length === 2)) {
      const d = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z),
        desired = cms ? -10 : 6,
        t = Math.max(1.4, Math.min(d - 1.4, ((desired - w.a.x) / (w.b.x - w.a.x)) * d));
      f.doors.push({
        id: f.id + '-' + w.id,
        wall: w.id,
        offset: t,
        width: 2.2,
        height: 2.5,
        entry: false,
      });
    }
    return f;
  }
  let surface;
  if (cms) {
    floor(
      'cms-cavern',
      'Detector cavern · −100 m',
      -100,
      24,
      [
        { x: -13.5, z: -26.5 },
        { x: 13.5, z: -26.5 },
        { x: 13.5, z: 26.5 },
        { x: -13.5, z: 26.5 },
      ],
      [
        ['detector-route', 'Detector viewing route', -1000, 17],
        ['analysis', 'Recorded-data analysis', 17, 1000],
      ]
    );
    surface = floor('cms-surface', 'Surface reception', 0, 8, usable, [
      ['cms-arrival', 'Surface orientation', -1000, 1000],
    ]);
    const cavern = layout.floors[0];
    let stop = null;
    for (const z of [-21, 21])
      for (const x of [0, -9, 9]) {
        if (stop) continue;
        const yaw = z < 0 ? 0 : Math.PI,
          lift = {
            id: 'cms-lift',
            label: 'CMS visitor lift',
            shaft: { width: 2.5, depth: 2.5, landingDistance: 1, doorWidth: 1.4, doorHeight: 2.3 },
            stops: [
              { floorId: cavern.id, roomId: z < 17 ? 'detector-route' : 'analysis', x, z, yaw },
              { floorId: surface.id, roomId: 'cms-arrival', x, z, yaw },
            ],
          },
          core = liftShaftGeometry(lift);
        if (
          containsRegion(usable, core.outline) &&
          containsRegion(
            roomRing(
              cavern,
              cavern.rooms.find((r) => r.id === lift.stops[0].roomId)
            ),
            core.outline
          ) &&
          polygonEdgeClearance({ x, z }, usable) > 2
        )
          stop = lift;
      }
    if (!stop) throw Error('No supported lift landing fits both fixed floors.');
    layout.lifts.push(stop);
  } else
    surface = floor('meyrin-training', 'Meyrin training rooms', 0, 4.2, usable, [
      ['focus-room', 'Focus a bunch', -1000, -15],
      ['rf-room', 'Radio-frequency acceleration', -15, -5],
      ['bend-room', 'Steer a beam', -5, 5],
      ['orientation', 'Reception and orientation', 5, 1000],
    ]);
  const anchor = local(
    definition.support?.exteriorEntrance || definition.support?.entryAnchor || world({ x: 0, z: 0 })
  );
  let entry = null;
  for (const w of floorWalls(surface).filter((w) => w.rooms.length === 1)) {
    const dx = w.b.x - w.a.x,
      dz = w.b.z - w.a.z,
      d = Math.hypot(dx, dz);
    if (d < 3) continue;
    const offset = Math.max(
        1.3,
        Math.min(d - 1.3, ((anchor.x - w.a.x) * dx + (anchor.z - w.a.z) * dz) / d)
      ),
      p = { x: w.a.x + (dx * offset) / d, z: w.a.z + (dz * offset) / d },
      distance = Math.hypot(p.x - anchor.x, p.z - anchor.z);
    if (!entry || distance < entry.distance) entry = { wall: w.id, offset, distance };
  }
  if (!entry) throw Error('No supported source entrance can be resolved.');
  surface.doors.push({
    id: 'cern-exterior-entry',
    wall: entry.wall,
    offset: entry.offset,
    width: 2.2,
    height: 2.5,
    entry: true,
  });
  assertPlayableLayout(layout);
  const entrance = layoutEntrance(layout),
    spawn = {
      x: entrance.point.x + entrance.inward.x * 1.4,
      z: entrance.point.z + entrance.inward.z * 1.4,
    };
  if (
    !containsRegion(usable, [
      { x: spawn.x - 0.35, z: spawn.z - 0.35 },
      { x: spawn.x + 0.35, z: spawn.z - 0.35 },
      { x: spawn.x + 0.35, z: spawn.z + 0.35 },
      { x: spawn.x - 0.35, z: spawn.z + 0.35 },
    ])
  )
    throw Error('The source doorway has no supported walking landing.');
  const stations = CERN_STATIONS[source.id];
  for (const p of Object.values(stations)) {
    const f = layout.floors[p.level];
    if (
      !f.rooms.some((r) =>
        containsRegion(roomRing(f, r), [
          { x: p.x - 1.6, z: p.z - 1 },
          { x: p.x + 1.6, z: p.z - 1 },
          { x: p.x + 1.6, z: p.z + 2 },
          { x: p.x - 1.6, z: p.z + 2 },
        ])
      )
    )
      throw Error('A fixed station blocks its room or corridor.');
  }
  return {
    source,
    building,
    layout,
    world,
    local,
    center,
    yaw,
    metersPerUnit: u,
    shell,
    usable,
    entrance,
    spawn,
    entryLevel: cms ? 1 : 0,
    stations,
  };
}

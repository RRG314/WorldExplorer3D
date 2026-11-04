import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { createBuildingCollisionQuery } from '../physics/building-collision.js?v=5';
import { traversableFeaturesForMode, findTraversalRoute } from '../world/traversal.js?v=4';
import { CARTOGRAPHY_PROTOCOL } from './cartography-career.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function qualifyCartographySite(
  runtime,
  { id, name, location, existingSite = null, variantId = 'campaign', studyState = null },
  deps = {}
) {
  if (
    runtime.getEnv?.() !== 'EARTH' ||
    !runtime.gameStarted ||
    runtime.worldLoading ||
    !runtime.worldPublication?.requestId
  )
    throw Error('Wait for the Earth streets and surfaces to finish loading.');
  const u = runtime.METERS_PER_WORLD_UNIT || 1.11,
    frame = earthCoordinateFrame(runtime.LOC, runtime.SCALE),
    actor = runtime.Walk?.state?.walker,
    collision = deps.collision || createBuildingCollisionQuery(runtime),
    route = deps.route || findTraversalRoute;
  if (!actor) throw Error('Enter outdoor walking mode to survey this route.');
  function support(p) {
    const s = runtime.SurfaceQuery.walkAt(p.x, p.z, {
        currentY: Number.isFinite(p.y) ? p.y : actor.y,
        sampleRenderedMesh: true,
      }),
      water = runtime.SurfaceQuery.waterAt?.(p.x, p.z);
    if (
      !Number.isFinite(s?.position?.y) ||
      (water?.feature && water.position?.y > s.position.y - 0.1) ||
      collision(p.x, p.z, 0.28 / u, { actorBaseY: s.position.y, actorHeight: 1.8 / u }).collision
    )
      return null;
    return { x: p.x, z: p.z, y: s.position.y };
  }
  function connected(a, b) {
    const r = route(a.x, a.z, b.x, b.z, { mode: 'walk', maxAnchorDistance: 16 / u });
    if (!r?.points?.length || r.points.length > 128 || r.distance * u > 250) return null;
    let previous = null;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i],
        n = Math.max(1, Math.ceil((distance(a, b) * u) / 1.5));
      for (let j = 0; j <= n; j++) {
        const p = support({ x: a.x + ((b.x - a.x) * j) / n, z: a.z + ((b.z - a.z) * j) / n });
        if (!p) return null;
        if (
          previous &&
          distance(previous, p) > 0.05 &&
          Math.abs(previous.y - p.y) / distance(previous, p) > 0.35
        )
          return null;
        previous = p;
      }
    }
    return r;
  }
  function qualify(points, prior = null) {
    for (const k of Object.keys(points)) {
      points[k] = support(points[k]);
      if (!points[k]) return null;
    }
    const keys = Object.keys(points);
    if (keys.some((k, i) => keys.slice(i + 1).some((j) => distance(points[k], points[j]) * u < 5)))
      return null;
    // A straight optical control line is distinct from a walkable route.
    for (const k of ['a', 'b']) {
      const p = points.origin,
        q = points[k],
        n = Math.ceil(distance(p, q) * u);
      for (let i = 1; i < n; i++) {
        const t = i / n,
          y = p.y + (q.y - p.y) * t + 1.5 / u;
        if (
          collision(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t, 0.03 / u, {
            actorBaseY: y,
            actorHeight: 0.05 / u,
          }).collision
        )
          return null;
      }
    }
    const r1 = connected(points.origin, points.a),
      r2 = connected(points.a, points.b),
      entryRoute = connected(points.b, points.entry);
    if (
      !r1 ||
      !r2 ||
      !entryRoute ||
      r1.distance * u < 8 ||
      r2.distance * u < 8 ||
      r1.distance * u > 150 ||
      r2.distance * u > 150
    )
      return null;
    if (variantId === 'dogleg' && r2.distance / distance(points.a, points.b) < 1.12) return null;
    if (!connected(actor, points.origin)) return null;
    const geographic = Object.fromEntries(
      Object.entries(points).map(([k, p]) => [k, frame.toGeographic(p.x, p.z)])
    );
    function leg(r, index) {
      const sources = [r.startAnchor?.feature, r.endAnchor?.feature].filter(Boolean).map((f) => ({
        id: String(f.sourceFeatureId || f.id || 'compiled-path').slice(0, 100),
        kind: String(f.kind || f.networkKind || 'road').slice(0, 40),
        name: String(f.name || 'Unnamed way').slice(0, 100),
        provenance: f.sourceFeatureId ? 'mapped' : 'compiled',
        mappedHeight: Number.isFinite(f.sourceTags?.ele) ? Number(f.sourceTags.ele) : null,
      }));
      return {
        from: ['origin', 'a'][index],
        to: ['a', 'b'][index],
        points: r.points.map((p) => frame.toGeographic(p.x, p.z)),
        mapDistance: r.distance * u,
        sources,
      };
    }
    return {
      site: prior || {
        id,
        name,
        truthType: 'virtual-training-site',
        location: geographic.origin,
        locationContext: { lat: location.lat, lon: location.lon, name: location.name || name },
        points: geographic,
        plan: {
          protocol: CARTOGRAPHY_PROTOCOL,
          variantId,
          legs: [leg(r1, 0), leg(r2, 1)],
          entry: points.entryMetadata,
          realAccess: 'unverified',
        },
      },
      points,
      center: points.origin,
      metersPerUnit: u,
    };
  }
  const entrances = (runtime.buildingEntranceCatalog?.entrances || []).filter(
    (e) => Number.isFinite(e.approachX) && Number.isFinite(e.approachZ)
  );
  if (existingSite) {
    const points = Object.fromEntries(
      Object.entries(existingSite.points).map(([k, p]) => [k, frame.toWorld(p.lat, p.lon)])
    );
    const result = qualify(points, existingSite);
    if (!result)
      throw Error(
        'The saved route is not supported by this loaded world. Your route sheet is kept; try again after the streets finish loading.'
      );
    return result;
  }
  if (variantId === 'reciprocal' && studyState?.records?.campaign) {
    const base = studyState.records.campaign,
      old = base.site.points,
      points = Object.fromEntries(
        Object.entries({ origin: old.b, a: old.a, b: old.origin, entry: old.entry }).map(
          ([k, p]) => [k, frame.toWorld(p.lat, p.lon)]
        )
      ),
      result = qualify(points);
    if (!result)
      throw Error(
        'The original survey needs supported streets before its reciprocal survey can open. Your first route sheet is kept.'
      );
    result.site.plan.entry = base.site.plan.entry;
    result.site.plan.reciprocalOf = base.runId;
    return result;
  }
  const features = (deps.features || traversableFeaturesForMode('walk')).filter(
      (f) => !['railway'].includes(f.kind) && f.pts?.some((p) => distance(p, actor) * u < 180)
    ),
    segments = [];
  for (const f of features)
    for (let i = 1; i < f.pts.length; i++) {
      const a = f.pts[i - 1],
        b = f.pts[i],
        length = distance(a, b);
      if (length * u >= 16 && Math.min(distance(a, actor), distance(b, actor)) * u < 180)
        segments.push({ a, b, length, f });
    }
  segments.sort(
    (a, b) =>
      Math.min(distance(a.a, actor), distance(a.b, actor)) -
      Math.min(distance(b.a, actor), distance(b.b, actor))
  );
  let attempts = 0;
  function tryPoints(points) {
    for (const e of entrances
      .slice()
      .sort(
        (a, b) =>
          distance({ x: a.approachX, z: a.approachZ }, points.origin) -
          distance({ x: b.approachX, z: b.approachZ }, points.origin)
      )
      .slice(0, 8)) {
      const entry = { x: e.approachX, z: e.approachZ };
      if (
        distance(entry, points.origin) * u > 100 ||
        Object.values(points).some((p) => distance(p, entry) * u < 5)
      )
        continue;
      const result = qualify({ ...points, entry });
      if (result) {
        result.site.plan.entry = {
          id: String(e.id).slice(0, 120),
          buildingSourceId: String(e.buildingSourceId || '').slice(0, 120),
          provenance: e.provenance === 'mapped' ? 'mapped' : 'inferred',
        };
        return result;
      }
    }
    return null;
  }
  if (variantId !== 'dogleg')
    for (const s of segments) {
      if (s.length * u < 40) continue;
      const origin = { x: s.a.x + (s.b.x - s.a.x) * 0.15, z: s.a.z + (s.b.z - s.a.z) * 0.15 },
        v = { x: (s.b.x - s.a.x) / s.length, z: (s.b.z - s.a.z) / s.length },
        a = { x: origin.x + (v.x * 14) / u, z: origin.z + (v.z * 14) / u },
        b = { x: origin.x + (v.x * 28) / u, z: origin.z + (v.z * 28) / u };
      const result = tryPoints(
        variantId === 'reciprocal' ? { origin: b, a, b: origin } : { origin, a, b }
      );
      if (result) return result;
      if (++attempts >= 30) break;
    }
  if (variantId === 'dogleg')
    for (let i = 0; i < Math.min(60, segments.length); i++)
      for (let j = i + 1; j < Math.min(60, segments.length); j++) {
        const a = segments[i],
          b = segments[j],
          av = { x: a.b.x - a.a.x, z: a.b.z - a.a.z },
          bv = { x: b.b.x - b.a.x, z: b.b.z - b.a.z },
          cross = av.x * bv.z - av.z * bv.x;
        if (Math.abs(cross) / (a.length * b.length) < 0.55) continue;
        const d = { x: b.a.x - a.a.x, z: b.a.z - a.a.z },
          t = (d.x * bv.z - d.z * bv.x) / cross,
          q = (d.x * av.z - d.z * av.x) / cross;
        if (t < -0.02 || t > 1.02 || q < -0.02 || q > 1.02) continue;
        const origin = { x: a.a.x + av.x * t, z: a.a.z + av.z * t },
          pa = distance(origin, a.a) > distance(origin, a.b) ? a.a : a.b,
          pb = distance(origin, b.a) > distance(origin, b.b) ? b.a : b.b;
        if (distance(origin, pa) * u < 20 || distance(origin, pb) * u < 20) continue;
        const along = (p) => ({
            x: origin.x + (((p.x - origin.x) / distance(origin, p)) * 18) / u,
            z: origin.z + (((p.z - origin.z) / distance(origin, p)) * 18) / u,
          }),
          result = tryPoints({ origin, a: along(pa), b: along(pb) });
        if (result) return result;
        if (++attempts >= 30) break;
      }
  throw Error(
    'No short connected survey with two visible controls and a supported entrance approach was found here. Choose another loaded location; streets and buildings stay in place.'
  );
}

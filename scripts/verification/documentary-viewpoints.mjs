import { targetFromIntersection } from '../../app/js/interaction/world-click-router.js';
// Verification-only geometric admission. Proposed eye points are queried with
// rays; no actor/camera pose or scene object is changed. Actual shutter evidence
// is obtained later from real walking and the existing rendered camera.
export function chooseDocumentaryViewpoints(ctx, expectedId = null) {
  const T = globalThis.THREE,
    u = ctx.METERS_PER_WORLD_UNIT || 1.11,
    actor = ctx.Walk.state.walker,
    visible = (o) => {
      for (let p = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    },
    roots = ctx.scene.children.filter(visible),
    ray = new T.Raycaster(),
    up = new T.Vector3(0, 1, 0),
    pick = (hit) => {
      const target = targetFromIntersection(hit);
      return target?.kind === 'building' ? target.id : null;
    },
    inside = (p, pts) => {
      let result = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i],
          b = pts[j];
        if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
          result = !result;
      }
      return result;
    },
    candidates = ctx.buildings
      .filter(
        (b) =>
          b.sourceBuildingId &&
          b.pts?.length >= 3 &&
          (!expectedId || b.sourceBuildingId === expectedId)
      )
      .map((b) => ({
        ...b,
        c: b.pts.reduce((a, p) => ({ x: a.x + p.x / b.pts.length, z: a.z + p.z / b.pts.length }), {
          x: 0,
          z: 0,
        }),
      }))
      .filter((b) => Math.hypot(b.c.x - actor.x, b.c.z - actor.z) * u < 180)
      .sort(
        (a, b) =>
          Math.hypot(a.c.x - actor.x, a.c.z - actor.z) -
          Math.hypot(b.c.x - actor.x, b.c.z - actor.z)
      )
      .slice(0, 12);
  let probes = 0;
  const stand = (p) => {
    const ground = ctx.SurfaceQuery.walkAt(p.x, p.z),
      y = ground?.position?.y,
      water = ctx.SurfaceQuery.waterAt?.(p.x, p.z);
    if (
      !Number.isFinite(y) ||
      (water?.feature && water.position.y > y - 0.1) ||
      ctx.checkBuildingCollision(p.x, p.z, 0.45 / u, { actorBaseY: y, actorHeight: 1.8 }).collision
    )
      return null;
    if (
      ctx.buildings.some(
        (b) =>
          b.pts?.length >= 3 &&
          Math.hypot((b.pts[0].x || 0) - p.x, (b.pts[0].z || 0) - p.z) < 150 &&
          inside(p, b.pts)
      )
    )
      return null;
    return { ...p, y: y + ctx.Walk.CFG.eyeHeight };
  };
  const inspect = (p, target, id) => {
    if (++probes > 500) throw Error('Bounded photo-viewpoint admission exceeded 500 ray plans.');
    const eye = new T.Vector3(p.x, p.y, p.z),
      forward = new T.Vector3(target.x, target.y, target.z).sub(eye).normalize(),
      right = forward.clone().cross(up).normalize(),
      vertical = right.clone().cross(forward).normalize(),
      tan = Math.tan((ctx.camera.fov * Math.PI) / 360);
    const hits = [
      [0, 0],
      [-0.55, 0],
      [0.55, 0],
      [0, 0.45],
      [0, -0.45],
    ].map(([x, y]) => {
      const direction = forward
        .clone()
        .addScaledVector(right, x * tan * ctx.camera.aspect)
        .addScaledVector(vertical, y * tan)
        .normalize();
      ray.set(eye, direction);
      ray.near = 0.5;
      ray.far = 180 / u;
      return ray
        .intersectObjects(roots, true)
        .find(
          (h) =>
            visible(h.object) &&
            !h.object.isSprite &&
            h.object.material?.depthTest !== false &&
            !(h.object.material?.transparent && h.object.material.opacity < 0.2)
        );
    });
    if (pick(hits[0]) !== id) return null;
    return {
      ...p,
      range: hits[0].distance * u,
      bearing: Math.atan2(hits[0].point.x - p.x, hits[0].point.z - p.z),
      coverage: hits.filter((h) => pick(h) === id).length / 5,
    };
  };
  for (const b of candidates) {
    const edges = b.pts
      .map((a, i) => {
        const c = b.pts[(i + 1) % b.pts.length],
          dx = c.x - a.x,
          dz = c.z - a.z,
          n = Math.hypot(dx, dz);
        let nx = -dz / (n || 1),
          nz = dx / (n || 1);
        const x = (a.x + c.x) / 2,
          z = (a.z + c.z) / 2;
        if (nx * (b.c.x - x) + nz * (b.c.z - z) > 0) {
          nx = -nx;
          nz = -nz;
        }
        return { x, z, n, nx, nz, tx: dx / (n || 1), tz: dz / (n || 1) };
      })
      .filter((e) => e.n * u >= 5 && e.n * u < 80)
      .sort(
        (a, b) =>
          Math.hypot(a.x - actor.x, a.z - actor.z) - Math.hypot(b.x - actor.x, b.z - actor.z)
      )
      .slice(0, 4);
    for (const edge of edges)
      for (const sign of [1, -1]) {
        const ground = ctx.SurfaceQuery.walkAt(edge.x + edge.nx, edge.z + edge.nz)?.position?.y;
        if (!Number.isFinite(ground)) continue;
        const target = {
            x: edge.x - edge.nx * 0.15,
            y: ground + 2.4 / u,
            z: edge.z - edge.nz * 0.15,
          },
          point = (normal, along) =>
            stand({
              x: edge.x + (edge.nx * normal) / u + (edge.tx * along) / u,
              z: edge.z + (edge.nz * normal) / u + (edge.tz * along) / u,
            });
        for (const normal of [6, 10, 14]) {
          const a = point(normal, sign * 24),
            d = point(Math.min(normal, 8), 0),
            c = point(normal, -sign * 36);
          if (!a || !d || !c) continue;
          const context = inspect(a, target, b.sourceBuildingId),
            detail = inspect(d, target, b.sourceBuildingId),
            setting = inspect(c, target, b.sourceBuildingId);
          if (
            !context ||
            !detail ||
            !setting ||
            context.range < 12 ||
            detail.range > context.range * 0.72 ||
            setting.range < context.range * 0.9 ||
            setting.coverage > 0.8
          )
            continue;
          if (
            Math.hypot(context.x - detail.x, context.z - detail.z) * u < 6 ||
            Math.hypot(context.x - setting.x, context.z - setting.z) * u < 6
          )
            continue;
          return {
            subjectId: b.sourceBuildingId,
            name: b.tags?.name || b.name || 'Mapped building',
            target,
            viewpoints: { context, detail, setting },
            probes,
          };
        }
      }
  }
  throw Error('No clear, supported three-view frontage was admitted near this source arrival.');
}

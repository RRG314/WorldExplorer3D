import { createBuildingCollisionQuery } from '../../app/js/physics/building-collision.js?v=5';
// Verification-only route planning. It reads the existing collision/surface
// owners and returns waypoints; the driver must still walk every segment.
export function planFieldworkWalk(
  runtime,
  destination,
  { spacingMeters = 0.8, maximumCells = 10000, paddingMeters = 8, stepHeightMeters = 0, includeUrbanActors = false } = {}
) {
  const actor = runtime.Walk.state.walker,
    u = runtime.METERS_PER_WORLD_UNIT || 1.11,
    step = spacingMeters / u,
    pad = paddingMeters / u,
    minX = Math.min(actor.x, destination.x) - pad,
    minZ = Math.min(actor.z, destination.z) - pad,
    cols = Math.ceil((Math.abs(destination.x - actor.x) + pad * 2) / step) + 1,
    rows = Math.ceil((Math.abs(destination.z - actor.z) + pad * 2) / step) + 1;
  if (cols * rows > maximumCells)
    throw Error('The verification walking route exceeds its bounded area.');
  const collision = createBuildingCollisionQuery(runtime),
    samples = new Map(),
    key = (x, z) => z * cols + x,
    point = (index) => ({
      x: minX + (index % cols) * step,
      z: minZ + Math.floor(index / cols) * step,
    });
  let sampledKind = null;
  const height = (p) => {
    const ground = runtime.SurfaceQuery.walkAt(p.x, p.z),
      y = ground?.position?.y,
      water = runtime.SurfaceQuery.waterAt?.(p.x, p.z);
    sampledKind = ground?.kind;
    if (
      !Number.isFinite(y) ||
      (water?.feature && water.position.y > y - 0.1) ||
      collision(p.x, p.z, 0.45 / u, { actorBaseY: y, actorHeight: 2 / u }).collision
    )
      return null;
    return y;
  };
  const heightAt = (index) => {
    if (!samples.has(index)) samples.set(index, height(point(index)));
    return samples.get(index);
  };
  const clear = (a, b) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z) * u,
      n = Math.max(1, Math.ceil(length / 0.25));
    const first = runtime.SurfaceQuery.walkAt(a.x, a.z);
    if(includeUrbanActors&&typeof runtime.resolveUrbanActorCollision==='function'){const hit=runtime.resolveUrbanActorCollision(a,b,{mode:'walk',radius:.4/u,actorBaseY:first?.position?.y+(runtime.Walk?.CFG?.eyeHeight||1.7),actorHeight:1.8});if(hit.collision&&Math.hypot(hit.x-b.x,hit.z-b.z)>1e-6)return false;}
    let prior = first?.position?.y,
      priorKind = first?.kind;
    if (!Number.isFinite(prior)) return false;
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        y = height({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      const stepAllowed =
        ['road', 'path', 'sidewalk', 'pavement'].includes(priorKind) ||
        ['road', 'path', 'sidewalk', 'pavement'].includes(sampledKind)
          ? stepHeightMeters
          : 0;
      if (y === null || Math.abs(y - prior) * u > Math.max(stepAllowed, 0.25 * (length / n || 1)))
        return false;
      prior = y;
      priorKind = sampledKind;
    }
    return true;
  };
  if (clear(actor, destination)) return [destination];
  const cell = (p) => key(Math.round((p.x - minX) / step), Math.round((p.z - minZ) / step)),
    start = cell(actor),
    goal = cell(destination),
    open = new Set([start]),
    came = new Map(),
    scores = new Map([[start, 0]]),
    closed = new Set(),
    heuristic = (index) => {
      const p = point(index);
      return Math.hypot(p.x - destination.x, p.z - destination.z);
    };
  for (let iterations = 0; open.size && iterations < maximumCells; iterations++) {
    let current = null,
      best = Infinity;
    for (const index of open) {
      const score = scores.get(index) + heuristic(index);
      if (score < best) {
        best = score;
        current = index;
      }
    }
    if (
      current === goal ||
      (heuristic(current) * u <= spacingMeters * 1.5 && clear(point(current), destination))
    ) {
      const route = [destination];
      let node = current;
      while (node !== start) {
        route.push(point(node));
        node = came.get(node);
      }
      route.reverse();
      if (!clear(actor, route[0]))
        throw Error('No clear exit from the current verification position.');
      const result = [];
      let from = actor;
      for (let i = 0; i < route.length; ) {
        let next = i;
        while (next + 1 < route.length && clear(from, route[next + 1])) next++;
        result.push(route[next]);
        from = route[next];
        i = next + 1;
      }
      return result;
    }
    open.delete(current);
    closed.add(current);
    const x = current % cols,
      z = Math.floor(current / cols),
      a = current === start ? actor : point(current),
      ay =
        current === start
          ? runtime.SurfaceQuery.walkAt(actor.x, actor.z)?.position?.y
          : heightAt(current);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const next = key(nx, nz);
      if (closed.has(next)) continue;
      const by = heightAt(next);
      if (
        by === null ||
        (Math.abs(by - ay) * u) / (spacingMeters * Math.hypot(dx, dz)) > 0.25 ||
        !clear(a, point(next))
      )
        continue;
      const score = scores.get(current) + step * Math.hypot(dx, dz);
      if (score < (scores.get(next) ?? Infinity)) {
        came.set(next, current);
        scores.set(next, score);
        open.add(next);
      }
    }
  }
  throw Error(
    'No supported, dry verification walking route was found around the existing obstacles.'
  );
}

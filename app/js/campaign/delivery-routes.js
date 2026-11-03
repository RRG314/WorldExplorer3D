import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { roadWidthAtSegment } from '../world/road-cross-section-profile.js?v=1';
import { isGroundRoad, createRoadsidePlacementResolver } from '../world/roadside-placement.js';
import { findTraversalRoute, findNearestTraversalFeature } from '../world/traversal.js?v=4';

export function deliveryFixtureClear(x, z, fixtures = []) {
  return !fixtures.some(object => {
    const p=object?.userData?.furniturePos||object?.position;
    return Number.isFinite(p?.x)&&Number.isFinite(p?.z)&&Math.hypot(p.x-x,p.z-z)<3;
  });
}

// Admission is explicit and bounded: connected drive graph, then the same
// physical surfaces used by the vehicle. No edits to roads, bridges or terrain.
function clearAt(ctx, x, y, z, radius = 1.1) {
  return ctx.checkBuildingCollision?.(x, z, radius, { actorBaseY: y + .1, actorHeight: 2.2 })?.collision !== true;
}
function roadAt(ctx, x, z, y) {
  const sample = ctx.SurfaceQuery?.driveAt?.(x, z, { currentY: y, preferRoad: true });
  return sample?.kind === 'road' && Number.isFinite(sample.position?.y) ? sample : null;
}
export function findVehicleLoadingStop(ctx, placement, roadY) {
  const dx=placement.x-placement.centerX,dz=placement.z-placement.centerZ,length=Math.hypot(dx,dz);
  const width=roadWidthAtSegment(placement.road,placement.segmentIndex,.5);
  const offset=Math.max(0,Math.min(7.5,width/2-1.4,length-2.7));
  // Cross sections may taper around a junction. Probe the published physical
  // surface, choosing the supported position nearest the verge, not its nominal width.
  for(const factor of [1,.66,.33,0]){
    const x=placement.centerX+dx/Math.max(length,.001)*offset*factor,z=placement.centerZ+dz/Math.max(length,.001)*offset*factor;
    if(Math.hypot(x-placement.x,z-placement.z)>7.5)continue;
    const stop=roadAt(ctx,x,z,roadY);
    if(stop&&clearAt(ctx,x,stop.position.y,z,1.3))return {x,y:stop.position.y,z};
  }
  return null;
}
function curb(ctx, anchor, roadside, diagnostic) {
  const reject=reason=>{diagnostic[reason]=(diagnostic[reason]||0)+1;return null;};
  if (!anchor?.feature || !anchor.p1 || !anchor.p2) return reject('no-road-anchor');
  const f=anchor.feature,tags=f.tags||{};
  if(!isGroundRoad(f)||/motorway|trunk/.test(f.highway||tags.highway||f.type||''))return reject('unsupported-loading-street');
  const dx=anchor.p2.x-anchor.p1.x,dz=anchor.p2.z-anchor.p1.z,length=Math.max(.001,Math.hypot(dx,dz));
  for(const along of [0,-12,12,-24,24]){
    const placement=roadside.resolve({x:anchor.pt.x+dx/length*along,z:anchor.pt.z+dz/length*along},{maxMove:26});
    if(!placement){reject('no-clear-verge');continue;}
    const road=roadAt(ctx,placement.centerX,placement.centerZ,undefined);
    if(!road){reject('no-physical-road');continue;}
    const walk=ctx.SurfaceQuery?.walkAt?.(placement.x,placement.z,{currentY:road.position.y,sampleRenderedMesh:true});
    const y=walk?.position?.y;
    if(!Number.isFinite(y)||Math.abs(y-road.position.y)>.65){reject('verge-height');continue;}
    if(ctx.isPointInsideWaterFootprint?.(placement.x,placement.z)===true||!clearAt(ctx,placement.x,y,placement.z,.8)){reject('verge-obstructed');continue;}
    const stop=findVehicleLoadingStop(ctx,placement,road.position.y);
    if(!stop){reject('loading-stop-obstructed');continue;}
    return {...placement,y,road:stop};
  }
  return null;
}
export function validatePhysicalDeliveryRoute(ctx, input, diagnostic = {}) {
  const reject = (reason) => {
    diagnostic[reason] = (diagnostic[reason] || 0) + 1;
    return null;
  };
  if (!Array.isArray(input) || input.length < 2 || input.length > 300)
    return reject('no-connected-path');
  const units = ctx.METERS_PER_WORLD_UNIT || 1.11;
  const points = [];
  let distance = 0,
    turns = 0,
    lastAngle = null,
    lastY;
  for (let i = 1; i < input.length; i++) {
    const a = input[i - 1],
      b = input[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!Number.isFinite(length) || length > 700) return null;
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    if (
      lastAngle !== null &&
      Math.abs(Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle))) > 0.55
    )
      turns++;
    lastAngle = angle;
    const steps = Math.max(1, Math.ceil((length * units) / 7));
    for (let j = i === 1 ? 0 : 1; j <= steps; j++) {
      const t = j / steps,
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t;
      const hit = roadAt(ctx, x, z, lastY);
      if (!hit) return reject('route-road-gap');
      if (!clearAt(ctx, x, hit.position.y, z)) return reject('route-obstructed');
      const p = { x, y: hit.position.y, z };
      const prev = points.at(-1);
      const d = prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : 0;
      if (prev && d > 0.01 && Math.abs(p.y - prev.y) / d > 0.22) return reject('route-grade');
      points.push(p);
      lastY = p.y;
      distance += d * units;
      if (distance > 2500) return null;
    }
  }
  if (distance < 100) return null;
  // Keep corners and ~20 m gates; no every-frame persistence or giant saves.
  const gates = [points[0]];
  for (let i = 1; i < points.length - 1; i++)
    if (Math.hypot(points[i].x - gates.at(-1).x, points[i].z - gates.at(-1).z) >= 19 / units)
      gates.push(points[i]);
  if (Math.hypot(points.at(-1).x - gates.at(-1).x, points.at(-1).z - gates.at(-1).z) > 2 / units)
    gates.push(points.at(-1));
  if (gates.length > 160) return null;
  return { points: gates, distance: Math.round(distance), turns, distanceUnits: 'm' };
}
export function buildDeliveryOffers(ctx, identity, dependencies = {}) {
  const diagnostic = dependencies.diagnostic || {};
  diagnostic.ready = ctx.initialEarthWorldReady === true;
  diagnostic.environment = ctx.getEnv?.();
  diagnostic.loading = !!ctx.worldLoading;
  if (
    ctx.getLiveGpsSnapshot?.().active === true ||
    ctx.getEnv?.() !== 'EARTH' ||
    !ctx.initialEarthWorldReady ||
    ctx.worldLoading ||
    !identity.regionId
  )
    return [];
  const frame = earthCoordinateFrame(ctx.LOC, ctx.SCALE);
  // This authored opening branch currently serves the loaded Baltimore area.
  if (Math.hypot((ctx.LOC.lat - 39.29) * 111000, (ctx.LOC.lon + 76.61) * 86000) > 10000) return [];
  const nearest = dependencies.nearest || findNearestTraversalFeature,
    route = dependencies.route || findTraversalRoute;
  const actor = ctx.Walk?.state?.mode === 'walk' ? ctx.Walk.state.walker : ctx.car;
  if (!actor) return [];
  const roadside = createRoadsidePlacementResolver(ctx.roads, {
    blocked: (x, z) =>
      !deliveryFixtureClear(x, z, ctx.streetFurnitureMeshes) ||
      ctx.isPointInsideWaterFootprint?.(x, z) === true ||
      !clearAt(ctx, x, ctx.SurfaceQuery?.walkAt?.(x, z)?.position?.y || 0, z, 0.8),
  });
  const start = curb(
    ctx,
    nearest(actor.x, actor.z, { mode: 'drive', maxDistance: 90 }),
    roadside,
    diagnostic
  );
  if (!start) return [];
  const candidates = (ctx.pois || [])
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z) && p.name)
    .map((p) => ({ ...p, d: Math.hypot(p.x - start.x, p.z - start.z) }))
    .filter((p) => p.d >= 180 && p.d <= 1000)
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
  diagnostic.candidates = candidates.length;
  const offers = [],
    seen = new Set();
  for (const target of candidates) {
    const finish = curb(
      ctx,
      nearest(target.x, target.z, { mode: 'drive', maxDistance: 60 }),
      roadside,
      diagnostic
    );
    if (!finish) continue;
    const key = `${Math.round(finish.x / 30)},${Math.round(finish.z / 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const path = route(start.road.x, start.road.z, finish.road.x, finish.road.z, {
      mode: 'drive',
      maxAnchorDistance: 8,
    });
    const physical = validatePhysicalDeliveryRoute(ctx, path?.points, diagnostic);
    if (!physical) continue;
    const geo = (p) => ({ ...frame.toGeographic(p.x, p.z), y: p.y });
    offers.push({
      id: `harbor:${key}`,
      environment: 'EARTH',
      ...identity,
      destinationLabel: `Roadside near ${String(target.name).slice(0, 90)}`,
      pickup: geo(start.road),
      dropoff: geo(finish.road),
      pickupCase: geo(start),
      dropoffCase: geo(finish),
      caseYaw: start.yaw,
      points: physical.points.map(geo),
      distance: physical.distance,
      distanceUnits: 'm',
      turns: physical.turns,
    });
    if (offers.length === 2) break;
  }
  return offers.sort((a, b) => a.distance - b.distance);
}

export function buildReturnDeliveryOffer(ctx, identity, original, dependencies = {}) {
  const diagnostic = dependencies.diagnostic || {},
    reject = (reason) => {
      diagnostic[reason] = (diagnostic[reason] || 0) + 1;
      return null;
    };
  if (
    !original ||
    original.regionId !== identity.regionId ||
    ctx.getEnv?.() !== 'EARTH' ||
    !ctx.initialEarthWorldReady ||
    ctx.worldLoading ||
    ctx.activeInterior ||
    ctx.getLiveGpsSnapshot?.().active
  )
    return reject('return-location-not-ready');
  const frame = earthCoordinateFrame(ctx.LOC, ctx.SCALE),
    at = (p) => ({ ...frame.toWorld(p.lat, p.lon), y: p.y }),
    pickup = at(original.dropoff),
    dropoff = at(original.pickup),
    pickupCase = at(original.dropoffCase),
    dropoffCase = at(original.pickupCase);
  const stop = (p) => {
    const hit = roadAt(ctx, p.x, p.z, p.y);
    return hit &&
      Math.abs(hit.position.y - p.y) < 2.5 &&
      clearAt(ctx, p.x, hit.position.y, p.z, 1.3)
      ? { ...p, y: hit.position.y }
      : null;
  };
  const caseAt = (p) => {
    const hit = ctx.SurfaceQuery?.walkAt?.(p.x, p.z, { currentY: p.y, sampleRenderedMesh: true }),
      y = hit?.position?.y;
    return Number.isFinite(y) &&
      Math.abs(y - p.y) < 0.65 &&
      deliveryFixtureClear(p.x, p.z, ctx.streetFurnitureMeshes) &&
      ctx.isPointInsideWaterFootprint?.(p.x, p.z) !== true &&
      clearAt(ctx, p.x, y, p.z, 0.8)
      ? { ...p, y }
      : null;
  };
  const a = stop(pickup),
    b = stop(dropoff),
    ca = caseAt(pickupCase),
    cb = caseAt(dropoffCase);
  if (!a || !b || !ca || !cb) return reject('original-case-stop-unavailable');
  const route = dependencies.route || findTraversalRoute,
    path = route(a.x, a.z, b.x, b.z, { mode: 'drive', maxAnchorDistance: 8 }),
    physical = validatePhysicalDeliveryRoute(ctx, path?.points, diagnostic);
  if (!physical) return reject('no-supported-return-drive');
  const geo = (p) => ({ ...frame.toGeographic(p.x, p.z), y: p.y });
  return {
    id: `return:${original.id}`,
    environment: 'EARTH',
    ...identity,
    destinationLabel: 'Original field base',
    continuationOf: original.id,
    caseId: `field-case:${original.id}`,
    pickup: geo(a),
    dropoff: geo(b),
    pickupCase: geo(ca),
    dropoffCase: geo(cb),
    caseYaw: original.caseYaw || 0,
    points: physical.points.map(geo),
    distance: physical.distance,
    distanceUnits: 'm',
    turns: physical.turns,
  };
}

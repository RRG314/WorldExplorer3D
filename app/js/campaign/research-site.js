import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { createBuildingCollisionQuery } from '../physics/building-collision.js?v=5';
import { isGroundStreet } from '../world/compiler/street-frontage-policy.js';
function segmentDistance(point, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1))
    );
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}
// Read existing ground and collision facts. This never flattens terrain or modifies a road/building.
export function qualifyResearchSite(
  runtime,
  {
    id,
    name,
    location,
    existingSite = null,
    offsets = { a: { x: -10, z: 0 }, b: { x: 10, z: 0 }, bench: { x: 0, z: 10 } },
    radiusMeters = 18,
    eligibility = null
  } = {}
) {
  if (
    !runtime.gameStarted ||
    runtime.worldLoading ||
    runtime.getEnv?.() !== 'EARTH' ||
    !runtime.worldPublication?.requestId ||
    !runtime.SurfaceQuery?.driveAt
  )
    throw Error('Open a supported Earth location before starting fieldwork.');
  const unit = runtime.METERS_PER_WORLD_UNIT || 1.11,
    frame = earthCoordinateFrame(runtime.LOC, runtime.SCALE),
    building = createBuildingCollisionQuery(runtime),
    roadSegments = [];
  const actor = runtime.Walk?.state?.walker;
  if (!actor) throw Error('Enter walking mode before beginning the field course.');
  const paths = (runtime.linearFeatures || []).filter(
      (feature) =>
        ['footway', 'cycleway', 'track', 'path', 'stairs'].includes(feature.kind) &&
        isGroundStreet(feature)
    ),
    pathSegments = [];
  for (const [features, segments] of [
    [runtime.roads || [], roadSegments],
    [paths, pathSegments]
  ])
    for (const road of features) {
      const points = road.pts || [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        if (
          Math.min(a.x, b.x) > actor.x + 150 / unit ||
          Math.max(a.x, b.x) < actor.x - 150 / unit ||
          Math.min(a.z, b.z) > actor.z + 150 / unit ||
          Math.max(a.z, b.z) < actor.z - 150 / unit
        )
          continue;
        segments.push({ a, b, half: ((Number(road.width) || 6) * unit) / 2 });
      }
    }
  let lastReason = 'The ground or clearance is not ready.';
  const reject = (message) => {
    lastReason = message;
    return null;
  };
  const ground = (x, z, radius = 0.5) => {
    const sample = runtime.SurfaceQuery.driveAt(x, z, { preferRoad: false });
    if (
      sample?.kind !== 'terrain' ||
      !Number.isFinite(sample.position?.y) ||
      (sample.provenance?.confidence ?? 0) < 0.3
    )
      return reject('The saved ground is not available with enough detail yet.');
    const water = runtime.SurfaceQuery.waterAt?.(x, z);
    if (
      water?.feature &&
      Number.isFinite(water.position?.y) &&
      water.position.y > sample.position.y - 0.1
    )
      return reject('Water covers part of the training area.');
    if (
      building(x, z, radius / unit, { actorBaseY: sample.position.y, actorHeight: 3 / unit })
        .collision
    )
      return reject('A building, tree or solid object occupies the training area.');
    return { x, z, y: sample.position.y };
  };
  function check(center, prior) {
    if (
      roadSegments.some(
        (row) => segmentDistance(center, row.a, row.b) * unit < radiusMeters + row.half + 3
      )
    )
      return reject('The training area is too close to a mapped road.');
    if (!ground(center.x, center.z, radiusMeters)) return null;
    const points = {};
    for (const [key, offset] of Object.entries(offsets)) {
      const projected = prior
        ? frame.toWorld(prior.points[key].lat, prior.points[key].lon)
        : { x: center.x + offset.x / unit, z: center.z + offset.z / unit };
      // Walking routes may pass between stations. Props and their approach space
      // must stay outside every mapped pedestrian corridor.
      if (
        pathSegments.some(
          (row) =>
            segmentDistance(projected, row.a, row.b) * unit <
            row.half + (key === 'bench' ? 1.5 : 3.5)
        )
      )
        return reject('A mapped walking path crosses this training station.');
      const target = ground(projected.x, projected.z, 2.8);
      if (!target) return null;
      points[key] = target;
      const length = Math.hypot(target.x - center.x, target.z - center.z) * unit,
        steps = Math.max(1, Math.ceil(length / 2));
      let previous = ground(center.x, center.z);
      for (let step = 1; step <= steps; step++) {
        const t = step / steps,
          current = ground(
            center.x + (target.x - center.x) * t,
            center.z + (target.z - center.z) * t,
            0.6
          );
        if (!current) return null;
        if ((Math.abs(current.y - previous.y) * unit) / (length / steps || 1) > 0.25)
          return reject('The approach between training stations is too steep.');
        previous = current;
      }
    }
    if (eligibility) {
      const result = eligibility(runtime, {
        points,
        center,
        metersPerUnit: unit,
        ground: (x, z, radius = 0.5) => {
          if (
            pathSegments.some(
              (row) => segmentDistance({ x, z }, row.a, row.b) * unit < row.half + radius + 1
            )
          )
            return reject('A mapped path crosses a habitat footprint.');
          return ground(x, z, radius);
        }
      });
      if (result !== true)
        return reject(
          typeof result === 'string'
            ? result
            : 'This habitat is not suited to the selected field study.'
        );
    }
    return points;
  }
  if (existingSite) {
    const center = frame.toWorld(existingSite.location.lat, existingSite.location.lon),
      points = check(center, existingSite);
    if (!points)
      throw Error(
        'Your saved field site cannot open here. ' +
          lastReason +
          ' Your notes and labelled specimens are kept.'
      );
    return { site: existingSite, points, center: ground(center.x, center.z), metersPerUnit: unit };
  }
  for (let ring = 20; ring <= 100; ring += 10)
    for (let angle = 0; angle < 8; angle++) {
      const radians = (angle * Math.PI) / 4,
        center = {
          x: actor.x + (Math.cos(radians) * ring) / unit,
          z: actor.z + (Math.sin(radians) * ring) / unit
        },
        points = check(center);
      if (!points) continue;
      const origin = frame.toGeographic(center.x, center.z);
      return {
        site: {
          id,
          name,
          truthType: 'virtual-training-site',
          location: origin,
          points: Object.fromEntries(
            Object.entries(points).map(([key, p]) => [key, frame.toGeographic(p.x, p.z)])
          ),
          locationContext: location
            ? {
                lat: location.lat,
                lon: location.lon,
                name: String(location.name || name || 'Selected location').slice(0, 120)
              }
            : null
        },
        points,
        center: ground(center.x, center.z),
        metersPerUnit: unit
      };
    }
  throw Error(
    'No clear, dry field area was found here. ' +
      lastReason +
      ' Choose another training location; roads and buildings stay in place.'
  );
}
export function researchStationEvidence(runtime, qualified, target, now = Date.now()) {
  const actor = runtime.Walk?.state?.walker,
    point = qualified.points[target];
  if (!actor || !point) throw Error('This station is unavailable.');
  const frame = earthCoordinateFrame(runtime.LOC, runtime.SCALE),
    sample = runtime.SurfaceQuery?.walkAt?.(actor.x, actor.z, { currentY: actor.y });
  return {
    environment: runtime.getEnv?.(),
    travelMode: runtime.getCurrentTravelMode?.(),
    liveGps: runtime.getLiveGpsSnapshot?.().active === true,
    siteId: qualified.site.id,
    position: frame.toGeographic(actor.x, actor.z),
    supported: Number.isFinite(sample?.position?.y),
    verticalDistance: (actor.y - Number(sample?.position?.y)) * qualified.metersPerUnit,
    at: now
  };
}

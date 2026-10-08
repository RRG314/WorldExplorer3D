import { polylineDistances } from '../../structure-semantics/geometry.js?v=2';
import { sampleTransportSurfaceAtDistance } from './transport-surface-model.js?v=25';
import { compileConnectedWallOpenings, tunnelWallIsOpen } from './tunnel-junction-openings.js';

// One immutable publication owns the visible cut, terrain queries and walls.
// Ordinary streets continue to drape; only a compiled engineered approach can
// excavate. This runs after the final uncut terrain mesh has been published.
export function compileEngineeredApproachExcavation(feature, sampleTerrain, {roadCover=[]} = {}) {
  if (feature?.structureSemantics?.terrainMode !== 'at_grade' ||
      feature.transportSurfaceModel?.engineeredApproach !== true ||
      feature.transportRecord?.routeState === 'incomplete' ||
      !Array.isArray(feature.pts) || feature.pts.length < 2 || typeof sampleTerrain !== 'function') return null;
  const path = polylineDistances(feature.pts);
  if (!(path.total > .1)) return null;
  const halfWidth = Math.max(3.4, Number(feature.width) || 6) * .5 + .02;
  const wallOpenings = compileConnectedWallOpenings(feature, { allowSurfaceApproaches: true });
  const stations = new Set([0, path.total, ...path.distances, ...feature.transportSurfaceModel.distances]);
  for (let d = 2; d < path.total; d += 2) stations.add(d);
  for (const opening of wallOpenings) { stations.add(opening.start); stations.add(opening.end); }
  const cover=roadCover.filter(limit=>Number.isFinite(limit.maximumSurfaceY)&&Number.isFinite(limit.start)&&Number.isFinite(limit.end)&&limit.end>limit.start);
  for(const limit of cover){stations.add(Math.max(0,limit.start-.05));stations.add(Math.min(path.total,limit.end+.05));}
  let segment = 0;
  const rings = [...stations].filter(d => d >= 0 && d <= path.total).sort((a, b) => a - b).map(distance => {
    while (segment < feature.pts.length - 2 && path.distances[segment + 1] < distance) segment++;
    const a = feature.pts[segment], b = feature.pts[segment + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const t = (distance - path.distances[segment]) / length;
    const tangentX = (b.x - a.x) / length, tangentZ = (b.z - a.z) / length;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const y = sampleTransportSurfaceAtDistance(feature.transportSurfaceModel, distance, 0);
    const terrainY = sampleTerrain(x, z);
    const left = sampleTerrain(x - tangentZ * halfWidth, z + tangentX * halfWidth);
    const right = sampleTerrain(x + tangentZ * halfWidth, z - tangentX * halfWidth);
    if (![y, terrainY, left, right].every(Number.isFinite)) return null;
    // A wall can support the upper road but cannot protrude through it. Use
    // the same capped rings for visual faces and collider heights. This is
    // independent of the headroom needed to excavate terrain under that road.
    let wallCeiling=Infinity;
    for(const limit of cover)if(distance>=limit.start-.05-1e-6 && distance<=limit.end+.05+1e-6 && limit.maximumSurfaceY>y+.18)
      wallCeiling=Math.min(wallCeiling,limit.maximumSurfaceY-.08);
    return Object.freeze({ distance, x, y, z, tangentX, tangentZ, terrainY,
      leftGroundY: left, rightGroundY: right,
      leftTerrainY: Math.max(y, Math.min(left + .08,wallCeiling)), rightTerrainY: Math.max(y, Math.min(right + .08,wallCeiling)) });
  });
  // A missing terrain sample must not be bridged by an invented excavation.
  if (rings.some(r => !r)) return null;
  const masks = [], walls = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (!(length > .001)) continue;
    const tx = dx / length, tz = dz / length, mid = (a.distance + b.distance) * .5;
    const roof = Math.max(a.terrainY - a.y, b.terrainY - b.y,
      a.leftGroundY - a.y, b.leftGroundY - b.y, a.rightGroundY - a.y, b.rightGroundY - b.y,
      sampleTerrain((a.x + b.x) * .5, (a.z + b.z) * .5) - (a.y + b.y) * .5);
    if (roof < -.02) continue;
    let ceiling=Infinity;
    for(const limit of cover){
      // Only a physically separate road above usable vehicle headroom owns
      // cover. A same-level connected approach remains an open excavation.
      if(mid>=limit.start-.05&&mid<=limit.end+.05&&limit.maximumSurfaceY-Math.max(a.y,b.y)>=3.4)
        ceiling=Math.min(ceiling,limit.maximumSurfaceY-.08);
    }
    const cutHeight=Math.min(Math.max(.1,roof+.2),ceiling-Math.max(a.y,b.y));
    appendCollinearMask(masks, {x:(a.x+b.x)*.5,z:(a.z+b.z)*.5,tangentX:tx,tangentZ:tz,
      roadY:(a.y+b.y)*.5,grade:(b.y-a.y)/length,halfWidth,halfDepth:length*.5+.02,cutHeight,
      ...(Number.isFinite(ceiling)?{protectedCeiling:ceiling}:{})});
    for (const side of [-1, 1]) {
      if (tunnelWallIsOpen({wallOpenings}, side, mid)) continue;
      const topA = side < 0 ? a.rightTerrainY : a.leftTerrainY;
      const topB = side < 0 ? b.rightTerrainY : b.leftTerrainY;
      if (Math.max(topA - a.y, topB - b.y) < .1) continue;
      const nx = -tz * side, nz = tx * side;
      const ax = a.x + nx * halfWidth, az = a.z + nz * halfWidth;
      const bx = b.x + nx * halfWidth, bz = b.z + nz * halfWidth;
      walls.push(Object.freeze({side, start:a.distance, end:b.distance,
        points:Object.freeze([{x:ax,z:az},{x:bx,z:bz},{x:bx+nx*.32,z:bz+nz*.32},{x:ax+nx*.32,z:az+nz*.32}].map(Object.freeze)),
        minY:Math.min(a.y,b.y)-.05,maxY:Math.max(topA,topB)}));
    }
  }
  if (!masks.length) return null;
  return Object.freeze({kind:'engineered_approach_excavation',halfWidth,
    rings:Object.freeze(rings),wallOpenings,masks:Object.freeze(masks.map(Object.freeze)),walls:Object.freeze(walls)});
}

// A straight grade is one cut volume even when terrain/wall sampling requires
// many stations. Keep bends and actual vertical curves separate. The merged
// floor remains within 1 mm of the original profile, inside the terrain-mask
// pavement margin. Error bounds accumulate so gradual curves cannot flatten.
function appendCollinearMask(masks, next) {
  const previous = masks.at(-1);
  if (previous && Math.abs(previous.tangentX-next.tangentX)<1e-7 &&
      Math.abs(previous.tangentZ-next.tangentZ)<1e-7 && previous.halfWidth===next.halfWidth &&
      previous.protectedCeiling===undefined && next.protectedCeiling===undefined) {
    const aLength=previous.halfDepth*2-.04, bLength=next.halfDepth*2-.04;
    const endX=previous.x+previous.tangentX*aLength*.5, endZ=previous.z+previous.tangentZ*aLength*.5;
    const startX=next.x-next.tangentX*bLength*.5, startZ=next.z-next.tangentZ*bLength*.5;
    const startY=previous.roadY-previous.grade*aLength*.5, endY=next.roadY+next.grade*bLength*.5;
    const length=aLength+bLength, grade=(endY-startY)/length;
    const atJoin=startY+grade*aLength;
    const errorBound = (previous.floorError || 0) + Math.abs(atJoin-(previous.roadY+previous.grade*aLength*.5));
    if (errorBound <= .001 && Math.hypot(endX-startX,endZ-startZ)<1e-5 &&
        Math.abs(grade-previous.grade)*aLength<.001 && Math.abs(grade-next.grade)*bLength<.001 &&
        Math.abs(atJoin-(previous.roadY+previous.grade*aLength*.5))<.001 &&
        Math.abs(atJoin-(next.roadY-next.grade*bLength*.5))<.001) {
      previous.x=(previous.x-previous.tangentX*aLength*.5)+previous.tangentX*length*.5;
      previous.z=(previous.z-previous.tangentZ*aLength*.5)+previous.tangentZ*length*.5;
      previous.roadY=(startY+endY)*.5; previous.grade=grade;
      previous.halfDepth=length*.5+.02; previous.cutHeight=Math.max(previous.cutHeight,next.cutHeight); previous.floorError=errorBound;
      return;
    }
  }
  masks.push(next);
}

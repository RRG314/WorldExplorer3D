import { roadTurnFootprint } from '../../terrain/road-surface-geometry.js?v=2';
import { streetPolygonKernel as clip } from './street-polygon-kernel.js';
import * as triangulator from '../../../../functions/vendor/earcut/index.js';
import { resolveStreetSection } from './street-section.js';
import { roadWidthAtSegment } from '../road-cross-section-profile.js?v=1';
const earcut = triangulator.default || globalThis.earcut;
const snap = n => Math.round(n * 1000) / 1000;
const polygon = points => { const ring = points.map(([x,z]) => [snap(x),snap(z)]); return [ring.concat([ring[0]])]; };
const union = parts => parts.length ? clip.union(parts[0], ...parts.slice(1)) : [];
const ringOf = item => item?.pts || item?.footprint || [];
const box = points => ({ minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) });
const intersects = (a, b, pad = 0) => a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minZ <= b.maxZ + pad && a.maxZ >= b.minZ - pad;
const areaPolygon = item => [ringOf(item), ...(item.holeRings || item.holes || [])].map(r => {
  const points = r.map(p => [p.x, p.z]); return points.concat([points[0]]);
});
const groundFeature = f => !f.isStructureConnector && ['at_grade', undefined].includes(f.structureSemantics?.terrainMode) &&
  !f.structureSemantics?.gradeSeparated && !f.structureSemantics?.rampCandidate;
const quad = (a, b, leftA, rightA, leftB = leftA, rightB = rightA) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const nx = (b.z - a.z) / length, nz = -(b.x - a.x) / length;
  return polygon([[a.x + nx * leftA, a.z + nz * leftA], [a.x - nx * rightA, a.z - nz * rightA],
    [b.x - nx * rightB, b.z - nz * rightB], [b.x + nx * leftB, b.z + nz * leftB]]);
};

// All spatial indexing uses world coordinates; dimensions supplied in metres are converted once.
export function prepareStreetPavement({ roads = [], buildings = [], landuses = [], linearFeatures = [], metersPerWorldUnit = 1.11, chunkSize = 64, coverageBounds = null }) {
  const segments = [], paths = [], obstacles = [], mappedAreas = [], buildingEdges = [];
  const tiles = new Map();
  const insert = (kind, value, bounds, pad = 0) => {
    const minX=Math.max(Math.floor((bounds.minX-pad)/chunkSize),coverageBounds ? Math.floor(coverageBounds.minX/chunkSize) : -Infinity);
    const maxX=Math.min(Math.floor((bounds.maxX+pad)/chunkSize),coverageBounds ? Math.ceil(coverageBounds.maxX/chunkSize)-1 : Infinity);
    const minZ=Math.max(Math.floor((bounds.minZ-pad)/chunkSize),coverageBounds ? Math.floor(coverageBounds.minZ/chunkSize) : -Infinity);
    const maxZ=Math.min(Math.floor((bounds.maxZ+pad)/chunkSize),coverageBounds ? Math.ceil(coverageBounds.maxZ/chunkSize)-1 : Infinity);
    for (let ix = minX; ix <= maxX; ix++)
      for (let iz = minZ; iz <= maxZ; iz++) {
        if (coverageBounds && (ix*chunkSize < coverageBounds.minX || (ix+1)*chunkSize > coverageBounds.maxX || iz*chunkSize < coverageBounds.minZ || (iz+1)*chunkSize > coverageBounds.maxZ)) continue;
        const key = `${ix}:${iz}`;
        if (!tiles.has(key)) tiles.set(key, { key, ix, iz, segments: [], joins: [], paths: [], obstacles: [], areas: [], edges: [] });
        tiles.get(key)[kind].push(value);
      }
  };
  for (const building of buildings) {
    const pts = ringOf(building); if (pts.length < 3) continue;
    const item = { polygon: areaPolygon(building), bounds: box(pts) }; obstacles.push(item);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (Math.hypot(a.x - b.x, a.z - b.z) >= 3) buildingEdges.push({ a, b, bounds: box([a, b]) });
    }
  }
  for (const land of landuses) {
    if (ringOf(land).length < 3) continue;
    const item = { polygon: areaPolygon(land), bounds: box(ringOf(land)) };
    const tags = land.tags || {};
    if (['footway','pedestrian'].includes(tags['area:highway']) || (tags.highway === 'pedestrian' && tags.area === 'yes') || (tags.place === 'square' && /^(paved|concrete|concrete:plates|paving_stones|sett|cobblestone)$/.test(tags.surface || ''))) mappedAreas.push(item);
    else if (['water', 'garden', 'park', 'grass', 'forest', 'wood', 'parking'].includes(land.type)) obstacles.push(item);
  }
  for (const road of roads) {
    if (!groundFeature(road) || !Array.isArray(road.pts)) continue;
    const offset = Number(road.transportRecord?.crossSection?.placement?.centerlineOffsetMeters) || 0;
    for (let i=1;i<road.pts.length-1;i++) {
      const point=road.pts[i];
      if (coverageBounds && !intersects(box([point]),coverageBounds,20)) continue;
      const halfWidth=roadWidthAtSegment(road,i,0)/2;
      insert('joins',{road,previous:road.pts[i-1],point,next:road.pts[i+1],halfWidth,offset},box([point]),halfWidth+Math.abs(offset)+9/metersPerWorldUnit);
    }
    for (let index = 0; index < road.pts.length - 1; index++) {
      const a = road.pts[index], b = road.pts[index + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01 || (coverageBounds && !intersects(box([a,b]), coverageBounds, Math.max(road.width || 8, 20)))) continue;
      // Preserve interior width constraints instead of replacing them with an endpoint-only width.
      const breaks = new Set([0, 1]);
      const constrained = Number(road.resolvedCrossSection?.constrainedSegmentCount) > 0;
      const count = Math.ceil(length / (constrained ? 6 : chunkSize / 2));
      for (let j = 1; j < count; j++) breaks.add(j / count);
      for (const profile of road.resolvedCrossSection?.segmentProfiles?.[index] || []) {
        breaks.add(Math.max(0, Math.min(1, profile.startT))); breaks.add(Math.max(0, Math.min(1, profile.endT)));
      }
      const ts = [...breaks].filter(Number.isFinite).sort((x, y) => x - y);
      for (let j = 1; j < ts.length; j++) {
        const t0 = ts[j - 1], t1 = ts[j];
        const at = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        const segment = { road, offset, index, t0, t1, a: at(t0), b: at(t1), wa: roadWidthAtSegment(road, index, t0), wb: roadWidthAtSegment(road, index, t1) };
        segment.bounds = box([segment.a, segment.b]); segments.push(segment);
        insert('segments', segment, segment.bounds, Math.max(segment.wa, segment.wb) / 2 + Math.abs(offset) + 9 / metersPerWorldUnit);
      }
    }
  }
  for (const feature of linearFeatures) {
    if (!groundFeature(feature) || feature.kind !== 'footway' || feature.subtype !== 'sidewalk') continue;
    for (let i = 1; i < feature.pts.length; i++) {
      const a = feature.pts[i - 1], b = feature.pts[i];
      const shape = quad(a, b, feature.width / 2, feature.width / 2);
      if (shape) { const item = { a, b, width: feature.width, polygon: shape, bounds: box([a, b]) }; paths.push(item); insert('paths', item, item.bounds, feature.width + 7 / metersPerWorldUnit); }
      if (i < feature.pts.length - 1) {
        for (const polygon of roadTurnFootprint({previous:a,point:b,next:feature.pts[i+1],leftDistance:feature.width/2,rightDistance:feature.width/2})) {
          const item={polygon,bounds:box([b])};paths.push(item);insert('paths',item,item.bounds,feature.width);
        }
      }
    }
  }
  for (const area of mappedAreas) insert('areas', area, area.bounds);
  // Index context by occupied cells instead of scanning every building for every street cell.
  const assign = (kind, items, pad = 0) => {
    for (const item of items) {
      const b = item.bounds;
      const minX = Math.floor((b.minX-pad)/chunkSize), maxX = Math.floor((b.maxX+pad)/chunkSize);
      const minZ = Math.floor((b.minZ-pad)/chunkSize), maxZ = Math.floor((b.maxZ+pad)/chunkSize);
      if ((maxX-minX+1)*(maxZ-minZ+1) > tiles.size) {
        for (const tile of tiles.values()) if (intersects(b, tile.bounds, pad)) tile[kind].push(item);
      } else {
        for(let x=minX;x<=maxX;x++) for(let z=minZ;z<=maxZ;z++) tiles.get(`${x}:${z}`)?.[kind].push(item);
      }
    }
  };
  for (const tile of tiles.values()) tile.bounds = { minX: tile.ix*chunkSize, maxX:(tile.ix+1)*chunkSize, minZ:tile.iz*chunkSize, maxZ:(tile.iz+1)*chunkSize };
  assign('obstacles', obstacles); assign('edges', buildingEdges, 16);
  return { tiles: [...tiles.values()].sort((a, b) => a.ix - b.ix || a.iz - b.iz), metersPerWorldUnit, chunkSize,
    managedPaths: linearFeatures.filter(f => groundFeature(f) && f.kind === 'footway' && f.subtype === 'sidewalk') };
}

function frontageDistance(point, nx, nz, edges, minimum, maximum) {
  let best = maximum + 1;
  for (const { a, b } of edges) {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    // Only street-facing, nearly parallel walls can support frontage inference.
    if (Math.abs((dx * nx + dz * nz) / length) > 0.25) continue;
    const den = nx * dz - nz * dx;
    if (Math.abs(den) < 1e-8) continue;
    const ax = a.x - point.x, az = a.z - point.z;
    const distance = (ax * dz - az * dx) / den;
    const t = (ax * nz - az * nx) / den;
    if (t >= -1e-7 && t <= 1 + 1e-7 && distance >= minimum && distance <= maximum) best = Math.min(best, distance);
  }
  return best <= maximum ? best : null;
}

// Split at frontage endpoints so a short façade can meet the sidewalk even when
// its source road is a long generalized segment. Cuts use source coordinates,
// independently of tile boundaries, keeping adjoining cells consistent.
function splitAtFrontages(segment, edges) {
  const dx = segment.b.x-segment.a.x, dz = segment.b.z-segment.a.z;
  const lengthSq = dx*dx+dz*dz, cuts = new Set([0,1]);
  for (const edge of edges) {
    if (!intersects(edge.bounds,segment.bounds,12)) continue;
    const ex=edge.b.x-edge.a.x, ez=edge.b.z-edge.a.z;
    if (Math.abs(ex*dz-ez*dx)/Math.sqrt((ex*ex+ez*ez)*lengthSq)>.25) continue;
    for (const p of [edge.a,edge.b]) {
    const t = ((p.x-segment.a.x)*dx+(p.z-segment.a.z)*dz)/lengthSq;
    if (t>0.00001 && t<0.99999) cuts.add(t);
    }
  }
  const ts = [...cuts].sort((a,b)=>a-b);
  const at = t => ({x:segment.a.x+dx*t,z:segment.a.z+dz*t});
  return ts.slice(1).map((end,i)=>({...segment,a:at(ts[i]),b:at(end),
    wa:segment.wa+(segment.wb-segment.wa)*ts[i],wb:segment.wa+(segment.wb-segment.wa)*end}));
}

export function compilePavementTile(tile, metersPerWorldUnit = 1.11) {
  const roadParts = [], pavementParts = tile.paths.map(p => p.polygon).concat(tile.areas.map(p => p.polygon));
  let inferredFrontages = 0;
  for(const s of tile.segments) {
    const offset=s.offset || 0;
    const shape=quad(s.a,s.b,Math.max(.3,s.wa/2-offset),Math.max(.3,s.wa/2+offset),Math.max(.3,s.wb/2-offset),Math.max(.3,s.wb/2+offset));
    if(shape)roadParts.push(shape);
  }
  for(const join of tile.joins || []) {
    roadParts.push(...roadTurnFootprint({...join,leftDistance:Math.max(.3,join.halfWidth+join.offset),rightDistance:Math.max(.3,join.halfWidth-join.offset)}));
  }
  // Frontage rays must meet the exterior of the complete carriageway, not
  // internal rectangle caps where two source road segments meet.
  const carriageway=union(roadParts),roadEdges=[];
  for(const poly of carriageway)for(const ring of poly)for(let i=1;i<ring.length;i++) {
    const a={x:ring[i-1][0],z:ring[i-1][1]},b={x:ring[i][0],z:ring[i][1]};
    if(Math.hypot(b.x-a.x,b.z-a.z)>1e-6)roadEdges.push({a,b,bounds:box([a,b])});
  }
  // A separately mapped sidewalk is still a centerline, not its complete area.
  // Use the same bounded frontage evidence as roadway-side inference.
  for (const path of tile.paths) {
    if (!path.a || !path.b) continue;
    const length=Math.hypot(path.b.x-path.a.x,path.b.z-path.a.z);
    const nx=(path.b.z-path.a.z)/length,nz=-(path.b.x-path.a.x)/length;
    const pieces=splitAtFrontages({...path,wa:path.width,wb:path.width},tile.edges.concat(roadEdges));
    for (const sign of [-1,1]) {
      const outer=[];
      for (const s of pieces) {
        const midpoint={x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2};
        const distances=[s.a,midpoint,s.b].map(p=>frontageDistance(p,nx*sign,nz*sign,tile.edges,path.width/2,7/metersPerWorldUnit));
        const oppositeFront=frontageDistance(midpoint,-nx*sign,-nz*sign,tile.edges,path.width/2,7/metersPerWorldUnit);
        if(!distances.every(Number.isFinite) && Number.isFinite(oppositeFront)) {
          // A mapped sidewalk between a close façade and a parallel carriageway
          // supports filling the small curb-side gap. Explicit obstacles still
          // cut this area below; a rural path alone cannot authorize the fill.
          const curb=[s.a,midpoint,s.b].map(p=>frontageDistance(p,nx*sign,nz*sign,roadEdges,path.width/2,path.width/2+4/metersPerWorldUnit));
          if(curb.every(Number.isFinite))distances.splice(0,3,...curb);
        }
        const reachesFront=distances.every(Number.isFinite) && Math.max(...distances)-Math.min(...distances)<2/metersPerWorldUnit;
        if(reachesFront) inferredFrontages++;
        const a=reachesFront ? distances[0] : path.width/2,b=reachesFront ? distances[2] : path.width/2;
        outer.push([s.a.x+nx*sign*a,s.a.z+nz*sign*a],[s.b.x+nx*sign*b,s.b.z+nz*sign*b]);
      }
      pavementParts.push(polygon([[path.a.x,path.a.z],[path.b.x,path.b.z],...outer.reverse()]));
    }
  }
  for (const original of tile.segments) {
    const offset=original.offset || 0;
    const road=quad(original.a,original.b,Math.max(.3,original.wa/2-offset),Math.max(.3,original.wa/2+offset),Math.max(.3,original.wb/2-offset),Math.max(.3,original.wb/2+offset));
    if(!road) continue;
    const length=Math.hypot(original.b.x-original.a.x,original.b.z-original.a.z);
    const nx=(original.b.z-original.a.z)/length,nz=-(original.b.x-original.a.x)/length;
    const urban=tile.edges.some(e=>intersects(e.bounds,original.bounds,20));
    const tags=original.road.transportRecord?.sourceTags || original.road.tags || {};
    const section=resolveStreetSection({...tags,highway:tags.highway || original.road.type},{urban});
    const pieces=splitAtFrontages(original,tile.edges);
    for(const [side,sign] of [['left',1],['right',-1]]) {
      if(section[side].presence!=='present') continue;
      const width=section[side].widthMeters/metersPerWorldUnit;
      const outerPoints=[];
      for(const s of pieces) {
        const edgeA=Math.max(.3,s.wa/2-sign*offset),edgeB=Math.max(.3,s.wb/2-sign*offset);
        let outerA=edgeA+width,outerB=edgeB+width;
        const midpoint={x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2};
        const max=Math.min(edgeA,edgeB)+7/metersPerWorldUnit;
        const distances=[s.a,midpoint,s.b].map(p=>frontageDistance(p,nx*sign,nz*sign,tile.edges,Math.max(edgeA,edgeB)+width,max));
        if(distances.every(Number.isFinite) && Math.max(...distances)-Math.min(...distances)<2/metersPerWorldUnit) {
          outerA=distances[0];outerB=distances[2];inferredFrontages++;
        }
        outerPoints.push([s.a.x+nx*sign*outerA,s.a.z+nz*sign*outerA],[s.b.x+nx*sign*outerB,s.b.z+nz*sign*outerB]);
      }
      // One outline per street side, including frontage steps. Unioning a stack
      // of touching slivers made Clipper's containment repair quadratic in cities.
      pavementParts.push(polygon([[original.a.x,original.a.z],[original.b.x,original.b.z],...outerPoints.reverse()]));
    }
  }
  for (const join of tile.joins || []) {
    const leftDistance=Math.max(.3,join.halfWidth+join.offset), rightDistance=Math.max(.3,join.halfWidth-join.offset);
    const tags=join.road.transportRecord?.sourceTags || join.road.tags || {};
    const urban=tile.edges.some(e=>intersects(e.bounds,box([join.point]),20));
    const section=resolveStreetSection({...tags,highway:tags.highway || join.road.type},{urban});
    // Renderer normals are opposite source-way sidewalk left/right normals.
    const leftExtra=section.right.presence==='present' ? section.right.widthMeters/metersPerWorldUnit : 0;
    const rightExtra=section.left.presence==='present' ? section.left.widthMeters/metersPerWorldUnit : 0;
    if(leftExtra || rightExtra) pavementParts.push(...roadTurnFootprint({...join,leftDistance:leftDistance+leftExtra,rightDistance:rightDistance+rightExtra}));
  }
  const b = tile.bounds, boundary = polygon([[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]]);
  if (!pavementParts.length) return { polygons: [], inferredFrontages: 0 };
  // Crop each source first: a regional polygon must not make a local union
  // operate on its entire remote boundary.
  const localParts = parts => parts.flatMap(part=>clip.intersection(part,boundary));
  let polygons = union(localParts(pavementParts));
  const blockers = carriageway.concat(tile.obstacles.map(o => o.polygon));
  if (polygons.length && blockers.length) polygons = clip.difference(polygons, union(localParts(blockers)));
  return { polygons, inferredFrontages };
}

// Regular cells keep slope interpolation local. Shared world-grid vertices produce matching tile seams.
export function meshPavementTile(tile, polygons, sampleHeight, { cellSize = 4, curbHeight = 0.108108 } = {}) {
  const vertices = [], curbVertices = [], triangles = [], b = tile.bounds;
  const vertex = ([x, z]) => {
    const y = sampleHeight(x, z);
    if (!Number.isFinite(y)) throw new Error('Pavement has no accepted ground height');
    return { x, y: y + curbHeight, z };
  };
  for (let x = b.minX; x < b.maxX; x += cellSize) for (let z = b.minZ; z < b.maxZ; z += cellSize) {
    const square = polygon([[x, z], [x + cellSize, z], [x + cellSize, z + cellSize], [x, z + cellSize]]);
    for (const poly of polygons.length ? clip.intersection(polygons, square) : []) {
      const points = [], holes = [];
      for (let ri = 0; ri < poly.length; ri++) { if (ri) holes.push(points.length); points.push(...poly[ri].slice(0, -1)); }
      const indices = earcut(points.flat(), holes, 2);
      for (let i = 0; i < indices.length; i += 3) {
        const ps = indices.slice(i, i + 3).map(j => vertex(points[j]));
        if ((ps[1].x - ps[0].x) * (ps[2].z - ps[0].z) - (ps[1].z - ps[0].z) * (ps[2].x - ps[0].x) > 0) [ps[1], ps[2]] = [ps[2], ps[1]];
        vertices.push(...ps.flatMap(p => [p.x, p.y, p.z])); triangles.push(ps);
      }
    }
  }
  for (const poly of polygons) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], d = ring[i];
    // A chunk boundary is not a curb. Neighbors own the continuation.
    if ([b.minX, b.maxX].some(x => Math.abs(a[0] - x) < 1e-7 && Math.abs(d[0] - x) < 1e-7) ||
      [b.minZ, b.maxZ].some(z => Math.abs(a[1] - z) < 1e-7 && Math.abs(d[1] - z) < 1e-7)) continue;
    const ts = new Set([0, 1]);
    for (let axis = 0; axis < 2; axis++) {
      const delta = d[axis] - a[axis]; if (Math.abs(delta) < 1e-8) continue;
      for (let n = Math.ceil(Math.min(a[axis], d[axis]) / cellSize); n * cellSize < Math.max(a[axis], d[axis]); n++) {
        const t = (n * cellSize - a[axis]) / delta; if (t > 0 && t < 1) ts.add(t);
      }
    }
    const ordered = [...ts].sort((x, y) => x - y);
    for (let j = 1; j < ordered.length; j++) {
      const at = t => vertex([a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t]);
      const p = at(ordered[j - 1]), q = at(ordered[j]), lowP = { ...p, y: p.y - curbHeight }, lowQ = { ...q, y: q.y - curbHeight };
      curbVertices.push(...[p, lowP, lowQ, p, lowQ, q].flatMap(v => [v.x, v.y, v.z]));
    }
  }
  return { vertices, curbVertices, triangles };
}

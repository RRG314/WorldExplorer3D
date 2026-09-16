import {frontageCornerRegions} from './street-frontage-corners.js';
import {streetRoadSegments,unionCarriageway} from './street-carriageway.js';
import {roadPlacementOffsetWorld} from '../road-units.js';
import {createStreetCarriagewayBarriers,frontageBlocked} from './street-carriageway-barriers.js';
import { createStreetFrontagePolicy, streetFootprint, streetScale, isGroundStreet, streetSideEdge, FRONTAGE_RULES } from './street-frontage-policy.js';
import { frontageHit, splitFrontageIntervals } from './street-frontage-geometry.js';
import { crossingStyle, crossingRamps, rampCurbScale } from './street-crossings.js';
import { roadTurnFootprint } from '../../terrain/road-surface-geometry.js?v=2';
import { streetPolygonKernel as clip, createStreetPolygonKernel } from './street-polygon-kernel.js';
import * as triangulator from '../../../../functions/vendor/earcut/index.js';
import { resolveStreetSection } from './street-section.js';
import { roadWidthAtSegment } from '../road-cross-section-profile.js?v=1';
const earcut = triangulator.default || globalThis.earcut;
const snap = n => Math.round(n * 1000) / 1000;
const polygon = points => { const ring = points.map(([x,z]) => [snap(x),snap(z)]); return [ring.concat([ring[0]])]; };
const union = parts => parts.length ? clip.union(parts[0], ...parts.slice(1)) : [];
const ringOf = item => item?.surfaceFootprint || item?.pts || item?.footprint || [];
const box = points => ({ minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) });
const intersects = (a, b, pad = 0) => a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minZ <= b.maxZ + pad && a.maxZ >= b.minZ - pad;
const areaPolygon = item => [ringOf(item), ...(item.holeRings || item.holes || [])].map(r => {
  const points = r.map(p => [p.x, p.z]); return points.concat([points[0]]);
});
const groundFeature = isGroundStreet;
const quad = (a, b, leftA, rightA, leftB = leftA, rightB = rightA) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const nx = (b.z - a.z) / length, nz = -(b.x - a.x) / length;
  return polygon([[a.x + nx * leftA, a.z + nz * leftA], [a.x - nx * rightA, a.z - nz * rightA],
    [b.x - nx * rightB, b.z - nz * rightB], [b.x + nx * leftB, b.z + nz * leftB]]);
};

// Construction regions are fixed in world space. Output chunk size is a
// packaging choice and must never alter facade selection or boolean order.
export const STREET_DESIGN_REGION_SIZE = 64;
// Cropping accepted sloping edges must not snap them onto the coarser design
// grid again: that can fold a narrow boundary fragment back across itself.
export const STREET_OUTPUT_CLIP_GRID_WORLD = 0.000001;
const outputClip = createStreetPolygonKernel({grid:STREET_OUTPUT_CLIP_GRID_WORLD});
const compiledRegions = new WeakMap();
export function prepareStreetPavement(input = {}) {
  const chunkSize = input.chunkSize ?? STREET_DESIGN_REGION_SIZE;
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) throw new RangeError('Street chunk size must be positive');
  const requested = input.coverageBounds;
  const coverageBounds = requested && {
    minX: Math.floor(requested.minX / STREET_DESIGN_REGION_SIZE) * STREET_DESIGN_REGION_SIZE,
    minZ: Math.floor(requested.minZ / STREET_DESIGN_REGION_SIZE) * STREET_DESIGN_REGION_SIZE,
    maxX: Math.ceil(requested.maxX / STREET_DESIGN_REGION_SIZE) * STREET_DESIGN_REGION_SIZE,
    maxZ: Math.ceil(requested.maxZ / STREET_DESIGN_REGION_SIZE) * STREET_DESIGN_REGION_SIZE
  };
  const plan = prepareStreetRegions({...input, chunkSize:STREET_DESIGN_REGION_SIZE, coverageBounds});
  if (chunkSize === STREET_DESIGN_REGION_SIZE && (!requested || Object.keys(coverageBounds).every(k=>coverageBounds[k]===requested[k]))) return plan;
  const outputs = new Map();
  for (const region of plan.tiles) {
    const b=region.bounds;
    for(let ix=Math.floor(b.minX/chunkSize);ix<Math.ceil(b.maxX/chunkSize);ix++)
      for(let iz=Math.floor(b.minZ/chunkSize);iz<Math.ceil(b.maxZ/chunkSize);iz++) {
        const bounds={minX:ix*chunkSize,maxX:(ix+1)*chunkSize,minZ:iz*chunkSize,maxZ:(iz+1)*chunkSize};
        if(requested && (bounds.maxX<=requested.minX || bounds.minX>=requested.maxX || bounds.maxZ<=requested.minZ || bounds.minZ>=requested.maxZ))continue;
        if(requested){bounds.minX=Math.max(bounds.minX,requested.minX);bounds.maxX=Math.min(bounds.maxX,requested.maxX);bounds.minZ=Math.max(bounds.minZ,requested.minZ);bounds.maxZ=Math.min(bounds.maxZ,requested.maxZ);}
        const key=`${ix}:${iz}`;
        if(!outputs.has(key))outputs.set(key,{key,ix,iz,bounds,designRegions:[]});
        outputs.get(key).designRegions.push(region);
      }
  }
  for(const output of outputs.values())for(const kind of ['segments','joins','paths','crossings','obstacles','areas','edges','frontageBarriers'])
    output[kind]=[...new Set(output.designRegions.flatMap(r=>r[kind]||[]))];
  return {...plan,chunkSize,tiles:[...outputs.values()].sort((a,b)=>a.ix-b.ix||a.iz-b.iz)};
}

function compilePackagedRegions(tile, metersPerWorldUnit, options) {
  const b=tile.bounds,boundary=polygon([[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ]]);
  const result={polygons:[],markingPolygons:[],ramps:[],inferredFrontages:0};
  for(const region of tile.designRegions){
    const key=`${metersPerWorldUnit}:${options.includeMarkings!==false}`;
    let cache=compiledRegions.get(region);if(!cache){cache=new Map();compiledRegions.set(region,cache);}
    if(!cache.has(key))cache.set(key,compilePavementTile(region,metersPerWorldUnit,options));
    const compiled=cache.get(key);
    const contained=region.bounds.minX>=b.minX&&region.bounds.maxX<=b.maxX&&region.bounds.minZ>=b.minZ&&region.bounds.maxZ<=b.maxZ;
    for(const kind of ['polygons','markingPolygons'])result[kind].push(...(contained?compiled[kind]:compiled[kind].flatMap(p=>outputClip.intersection(p,boundary))));
    result.ramps.push(...compiled.ramps);result.inferredFrontages+=compiled.inferredFrontages;
  }
  // Adjacent accepted regions share only their boundary. Preserve the pieces:
  // another union here would redesign rounded shared edges during packaging.
  return result;
}

// All spatial indexing uses world coordinates; dimensions supplied in metres are converted once.
function prepareStreetRegions({ roads = [], buildings = [], landuses = [], linearFeatures = [], metersPerWorldUnit = 1.11, chunkSize = 64, coverageBounds = null }) {
  streetScale(metersPerWorldUnit);
  const frontageBarriers=createStreetCarriagewayBarriers(roads);
  const frontagePolicy = createStreetFrontagePolicy(buildings, metersPerWorldUnit);
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
        if (!tiles.has(key)) tiles.set(key, { key, ix, iz, segments: [], joins: [], paths: [], crossings: [], obstacles: [], areas: [], edges: [] });
        tiles.get(key)[kind].push(value);
      }
  };
  for (const edge of frontagePolicy.edges) buildingEdges.push(edge);
  for (const building of buildings) {
    const pts = streetFootprint(building); if (!pts.length) continue;
    obstacles.push({ polygon: areaPolygon(building), bounds: box(pts), building: true });
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
    const offset = roadPlacementOffsetWorld(road);
    for (let i=1;i<road.pts.length-1;i++) {
      const point=road.pts[i];
      if (coverageBounds && !intersects(box([point]),coverageBounds,20)) continue;
      const halfWidth=roadWidthAtSegment(road,i,0)/2;
      insert('joins',{road,section:frontagePolicy.section(road,i),previous:road.pts[i-1],point,next:road.pts[i+1],halfWidth,offset},box([point]),halfWidth+Math.abs(offset)+32/metersPerWorldUnit);
    }
    for (const segment of streetRoadSegments(road)) {
      if(coverageBounds && !intersects(segment.bounds,coverageBounds,Math.max(segment.wa,segment.wb,20)))continue;
      segment.section=frontagePolicy.section(road,segment.index);
      segments.push(segment);
      insert('segments',segment,segment.bounds,Math.max(segment.wa,segment.wb)/2+Math.abs(offset)+32/metersPerWorldUnit);
    }
  }
  for (const feature of linearFeatures) {
    if (groundFeature(feature) && feature.kind === 'footway' && feature.subtype === 'crossing' && feature.pts?.length>1) {
      insert('crossings',feature,box(feature.pts),4/metersPerWorldUnit);
      continue;
    }
    if (!groundFeature(feature) || feature.kind !== 'footway' || feature.subtype !== 'sidewalk') continue;
    for (let i = 1; i < feature.pts.length; i++) {
      const a = feature.pts[i - 1], b = feature.pts[i];
      const shape = quad(a, b, feature.width / 2, feature.width / 2);
      if (shape) { const item = { a, b, width: feature.width, polygon: shape, bounds: box([a, b]) }; paths.push(item); insert('paths', item, item.bounds, feature.width + 32 / metersPerWorldUnit); }
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
  assign('obstacles', obstacles, 16); assign('edges', buildingEdges, 44/metersPerWorldUnit);
  for(const tile of tiles.values()) {
    const point={x:(tile.bounds.minX+tile.bounds.maxX)/2,z:(tile.bounds.minZ+tile.bounds.maxZ)/2};
    tile.frontageBarriers=frontageBarriers.query(point,chunkSize+44/metersPerWorldUnit);
  }
  frontagePolicy.dispose();frontageBarriers.dispose();
  return { tiles: [...tiles.values()].sort((a, b) => a.ix - b.ix || a.iz - b.iz), metersPerWorldUnit, chunkSize,
    managedPaths: linearFeatures.filter(f => groundFeature(f) && f.kind === 'footway' && f.subtype === 'sidewalk') };
}

function frontageDistance(point, nx, nz, edges, minimum, maximum) {
  return frontageHit(point,nx,nz,edges,minimum,maximum)?.distance ?? null;
}
function frontageProfile(a, b, nx, nz, edges, minimum, maximum, barriers=[], excludeRoad) {
  const midpoint={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
  const hit=frontageHit(midpoint,nx,nz,edges,minimum,maximum);
  if(!hit || frontageBlocked(midpoint,nx,nz,hit.distance,barriers,excludeRoad))return null;
  // Each split interval belongs to its interior facade. At a shared endpoint,
  // an adjacent building with a different setback must not truncate this one.
  const distances=[a,midpoint,b].map(p=>frontageDistance(p,nx,nz,[hit.edge],0,Infinity));
  return distances.every(Number.isFinite) ? distances : null;
}

export function pavementTileHasWork(tile,includeMarkings=true){
  if(!tile.paths.length&&!tile.areas.length&&(!includeMarkings||!tile.crossings?.length)){
    const hasSide=(road,bounds,resolved)=>{
      const tags=road.transportRecord?.sourceTags||road.tags||{},urban=tile.edges.some(edge=>intersects(edge.bounds,bounds,20));
      const section=resolved || resolveStreetSection({...tags,highway:tags.highway||road.type},{urban});
      return section.left.presence==='present'||section.right.presence==='present';
    };
    return tile.segments.some(s=>hasSide(s.road,s.bounds||box([s.a,s.b]),s.section))||(tile.joins||[]).some(j=>hasSide(j.road,box([j.point]),j.section));
  }
  return true;
}
export function compilePavementTile(tile, metersPerWorldUnit = 1.11, {includeMarkings=true} = {}) {
  if(tile.designRegions)return compilePackagedRegions(tile,metersPerWorldUnit,{includeMarkings});
  if(!pavementTileHasWork(tile,includeMarkings))return {polygons:[],inferredFrontages:0,ramps:[],markingPolygons:[]};
  const pavementParts = tile.paths.map(p => p.polygon).concat(tile.areas.map(p => p.polygon));
  let inferredFrontages = 0;
  // Share the actual road footprint with rendering. Internal rectangle caps
  // and overlapping source ways are not frontage boundaries.
  const carriageway=unionCarriageway(tile,{clipToBounds:false}),roadEdges=[];
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
    for (const sign of [-1,1]) {
      const pieces=splitFrontageIntervals({...path,wa:path.width,wb:path.width},tile.edges.concat(roadEdges),{nx:nx*sign,nz:nz*sign,minimumA:path.width/2,maximumA:7/metersPerWorldUnit});
      const outer=[];
      for (const s of pieces) {
        const midpoint={x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2};
        let distances=frontageProfile(s.a,s.b,nx*sign,nz*sign,tile.edges,path.width/2,7/metersPerWorldUnit);
        const oppositeFront=frontageDistance(midpoint,-nx*sign,-nz*sign,tile.edges,path.width/2,7/metersPerWorldUnit);
        if(!distances && Number.isFinite(oppositeFront)) {
          // A mapped sidewalk between a close façade and a parallel carriageway
          // supports filling the small curb-side gap. Explicit obstacles still
          // cut this area below; a rural path alone cannot authorize the fill.
          const curb=[s.a,midpoint,s.b].map(p=>frontageDistance(p,nx*sign,nz*sign,roadEdges,path.width/2,path.width/2+4/metersPerWorldUnit));
          if(curb.every(Number.isFinite))distances=curb;
        }
        const reachesFront=!!distances;
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
    const section=original.section || resolveStreetSection({...tags,highway:tags.highway || original.road.type},{urban});
    for(const [side,sign] of [['left',1],['right',-1]]) {
      if(section[side].presence!=='present') continue;
      const width=section[side].widthMeters/metersPerWorldUnit;
      const edgeStart=streetSideEdge(original.road,original.wa/2,sign),edgeEnd=streetSideEdge(original.road,original.wb/2,sign);
      const pieces=splitFrontageIntervals(original,tile.edges,{nx:nx*sign,nz:nz*sign,minimumA:edgeStart+width,minimumB:edgeEnd+width,maximumA:edgeStart+FRONTAGE_RULES.ordinaryReach/metersPerWorldUnit,maximumB:edgeEnd+FRONTAGE_RULES.ordinaryReach/metersPerWorldUnit});
      const outerPoints=[];
      for(const s of pieces) {
        const edgeA=streetSideEdge(s.road,s.wa/2,sign),edgeB=streetSideEdge(s.road,s.wb/2,sign);
        let outerA=edgeA+width,outerB=edgeB+width;
        const midpoint={x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2};
        const max=(s.frontageMaximumA+s.frontageMaximumB)/2;
        const distances=frontageProfile(s.a,s.b,nx*sign,nz*sign,tile.edges,(s.frontageMinimumA+s.frontageMinimumB)/2,max,tile.frontageBarriers,original.road);
        if(distances) {
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
    const section=join.section || resolveStreetSection({...tags,highway:tags.highway || join.road.type},{urban});
    // Renderer normals are opposite source-way sidewalk left/right normals.
    const leftExtra=section.right.presence==='present' ? section.right.widthMeters/metersPerWorldUnit : 0;
    const rightExtra=section.left.presence==='present' ? section.left.widthMeters/metersPerWorldUnit : 0;
    if(leftExtra || rightExtra) pavementParts.push(...roadTurnFootprint({...join,leftDistance:leftDistance+leftExtra,rightDistance:rightDistance+rightExtra}));
  }
  const b = tile.bounds, boundary = polygon([[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]]);

  // Crop each source first: a regional polygon must not make a local union
  // operate on its entire remote boundary.
  const localParts = parts => parts.flatMap(part=>clip.intersection(part,boundary));
  // Corner ownership comes from adjoining paved facades and actual curbs.
  // Cropping cannot change that construction: no tile-local closing filter.
  const corners=frontageCornerRegions(tile.obstacles.filter(o=>o.building).map(o=>o.polygon),pavementParts,roadEdges,metersPerWorldUnit);
  const polygonsToUnion=pavementParts.concat(corners);
  let polygons=union(localParts(polygonsToUnion));
  const blockers = carriageway.concat(tile.obstacles.map(o => o.polygon));
  if (polygons.length && blockers.length) polygons = clip.difference(polygons, union(localParts(blockers)));
  const ramps=includeMarkings?crossingRamps(tile.crossings || [],roadEdges,metersPerWorldUnit):[];
  const paintParts=[];
  for(const crossing of includeMarkings?(tile.crossings || []):[]) {
    const {paint}=crossingStyle(crossing);
    if(!paint)continue;
    for(let i=1;i<crossing.pts.length;i++) {
      const a=crossing.pts[i-1],b=crossing.pts[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<.01)continue;
      const half=Math.max(.5/metersPerWorldUnit,(crossing.width || 2)/2),line=.15/metersPerWorldUnit;
      if(paint==='lines' || paint==='ladder') {
        paintParts.push(quad(a,b,half, -half+line),quad(a,b,-half+line,half));
      }
      if(paint==='zebra' || paint==='ladder') {
        const at=t=>({x:a.x+(b.x-a.x)*t/length,z:a.z+(b.z-a.z)*t/length});
        for(let start=0;start<length;start+=1/metersPerWorldUnit) paintParts.push(quad(at(start),at(Math.min(length,start+.5/metersPerWorldUnit)),half,half));
      }
    }
  }
  const markingPolygons=paintParts.length && carriageway.length ? clip.intersection(union(localParts(paintParts.filter(Boolean))),carriageway) : [];
  return { polygons, inferredFrontages, ramps, markingPolygons };
}

// Regular cells keep slope interpolation local. Shared world-grid vertices produce matching tile seams.
export function meshPavementTile(tile, polygons, sampleHeight, { cellSize = 4, curbHeight = 0.108108, ramps = [], includeCurbs = true, includeTriangles = true } = {}) {
  const vertices = [], curbVertices = [], triangles = [], b = tile.bounds;
  const polygonBounds = polygons.map(poly => {
    const ring = poly[0];
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const [x,z] of ring){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
    return {poly,minX,maxX,minZ,maxZ};
  });

  const vertex = ([x, z]) => {
    const y = sampleHeight(x, z);
    if (!Number.isFinite(y)) throw new Error('Pavement has no accepted ground height');
    return { x, y: y + curbHeight * rampCurbScale(x,z,ramps), z };
  };
  function* meshCells() {
    for(let x=b.minX;x<b.maxX;x+=cellSize)for(let z=b.minZ;z<b.maxZ;z+=cellSize) {
      const nearRamp=ramps.some(r=>r.x+r.depth+r.halfWidth+1>=x && r.x-r.depth-r.halfWidth-1<=x+cellSize && r.z+r.depth+r.halfWidth+1>=z && r.z-r.depth-r.halfWidth-1<=z+cellSize);
      const step=nearRamp ? Math.min(.5,cellSize) : cellSize;
      for(let sx=x;sx<x+cellSize;sx+=step)for(let sz=z;sz<z+cellSize;sz+=step)yield {x:sx,z:sz,size:step};
    }
  }
  for (const {x,z,size} of meshCells()) {
    // Do not send every disconnected sidewalk polygon through Clipper for
    // every empty mesh cell. Bounds are a rejection test only; exact clipping
    // still owns holes and all geometry in intersecting cells.
    const candidates=polygonBounds.filter(p=>p.minX<=x+size && p.maxX>=x && p.minZ<=z+size && p.maxZ>=z).map(p=>p.poly);
    if(!candidates.length)continue;
    const square = polygon([[x, z], [x + size, z], [x + size, z + size], [x, z + size]]);
    for (const poly of clip.intersection(candidates, square)) {
      const points = [], holes = [];
      for (let ri = 0; ri < poly.length; ri++) { if (ri) holes.push(points.length); points.push(...poly[ri].slice(0, -1)); }
      const indices = earcut(points.flat(), holes, 2);
      for (let i = 0; i < indices.length; i += 3) {
        const ps = indices.slice(i, i + 3).map(j => vertex(points[j]));
        if ((ps[1].x - ps[0].x) * (ps[2].z - ps[0].z) - (ps[1].z - ps[0].z) * (ps[2].x - ps[0].x) > 0) [ps[1], ps[2]] = [ps[2], ps[1]];
        vertices.push(...ps.flatMap(p => [p.x, p.y, p.z])); if(includeTriangles)triangles.push(ps);
      }
    }
  }
  const curbPolygons=includeCurbs && tile.designRegions?.length>1 && polygons.length ? outputClip.union(polygons) : polygons;
  if(includeCurbs) for (const poly of curbPolygons) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], d = ring[i];
    // A chunk boundary is not a curb. Neighbors own the continuation.
    if ([b.minX, b.maxX].some(x => Math.abs(a[0] - x) < 1e-7 && Math.abs(d[0] - x) < 1e-7) ||
      [b.minZ, b.maxZ].some(z => Math.abs(a[1] - z) < 1e-7 && Math.abs(d[1] - z) < 1e-7)) continue;
    const curbStep=ramps.length ? Math.min(.5,cellSize) : cellSize;
    const ts = new Set([0, 1]);
    for (let axis = 0; axis < 2; axis++) {
      const delta = d[axis] - a[axis]; if (Math.abs(delta) < 1e-8) continue;
      for (let n = Math.ceil(Math.min(a[axis], d[axis]) / curbStep); n * curbStep < Math.max(a[axis], d[axis]); n++) {
        const t = (n * curbStep - a[axis]) / delta; if (t > 0 && t < 1) ts.add(t);
      }
    }
    const ordered = [...ts].sort((x, y) => x - y);
    for (let j = 1; j < ordered.length; j++) {
      const at = t => vertex([a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t]);
      const p = at(ordered[j - 1]), q = at(ordered[j]), lowP = { ...p, y: p.y - curbHeight*rampCurbScale(p.x,p.z,ramps) }, lowQ = { ...q, y: q.y - curbHeight*rampCurbScale(q.x,q.z,ramps) };
      curbVertices.push(...[p, lowP, lowQ, p, lowQ, q].flatMap(v => [v.x, v.y, v.z]));
    }
  }
  return { vertices, curbVertices, triangles };
}

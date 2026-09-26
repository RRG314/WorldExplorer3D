import {roadPlacementOffsetWorld} from '../road-units.js';
import {roadWidthAtSegment} from '../road-cross-section-profile.js?v=1';
import {roadTurnFootprint} from '../../terrain/road-surface-geometry.js?v=2';
import {streetPolygonKernel as clip} from './street-polygon-kernel.js';

const boundsOf = points => ({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});

// Both road rendering and pavement subtraction consume these same width and
// placement samples. Cell boundaries never replace source width constraints.
export function* streetRoadSegments(road) {
  const offset=roadPlacementOffsetWorld(road);
  for(let index=0;index<(road.pts?.length || 0)-1;index++) {
    const a=road.pts[index],b=road.pts[index+1],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(length<.01)continue;
    const breaks=new Set([0,1]);
    const count=Math.ceil(length/(Number(road.resolvedCrossSection?.constrainedSegmentCount)>0 ? 6 : 32));
    for(let j=1;j<count;j++)breaks.add(j/count);
    for(const profile of road.resolvedCrossSection?.segmentProfiles?.[index] || []) {
      breaks.add(Math.max(0,Math.min(1,profile.startT)));breaks.add(Math.max(0,Math.min(1,profile.endT)));
    }
    const ts=[...breaks].filter(Number.isFinite).sort((a,b)=>a-b);
    const at=t=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
    for(let j=1;j<ts.length;j++) {
      const t0=ts[j-1],t1=ts[j],start=at(t0),end=at(t1);
      yield {road,offset,index,t0,t1,a:start,b:end,wa:roadWidthAtSegment(road,index,t0),wb:roadWidthAtSegment(road,index,t1),bounds:boundsOf([start,end])};
    }
  }
}

export function carriagewaySegmentPolygon(s) {
  const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);
  if(length<1e-6)return null;
  const nx=(s.b.z-s.a.z)/length,nz=-(s.b.x-s.a.x)/length,offset=s.offset || 0;
  const leftA=Math.max(.3,s.wa/2-offset),rightA=Math.max(.3,s.wa/2+offset);
  const leftB=Math.max(.3,s.wb/2-offset),rightB=Math.max(.3,s.wb/2+offset);
  const ring=[[s.a.x+nx*leftA,s.a.z+nz*leftA],[s.a.x-nx*rightA,s.a.z-nz*rightA],
    [s.b.x-nx*rightB,s.b.z-nz*rightB],[s.b.x+nx*leftB,s.b.z+nz*leftB]];
  return [ring.concat([ring[0]])];
}

export function carriagewayJoinPolygons(join) {
  return roadTurnFootprint({...join,leftDistance:Math.max(.3,join.halfWidth+join.offset),rightDistance:Math.max(.3,join.halfWidth-join.offset)});
}

export function unionCarriageway(tile, {clipToBounds = true} = {}) {
  const parts=[];
  for(const segment of tile.segments) {const p=carriagewaySegmentPolygon(segment);if(p)parts.push(p);}
  for(const join of tile.joins || [])parts.push(...carriagewayJoinPolygons(join));
  if(!parts.length)return [];
  const united=clip.union(parts[0],...parts.slice(1));
  if(!clipToBounds)return united;
  const b=tile.bounds;
  return clip.intersection(united,[[[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ],[b.minX,b.minZ]]]);
}

// Ground roads have a single horizontal owner. Elevated and underground roads
// retain independent structure surfaces and never enter this planar union.
export function prepareCarriagewayTiles(roads, chunkSize = 128) {
  const tiles=new Map();
  const insert=(kind,item,polygon)=> {
    const b=boundsOf(polygon.flat().map(([x,z])=>({x,z})));
    for(let ix=Math.floor(b.minX/chunkSize);ix<=Math.floor(b.maxX/chunkSize);ix++)
      for(let iz=Math.floor(b.minZ/chunkSize);iz<=Math.floor(b.maxZ/chunkSize);iz++) {
        const key=`${ix}:${iz}`;
        if(!tiles.has(key))tiles.set(key,{key,segments:[],joins:[],bounds:{minX:ix*chunkSize,maxX:(ix+1)*chunkSize,minZ:iz*chunkSize,maxZ:(iz+1)*chunkSize}});
        tiles.get(key)[kind].push(item);
      }
  };
  for(const road of roads) {
    if(road.structureSemantics?.terrainMode!=='at_grade')continue;
    for(const segment of streetRoadSegments(road)) {
      const polygon=carriagewaySegmentPolygon(segment);if(polygon)insert('segments',segment,polygon);
    }
    for(let i=1;i<(road.pts?.length || 0)-1;i++) {
      const join={road,previous:road.pts[i-1],point:road.pts[i],next:road.pts[i+1],halfWidth:roadWidthAtSegment(road,i,0)/2,offset:roadPlacementOffsetWorld(road)};
      for(const polygon of carriagewayJoinPolygons(join))insert('joins',join,polygon);
    }
  }
  return [...tiles.values()].sort((a,b)=>a.bounds.minX-b.bounds.minX || a.bounds.minZ-b.bounds.minZ);
}

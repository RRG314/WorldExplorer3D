import { polylineDistances } from '../../structure-semantics/geometry.js?v=2';
import { sampleTransportSurfaceAtDistance } from './transport-surface-model.js?v=25';
import { TUNNEL_SECTION_LATERAL, TUNNEL_SECTION_HEIGHT, canPublishTunnelGeometry } from './tunnel-envelope.js';

const CELL = 16;
export function tunnelSolidComponents(features) {
  const eligible = new Set(features.filter(f => canPublishTunnelGeometry(f) && f.tunnelSystemModel?.visualKind === 'tunnel' && f.tunnelSystemModel.shellRanges.length));
  const visited = new Set(), components = [];
  for (const first of eligible) {
    if (visited.has(first)) continue;
    const component = [], pending = [first]; visited.add(first);
    while (pending.length) {
      const feature = pending.pop(); component.push(feature);
      for (const endpoint of ['start', 'end']) for (const link of feature.connectedFeatures?.[endpoint] || []) {
        const other = link.feature;
        if (!eligible.has(other) || visited.has(other) || !solidConnectionCompatible(feature, endpoint, other)) continue;
        visited.add(other); pending.push(other);
      }
    }
    if (component.length > 1) components.push(component.sort((a,b) => String(a.sourceFeatureId).localeCompare(String(b.sourceFeatureId))));
  }
  return components;
}

function solidConnectionCompatible(feature, endpoint, other) {
  if (feature.transportRecord?.completeness !== other.transportRecord?.completeness) return false;
  const ownLayer = feature.transportRecord?.rawTags?.layer;
  const otherLayer = other.transportRecord?.rawTags?.layer;
  if (ownLayer && otherLayer && ownLayer !== otherLayer) return false;
  const p = endpoint === 'start' ? feature.pts[0] : feature.pts.at(-1);
  const candidates = [other.pts[0], other.pts.at(-1)];
  const index = Math.hypot(p.x-candidates[0].x,p.z-candidates[0].z) <= Math.hypot(p.x-candidates[1].x,p.z-candidates[1].z) ? 0 : 1;
  const q = candidates[index];
  // Graph membership alone is insufficient for a physical mouth. Do not bridge
  // inferred long gaps or endpoint-to-interior conflation with a convex room.
  if (Math.hypot(p.x-q.x,p.z-q.z) > 0.3) return false;
  const a = endpoint === 'start' ? 0 : feature.tunnelSystemModel.total;
  const b = index === 0 ? 0 : other.tunnelSystemModel.total;
  const inShell = (f,d) => f.tunnelSystemModel.shellRanges.some(r=>d>=r.start-.15&&d<=r.end+.15);
  return inShell(feature,a) && inShell(other,b) && Math.abs(
    sampleTransportSurfaceAtDistance(feature.transportSurfaceModel,a,0) -
    sampleTransportSurfaceAtDistance(other.transportSurfaceModel,b,0)) <= 0.75;
}

export function buildTunnelSolidInput(features) {
  const origin = { x: features[0].pts[0].x, y: 0, z: features[0].pts[0].z };
  const pieces = [], sweeps = [], mouths = [], endRings = new Map();
  const members = new Set(features);
  for (const feature of features) {
    const path = polylineDistances(feature.pts), model = feature.tunnelSystemModel;
    const halfWidth = Math.max(3.4, Number(feature.width) || 6) * .5 + .02;
    const sample = distance => {
      let i=0; while(i<feature.pts.length-2 && path.distances[i+1]<distance) i++;
      const a=feature.pts[i],b=feature.pts[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);
      const t=Math.max(0,Math.min(1,(distance-path.distances[i])/Math.max(length,1e-8)));
      return { x:a.x+(b.x-a.x)*t-origin.x,z:a.z+(b.z-a.z)*t-origin.z,
        y:sampleTransportSurfaceAtDistance(feature.transportSurfaceModel,distance,0),
        tx:(b.x-a.x)/length,tz:(b.z-a.z)/length };
    };
    const ring=(p,tx=p.tx,tz=p.tz)=>TUNNEL_SECTION_LATERAL.map((lateral,i)=>[
      p.x-tz*lateral*halfWidth,p.y+TUNNEL_SECTION_HEIGHT[i]*model.clearance,p.z+tx*lateral*halfWidth]);
    for(const range of model.shellRanges){
      const distances=[range.start,range.end,...Array.from(path.distances).filter(d=>d>range.start&&d<range.end),
        ...Array.from(feature.transportSurfaceModel.distances).filter(d=>d>range.start&&d<range.end)];
      // The source path and sampled profile use different float precisions.
      // Coalesce sub-millimetre duplicates BEFORE constructing sweeps; skipping
      // a tiny sweep afterward would leave a thin, real air-space gap/cap.
      const stations=distances.sort((a,b)=>a-b).filter((d,i,all)=>!i||d-all[i-1]>.001);
      if(range.end-stations.at(-1)<.001)stations[stations.length-1]=range.end;
      else stations.push(range.end);
      // One indexed closed sweep shares station vertices. Unioning hundreds of
      // separately hulled, merely touching prisms leaves numerical cap slivers.
      const rings=stations.map((d,i)=>{
        const p=sample(d);
        if(i===0||i===stations.length-1)return ring(p);
        const before=sample(Math.max(range.start,d-.001)),after=sample(Math.min(range.end,d+.001));
        const tx=before.tx+after.tx,tz=before.tz+after.tz,length=Math.hypot(tx,tz);
        if(length<.2)throw new Error('Tunnel sweep reverses at an unresolved bend');
        return ring(p,tx/length,tz/length);
      });
      sweeps.push(rings);
      for(const [distance,endpoint] of [[range.start,'start'],[range.end,'end']]){
        const p=sample(distance), points=ring(p);
        const atEndpoint=endpoint==='start'?distance<.15:distance>model.total-.15;
        const linked=atEndpoint&&(feature.connectedFeatures?.[endpoint]||[]).some(link=>members.has(link.feature)&&solidConnectionCompatible(feature,endpoint,link.feature));
        if(linked){
          if(!endRings.has(feature))endRings.set(feature,{});
          endRings.get(feature)[endpoint]=points;
        }else mouths.push({x:p.x,y:p.y,z:p.z,tx:p.tx,tz:p.tz,halfWidth,clearance:model.clearance});
      }
    }
  }
  const joins=new Set();
  for(const [feature,ends] of endRings)for(const endpoint of ['start','end']){
    if(!ends[endpoint])continue;
    for(const link of feature.connectedFeatures?.[endpoint]||[]){
      const other=link.feature,otherEnds=endRings.get(other);
      if(!otherEnds||!solidConnectionCompatible(feature,endpoint,other))continue;
      const p=endpoint==='start'?feature.pts[0]:feature.pts.at(-1);
      const otherEndpoint=Math.hypot(p.x-other.pts[0].x,p.z-other.pts[0].z)<.3?'start':'end';
      if(!otherEnds[otherEndpoint])continue;
      const key=[`${feature.sourceFeatureId}:${endpoint}`,`${other.sourceFeatureId}:${otherEndpoint}`].sort().join('|');
      if(joins.has(key))continue;joins.add(key);
      pieces.push([...ends[endpoint],...otherEnds[otherEndpoint]]);
    }
  }
  return { origin,pieces,sweeps,mouths };
}

function triangleNormal(a,b,c){
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...n); return length>1e-9?n.map(v=>v/length):null;
}
export function prepareTunnelSolidBoundary(input, result){
  const triangles=[], render=[], walls=[], grid=new Map();
  const vertex=i=>Array.from(result.positions.slice(i*3,i*3+3));
  let entries=0;
  for(let i=0;i<result.indices.length;i+=3){
    const points=[vertex(result.indices[i]),vertex(result.indices[i+1]),vertex(result.indices[i+2])];
    const normal=triangleNormal(...points); if(!normal)continue;
    const mouth=input.mouths.some(m=>points.every(p=>Math.abs((p[0]-m.x)*m.tx+(p[2]-m.z)*m.tz)<.002 &&
      Math.abs(-(p[0]-m.x)*m.tz+(p[2]-m.z)*m.tx)<m.halfWidth+.01));
    const tri={points,normal};
    const index=triangles.push(tri)-1;
    const minX=Math.floor(Math.min(...points.map(p=>p[0]))/CELL),maxX=Math.floor(Math.max(...points.map(p=>p[0]))/CELL);
    const minZ=Math.floor(Math.min(...points.map(p=>p[2]))/CELL),maxZ=Math.floor(Math.max(...points.map(p=>p[2]))/CELL);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      if(++entries>600000)throw new Error('Tunnel boundary spatial budget exceeded');
      const key=`${x}:${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(index);
    }
    if(!mouth && normal[1]>-.5)render.push(tri);
    if(!mouth && Math.abs(normal[1])<.18){
      let pair=[points[0],points[1]],length=0;
      for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){
        const d=Math.hypot(points[a][0]-points[b][0],points[a][2]-points[b][2]);
        if(d>length){length=d;pair=[points[a],points[b]];}
      }
      if(length>.05)walls.push({a:pair[0],b:pair[1],minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1])),normal});
    }
  }
  return {origin:input.origin,triangles,render,walls,grid,volume:result.volume,triangleCount:result.triangles,owner:'compiled-tunnel-solid'};
}

export function queryTunnelSolid(boundary,x,z,y){
  const px=x-boundary.origin.x,pz=z-boundary.origin.z;
  const hits=[];
  for(const index of boundary.grid.get(`${Math.floor(px/CELL)}:${Math.floor(pz/CELL)}`)||[]){
    const {points:[a,b,c]}=boundary.triangles[index];
    const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(det)<1e-9)continue;
    const u=((b[2]-c[2])*(px-c[0])+(c[0]-b[0])*(pz-c[2]))/det;
    const v=((c[2]-a[2])*(px-c[0])+(a[0]-c[0])*(pz-c[2]))/det;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)hits.push(u*a[1]+v*b[1]+(1-u-v)*c[1]);
  }
  const sorted=hits.sort((a,b)=>a-b).filter((v,i,all)=>!i||v-all[i-1]>.002);
  for(let i=0;i<sorted.length-1;i+=2){
    const floorY=sorted[i],ceilingY=sorted[i+1];
    if(!Number.isFinite(y)||(y>=floorY-.5&&y<=ceilingY+.15))return{inside:true,floorY,ceilingY};
  }
  return{inside:false,reason:'outside_compiled_tunnel_solid'};
}

import {carriagewaySegmentPolygon,carriagewayJoinPolygons} from './street-carriageway.js';
import {roadWidthAtSegment} from '../road-cross-section-profile.js?v=1';
import {roadPlacementOffsetWorld} from '../road-units.js';
import {streetEdgeRecipeState as roadState} from './street-edge-policy.js';
export {validateStreetEdgeRecipe} from './street-edge-policy.js';
import {streetEdgePolygonKernel as clip} from './street-edge-bands.js';
import {STREET_POLYGON_GRID_WORLD} from './street-coordinate-grid.js';
// Cover the accepted rounded road outline, then clip back to that SAME owner.
// The construction pad never expands rendered/contact pavement coverage.
const outlinePad=STREET_POLYGON_GRID_WORLD*2;

// Plain, bounded compiler input. Only the private reviewed-source adapter may
// admit it from a live feature; provider tags cannot create physical furniture.
const colorAt=(b,d)=>Math.floor((d+b.phaseMeters)/b.stripeMeters)%2===0?[174,35,27]:[214,208,192];
const liftAt=(b,d)=>Math.max(0,Math.min(b.heightMeters,(d-b.startMeters)*b.heightMeters/b.taperMeters,(b.endMeters-d)*b.heightMeters/b.taperMeters));
export function compileStreetEdgeRecipe(tile){
 if(!tile.segments.some(s=>s.road.edgeBandRecipe)&&!(tile.joins||[]).some(j=>j.road.edgeBandRecipe))return {faces:[],polygons:[]};
 const states=new Map(),state=road=>{if(!states.has(road))states.set(road,roadState(road));return states.get(road);},inner=[],faces=[];
 const add=(a,b,c,color)=>{if(faces.length>=4096)throw Error('street_edge_band_capacity');faces.push({points:[a,b,c],color});};
 const quad=(a,b,c,d,color)=>{add(a,c,b,color);add(b,c,d,color);};
 const active=(s,d)=>s?.recipe.bands.filter(b=>d>=b.startMeters-1e-7&&d<=b.endMeters+1e-7)||[];
 const inset=(piece,bands,unit)=>{const positive=(bands.find(b=>b.side===1)?.widthMeters||0)/unit,negative=(bands.find(b=>b.side===-1)?.widthMeters||0)/unit;return {...piece,wa:piece.wa-positive-negative,wb:piece.wb-positive-negative,halfWidth:piece.halfWidth-(positive+negative)/2,offset:(piece.offset||0)+(positive-negative)/2};};
 for(const segment of tile.segments){
  const s=state(segment.road);if(!s){const p=carriagewaySegmentPolygon(segment);if(p)inner.push(p);continue;}
  const {unit,distances}=s,sourceLength=distances[segment.index+1]-distances[segment.index],start=distances[segment.index]+sourceLength*segment.t0,end=distances[segment.index]+sourceLength*segment.t1;
  // A source span can cross many cells. Bound stations to this cell before
  // inserting metre paint breaks; the source path and its phase stay intact.
  const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length,pad=Math.max(segment.wa,segment.wb)+1;
  let lo=0,hi=1;
  for(const [origin,delta,min,max] of [[segment.a.x,dx,tile.bounds.minX-pad,tile.bounds.maxX+pad],[segment.a.z,dz,tile.bounds.minZ-pad,tile.bounds.maxZ+pad]]){
   if(Math.abs(delta)<1e-12){if(origin<min||origin>max){lo=1;hi=0;break;}continue;}
   const a=(min-origin)/delta,b=(max-origin)/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
  }
  if(lo>=hi)continue;
  const low=start+(end-start)*lo,high=start+(end-start)*hi,breaks=new Set([low,high]);
  for(const b of s.recipe.bands){
   if(b.endMeters<=low||b.startMeters>=high)continue;
   for(const d of [b.startMeters,b.startMeters+b.taperMeters,b.endMeters-b.taperMeters,b.endMeters,(b.startMeters+b.endMeters)/2])if(d>low&&d<high)breaks.add(d);
   const a=Math.max(low,b.startMeters),z=Math.min(high,b.endMeters);
   for(let n=Math.ceil((a+b.phaseMeters)/b.stripeMeters);n*b.stripeMeters-b.phaseMeters<z;n++)breaks.add(n*b.stripeMeters-b.phaseMeters);
  }
  const ordered=[...breaks].sort((a,b)=>a-b),point=d=>{const t=(d-start)/(end-start);return {x:segment.a.x+dx*t,z:segment.a.z+dz*t,w:segment.wa+(segment.wb-segment.wa)*t};};
  for(let i=1;i<ordered.length;i++){
   const a=ordered[i-1],b=ordered[i],bands=active(s,(a+b)/2),p=point(a),q=point(b),piece={...segment,a:p,b:q,wa:p.w,wb:q.w};
   const shape=carriagewaySegmentPolygon(inset(piece,bands,unit));if(shape)inner.push(shape);
   for(const band of bands){
    const row=(p,d)=>{const cap=liftAt(band,d),outer=p.w/2-band.side*(segment.offset||0),inside=outer-band.widthMeters/unit;return [[inside,0],[inside+band.rampMeters/unit*cap/band.heightMeters,cap/unit],[outer+outlinePad,cap/unit]].map(([offset,lift])=>({x:p.x+nx*offset*band.side,z:p.z+nz*offset*band.side,lift}));};
    const r=row(p,a),t=row(q,b),color=colorAt(band,(a+b)/2);
    for(let j=1;j<3;j++)quad(r[j-1],r[j],t[j-1],t[j],color);
   }
  }
 }
 for(const join of tile.joins||[]){
  const s=state(join.road),index=join.road.pts.indexOf(join.point),d=s?.distances[index],bands=Number.isFinite(d)?active(s,d):[];
  const reduced=inset(join,bands,s?.unit||1);inner.push(...carriagewayJoinPolygons(reduced));
  if(!bands.length)continue;
  const ax=join.point.x-join.previous.x,az=join.point.z-join.previous.z,bx=join.next.x-join.point.x,bz=join.next.z-join.point.z,cross=ax*bz-az*bx,side=cross>=0?1:-1,band=bands.find(b=>b.side===side);
  if(!band)continue;
  const cap=liftAt(band,d),width=band.widthMeters/s.unit,ramp=band.rampMeters/s.unit*cap/band.heightMeters;
  for(const polygon of carriagewayJoinPolygons(join)){
   const ring=polygon[0],p=ring[1],q=ring[2];
   const row=point=>{const vx=point[0]-join.point.x,vz=point[1]-join.point.z,radius=Math.hypot(vx,vz);return [radius-width,radius-width+ramp,radius+outlinePad].map((r,i)=>({x:join.point.x+vx*r/radius,z:join.point.z+vz*r/radius,lift:i?cap/s.unit:0}));};
   const a=row(p),b=row(q);for(let i=1;i<3;i++)quad(a[i-1],a[i],b[i-1],b[i],colorAt(band,d));
  }
 }
 if(!faces.length)return {faces,polygons:[]};
 const outerBounds=[[[tile.bounds.minX,tile.bounds.minZ],[tile.bounds.maxX,tile.bounds.minZ],[tile.bounds.maxX,tile.bounds.maxZ],[tile.bounds.minX,tile.bounds.maxZ],[tile.bounds.minX,tile.bounds.minZ]]];
 return {faces,polygons:inner.length?clip.intersection(clip.union(inner[0],...inner.slice(1)),outerBounds):[]};
}

export function streetEdgeStationFractions(road,index,t0=0,t1=1){
 const state=roadState(road);if(!state)return [];
 const start=state.distances[index],length=state.distances[index+1]-start,points=[];
 if(!(length>0))return points;
 for(const b of state.recipe.bands)for(const distance of [b.startMeters,b.startMeters+b.taperMeters,b.endMeters-b.taperMeters,b.endMeters,(b.startMeters+b.endMeters)/2]){
  const t=(distance-start)/length;if(t>t0&&t<t1)points.push((t-t0)/(t1-t0));
 }
 return points;
}

export function streetEdgeLateralKnots(road,index,t,widthMeters){
 const state=roadState(road);if(!state)return [];
 const distance=state.distances[index]+(state.distances[index+1]-state.distances[index])*t,
  width=roadWidthAtSegment(road,index,t)*state.unit,offset=roadPlacementOffsetWorld(road)*state.unit,points=[];
 for(const side of [-1,1]){
  const bands=state.recipe.bands.filter(b=>b.side===side);if(!bands.length)continue;
  const band=bands.find(b=>distance>=b.startMeters&&distance<=b.endMeters)||bands[0],cap=liftAt(band,distance),inside=width/2-side*offset-band.widthMeters;
  for(const position of [inside,inside+band.rampMeters*cap/band.heightMeters]){
   const offsetMeters=side*position;points.push(Math.max(-widthMeters/2,Math.min(widthMeters/2,offsetMeters)));
  }
 }
 return points;
}

export function streetEdgeIntervalHasLift(road,index,t0,t1){
 const state=roadState(road);if(!state)return false;
 const start=state.distances[index],length=state.distances[index+1]-start;
 return state.recipe.bands.some(b=>Math.max(b.startMeters,start+length*t0)<Math.min(b.endMeters,start+length*t1)-1e-6);
}

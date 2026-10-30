import {streetEdgeRecipeState,validateStreetEdgeRecipe} from './street-edge-policy.js';
import {streetEdgePolygonKernel as clip} from './street-edge-bands.js';
import {STREET_POLYGON_GRID_WORLD} from './street-coordinate-grid.js';
const bounds=polygons=>{
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const polygon of polygons)for(const ring of polygon)for(const [x,z]of ring){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 return {minX,maxX,minZ,maxZ};
};
const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;

// Compiler-only preparation on copied road DTOs. A raised band ends and tapers
// before another pavement footprint clears it; clipping a nonzero roof at that
// clearing would otherwise leave a physical step across a driveable junction.
export function prepareStreetEdgeClearances(tiles,segmentPolygon,joinPolygons){
 const states=new Map(),cuts=new Map(),shapes=new WeakMap();let probes=0;
 const state=road=>{if(!states.has(road))states.set(road,streetEdgeRecipeState(road));return states.get(road);};
 const shape=(item,isJoin)=>{
  if(!shapes.has(item)){const polygons=isJoin?joinPolygons(item):[segmentPolygon(item)].filter(Boolean);shapes.set(item,{polygons,bounds:bounds(polygons)});}
  return shapes.get(item);
 };
 for(const tile of tiles){
  const targets=tile.segments.filter(s=>s.road.edgeBandRecipe?.bands.length);if(!targets.length)continue;
  const others=[...tile.segments.map(item=>({item,isJoin:false})),...(tile.joins||[]).map(item=>({item,isJoin:true}))];
  for(const target of targets){
   const s=state(target.road),sourceLength=s.distances[target.index+1]-s.distances[target.index],start=s.distances[target.index]+sourceLength*target.t0,end=s.distances[target.index]+sourceLength*target.t1,
    dx=target.b.x-target.a.x,dz=target.b.z-target.a.z,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;
   for(const band of s.recipe.bands){
    const low=Math.max(start,band.startMeters),high=Math.min(end,band.endMeters);if(high-low<1e-6)continue;
    const at=d=>{const t=(d-start)/(end-start),x=target.a.x+dx*t,z=target.a.z+dz*t,w=target.wa+(target.wb-target.wa)*t,outer=w/2-band.side*(target.offset||0),inside=outer-band.widthMeters/s.unit,pad=STREET_POLYGON_GRID_WORLD*2;return [[x+nx*inside*band.side,z+nz*inside*band.side],[x+nx*(outer+pad)*band.side,z+nz*(outer+pad)*band.side]];},a=at(low),b=at(high),ring=[a[0],a[1],b[1],b[0],a[0]],polygon=[ring],box=bounds([polygon]);
    for(const {item,isJoin}of others){
     if(item.road===target.road)continue;
     const other=shape(item,isJoin);if(!overlaps(box,other.bounds))continue;
     if(++probes>250000)throw Error('street_edge_clearance_capacity');
     const intersection=clip.intersection(polygon,other.polygons);if(!intersection.length)continue;
     let from=Infinity,to=-Infinity;
     for(const polygon of intersection)for(const ring of polygon)for(const [x,z]of ring){const t=Math.max(0,Math.min(1,((x-target.a.x)*dx+(z-target.a.z)*dz)/(length*length))),distance=start+(end-start)*t;from=Math.min(from,distance);to=Math.max(to,distance);}
     if(!Number.isFinite(from)||to<from)continue;
     // A two-centimetre construction allowance contains the existing polygon
     // and Float32 boundary precision; it does not change pavement coverage.
     let roadCuts=cuts.get(target.road);if(!roadCuts)cuts.set(target.road,roadCuts=[]);roadCuts.push({side:band.side,from:from-.02,to:to+.02});
    }
   }
  }
 }
 for(const [road,roadCuts]of cuts){
  const s=state(road),merged=[];
  for(const side of[-1,1])for(const cut of roadCuts.filter(c=>c.side===side).sort((a,b)=>a.from-b.from)){
   const previous=merged.at(-1);if(previous?.side===side&&cut.from<=previous.to+.001)previous.to=Math.max(previous.to,cut.to);else merged.push({...cut});
  }
  const bands=[];
  for(const band of s.recipe.bands){
   let fragments=[[band.startMeters,band.endMeters]],changed=false;
   for(const cut of merged){if(cut.side!==band.side)continue;const next=[];for(const [from,to]of fragments){if(cut.to<=from||cut.from>=to){next.push([from,to]);continue;}changed=true;if(cut.from>from)next.push([from,cut.from]);if(cut.to<to)next.push([cut.to,to]);}fragments=next;}
   for(const [startMeters,endMeters]of fragments)if(!changed||endMeters-startMeters>=4)bands.push({...band,startMeters,endMeters});
  }
  const recipe={...road.edgeBandRecipe,sourceLengthMeters:s.distances.at(-1),bands};validateStreetEdgeRecipe(recipe);road.edgeBandRecipe=recipe;
 }
}

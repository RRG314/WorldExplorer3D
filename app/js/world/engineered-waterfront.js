import {pointInWaterBody} from './water-surface-registry.js?v=3';

const owners=new WeakMap();
const CELL=64;
const distance=(x,z,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
};

// Baltimore's built Inner Harbor edge is a quay, visible in the Aquarium's
// public campus photography. This is a bounded presentation interpretation of
// the mapped shoreline, not surveyed bathymetry or a rule for natural coasts.
export function reviewedQuayDistrict(point) {
  return point?.lat>=39.2829 && point.lat<=39.2868 && point.lon>=-76.6146 && point.lon<=-76.605;
}

export function compileEngineeredWaterfront({areas=[],facilities=[],worldToLatLon=()=>null}={}) {
  const mapped=facilities.filter(r=>r.type==='quay' && r.geometry?.points?.length>=2);
  const explicit=[];
  for(const record of mapped){
    const p=record.geometry.points;
    for(let i=1;i<p.length;i++)explicit.push({a:p[i-1],b:p[i],id:record.id});
    if(record.geometry.kind==='polygon')explicit.push({a:p.at(-1),b:p[0],id:record.id});
  }
  const segments=[],cells=new Map(),seen=new Set();
  const wet=(x,z)=>areas.some(a=>{
    const b=a.bounds;
    return (!b||x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ)&&pointInWaterBody(a,x,z);
  });
  for(const area of areas)for(const ring of [area.pts,...(area.holes||[])]){
    if(!ring?.length)continue;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(length<.4)continue;
      // Segment limits keep a source tile boundary from turning into a wall
      // spanning an unmapped region. Both sides must also disagree about water.
      const pieces=Math.ceil(length/20);
      for(let j=0;j<pieces;j++){
        const p={x:a.x+dx*j/pieces,z:a.z+dz*j/pieces},q={x:a.x+dx*(j+1)/pieces,z:a.z+dz*(j+1)/pieces};
        const x=(p.x+q.x)/2,z=(p.z+q.z)/2;
        const quay=explicit.find(s=>distance(x,z,s.a,s.b)<=4);
        if(!quay&&!reviewedQuayDistrict(worldToLatLon(x,z)))continue;
        let nx=-dz/length,nz=dx/length;
        const left=wet(x+nx*2,z+nz*2),right=wet(x-nx*2,z-nz*2);
        if(left===right)continue;
        if(left){nx=-nx;nz=-nz;}
        // nx/nz points toward dry land; preserve the existing water footprint.
        const endpoints=[`${p.x.toFixed(2)},${p.z.toFixed(2)}`,`${q.x.toFixed(2)},${q.z.toFixed(2)}`].sort().join('|');
        if(seen.has(endpoints))continue;seen.add(endpoints);
        const segment={a:p,b:q,nx,nz,area,evidence:quay?'mapped-quay':'reviewed-inner-harbor-quay',sourceId:quay?.id||area.registryId};
        segments.push(segment);
        for(let cx=Math.floor((Math.min(p.x,q.x)-24)/CELL);cx<=Math.floor((Math.max(p.x,q.x)+24)/CELL);cx++)
          for(let cz=Math.floor((Math.min(p.z,q.z)-24)/CELL);cz<=Math.floor((Math.max(p.z,q.z)+24)/CELL);cz++){
            const key=`${cx},${cz}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
          }
      }
    }
  }
  return {segments,bedDepthAt(area,x,z){
    let nearest=Infinity;
    for(const s of cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`)||[])
      if(s.area===area)nearest=Math.min(nearest,distance(x,z,s.a,s.b));
    if(nearest>=24)return 0;
    const t=nearest/24;
    return 3*(1-t*t*(3-2*t));
  }};
}

export function publishEngineeredWaterfront(ctx) {
  const owner=compileEngineeredWaterfront({areas:ctx.waterAreas,facilities:ctx.transportFacilityGraph?.records,worldToLatLon:ctx.worldToLatLon});
  owners.set(ctx,owner);return {segments:owner.segments.length};
}
export function engineeredWaterfrontFor(ctx){return owners.get(ctx)||null;}
export function clearEngineeredWaterfront(ctx){owners.delete(ctx);}

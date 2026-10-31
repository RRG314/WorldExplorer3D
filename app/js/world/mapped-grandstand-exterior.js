const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
function clip(ring,distance){const out=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],da=distance(a),db=distance(b),ia=da>=-1e-9,ib=db>=-1e-9;if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}}return out;}
export function createMappedGrandstandBody(T,plan,{root,local,world,center,footprint,floor,bottom}){
 const {unit}=plan,materials=[0xc5c7c3,0x87959c,plan.seatColor||0x8397a4].map((color,i)=>{const m=new T.MeshStandardMaterial({color,roughness:i?.65:.94,metalness:i?.45:0,side:T.DoubleSide});m.color.convertSRGBToLinear();return m;}),
  triangles=T.ShapeUtils.triangulateShape(local.map(p=>new T.Vector2(p.u,p.v)),[]).map(ids=>ids.map(i=>local[i])),low=Math.min(...local.map(p=>p.v)),high=Math.max(...local.map(p=>p.v)),mid=local.reduce((n,p)=>n+p.u/local.length,0),
  distance=p=>Math.min(...plan.pitRoad.pts.slice(1).map((b,i)=>{const a=plan.pitRoad.pts[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);})),
  direction=distance(world(mid,low))<distance(world(mid,high))?1:-1,front=direction>0?low:high,span=high-low,f=p=>direction*(p.v-front)/span;
 function level(detail){
  const group=new T.Group(),buffers=materials.map(()=>[]),vertex=(p,y)=>{const q=world(p.u,p.v);return [q.x-center.x,y/unit,q.z-center.z];},
   polygon=(p,y,mat)=>{for(let i=1;i<p.length-1;i++)buffers[mat].push(...vertex(p[0],y),...vertex(p[i],y),...vertex(p[i+1],y));},
   wall=(a,b,lo,hi,mat)=>buffers[mat].push(...vertex(a,lo),...vertex(b,lo),...vertex(b,hi),...vertex(a,lo),...vertex(b,hi),...vertex(a,hi));
  const totalRows=plan.rows||12,rows=detail?totalRows:Math.min(6,totalRows),stride=totalRows/rows,tierHeight=totalRows*.3;
  for(let row=0;row<rows;row++){
   const lo=.12+row/rows*.66,hi=.12+(row+1)/rows*.66,y=.3*(row+1)*stride;
   for(const t of triangles){const part=clip(clip(t,p=>f(p)-lo),p=>hi-f(p));polygon(part,y,0);
    for(let i=0;i<part.length;i++){const a=part[i],b=part[(i+1)%part.length];if(Math.abs(f(a)-lo)<1e-7&&Math.abs(f(b)-lo)<1e-7)wall(a,b,y-.3*stride,y,0);}
    if(detail){const bench=clip(clip(t,p=>f(p)-(lo+.3*(hi-lo))),p=>lo+.65*(hi-lo)-f(p));polygon(bench,y+.38,2);for(let i=0;i<bench.length;i++){const a=bench[i],b=bench[(i+1)%bench.length];if(Math.abs(f(a)-(lo+.3*(hi-lo)))<1e-7&&Math.abs(f(b)-(lo+.3*(hi-lo)))<1e-7)wall(a,b,y+.28,y+.38,2);}}
   }
  }
  for(const t of triangles){polygon(clip(t,p=>.12-f(p)),.3,0);polygon(clip(t,p=>f(p)-.78),tierHeight,0);}
  // Narrow rail panels stay on the clipped rear platform, rather than a box
  // across an indented source gap. All dimensions are exterior estimates.
  for(const t of triangles)polygon(clip(clip(t,p=>f(p)-.805),p=>.81-f(p)),tierHeight+.75,1);
  if(detail){const v=front+direction*.8075*span,lo=Math.min(...local.map(p=>p.u)),hi=Math.max(...local.map(p=>p.u));for(let u=lo+.5;u<hi-.5;u+=4){if(!inside(world(u,v),footprint))continue;wall({u:u-.04,v},{u:u+.04,v},tierHeight,tierHeight+.75,1);wall({u,v:v-.04},{u,v:v+.04},tierHeight,tierHeight+.75,1);}}

  for(let i=0;i<local.length;i++){const a=local[i],b=local[(i+1)%local.length],cuts=[0,1];for(let j=0;j<=rows;j++){const at=.12+j/rows*.66,t=(at-f(a))/(f(b)-f(a));if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
   for(let j=1;j<cuts.length;j++){const point=t=>({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t}),p=point(cuts[j-1]),q=point(cuts[j]),fraction=(f(p)+f(q))/2,y=fraction<.12?.3:fraction>=.78?tierHeight:.3*stride*Math.ceil((fraction-.12)/.66*rows);wall(p,q,0,y,0);}
  }
  if(plan.covered){
   const roofY=p=>tierHeight+3.2+f(p)*1.4;
   for(const t of triangles){for(const p of t)buffers[1].push(...vertex(p,roofY(p)));for(const p of [...t].reverse())buffers[1].push(...vertex(p,roofY(p)-.16));}
   const u0=Math.min(...local.map(p=>p.u)),u1=Math.max(...local.map(p=>p.u));
   for(let u=u0+.3;u<u1-.2;u+=detail?7:14)for(const fraction of [.035,.94]){const v=front+direction*fraction*span,p={u,v};if(!inside(world(u,v),footprint))continue;wall({u:u-.07,v:v-.07},{u:u+.07,v:v+.07},0,roofY(p)-.16,1);}
  }
  buffers.forEach((values,i)=>{if(!values.length)return;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(values,3));g.computeVertexNormals();const m=new T.Mesh(g,materials[i]);m.name=i===0?'Paddock viewing terraces':'Paddock terrace trim';m.castShadow=m.receiveShadow=true;group.add(m);});return group;
 }
 const lod=new T.LOD();lod.addLevel(level(true),0);lod.addLevel(level(false),330/unit);lod.addLevel(new T.Group(),1100/unit);root.add(lod);
 root.userData.sourceClaim=plan.sourceClaim||'Pinned Overture 2026-09-23.1 plan; NAIP low viewing tiers; original estimated rows, benches and rails; no interior admission';
 root.userData.architecture={kind:plan.kind,garages:0,rows:plan.rows||12,closedServiceBays:0,roofBays:0,lodLevels:3,eavesMeters:plan.eavesMeters,ridgeMeters:plan.ridgeMeters};
 return {root,footprint,bottom,top:floor+plan.ridgeMeters/unit,sourceBuildingId:plan.sourceBuildingId};
}

// Sparse draft geometry only. Heights, admission and timing stay with the
// published world and course owners. Recorded steering is never track geometry.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function normalizeGroundRaceDraft(value){
 if(value?.version!==1||!Array.isArray(value.anchors)||value.anchors.length<2||value.anchors.length>80||value.anchors.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.hypot(p.x,p.z)>1200)||![6,8,10,12].includes(value.widthMeters)||typeof value.closed!=='boolean')throw Error('race_invalid_ground_draft');
 return {version:1,widthMeters:value.widthMeters,closed:value.closed,anchors:value.anchors.map(p=>({x:p.x,z:p.z}))};
}
export function simplifyRaceDrive(points,tolerance=2.5){
 if(points.length<3)return points.map(p=>({x:p.x,z:p.z}));
 const a=points[0],b=points.at(-1),dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz;let far=0,index=0;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/n)):0,d=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);if(d>far){far=d;index=i;}}
 return far>tolerance?[...simplifyRaceDrive(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyRaceDrive(points.slice(index),tolerance)]:[{x:a.x,z:a.z},{x:b.x,z:b.z}];
}
export function cleanGroundRaceLayout(raw,metersPerUnit=1){
 const draft=normalizeGroundRaceDraft(raw),anchors=[...draft.anchors];
 if(draft.closed&&distance(anchors[0],anchors.at(-1))*metersPerUnit<2)anchors.pop();
 if(anchors.length<(draft.closed?3:2))throw Error('race_route_length');
 for(let i=1;i<anchors.length;i++)if(distance(anchors[i-1],anchors[i])*metersPerUnit<12)throw Error('race_anchors_too_close');
 const out=[],add=p=>{if(!out.length||distance(out.at(-1),p)*metersPerUnit>.1)out.push({x:p.x,z:p.z});};
 for(let i=0;i<anchors.length;i++){
  const p=anchors[i],before=anchors[(i-1+anchors.length)%anchors.length],after=anchors[(i+1)%anchors.length];
  if(!draft.closed&&(i===0||i===anchors.length-1)){add(p);continue;}
  const a=distance(p,before),b=distance(p,after),ux=(p.x-before.x)/a,uz=(p.z-before.z)/a,vx=(after.x-p.x)/b,vz=(after.z-p.z)/b;
  if(ux*vx+uz*vz<-.3)throw Error('race_turn_too_sharp');
  const trim=Math.min(a*.24,b*.24,24/metersPerUnit),start={x:p.x-ux*trim,z:p.z-uz*trim},end={x:p.x+vx*trim,z:p.z+vz*trim};
  add(start);const steps=Math.max(2,Math.ceil(trim*2*metersPerUnit/4));
  for(let j=1;j<=steps;j++){const t=j/steps,u=1-t;add({x:u*u*start.x+2*u*t*p.x+t*t*end.x,z:u*u*start.z+2*u*t*p.z+t*t*end.z});}
 }
 if(draft.closed){let start=0,longest=0;for(let i=0;i<out.length;i++){const d=distance(out[i],out[(i+1)%out.length]);if(d>longest){longest=d;start=i;}}out.push(...out.splice(0,start));add(out[0]);}
 const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
 for(let i=1;i<out.length;i++)for(let j=i+2;j<out.length;j++){
  if(draft.closed&&i===1&&j===out.length-1)continue;
  const a=out[i-1],b=out[i],c=out[j-1],d=out[j];
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)throw Error('race_route_self_crossing');
 }
 return out;
}
// Record graph spans only while the real driver is on them. Routing between
// distant samples would invent a journey the player never drove.
export function recordRaceRoadSpan(graph,pose,previous){
 let best=null;
 for(const edge of graph.edges){const a=graph.nodes[edge.from],b=graph.nodes[edge.to],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((pose.x-a.x)*dx+(pose.z-a.z)*dz)/(dx*dx+dz*dz))),y=a.y+(b.y-a.y)*t;
  if(Math.abs(y-pose.y)*graph.metersPerUnit>2.5)continue;
  const error=Math.hypot(pose.x-a.x-dx*t,pose.z-a.z-dz*t)*graph.metersPerUnit,heading=Math.sin(pose.yaw)*dx+Math.cos(pose.yaw)*dz;
  if(error>edge.widthMeters/2||heading<=0)continue;
  if(previous&&previous.id!==edge.id&&previous.to!==edge.from)continue;
  if(!best||error<best.error)best={edge,error};
 }
 return best?.edge||null;
}

export function recordedGroundRaceDraft(points,metersPerUnit=1){
 const rawMeters=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p)*metersPerUnit,0),closed=points.length>2&&rawMeters>=200&&distance(points[0],points.at(-1))*metersPerUnit<=10;
 let tolerance=3,anchors=simplifyRaceDrive(points,tolerance/metersPerUnit);
 while(anchors.length>80&&tolerance<24){tolerance=Math.min(24,tolerance*1.5);anchors=simplifyRaceDrive(points,tolerance/metersPerUnit);}
 if(closed)while(anchors.length>3&&distance(anchors[0],anchors.at(-1))*metersPerUnit<12)anchors.pop();
 if(anchors.length>2){const cleaned=[anchors[0]];for(const p of anchors.slice(1,-1))if(distance(cleaned.at(-1),p)*metersPerUnit>=12)cleaned.push(p);
  const end=anchors.at(-1);while(cleaned.length>1&&distance(cleaned.at(-1),end)*metersPerUnit<12)cleaned.pop();cleaned.push(end);anchors=cleaned;}
 return {anchors,closed,rawMeters};
}
export function recordedRoadRacePath(path,graph){
 const edges=new Map(graph.edges.map(e=>[e.id,e])),first=edges.get(path[0]);if(!first)return [];
 const repeated=path.indexOf(path[0],1);
 if(repeated>0&&edges.get(path[repeated-1])?.to===first.from&&path.slice(repeated).every((id,i)=>id===path[i%repeated]))return path.slice(0,repeated);
 return [...path];
}

// Shared spatial definition: render surfaces, collision, maps and routes use these polygons.
export const ring = Object.freeze({hullRadius:39, corridorInner:20, corridorOuter:23.6, coreRadius:5, deckHeight:3.6});
const definitions = {
 command:['bridge','communications','sensor-control','briefing','observation-gallery','analysis-data','science','navigation-cartography'],
 habitat:['galley-wardroom','exercise-bay','quarters-starboard','life-support','hydroponics','hygiene-waste','quarters','medical'],
 engineering:['engineering','power-control','thermal-control','cargo-hold','local-craft-bay','eva-airlock','resource-processing','cargo-fabrication']
};
export function polar(radius,angle){return {x:Math.sin(angle)*radius,z:Math.cos(angle)*radius};}
export function sector(inner,outer,start,end,steps=16){
 const points=[];
 for(let i=0;i<=steps;i++)points.push(polar(outer,start+(end-start)*i/steps));
 for(let i=steps;i>=0;i--)points.push(polar(inner,start+(end-start)*i/steps));
 return points;
}
export const decks=Object.freeze(Object.entries(definitions).map(([id,ids])=>({
 id,rooms:ids.map((id,index)=>{
  const angle=index*Math.PI/4, half=Math.PI/8;
  return {id,angle,polygon:sector(ring.corridorOuter,ring.hullRadius,angle-half+.006,angle+half-.006),door:polar(ring.corridorOuter,angle),center:polar(31,angle),exterior:id==='local-craft-bay'||id==='bridge'||id==='observation-gallery'};
 }),
 spokes:[0,Math.PI/2,Math.PI,3*Math.PI/2].map(angle=>({from:polar(ring.coreRadius,angle),to:polar(21.8,angle)})),
 innerRooms:id==='habitat'?[{id:'storm-shelter',polygon:sector(6,18,Math.PI+.18,Math.PI*1.5-.18),center:polar(12,Math.PI*1.25)}]:[]
})));

export function bounds(points) {
 return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};
}
export function pointInRoom(point,room) {
 const p=room.polygon;let inside=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].z>point.z)!==(p[j].z>point.z)&&point.x<(p[j].x-p[i].x)*(point.z-p[i].z)/(p[j].z-p[i].z)+p[i].x)inside=!inside;
 return inside;
}
export function ringRoute(from,to,fromRoom=null,toRoom=null) {
 const route=[from];
 let start=fromRoom?.door||from, end=toRoom?.door||to;
 if(fromRoom)route.push(start);
 if(!fromRoom&&Math.hypot(start.x,start.z)<ring.corridorInner){const a=Math.round(Math.atan2(start.x,start.z)/(Math.PI/2))*Math.PI/2;route.push({x:0,z:0});start=polar(21.8,a);route.push(start);}
 const a=Math.atan2(start.x,start.z), b=Math.atan2(end.x,end.z);
 const delta=Math.atan2(Math.sin(b-a),Math.cos(b-a));const count=Math.max(1,Math.ceil(Math.abs(delta)/.08));
 route.push(polar(21.8,a));
 for(let i=1;i<=count;i++)route.push(polar(21.8,a+delta*i/count));
 if(toRoom)route.push(toRoom.door);
 route.push(to);return route;
}
export function templatePoint(room,point) {
 const old=room.template, c=room.center;
 const x=(point.x-(old.minX+old.maxX)/2)*room.fitScale;
 const z=(point.z-(old.minZ+old.maxZ)/2)*room.fitScale;
 return {x:c.x+Math.cos(room.kitYaw)*x+Math.sin(room.kitYaw)*z,z:c.z-Math.sin(room.kitYaw)*x+Math.cos(room.kitYaw)*z};
}
export function compileRingDecks(templates) {
 return templates.map(deck=>{
  const plan=decks.find(d=>d.id===deck.id);
  const rooms=deck.rooms.map(template=>{
   const layout=[...plan.rooms,...plan.innerRooms].find(r=>r.id===template.id);
   const inner=plan.innerRooms.includes(layout);
   const angle=layout.angle??Math.PI*1.25;
   const room={...template,...layout,angle,template,fitScale:inner?.65:template.side==='full'?.72:1,...bounds(layout.polygon)};
   room.kitYaw=angle+(template.side==='port'?Math.PI/2:template.side==='starboard'?-Math.PI/2:template.maxZ<0?Math.PI:0)+(inner?Math.PI:0);
   room.door=layout.door||polar(18,angle);return Object.freeze(room);
  });
  const stations=deck.stations.map(s=>({...s,...templatePoint(rooms.find(r=>r.id===s.roomId),s)}));
  return Object.freeze({...deck,rooms:Object.freeze(rooms),stations:Object.freeze(stations)});
 });
}

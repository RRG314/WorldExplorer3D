import * as bundled from './vendor/polygon-clipping/index.js';
const polygons = bundled.default || globalThis.polygonClipping;
export {polygons};

// One metric layout feeds browser preview, server validation and game geometry.
// Polygon booleans are vendored once for identical browser/backend behavior.
export const LAYOUT_VERSION = 1;
const EPS = 1e-6;
const fail = message => { throw new Error(message); };
const finite = (n, lo, hi, label) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : fail(`Invalid ${label}.`);
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_:~-]{1,120}$/.test(value) ? value : fail('Invalid layout identity.');
const pairs = ring => ring.map(p => [p.x, p.z]);
export const polygonArea = ring => Math.abs(ring.reduce((s,p,i) => { const q=ring[(i+1)%ring.length]; return s+p.x*q.z-q.x*p.z; },0)/2);
function multiArea(multi) { return multi.reduce((s,poly)=>s+poly.reduce((a,r,i)=>a+(i?-1:1)*polygonArea(r.map(([x,z])=>({x,z}))),0),0); }
const region = ring => [pairs(ring)];
const cross = (a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function intersects(a,b,c,d) {
  const on=(p,q,r)=>Math.abs(cross(p,q,r))<EPS && r.x>=Math.min(p.x,q.x)-EPS && r.x<=Math.max(p.x,q.x)+EPS && r.z>=Math.min(p.z,q.z)-EPS && r.z<=Math.max(p.z,q.z)+EPS;
  return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
export function validateRing(ring) {
  if(!Array.isArray(ring)||ring.length<3||ring.length>128)fail('A room needs 3–128 corners.');
  const points=ring.map(p=>({x:finite(p.x,-10000,10000,'corner X'),z:finite(p.z,-10000,10000,'corner Z')}));
  if(polygonArea(points)<.05)fail('Room outline has no usable area.');
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if(Math.hypot(a.x-b.x,a.z-b.z)<.02)fail('Two corners are too close.');
    for(let j=i+1;j<points.length;j++)if(j!==i+1&&!(i===0&&j===points.length-1)&&intersects(a,b,points[j],points[(j+1)%points.length]))fail('Room walls cross. Move the corner back inside the outline.');
  }
  return points;
}
export function containsRegion(outer, inner, holes=[]) {
  return multiArea(polygons.difference(region(inner),[pairs(outer),...holes.map(pairs)]))<EPS;
}
export function pointInRoom(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
export function roomInteriorPoint(ring){
  const minX=Math.min(...ring.map(p=>p.x)),minZ=Math.min(...ring.map(p=>p.z)),width=Math.max(...ring.map(p=>p.x))-minX,depth=Math.max(...ring.map(p=>p.z))-minZ;let best=null,clearance=0;
  for(let ix=0;ix<25;ix++)for(let iz=0;iz<25;iz++){const p={x:minX+width*(ix+.5)/25,z:minZ+depth*(iz+.5)/25};if(!pointInRoom(p,ring))continue;const distance=Math.min(...ring.map((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}));if(distance>clearance){clearance=distance;best=p;}}
  return clearance>=.34?best:null;
}
export function assertPlayableLayout(layout){
  if(!layout.floors.some(f=>f.rooms.length))fail('Draw a room and place its entrance before walking through.');
  const links=new Map(layout.floors.flatMap(f=>f.rooms.map(r=>[r.id,new Set()]))),entries=[];
  for(const floor of layout.floors)for(const door of floor.doors){const wall=floorWalls(floor).find(w=>w.id===door.wall);if(door.entry)entries.push(wall.rooms[0]);if(wall.rooms.length===2){links.get(wall.rooms[0]).add(wall.rooms[1]);links.get(wall.rooms[1]).add(wall.rooms[0]);}}
  for(const stair of layout.stairs){const from=layout.floors.find(f=>f.id===stair.from),to=layout.floors.find(f=>f.id===stair.to),a=from.rooms.find(r=>pointInRoom(stair.path[0],roomRing(from,r))),b=to.rooms.find(r=>pointInRoom(stair.path.at(-1),roomRing(to,r)));if(!a||!b)fail('Stairs need a reachable landing in each room.');links.get(a.id).add(b.id);links.get(b.id).add(a.id);}
  if(!entries.length)fail('Add a home entrance before walking through.');
  const visited=new Set(entries),queue=[...entries];while(queue.length){for(const id of links.get(queue.shift()))if(!visited.has(id)){visited.add(id);queue.push(id);}}
  if(visited.size!==links.size)fail('Some rooms have no route to the entrance. Add a doorway or stairs before walking through.');
  return true;
}
function rect(a,b,width) {
  const length=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/length*width/2,nz=(b.x-a.x)/length*width/2;
  return [{x:a.x+nx,z:a.z+nz},{x:b.x+nx,z:b.z+nz},{x:b.x-nx,z:b.z-nz},{x:a.x-nx,z:a.z-nz}];
}
function stairParts(stair,from,to){
  const path=stair.path,half=stair.width/2,flights=[],landings=[];
  for(let i=1;i<path.length-1;i++){
    const a=path[i-1],b=path[i],c=path[i+1],ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z);
    if(ab<stair.width||bc<stair.width||Math.abs((b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z))>ab*bc*.02)fail('Stair turns need perpendicular flights and room for a full landing.');
  }
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(length<.1)fail('Stair flights need a usable length.');
    const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,start=i?half:0,end=i<path.length-2?half:0;
    const flat=path.length===4&&i===1;
    const part={a:{x:a.x+ux*start,z:a.z+uz*start},b:{x:b.x-ux*end,z:b.z-uz*end},width:stair.width,flat,length:length-start-end};
    if(part.length<.01)fail('Stair flights overlap their landings.');flights.push(part);
  }
  const run=flights.reduce((n,f)=>n+(f.flat?0:f.length),0),rise=to.elevation-from.elevation;
  if(rise/run>.8)fail('Stairs are too steep. Make the flights longer.');
  let traveled=0;
  flights.forEach((f,i)=>{f.y0=from.elevation+rise*traveled/run;if(!f.flat)traveled+=f.length;f.y1=from.elevation+rise*traveled/run;if(i<flights.length-1){const p=path[i+1],u=path[i],length=Math.hypot(p.x-u.x,p.z-u.z),dx=(p.x-u.x)/length*half,dz=(p.z-u.z)/length*half;landings.push({y:f.y1,outline:[{x:p.x-dx+dz,z:p.z-dz-dx},{x:p.x+dx+dz,z:p.z+dz-dx},{x:p.x+dx-dz,z:p.z+dz+dx},{x:p.x-dx-dz,z:p.z-dz+dx}]});}});
  return {flights,landings,cutouts:[...flights.map(f=>rect(f.a,f.b,f.width)),...landings.map(l=>l.outline)]};
}
export function roomRing(floor,room) { return room.vertices.map(id=>floor.vertices[id]||fail('Room references a missing corner.')); }
export function wallKey(a,b) { return [a,b].sort().join('~'); }
export function layoutRoomDescriptor(layout,roomId) {
  const floor=layout.floors.find(f=>f.rooms.some(r=>r.id===roomId));
  if(!floor)fail('Room no longer exists. Its source photos are retained.');
  const room=floor.rooms.find(r=>r.id===roomId),outline=roomRing(floor,room),walls=floorWalls(floor);
  const surfaceIds=room.vertices.map((a,i)=>`${floor.id}:${wallKey(a,room.vertices[(i+1)%room.vertices.length])}:${room.id}`);
  const openings=room.vertices.flatMap((a,i)=>{const b=room.vertices[(i+1)%room.vertices.length],wall=walls.find(w=>w.id===wallKey(a,b)),length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);return floor.doors.filter(d=>d.wall===wall.id).map(d=>({wall:i,offset:wall.from===a?d.offset:length-d.offset,width:d.width,height:d.height}));});
  const cuts=direction=>layout.stairs.filter(s=>s[direction]===floor.id).flatMap(s=>stairParts(s,layout.floors.find(f=>f.id===s.from),layout.floors.find(f=>f.id===s.to)).cutouts);
  return {widthMeters:Math.max(...outline.map(p=>p.x))-Math.min(...outline.map(p=>p.x)),lengthMeters:Math.max(...outline.map(p=>p.z))-Math.min(...outline.map(p=>p.z)),heightMeters:floor.height,outline,openings,wallInset:.052,floorCutouts:cuts('to'),ceilingCutouts:cuts('from'),elevation:floor.elevation,surfaceIds:[...surfaceIds,`${room.id}:floor`,`${room.id}:ceiling`]};
}
export function floorWalls(floor) {
  const walls=new Map();
  for(const room of floor.rooms)room.vertices.forEach((from,i)=>{
    const to=room.vertices[(i+1)%room.vertices.length],id=wallKey(from,to);
    if(!walls.has(id))walls.set(id,{id,from,to,a:floor.vertices[from],b:floor.vertices[to],rooms:[]});
    walls.get(id).rooms.push(room.id);
  });
  return [...walls.values()];
}
export function splitRoom(floor,roomId,axis,coordinate){
  if(!['x','z'].includes(axis)||!Number.isFinite(coordinate))fail('Choose a valid room split line.');
  const room=floor.rooms.find(r=>r.id===roomId);if(!room)fail('Select a room first.');
  const oldWalls=floorWalls(floor),oldDoors=floor.doors.map(d=>{const w=oldWalls.find(w=>w.id===d.wall),length=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z);return {...d,point:{x:w.a.x+(w.b.x-w.a.x)*d.offset/length,z:w.a.z+(w.b.z-w.a.z)*d.offset/length}};});
  const ring=roomRing(floor,room),low=-10001,high=10001;
  const clip=upper=>axis==='x'?[[upper?coordinate:low,low],[upper?high:coordinate,low],[upper?high:coordinate,high],[upper?coordinate:low,high]]:[[low,upper?coordinate:low],[high,upper?coordinate:low],[high,upper?high:coordinate],[low,upper?high:coordinate]];
  const pieces=[false,true].map(upper=>polygons.intersection(region(ring),[clip(upper)]));
  if(pieces.some(p=>p.length!==1||p[0].length!==1))fail('This line does not divide the room into two connected rooms. Choose another position.');
  const pointId=([x,z])=>{const known=Object.entries(floor.vertices).find(([,p])=>Math.hypot(p.x-x,p.z-z)<EPS);if(known)return known[0];const id=`v_${crypto.randomUUID().replaceAll('-','')}`;floor.vertices[id]={x,z};return id;};
  const loops=pieces.map(p=>{const pts=p[0][0];if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<EPS)pts.pop();return pts.map(pointId);});
  room.vertices=loops[0];const newRoom={...room,id:`room_${crypto.randomUUID().replaceAll('-','')}`,label:'New room',vertices:loops[1]};floor.rooms.push(newRoom);
  // Split adjoining wall loops at the same vertex, keeping a single shared wall.
  for(const r of floor.rooms)r.vertices=r.vertices.flatMap((id,i)=>{const next=r.vertices[(i+1)%r.vertices.length],a=floor.vertices[id],b=floor.vertices[next],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;const middle=Object.entries(floor.vertices).filter(([key,p])=>key!==id&&key!==next&&Math.abs(cross(a,b,p))<EPS).map(([key,p])=>({key,t:((p.x-a.x)*dx+(p.z-a.z)*dz)/length2})).filter(p=>p.t>EPS&&p.t<1-EPS).sort((a,b)=>a.t-b.t);return [id,...middle.map(p=>p.key)];});
  const walls=floorWalls(floor);
  floor.doors=oldDoors.map(({point,...door})=>{const host=walls.find(w=>{const length=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z);return Math.abs(cross(w.a,w.b,point))<EPS&&Math.hypot(point.x-w.a.x,point.z-w.a.z)+Math.hypot(point.x-w.b.x,point.z-w.b.z)<length+EPS;});if(!host)fail('A doorway crosses this split. Move the doorway first.');return {...door,wall:host.id,offset:Math.hypot(point.x-host.a.x,point.z-host.a.z)};});
  const connecting=walls.find(w=>w.rooms.includes(roomId)&&w.rooms.includes(newRoom.id)&&Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z)>1.2);
  if(!connecting)fail('The new shared wall needs enough space for a doorway.');
  floor.doors.push({id:`door_${crypto.randomUUID().replaceAll('-','')}`,wall:connecting.id,offset:Math.hypot(connecting.b.x-connecting.a.x,connecting.b.z-connecting.a.z)/2,width:.9,height:Math.min(2.05,floor.height),entry:false});
  return newRoom.id;
}
export function normalizeLayout(input,envelope) {
  if(input?.schemaVersion!==LAYOUT_VERSION)fail('Unsupported home layout version.');
  const mappedBoundary=validateRing(envelope.footprint),holes=(envelope.holes||[]).map(validateRing);
  const boundary=input.unitOutline?validateRing(input.unitOutline):mappedBoundary;
  if(input.unitOutline&&!containsRegion(mappedBoundary,boundary,holes))fail('Your home boundary must stay inside the mapped building.');
  const maxHeight=finite(envelope.heightMeters,.5,1200,'building height');
  if(!Array.isArray(input.floors)||input.floors.length<1||input.floors.length>8)fail('Choose between one and eight floors.');
  const ids=new Set(), unique=id=>{identifier(id);if(ids.has(id))fail('Duplicate layout identity.');ids.add(id);return id;};
  const layout={schemaVersion:1,id:identifier(input.id),envelopeRevision:String(envelope.revision||''),unitLabel:String(input.unitLabel||'My home').slice(0,80),...(input.unitOutline?{unitOutline:boundary}:{}),floors:[],stairs:[]};
  for(const source of input.floors){
    const floor={id:unique(source.id),label:String(source.label||'Floor').slice(0,60),elevation:finite(source.elevation,0,maxHeight,'floor elevation'),height:finite(source.height,1.9,6,'ceiling height'),slab:finite(source.slab??.15,.05,.5,'slab thickness'),vertices:{},rooms:[],doors:[]};
    if(floor.elevation+floor.height+floor.slab>maxHeight+EPS)fail(`${floor.label} extends above the supported building height.`);
    if(!source.vertices||Object.keys(source.vertices).length>256)fail('Too many corners on this floor.');
    for(const [id,p] of Object.entries(source.vertices)){identifier(id);floor.vertices[id]={x:finite(p.x,-10000,10000,'corner X'),z:finite(p.z,-10000,10000,'corner Z')};}
    if(!Array.isArray(source.rooms)||source.rooms.length>32)fail('Each floor supports up to 32 rooms.');
    for(const r of source.rooms){
      if(!Array.isArray(r.vertices))fail('Room corners are missing.');
      const room={id:unique(r.id),label:String(r.label||'Room').slice(0,60),type:String(r.type||'room').slice(0,30),vertices:r.vertices.map(identifier)};
      const ring=validateRing(roomRing(floor,room));
      if(!containsRegion(boundary,ring,holes))fail(`${room.label} extends outside the building or into a courtyard.`);
      for(let i=0;i<ring.length;i++)if(!containsRegion(boundary,rect(ring[i],ring[(i+1)%ring.length],.1),holes))fail(`${room.label} needs space for wall thickness inside the building.`);
      for(const existing of floor.rooms)if(multiArea(polygons.intersection(region(ring),region(roomRing(floor,existing))))>EPS)fail(`${room.label} overlaps ${existing.label}.`);
      floor.rooms.push(room);
    }
    const walls=floorWalls(floor);
    for(const w of walls){
      if(w.rooms.length>2)fail('More than two rooms share one wall.');
      for(const q of walls)if(q.id>w.id && ![q.from,q.to].some(v=>v===w.from||v===w.to) && intersects(w.a,w.b,q.a,q.b))fail('Join shared wall corners before saving.');
    }
    if(!Array.isArray(source.doors)||source.doors.length>64)fail('Too many doors.');
    for(const d of source.doors){
      const w=walls.find(w=>w.id===d.wall);if(!w)fail('A door has lost its wall. Undo the wall change or remove the door.');
      const length=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z);
      const door={id:unique(d.id),wall:w.id,offset:finite(d.offset,0,length,'door position'),width:finite(d.width,.7,2.4,'door width'),height:finite(d.height??2.05,1.9,floor.height,'door height'),entry:d.entry===true};
      if(door.offset-door.width/2<.1||door.offset+door.width/2>length-.1)fail('The door needs room on both sides of its frame.');
      if(door.entry&&w.rooms.length!==1)fail('The home entrance must be on an outside wall.');
      if(floor.doors.some(p=>p.wall===door.wall&&Math.abs(p.offset-door.offset)<(p.width+door.width)/2+.1))fail('Door openings overlap.');
      floor.doors.push(door);
    }
    layout.floors.push(floor);
  }
  const sorted=[...layout.floors].sort((a,b)=>a.elevation-b.elevation);
  layout.floors=sorted;
  for(let i=1;i<sorted.length;i++)if(sorted[i].elevation<sorted[i-1].elevation+sorted[i-1].height+sorted[i-1].slab-EPS)fail('Floors overlap vertically.');
  if(!Array.isArray(input.stairs)||input.stairs.length>16)fail('Too many stairs.');
  for(const s of input.stairs){
    const from=layout.floors.find(f=>f.id===s.from),to=layout.floors.find(f=>f.id===s.to);
    if(!from||!to||to.elevation<=from.elevation)fail('Stairs need a lower and an upper floor.');
    if(!Array.isArray(s.path)||s.path.length<2||s.path.length>4)fail('Choose a straight, L or U stair.');
    const stair={id:unique(s.id),from:from.id,to:to.id,width:finite(s.width,.8,2,'stair width'),path:s.path.map(p=>({x:finite(p.x,-10000,10000,'stair X'),z:finite(p.z,-10000,10000,'stair Z')}))};
    const strips=stairParts(stair,from,to).cutouts;
    if(strips.some(r=>!containsRegion(boundary,r,holes)))fail('Stairs extend outside the home.');
    for(const f of [from,to]){
      const union=polygons.union(...f.rooms.map(r=>region(roomRing(f,r))));
      if(strips.some(r=>multiArea(polygons.difference(region(r),union))>EPS))fail('Stairs must fit inside rooms on both floors.');
    }
    layout.stairs.push(stair);
  }
  const compiled=compileLayout(layout);
  for(const ramp of compiled.ramps){
    const occupied=rect(ramp.a,ramp.b,ramp.width);
    for(const wall of compiled.solids){
      if(wall.top<=ramp.y0+.1||wall.bottom>=ramp.y1+1.9)continue;
      if(multiArea(polygons.intersection(region(occupied),region(rect(wall.a,wall.b,wall.thickness))))>EPS)fail('Stairs intersect a wall or lack headroom. Move the stairs or change the wall.');
    }
  }
  return layout;
}

export function compileLayout(layout) {
  const surfaces=[],solids=[],floors=[],ramps=[];
  for(const floor of layout.floors){
    const cuts=direction=>layout.stairs.filter(s=>s[direction]===floor.id).flatMap(s=>stairParts(s,layout.floors.find(f=>f.id===s.from),layout.floors.find(f=>f.id===s.to)).cutouts.map(region));
    const openings=cuts('from');
    for(const room of floor.rooms){
      const ring=roomRing(floor,room);
      // Upper slabs have a real stairwell; the matching lower ceiling is cut too.
      const lowerHoles=cuts('to');
      const floorPolys=lowerHoles.length?polygons.difference(region(ring),...lowerHoles):[region(ring)];
      const ceilingPolys=openings.length?polygons.difference(region(ring),...openings):[region(ring)];
      floors.push({floorId:floor.id,roomId:room.id,y:floor.elevation,polygons:floorPolys});
      surfaces.push({id:`${room.id}:floor`,roomId:room.id,floorId:floor.id,kind:'floor',y:floor.elevation,polygons:floorPolys},{id:`${room.id}:ceiling`,roomId:room.id,floorId:floor.id,kind:'ceiling',y:floor.elevation+floor.height,polygons:ceilingPolys});
    }
    for(const wall of floorWalls(floor)){
      const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),doors=floor.doors.filter(d=>d.wall===wall.id).sort((a,b)=>a.offset-b.offset);
      let start=0;const segments=[];
      for(const d of doors){segments.push([start,d.offset-d.width/2,0,floor.height],[d.offset-d.width/2,d.offset+d.width/2,d.height,floor.height]);start=d.offset+d.width/2;}
      segments.push([start,length,0,floor.height]);
      for(const [left,right,bottom,top] of segments){if(right-left<EPS||top-bottom<EPS)continue;
        const a={x:wall.a.x+(wall.b.x-wall.a.x)*left/length,z:wall.a.z+(wall.b.z-wall.a.z)*left/length},b={x:wall.a.x+(wall.b.x-wall.a.x)*right/length,z:wall.a.z+(wall.b.z-wall.a.z)*right/length};
        solids.push({floorId:floor.id,wallId:wall.id,a,b,bottom:floor.elevation+bottom,top:floor.elevation+top,thickness:.1});
      }
      for(const roomId of wall.rooms)surfaces.push({id:`${floor.id}:${wall.id}:${roomId}`,floorId:floor.id,roomId,kind:'wall',a:wall.a,b:wall.b,y:floor.elevation,height:floor.height,doors});
    }
  }
  for(const stair of layout.stairs){
    const from=layout.floors.find(f=>f.id===stair.from),to=layout.floors.find(f=>f.id===stair.to);
    const parts=stairParts(stair,from,to);
    for(const flight of parts.flights)ramps.push({...flight,stairId:stair.id});
    parts.landings.forEach((landing,i)=>{const polygons=[region(landing.outline)],id=`${stair.id}:landing:${i}`;floors.push({floorId:from.id,roomId:null,y:landing.y,polygons});surfaces.push({id,kind:'floor',floorId:from.id,y:landing.y,polygons});});
  }
  return {surfaces,solids,floors,ramps};
}

export function makeStarterLayout(envelope,{bedrooms=1,bathrooms=1,floorCount=1,unitOutline,unitLabel}={}) {
  const mappedBoundary=validateRing(unitOutline||envelope.footprint),angle=Math.atan2(mappedBoundary[1].z-mappedBoundary[0].z,mappedBoundary[1].x-mappedBoundary[0].x),cos=Math.cos(angle),sin=Math.sin(angle);
  const boundary=mappedBoundary.map(p=>({x:p.x*cos+p.z*sin,z:-p.x*sin+p.z*cos})),minX=Math.min(...boundary.map(p=>p.x))+.2,maxX=Math.max(...boundary.map(p=>p.x))-.2,minZ=Math.min(...boundary.map(p=>p.z))+.2,maxZ=Math.max(...boundary.map(p=>p.z))-.2;
  const labels=['Living / kitchen',...Array.from({length:Math.max(0,Math.min(8,bedrooms))},(_,i)=>`Bedroom ${i+1}`),...Array.from({length:Math.max(0,Math.min(4,bathrooms))},(_,i)=>`Bathroom ${i+1}`)];
  const count=Math.max(1,Math.min(4,floorCount)),height=Math.min(2.7,envelope.heightMeters/count-.15);
  const layout={schemaVersion:1,id:`home_${crypto.randomUUID().replaceAll('-','')}`,unitLabel:unitLabel||'My home',...(unitOutline?{unitOutline}:{}),floors:[],stairs:[]};
  for(let f=0;f<count;f++){
    const floor={id:`floor_${f}`,label:`Floor ${f+1}`,elevation:f*(height+.15),height,slab:.15,vertices:{},rooms:[],doors:[]};
    const hall=count>1&&labels.length>1,roomLeft=hall?minX+2.6:minX;
    if(hall&&(maxX-roomLeft<2||maxZ-minZ<5.8))fail('This starting plan needs more room for stairs. Reduce the rooms or start with one open room per floor.');
    labels.forEach((label,i)=>{const z0=minZ+(maxZ-minZ)*i/labels.length,z1=minZ+(maxZ-minZ)*(i+1)/labels.length;
      floor.vertices[`l${i}`]={x:roomLeft,z:z0};floor.vertices[`r${i}`]={x:maxX,z:z0};floor.vertices[`l${i+1}`]={x:roomLeft,z:z1};floor.vertices[`r${i+1}`]={x:maxX,z:z1};
      floor.rooms.push({id:`room_${f}_${i}`,label,type:'room',vertices:[`l${i}`,`r${i}`,`r${i+1}`,`l${i+1}`]});
      floor.doors.push({id:`door_${f}_${i}`,wall:hall?wallKey(`l${i}`,`l${i+1}`):wallKey(`l${i}`,`r${i}`),offset:hall?(z1-z0)/2:(maxX-minX)/2,width:.9,height:Math.min(2.05,height),entry:!hall&&f===0&&i===0});
    });
    if(hall){floor.vertices.hall0={x:minX,z:minZ};floor.vertices.hall1={x:minX,z:maxZ};floor.rooms.push({id:`hall_${f}`,label:'Hall / stairs',type:'hall',vertices:['hall0',...labels.map((_,i)=>`l${i}`),`l${labels.length}`,'hall1']});floor.doors.push({id:`entry_${f}`,wall:wallKey('hall0','l0'),offset:1.8,width:.9,height:Math.min(2.05,height),entry:f===0});}
    layout.floors.push(floor);
    if(hall&&f>0)layout.stairs.push({id:`starter_stairs_${f}`,from:`floor_${f-1}`,to:floor.id,width:1,path:[{x:minX+.8,z:minZ+.7},{x:minX+.8,z:maxZ-.7}]});
  }
  const toBuilding=p=>({x:p.x*cos-p.z*sin,z:p.x*sin+p.z*cos});
  for(const floor of layout.floors)for(const [id,p] of Object.entries(floor.vertices))floor.vertices[id]=toBuilding(p);
  for(const stair of layout.stairs)stair.path=stair.path.map(toBuilding);
  return normalizeLayout(layout,envelope);
}

// An incomplete private draft is useful even when no rectangular starter fits.
// Unknown space has no fabricated walls, doors, photos, or walkable surfaces.
export function makeEmptyLayout(envelope) {
  return normalizeLayout({schemaVersion:1,id:`home_${crypto.randomUUID().replaceAll('-','')}`,
    unitLabel:'My home',floors:[{id:'floor_0',label:'Floor 1',elevation:0,
      height:Math.min(2.7,envelope.heightMeters-.15),slab:.15,vertices:{},rooms:[],doors:[]}],stairs:[]},envelope);
}

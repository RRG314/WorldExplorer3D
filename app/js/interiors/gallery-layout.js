import {normalizeLayout, assertPlayableLayout, floorWalls, roomRing, pointInRoom, containsRegion, wallKey} from '../../../functions/interior-layout.mjs';

// Fit an explicitly representative, two-room exhibition inside the admitted
// footprint. Validation and collision stay with the existing layout compiler.
export function fitGalleryLayout(envelope, entrance, contentId, profile = null) {
  if (!Array.isArray(envelope?.footprint) || envelope.footprint.length < 3 || !entrance) return null;
  const ring = envelope.footprint;
  const longest = ring.map((p, i) => ({p, q:ring[(i+1)%ring.length]}))
    .sort((a,b) => Math.hypot(b.q.x-b.p.x,b.q.z-b.p.z)-Math.hypot(a.q.x-a.p.x,a.q.z-a.p.z))[0];
  const yaw = Math.atan2(longest.q.z-longest.p.z,longest.q.x-longest.p.x), c = Math.cos(yaw), s = Math.sin(yaw);
  const aligned = ring.map(p => ({x:p.x*c+p.z*s, z:-p.x*s+p.z*c}));
  const bounds = {minX:Math.min(...aligned.map(p=>p.x)), maxX:Math.max(...aligned.map(p=>p.x)), minZ:Math.min(...aligned.map(p=>p.z)), maxZ:Math.max(...aligned.map(p=>p.z))};
  let center = {x:(bounds.minX+bounds.maxX)/2, z:(bounds.minZ+bounds.maxZ)/2};
  const world = p => ({x:p.x*c-p.z*s, z:p.x*s+p.z*c});
  let fitted;
  // Concave footprints need an off-centre fit, not repeated shrinkage around
  // their bounding-box centre. Candidate edges follow surveyed corners; cap
  // each axis to 12 coordinates so entry work cannot grow with dense outlines.
  const coordinates=axis=>{
    const values=[...new Set(aligned.flatMap(p=>[p[axis]-.2,p[axis]+.2]).map(v=>Math.round(v*1000)/1000))].sort((a,b)=>a-b);
    return values.length<=12?values:Array.from({length:12},(_,i)=>values[Math.round(i*(values.length-1)/11)]);
  };
  const xs=coordinates('x'),zs=coordinates('z'),candidates=[];
  for(let a=0;a<xs.length;a++)for(let b=a+1;b<xs.length;b++)for(let d=0;d<zs.length;d++)for(let e=d+1;e<zs.length;e++){
    const hx=(xs[b]-xs[a])/2,hz=(zs[e]-zs[d])/2;if(hx<4.5||hz<4)continue;
    candidates.push({hx,hz,x:(xs[a]+xs[b])/2,z:(zs[d]+zs[e])/2});
  }
  // The Peale's public guide locates two front galleries on either side of
  // the entrance lobby. Prefer the full frontage, not the larger rear-wing
  // rectangle. Wall dimensions are still estimated from the mapped envelope.
  const frontLobby = profile === 'peale-front-ground-v1';
  const entryAligned = {x:entrance.x*c+entrance.z*s,z:-entrance.x*s+entrance.z*c};
  const frontOnX = Math.min(Math.abs(entryAligned.x-bounds.minX),Math.abs(entryAligned.x-bounds.maxX)) < Math.min(Math.abs(entryAligned.z-bounds.minZ),Math.abs(entryAligned.z-bounds.maxZ));
  const sideDistance = p => frontOnX ? Math.min(Math.abs(entryAligned.x-(p.x-p.hx)),Math.abs(entryAligned.x-(p.x+p.hx))) : Math.min(Math.abs(entryAligned.z-(p.z-p.hz)),Math.abs(entryAligned.z-(p.z+p.hz)));
  const frontWidth = p => frontOnX ? p.hz : p.hx;
  candidates.sort((a,b)=>frontLobby ? frontWidth(b)-frontWidth(a)||b.hx*b.hz-a.hx*a.hz : b.hx*b.hz-a.hx*a.hz);
  for(const candidate of candidates){
    if(frontLobby && sideDistance(candidate)>1.5)continue;
    const {x,z,hx,hz}=candidate,corners=[{x:x-hx,z:z-hz},{x:x+hx,z:z-hz},{x:x+hx,z:z+hz},{x:x-hx,z:z+hz}].map(world);
    if(containsRegion(ring,corners,envelope.holes||[])){fitted={hx,hz};center={x,z};break;}
  }
  if(!fitted)return null;
  if(frontLobby)return fitEntranceGalleryRooms({fitted,center,world,entryAligned,frontOnX,envelope,contentId});
  const {hx,hz}=fitted, x0=center.x-hx,x1=center.x+hx,z0=center.z-hz,z1=center.z+hz;
  // Split the longer axis to keep both rooms wide enough for accessible paths.
  const splitX=hx>=hz;
  const positions=splitX?[[x0,z0],[center.x,z0],[x1,z0],[x1,z1],[center.x,z1],[x0,z1]]:
    [[x0,z0],[x1,z0],[x1,center.z],[x1,z1],[x0,z1],[x0,center.z]];
  const vertices=Object.fromEntries(positions.map(([x,z],i)=>[`v${i}`,world({x,z})]));
  const rooms=splitX?[['v0','v1','v4','v5'],['v1','v2','v3','v4']]:[['v0','v1','v2','v5'],['v5','v2','v3','v4']];
  const height=Math.min(3.6,envelope.heightMeters-.2);
  if(height<2.6)return null;
  const floor={id:'gallery-ground',label:'Gallery',elevation:0,height,slab:.18,wallThickness:.24,vertices,
    rooms:rooms.map((vertices,i)=>({id:`gallery-room-${i}`,label:i?'Landscape studio':'Natural forms',type:'gallery',vertices})),doors:[]};
  const walls=floorWalls(floor),shared=walls.find(w=>w.rooms.length===2);
  const midpoint=w=>({x:(w.a.x+w.b.x)/2,z:(w.a.z+w.b.z)/2});
  const outer=walls.filter(w=>w.rooms.length===1).sort((a,b)=>Math.hypot(midpoint(a).x-entrance.x,midpoint(a).z-entrance.z)-Math.hypot(midpoint(b).x-entrance.x,midpoint(b).z-entrance.z))[0];
  floor.doors=[shared,outer].map((wall,i)=>({id:i?'gallery-entry':'gallery-passage',wall:wallKey(wall.from,wall.to),offset:Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z)/2,width:2.2,height:Math.min(2.7,height-.15),entry:i===1}));
  try {
    const layout=normalizeLayout({schemaVersion:1,id:`gallery:${contentId}`,unitLabel:'World Explorer Gallery',floors:[floor],stairs:[]},envelope);
    assertPlayableLayout(layout);return layout;
  }catch{return null;}
}

// Reconstruct only the supported front-ground-floor adjacency. Upper floors,
// rear shop, stairs and garden are outside this reviewed playable footprint.
function fitEntranceGalleryRooms({fitted,center,world,entryAligned,frontOnX,envelope,contentId}) {
  const {hx,hz}=fitted, width=frontOnX?hz:hx, depth=frontOnX?hx:hz;
  const along=frontOnX?center.x:center.z, across=frontOnX?center.z:center.x;
  const entryAcross=frontOnX?entryAligned.z:entryAligned.x;
  const middle=Math.max(across-width+4,Math.min(across+width-4,entryAcross));
  const coords=[across-width,middle-1.3,middle+1.3,across+width];
  const vertices={};
  coords.forEach((v,i)=>{for(const [side,u]of [['front',along-depth],['back',along+depth]])vertices[`${side}${i}`]=world(frontOnX?{x:u,z:v}:{x:v,z:u});});
  const outlines=[['front0','back0','back1','front1'],['front2','back2','back3','front3'],['front1','back1','back2','front2']];
  const height=Math.min(3.6,envelope.heightMeters-.2);if(height<2.6)return null;
  const floor={id:'gallery-ground',label:'Front galleries',elevation:0,height,slab:.18,wallThickness:.24,vertices,
    rooms:outlines.map((vertices,i)=>({id:`gallery-room-${i}`,label:['Natural forms','Landscape gallery','Entrance hall'][i],type:i===2?'hall':'gallery',vertices})),doors:[]};
  const walls=floorWalls(floor),entrySide=(frontOnX?entryAligned.x:entryAligned.z)<along?'front':'back';
  for(const wall of walls.filter(w=>w.rooms.length===2))floor.doors.push({id:`gallery-passage-${floor.doors.length}`,wall:wall.id,offset:Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z)*.45,width:1.8,height:2.7});
  const entry=walls.find(w=>w.id===wallKey(`${entrySide}1`,`${entrySide}2`));
  floor.doors.push({id:'gallery-entry',wall:entry.id,offset:1.3,width:1.8,height:2.7,entry:true});
  try{const layout=normalizeLayout({schemaVersion:1,id:`gallery:${contentId}`,unitLabel:'World Explorer Gallery',floors:[floor],stairs:[]},envelope);assertPlayableLayout(layout);return layout;}catch{return null;}
}

// Placements are validated against walls and circulation. Imported geometry
// must fit these reviewed envelopes; it never decides its own walkable space.
export function galleryExhibitPlacements(layout, exhibits, metersPerUnit = 1) {
  const floor=layout.floors[0], placements=[];
  for(let roomIndex=0;roomIndex<floor.rooms.length;roomIndex++){
    const room=floor.rooms[roomIndex],ring=roomRing(floor,room),selected=exhibits.filter(e=>e.roomIndex===roomIndex);
    const walls=floorWalls(floor).filter(w=>w.rooms.includes(room.id)&&!floor.doors.some(d=>d.wall===w.id));
    walls.sort((a,b)=>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)-Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z));
    for(let i=0;i<selected.length;i++){
      const exhibit=selected[i],wall=walls[i%walls.length];if(!wall)return null;
      const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),nx=-(wall.b.z-wall.a.z)/length,nz=(wall.b.x-wall.a.x)/length;
      const midpoint={x:(wall.a.x+wall.b.x)/2,z:(wall.a.z+wall.b.z)/2};
      const sign=pointInRoom({x:midpoint.x+nx*.4,z:midpoint.z+nz*.4},ring)?1:-1;
      const extent=exhibit.displayExtentMeters/metersPerUnit;
      const inset=exhibit.presentation==='artwork'?Math.max(.12,(floor.wallThickness||.1)/2+.04):extent/2+.24;
      const point={x:midpoint.x+nx*sign*inset,z:midpoint.z+nz*sign*inset};
      const approach={x:point.x+nx*sign*(exhibit.presentation==='artwork'?2:extent/2+1),z:point.z+nz*sign*(exhibit.presentation==='artwork'?2:extent/2+1)};
      if(!pointInRoom(point,ring)||!pointInRoom(approach,ring)||length<extent+.8)return null;
      if(placements.some(p=>Math.hypot(p.x-point.x,p.z-point.z)<2.5))return null;
      placements.push({id:exhibit.id,roomId:room.id,floorId:floor.id,...point,yaw:Math.atan2(nx*sign,nz*sign),approach});
    }
  }
  return placements.length===exhibits.length?placements:null;
}

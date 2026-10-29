import {sampleRaceSegmentY,raceSegmentAtDistance} from './course-rules.js';
import {raceCourseSurfacePoint} from './course-markings.js';

// Original temporary World Explorer event equipment. Geographic roads and
// buildings retain their owners; these bounded batches retire with the race.
// Every base follows the qualified pavement, including its crossfall/deck.
export function buildRaceFurniture(course) {
 const unit=course.metersPerUnit,chunks=new Map(),boards=[];
 const chunkAt=d=>{const key=Math.floor(d/128);if(!chunks.has(key))chunks.set(key,{key,positions:[],uvs:[],fencePositions:[],fenceUvs:[],posts:[],center:raceCourseSurfacePoint(course,Math.min(course.lengthMeters,key*128+64))});return chunks.get(key);};
 function quad(positions,uvs,points,u0=0,u1=1,v0=0,v1=1){for(const i of [0,1,2,0,2,3]){positions.push(points[i].x,points[i].y,points[i].z);uvs.push([u0,u1,u1,u0][i],[v0,v0,v1,v1][i]);}}
 function point(segment,t,lateral,lift=0){return {x:segment.a.x+(segment.b.x-segment.a.x)*t+segment.forward.z*lateral/unit,
  y:sampleRaceSegmentY(segment,t,lateral)+lift/unit,z:segment.a.z+(segment.b.z-segment.a.z)*t-segment.forward.x*lateral/unit};}
 // The inner foot meets the same 20 cm edge clearance enforced by the road
 // controller. The upper wall recedes from the admitted chassis envelope.
 const profile=[[-.2,0],[-.2,.18],[.06,.36],[.18,.86],[.38,.86],[.5,0]];
 for(const segment of course.segments) {
  const count=Math.max(1,Math.ceil(segment.lengthMeters/4));
  for(let i=0;i<count;i++) {
   const start=segment.startMeters+i*segment.lengthMeters/count,end=segment.startMeters+(i+1)*segment.lengthMeters/count;
   const chunk=chunkAt((start+end)/2),t0=i/count,t1=(i+1)/count;
   for(const side of [-1,1]) {
    const edge=segment.widthMeters/2;
    const ring=t=>profile.map(([offset,height])=>point(segment,t,side*(edge+offset),height));
    const a=ring(t0),b=ring(t1);
    for(let j=0;j<profile.length;j++){const k=(j+1)%profile.length;quad(chunk.positions,chunk.uvs,[a[j],b[j],b[k],a[k]],start/2,end/2,profile[j][1]/2,profile[k][1]/2);}
    // Fence rises behind the wall, leaving the whole admitted lane unobstructed.
    const lateral=side*(edge+.36);
    quad(chunk.fencePositions,chunk.fenceUvs,[point(segment,t0,lateral,.86),point(segment,t1,lateral,.86),point(segment,t1,lateral,2.5),point(segment,t0,lateral,2.5)],start/.12,end/.12,0,1.64/.12);
   }
  }
 }
 for(let d=0;d<course.lengthMeters;d+=8){const segment=raceSegmentAtDistance(course,d),chunk=chunkAt(d);for(const side of [-1,1])chunk.posts.push(raceCourseSurfacePoint(course,d,side*(segment.widthMeters/2+.36),.86));}
 let previousTurn=-Infinity;
 for(let d=180;d<course.lengthMeters-30;d+=15) {
  const a=raceSegmentAtDistance(course,d-30).forward,b=raceSegmentAtDistance(course,d+30).forward;
  if(Math.abs(Math.atan2(a.x*b.z-a.z*b.x,a.x*b.x+a.z*b.z))<.45||d-previousTurn<180)continue;
  previousTurn=d;
  for(const distance of [150,100,50]) {
   const at=d-distance,segment=raceSegmentAtDistance(course,at),position=raceCourseSurfacePoint(course,at,segment.widthMeters/2+1.1,1.25);
   boards.push({distance,at,position,yaw:Math.atan2(segment.forward.x,segment.forward.z)+Math.PI});
  }
 }
 return {chunks:[...chunks.values()],boards,profile,heightMeters:2.5};
}
function geometry(T,positions,uvs) {
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 if(uvs)g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export function prepareRaceFurniture(T,context,course) {
 const data=buildRaceFurniture(course),root=new T.Group(),owned=[],textures=[],chunks=[],unit=course.metersPerUnit;
 root.name='World Explorer temporary race equipment';
 const keep=value=>{owned.push(value);return value;};
 let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;root.parent?.remove(root);for(const item of owned)item.dispose();for(const texture of textures)texture.dispose();root.clear();};
 try {
 const wall=keep(new T.MeshStandardMaterial({color:0xc2c1b6,map:context.concreteDiffuse||null,normalMap:context.concreteNormal||null,normalScale:new T.Vector2(.12,.12),roughnessMap:context.concreteRoughness||null,roughness:.95,side:T.DoubleSide}));
 const metal=keep(new T.MeshStandardMaterial({color:0x76818a,metalness:.72,roughness:.58}));
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
 ctx.strokeStyle='#d3d7d7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,32);ctx.lineTo(32,0);ctx.lineTo(64,32);ctx.lineTo(32,64);ctx.closePath();ctx.stroke();
 const chain=new T.CanvasTexture(canvas);chain.wrapS=chain.wrapT=T.RepeatWrapping;chain.anisotropy=4;textures.push(chain);
 const fence=keep(new T.MeshStandardMaterial({color:0xa3adb1,map:chain,alphaTest:.4,side:T.DoubleSide,metalness:.6,roughness:.6}));
 const postGeometry=keep(new T.BoxGeometry(.065/unit,1.7/unit,.065/unit)),matrix=new T.Matrix4();
 for(const chunk of data.chunks) {
  const group=new T.Group();group.name='Race perimeter '+chunk.key;
  const barrier=new T.Mesh(keep(geometry(T,chunk.positions,chunk.uvs)),wall);barrier.receiveShadow=true;group.add(barrier);
  const mesh=new T.Mesh(keep(geometry(T,chunk.fencePositions,chunk.fenceUvs)),fence);group.add(mesh);
  if(chunk.posts.length){const posts=new T.InstancedMesh(postGeometry,metal,chunk.posts.length);chunk.posts.forEach((p,i)=>{matrix.makeTranslation(p.x,p.y+.85/unit,p.z);posts.setMatrixAt(i,matrix);});posts.instanceMatrix.needsUpdate=true;group.add(posts);}
  root.add(group);chunks.push({group,center:chunk.center,fence:mesh});
 }
 const boardGeometry=keep(new T.PlaneGeometry(.9/unit,1.05/unit));
 for(const distance of [150,100,50]) {
  const image=document.createElement('canvas');image.width=256;image.height=320;const c=image.getContext('2d');
  c.fillStyle='#e6e4d9';c.fillRect(0,0,256,320);c.fillStyle='#1c2425';c.fillRect(12,12,232,296);c.fillStyle='#eeeee6';c.fillRect(20,20,216,280);
  c.fillStyle='#172022';c.textAlign='center';c.font='bold 118px sans-serif';c.fillText(String(distance),128,194);c.font='bold 28px sans-serif';c.fillText('METRES',128,254);
  const texture=new T.CanvasTexture(image);texture.encoding=T.sRGBEncoding;texture.anisotropy=4;textures.push(texture);
  const material=keep(new T.MeshStandardMaterial({map:texture,roughness:.85,side:T.DoubleSide}));
  for(const board of data.boards.filter(b=>b.distance===distance)) {const mesh=new T.Mesh(boardGeometry,material);mesh.position.set(board.position.x,board.position.y,board.position.z);mesh.rotation.y=board.yaw;root.add(mesh);}
 }
 const segment=course.segments[0],start=raceCourseSurfacePoint(course,1),width=segment.widthMeters;
 const gantry=new T.Group();gantry.position.set(start.x,start.y,start.z);gantry.rotation.y=Math.atan2(segment.forward.x,segment.forward.z);
 const column=keep(new T.BoxGeometry(.25/unit,5.1/unit,.25/unit)),beam=keep(new T.BoxGeometry((width+2.6)/unit,.22/unit,.22/unit));
 for(const side of [-1,1]){const post=new T.Mesh(column,metal);post.position.set(side*(width/2+1.1)/unit,2.55/unit,0);gantry.add(post);}
 const top=new T.Mesh(beam,metal);top.position.y=5.1/unit;gantry.add(top);
 const banner=document.createElement('canvas');banner.width=1536;banner.height=192;const b=banner.getContext('2d');b.fillStyle='#142b2a';b.fillRect(0,0,1536,192);b.fillStyle='#e4c765';b.fillRect(0,174,1536,18);b.textAlign='center';b.fillStyle='#f1f0e6';b.font='bold 68px sans-serif';b.fillText('WORLD EXPLORER',768,82);b.font='36px sans-serif';b.fillText('START  /  FINISH',768,142);
 const bannerTexture=new T.CanvasTexture(banner);bannerTexture.encoding=T.sRGBEncoding;textures.push(bannerTexture);
 const bannerMaterial=keep(new T.MeshStandardMaterial({map:bannerTexture,roughness:.9,side:T.DoubleSide}));
 const bannerMesh=new T.Mesh(keep(new T.PlaneGeometry((width+2)/unit,1.3/unit)),bannerMaterial);bannerMesh.position.y=4.25/unit;gantry.add(bannerMesh);root.add(gantry);
 return {root,data,
  update(position){if(disposed||!position)return;for(const chunk of chunks){const distance=Math.hypot(position.x-chunk.center.x,position.z-chunk.center.z)*unit;chunk.group.visible=distance<480;chunk.fence.visible=distance<260;}},
  dispose
 };
 } catch(error){dispose();throw error;}
}

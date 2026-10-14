import {vabFrame} from '../world/kennedy-facility.js';
import {VAB_SURVEY} from '../world/kennedy-site-survey.js';
import {batchOwnedStaticStructure} from '../world/static-structure-batching.js';
import {createWallCollider} from './core.js?v=4';
import {KENNEDY_CONTENT} from './kennedy-content.js';
import {finishVenueSurface} from '../world/venue-surface-materials.js';

export function buildKennedyInterior(T,ctx,definition){
 const building=definition.support?.building||definition.building,f=vabFrame(ctx),base=(building.baseY||0)+.06;
 const footprint=VAB_SURVEY[0].points.slice(0,-1).map(p=>ctx.geoToWorld(p.lat,p.lon)),ring=footprint.map(f.local);
 const root=new T.Group();root.name='VAB ground-floor visit';root.position.set(f.center.x,base,f.center.z);root.rotation.y=-Math.atan2(f.uz,f.ux);root.scale.setScalar(f.k);
 const materials=new Map(),colliders=[];
 const mat=(color,roughness=.75)=>{if(!materials.has(color)){const m=new T.MeshStandardMaterial({color,roughness,side:T.DoubleSide});m.color.convertSRGBToLinear();m.fog=false;materials.set(color,m);}return materials.get(color);};
 const wall=mat(0xb2b9b7),steel=mat(0x777f82,.5),concrete=mat(0x90968e),yellow=mat(0xd8b230),dark=mat(0x263b42),white=mat(0xe6e6d9);
 const box=(m,x,y,z,w,h,d,solid=false)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);if(solid)colliders.push(createWallCollider(f.world(x-w/2,z),f.world(x+w/2,z),base+(y-h/2)*f.k,h*f.k,d*f.k,.000001));return mesh;};
 const beam=(a,b,w=.45,m=steel)=>{const d=new T.Vector3().subVectors(b,a),mesh=new T.Mesh(new T.BoxGeometry(w,d.length(),w),m);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());root.add(mesh);};
 const floorShape=new T.Shape(ring.map(p=>new T.Vector2(p.x,-p.z))),floor=new T.Mesh(new T.ShapeGeometry(floorShape),concrete);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;root.add(floor);
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b.x-a.x,b.z-a.z),h=(a.z+b.z)/2>68?64:160;
  const mesh=box(wall,(a.x+b.x)/2,h/2,(a.z+b.z)/2,length,h,.35);mesh.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
  colliders.push(createWallCollider(f.world(a.x,a.z),f.world(b.x,b.z),base,h*f.k,.35*f.k,.000001));
 }
 // Four high-bay spaces flank the measured 28 m transfer aisle. Framing,
 // crane rails and marked circulation convey scale without hundreds of lights.
 for(const x of [-76,-14,14,76])for(const z of [-62,-32,0,32,62]){
  box(steel,x,74,z,1.2,148,1.2,true);
  for(let y=8;y<145;y+=16){beam(new T.Vector3(x,y,z),new T.Vector3(x,y+12,z+20),.25);}
 }
 for(const z of [-62,-32,0,32,62]){
  box(steel,0,153,z,154,1.5,1.2);
  for(let x=-70;x<70;x+=14){beam(new T.Vector3(x,151,z),new T.Vector3(x+7,157,z),.4);beam(new T.Vector3(x+7,157,z),new T.Vector3(x+14,151,z),.4);}
 }
 // Roofs use the same mapped perimeter as the walls, including low-bay
 // setbacks. Independent rectangular roofs left open strips above the walls.
 const seam=69.065;
 const roofRing=north=>{const out=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],ia=north?a.z<=seam:a.z>=seam,ib=north?b.z<=seam:b.z>=seam;if(ia)out.push(a);if(ia!==ib){const t=(seam-a.z)/(b.z-a.z);out.push({x:a.x+(b.x-a.x)*t,z:seam});}}return out;};
 for(const [north,y] of [[true,160],[false,64]]){const pts=roofRing(north),shape=new T.Shape(pts.map(p=>new T.Vector2(p.x,-p.z))),roof=new T.Mesh(new T.ShapeGeometry(shape),wall);roof.rotation.x=-Math.PI/2;roof.position.y=y;root.add(roof);}
 box(wall,0,112,seam,157,96,.4);
 // Repeated work platforms follow NASA's published high-bay photographs.
 // The playable visit stays on the assembly floor.
 for(let y=12;y<=108;y+=12)for(const x of [28,63]){
  box(steel,x,y,25,13,.45,36);
  for(const edge of [-6,6]){box(white,x+edge,y+1.1,25,.07,.07,36);for(let z=8;z<44;z+=4)box(white,x+edge,y+.55,z,.065,1.1,.065);}
  for(const z of [8,25,42])beam(new T.Vector3(x-6,y,z),new T.Vector3(x+6,y-4,z),.32);
 }
 for(const x of [-70,-20,20,70])box(steel,x,145,0,.8,1.2,130);
 for(const x of [-45,45]){box(yellow,x,143,25,49,2.6,3);box(dark,x,140,25,3,3,4);beam(new T.Vector3(x,138,25),new T.Vector3(x,25,25),.10,dark);box(yellow,x,24,25,1.5,2,1.2);}
 for(const x of [-13.3,13.3])box(yellow,x,.035,18,.18,.04,169);
 for(let z=-60;z<135;z+=8)box(white,0,.025,z,.2,.03,2.2);
 for(let z=-60;z<140;z+=15)box(steel,0,.009,z,125,.009,.015);
 for(const x of [-69,69])for(const z of [-45,12,50]){
  box(dark,x,.7,z,3,1.4,1,true);box(steel,x,.72,z+2,4,.12,1.3,true);
  for(const dx of [-1.7,1.7])box(steel,x+dx,.36,z+2,.09,.72,1.1);
 }
 const lamp=mat(0xffffff);lamp.emissive.setHex(0xe7eef0);lamp.emissiveIntensity=.7;
 for(const x of [-10,10])for(let z=-60;z<120;z+=18)box(lamp,x,10,z,.35,.15,2);
 const interactions=[];
 for(const s of KENNEDY_CONTENT.stations){
  box(dark,s.x,.6,s.z,1,.9,.7,true);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#152c37';c.fillRect(0,0,512,256);c.fillStyle='#e6eef0';c.font='bold 32px sans-serif';c.fillText(s.title,20,78,475);c.font='24px sans-serif';c.fillText('Explore · Interact',20,150);
  const tex=new T.CanvasTexture(canvas);tex.encoding=T.sRGBEncoding;const panel=new T.Mesh(new T.PlaneGeometry(1.6,.8),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));panel.position.set(s.x,1.48,s.z-.1);panel.rotation.y=Math.PI;root.add(panel);
  interactions.push({kind:'facility-station',stationId:s.id,level:0,...f.world(s.x,s.z-1),radius:2.8*f.k,label:s.title});
 }
 batchOwnedStaticStructure(T,root);
 finishVenueSurface(T,root,wall,'../../assets/textures/facades/polyhaven-corrugated-iron-diff-1k.jpg',5);
 finishVenueSurface(T,root,concrete,'../../assets/textures/earth/brushed_concrete_diffuse.jpg',5);
 // The asset's measured 40 x 32.81 m ground envelope shares this scene's
 // collision owner. It is an exhibit, so no second vehicle controller exists.
 colliders.push(createWallCollider(f.world(-66,-25),f.world(-26,-25),base,7.75*f.k,32.81*f.k,.000001));
 root.add(new T.HemisphereLight(0xf0f5ff,0x707b84,.65));const light=new T.DirectionalLight(0xfff3dc,.85);light.position.set(-15,110,-35);light.target.position.set(-35,0,-10);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:220});light.shadow.bias=-.0001;light.shadow.normalBias=.04;root.add(light,light.target);
 const spawn=f.world(0,-64),entry={...spawn,y:base+(ctx.Walk?.CFG?.eyeHeight||1.7)+.03};
 interactions.push({kind:'exit',level:0,...spawn,radius:2.4*f.k,label:'Return outside'});
 const floorPlan={authored:true,floorCount:1,storyHeight:160*f.k,floors:[{id:'vab-ground',label:'Assembly floor',level:0,elevation:0,height:160*f.k}],connectorEligible:false};
 return {group:root,mode:'authored',layoutKind:'kennedy-vab-ground',dynamicColliders:colliders.filter(Boolean),walkSurfaces:[{kind:'polygon',pts:footprint,y:base,floorLevel:0}],placementTargets:[],floorPlan,floorId:'vab-ground',floorLabel:'Assembly floor',activeLevel:0,loadedLevels:[0],connector:null,stairs:[],center:f.center,floorBaseY:base,floorY:base,wallHeight:160*f.k,entryPoint:entry,entryYaw:Math.atan2(f.sx,f.sz),lobbyEntryPoint:entry,exteriorFootprint:footprint,usableFootprint:footprint,suppressionRadius:220*f.k,exteriorArea:30000*f.k*f.k,usableArea:30000*f.k*f.k,shellClearanceMin:.05,requiredShellClearance:.05,partitionCount:colliders.length,interactions,authoredCeilings:[]};
}

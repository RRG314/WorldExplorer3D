import {RESEARCH_DECKS,RESEARCH_ROOMS} from './interior-plan.js';
import {createShipSurfaceLibrary} from '../../expedition/ship-surface-library.js';

// Architectural geometry is visible and collidable. Nothing substitutes an
// invisible floor for a hole in the licensed ship. Trim is visual-only.
export function createResearchInterior(THREE){
 const root=new THREE.Group();root.name='Research vessel accommodation';
 const owned=new Set(),materials=new Set(),lights=[];
 const material=options=>{const m=new THREE.MeshStandardMaterial(options);materials.add(m);return m;};
 const steel=material({color:0xc0c9ca,metalness:.45,roughness:.5}),dark=material({color:0x263a43,roughness:.86}),
 floor=material({color:0x52676d,roughness:.91}),enamel=material({color:0xb3b7af,roughness:.76}),wood=material({color:0xa37448,roughness:.72}),glass=material({color:0x132932,roughness:.25,metalness:.15}),
 light=material({color:0xf4f5db,emissive:0xf2edc8,emissiveIntensity:.9,roughness:.8});
 const library=createShipSurfaceLibrary(THREE,null,()=>floor),wall=library.surface('wall','research');wall.emissive=new THREE.Color(0x1a2022);wall.emissiveIntensity=.4;materials.add(wall);
 const box=(name,x,y,z,w,h,d,mat=wall,trim=false)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.name=name;mesh.position.set(x,y,z);
  if(mat.userData.shipTileSize){const uv=mesh.geometry.getAttribute('uv'),pos=mesh.geometry.getAttribute('position'),norm=mesh.geometry.getAttribute('normal'),tile=mat.userData.shipTileSize;
   for(let i=0;i<uv.count;i++){const px=pos.getX(i)+x,py=pos.getY(i)+y,pz=pos.getZ(i)+z;uv.setXY(i,(Math.abs(norm.getX(i))>.5?pz:px)/tile,(Math.abs(norm.getY(i))>.5?pz:py)/tile);}uv.needsUpdate=true;}
mesh.castShadow=!trim;mesh.receiveShadow=true;mesh.userData.excludeShipNavigation=trim;owned.add(mesh.geometry);root.add(mesh);return mesh;
 };
 function sign(label,x,y,z,yaw=0){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const c=canvas.getContext('2d');c.fillStyle='#142e3b';c.fillRect(0,0,512,96);c.fillStyle='#e5b754';c.fillRect(0,0,12,96);c.fillStyle='#f0f4f4';c.font='600 29px system-ui';c.textAlign='center';c.fillText(label.toUpperCase(),256,59);
  const map=new THREE.CanvasTexture(canvas);map.encoding=THREE.sRGBEncoding;owned.add(map);const m=new THREE.MeshBasicMaterial({map});materials.add(m);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.31),m);owned.add(mesh.geometry);mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.userData.excludeShipNavigation=true;root.add(mesh);
 }
 function lamp(x,y,z){box('Diffused ceiling luminaire',x,y,z,1.1,.065,.3,light,true);const l=new THREE.PointLight(0xe6f1f5,.65,10,2);l.position.set(x,y-.2,z);l.visible=false;lights.push(l);root.add(l);}
 function wallX(x,y,z0,z1,doorZ=null){
  if(doorZ==null){box('Bulkhead',x,y+1.45,(z0+z1)/2,.12,2.9,z1-z0);return;}
  for(const [a,b] of [[z0,doorZ-.8],[doorZ+.8,z1]])if(b>a)box('Bulkhead',x,y+1.45,(a+b)/2,.12,2.9,b-a);
  box('Door lintel',x,y+2.6,doorZ,.12,.6,1.6);
  for(const z of [doorZ-.83,doorZ+.83])box('Door jamb',x,y+1.14,z,.18,2.28,.075,steel,true);
  box('Open secured door',x+.15,y+1.12,doorZ+1.22,.07,2.22,.7,steel); // latched flat to bulkhead
 }
 // Main interior lies within the original hull; the entrance opens onto the
 // working deck. An internal passage reaches the stairs, with no exterior desk.
 box('Main deck sole',0,1.884,-.7,13.25,.12,35.2,floor);
 box('Flush deck entrance threshold',0,1.884,-19.1,2.1,.12,2.5,floor);
 for(const x of [-4.52,4.52])box('Main deck headliner',x,4.94,-.7,4.21,.09,35.2,enamel);
 box('Aft headliner',0,4.94,-6.7,4.82,.09,23.3,enamel);
 box('Forward headliner',0,4.94,13.75,4.82,.09,5.9,enamel);
 for(const x of [-6.62,6.62])wallX(x,1.944,-18.3,16.8);
 for(const [a,b] of [[-6.62,-1.05],[1.05,6.62]])box('Aft entrance bulkhead',(a+b)/2,3.394,-18.3,b-a,2.9,.12);
 box('Aft entrance lintel',0,4.55,-18.3,2.1,.55,.12);
 sign('Science • Galley • Bridge',0,4.4,-18.38,Math.PI);
 for(const r of RESEARCH_ROOMS.filter(r=>r.deck==='main')){
  const x=(r.x0+r.x1)/2,z=(r.z0+r.z1)/2,doorX=r.x0>0?r.x0:r.x1;
  wallX(doorX,1.944,r.z0,r.z1,r.doorZ);
  for(const end of [r.z0,r.z1])box('Room partition',x,3.394,end,r.x1-r.x0,2.9,.10);
  box('Coved skirting',x,2.015,r.z0+.09,r.x1-r.x0,.14,.06,dark,true);
  sign(r.label,doorX+(doorX>0?-.075:.075),4.3,r.doorZ,doorX>0?-Math.PI/2:Math.PI/2);
  lamp(x,4.77,z);
 }
 // Non-public forward service space stays behind a real bulkhead. Route to
 // stairs remains clear; it is not presented as an empty playable engine room.
 wallX(-2.55,1.944,-2.8,16.6);wallX(2.55,1.944,-2.8,16.6);
 box('Forward service bulkhead',0,3.394,16.7,5.1,2.9,.12);
 // A three-flight-pair companionway; each tread is <18 cm rise. Clearances and
 // guardrails are part of the same triangle index used for player/camera.
 for(let level=0;level<3;level++){
  const low=RESEARCH_DECKS[level].y,high=RESEARCH_DECKS[level+1].y,mid=(low+high)/2;
  box('Stair entry landing',0,low-.06,4.15,4.8,.12,1.7,floor);
  box('Companionway half landing',0,mid-.06,9.65,4.8,.12,1.5,floor);
  for(let i=0;i<10;i++){
   const rise=(high-low)/20,run=.39;
   box('Non-slip ascending tread',-1.15,low+rise*(i+1)-.055,5+run*(i+.5),1.9,.11,run,floor);
   box('Safety nosing',-1.15,low+rise*(i+1)+.006,5+run*i+.025,1.88,.013,.05,steel,true);
   box('Non-slip returning tread',1.15,mid+rise*(i+1)-.055,8.9-run*(i+.5),1.9,.11,run,floor);
   box('Safety nosing',1.15,mid+rise*(i+1)+.006,8.9-run*i-.025,1.88,.013,.05,steel,true);
  }
  box('Upper stair landing',0,high-.06,4.15,4.8,.12,1.7,floor);
  const rail=(x,startY,endY,z0,z1)=>{const len=Math.hypot(endY-startY,z1-z0),m=box('Companionway handrail',x,(startY+endY)/2+1,(z0+z1)/2,.065,.065,len,steel,true);m.rotation.x=-Math.atan2(endY-startY,z1-z0);};
  rail(-2.18,low,mid,5,8.9);rail(-.15,low,mid,5,8.9);rail(2.18,high,mid,5,8.9);rail(.15,high,mid,5,8.9);
  // Guard solid vertical panels at the stairwell edges, below their handrails.
  for(const [x,start,end] of [[-2.3,low,mid],[-.04,low,mid],[2.3,high,mid]]){
   const m=box('Stair guard',x,(start+end)/2+.48,6.95,.07,.92,3.9,dark);m.rotation.x=-Math.atan2(end-start,3.9);
  }
  sign(level===2?'Bridge':'Crew • Bridge',0,high+1.8,3.36,Math.PI);
  lamp(0,high+2.5,4.2);
 }
 // Upper rooms. Every stair opening stays open all the way through its ceiling.
 for(const deck of ['crew','bridge']){
  const y=RESEARCH_DECKS.find(d=>d.id===deck).y,front=deck==='crew'?17.1:14.5;
  box('Aft passage',0,y-.06,4.1,12.7,.12,1.8,floor);
  for(const x of [-4.45,4.45])box('Side passage',x,y-.06,7.9,4.0,.12,6,floor);
  box('Forward passage',0,y-.06,(10.8+front)/2,deck==='crew'?12.7:6.8,.12,front-10.8,floor);
  for(const x of [-2.45,2.45]){
   box('Stairwell side',x,y+1.18,7.95,.1,2.36,5.9,wall);
  }
  box('Stairwell forward wall',0,y+1.18,10.9,4.95,2.36,.1,wall);
  lamp(4.4,y+2.45,7);lamp(-4.4,y+2.45,7);lamp(0,y+2.5,13.5);
 }
 for(const x of [-6.4,6.4])wallX(x,8.83,3.7,17.2);
 box('Crew forward lining',0,10.23,17.2,12.8,2.8,.1,wall);
 box('Crew aft lining',0,10.23,3.35,12.8,2.8,.1,wall);
 for(const x of [-4.42,4.42])box('Crew headliner',x,11.65,10.4,3.84,.1,13.6,enamel);
 box('Crew forward headliner',0,11.65,14.05,5,.1,6.3,enamel);
 box('Crew aft headliner',0,11.65,4.25,5,.1,1.35,enamel);
 box('Secured crew locker',-5.7,9.8,6.2,.75,1.94,1.25,enamel);
 for(const z of [5.9,6.5])box('Crew locker handle',-5.28,9.85,z,.075,.25,.045,dark,true);
 wallX(-2.7,8.83,5,11.5);
 box('Quarters forward bulkhead',-4.5,10.28,11.5,3.6,2.9,.1);
 for(const [a,b] of [[-6.3,-4.8],[-3.2,-2.7]])box('Quarters entrance bulkhead',(a+b)/2,10.28,5,b-a,2.9,.1);
 box('Quarters door lintel',-4,11.43,5,1.6,.6,.1);
 sign('Crew quarters',-4,11.13,4.93,Math.PI);
 sign('Briefing room',4.9,11.12,12.02,Math.PI);
 // Stainless marine galley: sink, hob, oven, secured storage and serving top.
 // Authored equipment is detailed usable architecture, not a stand-in asset.
 const y=1.944;
 box('Galley base units',-5.8,y+.44,-14.3,1.1,.88,4.1,steel);
 box('Galley worktop',-5.8,y+.92,-14.3,1.23,.08,4.2,steel);
 for(const z of [-15.7,-14.65,-13.6,-12.55]){
  box('Inset cabinet door',-5.235,y+.43,z,.025,.72,.9,enamel,true);
  box('Cabinet pull',-5.17,y+.72,z,.06,.035,.36,dark,true);
 }
 box('Oven window',-5.21,y+.45,-14.65,.03,.43,.7,glass,true);
 box('Sink basin',-5.8,y+.975,-15.55,.77,.025,.7,dark,true);
 box('Sink well',-5.8,y+.987,-15.55,.59,.01,.52,steel,true);
 box('Tap',-6.18,y+1.14,-15.55,.055,.36,.055,steel,true);box('Tap spout',-6.03,y+1.3,-15.55,.32,.06,.06,steel,true);
 box('Cooktop',-5.8,y+.974,-14.2,.83,.025,.88,glass,true);
 for(const x of [-6.02,-5.6])for(const z of [-14.42,-14]){const g=new THREE.TorusGeometry(.13,.012,6,20),m=new THREE.Mesh(g,steel);owned.add(g);m.rotation.x=Math.PI/2;m.position.set(x,y+.999,z);m.userData.excludeShipNavigation=true;root.add(m);}
 box('Overhead galley cabinets',-6.07,y+2,-14.3,.7,.55,4.1,enamel);
 box('Extraction canopy',-5.8,y+1.88,-14.2,1.25,.2,1.1,steel);
 // Chart is an actual navigation workstation with a readable heading plate.
 sign('Navigation chart',4.8,14.3,9.8,Math.PI);
 sign('Wet lab • Marine conditions',4.5,4.32,-10.07,Math.PI);
 sign('Dry lab • Survey records',4.5,4.32,-3.07,Math.PI);
 sign('Mess • Journal',-4.5,4.32,-3.07,Math.PI);
 // Wet work stays at a washable bench, separate from the dry instrument desk.
 box('Wet lab sink cabinet',5.8,y+.44,-15.4,1.0,.88,2.7,steel);
 box('Wet lab draining top',5.8,y+.92,-15.4,1.1,.08,2.8,steel);
 box('Sample sink',5.8,y+.97,-15.9,.75,.02,.8,dark,true);
 box('Sample sink inset',5.8,y+.985,-15.9,.57,.012,.62,steel,true);
 box('Lab faucet',6.12,y+1.13,-15.9,.055,.32,.055,steel,true);
 box('Lab faucet spout',5.98,y+1.28,-15.9,.33,.055,.055,steel,true);
 for(const z of [-16.3,-15.3,-14.3])box('Wet lab drawer front',5.29,y+.46,z,.02,.72,.87,enamel,true);
 const screenCanvas=document.createElement('canvas');screenCanvas.width=768;screenCanvas.height=384;
 const screenTexture=new THREE.CanvasTexture(screenCanvas);screenTexture.encoding=THREE.sRGBEncoding;owned.add(screenTexture);
 const screenMaterial=new THREE.MeshBasicMaterial({map:screenTexture});materials.add(screenMaterial);
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.38,.69),screenMaterial);screen.position.set(4.4,3.73,-10.205);screen.rotation.y=Math.PI;screen.userData.excludeShipNavigation=true;owned.add(screen.geometry);root.add(screen);
 box('Marine instrument display housing',4.4,3.73,-10.12,1.48,.79,.12,dark);
 let screenKey='';
 function updateScreen(ctx){const wave=ctx?.activeWaterOpticsEvidence?.wave,known=wave?.truthType==='modeled'&&Number.isFinite(wave.waveHeightM);const lines=['MARINE CONDITIONS',known?`Waves  ${wave.waveHeightM.toFixed(2)} m`:'Wave model unavailable',known&&Number.isFinite(wave.wavePeriodS)?`Period  ${wave.wavePeriodS.toFixed(1)} s`:'Record available conditions in your Journal',known?'Regional model • not a ship measurement':'No measurements have been invented'];const key=lines.join('|');if(key===screenKey)return;screenKey=key;const c=screenCanvas.getContext('2d');c.fillStyle='#0b202b';c.fillRect(0,0,768,384);c.fillStyle='#9dcecd';c.font='600 30px system-ui';c.fillText(lines[0],30,60);c.fillStyle='#e6eff0';c.font='36px system-ui';c.fillText(lines[1],30,145);c.font='25px system-ui';c.fillText(lines[2],30,220);c.fillStyle='#a6b9c0';c.font='22px system-ui';c.fillText(lines[3],30,325);screenTexture.needsUpdate=true;}
 updateScreen(null);
 let disposed=false,lightCell='';
 return {root,ready:()=>library.ready(),update(p,ctx){if(p)updateScreen(ctx);const cell=p?`${Math.floor(p.x/2)}:${Math.floor(p.y)}:${Math.floor(p.z/2)}`:'';if(cell===lightCell)return;lightCell=cell;for(const l of lights)l.visible=false;if(p){const nearest=lights.filter(l=>Math.abs(l.position.y-p.y-2)<3).sort((a,b)=>Math.hypot(a.position.x-p.x,a.position.z-p.z)-Math.hypot(b.position.x-p.x,b.position.z-p.z));for(const l of nearest.slice(0,3))if(Math.hypot(l.position.x-p.x,l.position.z-p.z)<12)l.visible=true;}},dispose(){if(disposed)return;disposed=true;root.parent?.remove(root);for(const resource of owned)resource.dispose();for(const m of materials)m.dispose();library.dispose();}};
}

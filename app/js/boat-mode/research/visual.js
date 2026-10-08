import {createSubmarineMesh} from '../../ocean/submarine-visual.js';
import {RESEARCH_DECK as deck,RESEARCH_SOLIDS,RESEARCH_STATIONS} from './layout.js';
export function addResearchDeckVisual(THREE,root,materials,{detailed=false}={}) {
 const add=(geometry,material,x,y,z,name)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.name=name||'Research deck';root.add(m);return m};
 const floor=new THREE.MeshStandardMaterial({color:0x45616a,roughness:.9});
 const consoleMaterial=new THREE.MeshStandardMaterial({color:0x163642,roughness:.6});
 const screen=new THREE.MeshStandardMaterial({color:0x479fbb,emissive:0x215567,emissiveIntensity:.7,roughness:.35});
 const glass=new THREE.MeshStandardMaterial({color:0x8cc3cf,transparent:detailed,opacity:detailed?.22:1,roughness:.18,depthWrite:!detailed});
 add(new THREE.BoxGeometry(14,.18,55),floor,0,deck.y-.09,-4.5,'Walkable research deck');
 for(const s of RESEARCH_SOLIDS){
  if(s.id==='crane-base'||s.id==='submarine-cradle')continue;
  const wall=/wall|front|door-/.test(s.id);
  if(wall){
   add(new THREE.BoxGeometry(s.w,.9,s.l),materials.deck,s.x,deck.y+.45,s.z,s.id);
   add(new THREE.BoxGeometry(s.w,1.7,s.l),glass,s.x,deck.y+1.75,s.z,`${s.id} windows`);
   add(new THREE.BoxGeometry(s.w,.5,s.l),materials.deck,s.x,deck.y+2.85,s.z,`${s.id} header`);
   if(detailed){
    const alongZ=s.l>s.w,length=alongZ?s.l:s.w,segments=Math.max(1,Math.ceil(length/2.6));
    for(let i=0;i<=segments;i++){const offset=-length*.5+i*length/segments;add(new THREE.BoxGeometry(.09,1.7,.09),materials.deck,s.x+(alongZ?0:offset),deck.y+1.75,s.z+(alongZ?offset:0),`${s.id} window frame`);}
   }

  }else{
   add(new THREE.BoxGeometry(s.w,s.h,s.l),consoleMaterial,s.x,deck.y+s.h*.5,s.z,s.id);
   add(new THREE.BoxGeometry(s.w*.86,.035,s.l*.82),screen,s.x,deck.y+s.h+.018,s.z,`${s.id} work surface`);
  }
 }
 add(new THREE.BoxGeometry(4.5,.16,2.8),materials.accent,-3.5,deck.y+3.18,-12.4,'Wet lab canopy');
 add(new THREE.BoxGeometry(11,.16,20.4),materials.accent,0,deck.y+3.18,9,'Bridge roof');
 const rail=new THREE.MeshStandardMaterial({color:0xebc26e,metalness:.45,roughness:.45});
 for(const x of [-6.85,6.85])for(let z=-31.5;z<=22;z+=2.5){
  if(x>0&&Math.abs(z+23.4)<1.7)continue;
  add(new THREE.CylinderGeometry(.035,.035,1.05,6),rail,x,deck.y+.525,z,'Safety stanchion');
  add(new THREE.BoxGeometry(.055,.055,2.5),rail,x,deck.y+1.02,z+1.25,'Safety rail');
 }
 for(const z of [-31.7,22.7])add(new THREE.BoxGeometry(13.7,.065,.065),rail,0,deck.y+1.02,z,'End rail');
 // Deck lanes and station plates make the working areas legible at player height.
 const lane=new THREE.MeshBasicMaterial({color:0xd9b45e});
 add(new THREE.BoxGeometry(.12,.012,46),lane,0,deck.y+.012,-6,'Center deck lane');
 if(detailed){
  const sub=createSubmarineMesh({OCEAN_CONSTANTS:{SUB_SCALE:.86}});sub.name='Docked research submarine';sub.position.set(-3.3,deck.y+1.65,-25);sub.traverse(o=>{if(o.isLight)o.intensity=0;});root.add(sub);
  for(const z of [-28,-22])add(new THREE.BoxGeometry(3.8,.5,.3),consoleMaterial,-3.3,deck.y+.25,z,'Submarine cradle');
  const dark=new THREE.MeshStandardMaterial({color:0x162c35,roughness:.7});
  function display(x,y,z,title,subtitle){
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
   const c=canvas.getContext('2d');c.fillStyle='#092431';c.fillRect(0,0,512,256);c.strokeStyle='#245266';c.lineWidth=2;
   for(let p=20;p<512;p+=40){c.beginPath();c.moveTo(p,0);c.lineTo(p,256);c.stroke()}for(let p=16;p<256;p+=40){c.beginPath();c.moveTo(0,p);c.lineTo(512,p);c.stroke()}
   c.fillStyle='#e9f5e9';c.font='bold 44px system-ui';c.fillText(title,24,80);c.font='24px system-ui';c.fillText(subtitle,24,135);c.fillStyle='#e6b553';c.fillRect(24,184,330,8);
   const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture});material.userData.ownedLocalCanvasTexture=true;
   add(new THREE.BoxGeometry(1.14,.7,.1),dark,x,y,z,'Instrument housing');
   add(new THREE.PlaneGeometry(1.05,.55),material,x,y,z-.056,'Instrument display').rotation.y=Math.PI;
   add(new THREE.BoxGeometry(.08,.32,.08),dark,x,y-.42,z,'Instrument stand');
  }
  display(-1.5,deck.y+1.62,17,'HELM','Take control at the bridge');
  display(1.5,deck.y+1.62,17,'NAVIGATION','Open the chart table');
  display(-3.5,deck.y+1.5,-12,'WATER LAB','Review sources, then record');
  const labScreen=root.children.find(m=>m.name==='Instrument display'&&m.position.z<0);labScreen.rotation.y=0;labScreen.position.z=-11.944;
  for(const x of [-4.6,-4.35,-4.1]){
   add(new THREE.CylinderGeometry(.065,.065,.22,10),glass,x,deck.y+1.14,-12.2,'Sample vial');
   add(new THREE.CylinderGeometry(.07,.07,.035,10),rail,x,deck.y+1.27,-12.2,'Vial cap');
  }
  add(new THREE.BoxGeometry(.62,.07,.48),dark,-2.4,deck.y+1.065,-12,'Wash basin');
  const faucet=new THREE.CatmullRomCurve3([new THREE.Vector3(-2.1,deck.y+1.05,-12.3),new THREE.Vector3(-2.1,deck.y+1.4,-12.3),new THREE.Vector3(-2.4,deck.y+1.4,-12.3),new THREE.Vector3(-2.4,deck.y+1.28,-12.3)]);
  add(new THREE.TubeGeometry(faucet,12,.024,6,false),rail,0,0,0,'Lab faucet');
  for(const x of [-5.7,-5.1])add(new THREE.BoxGeometry(.035,.3,.08),rail,x,deck.y+.9,-16.65,'Locker handle');
  for(const x of [-5.5,5.5]){
   add(new THREE.CylinderGeometry(.12,.17,.5,10),dark,x,deck.y+.25,-29,'Mooring bollard');
   add(new THREE.BoxGeometry(.5,.1,.15),dark,x,deck.y+.48,-29,'Mooring cleat');
  }
  for(const station of RESEARCH_STATIONS){
   add(new THREE.BoxGeometry(1.5,.015,.12),lane,station.x,deck.y+.018,station.z,'Station threshold');
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#0b2938';ctx.fillRect(0,0,512,96);ctx.fillStyle='#e7f6fa';ctx.font='bold 30px system-ui';ctx.textAlign='center';ctx.fillText(station.label.toUpperCase(),256,59);
   const texture=new THREE.CanvasTexture(canvas),material=new THREE.SpriteMaterial({map:texture,depthTest:true});
   const label=new THREE.Sprite(material);label.position.set(station.x,deck.y+2.8,station.id==='lab'?-13.3:station.z+2);label.scale.set(1.5,.28,1);label.name=`Station sign ${station.id}`;root.add(label);
  }
  for(const z of [-13,9]){const light=new THREE.PointLight(0xd9efff,.65,22,2);light.position.set(0,deck.y+2.6,z);root.add(light);}
 }
 return {bridgeTop:deck.y+3.3};
}

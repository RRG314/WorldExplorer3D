import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {stepGameplayKeys} from './gameplay-simulation.mjs';

async function walkTo(page,point,tolerance=1.1){
 let stalled=0,previous=Infinity;
 for(let i=0;i<220;i++){
  const p=await page.evaluate(()=>{const w=venueCtx.Walk.state.walker;return{x:w.x,y:w.y,z:w.z,yaw:w.yaw};});
  const distance=Math.hypot(point.x-p.x,point.z-p.z);if(distance<tolerance)return p;
  const heading=Math.atan2(point.x-p.x,point.z-p.z),delta=Math.atan2(Math.sin(heading-p.yaw),Math.cos(heading-p.yaw));
  if(Math.abs(delta)>.075){await stepGameplayKeys(page,delta>0?'ArrowLeft':'ArrowRight',Math.max(16,Math.min(500,Math.abs(delta)/2.6*800)));continue;}
  await stepGameplayKeys(page,'ArrowUp',Math.max(30,Math.min(6000,(distance-tolerance*.7)/2.8*800)));
  if(distance>previous-.02)stalled++;else stalled=0;previous=distance;assert.ok(stalled<9,`Walk route stalled at ${JSON.stringify(p)} toward ${JSON.stringify(point)}`);
 }
 throw Error('Walking route did not reach its target');
}
export async function verifyKennedyTour(page,out){
 const plan=await page.evaluate(async()=>{
  const active=venueCtx.activeInterior,aisle=active.group.localToWorld(new THREE.Vector3(0,0,-20));
  return {stations:active.interactions.filter(i=>i.kind==='facility-station'),aisle:{x:aisle.x,z:aisle.z},exit:{...active.entryPoint}};
 });
 const visited=[];
 for(const station of plan.stations){
  if(station.stationId==='assembly')await walkTo(page,plan.aisle);
  await walkTo(page,station);await page.keyboard.press('KeyE');
  const dialog=page.getByRole('dialog',{name:station.label,exact:true});await dialog.waitFor({state:'visible'});
  await page.screenshot({path:`${out}/station-${station.stationId}.png`});
  if(station.stationId==='low-bay'){
   await dialog.getByRole('button',{name:'Roll out to the pad',exact:true}).click();assert.match(await dialog.innerText(),/comes later/);
   for(const label of ['Prepare components','Assemble in the high bay','Roll out to the pad'])await dialog.getByRole('button',{name:label,exact:true}).click();assert.match(await dialog.innerText(),/Sequence complete/);
  }
  await dialog.getByRole('button',{name:'Close',exact:true}).click();visited.push(station.stationId);
  await walkTo(page,plan.aisle);
 }
 await walkTo(page,plan.aisle);await walkTo(page,plan.exit);return {visited,controls:'Normal DOM walking, E and dialog controls; no interior position injection'};
}
export async function verifyLaunchPad(page,out){
 const site=await page.evaluate(()=>{const root=venueCtx.buildingMeshes.find(m=>m.userData.reviewedLaunchSite);const p=venueCtx.geoToWorld(28.62725,-80.62085);return root?{name:root.name,...root.userData,nearbyBuildings:venueCtx.buildings.filter(b=>Math.hypot(b.centerX-p.x,b.centerZ-p.z)<260).map(b=>({id:b.sourceBuildingId,height:b.height,type:b.buildingType,pts:b.pts,centerX:b.centerX,centerZ:b.centerZ,provenance:b.buildingProvenance?.metadata}))}:null;});
 assert.ok(site,'Launch Pad 39B must be published');
 const cameraShot=await page.evaluate(()=>{
  const c=venueCtx.camera,p=c.position.clone(),q=c.quaternion.clone(),at=venueCtx.geoToWorld(28.62735,-80.62085);
  c.position.set(at.x+330,240,at.z+280);c.lookAt(at.x,55,at.z-20);venueCtx.renderer.render(venueCtx.scene,c);const data=venueCtx.renderer.domElement.toDataURL('image/png').split(',')[1];c.position.copy(p);c.quaternion.copy(q);return data;
 });await writeFile(out+'/launch-pad-overview.png',Buffer.from(cameraShot,'base64'));
 const path=await page.evaluate(()=>[28.624,28.625,28.626,28.62635,28.6269].map(lat=>venueCtx.geoToWorld(lat,-80.62055)));
 const reached=[];for(const point of path)reached.push(await walkTo(page,point,1.5));
 assert.ok(reached.at(-1).y>reached[0].y+5,'Walk continuously up the mapped launch-pad approach');
 await page.screenshot({path:out+'/launch-pad-walking.png'});
 return {site,reached,scope:'Normal continuous walking from the south approach, actual published contact geometry; not launch operations or performance certification'};
}

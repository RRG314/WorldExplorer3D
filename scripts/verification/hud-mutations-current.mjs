import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4497,4498]});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.port}/app/js/hud.js`);
 const ids=['speedUnitLabel','limitLabel','street','locationLine','conditionBar','conditionFill','coords','coordsText','speed','limit','indBrake','indBoost','indDrift'];
 await page.setContent(ids.map(id=>`<div id="${id}"></div>`).join('')+'<a data-osm-location-link>Edit</a>');
 await page.addScriptTag({url:`http://127.0.0.1:${server.port}/node_modules/three/build/three.min.js`});
 const result=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  const {updateHUD}=await import('/app/js/hud.js');
  Object.assign(ctx,{selLoc:'custom',customLoc:{name:'Test City'},LOC:{lat:39.29,lon:-76.61},SCALE:100000,METERS_PER_WORLD_UNIT:1,keys:{},Walk:{state:{mode:'walk',walker:{x:0,z:0,angle:0,speedMph:2}}},car:{speed:0,x:0,z:0,angle:0,condition:1},playerConditionAuthority:{snapshot:()=>({condition:1})}});
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  updateHUD();await tick();let mutations=0;
  const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(document.body,{attributes:true,childList:true,characterData:true,subtree:true});
  for(let i=0;i<40;i++){updateHUD();await tick();}
  const unchangedMutations=mutations;
  ctx.Walk.state.walker.speedMph=4;ctx.Walk.state.walker.x=100;ctx.keys.ShiftLeft=true;ctx.playerConditionAuthority.snapshot=()=>({condition:.4});updateHUD();await tick();
  const text=id=>document.getElementById(id).textContent;
  const changed={speed:text('speed'),activity:text('indDrift'),health:document.getElementById('conditionBar').getAttribute('aria-valuenow'),state:document.getElementById('conditionFill').dataset.state,coords:text('coordsText')};
  ctx.Walk.state.mode='drive';ctx.car.road={name:'Mapped Road',limit:30};updateHUD();await tick();
  const drive={street:text('street'),limit:text('limit'),activity:text('indDrift')};
  mutations=0;for(let i=0;i<20;i++){updateHUD();await tick();}const unchangedDriveMutations=mutations;
  observer.disconnect();return {unchangedMutations,unchangedDriveMutations,changed,drive};
 });
 console.log(JSON.stringify(result));
 assert.equal(result.unchangedMutations,0,'An unchanged walking HUD must not mutate the document');
 assert.equal(result.unchangedDriveMutations,0,'An unchanged driving HUD must not mutate the document');
 assert.equal(result.changed.speed,'4');assert.equal(result.changed.activity,'RUN');assert.equal(result.changed.health,'40');assert.equal(result.changed.state,'injured');assert.match(result.changed.coords,/-76\.6087/);
 assert.deepEqual(result.drive,{street:'Mapped Road',limit:'30',activity:'DRIFT'});
}finally{await browser.close();await server.close();}

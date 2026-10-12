import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {stepGameplayKeys} from './gameplay-simulation.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const faults=process.argv.includes('--faults');
const out=process.env.WE3D_AQUARIUM_OUTPUT||'output/aquarium-expansion/current-visit';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4496,4497]});const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await context.newPage(),errors=[],report={ok:false,evidence:'Full source game with ordinary entry, keyboard movement and actual local assets; not hosted release or physical-phone approval.',checks:[]};
collectBrowserGraphicsErrors(page,errors);page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='warning'&&/Interior|aquarium/i.test(m.text()))report.warnings=(report.warnings||[]).concat(m.text());});
const check=(name,value)=>{report.checks.push({name,passed:!!value});console.log('[aquarium]',name,value?'PASS':'FAIL');assert.ok(value,name);};
async function pose(){return page.evaluate(()=>{const w=globalThis.venueCtx.Walk.state.walker;return{x:w.x,y:w.y,z:w.z,yaw:w.yaw||w.angle};});}
async function walkTo(point,tolerance=.55){let previous=Infinity,stalled=0;for(let i=0;i<190;i++){const p=await pose(),distance=Math.hypot(point.x-p.x,point.z-p.z);if(distance<tolerance)return;const target=Math.atan2(point.x-p.x,point.z-p.z),delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));if(Math.abs(delta)>.09){await stepGameplayKeys(page,delta>0?'ArrowLeft':'ArrowRight',Math.max(16,Math.min(450,Math.abs(delta)/2.6*800)));continue;}await stepGameplayKeys(page,'ArrowUp',Math.max(30,Math.min(450,(distance-tolerance+.1)/2.8*800)));if(distance>previous-.01)stalled++;else stalled=0;previous=distance;assert.ok(stalled<12,`Walking blocked: ${JSON.stringify({point,p,distance})}`);}throw Error(`Walking timed out: ${JSON.stringify(point)}`);}
async function face(point){
 for(let i=0;i<24;i++){const p=await pose(),target=Math.atan2(point.x-p.x,point.z-p.z),delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));if(Math.abs(delta)<.025)return;await stepGameplayKeys(page,delta>0?'ArrowLeft':'ArrowRight',Math.max(16,Math.min(450,Math.abs(delta)/2.6*800)));}
 throw Error('Could not face the habitat using normal turn input');
}
async function at(u,v){return page.evaluate(({u,v})=>{const a=globalThis.venueCtx.activeInterior,p=a.definition.aquariumPlan.local(u,v);return{x:p.x+a.center.x,z:p.z+a.center.z};},{u,v});}
async function interact(){await page.keyboard.press('KeyE');await page.waitForTimeout(180);}
async function lift(id,level){const point=await page.evaluate(id=>{const a=globalThis.venueCtx.activeInterior;return a.authoredLifts.find(l=>l.id===id).stops.find(s=>s.level===a.activeLevel);},id);await walkTo(point);await interact();await page.locator('#interiorElevatorFloorPicker').waitFor();await page.locator(`[data-elevator-level="${level}"]`).click();await page.waitForFunction(level=>globalThis.venueCtx.activeInterior.activeLevel===level,level);}

async function saveObservation(id){
 await interact();await page.locator('.galleryDialog').waitFor();check(`Correct observation opens: ${id}`,await page.evaluate(id=>globalThis.venueCtx.activeInterior.aquarium.panel.observationId===id,id));
 const before=await pose(),clock=await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.clock);await page.evaluate(()=>advanceTime(800));check(`Inspection pauses simulation: ${id}`,await page.evaluate(clock=>globalThis.venueCtx.activeInterior.aquarium.clock===clock,clock));
 await page.getByRole('button',{name:'Save observation',exact:true}).click();await page.getByRole('button',{name:'Saved in Journal',exact:true}).waitFor();
 await page.screenshot({path:`${out}/${id}.png`});
 if(id==='reef-community'){
  await page.getByRole('button',{name:'Visitor map',exact:true}).click();for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await page.waitForTimeout(200);check(`Map fits ${viewport.width} x ${viewport.height}`,await page.locator('.galleryDialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await page.screenshot({path:`${out}/map-${viewport.width}.png`});}await page.setViewportSize({width:1280,height:800});
  for(const level of [0,1,2]){const b=page.locator(`[data-venue-action="floor:${level}"]`);if(await b.isEnabled())await b.click();check(`Map shows requested floor ${level}`,await page.evaluate(level=>globalThis.venueCtx.activeInterior.aquarium.panel.level===level,level));}
 }
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.galleryDialog').waitFor({state:'detached'});check(`Inspection preserves pose: ${id}`,JSON.stringify(before)===JSON.stringify(await pose()));
}

try{
 let injected=false;if(faults)await page.route('**/blacktip-reef-shark.glb*',async route=>{if(!injected){injected=true;await route.fulfill({status:503,body:'Deliberate reef asset failure'});}else await route.continue();});
 await configureStagingAppCheck(page,server.url||`http://127.0.0.1:${server.port}`);
 await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.28551&lon=-76.60860&lname=National%20Aquarium&mode=walking`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return d?.gameStarted&&!d.worldLoading&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:300000});
 await page.evaluate(async()=>{globalThis.venueCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 const targets=await page.evaluate(()=>{const c=globalThis.venueCtx;return c.buildings.filter(b=>b.sourceBuildingId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf').map(b=>{const s=c.resolveBuildingEntrySupport(b,{allowSynthetic:false});return {key:s.key,baseY:b.baseY,minY:b.minY,bodyHeight:b.bodyHeightMeters,ground:c.GroundHeight?.walkSurfaceY?.(b.centerX,b.centerZ),pts:b.pts,center:{x:b.centerX,z:b.centerZ},door:s.exteriorEntrance,enterable:s.enterable};});});report.targets=targets;
 report.entranceDiagnostic=await page.evaluate(async()=>{const c=globalThis.venueCtx,{compileEntranceCatalog}=await import('/app/js/living-world/entrance-catalog.js'),{aquariumMappedEntrance}=await import('/app/js/interiors/aquarium-geography.js');const buildings=c.buildings.filter(b=>b.sourceBuildingId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf'),mapped=aquariumMappedEntrance(c);return{published:c.buildingEntranceCatalog?.diagnostics,mapped,withoutGround:compileEntranceCatalog({buildings,mappedEntrances:mapped,limit:10}),withGround:compileEntranceCatalog({buildings,mappedEntrances:mapped,limit:10,sampleGround:(x,z)=>c.GroundHeight?.walkSurfaceY?.(x,z)}),meshes:c.buildingMeshes.filter(m=>m.userData.sourceBuildingId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf').map(m=>({name:m.name,lod:m.userData.lodTier,semantics:m.userData.buildingSemantics,exterior:m.material?.userData?.buildingExterior,roof:m.userData.isRoofDetail,vertices:m.geometry?.attributes?.position?.count}))};});
 const target=targets.find(t=>t.door);check('Aquarium has one actual published public entrance',targets.filter(t=>t.door).length===1);
 await walkTo({x:target.door.approachX,z:target.door.approachZ},1);await page.screenshot({path:`${out}/exterior-entry.png`});await interact();
 await page.waitForFunction(()=>globalThis.venueCtx.activeInterior?.aquarium,null,{timeout:20000});check('Geographic entrance admits aquarium-specific layout',true);
 await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.ready);report.initial=JSON.parse(await page.evaluate(()=>globalThis.render_game_to_text()));
 report.presentation=await page.evaluate(()=>{const c=globalThis.venueCtx;return {near:c.camera.near,far:c.camera.far,fog:c.scene.fog?{density:c.scene.fog.density,color:c.scene.fog.color.getHexString()}:null,precision:c.renderer.capabilities.precision,physicalLights:c.renderer.physicallyCorrectLights,composerTargets:c.composer?[c.composer.renderTarget1,c.composer.renderTarget2].map(t=>({stencil:t.stencilBuffer,colorType:t.texture.type,width:t.width,height:t.height})):[],shadows:{enabled:c.renderer.shadowMap.enabled,autoUpdate:c.renderer.shadowMap.autoUpdate,type:c.renderer.shadowMap.type},exposure:c.renderer.toneMappingExposure};});
 report.savedOutside=await page.evaluate(()=>({...globalThis.venueCtx.activeInterior.outsideState}));
 if(faults){await walkTo(await at(0,10));await interact();await page.getByRole('button',{name:'Retry reef models',exact:true}).waitFor();check('Missing animal leaves map, exit and a visible retry',true);await page.getByRole('button',{name:'Retry reef models',exact:true}).click();await page.waitForFunction(()=>globalThis.venueCtx.activeInterior.aquarium.animals.length===4&&!globalThis.venueCtx.activeInterior.aquarium.loading,null,{timeout:45000});await page.getByRole('button',{name:'Close',exact:true}).click();}
 check('All four animal rigs and coral models load',await page.evaluate(()=>{const s=globalThis.venueCtx.activeInterior.aquarium;return s.animals.length===4&&s.furnishings.length===18&&!s.error;}));
 await runPrescribedGameActions(page,out,[{buttons:[],frames:5}],'body > canvas:not(#minimap)');
 await page.screenshot({path:`${out}/pavilion-arrival.png`});
 await lift('pavilion-lift',2);check('Pavilion lift reaches authored level 1',true);await page.screenshot({path:`${out}/pavilion-overlook.png`});
 await walkTo(await at(0,14));await walkTo(await at(-1,22));await walkTo(await at(-17,41));await walkTo(await at(-17,50));await walkTo(await at(-18,55));
 await face(await at(-36,64));await page.screenshot({path:`${out}/reef-overlook.png`});
 await saveObservation('reef-community');
 // Continue around the curved visitor edge, then use the actual lift control.
 for(const p of [[-18.5,58],[-19,64],[-18.5,70],[-18.5,73],[-19,75.4],[-24,76.5],[-32,76.5]])await walkTo(await at(...p));
 await lift('reef-lift-a',1);check('Elevator A reaches level M without rebuilding',true);
 for(const p of [[-25,76],[-19,75.4],[-18.5,73],[-18.5,70],[-19.3,63.5]])await walkTo(await at(...p));
 await face(await at(-36,63.5));await page.screenshot({path:`${out}/underwater-window.png`});
 // Use the game's ordinary right-button look control from the dry lower
 // gallery. No camera or actor state assignment is used to stage this view.
 await page.mouse.move(640,360);await page.mouse.down({button:'right'});await page.mouse.move(640,470,{steps:8});await page.mouse.up({button:'right'});await page.evaluate(()=>advanceTime(100));
 check('Normal mouse look shows the water underside from the dry gallery',await page.evaluate(()=>{const a=globalThis.venueCtx.activeInterior,w=a.aquarium.water;return a.activeLevel===1&&w.mesh.material.uniforms.waterSide.value===-1&&w.snapshot().lastPassTime>=0;}));
 await page.screenshot({path:`${out}/underwater-surface.png`});
 await page.mouse.down({button:'right'});await page.mouse.move(640,360,{steps:8});await page.mouse.up({button:'right'});await page.evaluate(()=>advanceTime(100));

 for(const [id,u,v] of [['turtle-observation',-18.5,69.3],['blacktip-motion',-18.5,57.4]]){await walkTo(await at(u,v));await saveObservation(id);}
 check('All three observations reach the existing Journal',await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.saved.size===3));
 for(const p of [[-18.5,64],[-18.5,73],[-19,75.4],[-25,76],[-32,76.5]])await walkTo(await at(...p));
 await lift('reef-lift-a',2);check('Return from M to the same upper route',true);
 for(const p of [[-25,76],[-19,75.4],[-18.5,73],[-18.5,64],[-18,55],[-17,50],[-17,41],[-1,22],[0,14]])await walkTo(await at(...p));
 await lift('pavilion-lift',0);check('Return lift reaches harbor exit level',true);
 const moveStart=await pose();await stepGameplayKeys(page,['ArrowUp','ShiftLeft'],250);const ran=await pose();check('Run moves on Pavilion floor',Math.hypot(ran.x-moveStart.x,ran.z-moveStart.z)>.6);
 await stepGameplayKeys(page,'Space',250);const jumped=await pose();await page.evaluate(()=>advanceTime(1200));check('Jump lands on the same floor',jumped.y>ran.y+.1&&Math.abs((await pose()).y-ran.y)<.07);
 await page.evaluate(()=>{const a=globalThis.venueCtx.activeInterior;globalThis.oldAquariumWater=a.aquarium.water;});
 const exit=await page.evaluate(()=>globalThis.venueCtx.activeInterior.interactions.find(i=>i.kind==='exit'));await walkTo(exit);await interact();await page.waitForFunction(()=>!globalThis.venueCtx.activeInterior);
 check('Outdoor camera clipping restores exactly',await page.evaluate(saved=>globalThis.venueCtx.camera.near===saved.cameraNear&&globalThis.venueCtx.camera.far===saved.cameraFar,report.savedOutside));
 const outside=await pose();check('Harbor position restores exactly',Math.hypot(outside.x-report.savedOutside.x,outside.y-report.savedOutside.y,outside.z-report.savedOutside.z)<.12);
 check('Water targets and outdoor camera restore on exit',await page.evaluate(()=>globalThis.oldAquariumWater.snapshot().renderTargets===0&&globalThis.venueCtx.camera.layers.mask===1));
 await interact();await page.waitForFunction(()=>globalThis.venueCtx.activeInterior?.aquarium?.saved.size===3);await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.ready);check('Reentry restores all Journal notes',true);
 check('Reentry creates only two water targets',await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.water.snapshot().renderTargets===2));
 await walkTo(await page.evaluate(()=>globalThis.venueCtx.activeInterior.interactions.find(i=>i.kind==='exit')));await interact();await page.waitForFunction(()=>!globalThis.venueCtx.activeInterior);
 report.assets=await page.evaluate(()=>getWorldExplorerRuntimeDiagnostics().modelAssets);check('Aquarium model leases are released',report.assets.entries.filter(e=>/aquarium-|marine-.*coral/.test(e.id)).every(e=>e.leases===0));
 report.ok=true;check('No page or GPU errors',errors.length===0);
}catch(error){report.failure=String(error.stack||error);await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{report.errors=errors;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}

import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.WE3D_ART_OUT||'output/verification/product-plan/planetary-art';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto((process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4398')+'/app/?launch=space');
 await page.waitForFunction(()=>document.querySelector('#startBtn')?.disabled===false,null,{timeout:90000});
 await page.evaluate(()=>{document.querySelector('#spaceLaunchToggle').click();document.querySelector('#startBtn').click()});
 await page.waitForFunction(()=>JSON.parse(render_game_to_text()).modes?.space,null,{timeout:90000});
 await page.evaluate(async()=>{window.c=(await import('/app/js/shared-context.js?v=55')).ctx;window.__beforeSurfaceEnvironment=c.scene.environment;});
 for(const body of ['moon','mars','andromeda-explorer-a-b']){
  await page.evaluate(async id=>{if(id==='moon')c.arriveAtMoon();else if(id==='mars'){await import('/app/js/planetary/mars-world.js');await c.arriveAtMars();}else{c.prepareDestinationMissionSurface(id);await c.arriveAtSolidWorld(id);}},body);
  await page.waitForFunction(id=>id==='moon'?c.moonSurface?.userData?.ready:id==='mars'?c.onMars:c.activePlanetaryBodyId===id,body,{timeout:90000});
  if(body==='mars')await page.evaluate(()=>{
    const texture=c.scene.environment;
    if(texture?.name!=='Surface sky and ground reflections')throw Error('Mars metallic equipment has no local reflection field');
    window.__marsReflectionReceipt={disposed:0,restoredBeforeDisposal:false};
    texture.addEventListener('dispose',()=>{__marsReflectionReceipt.disposed++;__marsReflectionReceipt.restoredBeforeDisposal=c.scene.environment===__beforeSurfaceEnvironment;});
  });
  if(body==='andromeda-explorer-a-b'){
    const receipt=await page.evaluate(()=>__marsReflectionReceipt);
    assert.equal(receipt.disposed,1,'Mars reflection texture is released when another surface takes ownership');
    assert.equal(receipt.restoredBeforeDisposal,true,'Incoming environment is restored before owned reflections are released');
  }
  await page.waitForTimeout(1500);
  await page.evaluate(()=>c.setTravelMode('walk'));
  await page.waitForTimeout(2500);
  await page.screenshot({path:`${out}/${body}.png`});
  const motion=await page.evaluate(async id=>{
    const {snapshotPlanetaryObstacles}=await import('/app/js/planetary/runtime/obstacle-authority.js?v=1');
    const {planetarySurfaceYAtRenderXZ}=await import('/app/js/planetary/runtime/surface-query.js?v=3');
    const obstacles=snapshotPlanetaryObstacles();
    const rock=obstacles.obstacles.find(o=>o.kind==='surface-formation');
    if(!rock)throw Error('No collidable geology for '+id);
    c.setTravelMode('drive');
    Object.assign(c.car,{x:rock.x-rock.radius-8,z:rock.z,y:planetarySurfaceYAtRenderXZ(c,rock.x-rock.radius-8,rock.z)+1.2,
      angle:Math.PI/2,speed:0,vFwd:0,vLat:0,vx:0,vz:0,vy:0,yawRate:0,steerSm:0,_lastSurfaceY:null});
    const start=c.car.x,read=c.readControlActions;c.readControlActions=()=>({throttle:1});
    try{for(let i=0;i<300;i++)c.update(1/60);}finally{c.readControlActions=read;}
    const collision={body:id,moved:c.car.x-start,clearance:Math.hypot(c.car.x-rock.x,c.car.z-rock.z)-rock.radius,speed:c.car.speed,obstacles:obstacles.obstacles.length};
    const samples=await new Promise(resolve=>{let last;const times=[];function frame(t){if(last)times.push(t-last);last=t;if(times.length<180)requestAnimationFrame(frame);else resolve(times.sort((a,b)=>a-b));}requestAnimationFrame(frame)});
    return {...collision,timing:{p50:samples[90],p95:samples[171],max:samples.at(-1),over100:samples.filter(t=>t>100).length}};
  },body);
  assert.ok(motion.moved>1,JSON.stringify(motion));assert.ok(motion.clearance>=2.09,JSON.stringify(motion));assert.ok(Math.abs(motion.speed)<.1,JSON.stringify(motion));
  results.push({...motion,...await page.evaluate(id=>({body:id,character:c.Walk?.state?.characterMesh?.userData?.curatedCharacterAssetId,car:{x:c.car.x,y:c.car.y,z:c.car.z},draws:c.renderer.info.render.calls,triangles:c.renderer.info.render.triangles,environmentMap:c.scene.environment!==null,hemiVisible:c.hemiLight.visible}),body)});
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:`${out}/copper-phone.png`});
 const cleanup=await page.evaluate(async()=>{const {snapshotPlanetaryObstacles}=await import('/app/js/planetary/runtime/obstacle-authority.js?v=1');c.prepareTitleEnvironment();return {obstacles:snapshotPlanetaryObstacles().obstacles.length,attachedGeology:c.scene.children.filter(o=>o.name.endsWith(' local geology')&&o.visible).length};});
 assert.equal(cleanup.obstacles,0);assert.equal(cleanup.attachedGeology,0);
 await writeFile(`${out}/report.json`,JSON.stringify({results,cleanup,errors,marsReflection:await page.evaluate(()=>__marsReflectionReceipt)},null,2));console.log(JSON.stringify({results,cleanup,errors,marsReflection:await page.evaluate(()=>__marsReflectionReceipt)}));
 if(errors.length)process.exitCode=1;
}finally{await browser.close()}

import {getUniverseDestinations} from '../../app/js/universe/catalog.js';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const destinationsOnly=process.argv.includes('--destinations');
const out=process.env.WE3D_GALLERY_OUT||(destinationsOnly?'output/verification/space-destination-travel':'output/verification/space-surface-gallery');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const page=await browser.newPage({viewport:{width:1100,height:740}});const errors=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));let requests=0;page.on('request',()=>requests++);
try{
 await page.goto(process.env.WE3D_VERIFY_BASE_URL+'/app/?launch=space');
 await page.waitForFunction(()=>document.querySelector('#startBtn')?.disabled===false);
 await page.evaluate(()=>{document.querySelector('#spaceLaunchToggle')?.click();document.querySelector('#startBtn').click()});
 await page.waitForFunction(()=>JSON.parse(render_game_to_text()).modes?.space,null,{timeout:90000});
 await page.evaluate(async()=>{window.c=(await import('/app/js/shared-context.js?v=55')).ctx;});
 if(!destinationsOnly)for(const body of ['mercury','venus','io','europa','titan','enceladus','triton','ceres','vesta','pluto']){
  const started=Date.now();await page.evaluate(id=>c.arriveAtSolidWorld(id),body);await page.waitForTimeout(700);
  const before=requests;await page.keyboard.down('w');
  const timing=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let start,last;function step(t){start??=t;if(last)samples.push(t-last);last=t;if(t-start<3000)requestAnimationFrame(step);else{samples.sort((a,b)=>a-b);resolve({fps:samples.length*1000/(t-start),p99:samples[Math.ceil(samples.length*.99)-1],max:samples.at(-1),programs:c.renderer.info.programs.length,draws:c.renderer.info.render.calls,body:c.activePlanetaryBodyId,gain:c.activeSolidWorldSurface?.userData.visualLightingGain});}}requestAnimationFrame(step);}));
  await page.keyboard.up('w');await page.screenshot({path:`${out}/${body}.png`});
  const sky=await page.evaluate(()=>{const v=c.activeParentSkyViews?.[0];return v?{parent:v.userData.parentBodyId,...v.userData.parentSkyPlacement}:null;});
  results.push({body,arrivalAndSampleMs:Date.now()-started,requestsDuringMovement:requests-before,timing,sky});console.log(body,JSON.stringify(timing));
  await writeFile(`${out}/report.json`,JSON.stringify({complete:false,scope:'Direct arrival scene fixtures and 3-second normal-RAF forward movement; not full journeys or sustained performance acceptance',results,errors},null,2));
 }
 if(destinationsOnly)for(const destination of getUniverseDestinations().filter(d=>!process.env.WE3D_DESTINATION_FILTER||process.env.WE3D_DESTINATION_FILTER.split(',').includes(d.id))){
  const info={id:destination.id,frame:destination.parentFrameId||destination.id,kind:destination.objectClass};
  if(['exoplanet','planetary_system'].includes(info.kind))await page.evaluate(info=>{if(!c.restoreUniverseLocalFrame(info.frame,info.kind==='exoplanet'?info.id:''))throw Error('Cannot restore '+info.id);},info);
  else{await page.evaluate(id=>{if(!c.travelToUniverseDestination(id))throw Error('Cannot travel '+id);},info.id);await page.waitForFunction(id=>c.universeRuntime.current.id===id&&!c.universeRuntime.transition,info.id,{timeout:30000});}
  await page.waitForTimeout(300);const before=requests;await page.keyboard.down('Space');
  const timing=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let start,last;function step(t){start??=t;if(last)samples.push(t-last);last=t;if(t-start<3000)requestAnimationFrame(step);else{samples.sort((a,b)=>a-b);resolve({fps:samples.length*1000/(t-start),p99:samples[Math.ceil(samples.length*.99)-1],max:samples.at(-1),programs:c.spaceFlight.renderer.info.programs.length,draws:c.spaceFlight.renderer.info.render.calls});}}requestAnimationFrame(step);}));
  await page.keyboard.up('Space');await page.screenshot({path:`${out}/${info.id}.png`});results.push({...info,timing,requestsDuringMovement:requests-before});console.log(info.id,JSON.stringify(timing));
  await writeFile(`${out}/report.json`,JSON.stringify({complete:false,scope:'Public destination arrival views and 3-second normal-RAF throttle input; not sustained performance acceptance',results,errors},null,2));
 }
 await writeFile(`${out}/report.json`,JSON.stringify({complete:true,scope:'Arrival fixtures and 3-second normal-RAF movement; not sustained performance acceptance',results,errors},null,2));
}finally{await browser.close();}

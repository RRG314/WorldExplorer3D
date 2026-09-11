import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4195';
const lat = Number(process.env.WE3D_SKYLINE_LAT || 39.2903);
const lon = Number(process.env.WE3D_SKYLINE_LON || -76.6112);
const out = process.env.WE3D_VERIFY_OUTPUT || 'output/verification/building-skyline';
await mkdir(out, {recursive:true});
const server = await chromium.launchServer({headless:true,channel:'chrome'});
const timer = setTimeout(()=>{server.process().kill('SIGTERM');},150000);
const browser = await chromium.connect(server.wsEndpoint());
try {
 const context = await browser.newContext({viewport:{width:1280,height:850}});
 await context.route(/google-analytics\.com\/.*collect/,r=>r.fulfill({status:204,body:''}));
 const page = await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/app/`,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:45000});
 await page.locator('#globeCustomLat').fill(String(lat));
 await page.locator('#globeCustomLon').fill(String(lon));
 await page.locator('#globeCustomLon').press('Enter');
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:90000});
 const result = await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  ctx.setTimeOfDay?.('day');
  const camera=ctx.camera.clone();
  camera.position.set(0,200,400);camera.lookAt(0,60,-400);camera.updateMatrixWorld(true);
  ctx.renderer.render(ctx.scene,camera);
  return {image:ctx.renderer.domElement.toDataURL('image/png'),buildingDetail:ctx.worldDetailState?.buildings,biome:ctx.worldSurfaceProfile?.biome,biomeEvidence:ctx.worldSurfaceProfile?.biomeEvidence,records:ctx.buildingProvenanceRecords.map(p=>({identity:p.identity,foundation:p.foundation,fields:{heightMeters:p.fields.heightMeters,minHeightMeters:p.fields.minHeightMeters}})),errors:globalThis.getWorldExplorerRuntimeDiagnostics?.().errors};
 });
 await writeFile(`${out}/skyline.png`,Buffer.from(result.image.split(',')[1],'base64'));
 delete result.image;
 for (const [direction,yaw] of [['north',Math.PI/2],['east',0],['south',-Math.PI/2],['west',Math.PI]]) {
  await page.evaluate(async(yaw)=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTravelMode('plane');Object.assign(ctx.planeMode,{x:0,y:180,z:0,yaw,speed:2,throttle:0});},yaw);
  await page.waitForTimeout(400);
  await page.screenshot({path:`${out}/flight-${direction}.png`});
 }
 await writeFile(`${out}/report.json`,JSON.stringify({lat,lon,errors,...result},null,2));
 console.log(JSON.stringify({out,records:result.records?.length,errors}));
} finally {await Promise.race([server.close(),new Promise(r=>setTimeout(r,6000))]);if(server.process().exitCode===null)server.process().kill('SIGTERM');clearTimeout(timer);}

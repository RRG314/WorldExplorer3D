import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const baselineCommit=process.argv[2] || 'a64f92b2';
const out='output/architecture-consolidation/2026-10-13/water-mask-implemented-profile';
await fs.mkdir(out,{recursive:true});
const baseline=execFileSync('git',['show',`${baselineCommit}:app/js/terrain/far-field-water.js`],{encoding:'utf8'});
const candidate=await fs.readFile('app/js/terrain/far-field-water.js','utf8');
assert.notEqual(baseline,candidate);
const server=await startStaticServer({rootDir:process.cwd(),ports:[4597,4598]});
let owned;const errors=[];
try {
 owned=await chromium.launchServer({channel:'chrome',headless:false});
 const browser=await chromium.connect(owned.wsEndpoint()),page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app/js/terrain/far-field-water.js?readback=*',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().endsWith('candidate')?candidate:baseline}));
 await page.route('**/__water-profile',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Water ownership readback comparison</title><h1>Water ownership readback comparison</h1><p>Actual 4096² mask builder; matched polygon inputs. White = terrain, black = water.</p><canvas id="mask" width="512" height="512"></canvas><pre id="results"></pre><script src="/app/vendor/three/build/three.min.js"></script>'}));
 await page.goto(`http://127.0.0.1:${server.port}/__water-profile`);
 const result=await page.evaluate(async()=>{
  const modules={baseline:await import('/app/js/terrain/far-field-water.js?readback=baseline'),candidate:await import('/app/js/terrain/far-field-water.js?readback=candidate')};
  const times=[],images={};let frame=0,frameTimes=[],previous=performance.now();const tick=at=>{frameTimes.push({at,ms:at-previous});previous=at;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);let tasks=[];const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({type:'longtask'});
  // Shoreline, islands, fine curved tributaries and many disconnected ponds.
  const ring=(x,y,r,n=32)=>Array.from({length:n+1},(_,i)=>[x+Math.cos(i/n*Math.PI*2)*r,y+Math.sin(i/n*Math.PI*2)*r]);
  const waterAreas=[{identity:'coast',surfaceMeters:0,outer:[[-100,-100],[100,-100],[100,20],[60,25],[30,-5],[-10,60],[-100,80],[-100,-100]],holes:[ring(0,0,12),ring(-45,-25,8)]},...Array.from({length:150},(_,i)=>({identity:'pond'+i,surfaceMeters:5,outer:ring((i*17)%190-95,(i*31)%190-95,1+i%4)}))];
  const app={geoToWorld:(lat,lon)=>({x:lon,z:lat})},spec={outer:{minX:-100,maxX:100,minZ:-100,maxZ:100},inner:{minX:-20,maxX:20,minZ:-20,maxZ:20}};
  const original=CanvasRenderingContext2D.prototype.getImageData;
  const originalBitmap=window.createImageBitmap;
  window.createImageBitmap=(...args)=>{const start=performance.now();const result=originalBitmap(...args);window.bitmapCallMs=performance.now()-start;return result;};
  let reads=[];
  CanvasRenderingContext2D.prototype.getImageData=function(...args){const start=performance.now();const result=original.apply(this,args);reads.push(performance.now()-start);return result;};
  try {
   for(const name of ['baseline','candidate','candidate','baseline','baseline','candidate']) {
    await new Promise(requestAnimationFrame);reads=[];window.bitmapCallMs=null;const start=performance.now();
    const built=await modules[name].buildMappedWaterTerrainOwnershipMask(app,{waterAreas},spec,new Set(waterAreas.map(a=>a.identity)));
    await new Promise(resolve=>setTimeout(resolve,40));times.push({name,bitmapCallMs:window.bitmapCallMs,maximumFrameMs:Math.max(...frameTimes.filter(t=>t.at>=start).map(t=>t.ms)),longTasks:tasks.filter(t=>t.start+t.duration>=start),totalMs:performance.now()-start,readbackMs:reads.reduce((a,b)=>a+b,0),maximumReadbackMs:Math.max(...reads),reads:reads.length});
    images[name]=built.texture.image.data.slice();built.texture.dispose();
    await new Promise(requestAnimationFrame);
   }
  } finally {CanvasRenderingContext2D.prototype.getImageData=original;window.createImageBitmap=originalBitmap;}
  let different=0,maxDelta=0,thresholdDifferences=0;
  for(let i=0;i<images.baseline.length;i++){const a=images.baseline[i],b=images.candidate[i];if(a!==b){different++;maxDelta=Math.max(maxDelta,Math.abs(a-b));if((a>=128)!==(b>=128))thresholdDifferences++;}}
  const canvas=document.querySelector('#mask'),ctx=canvas.getContext('2d'),preview=ctx.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const value=images.candidate[(y*8)*4096+x*8],offset=(y*512+x)*4;preview.data.set([value,value,value,255],offset);}
  ctx.putImageData(preview,0,0);
  const report={times,parity:{bytes:images.baseline.length,different,maxDelta,thresholdDifferences}};
  cancelAnimationFrame(frame);observer.disconnect();document.querySelector('#results').textContent=JSON.stringify(report,null,2);return report;
 });
 await page.screenshot({path:out+'/water-mask.png',fullPage:true});
 await fs.writeFile(out+'/report.json',JSON.stringify({scope:'Matched native Chrome mask construction only; not full-world frame acceptance',baselineCommit,...result,pageErrors:errors},null,2));
 console.log(JSON.stringify(result));assert.deepEqual(errors,[]);assert.equal(result.parity.different,0,'Mask pixels must remain identical');
} finally {if(owned)await closeOwnedBrowser(owned);await server.close();}

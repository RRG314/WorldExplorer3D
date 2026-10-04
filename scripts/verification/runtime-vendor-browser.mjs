import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const output=process.env.WE3D_VENDOR_OUTPUT || 'output/verification/runtime-vendor';
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4506]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[],externalRenderer=[];
try {
 const page=await browser.newPage({viewport:{width:1000,height:700}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(/https:\/\/(?:cdn\.jsdelivr\.net\/npm\/three@|cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/)/,route=>{externalRenderer.push(route.request().url());return route.abort();});
 await page.goto(`http://127.0.0.1:${server.port}/404.html`);
 await page.setContent('<!doctype html><meta charset="utf-8"><title>Local renderer verification</title><body style="margin:0;background:#102b36;color:white;font:16px sans-serif"><p style="margin:24px">Local renderer · capture controls · CDN blocked</p><div id="viewer" style="width:1000px;height:620px"></div></body>');
 results.push(await page.evaluate(async()=>{
  const {vendorScriptsCritical,vendorScriptsOptional}=await import('/app/js/modules/manifest.js');
  const {loadScriptList,loadClassicScript}=await import('/app/js/modules/script-loader.js?v=56');
  await loadScriptList(vendorScriptsCritical);
  await loadScriptList(vendorScriptsOptional);
  const original=THREE;
  await loadClassicScript(new URL(vendorScriptsCritical[0],location.href).href);
  const {createCaptureViewer}=await import('/app/js/reality-capture/result-viewer.js');
  const model=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial({color:0x27bb9b}));
  const control=new AbortController();
  window.fixture={viewer:await createCaptureViewer(document.getElementById('viewer'),null,control.signal,{model}),control};
  return {id:'cold-cdn-blocked',sameRenderer:THREE===original,revision:THREE.REVISION,localScripts:[...document.scripts].map(s=>new URL(s.src).pathname),controls:!!THREE.OrbitControls,loaders:!!THREE.GLTFLoader&&!!THREE.RGBELoader&&!!THREE.DRACOLoader,effects:!!THREE.EffectComposer&&!!THREE.UnrealBloomPass};
 }));
 await page.waitForTimeout(350);
 await page.screenshot({path:`${output}/capture.png`});
 assert.equal(results[0].revision,'128');assert.ok(results[0].sameRenderer&&results[0].controls&&results[0].loaders&&results[0].effects);
 assert.equal(new Set(results[0].localScripts).size,results[0].localScripts.length);
 assert.ok(results[0].localScripts.every(url=>url.startsWith('/app/vendor/three/')));
 assert.equal(results[0].localScripts.length,17);
 await page.evaluate(()=>{window.fixture.control.abort();window.fixture.viewer?.dispose?.();});
 // A missing local dependency must reject visibly and remain retryable.
 const retry=await browser.newPage();await retry.goto(`http://127.0.0.1:${server.port}/404.html`);
 await retry.route('**/app/vendor/three/build/three.min.js',route=>route.abort());
 assert.equal(await retry.evaluate(async()=>{const{loadClassicScript}=await import('/app/js/modules/script-loader.js');try{await loadClassicScript('/app/vendor/three/build/three.min.js');return false;}catch{return document.scripts.length===0;}}),true);
 await retry.unroute('**/app/vendor/three/build/three.min.js');
 assert.equal(await retry.evaluate(async()=>{const{loadClassicScript}=await import('/app/js/modules/script-loader.js');await loadClassicScript('/app/vendor/three/build/three.min.js');return THREE.REVISION;}),'128');
 results.push({id:'missing-file-error-and-retry',ok:true});
 assert.deepEqual(externalRenderer,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/report.json`,JSON.stringify({ok:true,evidenceScope:'Actual cold browser local renderer/extensions/capture; renderer CDN blocked; source component, not assembled world or offline Firebase certification.',results,errors,externalRenderer},null,2));
 console.log(JSON.stringify({ok:true,results:results.map(({id})=>id)}));
} catch(error) {await fs.writeFile(`${output}/failure.json`,JSON.stringify({ok:false,results,errors,externalRenderer,failure:error.message},null,2));throw error;}
finally {await browser.close();await server.close();}

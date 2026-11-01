import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const out=path.resolve(process.env.WE3D_STEREO_OUTPUT||'output/research/vr-portal-product-2026-10-25/phone-stereo-first');await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4575],handleRequest:async(req,res,url)=>{
  if(url.pathname!=='/__vr-component/')return false;
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="icon" href="/favicon.svg"><style>html,body{margin:0;background:#000}canvas{display:block}</style></head><body><script src="/app/vendor/three/build/three.min.js"></script></body></html>');return true;
}});
let owned;
const report={passed:false,scope:'Real WebGL using shipped Three r128 and physical stereo adapter in a controlled scene. Not a game-world, headset or phone optics/comfort qualification.',pageErrors:[],consoleErrors:[]};
try{
  owned=await chromium.launchServer({headless:true,channel:'chrome',args:['--js-flags=--max-old-space-size=1536']});const browser=await chromium.connect(owned.wsEndpoint());
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.port}/__vr-component/`);
  report.result=await page.evaluate(async()=>{
    const {createPhoneStereo}=await import('/app/js/vr/phone-stereo.js');
    const {getLifecycleRegistrySnapshot}=await import('/app/js/runtime/lifecycle-scope.js?v=2');
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(2);renderer.setSize(1280,720);renderer.outputEncoding=THREE.sRGBEncoding;document.body.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#09233b');
    const geometry=new THREE.BoxGeometry(.22,.22,.22),materials=[new THREE.MeshBasicMaterial({color:0xff2222}),new THREE.MeshBasicMaterial({color:0x22ff22}),new THREE.MeshBasicMaterial({color:0x2266ff})];
    for(let i=0;i<3;i++){const box=new THREE.Mesh(geometry,materials[i]);box.position.set((i-1)*.6,1.5,-2-(i===1?0:1));scene.add(box);}
    const camera=new THREE.PerspectiveCamera(60,1280/720,.027,100);camera.position.set(0,1.5,0);renderer.render(scene,camera);
    const baseline={geometry:renderer.info.memory.geometries,textures:renderer.info.memory.textures,resources:getLifecycleRegistrySnapshot().resourceCount};
    const optics={screenWidth:.12,screenHeight:.0675,lensDistance:.04,lensSeparation:.064,lensY:.03375,fov:[45,45,45,45],distortion:[.34,.55]};
    const stereo=createPhoneStereo({THREE,renderer,optics,worldUnitsPerMeter:1/1.11});
    const viewport=renderer.getViewport(new THREE.Vector4()).toArray(),scissor=renderer.getScissor(new THREE.Vector4()).toArray(),autoClear=renderer.autoClear;
    stereo.render(scene,camera);
    const pixels=new Uint8Array(2560*1440*4),gl=renderer.getContext();gl.readPixels(0,0,2560,1440,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const counts=[0,0];for(let y=0;y<1440;y++)for(let x=0;x<2560;x++){const at=(y*2560+x)*4;if(pixels[at+1]>150&&pixels[at]<130&&pixels[at+2]<130)counts[x<1280?0:1]++;}
    const result={revision:THREE.REVISION,baseline,render:stereo.snapshot(),greenPixelsByEye:counts,
      viewportRestored:JSON.stringify(viewport)===JSON.stringify(renderer.getViewport(new THREE.Vector4()).toArray()),
      scissorRestored:JSON.stringify(scissor)===JSON.stringify(renderer.getScissor(new THREE.Vector4()).toArray()),autoClearRestored:autoClear===renderer.autoClear,glError:gl.getError()};
    window.stereoFixture={THREE,renderer,scene,camera,stereo,geometry,materials};return result;
  });
  assert.equal(report.result.revision,'128');assert.ok(report.result.greenPixelsByEye.every(count=>count>100));assert.ok(report.result.viewportRestored&&report.result.scissorRestored&&report.result.autoClearRestored);assert.equal(report.result.glError,0);
  await page.screenshot({path:path.join(out,'stereo-dpr2.png')});
  report.cleanup=await page.evaluate(async()=>{
    const {renderer,scene,camera,stereo}=window.stereoFixture;
    const before=renderer.getViewport(new THREE.Vector4()).toArray();scene.children[0].onBeforeRender=()=>{throw Error('controlled render interruption');};let failure='';try{stereo.render(scene,camera);}catch(error){failure=error.message;}
    scene.children[0].onBeforeRender=()=>{};const restored=renderer.getRenderTarget()===null&&JSON.stringify(before)===JSON.stringify(renderer.getViewport(new THREE.Vector4()).toArray());
    stereo.dispose();stereo.dispose();renderer.render(scene,camera);
    const {getLifecycleRegistrySnapshot}=await import('/app/js/runtime/lifecycle-scope.js?v=2');
    return {failure,restored,geometry:renderer.info.memory.geometries,textures:renderer.info.memory.textures,resources:getLifecycleRegistrySnapshot().resourceCount};
  });
  assert.equal(report.cleanup.failure,'controlled render interruption');assert.equal(report.cleanup.restored,true);assert.equal(report.cleanup.geometry,report.result.baseline.geometry);assert.equal(report.cleanup.textures,report.result.baseline.textures);
  assert.equal(report.cleanup.resources,report.result.baseline.resources);
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{if(owned)await closeOwnedBrowser(owned);await server.close();report.ownedBrowserClosed=true;await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));

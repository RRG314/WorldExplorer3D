import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const out=path.resolve(process.env.WE3D_TRACKED_VR_OUTPUT||'output/research/vr-portal-product-2026-10-25/tracked-webgl-first');await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4578],handleRequest:async(req,res,url)=>{
  if(url.pathname!=='/__tracked-vr/')return false;res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="icon" href="/favicon.svg"><style>html,body{margin:0;background:#000}img{width:100%;display:block}canvas{display:none}</style></head><body><script src="/app/vendor/three/build/three.min.js"></script></body></html>');return true;
}});
let owned,page;const report={passed:false,scope:'Real shipped Three r128 WebGL, ArrayCamera, gaze resources and existing kernel/frame owner with a controlled XR compositor boundary. Not actual headset/runtime, hardware comfort or device performance acceptance.',pageErrors:[],consoleErrors:[]};
try{
  owned=await chromium.launchServer({headless:true,channel:'chrome',args:['--js-flags=--max-old-space-size=1536']});const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2});
  page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});await page.goto(`http://127.0.0.1:${server.port}/__tracked-vr/`);
  report.result=await page.evaluate(async()=>{
    const {createTrackedVrSession}=await import('/app/js/vr/xr-session.js'),{installControlledXrRuntime}=await import('/scripts/verification/xr-runtime-fixture.js');
    const {createRuntimeKernel}=await import('/app/js/runtime/kernel.js'),{createRuntimeFrameSource}=await import('/app/js/runtime/frame-source.js'),{getLifecycleRegistrySnapshot}=await import('/app/js/runtime/lifecycle-scope.js?v=2');
    const units=1/1.11,renderer=new THREE.WebGLRenderer({antialias:false});renderer.setPixelRatio(2);renderer.setSize(1280,720);renderer.outputEncoding=THREE.sRGBEncoding;document.body.append(renderer.domElement);renderer.domElement.style.display='none';
    const scene=new THREE.Scene();scene.background=new THREE.Color('#09233b');const geometry=new THREE.BoxGeometry(.3,.3,.3),material=new THREE.MeshBasicMaterial({color:0x22ff22}),box=new THREE.Mesh(geometry,material);box.position.set(.35,-.03,2);scene.add(box);
    const camera=new THREE.PerspectiveCamera(60,1280/720,.05,100);camera.position.set(.35,-.03,-.05);camera.lookAt(.35,-.03,2);renderer.render(scene,camera);
    const baseline={geometry:renderer.info.memory.geometries,textures:renderer.info.memory.textures,resources:getLifecycleRegistrySnapshot().resourceCount};
    const reasons=new Set(),ctx={gameStarted:true,renderer,scene,camera,WORLD_UNITS_PER_METER:units,carMesh:new THREE.Object3D(),car:{x:0,y:0,z:0,angle:0},setPauseReason:(key,value)=>value?reasons.add(key):reasons.delete(key),hasPauseReason:key=>reasons.has(key),clearControlInputState(){},screenLayout:{setPanelLayer(){}}};Object.defineProperty(ctx,'paused',{get:()=>reasons.size>0});
    const kernel=createRuntimeKernel({isSimulationPaused:()=>ctx.paused}),source=createRuntimeFrameSource(kernel),fixture=installControlledXrRuntime({THREE,renderer,cant:.2});
    kernel.registerSystem({id:'input',phase:'input',update:frame=>ctx.vrPresentation?.beforeInput(frame)});kernel.registerSystem({id:'camera',phase:'camera',update:frame=>ctx.vrPresentation?.updateCamera(frame)});kernel.registerSystem({id:'render',phase:'render',update:()=>ctx.vrPresentation?.render()});
    ctx.acquireRuntimeFrameSource=options=>source.acquire(options);ctx.getRuntimeKernelSnapshot=()=>kernel.snapshot();ctx.renderLoop=()=>source.start();source.start();
    const session=createTrackedVrSession({ctx,THREE,captureSession:()=>({signal:new AbortController().signal,isCurrent:()=>true})});await session.start();fixture.step(0);const capture=fixture.capture();
    const preview=document.createElement('img');preview.alt='Controlled tracked VR eye framebuffer';preview.src=capture.image;document.body.append(preview);await preview.decode();
    window.xrFixture={renderer,scene,camera,kernel,source,session,fixture,preview,baseline};
    return {baseline,counts:capture.counts,glError:capture.glError,snapshot:session.snapshot(),frameOwner:source.snapshot(),kernel:kernel.snapshot()};
  });
  assert.ok(report.result.counts.every(count=>count>100));assert.equal(report.result.glError,0);assert.equal(report.result.frameOwner.owner,'webxr-vr');assert.equal(report.result.kernel.running,false);assert.ok(Math.abs(report.result.snapshot.eyeSeparationWorld-.064/1.11)<1e-8);
  await page.screenshot({path:path.join(out,'canted-eyes-dpr2.png')});
  report.interaction=await page.evaluate(async()=>{
    const {session,fixture,preview}=window.xrFixture;
    function look(x){return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(x,-.34,-1.5).normalize()).toArray();}
    for(let time=20;time<=1220;time+=20)fixture.step(time,{quaternion:look(-.43)});
    const startSnapshot=session.snapshot(),started=!startSnapshot.userPaused;fixture.step(1240);preview.src=fixture.capture().image;
    fixture.select({quaternion:look(.43)});await Promise.resolve();const selectedExit=!session.active;await session.stop('verification-exit');
    const {renderer,scene,camera,source,baseline}=window.xrFixture;await fixture.dispose();renderer.render(scene,camera);
    const {getLifecycleRegistrySnapshot}=await import('/app/js/runtime/lifecycle-scope.js?v=2');const result={started,selectedExit,startSnapshot,active:session.active,flat:source.snapshot(),geometry:renderer.info.memory.geometries,textures:renderer.info.memory.textures,resources:getLifecycleRegistrySnapshot().resourceCount,baseline,glError:renderer.getContext().getError()};source.dispose();return result;
  });
  assert.equal(report.interaction.started,true);assert.equal(report.interaction.selectedExit,true);assert.equal(report.interaction.active,false);assert.equal(report.interaction.flat.active,false);assert.equal(report.interaction.glError,0);
  assert.equal(report.interaction.geometry,report.interaction.baseline.geometry);assert.equal(report.interaction.textures,report.interaction.baseline.textures);assert.equal(report.interaction.resources,report.interaction.baseline.resources);
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failed.png')}).catch(()=>{});}
finally{if(owned)await closeOwnedBrowser(owned);await server.close();report.ownedBrowserClosed=true;await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));

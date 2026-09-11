// Visual evidence, not a visual-quality assertion. Uses actual loaded transport
// models and moves the test player to their portals; never changes world geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const root=process.cwd(), out=path.join(root,'output/verification/transport-portal-visual');
await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:path.resolve(process.env.WE3D_VERIFY_ROOT||'dist'),ports:[4496]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const report={source:'actual-loaded-monaco-transport',visualAcceptance:'requires-screenshot-review',errors:[],frames:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
try{
  await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=43.7384&lon=7.4246&lname=Monaco&launch=earth&gm=free&mode=driving`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:30000});
  const consent=page.locator('#analyticsConsentDenyBtn');if(await consent.isVisible())await consent.click();
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await page.waitForFunction(()=>{const d=window.getWorldExplorerRuntimeDiagnostics?.();return d?.gameStarted&&!d.worldLoading&&d.worldCounts.roads>0;},null,{timeout:100000});
  const inventory=await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    ctx.setTimeOfDay?.('day');ctx.setTravelMode('drive');
    // Regional fallback roads extend well beyond active terrain. Their array
    // order depends on tile completion; never teleport to the first tile's road.
    const distance=r=>Math.min(...r.pts.map(p=>Math.hypot(p.x-ctx.car.x,p.z-ctx.car.z)));
    const roads=ctx.roads.filter(r=>r.tunnelSystemModel?.portalDistances?.length&&distance(r)<2200)
      .sort((a,b)=>distance(a)-distance(b)||String(a.sourceFeatureId).localeCompare(String(b.sourceFeatureId)));
    window.portalVisualRoads=roads;
    return {targets:roads.map((r,index)=>({index,id:r.sourceFeatureId,name:r.name,portals:r.tunnelSystemModel.portalDistances,points:r.pts.length,arrivalDistance:distance(r)})).slice(0,3),
      nearbyTunnels:ctx.roads.filter(r=>r.structureSemantics?.isTunnel&&distance(r)<3000).sort((a,b)=>distance(a)-distance(b)).slice(0,15).map(r=>({id:r.sourceFeatureId,name:r.name,distance:distance(r),model:r.tunnelSystemModel?.visualKind,portals:r.tunnelSystemModel?.portalDistances,ranges:r.tunnelSystemModel?.shellRanges,routeState:r.transportRecord?.routeState})),
      actor:{x:ctx.car.x,z:ctx.car.z}};
  });
  report.inventory=inventory;const targets=inventory.targets;
  assert.ok(targets.length,'No real tunnel portals loaded; cannot produce entrance evidence.');
  report.targets=targets;
  for(const target of targets){
    const placement=await page.evaluate(async target=>{
      const {ctx}=await import('/app/js/shared-context.js?v=55');
      const r=window.portalVisualRoads[target.index];
      const distance=Math.max(0,target.portals[0]-8);
      let left=distance,point;
      for(let i=0;i<r.pts.length-1;i++){
        const a=r.pts[i],b=r.pts[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);
        if(length===0)continue;
        if(left<=length||i===r.pts.length-2){const t=Math.min(1,left/length);point={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,angle:Math.atan2(b.x-a.x,b.z-a.z)};break;}left-=length;
      }
      const y=ctx.sampleFeatureSurfaceY(r,point.x,point.z);
      Object.assign(ctx.car,{...point,y:y+1.2,vy:0,road:r,onRoad:true,isAirborne:false,_lastSurfaceY:y,_lastRawSurfaceY:y,_roadContinuityTimer:.7,speed:0,vFwd:0,vLat:0});
      ctx.invalidateRoadCache();ctx.carMesh.position.set(point.x,y+1.2,point.z);ctx.camMode=0;
      // This inspection teleports kilometres between samples; discard the old
      // camera/look interpolation rather than photographing its travel path.
      ctx.camera.position.set(point.x-Math.sin(point.angle)*5,y+3,point.z-Math.cos(point.angle)*5);
      ctx.camera.userData.lookTarget={x:point.x,y:y+.5,z:point.z};
      return {...point,y,portalDistance:target.portals[0],sampleDistance:distance};
    },target);
    await page.waitForTimeout(1200);
    const filename=`portal-${target.index}.png`;
    await page.screenshot({path:path.join(out,filename)});
    const state=await page.evaluate(async()=>{
      const {ctx}=await import('/app/js/shared-context.js?v=55');
      const d=window.getWorldExplorerRuntimeDiagnostics();
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),ctx.camera);
      const hits=ray.intersectObjects(ctx.scene.children,true).filter(h=>h.object.visible).slice(0,5).map(h=>({distance:h.distance,point:h.point.toArray(),name:h.object.name,type:h.object.userData.structureVisualType,terrain:h.object.userData.isTerrainMesh,keys:Object.keys(h.object.userData)}));
      return {surfaceChain:d.surfaceChain,errors:d.runtimeErrors,provider:d.worldLoad?.transportProviderDecision,camera:{position:ctx.camera.position.toArray(),look:ctx.camera.userData.lookTarget,mode:ctx.camera.userData.vehicleClearanceMode},centerRay:hits};
    });
    report.frames.push({target,placement,filename,...state});
  }
  assert.deepEqual(report.errors,[]);
  report.evidenceCaptured=true;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify({evidenceCaptured:report.evidenceCaptured,targets:report.targets,failure:report.failure}));

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4398';
const dir = path.resolve('output/verification/product-plan/space-navigation');
await fs.mkdir(dir, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
const cases=[];
try {
  await page.goto(`${base}/app/?launch=space`, {waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
  await page.evaluate(()=>{document.getElementById('spaceLaunchToggle').click();document.getElementById('startBtn').click();});
  await page.waitForFunction(()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').modes?.space===true&&!document.getElementById('loading')?.classList.contains('show'),null,{timeout:180000});
  await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    cancelAnimationFrame(ctx.spaceFlight.animationId);ctx.spaceFlight.animationId=null;
    // Boundary scenarios deliberately freeze the real scene; they do not impersonate flown journeys.
    ctx.clearRenderedSpaceJourney?.();ctx.spaceFlight.mode='flying';
    ctx.getExpeditionPodDockingTarget=()=>null;ctx.getSolisReachDockTarget=()=>null;ctx.getUniverseHudTarget=()=>null;
    ctx.updateSpaceTravelSession({destination:{id:'moon',kind:'body',name:'Moon'},guidance:'manual'});
    ctx.spaceFlight._manualLandingTarget='Moon';ctx.spaceFlight.destination='moon';
    document.getElementById('spaceFlightHUD').classList.remove('collapsed');
  });
  async function scenario(kind) {
    return page.evaluate(async(kind)=>{
      const {ctx}=await import('/app/js/shared-context.js?v=55');
      const {updateSpaceFlightHUD}=await import('/app/js/space/ui.js?v=52');
      const {findLandableBodyByName,attemptLanding}=await import('/app/js/space/runtime.js?v=34');
      const {createBodyEphemerisState,createSpacecraftState}=await import('/app/js/space/spacecraft-authority.js?v=4');
      const moon=findLandableBodyByName('Moon');
      ctx.spaceFlight.rocket.position.copy(moon.position).add(new THREE.Vector3(moon.radius+10,0,0));
      ctx.spaceFlight.velocity.set(0,0,0);ctx.spaceFlight.speed=0;
      const body=createBodyEphemerisState('moon',{epochMs:0,positionM:{x:0,y:0,z:0},velocityMps:{x:0,y:0,z:0}});
      const altitude=kind==='far'?15227000:20000;
      ctx.spacecraftState=createSpacecraftState({epochMs:0,targetBodyId:'moon',positionM:{x:body.radiusM+altitude,y:0,z:0},velocityMps:{x:0,y:kind==='fast'?121:0,z:0}});
      ctx.spaceJourneyEphemeris={destination:body};ctx.spaceJourney={phase:'approach'};
      ctx.spaceFlight.presentationAuthority=kind==='classic'?'classic':'si';
      if(kind==='missing')ctx.spaceJourneyEphemeris=null;
      updateSpaceFlightHUD(findLandableBodyByName);
      const get=id=>document.getElementById(id)?.textContent;
      const result={destination:get('sfDestination'),altitude:get('sfAltitude'),unit:get('sfAltitudeUnit'),speedUnit:get('sfSpeedUnit'),landing:get('sfLandingText'),disabled:document.getElementById('sfLandBtn').disabled};
      if(kind==='far'||kind==='fast'||kind==='missing') {
        let requested='';ctx.requestRenderedJourneyLanding=target=>{requested=target;return {accepted:false,reason:'verification-denial'};};
        result.accepted=attemptLanding();result.requested=requested;
      }
      return result;
    },kind);
  }
  const far=await scenario('far');assert.equal(far.disabled,true);assert.equal(far.unit,'km');assert.match(far.landing,/25 km/);assert.equal(far.accepted,false);cases.push({id:'far-physical-approach-is-not-ready',passed:true,readout:far});
  await page.screenshot({path:path.join(dir,'far-physical.png')});
  const fast=await scenario('fast');assert.equal(fast.disabled,true);assert.match(fast.landing,/120 m\/s/);cases.push({id:'speed-limit-explained',passed:true});
  const ready=await scenario('ready');assert.equal(ready.disabled,false);assert.match(ready.landing,/Landing corridor ready/);cases.push({id:'qualified-physical-corridor',passed:true});
  const classic=await scenario('classic');assert.equal(classic.unit,'display u');assert.equal(classic.speedUnit,'display u/s');assert.match(classic.landing,/Compressed approach/);cases.push({id:'compressed-units-with-stale-si-state',passed:true});
  await page.screenshot({path:path.join(dir,'compressed.png')});
  const missing=await scenario('missing');assert.equal(missing.disabled,true);cases.push({id:'missing-physical-navigation-fails-closed',passed:true});
  await page.setViewportSize({width:390,height:844});await scenario('far');await page.waitForTimeout(350);await page.screenshot({path:path.join(dir,'phone.png')});
  const fits=await page.locator('#spaceFlightHUD').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});assert.equal(fits,true);
  assert.equal(await page.locator('#spaceFlightHUD').evaluate(el=>Number(getComputedStyle(el).zIndex)>10001),true);
  assert.equal(await page.locator('#sfLandingBar').evaluate(el=>el.getBoundingClientRect().width),0);
  cases.push({id:'phone-flight-panel-fits',passed:true});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(dir,'browser.json'),JSON.stringify({passed:true,cases,errors},null,2));console.log(JSON.stringify({passed:true,cases,errors}));
} finally {await browser.close();}

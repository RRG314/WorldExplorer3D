import assert from 'node:assert/strict';
import path from 'node:path';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
export async function verifyPhoneRoadRide(page,out){
  const fields={screenWidth:120,screenHeight:55.5,lensDistance:40,lensSeparation:64,lensY:27.7,eyeSeparation:64,fov0:45,fov1:45,fov2:45,fov3:45,k1:.34,k2:.55};
  await page.locator('#vrCalibration summary').click();for(const [name,value] of Object.entries(fields))await page.locator(`#vrCalibration [name="${name}"]`).fill(String(value));await page.locator('#vrCalibration [name="confirmed"]').check();
  assert.equal(await page.locator('#vrCalibration').evaluate(form=>form.checkValidity()),true);await page.locator('#vrStartPhone').click();await page.waitForFunction(()=>rideQa.getVrSnapshot().kind==='phone'&&rideQa.getVrSnapshot().started);
  async function aim(x=0,y=0,z=-1){await page.evaluate(({x,y,z})=>{
    const T=window.THREE,angle=Number(screen.orientation?.angle??window.orientation)||0,base=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-angle*Math.PI/180);
    const desired=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(x,y,z).normalize());
    const q=base.multiply(desired).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle*Math.PI/180)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2)),e=new T.Euler().setFromQuaternion(q,'YXZ');
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:e.y*180/Math.PI,beta:e.x*180/Math.PI,gamma:-e.z*180/Math.PI}));
  },{x,y,z});}
  const dwell=async x=>{for(let i=0;i<14;i++){await aim(x,-.34,-1.5);await page.waitForTimeout(100);}};
  await aim();await page.waitForFunction(()=>rideQa.getVrSnapshot().tracking);const initial=await page.evaluate(()=>({x:rideQa.car.x,z:rideQa.car.z,ride:rideQa.getVrSnapshot().ride}));assert.equal(initial.ride.status,'ready');
  await dwell(-.43);for(let i=0;i<10;i++){await aim();await page.waitForTimeout(100);}
  await page.evaluate(()=>rideQa.renderer.domElement.setAttribute('data-ride-qa','true'));await runPrescribedGameActions(page,out,[{buttons:[],frames:2}],'canvas[data-ride-qa]');
  const moving=await page.evaluate(()=>({x:rideQa.car.x,z:rideQa.car.z,ride:rideQa.getVrSnapshot().ride}));assert.ok(Math.hypot(moving.x-initial.x,moving.z-initial.z)>.1);assert.ok(moving.ride.progress>0);await page.screenshot({path:path.join(out,'phone-guided-moving.png')});
  await page.waitForTimeout(1700);await page.waitForFunction(()=>rideQa.getVrSnapshot().tracking===false&&rideQa.hasPauseReason('vr-user'));
  const stopped=await page.evaluate(()=>({x:rideQa.car.x,z:rideQa.car.z}));await aim();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>rideQa.hasPauseReason('vr-user')),true);
  assert.deepEqual(await page.evaluate(()=>({x:rideQa.car.x,z:rideQa.car.z})),stopped);
  await dwell(-.43);assert.equal(await page.evaluate(()=>rideQa.hasPauseReason('vr-user')),false);
  await aim();await runPrescribedGameActions(page,out,[{buttons:['left'],frames:3},{buttons:[],frames:2}],'canvas[data-ride-qa]');
  assert.equal(await page.evaluate(()=>rideQa.getVrSnapshot().ride.status),'manual');await page.screenshot({path:path.join(out,'phone-manual-takeover.png')});
  await dwell(.43);assert.equal(await page.evaluate(()=>rideQa.getVrSnapshot().active),false);
  const cleanup=await page.evaluate(async()=>{await rideQaXr.dispose();const {getLifecycleRegistrySnapshot}=await import('/app/js/runtime/lifecycle-scope.js?v=2');return {owner:rideQa.getRuntimeFrameSourceSnapshot(),scopes:getLifecycleRegistrySnapshot().scopes.filter(row=>row.owner==='vr-road-ride'||row.owner==='vr-gaze-controls'||row.owner.startsWith('vr-phone-'))};});
  assert.equal(cleanup.owner.active,false);assert.deepEqual(cleanup.scopes,[]);await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'phone-portrait-return.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  return {initial,moving,stopped,cleanup};
}

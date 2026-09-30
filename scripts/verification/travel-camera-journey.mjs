import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function exerciseTravelCameras(page, contextKey, output, label) {
  const start=await page.evaluate(key=>globalThis[key].camMode,contextKey),states=[];
  for(let step=1;step<=3;step++){
    await page.keyboard.press('KeyC');
    const expected=(start+step)%3;
    await page.waitForFunction(({key,expected})=>globalThis[key].camMode===expected,{key:contextKey,expected},{timeout:5000});
    await page.waitForTimeout(1000);
    const state=await page.evaluate(key=>{
      const c=globalThis[key],actor=c.planeMode?.active?c.planeMode:c.car;
      return {cameraMode:c.camMode,actor:{x:actor.x,y:actor.y,z:actor.z},camera:c.camera.position.toArray(),quaternion:c.camera.quaternion.toArray(),planeVisible:c.planeMode?.mesh?.visible,carVisible:c.carMesh?.visible,glError:c.renderer.getContext().getError()};
    },contextKey);
    assert.equal(state.glError,0);assert.ok([...state.camera,...state.quaternion].every(Number.isFinite));
    states.push(state);
    await page.screenshot({path:path.join(output,`${label}-camera-${expected}.png`)});
  }
  await writeFile(path.join(output,`${label}-camera-journey.json`),JSON.stringify({scope:'Normal C-key switches while travel controls remain active; outside timed window',states},null,2));
}

export async function returnToDriving(page,contextKey,output,label){
  await page.locator('#travelBtn').click();await page.locator('#fDriving').click();await page.locator('#travelBtn').blur();
  await page.waitForFunction(key=>globalThis[key].activeTransportActor?.()?.mode==='drive',contextKey,{timeout:15000});
  await page.waitForTimeout(1500);
  const state=await page.evaluate(key=>{const c=globalThis[key];return {mode:c.activeTransportActor().mode,x:c.car.x,y:c.car.y,z:c.car.z,groundCenter:c.GroundHeight.carCenterY(c.car.x,c.car.z),planeActive:c.planeMode?.active,planeVisible:c.planeMode?.mesh?.visible,carVisible:c.carMesh?.visible,glError:c.renderer.getContext().getError()};},contextKey);
  assert.equal(state.planeActive,false);assert.equal(state.planeVisible,false);assert.equal(state.carVisible,true);assert.equal(state.glError,0);
  assert.ok(Number.isFinite(state.y)&&Math.abs(state.y-state.groundCenter)<2,'Driving did not return to ground contact');
  await page.screenshot({path:path.join(output,`${label}-return-driving.png`)});
  await writeFile(path.join(output,`${label}-return-driving.json`),JSON.stringify(state,null,2));
}

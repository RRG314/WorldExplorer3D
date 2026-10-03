import assert from 'node:assert/strict';
export async function verifyActivities(page,dir){
 const report={scope:'Actual loaded Earth; controlled completion positions/timers, not full competitive runs or remote leaderboard acceptance',cases:[]};
 await page.evaluate(()=>swimCtx.startGameplayPlugin('checkpoint'));
 assert.equal(await page.evaluate(()=>swimCtx.getCurrentTravelMode()),'drive');
 report.markersGrounded=await page.evaluate(()=>swimCtx.cpMeshes.every((m,i)=>Math.abs(m.position.y-swimCtx.checkpoints[i].y-.12)<.001));assert.equal(report.markersGrounded,true);
 report.checkpoints=await page.evaluate(()=>swimCtx.checkpoints.length);assert.ok(report.checkpoints>0);
 await page.evaluate(()=>{const c=swimCtx;for(const p of c.checkpoints){c.car.x=p.x;c.car.y=p.y+1.2;c.car.z=p.z;c.updateMode(.016)}});await page.waitForSelector('#resultScreen.show');await page.waitForFunction(()=>swimCtx.getGameResultSnapshot()?.status==='saved');await page.screenshot({path:`${dir}/checkpoint-result.png`});await page.locator('#freeBtn').click();
 assert.equal(await page.evaluate(()=>swimCtx.cpMeshes.length),0);report.cases.push('checkpoint result, Journal and Free Roam remove all checkpoint meshes');
 await page.evaluate(()=>swimCtx.startGameplayPlugin('painttown'));assert.equal(await page.evaluate(()=>swimCtx.paintTown.active),true);
 await page.evaluate(()=>{swimCtx.gameTimer=100000;swimCtx.updateMode(.016)});await page.waitForSelector('#resultScreen.show');await page.waitForFunction(()=>swimCtx.getGameResultSnapshot()?.status==='saved');await page.screenshot({path:`${dir}/paint-result.png`});await page.locator('#freeBtn').click();
 assert.equal(await page.evaluate(()=>swimCtx.paintTown.active),false);report.cases.push('paint timeout result and Free Roam release paint state');
 await page.evaluate(async()=>{await swimCtx.ensureFlowerChallengeReady();await swimCtx.startGameplayPlugin('flower')});
 assert.equal(await page.evaluate(()=>swimCtx.getFlowerChallengeBackendStatus().challengeActive),true);
 await page.evaluate(()=>{const c=swimCtx,m=c.scene.getObjectByName('redFlowerChallenge');if(!m)throw Error('Flower marker unavailable');c.setTravelMode('walk',{source:'flower_acceptance'});const p=m.getWorldPosition(new THREE.Vector3());Object.assign(c.Walk.state.walker,{x:p.x,y:p.y+1.7,z:p.z,vy:0});c.updateFlowerChallenge(.016)});
 await page.waitForSelector('#resultScreen.show');await page.waitForFunction(()=>swimCtx.getGameResultSnapshot()?.status==='saved');await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/flower-phone-result.png`});await page.locator('#againBtn').click();assert.equal(await page.evaluate(()=>swimCtx.getFlowerChallengeBackendStatus().challengeActive),true);
 await page.evaluate(()=>swimCtx.startGameplayPlugin('free'));assert.equal(await page.evaluate(()=>swimCtx.getFlowerChallengeBackendStatus().challengeActive),false);assert.equal(await page.evaluate(()=>!!swimCtx.scene.getObjectByName('redFlowerChallenge')),false);report.cases.push('flower result replays the flower and mode replacement removes its marker');
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{swimCtx.startGameplayPlugin('deflock');swimCtx.startGameplayPlugin('free')});await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>swimCtx.getDeFlockSnapshot?.()?.active===true),false);report.cases.push('replaced lazy DeFlock start cannot publish a late game');
 await page.evaluate(()=>{swimCtx.startGameplayPlugin('livegps');swimCtx.startGameplayPlugin('free')});await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>swimCtx.getLiveGpsSnapshot?.()?.active===true),false);report.cases.push('replaced lazy GPS start cannot publish a late game or watcher');
 report.registry=await page.evaluate(()=>swimCtx.getGameplayRegistrySnapshot());assert.equal(report.registry.activeId,'free');
 return report;
}

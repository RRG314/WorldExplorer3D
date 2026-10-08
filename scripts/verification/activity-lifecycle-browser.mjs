import assert from 'node:assert/strict';
export async function verifyActivities(page,dir){
 const report={scope:'Actual Baltimore activity UI and keyboard route; controlled pause/mode/save failure and result boundaries',cases:[]};
 const route=await page.evaluate(async()=>{window.activityRuntime=await import('/app/js/activity-discovery/runtime.js?v=9');return (await import('/app/js/activity-discovery/harbor-walk.js')).buildHarborWalk(swimCtx)});assert.ok(route);
 async function stageStart(){await page.evaluate(p=>{const c=swimCtx;c.setTravelMode('walk',{source:'activity_acceptance'});Object.assign(c.Walk.state.walker,{x:p.x,z:p.z,y:p.y+1.7,yaw:p.yaw,vy:0,_resolvedGroundState:null})},route.anchors[0]);}
 await stageStart();
 await page.evaluate(id=>{const c=swimCtx;window.activityOriginalRecord=c.recordExplorerEvent;window.activityReject=true;window.activityRecordCalls=[];c.recordExplorerEvent=async e=>{if(e.sourceSystem==='games-and-activities'){activityRecordCalls.push(e.eventId);if(activityReject)throw Error('Injected local Journal failure')}return activityOriginalRecord(e)};c.openActivityBrowser({activityId:id});},route.id);
 await page.locator('#activityDiscoveryPrimaryAction').click();await page.waitForFunction(()=>activityRuntime.getRuntimeSnapshot().active);
 report.started=await page.evaluate(()=>activityRuntime.getRuntimeSnapshot());
 await page.evaluate(p=>{swimCtx.setTravelMode('drive',{source:'activity_acceptance'});swimCtx.car.x=p.x;swimCtx.car.z=p.z;},route.anchors[1]);await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>activityRuntime.getRuntimeSnapshot().targetIndex),1);report.cases.push('wrong vehicle cannot capture walking checkpoint');
 await stageStart();await page.evaluate(()=>swimCtx.setPauseReason('manual_pause',true));
 const paused=await page.evaluate(()=>activityRuntime.getRuntimeSnapshot().elapsedMs);await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>activityRuntime.getRuntimeSnapshot().elapsedMs),paused);await page.evaluate(()=>swimCtx.setPauseReason('manual_pause',false));report.cases.push('pause excludes elapsed time and checkpoint progress');
 for(const target of route.anchors.slice(1)){
  await page.evaluate(p=>{const w=swimCtx.Walk.state.walker;w.yaw=Math.atan2(p.x-w.x,p.z-w.z);w.lookYawOffset=0},target);await page.keyboard.down('w');
  try{await page.waitForFunction(p=>Math.hypot(swimCtx.Walk.state.walker.x-p.x,swimCtx.Walk.state.walker.z-p.z)<9,target,{timeout:35000})}finally{await page.keyboard.up('w')}
 }
 await page.waitForFunction(id=>!activityRuntime.getRuntimeSnapshot().active&&activityRuntime.getCompletionStatus(id).status==='retry',route.id);
 assert.equal(await page.evaluate(id=>activityRuntime.getCompletionState(id),route.id),null);
 await page.evaluate(id=>swimCtx.openActivityBrowser({activityId:id}),route.id);await page.setViewportSize({width:390,height:844});await page.locator('#activityDiscoveryRetrySave').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/activity-phone-retry.png`});
 assert.match(await page.locator('.activityDiscoveryCompletionText').innerText(),/needs retry/);
 await page.evaluate(()=>window.activityReject=false);await page.locator('#activityDiscoveryRetrySave').click();await page.waitForFunction(id=>activityRuntime.getCompletionStatus(id).status==='saved',route.id);
 report.completion=await page.evaluate(id=>activityRuntime.getCompletionState(id),route.id);assert.equal(report.completion.count,1);report.cases.push('actual completion remains unsaved until retry accepted');
 report.journal=await page.evaluate(async id=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('world-explorer-discovery');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise((resolve,reject)=>{const r=db.transaction('events').objectStore('events').get(`event:activity-completed:${id}:1`);r.onsuccess=()=>resolve(r.result?{eventId:r.result.eventId,points:r.result.progress?.points}:null);r.onerror=()=>reject(r.error)})}finally{db.close()}},route.id);assert.ok(report.journal);assert.equal(report.journal.points,2);
 // Hold a focused action through two automatic catalog refreshes. Replacing
 // identical HTML used to detach the player's target and lose keyboard focus.
 const replay=page.locator('#activityDiscoveryReplayAction');
 await replay.scrollIntoViewIfNeeded();await replay.focus();
 await page.evaluate(()=>window.activityStableReplay=document.getElementById('activityDiscoveryReplayAction'));
 await page.waitForTimeout(4800);
 assert.equal(await page.evaluate(()=>activityStableReplay===document.getElementById('activityDiscoveryReplayAction')&&document.activeElement===activityStableReplay),true,'Unchanged activity actions retain DOM identity and focus across refresh');
 for(const selector of ['#activityDiscoveryReplayAction','#activityDiscoveryPrimaryAction']){
  const bounds=await page.locator(selector).boundingBox();assert.ok(bounds&&bounds.height>=44&&bounds.width>=44,selector+' must have a 44px touch target');
 }
 report.cases.push('phone actions stay focused and attached across refresh and meet 44px touch size');
 await page.screenshot({path:`${dir}/activity-phone-saved.png`});
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>swimCtx.closeActivityBrowser());await stageStart();
 await page.evaluate(r=>{activityRuntime.startActivity({...r,id:'acceptance-other-route'});activityRuntime.stopActivity();swimCtx.openActivityBrowser({activityId:r.id})},route);await page.locator('#activityDiscoveryReplayAction').click();
 assert.equal(await page.evaluate(()=>activityRuntime.getRuntimeSnapshot().activityId),route.id);await page.evaluate(()=>activityRuntime.stopActivity());assert.equal(await page.evaluate(id=>activityRuntime.getCompletionState(id).count,route.id),1);report.cases.push('selected replay owns the selected activity; abort adds no completion');
 await page.evaluate(()=>{swimCtx.closeActivityBrowser();window.activityReject=true;swimCtx.startGameplayPlugin('trial');swimCtx.gameTimer=swimCtx.CFG.trialTime+1;swimCtx.updateMode(.01)});
 await page.waitForSelector('#resultScreen.show');await page.waitForSelector('#resultJournalRetry:not([hidden])');assert.equal(await page.locator('#againBtn').isDisabled(),true);
 await page.evaluate(()=>window.activityReject=false);await page.locator('#resultJournalRetry').click();await page.waitForFunction(()=>swimCtx.getGameResultSnapshot()?.status==='saved');await page.screenshot({path:`${dir}/trial-result.png`});
 await page.locator('#againBtn').click();assert.equal(await page.evaluate(()=>swimCtx.getGameplayRegistrySnapshot().activeId),'trial');assert.equal(await page.evaluate(()=>swimCtx.hasPauseReason('game_result')),false);report.cases.push('shared result Journal retry and actual Play Again release result pause');
 await page.evaluate(()=>{const c=swimCtx;c.car.x=c.destination.x;c.car.y=c.destination.y+1.2;c.car.z=c.destination.z;c.updateMode(.01)});await page.waitForSelector('#resultScreen.show');await page.waitForFunction(()=>swimCtx.getGameResultSnapshot()?.status==='saved');await page.locator('#freeBtn').click();assert.equal(await page.evaluate(()=>swimCtx.getGameplayRegistrySnapshot().activeId),'free');report.cases.push('trial success records separately from failure and Free Roam clears result');
 await page.evaluate(()=>{swimCtx.recordExplorerEvent=activityOriginalRecord});
 return report;
}

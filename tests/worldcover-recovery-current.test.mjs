import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleWorldCoverRecovery,cancelWorldCoverRecovery} from '../app/js/terrain/worldcover-recovery.js';
test('failure recovery is bounded, single-flight and cancelled on disposal',()=>{
 let callback, attempts=0, cancelled=0;
 const timers={setTimeout(fn,ms){callback=fn;assert.ok(ms>=65000);return 1;},clearTimeout(){cancelled++;}};
 const mesh={userData:{}};
 assert.equal(scheduleWorldCoverRecovery(mesh,()=>attempts++,timers),true);
 assert.equal(scheduleWorldCoverRecovery(mesh,()=>attempts++,timers),false);
 callback();assert.equal(attempts,1);
 assert.equal(scheduleWorldCoverRecovery(mesh,()=>attempts++,timers),true);
 callback();assert.equal(attempts,2);
 assert.equal(scheduleWorldCoverRecovery(mesh,()=>attempts++,timers),false);
 const disposed={userData:{}};
 scheduleWorldCoverRecovery(disposed,()=>attempts++,timers);
 disposed.userData.terrainDisposed=true;
 cancelWorldCoverRecovery(disposed,timers);
 callback();assert.equal(attempts,2);assert.equal(cancelled,1);
});

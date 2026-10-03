const test=require('node:test'),assert=require('node:assert/strict');
const {mutateMarineExpedition,LEASE_MS}=require('../functions/marine-expedition-authority.js');
function journey(){let state=null,nowMs=10000,n=0;const activeUids=['captain','pilot'];return {get state(){return state},set state(s){state=s},advance:ms=>{nowMs+=ms},run(type,uid='captain',extra={}){state=mutateMarineExpedition(state,{roomCode:'CORAL1',uid,activeUids,nowMs,newId:'server-voyage',command:{type,requestId:`request-${++n}`,revision:state?.controlRevision||0,deployment:state?.deployment||0,...extra}});return state;},activeUids};}
test('marine seats are exclusive, revisions checked and room lease removal rejects control',()=>{
 const j=journey();j.run('create');j.run('join','pilot');j.run('claim','pilot',{seat:'pilot'});
 assert.throws(()=>j.run('claim','captain',{seat:'pilot'}),/Another active/);
 assert.throws(()=>j.run('deploy','captain',{revision:0}),/voyage changed/);
 j.run('deploy');assert.equal(j.state.stage,'underwater');
 assert.throws(()=>j.run('pose','captain',{pose:{x:0,y:-12,z:-65,yaw:0}}),/Only the active/);
 j.activeUids.pop();assert.throws(()=>j.run('pose','pilot',{pose:{x:0,y:-12,z:-65,yaw:0}}),/active room seat/);
});
test('pilot loss allows takeover and rescue without creating duplicate vessel or manifest',()=>{
 const j=journey();j.run('create');j.run('join','pilot');j.run('claim','pilot',{seat:'pilot'});j.run('deploy');const id=j.state.id;
 j.advance(LEASE_MS+1);assert.throws(()=>j.run('heartbeat','pilot'),/expired/);
 j.run('recover','pilot');assert.equal(j.state.stage,'aboard');assert.equal(j.state.rescues.length,1);assert.equal(j.state.id,id);
 j.run('claim','pilot',{seat:'helm'});assert.equal(j.state.seats.helm.uid,'pilot');assert.equal(j.state.manifest.length,0);
});
test('marine observation cargo and report are retry-safe and never contain personal rewards',()=>{
 const j=journey();j.run('create');j.run('join','pilot');j.run('claim','pilot',{seat:'pilot'});j.run('deploy');
 for(const [id,x,z] of [['table-garden',-38,66],['branch-ridge',36,112],['seagrass-edge',-46,157]]){
   // Advance legal server-sized segments; refresh the helm during pilot travel.
   while(Math.hypot(j.state.submarine.pose.x-x,j.state.submarine.pose.z-z)>.01){const p=j.state.submarine.pose,d=Math.hypot(x-p.x,z-p.z),f=Math.min(1,30/d);j.advance(3000);j.run('heartbeat');j.run('pose','pilot',{pose:{x:p.x+(x-p.x)*f,y:-12,z:p.z+(z-p.z)*f,yaw:0}});}
   assert.throws(()=>j.run('scan','captain',{target:id}),/Stop/);
   j.advance(3000);j.run('pose','pilot',{pose:j.state.submarine.pose});j.run('scan','captain',{target:id});j.run('scan','captain',{target:id});
 }
 assert.equal(j.state.manifest.length,3);j.run('recover');j.run('report');assert.equal(j.state.stage,'complete');assert.equal(j.state.report.observations,3);assert.equal('inventory' in j.state,false);assert.equal('rewards' in j.state,false);
});
test('marine commands reject teleport, invalid pose and reused identity with different contents',()=>{
 const j=journey();j.run('create');j.run('join','pilot');j.run('claim','pilot',{seat:'pilot'});j.run('deploy');j.advance(2500);
 assert.throws(()=>j.run('pose','pilot',{pose:{x:900,y:-12,z:0,yaw:0}}),/travel envelope/);
 assert.throws(()=>j.run('pose','pilot',{pose:{x:0,y:NaN,z:0,yaw:0}}),/outside/);
 const command={type:'heartbeat',requestId:'retry-request',revision:j.state.revision};const options={roomCode:'CORAL1',uid:'captain',activeUids:j.activeUids,nowMs:12500,command};
 const next=mutateMarineExpedition(j.state,options);assert.equal(mutateMarineExpedition(next,options),next);assert.throws(()=>mutateMarineExpedition(next,{...options,command:{...command,type:'recover'}}),/already used/);
});

test('concurrent helm heartbeat cannot freeze pilot movement, but an old deployment cannot steer a new launch',()=>{
 const j=journey();j.run('create');j.run('join','pilot');j.run('claim','pilot',{seat:'pilot'});j.run('deploy');const revision=j.state.revision,deployment=j.state.deployment;j.advance(2500);j.run('heartbeat');j.run('pose','pilot',{revision,pose:{x:0,y:-12,z:-60,yaw:0}});assert.equal(j.state.submarine.pose.z,-60);
 j.run('recover');j.run('deploy');assert.throws(()=>j.run('pose','pilot',{deployment,pose:{x:0,y:-12,z:-60,yaw:0}}),/deployment has ended/);
});

const test=require('node:test');const assert=require('node:assert/strict');
const {saveContributionOnce}=require('../functions/contribution-idempotency');
function database(){
 const rows=new Map();let next=0,queue=Promise.resolve();
 return {rows,collection:()=>({doc:(id)=>({id:id||String(++next)})}),runTransaction:fn=>{
  const work=queue.then(()=>fn({get:async ref=>({exists:rows.has(ref.id),data:()=>rows.get(ref.id)}),create:(ref,data)=>{assert.ok(!rows.has(ref.id));rows.set(ref.id,data);}}));
  queue=work.catch(()=>{});return work;
 }};
}
const input=db=>({db,uid:'alice',requestId:'operation_123456789',record:{userId:'alice',payload:{title:'Home'}},timestamp:'now'});
test('replaying after a lost response preserves one record and skips repeated side effects',async()=>{
 const db=database(),args=input(db);const first=await saveContributionOnce(args),retry=await saveContributionOnce(args);
 assert.equal(db.rows.size,1);assert.equal(first.ref.id,retry.ref.id);assert.equal(first.replayed,false);assert.equal(retry.replayed,true);
});
test('concurrent requests share one transaction identity',async()=>{
 const db=database();const results=await Promise.all([saveContributionOnce(input(db)),saveContributionOnce(input(db))]);
 assert.equal(db.rows.size,1);assert.equal(results.filter(x=>!x.replayed).length,1);
});
test('a reused operation ID cannot replace different content',async()=>{
 const db=database();await saveContributionOnce(input(db));
 await assert.rejects(saveContributionOnce({...input(db),record:{payload:{title:'Other'}}}),e=>e.status===409);assert.equal(db.rows.size,1);
});
test('operation IDs are scoped by owner and new IDs permit intentional new submissions',async()=>{
 const db=database();await saveContributionOnce(input(db));
 await saveContributionOnce({...input(db),uid:'bob',record:{userId:'bob'}});
 await saveContributionOnce({...input(db),requestId:'operation_987654321'});assert.equal(db.rows.size,3);
});
test('replay returns current reviewed status and rejects malformed keys',async()=>{
 const db=database();const first=await saveContributionOnce(input(db));db.rows.get(first.ref.id).status='approved';
 assert.equal((await saveContributionOnce(input(db))).status,'approved');
 await assert.rejects(saveContributionOnce({...input(db),requestId:'../bad'}),e=>e.status===400);
});

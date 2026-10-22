const assert=require('node:assert/strict');
function memoryDatabase(){
 const records=new Map();
 const copy=value=>value===undefined?undefined:structuredClone(value);
 const snapshot=ref=>({id:ref.id,ref,exists:records.has(ref.path),data:()=>copy(records.get(ref.path))});
 const apply=(ref,data,merge=false)=>records.set(ref.path,merge?{...records.get(ref.path),...copy(data)}:copy(data));
 const document=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(document(path)),set:async(data,options)=>apply(document(path),data,options?.merge),update:async data=>{assert.ok(records.has(path));apply(document(path),data,true);}});
 const query=(name,filters=[],order=null,cursor=null,count=Infinity)=>({
  doc:id=>document(`${name}/${id}`),where:(key,op,value)=>{assert.equal(op,'==');return query(name,[...filters,[key,value]],order,cursor,count);},orderBy:(key,direction)=>query(name,filters,{key,direction},cursor,count),startAfter:snap=>query(name,filters,order,snap.id,count),limit:n=>query(name,filters,order,cursor,n),get:async()=>{
   let rows=[...records].filter(([p,d])=>p.startsWith(name+'/')&&p.split('/').length===2&&filters.every(([key,value])=>d[key]===value));
   if(order)rows.sort((a,b)=>(order.direction==='desc'?-1:1)*((a[1][order.key]-b[1][order.key])||a[0].localeCompare(b[0])));
   if(cursor){const index=rows.findIndex(([p])=>p.split('/').at(-1)===cursor);if(index>=0)rows=rows.slice(index+1);}
   const docs=rows.slice(0,count).map(([p])=>snapshot(document(p)));return {docs,size:docs.length,empty:!docs.length};
  }
 });
 let tail=Promise.resolve();
 const db={records,collection:name=>query(name),runTransaction:fn=>{
  const operation=tail.then(async()=>{const writes=[];const result=await fn({get:async ref=>{assert.equal(writes.length,0,'All Firestore reads must precede writes');return snapshot(ref);},set:(ref,data,options)=>writes.push(()=>apply(ref,data,options?.merge)),create:(ref,data)=>writes.push(()=>{assert.ok(!records.has(ref.path),`Duplicate create: ${ref.path}`);apply(ref,data);}),update:(ref,data)=>writes.push(()=>{assert.ok(records.has(ref.path),`Missing update: ${ref.path}`);apply(ref,data,true);})});
   const before=new Map(records);try{writes.forEach(write=>write());}catch(e){records.clear();for(const [p,d]of before)records.set(p,d);throw e;}return result;});tail=operation.catch(()=>{});return operation;
 }};return db;
}
const functions={region:()=>({runWith:()=>({https:{onRequest:fn=>fn},firestore:{document:()=>({onWrite:fn=>fn})}})})};
function fixture(){
 const db=memoryDatabase(),requests=[],delivered=new Map();let time=Date.now(),serial=0,failStatus=0,ambiguous=false,incoming={};
 const cfg={inboundEnabled:true,resendApiKey:'test-key',emailFrom:'World Explorer <testers@mail.worldexplorer3d.io>',adminNotificationEmail:'owner@example.com',webhookSecret:'whsec_'+Buffer.alloc(32,4).toString('base64')};
 const fetchImpl=async(url,options)=>{
  if(options.method!=='POST')return {ok:true,json:async()=>incoming};
  const key=options.headers['Idempotency-Key'],body=JSON.parse(options.body);requests.push({key,body});
  if(failStatus)return {ok:false,status:failStatus};
  if(delivered.has(key))assert.deepEqual(delivered.get(key).body,body,'An idempotency key must keep its exact payload');
  else delivered.set(key,{id:`provider-${delivered.size+1}`,body});
  if(ambiguous){ambiguous=false;throw Error('response lost after provider acceptance');}
  return {ok:true,status:200,json:async()=>({id:delivered.get(key).id})};
 };
 const options={db,config:()=>cfg,now:()=>time,randomToken:()=> (++serial).toString(16).padStart(64,'0'),fetchImpl};
 const program=require('../../functions/tester-program').createTesterProgram(options);
 const publicHandler=require('../../functions/tester-interest').buildTesterInterestExport({...options,functions,setCors:()=>false,verifyAppCheck:async()=>true,program});
 const call=async(handler,body,extra={})=>{const res={code:200,set(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}};await handler({method:'POST',body,ip:'127.0.0.2',get:key=>extra.headers?.[key]||'',...extra},res);return res;};
 const request=async(email='tester@example.com')=>{const response=await call(publicHandler,{action:'request',email,consent:true,consentVersion:'app-testing-v1'});assert.equal(response.code,200);return requests.at(-1).body.text.match(/#([a-f0-9]{64})/)[1];};
 const confirmed=async(email='tester@example.com')=>{const token=await request(email);await program.confirm(token);return require('../../functions/tester-mail').hash(email);};
 const jobs=()=>[...db.records].filter(([p])=>p.startsWith('appTesterMail/')).map(([p,data])=>({id:p.split('/')[1],...data}));
 const deliver=async id=>require('../../functions/tester-mail').deliverTesterMail({...options,jobId:id});
 return {...options,program,publicHandler,call,request,confirmed,jobs,deliver,requests,delivered,cfg,functions,moderator:{auth:{uid:'owner'},displayName:'Owner'},advance:ms=>time+=ms,setFail:status=>failStatus=status,setAmbiguous:()=>ambiguous=true,setIncoming:value=>incoming=value};
}
module.exports={memoryDatabase,fixture,functions};

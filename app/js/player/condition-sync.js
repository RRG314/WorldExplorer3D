// One account owns one serialized condition outbox. An uncertain write is
// retried with the same identity before a newer value can be dispatched.
export function createConditionSync({uid,send,onState=()=>{},onError=()=>{},isCurrent=()=>true,
  storage=globalThis.localStorage,setTimer=setTimeout,clearTimer=clearTimeout,identity=()=>crypto.randomUUID()}={}) {
  const key=`world-explorer:condition-outbox:v1:${uid}`;
  let disposed=false,ready=false,running=false,timer=null,revision=0,pending=null,operation=null,attempts=0,error='',durable=true;
  try {
    const saved=JSON.parse(storage?.getItem?.(key)||'null');
    if(saved?.uid===uid){
      const valid=p=>p&&Number.isFinite(p.condition)&&p.condition>=0&&p.condition<=1;
      if(valid(saved.pending))pending=saved.pending;
      if(valid(saved.operation)&&typeof saved.operation.mutationId==='string'&&Number.isInteger(saved.operation.expectedRevision))operation=saved.operation;
    }
  } catch { durable=false; }
  function persist(){
    try {
      if(!storage?.setItem){durable=false;return;}
      storage.setItem(key,JSON.stringify({uid,pending,operation}));durable=true;
    } catch {durable=false;}
  }
  const snapshot=()=>Object.freeze({ready,pending:!!(pending||operation),saving:running,
    status:disposed?'disposed':!ready?'loading':error?'retrying':running||operation?'saving':pending?'queued':'saved',
    revision,error,durable,latestCondition:pending?.condition??operation?.condition??null});
  const publish=()=>{if(!disposed)onState(snapshot());};
  function schedule(delay=180){
    if(disposed||!ready||running||!isCurrent())return;
    if(timer!==null)clearTimer(timer);
    timer=setTimer(()=>{timer=null;void flush();},delay);
  }
  async function flush(){
    if(disposed||!ready||running||!isCurrent()||(!pending&&!operation))return;
    if(!operation){operation={...pending,expectedRevision:revision,mutationId:identity()};pending=null;persist();}
    const sent=operation;running=true;publish();
    try {
      const result=await send(sent);
      if(disposed||!isCurrent())return;
      revision=Math.max(revision,Number(result?.revision)||sent.expectedRevision+1);
      operation=null;attempts=0;error='';persist();
    } catch(e) {
      if(disposed||!isCurrent())return;
      if(e.status===409&&Number.isInteger(e.payload?.state?.revision)){
        revision=e.payload.state.revision;
        // A definite revision rejection has no write to reconcile. Keep the
        // newest local intent and issue a fresh command at the current version.
        pending ||= {condition:sent.condition,reason:sent.reason};operation=null;
      }
      attempts++;error=e.message||'Health is saved on this device and waiting to sync.';persist();onError(e);
    } finally {
      running=false;
      if(!disposed&&isCurrent()){
        publish();
        if(pending||operation)schedule(error?Math.min(30000,500*2**Math.min(attempts,6)):0);
      }
    }
  }
  return Object.freeze({snapshot,flush,
    queue(change){
      if(disposed||!isCurrent()||!Number.isFinite(change.after)||change.after<0||change.after>1)return false;
      pending={condition:change.after,reason:String(change.reason||'gameplay').slice(0,80)};persist();publish();schedule();return true;
    },
    accept(state){
      if(disposed||!isCurrent())return false;
      if(ready&&(Number(state?.revision)||0)<revision)return false;
      revision=Math.max(revision,Number(state?.revision)||0);ready=true;
      const mayHydrate=!pending&&!operation&&!running;publish();schedule();return mayHydrate;
    },
    retry(){attempts=0;error='';schedule(0);},
    dispose(){if(disposed)return;disposed=true;if(timer!==null)clearTimer(timer);timer=null;persist();}
  });
}

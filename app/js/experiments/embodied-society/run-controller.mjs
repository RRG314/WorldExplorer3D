const clone = value => structuredClone(value);
const verbs = new Set(['gather','craft','finish','cancel','consume','rest','build','store','retrieve']);
const fields = new Set(['kind','targetId','quantity','recipeId','materialId','seconds','placement']);

// Single-resident supervisor. The host supplies authenticated model dispatch,
// filtered perception and durable checkpoint storage. This is never an agent tool.
export function createRunController({actorId,body,workshop,perceive,persistCheckpoint,decide,maxDecisions=0,maxSeconds=900,decisionTimeoutMs=30000}) {
  if(!actorId || !body || !workshop || typeof perceive!=='function' || typeof persistCheckpoint!=='function' ||
      !Number.isSafeInteger(maxDecisions) || maxDecisions<0 || maxDecisions>1000 ||
      !Number.isSafeInteger(maxSeconds) || maxSeconds<1 || maxSeconds>900 ||
      !Number.isSafeInteger(decisionTimeoutMs) || decisionTimeoutMs<1 || decisionTimeoutMs>60000) throw Error('Invalid bounded run configuration.');
  let status='paused',frames=(workshop.snapshot().tick??0)*60,epoch=0,calls=0,serial=0,pending=null,error=null,lastOutcome=null;
  const memory=[];
  let queue=Promise.resolve();
  const initialTick=frames/60;
  function observation() {
    const state=workshop.snapshot(),actor=state.actors[actorId];
    if(!actor)throw Error('Resident missing from workshop.');
    return clone({actorId,tick:Math.floor(frames/60),body:body.observation(),needs:actor.needs,condition:actor.condition,
      inventory:workshop.inspectInventory(actorId).items,job:actor.job,lastOutcome,recentMemory:memory,visible:perceive(actorId)});
  }
  function checkpoint(reason) {
    return persistCheckpoint(clone({schemaVersion:1,runId:workshop.snapshot().runId,actorId,status,frames,calls,serial,reason,
      workshop:workshop.snapshot(),body:body.checkpoint(),error,lastOutcome,memory}));
  }
  function fail(cause) {status='failed';error=String(cause?.message||cause);epoch++;pending?.abort();body.pause();}
  function serialized(fn) {
    const result=queue.then(fn);queue=result.catch(()=>{});return result;
  }
  body.pause();
  async function applyAction(action,token) {
    if(status!=='running'||token!==epoch)return {cancelled:true};
    if(!action||typeof action!=='object'||Array.isArray(action))throw Error('Invalid resident action.');
    if(action.kind==='move') {
      if(Object.keys(action).some(k=>!['kind','move','strafe','turn','lookYaw','lookPitch','frames'].includes(k)))throw Error('Unsupported movement field.');
      const {kind,...axes}=action;body.command(axes);
    } else if(action.kind==='wait') {
      if(Object.keys(action).some(k=>k!=='kind') )throw Error('Unsupported wait field.');
      body.command({frames:1});
    } else {
      if(!verbs.has(action.kind)||Object.keys(action).some(k=>!fields.has(k)))throw Error('Unsupported resident action.');
      try {
        await workshop.execute(actorId,{...action,operationId:`supervisor-${++serial}`,expectedRevision:workshop.snapshot().revision},Math.floor(frames/60));
      } catch(cause) {
        const ordinary=new Set(['insufficient-material','resource-unavailable','tool-required','station-required','work-not-complete','world-permission-denied','resource-not-in-reach','carrying-capacity','occupied-cell','actor-busy','verified-shelter-required','rest-interrupted','no-active-work']);
        if(!ordinary.has(cause.code))throw cause;
        lastOutcome={action:clone(action),status:'rejected',reason:cause.code,tick:Math.floor(frames/60)};
        memory.push({...clone(lastOutcome),position:body.observation().position});if(memory.length>20)memory.shift();
        await checkpoint('action-rejected');return clone(lastOutcome);
      }
    }
    lastOutcome={action:clone(action),status:'accepted',tick:Math.floor(frames/60)};
    memory.push({...clone(lastOutcome),position:body.observation().position});if(memory.length>20)memory.shift();
    await checkpoint('action');return {accepted:true};
  }
  return Object.freeze({
    observation,
    state:()=>({status,frames,calls,maxDecisions,pending:!!pending,error}),
    resume(){return serialized(async()=>{
      if(status!=='paused')throw Error('Only a paused run can resume.');
      status='running';body.resume();try{await checkpoint('resume');}catch(e){fail(e);throw e;}
    });},
    pause(){
      if(status==='ended'||status==='failed')return Promise.resolve();
      status='paused';epoch++;pending?.abort();body.pause();
      return serialized(async()=>{try{await checkpoint('pause');}catch(e){fail(e);throw e;}});
    },
    step(count=1){return serialized(async()=>{
      if(status!=='running')return;
      if(!Number.isInteger(count)||count<1||count>60)throw Error('Step must be 1–60 physics frames.');
      try {
        for(let n=0;n<count&&status==='running';n++) {
          if(frames/60-initialTick>=maxSeconds){status='ended';body.pause();break;}
          if(workshop.snapshot().actors[actorId].condition<=0){status='ended';body.pause();break;}
          body.step();frames++;
          if(frames%60===0)await workshop.advanceTo(frames/60);
        }
        if(frames%60===0||status!=='running')await checkpoint('step');
      }catch(e){fail(e);throw e;}
    });},
    decide(){
      if(status!=='running'||pending)return Promise.reject(Error('Run is paused or a decision is already pending.'));
      if(typeof decide!=='function'||calls>=maxDecisions)return Promise.reject(Error('No model decision allowance remains.'));
      const abort=new AbortController(),token=epoch;pending=abort;
      return serialized(async()=>{
        let timer;
        try {
          if(status!=='running'||token!==epoch)return {cancelled:true};
          calls++;await checkpoint('decision-reserved');
          const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Decision timed out.'));},decisionTimeoutMs);});
          const cancelled=new Promise((_,reject)=>abort.signal.addEventListener('abort',()=>reject(Error('Decision cancelled.')),{once:true}));
          if(abort.signal.aborted)return {cancelled:true};
          const action=await Promise.race([decide(observation(),{signal:abort.signal}),timeout,cancelled]);
          return await applyAction(action,token);
        }catch(e){
          if(token!==epoch)return {cancelled:true};
          fail(e);throw e;
        }finally{clearTimeout(timer);if(pending===abort)pending=null;}
      });
    },
    abort(reason){fail(reason);return serialized(()=>checkpoint('host-failed'));},
    end(){status='ended';epoch++;pending?.abort();body.pause();return serialized(()=>checkpoint('end'));}
  });
}
